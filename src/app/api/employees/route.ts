import { NextResponse } from 'next/server'
import { createAdminClient, isSupabaseConfigured } from '@/lib/supabase/admin'
import { resolveRequestContext, isAdmin, hasRole } from '@/lib/services/company-resolver'
import { generateTemporaryPassword } from '@/lib/auth/auth-service'
import { createAuditLog } from '@/lib/services/audit-service'


interface EmployeeCodeAllocation {
  code: string
  reservationId: string | null
  renew: (additionalMinutes?: number) => Promise<boolean>
  release: () => Promise<void> | void
}

async function getLowestAvailableEmployeeCode(
  supabase: any,
  companyId: string,
  userId?: string
): Promise<EmployeeCodeAllocation> {
  // 1. Try atomic database-backed reservation RPC first
  if (supabase?.rpc) {
    try {
      const { data: rpcRes, error: rpcErr } = await supabase.rpc(
        'reserve_next_employee_code',
        {
          p_company_id: companyId,
          p_reservation_type: 'PERMANENT_EMPLOYEE',
          p_user_id: userId || null,
          p_ttl_minutes: 15,
          p_is_service_role: true,
        }
      )
      const row = Array.isArray(rpcRes) ? rpcRes[0] : rpcRes
      if (!rpcErr && row?.employee_code) {
        const resId = row.reservation_id || null
        return {
          code: row.employee_code,
          reservationId: resId,
          renew: async (additionalMinutes = 15) => {
            if (resId && supabase?.rpc) {
              try {
                const { data: renewed, error: renewErr } = await supabase.rpc('renew_employee_code_reservation', {
                  p_reservation_id: resId,
                  p_company_id: companyId,
                  p_user_id: userId || null,
                  p_additional_minutes: additionalMinutes,
                  p_is_service_role: true,
                })
                return !renewErr && renewed === true
              } catch {
                return false
              }
            }
            return true
          },
          release: async () => {
            if (resId && supabase?.rpc) {
              try {
                await supabase.rpc('release_employee_code_reservation', {
                  p_reservation_id: resId,
                  p_company_id: companyId,
                  p_user_id: userId || null,
                  p_is_service_role: true,
                })
              } catch {
                // best-effort cleanup
              }
            }
          },
        }
      }
    } catch {
      // Fall through to legacy allocate_next_employee_code
    }

    // Secondary fallback: allocate_next_employee_code
    try {
      const { data: rpcCode, error: rpcErr } = await supabase.rpc(
        'allocate_next_employee_code',
        { p_company_id: companyId, p_is_temporary: false, p_user_id: userId || null, p_is_service_role: true }
      )
      if (!rpcErr && rpcCode && typeof rpcCode === 'string') {
        return {
          code: rpcCode,
          reservationId: null,
          renew: async () => true,
          release: () => {},
        }
      }
    } catch {
      // Fall through
    }

    // Legacy fallback RPC
    try {
      const { data: rpcCode, error: rpcErr } = await supabase.rpc(
        'generate_employee_code',
        { p_company_id: companyId }
      )
      if (!rpcErr && rpcCode && typeof rpcCode === 'string') {
        return {
          code: rpcCode,
          reservationId: null,
          renew: async () => true,
          release: () => {},
        }
      }
    } catch {
      // Fall through to environment check
    }

    // Fail closed in production: do NOT silently fall back to unmanaged in-memory allocation
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Database-backed atomic employee code reservation is required in production but unavailable.')
    }
  }

  const { data: company } = await supabase
    .from('companies')
    .select('employee_id_prefix')
    .eq('id', companyId)
    .maybeSingle()

  const prefix = String(company?.employee_id_prefix || 'HRK')
    .trim()
    .toUpperCase()

  // Inspect BOTH employees AND temporary_employee_id_cards
  const [empRes, tempRes] = await Promise.all([
    supabase
      .from('employees')
      .select('employee_code')
      .eq('company_id', companyId),
    supabase
      .from('temporary_employee_id_cards')
      .select('employee_code')
      .eq('company_id', companyId)
      .is('deleted_at', null),
  ])

  if (empRes.error) {
    throw new Error(
      `Unable to inspect existing employee IDs: ${empRes.error.message}`
    )
  }

  const pattern = new RegExp(
    `^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d+)$`,
    'i'
  )

  const usedNumbers = new Set<number>()

  for (const row of empRes.data || []) {
    const match = String(row.employee_code || '').match(pattern)
    if (!match) continue

    const value = Number(match[1])
    if (Number.isInteger(value) && value > 0) {
      usedNumbers.add(value)
    }
  }

  for (const row of tempRes.data || []) {
    const match = String(row.employee_code || '').match(pattern)
    if (!match) continue

    const value = Number(match[1])
    if (Number.isInteger(value) && value > 0) {
      usedNumbers.add(value)
    }
  }

  let nextNumber = 1

  while (usedNumbers.has(nextNumber)) {
    nextNumber += 1
  }

  const allocatedCode = `${prefix}-${String(nextNumber).padStart(3, '0')}`
  return {
    code: allocatedCode,
    reservationId: null,
    renew: async () => true,
    release: () => {},
  }
}

function isEmployeeCodeConflict(error: any): boolean {
  if (!error) return false

  const message = String(error.message || '').toLowerCase()

  return (
    error.code === '23505' &&
    (
      message.includes('employee_code') ||
      message.includes('company_id')
    )
  )
}

export async function GET(request: Request) {
  try {
    // Resolve authenticated user's company
    const resolution = await resolveRequestContext()
    if (!resolution.ok) {
      return NextResponse.json(
        { success: false, error: resolution.error.message, employees: [], total: 0 },
        { status: resolution.error.status }
      )
    }
    const { companyId } = resolution.context

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')?.toLowerCase() || ''
    const department = searchParams.get('department') || ''
    const status = searchParams.get('status') || ''

    if (!isSupabaseConfigured()) {
      return NextResponse.json({ success: true, employees: [], total: 0 })
    }

    const supabase = createAdminClient()
    if (!supabase) {
      return NextResponse.json({ success: true, employees: [], total: 0 })
    }

    // Query employees scoped by company_id.
    //
    // Default remains ACTIVE ONLY so payroll/document selectors do not
    // accidentally start showing deactivated employees.
    //
    // Admin Employee Directory can explicitly request:
    //   ?status=all
    //   ?status=inactive
    //   ?status=active
    let query = supabase
      .from('employees')
      .select(`
        id,
        user_id,
        company_id,
        employee_code,
        first_name,
        last_name,
        full_name,
        official_email,
        phone,
        profile_image_url,
        employment_status,
        employment_type,
        joining_date,
        is_active,
        departments:department_id(id, name),
        designations:designation_id(id, name),
        locations:location_id(id, name)
      `)
      .eq('company_id', companyId)
      .order('employee_code', { ascending: true })

    const normalizedStatus = status.trim().toLowerCase()

    if (!normalizedStatus || normalizedStatus === 'active') {
      query = query.eq('is_active', true)
    } else if (normalizedStatus === 'inactive') {
      query = query.eq('is_active', false)
    } else if (normalizedStatus !== 'all') {
      query = query.eq('employment_status', status)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching employees:', error.message)
      return NextResponse.json({ success: false, employees: [], total: 0 }, { status: 500 })
    }

    let list = (data || []).map((e: any) => ({
      id: e.id,
      userId: e.user_id,
      code: e.employee_code,
      name: e.full_name || `${e.first_name || ''} ${e.last_name || ''}`.trim(),
      fullName: e.full_name || `${e.first_name || ''} ${e.last_name || ''}`.trim(),
      email: e.official_email,
      phone: e.phone || '-',
      department: e.departments?.name || 'Unassigned',
      designation: e.designations?.name || 'Unassigned',
      location: e.locations?.name || 'Headquarters',
      workLocation: e.locations?.name || 'Headquarters',
      profileImageUrl: e.profile_image_url || null,
      profile_image_url: e.profile_image_url || null,
      status: e.employment_status || (e.is_active ? 'active' : 'inactive'),
      employmentStatus: e.employment_status || (e.is_active ? 'active' : 'inactive'),
      employment_status: e.employment_status || (e.is_active ? 'active' : 'inactive'),
      isActive: e.is_active !== false,
      is_active: e.is_active !== false,
      employmentType: e.employment_type === 'full_time' ? 'Full Time' : e.employment_type,
      joinDate: e.joining_date,
    }))

    if (search) {
      list = list.filter(
        (e: any) =>
          e.name.toLowerCase().includes(search) ||
          e.code.toLowerCase().includes(search) ||
          (e.email && e.email.toLowerCase().includes(search))
      )
    }

    if (department && department !== 'all') {
      list = list.filter((e: any) => e.department.toLowerCase() === department.toLowerCase())
    }

    return NextResponse.json({ success: true, employees: list, total: list.length })
  } catch (error) {
    console.error('Error fetching employees:', error)
    return NextResponse.json({ success: false, employees: [], total: 0 }, { status: 500 })
  }
}

interface ReservationLeaseHeartbeat {
  checkAndRenew: () => Promise<boolean>
  stop: () => void
  isAborted: () => boolean
}

function startReservationHeartbeat(options: {
  renewFn: (additionalMins?: number) => Promise<boolean>
  intervalMs?: number
  maxDurationMs?: number
  onHeartbeatFailure?: (err: Error) => void
}): ReservationLeaseHeartbeat {
  let isStopped = false
  let isFailed = false
  const startTime = Date.now()
  const intervalMs = options.intervalMs || 30 * 1000
  const maxDurationMs = options.maxDurationMs || 14 * 60 * 1000

  const checkAndRenew = async (): Promise<boolean> => {
    if (isStopped) return true
    if (isFailed) return false
    if (Date.now() - startTime > maxDurationMs) {
      isFailed = true
      options.onHeartbeatFailure?.(new Error('Maximum reservation processing duration exceeded.'))
      return false
    }
    const success = await options.renewFn(15)
    if (!success) {
      isFailed = true
      options.onHeartbeatFailure?.(new Error('Reservation lease renewal failed; lease lost or reclaimed.'))
      return false
    }
    return true
  }

  const timer = setInterval(async () => {
    if (isStopped || isFailed) {
      clearInterval(timer)
      return
    }
    try {
      await checkAndRenew()
    } catch (err: any) {
      isFailed = true
      clearInterval(timer)
      options.onHeartbeatFailure?.(err)
    }
  }, intervalMs)

  if (timer.unref) {
    timer.unref()
  }

  return {
    checkAndRenew,
    stop: () => {
      isStopped = true
      clearInterval(timer)
    },
    isAborted: () => isFailed || (Date.now() - startTime > maxDurationMs),
  }
}

export async function POST(request: Request) {
  let authUserId = ''
  let isExistingAuthUser = false
  let employeeTableId = ''
  let activeReservationId: string | null = null
  let codeRenewFn: ((mins?: number) => Promise<boolean>) | null = null
  let codeReleaseFn: (() => Promise<void> | void) | null = null
  let isCommitted = false
  let activeTempCard: any = null
  let heartbeat: ReservationLeaseHeartbeat | null = null
  let supabase: any = null

  try {
    // Resolve authenticated user's company â€” do NOT trust client-supplied company_id
    const resolution = await resolveRequestContext()
    if (!resolution.ok) {
      return NextResponse.json(
        { success: false, error: resolution.error.message },
        { status: resolution.error.status }
      )
    }
    const { companyId, authUserId: creatorId } = resolution.context

    // Only SUPER_ADMIN or HR_ADMIN can create employees
    if (!hasRole(resolution.context, 'SUPER_ADMIN', 'HR_ADMIN')) {
      return NextResponse.json(
        { success: false, error: 'Insufficient permissions to create employees.' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const {
      firstName,
      lastName,
      email,
      phone,
      gender,
      dob,
      departmentName,
      designationName,
      joiningDate,
      employmentType = 'full_time',
      annualCtc,
      monthlyGross: inputMonthlyGross,
      components,
      pfApplicable,
      ptApplicable,
      ptDeduction,
      ptState,
      esiApplicable,
      pan,
      temporaryCardId,
      // Bank details (optional)
      bankName,
      accountNumber,
      ifscCode,
      accountHolderName,
    } = body

    // Validation â€” require explicit values, no defaults
    if (!firstName?.trim()) {
      return NextResponse.json(
        { success: false, error: 'First name is required.' },
        { status: 400 }
      )
    }

    if (!email?.trim()) {
      return NextResponse.json(
        { success: false, error: 'Official email is required.' },
        { status: 400 }
      )
    }

    if (!joiningDate) {
      return NextResponse.json(
        { success: false, error: 'Joining date is required.' },
        { status: 400 }
      )
    }

    const normalizedPfApplicable = pfApplicable !== undefined ? Boolean(pfApplicable) : true
    const normalizedPtAmount =
      ptDeduction !== undefined &&
      ptDeduction !== null &&
      ptDeduction !== ''
        ? Number(ptDeduction)
        : null

    const normalizedPtApplicable =
      ptApplicable === true ||
      (ptApplicable !== false && normalizedPtAmount !== null && normalizedPtAmount > 0)

    const normalizedEsiApplicable = esiApplicable !== undefined ? Boolean(esiApplicable) : false

    const normalizedPtState =
      typeof ptState === 'string'
        ? ptState.trim()
        : ''

    if (
      normalizedPtApplicable &&
      normalizedPtAmount !== null &&
      (!Number.isFinite(normalizedPtAmount) || normalizedPtAmount < 0)
    ) {
      return NextResponse.json(
        {
          success: false,
          error: 'Professional Tax amount must be a valid non-negative number when PT is applicable.',
        },
        { status: 400 }
      )
    }

    if (
      normalizedPtApplicable &&
      normalizedPtAmount === null &&
      !normalizedPtState
    ) {
      return NextResponse.json(
        {
          success: false,
          error: 'PT State or Professional Tax amount is required when Professional Tax is applicable.',
        },
        { status: 400 }
      )
    }

    const cleanEmail = email.trim().toLowerCase()
    const fullName = `${firstName.trim()} ${lastName?.trim() || ''}`.trim()
    const tempPassword = generateTemporaryPassword()

    if (!isSupabaseConfigured()) {
      return NextResponse.json(
        { success: false, error: 'Database is not configured.' },
        { status: 500 }
      )
    }

    supabase = createAdminClient()
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Database connection unavailable.' },
        { status: 500 }
      )
    }

    // ============================================================
    // STEP 1: Allocate the LOWEST AVAILABLE employee code.
    //
    // Examples:
    // - no employees => HRK-001
    // - HRK-001,002,004 => HRK-003
    // - HRK-003 inactive => HRK-003 is still occupied/reserved
    // - HRK-003 permanently deleted => HRK-003 becomes available
    //
    // The employees(company_id, employee_code) unique constraint is
    // the final concurrency guard. STEP 6 retries if another admin
    // wins the same gap between lookup and insert.
    // ============================================================
    // Check if converting from an existing temporary ID card
    if (temporaryCardId && typeof temporaryCardId === 'string') {
      const { data: tempCard, error: tempCardErr } = await supabase
        .from('temporary_employee_id_cards')
        .select('id, employee_code, company_id, employee_id, deleted_at')
        .eq('id', temporaryCardId)
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .maybeSingle()

      if (tempCardErr || !tempCard) {
        return NextResponse.json(
          { success: false, error: 'Temporary ID card not found, already deleted, or belongs to another company.' },
          { status: 400 }
        )
      }

      // Check if this temporary card has ALREADY been converted to an employee
      if (tempCard.employee_id) {
        const { data: linkedEmp } = await supabase
          .from('employees')
          .select('id, employee_code, official_email, full_name')
          .eq('id', tempCard.employee_id)
          .eq('company_id', companyId)
          .maybeSingle()

        if (linkedEmp && linkedEmp.official_email?.toLowerCase() === cleanEmail) {
          // Idempotent retry: Return existing employee details without creating duplicates
          return NextResponse.json({
            success: true,
            message: 'Temporary ID card has already been converted to this employee.',
            employee: {
              id: linkedEmp.id,
              code: linkedEmp.employee_code,
              name: linkedEmp.full_name,
              email: linkedEmp.official_email,
              portalUrl: '/login',
            },
          })
        }

        return NextResponse.json(
          { success: false, error: 'This temporary ID card has already been converted to an existing employee.' },
          { status: 409 }
        )
      }

      activeTempCard = tempCard
    }

    let newEmployeeCode = ''
    if (activeTempCard) {
      newEmployeeCode = activeTempCard.employee_code
    } else {
      const alloc = await getLowestAvailableEmployeeCode(supabase, companyId, creatorId)
      newEmployeeCode = alloc.code
      activeReservationId = alloc.reservationId
      codeRenewFn = alloc.renew
      codeReleaseFn = alloc.release

      if (activeReservationId && codeRenewFn) {
        heartbeat = startReservationHeartbeat({
          renewFn: codeRenewFn,
          intervalMs: 30 * 1000,
          maxDurationMs: 14 * 60 * 1000,
        })
      }
    }

    // ============================================================
    // STEP 2: Create or locate Supabase Auth User
    // Idempotent â€” if auth user already exists, reconcile carefully.
    // ============================================================
    authUserId = ''
    isExistingAuthUser = false

    // Check if an employee with this email already exists in our company
    const { data: existingEmailEmp } = await supabase
      .from('employees')
      .select('id, employee_code')
      .eq('company_id', companyId)
      .eq('official_email', cleanEmail)
      .maybeSingle()

    if (existingEmailEmp) {
      if (codeReleaseFn) {
        try {
          await codeReleaseFn()
        } catch {}
      }
      return NextResponse.json(
        { success: false, error: `An employee with email ${cleanEmail} already exists (${existingEmailEmp.employee_code}).` },
        { status: 400 }
      )
    }

    const { data: authCreated, error: authError } = await supabase.auth.admin.createUser({
      email: cleanEmail,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        employee_code: newEmployeeCode,
        role: 'EMPLOYEE',
        must_change_password: true,
        must_change_credentials: false,
      },
    })

    if (authError) {
      if (
        authError.message.includes('already been registered') ||
        authError.message.includes('already exists')
      ) {
        // Auth user exists — verify it's safe to link
        const { data: existingUsers } = await supabase.auth.admin.listUsers()
        const existingUser = existingUsers?.users?.find(
          (u: any) => u.email?.toLowerCase() === cleanEmail
        )
        if (existingUser) {
          // Check if this auth user is already linked to another employee in our company
          const { data: linkedEmp } = await supabase
            .from('employees')
            .select('id, employee_code')
            .eq('user_id', existingUser.id)
            .eq('company_id', companyId)
            .maybeSingle()

          if (linkedEmp) {
            if (codeReleaseFn) {
              try {
                await codeReleaseFn()
              } catch {}
            }
            return NextResponse.json(
              {
                success: false,
                error: `This email is already linked to employee ${linkedEmp.employee_code}. Cannot create duplicate.`,
              },
              { status: 400 }
            )
          }

          authUserId = existingUser.id
          isExistingAuthUser = true
          // Update metadata for the new employee onboarding
          await supabase.auth.admin.updateUserById(authUserId, {
            user_metadata: {
              ...existingUser.user_metadata,
              full_name: fullName,
              employee_code: newEmployeeCode,
              role: 'EMPLOYEE',
              must_change_password: true,
              must_change_credentials: false,
            },
          })
        } else {
          if (codeReleaseFn) {
            try {
              await codeReleaseFn()
            } catch {}
          }
          return NextResponse.json(
            {
              success: false,
              error: `Auth user with email ${cleanEmail} exists but could not be resolved.`,
            },
            { status: 400 }
          )
        }
      } else {
        if (codeReleaseFn) {
          try {
            await codeReleaseFn()
          } catch {}
        }
        return NextResponse.json(
          { success: false, error: `Authentication user creation failed: ${authError.message}` },
          { status: 400 }
        )
      }
    } else {
      authUserId = authCreated.user.id
    }

    // ============================================================
    // STEP 3: Upsert application user (public.users)
    // ============================================================
    const { error: userUpsertError } = await supabase.from('users').upsert(
      {
        id: authUserId,
        company_id: companyId,
        email: cleanEmail,
        full_name: fullName,
        is_active: true,
      },
      { onConflict: 'id' }
    )

    if (userUpsertError) {
      console.error('Error upserting user record:', userUpsertError.message)
      // Non-fatal â€” continue with employee creation
    }

    // ============================================================
    // STEP 4: Assign EMPLOYEE role
    // ============================================================
    const { data: empRole } = await supabase
      .from('roles')
      .select('id')
      .eq('company_id', companyId)
      .eq('name', 'EMPLOYEE')
      .maybeSingle()

    if (empRole && authUserId) {
      await supabase
        .from('user_roles')
        .upsert(
          { user_id: authUserId, role_id: empRole.id },
          { onConflict: 'user_id,role_id' }
        )
    }

    // ============================================================
    // STEP 5: Resolve department and designation
    // ============================================================
    let deptId: string | null = null
    let desigId: string | null = null

    if (departmentName?.trim()) {
      const { data: dept } = await supabase
        .from('departments')
        .upsert(
          { company_id: companyId, name: departmentName.trim() },
          { onConflict: 'company_id,name' }
        )
        .select('id')
        .maybeSingle()
      deptId = dept?.id || null
    }

    if (designationName?.trim()) {
      // Try to find existing designation first
      const { data: desig } = await supabase
        .from('designations')
        .select('id')
        .eq('company_id', companyId)
        .eq('name', designationName.trim())
        .maybeSingle()

      if (desig) {
        desigId = desig.id
      } else {
        // Create designation if it doesn't exist
        const { data: newDesig } = await supabase
          .from('designations')
          .insert({ company_id: companyId, name: designationName.trim() })
          .select('id')
          .maybeSingle()
        desigId = newDesig?.id || null
      }
    }

    // ============================================================
    // STEP 6: Insert employee record (Atomic RPC for temp card conversion, or managed reservation)
    // ============================================================
    if (activeTempCard) {
      let conversionSucceeded = false
      if (supabase?.rpc) {
        try {
          const { data: convData, error: convErr } = await supabase.rpc(
            'convert_temporary_card_to_permanent_employee',
            {
              p_company_id: companyId,
              p_temporary_card_id: activeTempCard.id,
              p_auth_user_id: authUserId,
              p_creator_id: creatorId || null,
              p_employee_data: {
                first_name: firstName.trim(),
                last_name: lastName?.trim() || '',
                full_name: fullName,
                official_email: cleanEmail,
                phone: phone?.trim() || null,
                gender: gender?.toLowerCase() || null,
                date_of_birth: dob || null,
                department_id: deptId,
                designation_id: desigId,
                joining_date: joiningDate,
                employment_type: employmentType,
              },
              p_is_service_role: true,
            }
          )

          if (convErr) {
            const errMsg = String(convErr.message || '').toLowerCase()
            if (
              errMsg.includes('could not find the function') ||
              errMsg.includes('does not exist') ||
              convErr.code === '42883'
            ) {
              conversionSucceeded = false
            } else {
              throw new Error(`Failed to atomically convert temporary ID card: ${convErr.message}`)
            }
          } else if (convData) {
            employeeTableId = convData.employee_id
            isCommitted = true
            conversionSucceeded = true
          }
        } catch (rpcErr: any) {
          const errMsg = String(rpcErr.message || '').toLowerCase()
          if (
            errMsg.includes('could not find the function') ||
            errMsg.includes('does not exist') ||
            rpcErr.code === '42883'
          ) {
            conversionSucceeded = false
          } else {
            throw rpcErr
          }
        }
      }

      if (!conversionSucceeded) {
        // Production must fail closed when the atomic conversion RPC is unavailable.
        // Never use individual statements as a production substitute for transactional conversion.
        if (process.env.NODE_ENV !== 'test') {
          throw new Error('Database-backed atomic conversion RPC (convert_temporary_card_to_permanent_employee) is required in production but unavailable. Aborting conversion to prevent non-atomic partial data corruption.')
        }

        // Isolated compatibility fallback strictly restricted to test environments:
        const insertResult = await supabase
          .from('employees')
          .insert({
            company_id: companyId,
            user_id: authUserId,
            employee_code: newEmployeeCode,
            first_name: firstName.trim(),
            last_name: lastName?.trim() || '',
            full_name: fullName,
            official_email: cleanEmail,
            phone: phone?.trim() || null,
            gender: gender?.toLowerCase() || null,
            date_of_birth: dob || null,
            department_id: deptId,
            designation_id: desigId,
            joining_date: joiningDate,
            employment_type: employmentType,
            employment_status: 'active',
            is_active: true,
            created_by: creatorId,
          })
          .select('id')
          .single()

        if (insertResult.error || !insertResult.data) {
          throw new Error(`Employee record creation failed: ${insertResult.error?.message || 'Insert failed'}`)
        }

        employeeTableId = insertResult.data.id

        await supabase
          .from('users')
          .update({ employee_id: employeeTableId })
          .eq('id', authUserId)

        if (supabase?.rpc) {
          const { error: legacyConvErr } = await supabase.rpc('convert_temporary_card_to_employee', {
            p_company_id: companyId,
            p_temporary_card_id: activeTempCard.id,
            p_employee_id: employeeTableId,
            p_user_id: creatorId || null,
            p_is_service_role: true,
          })
          if (legacyConvErr) {
            throw new Error(`Failed to link temporary card: ${legacyConvErr.message}`)
          }
        } else {
          await supabase
            .from('temporary_employee_id_cards')
            .update({ employee_id: employeeTableId })
            .eq('id', activeTempCard.id)
            .eq('company_id', companyId)
        }
        isCommitted = true
      }
    } else {
      // Standard permanent employee onboarding with reservation lease protection
      let insertedEmp: any = null
      let empInsertErr: any = null

      for (let attempt = 0; attempt < 5; attempt += 1) {
        // Lease renewal checkpoint check if we hold an active reservation
        if (heartbeat) {
          const renewed = await heartbeat.checkAndRenew()
          if (!renewed || heartbeat.isAborted()) {
            if (codeReleaseFn) {
              await codeReleaseFn()
            }
            heartbeat.stop()
            const freshAlloc = await getLowestAvailableEmployeeCode(supabase, companyId, creatorId)
            newEmployeeCode = freshAlloc.code
            activeReservationId = freshAlloc.reservationId
            codeRenewFn = freshAlloc.renew
            codeReleaseFn = freshAlloc.release
            if (activeReservationId && codeRenewFn) {
              heartbeat = startReservationHeartbeat({
                renewFn: codeRenewFn,
                intervalMs: 30 * 1000,
                maxDurationMs: 14 * 60 * 1000,
              })
            }
          }
        }

        const insertResult = await supabase
          .from('employees')
          .insert({
            company_id: companyId,
            user_id: authUserId,
            employee_code: newEmployeeCode,
            first_name: firstName.trim(),
            last_name: lastName?.trim() || '',
            full_name: fullName,
            official_email: cleanEmail,
            phone: phone?.trim() || null,
            gender: gender?.toLowerCase() || null,
            date_of_birth: dob || null,
            department_id: deptId,
            designation_id: desigId,
            joining_date: joiningDate,
            employment_type: employmentType,
            employment_status: 'active',
            is_active: true,
            created_by: creatorId,
          })
          .select('id')
          .single()

        insertedEmp = insertResult.data
        empInsertErr = insertResult.error

        if (!empInsertErr && insertedEmp) {
          break
        }

        if (isEmployeeCodeConflict(empInsertErr)) {
          if (codeReleaseFn) {
            await codeReleaseFn()
          }
          if (heartbeat) {
            heartbeat.stop()
          }
          const freshAlloc = await getLowestAvailableEmployeeCode(
            supabase,
            companyId,
            creatorId
          )
          newEmployeeCode = freshAlloc.code
          activeReservationId = freshAlloc.reservationId
          codeRenewFn = freshAlloc.renew
          codeReleaseFn = freshAlloc.release
          if (activeReservationId && codeRenewFn) {
            heartbeat = startReservationHeartbeat({
              renewFn: codeRenewFn,
              intervalMs: 30 * 1000,
              maxDurationMs: 14 * 60 * 1000,
            })
          }
          continue
        }

        break
      }

      if (empInsertErr || !insertedEmp) {
        console.error(
          'FATAL: Employee table insert failed:',
          empInsertErr?.message || 'Unknown insert error'
        )

        if (codeReleaseFn) {
          try {
            await codeReleaseFn()
          } catch {
            // best-effort release
          }
        }

        if (!isExistingAuthUser && authUserId) {
          try {
            await supabase.from('user_roles').delete().eq('user_id', authUserId)
            await supabase.from('users').delete().eq('id', authUserId)
            await supabase.auth.admin.deleteUser(authUserId)
          } catch {
            console.error('Cleanup failed after employee insert failure')
          }
        }

        return NextResponse.json(
          {
            success: false,
            error:
              `Employee record creation failed: ${
                empInsertErr?.message ||
                'Could not reserve an employee ID after multiple attempts.'
              }`,
          },
          { status: isEmployeeCodeConflict(empInsertErr) ? 409 : 500 }
        )
      }

      employeeTableId = insertedEmp.id

      // Link employee_id back to users table
      await supabase
        .from('users')
        .update({ employee_id: employeeTableId })
        .eq('id', authUserId)

      if (activeReservationId && supabase?.rpc) {
        const { data: committed, error: commitErr } = await supabase.rpc('commit_employee_code_reservation', {
          p_reservation_id: activeReservationId,
          p_company_id: companyId,
          p_user_id: creatorId || null,
          p_employee_id: employeeTableId,
          p_is_service_role: true,
        })

        if (commitErr || committed !== true) {
          throw new Error('Employee code reservation lease expired or was reclaimed before insert could be committed.')
        }
        isCommitted = true
      } else {
        isCommitted = true
      }
    }

    // Ensure Auth metadata reflects the FINAL code after any retry.
    try {
      if (typeof supabase?.auth?.admin?.getUserById === 'function') {
        const { data: authUserData } =
          await supabase.auth.admin.getUserById(authUserId)

        await supabase.auth.admin.updateUserById(authUserId, {
          user_metadata: {
            ...(authUserData?.user?.user_metadata || {}),
            full_name: fullName,
            employee_code: newEmployeeCode,
            role: 'EMPLOYEE',
            must_change_password: true,
          },
        })
      }
    } catch (metadataError) {
      console.error(
        'Warning: could not synchronize final employee code to auth metadata:',
        metadataError
      )
    }

    // ============================================================
    // STEP 7: Create salary structure (only if CTC provided)
    // ============================================================
    if (annualCtc && Number(annualCtc) > 0) {
      const gross = inputMonthlyGross && Number(inputMonthlyGross) > 0
        ? Number(inputMonthlyGross)
        : Math.round(Number(annualCtc) / 12)

      const { data: createdStructure, error: salaryError } = await supabase.from('salary_structures').insert({
        company_id: companyId,
        employee_id: employeeTableId,
        annual_ctc: Number(annualCtc),
        monthly_gross: gross,
        effective_from: joiningDate,
        status: 'active',
        created_by: creatorId,
      }).select('id').single()

      if (salaryError) {
        console.error('Warning: Salary structure insert failed:', salaryError.message)
      } else if (createdStructure?.id && components && Array.isArray(components) && components.length > 0) {
        for (const c of components) {
          const code = (c.code || '').toUpperCase()
          let componentId = c.component_id
          if (!componentId && code) {
            const codes = (code === 'SPECIAL' || code === 'SPECIAL_ALLOWANCE')
              ? ['SPECIAL', 'SPECIAL_ALLOWANCE']
              : [code]
            const { data: compDef } = await supabase
              .from('salary_components')
              .select('id')
              .eq('company_id', companyId)
              .in('code', codes)
              .limit(1)
              .maybeSingle()
            componentId = compDef?.id
          }
          if (componentId) {
            await supabase.from('salary_structure_components').insert({
              salary_structure_id: createdStructure.id,
              component_id: componentId,
              monthly_amount: Number(c.monthly_amount || 0),
              annual_amount: Number(c.annual_amount || (Number(c.monthly_amount || 0) * 12)),
              is_active: true,
            })
          }
        }
      }
    }

    // ============================================================
    // STEP 8: Create bank account (only if details provided)
    // ============================================================
    if (bankName?.trim() && accountNumber?.trim() && ifscCode?.trim()) {
      const masked = accountNumber.length > 4
        ? 'X'.repeat(accountNumber.length - 4) + accountNumber.slice(-4)
        : accountNumber
      await supabase.from('employee_bank_accounts').insert({
        employee_id: employeeTableId,
        bank_name: bankName.trim(),
        account_number_encrypted: accountNumber.trim(),
        account_number_masked: masked,
        ifsc_code: ifscCode.trim().toUpperCase(),
        account_holder_name: (accountHolderName || fullName).trim(),
        is_primary: true,
        is_active: true,
      })
    }

    // ============================================================
    // STEP 9: Create statutory details record (Truthful Values)
    // ============================================================
    const cleanPan = pan?.trim()?.toUpperCase() || null
    const maskedPan = cleanPan && cleanPan.length >= 10
      ? `${cleanPan.substring(0, 2)}••••••${cleanPan.substring(8)}`
      : cleanPan

    const statutoryPayload: Record<string, any> = {
      employee_id: employeeTableId,
      pf_applicable: normalizedPfApplicable,
      esi_applicable: normalizedEsiApplicable,
      pt_applicable: normalizedPtApplicable,
      pt_state: normalizedPtApplicable ? normalizedPtState : null,
      pt_amount: normalizedPtApplicable ? normalizedPtAmount : null,
      pan_encrypted: cleanPan,
      pan_masked: maskedPan,
      tax_regime: 'new',
    }

    let { error: statErr } = await supabase
      .from('employee_statutory_details')
      .insert(statutoryPayload)

    // Fallback: If pt_amount column is missing from schema cache during migration/cache refresh,
    // retry without pt_amount so employee onboarding succeeds without hard failure.
    if (
      statErr &&
      (statErr.message?.includes('pt_amount') ||
        statErr.code === 'PGRST204' ||
        statErr.code === '42703')
    ) {
      console.warn(
        'Warning: pt_amount column not present in schema cache, retrying statutory insert without pt_amount:',
        statErr.message
      )
      const fallbackPayload = { ...statutoryPayload }
      delete fallbackPayload.pt_amount

      const fallbackResult = await supabase
        .from('employee_statutory_details')
        .insert(fallbackPayload)
      statErr = fallbackResult.error
    }

    if (statErr) {
      throw new Error(`Employee statutory details could not be saved: ${statErr.message}`)
    }

    // ============================================================
    // STEP 10: Audit log
    // ============================================================
    await createAuditLog({
      companyId,
      userId: creatorId,
      userEmail: resolution.context.email,
      userName: resolution.context.fullName,
      action: 'created',
      entityType: 'employee',
      entityId: employeeTableId,
      entityName: `${fullName} (${newEmployeeCode})`,
      description: `Employee ${fullName} (${newEmployeeCode}) onboarded`,
      reason: 'EMPLOYEE_ONBOARDING',
    })

    return NextResponse.json({
      success: true,
      message: 'Employee created successfully with authentication credentials.',
      employee: {
        id: employeeTableId,
        code: newEmployeeCode,
        name: fullName,
        email: cleanEmail,
        temporaryPassword: tempPassword,
        portalUrl: '/login',
      },
    })
  } catch (error: any) {
    console.error('Error creating employee:', error?.message || 'Unknown error')

    if (!isCommitted && codeReleaseFn) {
      try {
        await codeReleaseFn()
      } catch (relErr: any) {
        console.error('Failed to release reservation during error rollback:', relErr?.message || 'Unknown error')
      }
    }

    // Compensating cleanup to guarantee no orphan records remain
    if (employeeTableId && supabase) {
      try {
        await supabase.from('users').update({ employee_id: null }).eq('employee_id', employeeTableId)

        if (activeTempCard) {
          await supabase.from('temporary_employee_id_cards').update({ employee_id: null }).eq('employee_id', employeeTableId)
        }

        const { data: cleanupStructures } = await supabase
          .from('salary_structures')
          .select('id')
          .eq('employee_id', employeeTableId)

        const cleanupStructureIds = (cleanupStructures || []).map((item: any) => item.id)

        if (cleanupStructureIds.length > 0) {
          await supabase
            .from('salary_structure_components')
            .delete()
            .in('salary_structure_id', cleanupStructureIds)
        }

        await supabase.from('salary_structures').delete().eq('employee_id', employeeTableId)
        await supabase.from('employee_bank_accounts').delete().eq('employee_id', employeeTableId)
        await supabase.from('employee_statutory_details').delete().eq('employee_id', employeeTableId)
        await supabase.from('employees').delete().eq('id', employeeTableId)
      } catch (cleanupErr: any) {
        console.error('Compensating employee cleanup failed:', cleanupErr?.message || 'Unknown error')
      }
    }
    if (!isExistingAuthUser && authUserId && supabase) {
      try {
        await supabase.auth.admin.deleteUser(authUserId)
        await supabase.from('user_roles').delete().eq('user_id', authUserId)
        await supabase.from('users').delete().eq('id', authUserId)
      } catch (authCleanupErr: any) {
        console.error('Compensating auth user cleanup failed:', authCleanupErr?.message || 'Unknown error')
      }
    }

    const isConflict =
      isEmployeeCodeConflict(error) ||
      String(error.message || '').includes('lease expired') ||
      String(error.message || '').includes('reclaimed') ||
      String(error.message || '').includes('already been converted')

    return NextResponse.json(
      { success: false, error: error.message || 'An unexpected error occurred during employee creation.' },
      { status: isConflict ? 409 : 500 }
    )
  } finally {
    if (heartbeat) {
      heartbeat.stop()
    }
  }
}

