
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  resolveRequestContext,
  resolveEmployeeAccess,
} from '@/lib/services/company-resolver'
import {
  formatIndiaTime,
  getIndiaDateString,
} from '@/lib/utils/date-time'

export async function GET(request: NextRequest) {
  const resolved = await resolveRequestContext()

  if (!resolved.ok) {
    return NextResponse.json(
      {
        success: false,
        error: resolved.error.message,
      },
      {
        status: resolved.error.status,
      }
    )
  }

  const { context } = resolved

  const { searchParams } = new URL(request.url)

  const queryEmployeeId =
    searchParams.get('employee_id')

  const specificDate =
    searchParams.get('date')

  const startDate =
    searchParams.get('start_date')

  const endDate =
    searchParams.get('end_date')

  const access = resolveEmployeeAccess(
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

  const supabase = createAdminClient()

  if (!supabase) {
    return NextResponse.json(
      {
        success: false,
        error: 'DB unavailable',
      },
      {
        status: 503,
      }
    )
  }

  // ---------------------------------------------------------
  // ADMIN DAILY VIEW
  // ---------------------------------------------------------

  if (specificDate && !access.employeeId) {
    const {
      data: emps,
      error: empErr,
    } = await supabase
      .from('employees')
      .select(`
        id,
        full_name,
        employee_code,
        official_email,
        departments:department_id(name)
      `)
      .eq('company_id', context.companyId)
      .eq('is_active', true)
      .order('employee_code', {
        ascending: true,
      })

    if (empErr) {
      return NextResponse.json(
        {
          success: false,
          error: empErr.message,
        },
        {
          status: 500,
        }
      )
    }

    const {
      data: records,
      error: recErr,
    } = await supabase
      .from('attendance_records')
      .select('*')
      .eq('company_id', context.companyId)
      .eq('attendance_date', specificDate)

    if (recErr) {
      return NextResponse.json(
        {
          success: false,
          error: recErr.message,
        },
        {
          status: 500,
        }
      )
    }

    const recMap = new Map(
      (records || []).map(
        (record: any) => [
          record.employee_id,
          record,
        ]
      )
    )

    const combined = (emps || []).map(
      (emp: any) => {
        const rec: any = recMap.get(emp.id)

        let displayStatus = 'NOT_MARKED'

        if (rec) {
          const status = String(
            rec.status || ''
          ).toLowerCase()

          if (status === 'present') {
            displayStatus = 'Present'
          } else if (status === 'absent') {
            displayStatus = 'Absent'
          } else if (
            status === 'half_day' ||
            status === 'half day'
          ) {
            displayStatus = 'Half Day'
          } else if (
            status === 'leave' ||
            status === 'on_leave'
          ) {
            displayStatus = 'Leave'
          } else {
            displayStatus =
              rec.status || 'NOT_MARKED'
          }
        }

        return {
          id: rec?.id || null,

          employee_id: emp.id,

          attendance_date:
            specificDate,

          date:
            specificDate,

          status:
            displayStatus,

          check_in:
            rec?.check_in_time
              ? formatIndiaTime(
                  rec.check_in_time
                )
              : undefined,

          check_out:
            rec?.check_out_time
              ? formatIndiaTime(
                  rec.check_out_time
                )
              : undefined,

          working_hours:
            rec?.working_hours ?? null,

          employee: {
            id: emp.id,
            name: emp.full_name,
            code: emp.employee_code,
            email: emp.official_email,
            department:
              emp.departments?.name ||
              'General',
          },
        }
      }
    )

    return NextResponse.json({
      success: true,
      records: combined,
      attendance: combined,
      data: combined,
    })
  }

  // ---------------------------------------------------------
  // EMPLOYEE HISTORY / RANGE QUERY
  // ---------------------------------------------------------

  let query = supabase
    .from('attendance_records')
    .select(`
      *,
      employees(
        id,
        full_name,
        employee_code,
        departments:department_id(name)
      )
    `)
    .eq('company_id', context.companyId)
    .order('attendance_date', {
      ascending: false,
    })

  if (access.employeeId) {
    query = query.eq(
      'employee_id',
      access.employeeId
    )
  }

  if (specificDate) {
    query = query.eq(
      'attendance_date',
      specificDate
    )
  }

  if (startDate) {
    query = query.gte(
      'attendance_date',
      startDate
    )
  }

  if (endDate) {
    query = query.lte(
      'attendance_date',
      endDate
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

  const formatted = (data || []).map(
    (record: any) => ({
      id:
        record.id,

      employee_id:
        record.employee_id,

      date:
        record.attendance_date,

      attendance_date:
        record.attendance_date,

      status:
        record.status?.toUpperCase() ||
        'PRESENT',

      check_in:
        record.check_in_time
          ? formatIndiaTime(
              record.check_in_time
            )
          : '-',

      check_out:
        record.check_out_time
          ? formatIndiaTime(
              record.check_out_time
            )
          : '-',

      working_hours:
        record.working_hours ?? 8,

      employee:
        record.employees
          ? {
              id:
                record.employees.id,

              name:
                record.employees
                  .full_name,

              code:
                record.employees
                  .employee_code,

              department:
                record.employees
                  .departments?.name ||
                '',
            }
          : null,
    })
  )

  return NextResponse.json({
    success: true,
    records: formatted,
    attendance: formatted,
    data: formatted,
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
        error: resolved.error.message,
      },
      {
        status: resolved.error.status,
      }
    )
  }

  const { context } = resolved

  const body = await request.json()

  /*
   * Calendar date is based on India time.
   * Timestamp stored in Supabase remains UTC ISO.
   */
  const today = getIndiaDateString()
  const now = new Date().toISOString()

  // ---------------------------------------------------------
  // EMPLOYEE WEB CHECK-IN / CHECK-OUT
  // ---------------------------------------------------------

  if (
    body.type === 'in' ||
    body.type === 'out'
  ) {
    if (!context.employeeId) {
      return NextResponse.json(
        {
          success: false,
          error:
            'No employee profile linked to user',
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
          error: 'DB unavailable',
        },
        {
          status: 503,
        }
      )
    }

    const {
      data: existing,
      error: existingError,
    } = await supabase
      .from('attendance_records')
      .select(
        'id, check_in_time, check_out_time'
      )
      .eq(
        'company_id',
        context.companyId
      )
      .eq(
        'employee_id',
        context.employeeId
      )
      .eq(
        'attendance_date',
        today
      )
      .maybeSingle()

    if (existingError) {
      return NextResponse.json(
        {
          success: false,
          error: existingError.message,
        },
        {
          status: 500,
        }
      )
    }

    // CHECK IN
    if (body.type === 'in') {
      if (existing) {
        return NextResponse.json(
          {
            success: false,
            error:
              'Already checked in for today',
          },
          {
            status: 400,
          }
        )
      }

      const {
        data,
        error,
      } = await supabase
        .from('attendance_records')
        .insert({
          company_id:
            context.companyId,

          employee_id:
            context.employeeId,

          attendance_date:
            today,

          status:
            'present',

          check_in_time:
            now,
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
        record: data,
        data,
      })
    }

    // CHECK OUT
    if (!existing) {
      return NextResponse.json(
        {
          success: false,
          error:
            'No check-in record found for today',
        },
        {
          status: 400,
        }
      )
    }

    if (!existing.check_in_time) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Attendance record does not contain a check-in time',
        },
        {
          status: 400,
        }
      )
    }

    if (existing.check_out_time) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Already checked out for today',
        },
        {
          status: 400,
        }
      )
    }

    const checkInDate =
      new Date(existing.check_in_time)

    const hours = Number(
      (
        (
          new Date().getTime() -
          checkInDate.getTime()
        ) /
        3600000
      ).toFixed(2)
    )

    const {
      data,
      error,
    } = await supabase
      .from('attendance_records')
      .update({
        check_out_time:
          now,

        working_hours:
          Math.max(0, hours),

        updated_at:
          now,
      })
      .eq(
        'company_id',
        context.companyId
      )
      .eq(
        'id',
        existing.id
      )
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
      record: data,
      data,
    })
  }

  // ---------------------------------------------------------
  // ADMIN ATTENDANCE ENTRY
  // ---------------------------------------------------------

  const {
    employee_id,
    date,
    attendance_date,
    status,
    check_in_time,
    check_out_time,
    remarks,
    is_manual_entry,
    manual_reason,
  } = body

  if (!employee_id) {
    return NextResponse.json(
      {
        success: false,
        error: 'employee_id is required',
      },
      {
        status: 400,
      }
    )
  }

  const attDate =
    date ||
    attendance_date ||
    today

  const access =
    resolveEmployeeAccess(
      context,
      employee_id
    )

  if (
    access.denied ||
    (
      access.employeeId &&
      access.employeeId !==
        employee_id
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

  const supabase =
    createAdminClient()

  if (!supabase) {
    return NextResponse.json(
      {
        success: false,
        error: 'DB unavailable',
      },
      {
        status: 503,
      }
    )
  }

  const normalizedStatus = String(
    status || 'present'
  )
    .toLowerCase()
    .replace(/\s+/g, '_')

  const {
    data,
    error,
  } = await supabase
    .from('attendance_records')
    .upsert(
      {
        company_id:
          context.companyId,

        employee_id,

        attendance_date:
          attDate,

        status:
          normalizedStatus,

        check_in_time:
          check_in_time || null,

        check_out_time:
          check_out_time || null,

        remarks:
          remarks || null,

        is_manual_entry:
          is_manual_entry ?? true,

        manual_reason:
          manual_reason ||
          'Updated by administrator',

        updated_at:
          now,
      },
      {
        onConflict:
          'employee_id,attendance_date',
      }
    )
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
    record: data,
    data,
  })
}