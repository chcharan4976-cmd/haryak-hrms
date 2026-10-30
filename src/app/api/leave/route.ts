import {
  NextRequest,
  NextResponse,
} from 'next/server'

import {
  createAdminClient,
} from '@/lib/supabase/admin'

import {
  resolveRequestContext,
  resolveEmployeeAccess,
  isAdmin,
} from '@/lib/services/company-resolver'

export async function GET(
  request: NextRequest
) {
  const resolved =
    await resolveRequestContext()

  if (!resolved.ok) {
    return NextResponse.json(
      {
        success: false,
        error:
          resolved.error.message,
      },
      {
        status:
          resolved.error.status,
      }
    )
  }

  const { context } = resolved

  const { searchParams } =
    new URL(request.url)

  const queryEmployeeId =
    searchParams.get(
      'employee_id'
    )

  const status =
    searchParams.get('status')

  const access =
    resolveEmployeeAccess(
      context,
      queryEmployeeId
    )

  if (access.denied) {
    return NextResponse.json(
      {
        success: false,
        error: access.message,
      },
      {
        status: 403,
      }
    )
  }

  const supabase =
    createAdminClient()

  if (!supabase) {
    return NextResponse.json(
      {
        success: false,
        error:
          'DB unavailable',
      },
      {
        status: 503,
      }
    )
  }

  let query = supabase
    .from('leave_requests')
    .select(`
      *,
      leave_types(*),
      employees(
        id,
        full_name,
        employee_code,
        departments:department_id(name)
      )
    `)
    .eq(
      'company_id',
      context.companyId
    )
    .order(
      'applied_at',
      {
        ascending: false,
      }
    )

  if (access.employeeId) {
    query = query.eq(
      'employee_id',
      access.employeeId
    )
  }

  if (status) {
    query = query.eq(
      'status',
      status.toLowerCase()
    )
  }

  const {
    data,
    error,
  } = await query

  if (error) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      {
        status: 500,
      }
    )
  }

  const formattedRequests =
    (data || []).map(
      (request: any) => ({
        id:
          request.id,

        employee_id:
          request.employee_id,

        leave_type_id:
          request.leave_type_id,

        leave_type:
          request.leave_types
            ?.name ||
          'Leave',

        leave_type_code:
          request.leave_types
            ?.code ||
          '',

        start_date:
          request.start_date,

        end_date:
          request.end_date,

        total_days:
          Number(
            request.total_days
          ),

        days:
          Number(
            request.total_days
          ),

        reason:
          request.reason ||
          '',

        status:
          request.status ===
          'approved'
            ? 'Approved'
            : request.status ===
                'rejected'
              ? 'Rejected'
              : request.status ===
                  'cancelled'
                ? 'Cancelled'
                : 'Pending',

        applied_at:
          request.applied_at ||
          request.created_at,

        created_at:
          request.created_at,

        approved_at:
          request.approved_at,

        rejection_reason:
          request.rejection_reason,

        employee_name:
          request.employees
            ?.full_name ||
          'Employee',

        employee_code:
          request.employees
            ?.employee_code ||
          '',

        department:
          request.employees
            ?.departments
            ?.name ||
          '',

        employee:
          request.employees
            ? {
                id:
                  request.employees
                    .id,

                name:
                  request.employees
                    .full_name,

                code:
                  request.employees
                    .employee_code,

                department:
                  request.employees
                    .departments
                    ?.name ||
                  '',
              }
            : null,
      })
    )

  return NextResponse.json({
    success: true,
    requests:
      formattedRequests,
    data:
      formattedRequests,
    total:
      formattedRequests.length,
  })
}

export async function POST(
  request: NextRequest
) {
  const resolved =
    await resolveRequestContext()

  if (!resolved.ok) {
    return NextResponse.json(
      {
        success: false,
        error:
          resolved.error.message,
      },
      {
        status:
          resolved.error.status,
      }
    )
  }

  const { context } = resolved

  const body =
    await request.json()

  const employee_id = body.employee_id || body.employeeId
  const leave_type_id = body.leave_type_id || body.leaveTypeId
  const start_date = body.start_date || body.startDate
  const end_date = body.end_date || body.endDate
  const total_days = body.total_days ?? body.totalDays
  const reason = body.reason

  const employeeOnly =
    context.roles.every(
      role =>
        role === 'EMPLOYEE'
    )

  const targetEmployeeId =
    employee_id ||
    (
      employeeOnly
        ? context.employeeId
        : null
    )

  if (!targetEmployeeId) {
    return NextResponse.json(
      {
        success: false,
        error:
          'Employee is required.',
      },
      {
        status: 400,
      }
    )
  }

  const access =
    resolveEmployeeAccess(
      context,
      targetEmployeeId
    )

  if (
    access.denied ||
    (
      access.employeeId &&
      access.employeeId !==
        targetEmployeeId
    )
  ) {
    return NextResponse.json(
      {
        success: false,
        error: 'Forbidden',
      },
      {
        status: 403,
      }
    )
  }

  if (
    !start_date ||
    !end_date
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          'Start date and end date are required.',
      },
      {
        status: 400,
      }
    )
  }

  const start =
    new Date(
      `${start_date}T00:00:00Z`
    )

  const end =
    new Date(
      `${end_date}T00:00:00Z`
    )

  if (
    Number.isNaN(
      start.getTime()
    ) ||
    Number.isNaN(
      end.getTime()
    )
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          'Invalid leave dates.',
      },
      {
        status: 400,
      }
    )
  }

  if (
    end.getTime() <
    start.getTime()
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          'End date cannot be before start date.',
      },
      {
        status: 400,
      }
    )
  }

  const supabase =
    createAdminClient()

  if (!supabase) {
    return NextResponse.json(
      {
        success: false,
        error:
          'DB unavailable',
      },
      {
        status: 503,
      }
    )
  }

  /*
   * Validate that the target employee is
   * currently part of the company workforce.
   */
  const {
    data: employee,
    error: employeeError,
  } = await supabase
    .from('employees')
    .select(`
      id,
      is_active,
      employment_status
    `)
    .eq(
      'company_id',
      context.companyId
    )
    .eq(
      'id',
      targetEmployeeId
    )
    .maybeSingle()

  if (employeeError) {
    return NextResponse.json(
      {
        success: false,
        error:
          employeeError.message,
      },
      {
        status: 500,
      }
    )
  }

  if (
    !employee ||
    !employee.is_active ||
    ![
      'active',
      'probation',
    ].includes(
      String(
        employee.employment_status
      ).toLowerCase()
    )
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          'Leave requests can only be submitted for an active employee.',
      },
      {
        status: 400,
      }
    )
  }

  // ---------------------------------------------------------
  // RESOLVE LEAVE TYPE
  // ---------------------------------------------------------

  let resolvedLeaveTypeId =
    leave_type_id

  if (
    leave_type_id &&
    !String(
      leave_type_id
    ).includes('-')
  ) {
    const {
      data: leaveType,
    } = await supabase
      .from('leave_types')
      .select('id')
      .eq(
        'company_id',
        context.companyId
      )
      .eq(
        'is_active',
        true
      )
      .ilike(
        'code',
        String(
          leave_type_id
        )
      )
      .maybeSingle()

    if (leaveType) {
      resolvedLeaveTypeId =
        leaveType.id
    }
  }

  if (
    !resolvedLeaveTypeId
  ) {
    const {
      data: defaultType,
    } = await supabase
      .from('leave_types')
      .select('id')
      .eq(
        'company_id',
        context.companyId
      )
      .eq(
        'is_active',
        true
      )
      .order(
        'created_at',
        {
          ascending: true,
        }
      )
      .limit(1)
      .maybeSingle()

    resolvedLeaveTypeId =
      defaultType?.id
  }

  if (
    !resolvedLeaveTypeId
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          'No active leave type is configured.',
      },
      {
        status: 400,
      }
    )
  }

  const calculatedDays =
    Math.floor(
      (
        end.getTime() -
        start.getTime()
      ) /
        86400000
    ) + 1

  const days =
    Number(total_days) > 0
      ? Number(total_days)
      : calculatedDays

  const {
    data,
    error,
  } = await supabase
    .from('leave_requests')
    .insert({
      company_id:
        context.companyId,

      employee_id:
        targetEmployeeId,

      leave_type_id:
        resolvedLeaveTypeId,

      start_date,

      end_date,

      total_days:
        days,

      reason:
        String(
          reason || ''
        ).trim(),

      status:
        'pending',
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      {
        status: 500,
      }
    )
  }

  return NextResponse.json({
    success: true,
    request: data,
    data,
  })
}

export async function PUT(
  request: NextRequest
) {
  const resolved =
    await resolveRequestContext()

  if (!resolved.ok) {
    return NextResponse.json(
      {
        success: false,
        error:
          resolved.error.message,
      },
      {
        status:
          resolved.error.status,
      }
    )
  }

  const { context } = resolved

  if (
    !isAdmin(context) &&
    !context.roles.includes(
      'MANAGER'
    )
  ) {
    return NextResponse.json(
      {
        success: false,
        error: 'Forbidden',
      },
      {
        status: 403,
      }
    )
  }

  const body =
    await request.json()

  const {
    id,
    status,
    rejection_reason,
  } = body

  if (!id || !status) {
    return NextResponse.json(
      {
        success: false,
        error:
          'Missing id or status',
      },
      {
        status: 400,
      }
    )
  }

  const normalizedStatus =
    String(status)
      .trim()
      .toLowerCase()

  if (
    ![
      'approved',
      'rejected',
    ].includes(
      normalizedStatus
    )
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          'Status must be approved or rejected.',
      },
      {
        status: 400,
      }
    )
  }

  const supabase =
    createAdminClient()

  if (!supabase) {
    return NextResponse.json(
      {
        success: false,
        error:
          'DB unavailable',
      },
      {
        status: 503,
      }
    )
  }

  // ---------------------------------------------------------
  // LOAD CURRENT REQUEST FIRST
  // ---------------------------------------------------------

  const {
    data: currentRequest,
    error: currentError,
  } = await supabase
    .from('leave_requests')
    .select(`
      *,
      leave_types(*)
    `)
    .eq(
      'id',
      id
    )
    .eq(
      'company_id',
      context.companyId
    )
    .maybeSingle()

  if (currentError) {
    return NextResponse.json(
      {
        success: false,
        error:
          currentError.message,
      },
      {
        status: 500,
      }
    )
  }

  if (!currentRequest) {
    return NextResponse.json(
      {
        success: false,
        error:
          'Leave request not found.',
      },
      {
        status: 404,
      }
    )
  }

  const currentStatus =
    String(
      currentRequest.status ||
        ''
    ).toLowerCase()

  /*
   * Critical payroll/leave safety:
   * approval must happen only once.
   *
   * This prevents double deduction from
   * leave_balances.
   */
  if (
    currentStatus !== 'pending'
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          `This leave request is already ${currentStatus}.`,
      },
      {
        status: 409,
      }
    )
  }

  const now =
    new Date().toISOString()

  const updatePayload =
    normalizedStatus ===
    'approved'
      ? {
          status:
            'approved',

          approved_by:
            context.authUserId,

          approved_at:
            now,

          rejection_reason:
            null,

          updated_at:
            now,
        }
      : {
          status:
            'rejected',

          approved_by:
            context.authUserId,

          approved_at:
            now,

          rejection_reason:
            String(
              rejection_reason ||
                ''
            ).trim() ||
            null,

          updated_at:
            now,
        }

  const {
    data: updatedRequest,
    error: updateError,
  } = await supabase
    .from('leave_requests')
    .update(updatePayload)
    .eq(
      'id',
      id
    )
    .eq(
      'company_id',
      context.companyId
    )
    .eq(
      'status',
      'pending'
    )
    .select(`
      *,
      leave_types(*)
    `)
    .maybeSingle()

  if (updateError) {
    return NextResponse.json(
      {
        success: false,
        error:
          updateError.message,
      },
      {
        status: 500,
      }
    )
  }

  if (!updatedRequest) {
    return NextResponse.json(
      {
        success: false,
        error:
          'The request changed before this action completed. Refresh and try again.',
      },
      {
        status: 409,
      }
    )
  }

  // ---------------------------------------------------------
  // DEDUCT LEAVE BALANCE ON FIRST APPROVAL ONLY
  // ---------------------------------------------------------

  if (
    normalizedStatus ===
    'approved'
  ) {
    const currentFy =
      new Date().getFullYear()

    const {
      data: balance,
      error: balanceError,
    } = await supabase
      .from('leave_balances')
      .select('*')
      .eq(
        'employee_id',
        updatedRequest.employee_id
      )
      .eq(
        'leave_type_id',
        updatedRequest.leave_type_id
      )
      .eq(
        'fiscal_year',
        currentFy
      )
      .maybeSingle()

    if (balanceError) {
      console.error(
        '[Leave] Unable to load leave balance:',
        balanceError.message
      )
    }

    if (balance) {
      const days =
        Number(
          updatedRequest.total_days
        ) || 0

      const currentUsed =
        Number(
          balance.used
        ) || 0

      const currentClosing =
        Number(
          balance.closing_balance
        ) || 0

      const {
        error:
          balanceUpdateError,
      } = await supabase
        .from('leave_balances')
        .update({
          used:
            currentUsed +
            days,

          closing_balance:
            Math.max(
              0,
              currentClosing -
                days
            ),

          updated_at:
            now,
        })
        .eq(
          'id',
          balance.id
        )

      if (
        balanceUpdateError
      ) {
        console.error(
          '[Leave] Leave approved, but balance update failed:',
          balanceUpdateError.message
        )
      }
    }
  }

  return NextResponse.json({
    success: true,
    request:
      updatedRequest,
    data:
      updatedRequest,
  })
}