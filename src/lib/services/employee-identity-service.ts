/**
 * Haryak Technologies India Private Limited
 * Canonical Employee Identity Integrity & Safe Repair Service
 *
 * Rules:
 * 1. ONE canonical employee identity across auth.users, public.users, and public.employees.
 * 2. No silent destructive repairs.
 * 3. Preserve employee code (HRK-xxx) and employee UUID.
 * 4. Controlled Decision Tree (Case A, B, C, D) for repair.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { generateTemporaryPassword } from '@/lib/auth/auth-service'
import { createAuditLog } from '@/lib/services/audit-service'

export type IdentityIssue =
  | 'AUTH_USER_MISSING'
  | 'PUBLIC_USER_MISSING'
  | 'EMPLOYEE_USER_ID_STALE'
  | 'PUBLIC_USER_EMPLOYEE_LINK_MISSING'
  | 'ROLE_MISSING'
  | 'EMAIL_MISMATCH'
  | 'IDENTITY_CONFLICT'

export type RepairCase = 'CASE_A' | 'CASE_B' | 'CASE_C' | 'CASE_D'

export interface CandidateAuthUser {
  id: string
  email: string
  fullName?: string
  reason: string
  similarityScore?: number
}

export interface EmployeeIdentityIntegrity {
  employeeId: string
  employeeCode: string
  fullName: string
  officialEmail: string
  isHealthy: boolean
  issues: IdentityIssue[]
  details: {
    employeeUserId: string | null
    authUserId: string | null
    authEmail: string | null
    publicUserId: string | null
    publicEmail: string | null
    publicUserEmployeeId: string | null
    assignedRoles: string[]
    candidateAuthUser: CandidateAuthUser | null
  }
  repairRecommendation: {
    caseType: RepairCase
    description: string
    actions: string[]
  }
}

export interface RepairAuthResult {
  success: boolean
  employeeCode: string
  officialEmail: string
  temporaryPassword?: string
  authUserId?: string
  caseApplied: RepairCase
  actionsPerformed: string[]
  error?: string
}

/**
 * Audit and diagnose the health of an employee's identity link across:
 * - public.employees
 * - public.users
 * - auth.users
 * - public.user_roles
 */
export async function getEmployeeIdentityIntegrity(
  employeeIdOrCode: string,
  companyId?: string
): Promise<EmployeeIdentityIntegrity | null> {
  const supabase = createAdminClient()
  if (!supabase) return null

  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(employeeIdOrCode)

  let query = supabase
    .from('employees')
    .select('id, user_id, employee_code, full_name, first_name, last_name, official_email, company_id')

  if (companyId) {
    query = query.eq('company_id', companyId)
  }

  if (isUUID) {
    query = query.or(`id.eq.${employeeIdOrCode},user_id.eq.${employeeIdOrCode}`)
  } else {
    query = query.eq('employee_code', employeeIdOrCode.toUpperCase())
  }

  const { data: emp, error: empErr } = await query.maybeSingle()
  if (empErr || !emp) {
    return null
  }

  const issues: IdentityIssue[] = []
  const effectiveCompanyId = emp.company_id
  const officialEmail = emp.official_email?.toLowerCase().trim() || ''

  // 1. Fetch public.users record
  let publicUser: any = null
  if (emp.user_id) {
    const { data: userById } = await supabase
      .from('users')
      .select('id, email, full_name, employee_id, company_id')
      .eq('id', emp.user_id)
      .maybeSingle()
    publicUser = userById
  }

  if (!publicUser && officialEmail) {
    const { data: userByEmail } = await supabase
      .from('users')
      .select('id, email, full_name, employee_id, company_id')
      .eq('company_id', effectiveCompanyId)
      .eq('email', officialEmail)
      .maybeSingle()
    if (userByEmail) {
      publicUser = userByEmail
    }
  }

  // 2. Fetch auth.users list
  const { data: authUsersData } = await supabase.auth.admin.listUsers()
  const allAuthUsers = authUsersData?.users || []

  // Check direct auth user by emp.user_id
  let authUser = emp.user_id ? allAuthUsers.find(u => u.id === emp.user_id) : null

  // Check auth user by official email
  let authUserByEmail = officialEmail ? allAuthUsers.find(u => u.email?.toLowerCase().trim() === officialEmail) : null

  // Check candidate auth users (CASE B search)
  let candidateAuthUser: CandidateAuthUser | null = null
  if (!authUser && !authUserByEmail) {
    const getTokens = (str: string) =>
      str.toLowerCase().replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter(t => t.length > 1)

    const empFullName = emp.full_name || `${emp.first_name || ''} ${emp.last_name || ''}`
    const empTokens = new Set(getTokens(empFullName))

    for (const u of allAuthUsers) {
      const uEmail = (u.email || '').toLowerCase().trim()
      const uFullName = (u.user_metadata?.full_name as string) || ''
      const uRole = u.user_metadata?.role

      // Skip super admin users
      if (uRole === 'SUPER_ADMIN' || uEmail.includes('admin@')) {
        continue
      }

      // 1. Direct email prefix match (e.g. charan, teja, chaganti)
      const uTokens = getTokens(`${uFullName} ${uEmail.split('@')[0]}`)
      let matchingTokens = 0
      for (const token of uTokens) {
        if (empTokens.has(token)) {
          matchingTokens++
        }
      }

      // If at least 2 significant name tokens match (e.g. 'jai', 'sai', 'ramcharan', 'teja')
      if (matchingTokens >= 2) {
        candidateAuthUser = {
          id: u.id,
          email: u.email || '',
          fullName: uFullName,
          reason: `Auth user with email '${u.email}' matches employee name (${matchingTokens} matching name tokens: '${empFullName}').`,
          similarityScore: matchingTokens,
        }
        break
      }
    }
  }

  // 3. Evaluate identity issues
  if (!emp.user_id) {
    issues.push('EMPLOYEE_USER_ID_STALE')
  }

  if (emp.user_id && !authUser) {
    issues.push('AUTH_USER_MISSING')
  }

  if (!publicUser) {
    issues.push('PUBLIC_USER_MISSING')
  } else if (publicUser.employee_id !== emp.id) {
    issues.push('PUBLIC_USER_EMPLOYEE_LINK_MISSING')
  }

  if (authUser && authUser.email?.toLowerCase().trim() !== officialEmail) {
    issues.push('EMAIL_MISMATCH')
  }

  if (publicUser && publicUser.email?.toLowerCase().trim() !== officialEmail) {
    issues.push('EMAIL_MISMATCH')
  }

  // Check roles in public.user_roles
  const targetUserId = authUser?.id || publicUser?.id || emp.user_id
  const assignedRoles: string[] = []
  if (targetUserId) {
    const { data: userRoles } = await supabase
      .from('user_roles')
      .select('roles(name)')
      .eq('user_id', targetUserId)

    if (userRoles) {
      for (const ur of userRoles as any[]) {
        if (ur.roles?.name) assignedRoles.push(ur.roles.name)
      }
    }
  }

  if (assignedRoles.length === 0) {
    issues.push('ROLE_MISSING')
  }

  const isHealthy = issues.length === 0

  // 4. Determine Decision Tree Case
  let caseType: RepairCase = 'CASE_C'
  let description = ''
  const actions: string[] = []

  if (isHealthy) {
    caseType = 'CASE_A'
    description = 'Identity links are fully healthy and synchronized.'
    actions.push('No repair action required.')
  } else if (authUserByEmail) {
    caseType = 'CASE_A'
    description = `An active Supabase Auth user (${authUserByEmail.id}) exists with official email '${officialEmail}'. Re-link employee and user records.`
    actions.push(`Update employees.user_id to ${authUserByEmail.id}`)
    actions.push(`Upsert public.users record for ${authUserByEmail.id}`)
    actions.push(`Ensure EMPLOYEE role is assigned in user_roles`)
    actions.push(`Issue new temporary credentials`)
  } else if (candidateAuthUser) {
    caseType = 'CASE_B'
    description = `Employee official email was updated or diverged from existing Auth user (${candidateAuthUser.email} / ${candidateAuthUser.id}). Apply controlled email sync.`
    actions.push(`Update Auth user ${candidateAuthUser.id} email from '${candidateAuthUser.email}' to '${officialEmail}'`)
    actions.push(`Update employees.user_id to ${candidateAuthUser.id}`)
    actions.push(`Clean up stale public.users records and upsert ${candidateAuthUser.id}`)
    actions.push(`Ensure EMPLOYEE role is assigned in user_roles`)
    actions.push(`Issue new temporary credentials`)
  } else if (!authUser && !authUserByEmail) {
    caseType = 'CASE_C'
    description = `No Auth user exists for official email '${officialEmail}'. Provision a new Auth account with temporary credentials.`
    actions.push(`Create new Supabase Auth user for '${officialEmail}'`)
    actions.push(`Update employees.user_id to the new Auth user ID`)
    actions.push(`Upsert public.users record linked to employee ID`)
    actions.push(`Assign EMPLOYEE role in user_roles`)
    actions.push(`Issue new temporary credentials`)
  } else {
    caseType = 'CASE_D'
    description = `Identity state is ambiguous or in conflict. Requires administrator verification.`
    actions.push(`Manual inspection required before repair`)
  }

  return {
    employeeId: emp.id,
    employeeCode: emp.employee_code,
    fullName: emp.full_name,
    officialEmail: emp.official_email,
    isHealthy,
    issues,
    details: {
      employeeUserId: emp.user_id,
      authUserId: authUser?.id || null,
      authEmail: authUser?.email || null,
      publicUserId: publicUser?.id || null,
      publicEmail: publicUser?.email || null,
      publicUserEmployeeId: publicUser?.employee_id || null,
      assignedRoles,
      candidateAuthUser,
    },
    repairRecommendation: {
      caseType,
      description,
      actions,
    },
  }
}

/**
 * Safely repair an employee's authentication identity following the Decision Tree.
 * Returns temporary credentials once for the administrator to provide to the employee.
 */
export async function repairEmployeeAuthIdentity(
  employeeIdOrCode: string,
  options: {
    tempPassword?: string
    companyId?: string
    adminContext?: { userId: string; userEmail: string; userName: string }
  } = {}
): Promise<RepairAuthResult> {
  const supabase = createAdminClient()
  if (!supabase) {
    return {
      success: false,
      employeeCode: '',
      officialEmail: '',
      caseApplied: 'CASE_C',
      actionsPerformed: [],
      error: 'Database unavailable',
    }
  }

  const integrity = await getEmployeeIdentityIntegrity(employeeIdOrCode, options.companyId)
  if (!integrity) {
    return {
      success: false,
      employeeCode: '',
      officialEmail: '',
      caseApplied: 'CASE_C',
      actionsPerformed: [],
      error: 'Employee record not found',
    }
  }

  const actionsPerformed: string[] = []
  const tempPassword = options.tempPassword || generateTemporaryPassword()
  const { employeeId, employeeCode, officialEmail, fullName } = integrity
  const companyId = options.companyId || (await getEmployeeCompanyId(supabase, employeeId))

  if (!companyId) {
    return {
      success: false,
      employeeCode,
      officialEmail,
      caseApplied: integrity.repairRecommendation.caseType,
      actionsPerformed,
      error: 'Company ID could not be resolved',
    }
  }

  let finalAuthUserId = ''
  const caseApplied = integrity.repairRecommendation.caseType

  try {
    // -------------------------------------------------------------
    // CASE A: Existing auth user with official email
    // -------------------------------------------------------------
    if (caseApplied === 'CASE_A' && integrity.details.candidateAuthUser?.email === officialEmail) {
      finalAuthUserId = integrity.details.candidateAuthUser.id

      await supabase.auth.admin.updateUserById(finalAuthUserId, {
        password: tempPassword,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
          role: 'EMPLOYEE',
          must_change_password: true,
          employee_id: employeeId,
          employee_code: employeeCode,
        },
      })
      actionsPerformed.push(`Updated existing Auth user (${finalAuthUserId}) with temporary password and metadata.`)
    }
    // -------------------------------------------------------------
    // CASE B: Existing auth user with historical/different email (e.g. HRK-001)
    // -------------------------------------------------------------
    else if (caseApplied === 'CASE_B' && integrity.details.candidateAuthUser) {
      finalAuthUserId = integrity.details.candidateAuthUser.id

      // 1. Update auth.users email and password
      const { error: updateAuthErr } = await supabase.auth.admin.updateUserById(finalAuthUserId, {
        email: officialEmail,
        password: tempPassword,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
          role: 'EMPLOYEE',
          must_change_password: true,
          employee_id: employeeId,
          employee_code: employeeCode,
        },
      })

      if (updateAuthErr) {
        throw new Error(`Failed to update Auth user email: ${updateAuthErr.message}`)
      }
      actionsPerformed.push(`Synced Auth user (${finalAuthUserId}) email to '${officialEmail}' and set temporary password.`)
    }
    // -------------------------------------------------------------
    // CASE C: No auth user exists -> Create fresh Auth user
    // -------------------------------------------------------------
    else {
      // Check if user already exists in auth by official email
      const { data: listData } = await supabase.auth.admin.listUsers()
      const existing = listData?.users?.find(u => u.email?.toLowerCase().trim() === officialEmail)

      if (existing) {
        finalAuthUserId = existing.id
        await supabase.auth.admin.updateUserById(finalAuthUserId, {
          password: tempPassword,
          email_confirm: true,
          user_metadata: {
            full_name: fullName,
            role: 'EMPLOYEE',
            must_change_password: true,
            employee_id: employeeId,
            employee_code: employeeCode,
          },
        })
        actionsPerformed.push(`Re-linked existing Auth user (${finalAuthUserId}) with temporary credentials.`)
      } else {
        const { data: created, error: createErr } = await supabase.auth.admin.createUser({
          email: officialEmail,
          password: tempPassword,
          email_confirm: true,
          user_metadata: {
            full_name: fullName,
            role: 'EMPLOYEE',
            must_change_password: true,
            employee_id: employeeId,
            employee_code: employeeCode,
          },
        })

        if (createErr || !created.user) {
          throw new Error(`Failed to create Auth user: ${createErr?.message || 'Unknown error'}`)
        }
        finalAuthUserId = created.user.id
        actionsPerformed.push(`Created fresh Auth user (${finalAuthUserId}) for '${officialEmail}'.`)
      }
    }

    // -------------------------------------------------------------
    // Common Reconciliation across all cases:
    // (Sequence to satisfy both FKs (audit_logs, employees) and Unique (users_email_key):
    // 1. Find conflicting public.users rows by email or employee_id
    // 2. Temporarily rename old user's email to release users_email_key
    // 3. Upsert public.users with canonical finalAuthUserId
    // 4. Remap audit_logs and notifications from old user IDs to finalAuthUserId
    // 5. Update employees.user_id to finalAuthUserId
    // 6. Delete old orphaned public.users records
    // 7. Assign EMPLOYEE role in user_roles)
    // -------------------------------------------------------------

    // 1. Find conflicting public.users rows
    const { data: conflictingUsers } = await supabase
      .from('users')
      .select('id')
      .eq('company_id', companyId)
      .or(`email.eq.${officialEmail},employee_id.eq.${employeeId}`)
      .neq('id', finalAuthUserId)

    if (conflictingUsers && conflictingUsers.length > 0) {
      for (const cu of conflictingUsers) {
        // Temporarily release unique email constraint
        await supabase
          .from('users')
          .update({ email: `archive_${cu.id.slice(0, 8)}_${Date.now()}@haryak.local` })
          .eq('id', cu.id)
      }
    }

    // 2. Upsert public.users with the canonical finalAuthUserId
    const { error: userUpsertErr } = await supabase
      .from('users')
      .upsert({
        id: finalAuthUserId,
        company_id: companyId,
        employee_id: employeeId,
        email: officialEmail,
        full_name: fullName,
        is_active: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' })

    if (userUpsertErr) {
      throw new Error(`Failed to upsert public.users: ${userUpsertErr.message}`)
    }
    actionsPerformed.push(`Upserted public.users record (${finalAuthUserId}).`)

    // 3. Remap FK references from conflicting users to finalAuthUserId
    if (conflictingUsers && conflictingUsers.length > 0) {
      const oldIds = conflictingUsers.map((u: any) => u.id)
      for (const oldId of oldIds) {
        await supabase.from('audit_logs').update({ user_id: finalAuthUserId }).eq('user_id', oldId)
        await supabase.from('notifications').update({ user_id: finalAuthUserId }).eq('user_id', oldId)
        await supabase.from('user_roles').delete().eq('user_id', oldId)
        await supabase.from('users').delete().eq('id', oldId)
      }
      actionsPerformed.push(`Migrated references and deleted ${oldIds.length} stale public.users records.`)
    }

    // 4. Link employees.user_id to finalAuthUserId
    const { error: empUpdateErr } = await supabase
      .from('employees')
      .update({
        user_id: finalAuthUserId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', employeeId)

    if (empUpdateErr) {
      throw new Error(`Failed to update employees.user_id: ${empUpdateErr.message}`)
    }
    actionsPerformed.push(`Linked employees.user_id to '${finalAuthUserId}'.`)

    // 5. Ensure EMPLOYEE role in user_roles
    const { data: roleRow } = await supabase
      .from('roles')
      .select('id')
      .eq('company_id', companyId)
      .eq('name', 'EMPLOYEE')
      .maybeSingle()

    if (roleRow?.id) {
      await supabase
        .from('user_roles')
        .upsert({
          user_id: finalAuthUserId,
          role_id: roleRow.id,
        }, { onConflict: 'user_id,role_id' })
      actionsPerformed.push(`Assigned EMPLOYEE role in user_roles.`)
    }


    // 4. Audit Log
    if (options.adminContext) {
      await createAuditLog({
        companyId,
        userId: options.adminContext.userId,
        userEmail: options.adminContext.userEmail,
        userName: options.adminContext.userName,
        action: 'updated',
        entityType: 'employee',
        entityId: employeeId,
        entityName: `${fullName} (${employeeCode})`,
        description: `Repaired authentication identity for ${fullName} (${employeeCode}) via ${caseApplied}`,
        reason: 'EMPLOYEE_AUTH_REPAIRED',
      })
    }

    return {
      success: true,
      employeeCode,
      officialEmail,
      temporaryPassword: tempPassword,
      authUserId: finalAuthUserId,
      caseApplied,
      actionsPerformed,
    }
  } catch (err: any) {
    console.error('[repairEmployeeAuthIdentity] Error:', err)
    return {
      success: false,
      employeeCode,
      officialEmail,
      caseApplied,
      actionsPerformed,
      error: err.message,
    }
  }
}

async function getEmployeeCompanyId(supabase: any, employeeId: string): Promise<string | null> {
  const { data } = await supabase
    .from('employees')
    .select('company_id')
    .eq('id', employeeId)
    .maybeSingle()
  return data?.company_id || null
}
