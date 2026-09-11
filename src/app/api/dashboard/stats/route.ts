import { NextResponse } from 'next/server'
import { createAdminClient, isSupabaseConfigured } from '@/lib/supabase/admin'
import { resolveRequestContext } from '@/lib/services/company-resolver'

export async function GET() {
  try {
    // Resolve authenticated user's company
    const resolution = await resolveRequestContext()
    if (!resolution.ok) {
      return NextResponse.json(
        { success: false, error: resolution.error.message },
        { status: resolution.error.status }
      )
    }
    const { companyId } = resolution.context

    if (!isSupabaseConfigured()) {
      return NextResponse.json({
        success: true,
        stats: emptyStats(),
      })
    }

    const supabase = createAdminClient()
    if (!supabase) {
      return NextResponse.json({
        success: true,
        stats: emptyStats(),
      })
    }

    // 1. Employees count — scoped by company_id
    const { data: emps } = await supabase
      .from('employees')
      .select('id, department_id, employment_status, is_active, departments:department_id(name)')
      .eq('company_id', companyId)
      .eq('is_active', true)

    const employees = emps || []
    const totalEmployees = employees.length
    const activeEmployees = employees.filter(
      (e: any) => e.employment_status === 'active' || e.employment_status === 'probation'
    ).length

    // Department distribution
    const departmentsMap: Record<string, number> = {}
    employees.forEach((e: any) => {
      const deptName = e.departments?.name || 'Unassigned'
      departmentsMap[deptName] = (departmentsMap[deptName] || 0) + 1
    })

    // 2. On leave today — real query
    const today = new Date().toISOString().split('T')[0]
    const { data: leaveData } = await supabase
      .from('leave_requests')
      .select('id')
      .eq('company_id', companyId)
      .eq('status', 'approved')
      .lte('start_date', today)
      .gte('end_date', today)

    const onLeaveToday = leaveData?.length || 0

    // 3. Pending approvals — real query
    const { data: approvalData } = await supabase
      .from('approval_requests')
      .select('id')
      .eq('company_id', companyId)
      .eq('status', 'pending')

    const pendingApprovals = approvalData?.length || 0

    // 4. Salary totals — scoped by company_id
    const { data: salaries } = await supabase
      .from('salary_structures')
      .select('monthly_gross, employee_id')
      .eq('company_id', companyId)
      .eq('status', 'active')

    let estimatedGross = 0
    if (salaries && salaries.length > 0) {
      // Only count active employees' salary structures
      const activeEmpIds = new Set(employees.map((e: any) => e.id))
      estimatedGross = salaries
        .filter((s: any) => activeEmpIds.has(s.employee_id))
        .reduce((sum: number, s: any) => sum + (Number(s.monthly_gross) || 0), 0)
    }

    // 5. Real deduction estimates from latest payroll run (if exists)
    let estimatedDeductions = 0
    let estimatedNet = 0
    const { data: latestRun } = await supabase
      .from('payroll_runs')
      .select('id, total_deductions, total_net, total_gross')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (latestRun) {
      estimatedDeductions = Number(latestRun.total_deductions) || 0
      estimatedNet = Number(latestRun.total_net) || 0
      // Use actual payroll gross if available
      if (Number(latestRun.total_gross) > 0) {
        estimatedGross = Number(latestRun.total_gross)
      }
    } else {
      // No payroll run yet — estimate from salary structures
      // Do NOT use fake formulas. Just show salary total without guessed deductions.
      estimatedDeductions = 0
      estimatedNet = estimatedGross
    }

    // 6. Recent audit logs — scoped by company_id
    const { data: logs } = await supabase
      .from('audit_logs')
      .select('id, user_name, description, action, entity_type, created_at')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(5)

    const recentAuditLogs = (logs || []).map((l: any) => ({
      id: l.id,
      actor: l.user_name || 'System',
      action: l.description || l.action,
      target: l.entity_type || 'System',
      time: new Date(l.created_at).toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
      }),
    }))

    // 7. Payroll status
    const currentMonth = new Date().getMonth() + 1
    const currentYear = new Date().getFullYear()
    const { data: currentPeriod } = await supabase
      .from('payroll_periods')
      .select('id, status')
      .eq('company_id', companyId)
      .eq('period_month', currentMonth)
      .eq('period_year', currentYear)
      .maybeSingle()

    const payrollStatus = currentPeriod?.status || (totalEmployees > 0 ? 'NOT_STARTED' : 'NOT_STARTED')

    const departmentList = Object.entries(departmentsMap).map(([name, count]) => ({
      name,
      count,
      percentage: totalEmployees > 0 ? Math.round((count / totalEmployees) * 100) : 0,
      color: 'bg-[#1e2a78]',
    }))

    return NextResponse.json({
      success: true,
      stats: {
        totalEmployees,
        activeEmployees,
        onLeaveToday,
        pendingApprovals,
        estimatedGross,
        monthlyPayrollCost: estimatedGross,
        estimatedDeductions,
        estimatedNet,
        status: payrollStatus,
        departments: departmentList,
        recentActivity: recentAuditLogs,
      },
    })
  } catch (error: any) {
    console.error('Dashboard stats error:', error)
    return NextResponse.json({
      success: false,
      stats: emptyStats(),
    })
  }
}

function emptyStats() {
  return {
    totalEmployees: 0,
    activeEmployees: 0,
    onLeaveToday: 0,
    pendingApprovals: 0,
    estimatedGross: 0,
    estimatedDeductions: 0,
    estimatedNet: 0,
    status: 'NOT_STARTED',
    departments: [],
    recentActivity: [],
  }
}
