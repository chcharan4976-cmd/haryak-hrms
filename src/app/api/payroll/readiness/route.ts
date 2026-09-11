import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveRequestContext, isAdmin } from '@/lib/services/company-resolver'
import { getEffectiveCompensation } from '@/lib/services/compensation-service'

export async function GET(request: NextRequest) {
  const resolved = await resolveRequestContext()
  if (!resolved.ok) {
    return NextResponse.json({ success: false, error: resolved.error.message }, { status: resolved.error.status })
  }
  const { context } = resolved

  if (!isAdmin(context)) {
    return NextResponse.json({ success: false, error: 'Unauthorized: Only HR Administrators can view payroll readiness.' }, { status: 403 })
  }

  const supabase = createAdminClient()
  if (!supabase) return NextResponse.json({ success: false, error: 'Database unavailable' }, { status: 503 })

  // Query all active employees with bank account and statutory details
  const { data: employees, error } = await supabase
    .from('employees')
    .select(`
      id,
      employee_code,
      full_name,
      employment_status,
      is_active,
      joining_date,
      employee_bank_accounts(id, account_number_masked, account_number_encrypted, is_active, is_primary),
      employee_statutory_details(id, pan_number, pan_masked)
    `)
    .eq('company_id', context.companyId)
    .eq('is_active', true)
    .eq('employment_status', 'active')

  if (error || !employees) {
    return NextResponse.json({ success: false, error: error?.message || 'Error fetching employees' }, { status: 500 })
  }

  const blockers: { employeeCode: string; employeeName: string; reason: string }[] = []
  const warnings: { employeeCode: string; employeeName: string; reason: string }[] = []

  let readyCount = 0

  for (const emp of employees) {
    const comp = await getEffectiveCompensation(emp.id, context.companyId)
    const activeBank = emp.employee_bank_accounts?.find((b: any) => 
      b.is_active !== false && (b.account_number_masked || b.account_number_encrypted)
    )
    const hasPan = emp.employee_statutory_details?.[0]?.pan_number || emp.employee_statutory_details?.[0]?.pan_masked

    let isEmpReady = true

    if (!comp.isComplete) {
      const reason = comp.incompletenessReasons[0] || 'Salary structure incomplete. Configure earning and deduction components before payroll.'
      blockers.push({
        employeeCode: emp.employee_code,
        employeeName: emp.full_name,
        reason,
      })
      isEmpReady = false
    }

    // Direct Bank Transfer is standard payment mode — missing bank account is a hard blocker
    if (!activeBank) {
      blockers.push({
        employeeCode: emp.employee_code,
        employeeName: emp.full_name,
        reason: 'Missing active bank account details for Direct Bank Transfer payout (ACTION REQUIRED)',
      })
      isEmpReady = false
    }

    if (!hasPan) {
      warnings.push({
        employeeCode: emp.employee_code,
        employeeName: emp.full_name,
        reason: 'PAN not provided (Higher TDS rate may apply under Section 206AA)',
      })
    }

    // Mandatory Timesheet Approval Gate
    const { searchParams } = new URL(request.url)
    const targetYear = parseInt(searchParams.get('year') || String(new Date().getFullYear()))
    const targetMonth = parseInt(searchParams.get('month') || String(new Date().getMonth() + 1))

    const { isTimesheetApprovedForPayroll } = await import('@/lib/services/timesheet-service')
    const tsCheck = await isTimesheetApprovedForPayroll(context.companyId, emp.id, targetYear, targetMonth)
    if (!tsCheck.approved) {
      blockers.push({
        employeeCode: emp.employee_code,
        employeeName: emp.full_name,
        reason: `Timesheet not approved for ${targetMonth}/${targetYear}: ${tsCheck.reason || 'Timesheet approval required before payroll'}`,
      })
      isEmpReady = false
    }

    // Check mid-period joiner
    if (emp.joining_date) {
      const joinDate = new Date(emp.joining_date)
      const now = new Date()
      if (joinDate.getMonth() === now.getMonth() && joinDate.getFullYear() === now.getFullYear()) {
        warnings.push({
          employeeCode: emp.employee_code,
          employeeName: emp.full_name,
          reason: `Mid-period joining on ${emp.joining_date} — salary will be automatically prorated.`,
        })
      }
    }

    if (isEmpReady) {
      readyCount++
    }
  }

  const isReady = blockers.length === 0

  return NextResponse.json({
    success: true,
    isReady,
    status: isReady ? 'READY' : 'ACTION_REQUIRED',
    totalActiveEmployees: employees.length,
    eligibleEmployees: readyCount,
    blockers,
    warnings,
    summary: isReady
      ? `All ${employees.length} active employees are configured for payroll processing.`
      : `${blockers.length} configuration blockers require resolution before payroll can be run.`,
  })
}
