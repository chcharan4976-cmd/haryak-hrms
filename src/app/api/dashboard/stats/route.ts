import { NextResponse } from 'next/server'
import {
  createAdminClient,
  isSupabaseConfigured,
} from '@/lib/supabase/admin'
import { resolveRequestContext } from '@/lib/services/company-resolver'

export async function GET() {
  try {
    // Resolve authenticated user's company
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

    // ---------------------------------------------------------
    // 1. ACTIVE EMPLOYEES
    // ---------------------------------------------------------
    const { data: emps, error: employeeError } = await supabase
      .from('employees')
      .select(
        `
        id,
        department_id,
        employment_status,
        is_active,
        departments:department_id(name)
      `,
      )
      .eq('company_id', companyId)
      .eq('is_active', true)

    if (employeeError) {
      throw new Error(
        `Unable to load employees: ${employeeError.message}`,
      )
    }

    const employees = emps || []

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

    // ---------------------------------------------------------
    // 2. DEPARTMENT DISTRIBUTION
    // ---------------------------------------------------------
    const departmentsMap: Record<string, number> = {}

    eligibleEmployees.forEach((employee: any) => {
      const departmentName =
        employee.departments?.name || 'Unassigned'

      departmentsMap[departmentName] =
        (departmentsMap[departmentName] || 0) + 1
    })

    const departmentList = Object.entries(
      departmentsMap,
    ).map(([name, count]) => ({
      name,
      count,
      percentage:
        totalEmployees > 0
          ? Math.round((count / totalEmployees) * 100)
          : 0,
      color: 'bg-[#1e2a78]',
    }))

    // ---------------------------------------------------------
    // 3. LEAVE TODAY
    // ---------------------------------------------------------
    const today = new Date()
      .toISOString()
      .split('T')[0]

    let onLeaveToday = 0

    if (totalEmployees > 0) {
      const { data: leaveData, error: leaveError } =
        await supabase
          .from('leave_requests')
          .select('id, employee_id')
          .eq('company_id', companyId)
          .eq('status', 'approved')
          .lte('start_date', today)
          .gte('end_date', today)

      if (leaveError) {
        throw new Error(
          `Unable to load leave requests: ${leaveError.message}`,
        )
      }

      onLeaveToday = (leaveData || []).filter(
        (leave: any) =>
          activeEmployeeIds.has(leave.employee_id),
      ).length
    }

    // ---------------------------------------------------------
    // 4. PENDING APPROVALS
    // ---------------------------------------------------------
    const {
      data: approvalData,
      error: approvalError,
    } = await supabase
      .from('approval_requests')
      .select('id')
      .eq('company_id', companyId)
      .eq('status', 'pending')

    if (approvalError) {
      throw new Error(
        `Unable to load approval requests: ${approvalError.message}`,
      )
    }

    const pendingApprovals =
      approvalData?.length || 0

    // ---------------------------------------------------------
    // 5. CURRENT ACTIVE SALARY TOTAL
    // ---------------------------------------------------------
    let estimatedGross = 0

    if (totalEmployees > 0) {
      const {
        data: salaries,
        error: salaryError,
      } = await supabase
        .from('salary_structures')
        .select('monthly_gross, employee_id')
        .eq('company_id', companyId)
        .eq('status', 'active')

      if (salaryError) {
        throw new Error(
          `Unable to load salary structures: ${salaryError.message}`,
        )
      }

      estimatedGross = (salaries || [])
        .filter((salary: any) =>
          activeEmployeeIds.has(salary.employee_id),
        )
        .reduce(
          (sum: number, salary: any) =>
            sum +
            (Number(salary.monthly_gross) || 0),
          0,
        )
    }

    // ---------------------------------------------------------
    // 6. PAYROLL ESTIMATES
    //
    // Historical payroll runs must NOT make the dashboard show
    // payroll values when there are no currently eligible
    // employees.
    // ---------------------------------------------------------
    let estimatedDeductions = 0
    let estimatedNet = 0

    if (totalEmployees > 0) {
      const {
        data: latestRun,
        error: payrollRunError,
      } = await supabase
        .from('payroll_runs')
        .select(
          'id, total_deductions, total_net, total_gross',
        )
        .eq('company_id', companyId)
        .order('created_at', {
          ascending: false,
        })
        .limit(1)
        .maybeSingle()

      if (payrollRunError) {
        throw new Error(
          `Unable to load latest payroll run: ${payrollRunError.message}`,
        )
      }

      if (latestRun) {
        estimatedDeductions =
          Number(latestRun.total_deductions) || 0

        estimatedNet =
          Number(latestRun.total_net) || 0

        /*
         * IMPORTANT:
         * Do not blindly use an old payroll gross if it belongs
         * to employees who are no longer part of the active
         * workforce.
         *
         * The salary-structure total above is the safest live
         * representation of the current eligible workforce.
         *
         * Historical payroll runs remain available elsewhere
         * for audit/history purposes.
         */
        if (estimatedGross === 0) {
          estimatedDeductions = 0
          estimatedNet = 0
        }
      } else {
        estimatedDeductions = 0
        estimatedNet = estimatedGross
      }
    }

    // Absolute safety rule:
    // zero eligible workforce = zero current payroll values.
    if (totalEmployees === 0) {
      estimatedGross = 0
      estimatedDeductions = 0
      estimatedNet = 0
    }

    // If active employees exist but no usable payroll net is
    // available yet, show current gross as the preliminary net
    // instead of stale historical data.
    if (
      totalEmployees > 0 &&
      estimatedGross > 0 &&
      estimatedNet === 0 &&
      estimatedDeductions === 0
    ) {
      estimatedNet = estimatedGross
    }

    // ---------------------------------------------------------
    // 7. RECENT AUDIT ACTIVITY
    // ---------------------------------------------------------
    const {
      data: logs,
      error: auditError,
    } = await supabase
      .from('audit_logs')
      .select(
        `
        id,
        user_name,
        description,
        action,
        entity_type,
        created_at
      `,
      )
      .eq('company_id', companyId)
      .order('created_at', {
        ascending: false,
      })
      .limit(5)

    if (auditError) {
      throw new Error(
        `Unable to load audit logs: ${auditError.message}`,
      )
    }

    const recentAuditLogs = (logs || []).map(
      (log: any) => ({
        id: log.id,
        actor: log.user_name || 'System',
        action:
          log.description ||
          log.action ||
          'Activity',
        target:
          log.entity_type || 'System',
        time: new Date(
          log.created_at,
        ).toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
        }),
      }),
    )

    // ---------------------------------------------------------
    // 8. CURRENT PAYROLL PERIOD STATUS
    // ---------------------------------------------------------
    const currentDate = new Date()
    const currentMonth =
      currentDate.getMonth() + 1
    const currentYear =
      currentDate.getFullYear()

    const {
      data: currentPeriod,
      error: periodError,
    } = await supabase
      .from('payroll_periods')
      .select('id, status')
      .eq('company_id', companyId)
      .eq('period_month', currentMonth)
      .eq('period_year', currentYear)
      .maybeSingle()

    if (periodError) {
      throw new Error(
        `Unable to load payroll period: ${periodError.message}`,
      )
    }

    const payrollStatus =
      totalEmployees > 0
        ? currentPeriod?.status || 'NOT_STARTED'
        : 'NOT_STARTED'

    // ---------------------------------------------------------
    // RESPONSE
    // ---------------------------------------------------------
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
    console.error(
      'Dashboard stats error:',
      error,
    )

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
    monthlyPayrollCost: 0,
    estimatedDeductions: 0,
    estimatedNet: 0,

    status: 'NOT_STARTED',

    departments: [],
    recentActivity: [],
  }
}