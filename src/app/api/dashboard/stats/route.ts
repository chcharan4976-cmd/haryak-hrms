import { NextResponse } from 'next/server'

import {
  createAdminClient,
  isSupabaseConfigured,
} from '@/lib/supabase/admin'

import { resolveRequestContext } from '@/lib/services/company-resolver'

export async function GET() {
  try {
    // ============================================================
    // 1. AUTHENTICATED COMPANY CONTEXT
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

    const { companyId } = resolution.context

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
      throw new Error(
        `Unable to load employees: ${employeeError.message}`,
      )
    }

    const employees = employeeData || []

    const eligibleEmployees = employees.filter(
      (employee: any) =>
        employee.employment_status === 'active' ||
        employee.employment_status === 'probation',
    )

    const totalEmployees = eligibleEmployees.length

    const activeEmployees = totalEmployees

    const activeEmployeeIds = new Set(
      eligibleEmployees.map(
        (employee: any) => employee.id,
      ),
    )

    // ============================================================
    // 4. DEPARTMENT DISTRIBUTION
    // ============================================================

    const departmentsMap: Record<string, number> = {}

    eligibleEmployees.forEach((employee: any) => {
      const departmentName =
        employee.departments?.name ||
        'Unassigned'

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
          ? Math.round(
              (count / totalEmployees) * 100,
            )
          : 0,

      color: 'bg-[#1e2a78]',
    }))

    // ============================================================
    // 5. APPROVED LEAVE TODAY
    // ============================================================

    const today =
      new Date()
        .toISOString()
        .split('T')[0]

    let onLeaveToday = 0

    if (totalEmployees > 0) {
      const {
        data: leaveData,
        error: leaveError,
      } = await supabase
        .from('leave_requests')
        .select(
          'id, employee_id',
        )
        .eq(
          'company_id',
          companyId,
        )
        .eq(
          'status',
          'approved',
        )
        .lte(
          'start_date',
          today,
        )
        .gte(
          'end_date',
          today,
        )

      if (leaveError) {
        throw new Error(
          `Unable to load leave requests: ${leaveError.message}`,
        )
      }

      onLeaveToday =
        (leaveData || []).filter(
          (leave: any) =>
            activeEmployeeIds.has(
              leave.employee_id,
            ),
        ).length
    }

    // ============================================================
    // 6. LIVE PENDING APPROVALS
    // ============================================================
    //
    // IMPORTANT:
    //
    // Dashboard approvals must represent the SAME live workflows
    // that the Authorization & Approvals Queue displays.
    //
    // Current approval sources:
    //
    // 1. Pending leave requests
    //
    // 2. Timesheets with:
    //      SUBMITTED
    //      UNDER_REVIEW
    //
    // We DO NOT use the old approval_requests table as the
    // dashboard authority because that caused the Dashboard
    // to show 0 while the Approvals Queue showed pending items.
    // ============================================================

    const [
      pendingLeaveResult,
      pendingTimesheetResult,
    ] = await Promise.all([
      supabase
        .from('leave_requests')
        .select(
          'id',
          {
            count: 'exact',
            head: true,
          },
        )
        .eq(
          'company_id',
          companyId,
        )
        .eq(
          'status',
          'pending',
        ),

      supabase
        .from('timesheets')
        .select(
          'id',
          {
            count: 'exact',
            head: true,
          },
        )
        .eq(
          'company_id',
          companyId,
        )
        .in(
          'status',
          [
            'SUBMITTED',
            'UNDER_REVIEW',
          ],
        ),
    ])

    if (pendingLeaveResult.error) {
      throw new Error(
        `Unable to load pending leave approvals: ${pendingLeaveResult.error.message}`,
      )
    }

    if (pendingTimesheetResult.error) {
      throw new Error(
        `Unable to load pending timesheet approvals: ${pendingTimesheetResult.error.message}`,
      )
    }

    const pendingLeaveApprovals =
      pendingLeaveResult.count || 0

    const pendingTimesheetApprovals =
      pendingTimesheetResult.count || 0

    const pendingApprovals =
      pendingLeaveApprovals +
      pendingTimesheetApprovals

    // ============================================================
    // 7. CURRENT PAYROLL PERIOD
    // ============================================================

    const currentDate =
      new Date()

    const currentMonth =
      currentDate.getMonth() + 1

    const currentYear =
      currentDate.getFullYear()

    const {
      data: currentPeriod,
      error: periodError,
    } = await supabase
      .from('payroll_periods')
      .select(
        'id, status',
      )
      .eq(
        'company_id',
        companyId,
      )
      .eq(
        'period_month',
        currentMonth,
      )
      .eq(
        'period_year',
        currentYear,
      )
      .maybeSingle()

    if (periodError) {
      throw new Error(
        `Unable to load payroll period: ${periodError.message}`,
      )
    }

    const payrollStatus =
      totalEmployees > 0
        ? currentPeriod?.status ||
          'NOT_STARTED'
        : 'NOT_STARTED'

    // ============================================================
    // 8. CURRENT ACTIVE SALARY STRUCTURE TOTAL
    // ============================================================
    //
    // This is used as the preliminary payroll estimate only when
    // the current payroll period has NOT yet produced a payroll run.
    // ============================================================

    let salaryStructureGross = 0

    if (totalEmployees > 0) {
      const {
        data: salaryData,
        error: salaryError,
      } = await supabase
        .from('salary_structures')
        .select(
          'monthly_gross, employee_id',
        )
        .eq(
          'company_id',
          companyId,
        )
        .eq(
          'status',
          'active',
        )

      if (salaryError) {
        throw new Error(
          `Unable to load salary structures: ${salaryError.message}`,
        )
      }

      salaryStructureGross =
        (salaryData || [])
          .filter(
            (salary: any) =>
              activeEmployeeIds.has(
                salary.employee_id,
              ),
          )
          .reduce(
            (
              sum: number,
              salary: any,
            ) =>
              sum +
              (
                Number(
                  salary.monthly_gross,
                ) || 0
              ),
            0,
          )
    }

    // ============================================================
    // 9. CURRENT PAYROLL TOTALS
    // ============================================================
    //
    // CRITICAL DATA CONSISTENCY RULE
    //
    // Gross
    // Deductions
    // Net
    //
    // MUST come from the same payroll source.
    //
    // OLD BEHAVIOUR:
    //
    // Current salary structure gross
    // +
    // latest historical payroll deductions/net
    //
    // This could produce:
    //
    // Gross       ₹57,600
    // Deductions  ₹0
    // Net         ₹62,833
    //
    // which is internally inconsistent.
    //
    // NEW BEHAVIOUR:
    //
    // If a payroll run exists for the CURRENT payroll period,
    // use all three values from that same run.
    //
    // Otherwise:
    //
    // Gross       = active salary structures
    // Deductions  = 0
    // Net         = Gross
    //
    // until payroll is actually calculated.
    // ============================================================

    let estimatedGross =
      salaryStructureGross

    let estimatedDeductions = 0

    let estimatedNet =
      salaryStructureGross

    if (
      totalEmployees > 0 &&
      currentPeriod?.id
    ) {
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
        .eq(
          'company_id',
          companyId,
        )
        .eq(
          'payroll_period_id',
          currentPeriod.id,
        )
        .order(
          'created_at',
          {
            ascending: false,
          },
        )
        .limit(1)
        .maybeSingle()

      if (payrollRunError) {
        throw new Error(
          `Unable to load current payroll run: ${payrollRunError.message}`,
        )
      }

      if (latestCurrentRun) {
        estimatedGross =
          Number(
            latestCurrentRun.total_gross,
          ) || 0

        estimatedDeductions =
          Number(
            latestCurrentRun.total_deductions,
          ) || 0

        estimatedNet =
          Number(
            latestCurrentRun.total_net,
          ) || 0
      }
    }

    // ============================================================
    // 10. ZERO-WORKFORCE SAFETY
    // ============================================================

    if (totalEmployees === 0) {
      estimatedGross = 0
      estimatedDeductions = 0
      estimatedNet = 0
    }

    // ============================================================
    // 11. RECENT SYSTEM / AUDIT ACTIVITY
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
      .eq(
        'company_id',
        companyId,
      )
      .order(
        'created_at',
        {
          ascending: false,
        },
      )
      .limit(5)

    if (auditError) {
      throw new Error(
        `Unable to load audit logs: ${auditError.message}`,
      )
    }

    const recentAuditLogs =
      (auditData || []).map(
        (log: any) => ({
          id:
            log.id,

          actor:
            log.user_name ||
            'System',

          action:
            log.description ||
            log.action ||
            'Activity',

          target:
            log.entity_type ||
            'System',

          time:
            new Date(
              log.created_at,
            ).toLocaleTimeString(
              'en-IN',
              {
                hour:
                  '2-digit',

                minute:
                  '2-digit',

                timeZone:
                  'Asia/Kolkata',
              },
            ),
        }),
      )

    // ============================================================
    // 12. FINAL DASHBOARD RESPONSE
    // ============================================================

    return NextResponse.json({
      success: true,

      stats: {
        // --------------------------------------------------------
        // WORKFORCE
        // --------------------------------------------------------

        totalEmployees,

        activeEmployees,

        onLeaveToday,

        // --------------------------------------------------------
        // APPROVALS
        // --------------------------------------------------------

        pendingApprovals,

        // --------------------------------------------------------
        // PAYROLL
        // --------------------------------------------------------

        estimatedGross,

        monthlyPayrollCost:
          estimatedGross,

        estimatedDeductions,

        estimatedNet,

        status:
          payrollStatus,

        // --------------------------------------------------------
        // ORGANIZATION
        // --------------------------------------------------------

        departments:
          departmentList,

        // --------------------------------------------------------
        // AUDIT
        // --------------------------------------------------------

        recentActivity:
          recentAuditLogs,
      },
    })
  } catch (error: any) {
    console.error(
      'Dashboard stats error:',
      error,
    )

    return NextResponse.json(
      {
        success: false,

        error:
          error?.message ||
          'Unable to load dashboard statistics.',

        stats:
          emptyStats(),
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

    status:
      'NOT_STARTED',

    departments: [],

    recentActivity: [],
  }
}