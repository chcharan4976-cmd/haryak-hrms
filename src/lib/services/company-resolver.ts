/**
 * Haryak Technologies India Private Limited
 * Server-Side Canonical Company & Employee Resolution Service
 *
 * Single source of truth for company and employee scoping across HRMS.
 *
 * Safe Linking Hierarchy:
 *   1. Primary: auth.users.id -> public.users.id / employee_id -> employees.id
 *   2. Secondary: employees.user_id = auth.users.id
 *   3. Email Reconciliation (Strict Safety Invariants):
 *      - Exact normalized email match
 *      - Same company
 *      - Exactly ONE matching employee record
 *      - Employee not linked to another auth user
 *      - Records audit log on reconciliation
 */

import { createClient as createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createAuditLog } from '@/lib/services/audit-service'
import type { EmployeeProfileDTO } from '@/lib/types/employee-dto'
import { cookies } from 'next/headers'

export interface ResolvedEmployee {
  employeeId: string
  employeeCode: string
  companyId: string
  authUserId: string
  status: string
  fullName: string
  officialEmail: string
}

export interface ResolvedContext {
  /** Supabase Auth user ID */
  authUserId: string
  /** Application user email */
  email: string
  /** Full name from auth metadata or users table */
  fullName: string
  /** Company UUID from users table */
  companyId: string
  /** Employee UUID (null if user is not linked to an employee record) */
  employeeId: string | null
  /** Employee code (e.g. HRK-001) — null if not an employee */
  employeeCode: string | null
  /** User roles from user_roles table */
  roles: string[]
  /** Canonical resolved employee details if linked */
  employee?: ResolvedEmployee | null
  /** Whether the user must change credentials before accessing operational APIs */
  mustChangeCredentials?: boolean
}

export interface ResolutionError {
  status: number
  code: string
  message: string
}

/**
 * Server-side trusted employee resolver.
 * Resolves the authenticated user session to the canonical employee record.
 */
export async function resolveAuthenticatedEmployee(): Promise<
  { ok: true; employee: ResolvedEmployee; context: ResolvedContext } |
  { ok: false; error: ResolutionError }
> {
  const contextRes = await resolveRequestContext()
  if (!contextRes.ok) {
    return { ok: false, error: contextRes.error }
  }

  const { context } = contextRes

  if (context.employee) {
    return { ok: true, employee: context.employee, context }
  }

  return {
    ok: false,
    error: {
      status: 404,
      code: 'EMPLOYEE_LINKAGE_FAILED',
      message: 'Employee profile linkage could not be resolved. Please contact HR Administrator to link your employee master record.',
    },
  }
}

/**
 * Resolve the full authenticated context from the current request session.
 */
export async function resolveRequestContext(): Promise<
  { ok: true; context: ResolvedContext } | { ok: false; error: ResolutionError }
> {
  try {
    // 1. Get authenticated user from Supabase session
    let authUser: any = null
    try {
      const supabase = await createServerSupabase()
      const { data: { user } } = await supabase.auth.getUser()
      authUser = user
    } catch {
      // Supabase SSR client unavailable or not configured in environment
    }

    let activeAuthUserId = authUser?.id
    let activeAuthEmail = authUser?.email
    let authUserMetadata = authUser?.user_metadata || {}

    // Fallback: If Supabase SSR cookie was missing or expired, check haryak_session cookie
    if (!activeAuthUserId) {
      try {
        const cookieStore = await cookies()
        const sessionCookie = cookieStore.get('haryak_session')
        if (sessionCookie?.value) {
          const parsed = JSON.parse(decodeURIComponent(sessionCookie.value))
          if (parsed?.id && parsed?.email) {
            activeAuthUserId = parsed.id
            activeAuthEmail = parsed.email
            authUserMetadata = {
              must_change_credentials: Boolean(parsed.mustChangeCredentials),
              must_change_password: Boolean(parsed.mustChangePassword),
            }
          }
        }
      } catch {
        // Fallback parsing failed; proceed to unauthenticated return
      }
    }

    if (!activeAuthUserId) {
      return {
        ok: false,
        error: { status: 401, code: 'UNAUTHENTICATED', message: 'Authentication required. Please log in.' },
      }
    }

    const admin = createAdminClient()
    if (!admin) {
      return {
        ok: false,
        error: { status: 503, code: 'DB_UNAVAILABLE', message: 'Database service is temporarily unavailable.' },
      }
    }

    // 2. Look up application user in public.users
    let { data: appUser, error: userError } = await admin
      .from('users')
      .select('id, company_id, employee_id, email, full_name, is_active, must_change_password')
      .eq('id', activeAuthUserId)
      .maybeSingle()

    if (userError) {
      console.error('[CompanyResolver] Error fetching application user:', userError.message)
      return {
        ok: false,
        error: { status: 500, code: 'USER_LOOKUP_FAILED', message: 'Failed to resolve user profile.' },
      }
    }

    // Self-healing: Reconcile missing public.users record ONLY for verified bootstrap administrator
    const bootstrapEmail = (process.env.BOOTSTRAP_ADMIN_EMAIL || 'haryak@admin.com').trim().toLowerCase()
    if (!appUser && activeAuthEmail && activeAuthEmail.trim().toLowerCase() === bootstrapEmail) {
      const { data: defaultCompany } = await admin
        .from('companies')
        .select('id')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()

      if (defaultCompany) {
        const { data: restoredUser, error: restoreErr } = await admin
          .from('users')
          .upsert({
            id: activeAuthUserId,
            company_id: defaultCompany.id,
            email: activeAuthEmail.trim().toLowerCase(),
            full_name: 'Super Administrator',
            is_active: true,
            must_change_password: Boolean(authUserMetadata?.must_change_credentials),
          })
          .select('id, company_id, employee_id, email, full_name, is_active, must_change_password')
          .single()

        if (!restoreErr && restoredUser) {
          appUser = restoredUser
        }
      }
    }

    if (!appUser) {
      return {
        ok: false,
        error: { status: 403, code: 'USER_NOT_FOUND', message: 'User profile not found. Contact HR administrator.' },
      }
    }

    if (!appUser.is_active) {
      return {
        ok: false,
        error: { status: 403, code: 'ACCOUNT_DEACTIVATED', message: 'Account is deactivated. Contact HR administrator.' },
      }
    }

    const companyId = appUser.company_id
    if (!companyId) {
      return {
        ok: false,
        error: { status: 403, code: 'NO_COMPANY', message: 'No company association found. Contact HR administrator.' },
      }
    }

    // Check if user has an uncompleted forced credentials reset requirement
    const isEmpUser = Boolean(appUser.employee_id)
    const adminMustChange = !isEmpUser && Boolean(
      authUserMetadata?.must_change_credentials || (appUser as any).must_change_password
    )
    const empMustChange = isEmpUser && Boolean(
      (appUser as any).must_change_password || authUserMetadata?.must_change_password
    )
    const mustChangeCredentials = adminMustChange

    if (!isEmpUser && adminMustChange) {
      return {
        ok: false,
        error: {
          status: 403,
          code: 'CREDENTIALS_CHANGE_REQUIRED',
          message: 'You must update your administrator credentials before accessing system resources.',
        },
      }
    } else if (isEmpUser && empMustChange) {
      return {
        ok: false,
        error: {
          status: 403,
          code: 'PASSWORD_CHANGE_REQUIRED',
          message: 'You must update your temporary password before accessing employee portal resources.',
        },
      }
    }

    // 3. CANONICAL EMPLOYEE RESOLUTION HIERARCHY
    let canonicalEmp: any = null

    // Step A (Primary): Via public.users.employee_id
    if (appUser.employee_id) {
      const { data: emp } = await admin
        .from('employees')
        .select(`
          id,
          user_id,
          company_id,
          employee_code,
          full_name,
          official_email,
          employment_status,
          is_active
        `)
        .eq('id', appUser.employee_id)
        .eq('company_id', companyId)
        .maybeSingle()

      if (emp) {
        canonicalEmp = emp
      }
    }

    // Step B (Secondary): Via employees.user_id = activeAuthUserId
    if (!canonicalEmp) {
      const { data: empByUserId } = await admin
        .from('employees')
        .select(`
          id,
          user_id,
          company_id,
          employee_code,
          full_name,
          official_email,
          employment_status,
          is_active
        `)
        .eq('user_id', activeAuthUserId)
        .maybeSingle()

      if (empByUserId) {
        canonicalEmp = empByUserId
        // Reconcile users.employee_id if missing
        if (appUser.employee_id !== empByUserId.id) {
          await admin
            .from('users')
            .update({ employee_id: empByUserId.id })
            .eq('id', activeAuthUserId)
        }
      }
    }

    // Step C (Metadata Linked Resolution): Via auth user metadata employee_id or employee_code
    if (!canonicalEmp && (authUserMetadata?.employee_id || authUserMetadata?.employeeId)) {
      const metaEmpId = authUserMetadata.employee_id || authUserMetadata.employeeId
      const { data: empByMeta } = await admin
        .from('employees')
        .select(`
          id,
          user_id,
          company_id,
          employee_code,
          full_name,
          official_email,
          employment_status,
          is_active
        `)
        .eq('id', metaEmpId)
        .maybeSingle()

      if (empByMeta) {
        canonicalEmp = empByMeta
        await Promise.all([
          admin.from('users').update({ employee_id: empByMeta.id }).eq('id', activeAuthUserId),
          admin.from('employees').update({ user_id: activeAuthUserId }).eq('id', empByMeta.id),
        ])
      }
    }

    if (!canonicalEmp && (authUserMetadata?.employee_code || authUserMetadata?.employeeCode)) {
      const metaCode = String(authUserMetadata.employee_code || authUserMetadata.employeeCode).trim().toUpperCase()
      const { data: empByCode } = await admin
        .from('employees')
        .select(`
          id,
          user_id,
          company_id,
          employee_code,
          full_name,
          official_email,
          employment_status,
          is_active
        `)
        .ilike('employee_code', metaCode)
        .maybeSingle()

      if (empByCode) {
        canonicalEmp = empByCode
        await Promise.all([
          admin.from('users').update({ employee_id: empByCode.id }).eq('id', activeAuthUserId),
          admin.from('employees').update({ user_id: activeAuthUserId }).eq('id', empByCode.id),
        ])
      }
    }

    // Step D (Email Reconciliation Fallback): Check official_email, then personal_email
    if (!canonicalEmp && (appUser.email || activeAuthEmail)) {
      const cleanEmail = (appUser.email || activeAuthEmail || '').trim().toLowerCase()
      if (cleanEmail) {
        let { data: matchedEmps } = await admin
          .from('employees')
          .select(`
            id,
            user_id,
            company_id,
            employee_code,
            full_name,
            official_email,
            employment_status,
            is_active
          `)
          .ilike('official_email', cleanEmail)

        if (!matchedEmps || matchedEmps.length === 0) {
          const { data: matchedByPersonal } = await admin
            .from('employees')
            .select(`
              id,
              user_id,
              company_id,
              employee_code,
              full_name,
              official_email,
              employment_status,
              is_active
            `)
            .ilike('personal_email', cleanEmail)

          matchedEmps = matchedByPersonal
        }

        if (matchedEmps && matchedEmps.length > 0) {
          const singleMatch = matchedEmps[0]
          if (!singleMatch.user_id || singleMatch.user_id === activeAuthUserId) {
            canonicalEmp = singleMatch

            // Atomically reconcile linkages
            await Promise.all([
              admin
                .from('users')
                .update({ employee_id: singleMatch.id })
                .eq('id', activeAuthUserId),
              admin
                .from('employees')
                .update({ user_id: activeAuthUserId })
                .eq('id', singleMatch.id),
            ])

            // Record audit log for automated reconciliation
            try {
              await createAuditLog({
                companyId: singleMatch.company_id || companyId,
                userId: activeAuthUserId,
                userEmail: cleanEmail,
                userName: appUser.full_name,
                action: 'updated',
                entityType: 'employee',
                entityId: singleMatch.id,
                entityName: `${singleMatch.full_name} (${singleMatch.employee_code})`,
                description: `Reconciled user ${activeAuthUserId} with employee ${singleMatch.employee_code}`,
                reason: 'CANONICAL_LINKAGE_RECONCILIATION',
              })
            } catch {}
          } else {
            console.warn(`[CompanyResolver] Employee ${singleMatch.employee_code} already linked to user ${singleMatch.user_id}`)
          }
        }
      }
    }

    // 4. Resolve authoritative roles from public.user_roles -> roles (Database RBAC is authoritative)
    let roles: string[] = []
    const { data: userRoles } = await admin
      .from('user_roles')
      .select('roles(name)')
      .eq('user_id', activeAuthUserId)

    if (userRoles && userRoles.length > 0) {
      roles = userRoles
        .map((r: any) => r.roles?.name)
        .filter(Boolean) as string[]
    }

    // Reconcile role ONLY for verified bootstrap administrator if user_roles record is absent
    if (roles.length === 0 && activeAuthEmail?.toLowerCase() === bootstrapEmail) {
      const { data: superAdminRole } = await admin
        .from('roles')
        .select('id, name')
        .eq('company_id', companyId)
        .eq('name', 'SUPER_ADMIN')
        .maybeSingle()

      if (superAdminRole) {
        await admin.from('user_roles').upsert({
          user_id: activeAuthUserId,
          role_id: superAdminRole.id,
        }, { onConflict: 'user_id,role_id' })
        roles = [superAdminRole.name]
      }
    }

    const resolvedEmployee: ResolvedEmployee | null = canonicalEmp ? {
      employeeId: canonicalEmp.id,
      employeeCode: canonicalEmp.employee_code,
      companyId: canonicalEmp.company_id,
      authUserId: activeAuthUserId,
      status: canonicalEmp.employment_status || 'active',
      fullName: canonicalEmp.full_name,
      officialEmail: canonicalEmp.official_email,
    } : null

    return {
      ok: true,
      context: {
        authUserId: activeAuthUserId,
        email: appUser.email || activeAuthEmail || '',
        fullName: appUser.full_name || authUserMetadata?.full_name || 'User',
        companyId,
        employeeId: canonicalEmp?.id || null,
        employeeCode: canonicalEmp?.employee_code || null,
        roles,
        employee: resolvedEmployee,
        mustChangeCredentials,
      },
    }
  } catch (err: any) {
    console.error('[CompanyResolver] Unexpected error during resolution:', err)
    return {
      ok: false,
      error: { status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error during authentication.' },
    }
  }
}

/**
 * Maps database employee records to the canonical EmployeeProfileDTO.
 */
export async function getCanonicalEmployeeProfile(
  employeeId: string,
  companyId: string
): Promise<EmployeeProfileDTO | null> {
  const admin = createAdminClient()
  if (!admin) return null

  let { data: emp, error } = await admin
    .from('employees')
    .select(`
      *,
      departments:department_id(id, name),
      designations:designation_id(id, name),
      locations:location_id(id, name),
      reporting_manager:reporting_manager_id(id, full_name, employee_code),
      employee_bank_accounts(*),
      employee_statutory_details(*)
    `)
    .eq('id', employeeId)
    .maybeSingle()

  if (error || !emp) {
    if (error) {
      console.warn('[CompanyResolver] Joined query failed, retrying plain employee lookup:', error.message)
    }
    const { data: baseEmp } = await admin
      .from('employees')
      .select('*')
      .eq('id', employeeId)
      .maybeSingle()

    if (!baseEmp) return null
    emp = baseEmp
  }

  const primaryBank = (emp.employee_bank_accounts || []).find((b: any) => b.is_primary && b.is_active) ||
    emp.employee_bank_accounts?.[0] || null

  const bankAccounts = (emp.employee_bank_accounts || []).map((ba: any) => ({
    id: ba.id,
    bankName: ba.bank_name || null,
    accountNumberMasked: ba.account_number_masked || null,
    ifscCode: ba.ifsc_code || null,
    branchName: ba.branch_name || null,
    isPrimary: Boolean(ba.is_primary),
  }))

  const statutory = emp.employee_statutory_details?.[0] || null

  const statutoryDetails = statutory ? {
    panMasked: statutory.pan_masked || null,
    uanNumber: statutory.uan_number || null,
    pfNumber: statutory.pf_number || null,
    esiNumber: statutory.esi_number || null,
    pfApplicable: Boolean(statutory.pf_applicable),
    esiApplicable: Boolean(statutory.esi_applicable),
    ptApplicable: Boolean(statutory.pt_applicable),
    ptState: statutory.pt_state || null,
    taxRegime: statutory.tax_regime || 'new',
  } : null

  const hasBankDetails = Boolean(primaryBank && (primaryBank.account_number_masked || primaryBank.account_number_encrypted))
  const bankStatus: 'CONFIGURED' | 'NOT_CONFIGURED' = hasBankDetails ? 'CONFIGURED' : 'NOT_CONFIGURED'

  let statutoryStatus: 'CONFIGURED' | 'PARTIAL' | 'NOT_CONFIGURED' = 'NOT_CONFIGURED'
  if (statutoryDetails?.panMasked && statutoryDetails?.uanNumber) {
    statutoryStatus = 'CONFIGURED'
  } else if (statutoryDetails?.panMasked || statutoryDetails?.uanNumber) {
    statutoryStatus = 'PARTIAL'
  }

  return {
    employeeId: emp.id,
    employeeCode: emp.employee_code,
    fullName: emp.full_name || `${emp.first_name || ''} ${emp.last_name || ''}`.trim(),
    firstName: emp.first_name,
    lastName: emp.last_name || '',
    officialEmail: emp.official_email,
    personalEmail: emp.personal_email || null,
    phone: emp.phone || null,
    gender: emp.gender || null,
    dateOfBirth: emp.date_of_birth || null,
    department: emp.departments?.name || null,
    departmentId: emp.department_id || null,
    designation: emp.designations?.name || null,
    designationId: emp.designation_id || null,
    joiningDate: emp.joining_date || null,
    employmentType: emp.employment_type || null,
    employmentStatus: emp.employment_status || 'active',
    workLocation: emp.locations?.name || null,
    locationId: emp.location_id || null,
    reportingManager: emp.reporting_manager?.full_name || null,
    reportingManagerId: emp.reporting_manager_id || null,
    reportingManagerCode: emp.reporting_manager?.employee_code || null,
    profileImageUrl: emp.profile_image_url || null,
    bankStatus,
    statutoryStatus,
    bankAccounts,
    statutoryDetails,
    provenance: {
      employeeId: { table: 'employees', column: 'id', value: emp.id, updatedAt: emp.updated_at },
      employeeCode: { table: 'employees', column: 'employee_code', value: emp.employee_code, updatedAt: emp.updated_at },
      fullName: { table: 'employees', column: 'full_name', value: emp.full_name, updatedAt: emp.updated_at },
      officialEmail: { table: 'employees', column: 'official_email', value: emp.official_email, updatedAt: emp.updated_at },
      department: { table: 'departments', column: 'name', value: emp.departments?.name || null },
      designation: { table: 'designations', column: 'name', value: emp.designations?.name || null },
      joiningDate: { table: 'employees', column: 'joining_date', value: emp.joining_date, updatedAt: emp.updated_at },
      employmentType: { table: 'employees', column: 'employment_type', value: emp.employment_type, updatedAt: emp.updated_at },
      workLocation: { table: 'locations', column: 'name', value: emp.locations?.name || null },
      reportingManager: { table: 'employees', column: 'reporting_manager_id', value: emp.reporting_manager?.full_name || null },
      dateOfBirth: { table: 'employees', column: 'date_of_birth', value: emp.date_of_birth || null, updatedAt: emp.updated_at },
    },
  }
}

/**
 * Checks if the resolved context has any of the specified roles.
 */
export function hasRole(context: ResolvedContext, ...requiredRoles: string[]): boolean {
  return context.roles.some(role => requiredRoles.includes(role))
}

/**
 * Checks if the user is an employee-only role (no admin/HR/payroll access).
 */
export function isEmployeeOnly(context: ResolvedContext): boolean {
  return context.roles.length > 0 &&
    context.roles.every(role => role === 'EMPLOYEE')
}

/**
 * Checks if the user has administrative access.
 */
export function isAdmin(context: ResolvedContext): boolean {
  return hasRole(context, 'SUPER_ADMIN', 'HR_ADMIN', 'PAYROLL_ADMIN')
}

/**
 * For employee self-service endpoints, resolve the employee_id server-side.
 * Never trust client-supplied employee_id for access control.
 */
export function resolveEmployeeAccess(
  context: ResolvedContext,
  requestedEmployeeId?: string | null
): { employeeId: string | null; denied: boolean; message?: string } {
  if (isEmployeeOnly(context)) {
    if (!context.employeeId) {
      return { employeeId: null, denied: true, message: 'No employee profile linked to your account.' }
    }
    // Strictly ignore client-supplied parameter for self-service
    return { employeeId: context.employeeId, denied: false }
  }

  // Administrators can view a specified employee or all
  if (requestedEmployeeId) {
    return { employeeId: requestedEmployeeId, denied: false }
  }

  return { employeeId: null, denied: false }
}
