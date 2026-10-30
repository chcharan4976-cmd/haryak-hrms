import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveRequestContext, resolveEmployeeAccess } from '@/lib/services/company-resolver'
import { getEmployeeAnnualLeaveSummary, DEFAULT_ANNUAL_PAID_LEAVE_DAYS } from '@/lib/services/leave-policy-service'
import { getEmployeeAnnualCompensationLedger } from '@/lib/services/leave-compensation-ledger-service'

export async function GET(request: NextRequest) {
  const resolved = await resolveRequestContext()
  if (!resolved.ok) return NextResponse.json({ success: false, error: resolved.error.message }, { status: resolved.error.status })
  const { context } = resolved

  const { searchParams } = new URL(request.url)
  const queryEmployeeId = searchParams.get('employee_id')

  const today = new Date()
  const calendarYear = today.getFullYear()
  const yearParam = searchParams.get('year') || searchParams.get('fiscal_year')
  const year = parseInt(yearParam || calendarYear.toString(), 10)

  const access = resolveEmployeeAccess(context, queryEmployeeId)
  if (access.denied) return NextResponse.json({ success: false, error: access.message }, { status: 403 })

  const supabase = createAdminClient()
  if (!supabase) return NextResponse.json({ success: false, error: 'DB unavailable' }, { status: 503 })

  let query = supabase
    .from('leave_balances')
    .select('*, leave_types(*), employees!inner(id, company_id, full_name, employee_code)')
    .eq('employees.company_id', context.companyId)
    .eq('fiscal_year', year)

  if (access.employeeId) {
    query = query.eq('employee_id', access.employeeId)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

  let formattedBalances = (data || []).map((b: any) => ({
    id: b.id,
    employee_id: b.employee_id,
    leave_type_id: b.leave_type_id,
    type: b.leave_types?.name || 'Leave',
    code: b.leave_types?.code || '',
    leave_type: b.leave_types?.name || 'Leave',
    color: b.leave_types?.color || '#3B82F6',
    opening_balance: Number(b.opening_balance || 0),
    accrued: Number(b.accrued || 0),
    used: Number(b.used || 0),
    allocated: Number(b.opening_balance || 0) + Number(b.accrued || 0),
    remaining: Number(b.closing_balance || 0),
    closing_balance: Number(b.closing_balance || 0),
    total_accrued: Number(b.opening_balance || 0) + Number(b.accrued || 0),
    used_balance: Number(b.used || 0),
    remaining_balance: Number(b.closing_balance || 0),
    fiscal_year: b.fiscal_year,
  }))

  let summary: any = null
  let compensationLedger: any = null
  if (access.employeeId) {
    summary = await getEmployeeAnnualLeaveSummary(context.companyId, access.employeeId, year)
    compensationLedger = await getEmployeeAnnualCompensationLedger(context.companyId, access.employeeId, year)

    // Ensure Annual Paid Leave balance card is always present and accurate with 11-day entitlement
    const hasPaidLeaveCard = formattedBalances.some(
      b => b.code === 'PL' || b.code === 'AL' || b.leave_type?.toLowerCase().includes('annual') || b.leave_type?.toLowerCase().includes('paid')
    )

    if (!hasPaidLeaveCard) {
      formattedBalances.unshift({
        id: `canonical-annual-paid-leave-${access.employeeId}-${year}`,
        employee_id: access.employeeId,
        leave_type_id: 'canonical-pl',
        type: 'Annual Paid Leave',
        code: 'PL',
        leave_type: 'Annual Paid Leave',
        color: '#10B981',
        opening_balance: summary.annualEntitlement,
        accrued: 0,
        used: summary.paidLeaveUsed,
        allocated: summary.annualEntitlement,
        remaining: summary.paidLeaveRemaining,
        closing_balance: summary.paidLeaveRemaining,
        total_accrued: summary.annualEntitlement,
        used_balance: summary.paidLeaveUsed,
        remaining_balance: summary.paidLeaveRemaining,
        fiscal_year: year,
      })
    } else {
      formattedBalances = formattedBalances.map(b => {
        if (b.code === 'PL' || b.code === 'AL' || b.leave_type?.toLowerCase().includes('annual') || b.leave_type?.toLowerCase().includes('paid')) {
          return {
            ...b,
            opening_balance: summary.annualEntitlement,
            allocated: summary.annualEntitlement,
            total_accrued: summary.annualEntitlement,
            used: summary.paidLeaveUsed,
            used_balance: summary.paidLeaveUsed,
            remaining: summary.paidLeaveRemaining,
            remaining_balance: summary.paidLeaveRemaining,
            closing_balance: summary.paidLeaveRemaining,
          }
        }
        return b
      })
    }
  }

  let employeeSummaries: any[] = []
  if (!access.employeeId) {
    const { data: employees } = await supabase
      .from('employees')
      .select('id, full_name, employee_code, department_id, departments:department_id(name)')
      .eq('company_id', context.companyId)
      .eq('is_active', true)
      .order('full_name', { ascending: true })

    if (employees) {
      for (const emp of employees) {
        const empSummary = await getEmployeeAnnualLeaveSummary(context.companyId, emp.id, year)
        employeeSummaries.push({
          employee_id: emp.id,
          employee_name: emp.full_name,
          employee_code: emp.employee_code,
          department_name: (emp.departments as any)?.name || 'General',
          annual_entitlement: empSummary.annualEntitlement,
          paid_leave_used: empSummary.paidLeaveUsed,
          paid_leave_remaining: empSummary.paidLeaveRemaining,
          unpaid_leave_lop: empSummary.unpaidLeaveLop,
          company_holidays_count: empSummary.companyHolidaysCount,
          leave_history: empSummary.leaveHistory,
        })
      }
    }
  }

  return NextResponse.json({
    success: true,
    balances: formattedBalances,
    data: formattedBalances,
    employee_summaries: employeeSummaries,
    policy: {
      annual_paid_leave_entitlement: DEFAULT_ANNUAL_PAID_LEAVE_DAYS,
      public_holidays_separate: true,
      deduction_formula: 'Daily Rate = Monthly Gross / Scheduled Working Days',
      model: 'MONTHLY_DEDUCTION_ANNUAL_COMPENSATION',
    },
    summary,
    compensation_ledger: compensationLedger,
  })
}
