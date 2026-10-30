import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveRequestContext, isAdmin } from '@/lib/services/company-resolver'
import { generateTemporaryPassword } from '@/lib/auth/auth-service'
import { createAuditLog } from '@/lib/services/audit-service'
import { getEmployeeIdentityIntegrity } from '@/lib/services/employee-identity-service'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolved = await resolveRequestContext()
  if (!resolved.ok) {
    return NextResponse.json({ success: false, error: resolved.error.message }, { status: resolved.error.status })
  }
  const { context } = resolved

  if (!isAdmin(context)) {
    return NextResponse.json({ success: false, error: 'Only administrators can reset employee credentials.' }, { status: 403 })
  }

  const { id } = await params
  const supabase = createAdminClient()
  if (!supabase) return NextResponse.json({ success: false, error: 'Database unavailable' }, { status: 503 })

  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)

  let query = supabase
    .from('employees')
    .select('id, user_id, full_name, employee_code, official_email')
    .eq('company_id', context.companyId)

  if (isUUID) {
    query = query.or(`id.eq.${id},user_id.eq.${id}`)
  } else {
    query = query.or(`employee_code.eq.${id.toUpperCase()},employee_code.ilike.${id.trim()}`)
  }

  const { data: emp, error: empErr } = await query.maybeSingle()

  if (empErr || !emp) {
    return NextResponse.json({ success: false, error: 'Employee record not found.' }, { status: 404 })
  }

  // Pre-flight check: Verify Identity Integrity
  const integrity = await getEmployeeIdentityIntegrity(emp.id, context.companyId)

  if (!integrity || !integrity.isHealthy) {
    return NextResponse.json({
      success: false,
      error: 'Employee login account is not linked correctly. Please use "Repair Login Account" to restore authentication access.',
      canRepair: true,
      integrity: integrity || undefined,
    }, { status: 400 })
  }

  const authUserId = integrity.details.authUserId || emp.user_id

  if (!authUserId) {
    return NextResponse.json({
      success: false,
      error: 'Employee is not linked to an authentication account.',
      canRepair: true,
    }, { status: 400 })
  }

  const newTempPassword = generateTemporaryPassword()

  const { error: authErr } = await supabase.auth.admin.updateUserById(authUserId, {
    password: newTempPassword,
    user_metadata: {
      must_change_password: true,
      must_change_credentials: false,
      role: 'EMPLOYEE',
      employee_id: emp.id,
      employee_code: emp.employee_code,
      full_name: emp.full_name,
    },
  })

  if (authErr) {
    return NextResponse.json({
      success: false,
      error: `Failed to update auth user: ${authErr.message}`,
      canRepair: true,
    }, { status: 500 })
  }

  // Also flag must_change_password in public.users if column exists
  try {
    await supabase.from('users').update({ must_change_password: true }).eq('id', authUserId)
  } catch {
    // Non-fatal if column not present in schema
  }

  // Revoke active sessions where supported
  try {
    await supabase.auth.admin.signOut(authUserId, 'global')
  } catch {
    // Graceful fallback if unsupported
  }

  await createAuditLog({
    companyId: context.companyId,
    userId: context.authUserId,
    userEmail: context.email,
    userName: context.fullName,
    action: 'updated',
    entityType: 'employee',
    entityId: emp.id,
    entityName: `${emp.full_name} (${emp.employee_code})`,
    description: `Reset temporary credentials for ${emp.full_name} (${emp.employee_code})`,
    reason: 'ADMIN_CREDENTIAL_RESET',
  })

  return NextResponse.json({
    success: true,
    temporaryPassword: newTempPassword,
    officialEmail: emp.official_email,
    employeeName: emp.full_name,
    employeeCode: emp.employee_code,
    message: `Temporary password reset successfully for ${emp.full_name}.`,
  }, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
  })
}
