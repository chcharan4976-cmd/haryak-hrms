import { NextResponse } from 'next/server'
import {
  createAdminClient,
  isSupabaseConfigured,
} from '@/lib/supabase/admin'
import { resolveRequestContext } from '@/lib/services/company-resolver'

export async function GET() {
  try {
    // ============================================================
    // 1. AUTHENTICATED COMPANY CONTEXT & AUTHORIZATION
    // ============================================================

    const resolution = await resolveRequestContext()

    if (!resolution.ok) {
      return NextResponse.json(
        {
          success: false,
          error: resolution.error.message,
        },
        {
          status: resolution.error.status,
        },
      )
    }

    const { companyId, roles } = resolution.context

    // Enforce role authorization: only administrators can access executive dashboard stats
    const userRoles = roles || []
    const hasAdminAccess = userRoles.some((role) =>
      ['SUPER_ADMIN', 'HR_ADMIN', 'PAYROLL_ADMIN', 'ADMINISTRATION'].includes(role)
    )

    if (!hasAdminAccess) {
      return NextResponse.json(
        {
          success: false,
          error: 'Access denied: Administrator privileges required to view dashboard statistics.',
        },
        {
          status: 403,
        },
      )
    }

    // ============================================================
    // 2. SUPABASE AVAILABILITY
    // ============================================================

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

    // ============================================================
    // 3. ACTIVE / PAYROLL-ELIGIBLE EMPLOYEES
    // ============================================================

    let employees: any[] = []
    const {
      data: employeeData,
      error: employeeError,
    } = await supabase
      .from('employees')
      .select(`
        id,
        department_id,
        employment_status,
        is_active,
        departments:department_id(name)
      `)
      .eq('company_id', companyId)
      .eq('is_active', true)

    if (employeeError) {
      console.error('[DashboardStats] Unable to load employees:', employeeError.message)
    } else if (employeeData) {
      employees = employeeData
    }

    const eligibleEmployees = employees.filter(
      (employee: any) =>
        employee.employment_status === 'active' ||
        employee.employment_status === 'probation',
    )

    const totalEmployees = eligibleEmployees.length
    const activeEmployees = totalEmployees

    const activeEmployeeIds = new Set(
      eligibleEmployees.map((employee: any) => employee.id),
    )

    // ============================================================
    // 4. DEPARTMENT DISTRIBUTION
    // ============================================================

    const departmentsMap: Record<string, number> = {}

    eligibleEmployees.forEach((employee: any) => {
      const departmentName =
        (Array.isArray(employee.departments)
          ? employee.departments[0]?.name
          : employee.departments?.name) ||
        'Unassigned'

      departmentsMap[departmentName] =
        (departmentsMap[departmentName] || 0) + 1
    })

    const departmentList = Object.entries(departmentsMap).map(([name, count]) => ({
      name,
      count,
      percentage:
        totalEmployees > 0
          ? Math.round((count / totalEmployees) * 100)
          : 0,
      color: 'bg-[#1e2a78]',
    }))

    // ============================================================
    // 5. APPROVED LEAVE TODAY
    // ============================================================

    const today = new Date().toISOString().split('T')[0]
    let onLeaveToday = 0

    if (totalEmployees > 0) {
      const {
        data: leaveData,
        error: leaveError,
      } = await supabase
        .from('leave_requests')
        .select('id, employee_id')
        .eq('company_id', companyId)
        .eq('status', 'approved')
        .lte('start_date', today)
        .gte('end_date', today)

      if (leaveError) {
        console.error('[DashboardStats] Unable to load leave requests:', leaveError.message)
      } else if (leaveData) {
        onLeaveToday = leaveData.filter((leave: any) =>
          activeEmployeeIds.has(leave.employee_id),
        ).length
      }
    }

    // ============================================================
    // 6. LIVE PENDING APPROVALS
    // ============================================================

    const [
      pendingLeaveResult,
      pendingTimesheetResult,
    ] = await Promise.all([
      supabase
        .from('leave_requests')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .eq('status', 'pending'),

      supabase
        .from('timesheets')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .in('status', ['SUBMITTED', 'UNDER_REVIEW']),
    ])

    if (pendingLeaveResult.error) {
      console.error('[DashboardStats] Unable to load pending leave approvals:', pendingLeaveResult.error.message)
    }

    if (pendingTimesheetResult.error) {
      console.error('[DashboardStats] Unable to load pending timesheet approvals:', pendingTimesheetResult.error.message)
    }

    const pendingLeaveApprovals = pendingLeaveResult.count || 0
    const pendingTimesheetApprovals = pendingTimesheetResult.count || 0
    const pendingApprovals = pendingLeaveApprovals + pendingTimesheetApprovals

    // ============================================================
    // 7. CURRENT PAYROLL PERIOD
    // ============================================================

    const currentDate = new Date()
    const currentMonth = currentDate.getMonth() + 1
    const currentYear = currentDate.getFullYear()

    const {
      data: currentPeriod,
      error: periodError,
    } = await supabase
      .from('payroll_periods')
      .select('id, status')
      .eq('company_id', companyId)
      .eq('period_month', currentMonth)
      .eq('period_year', currentYear)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (periodError) {
      console.error('[DashboardStats] Unable to load payroll period:', periodError.message)
    }

    const payrollStatus =
      totalEmployees > 0
        ? currentPeriod?.status || 'NOT_STARTED'
        : 'NOT_STARTED'

    // ============================================================
    // 8. SALARY STRUCTURE TOTALS & CURRENT PAYROLL ESTIMATES
    // ============================================================

    let salaryStructureGross = 0

    if (totalEmployees > 0) {
      const {
        data: salaryData,
        error: salaryError,
      } = await supabase
        .from('salary_structures')
        .select('monthly_gross, employee_id')
        .eq('company_id', companyId)
        .eq('status', 'active')

      if (salaryError) {
        console.error('[DashboardStats] Unable to load salary structures:', salaryError.message)
      } else if (salaryData) {
        salaryStructureGross = salaryData
          .filter((salary: any) => activeEmployeeIds.has(salary.employee_id))
          .reduce(
            (sum: number, salary: any) => sum + (Number(salary.monthly_gross) || 0),
            0,
          )
      }
    }

    let estimatedGross = salaryStructureGross
    let estimatedDeductions = 0
    let estimatedNet = salaryStructureGross

    if (totalEmployees > 0 && currentPeriod?.id) {
      const {
        data: latestCurrentRun,
        error: payrollRunError,
      } = await supabase
        .from('payroll_runs')
        .select(`
          id,
          total_gross,
          total_deductions,
          total_net,
          created_at
        `)
        .eq('company_id', companyId)
        .eq('payroll_period_id', currentPeriod.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (payrollRunError) {
        console.error('[DashboardStats] Unable to load current payroll run:', payrollRunError.message)
      } else if (latestCurrentRun) {
        estimatedGross = Number(latestCurrentRun.total_gross) || 0
        estimatedDeductions = Number(latestCurrentRun.total_deductions) || 0
        estimatedNet = Number(latestCurrentRun.total_net) || 0
      }
    }

    if (totalEmployees === 0) {
      estimatedGross = 0
      estimatedDeductions = 0
      estimatedNet = 0
    }

    // ============================================================
    // 9. RECENT SYSTEM / AUDIT ACTIVITY
    // ============================================================

    const {
      data: auditData,
      error: auditError,
    } = await supabase
      .from('audit_logs')
      .select(`
        id,
        user_name,
        description,
        action,
        entity_type,
        created_at
      `)
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(5)

    if (auditError) {
      console.error('[DashboardStats] Unable to load audit logs:', auditError.message)
    }

    const recentAuditLogs = (auditData || []).map((log: any) => {
      let formattedTime = 'Recently'
      if (log.created_at) {
        try {
          const d = new Date(log.created_at)
          if (!isNaN(d.getTime())) {
            formattedTime = d.toLocaleTimeString('en-IN', {
              hour: '2-digit',
              minute: '2-digit',
              timeZone: 'Asia/Kolkata',
            })
          }
        } catch {
          formattedTime = 'Recently'
        }
      }

      return {
        id: log.id || `audit-${Math.random()}`,
        actor: log.user_name || 'System',
        action: log.description || log.action || 'Activity',
        target: log.entity_type || 'System',
        time: formattedTime,
      }
    })

    // ============================================================
    // 10. FINAL DASHBOARD RESPONSE
    // ============================================================

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
    // Log server-side diagnostic error only. Never expose sensitive schema/credentials to client.
    console.error('[DashboardStats] Internal server failure:', error)

    return NextResponse.json(
      {
        success: false,
        error: 'Unable to load dashboard statistics. Please try again later.',
        stats: emptyStats(),
      },
      {
        status: 500,
      },
    )
  }
}

// ============================================================
// EMPTY / SAFE DASHBOARD STATE
// ============================================================

function emptyStats() {
  return {
    totalEmployees: 0,
    activeEmployees: 0,
    onLeaveToday: 0,
    pendingApprovals: 0,
    estimatedGross: 0,
    monthlyPayrollCost: 0,
    estimatedDeductions: 0,
    estimatedNet: 0,
    status: 'NOT_STARTED',
    departments: [],
    recentActivity: [],
  }
}