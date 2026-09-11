import { NextResponse } from 'next/server'

import {
  createAdminClient,
} from '@/lib/supabase/admin'

import {
  resolveRequestContext,
  hasRole,
} from '@/lib/services/company-resolver'

import {
  createAuditLog,
} from '@/lib/services/audit-service'

// ============================================================
// Helpers
// ============================================================

function pad2(
  value: number
): string {
  return String(
    value
  ).padStart(
    2,
    '0'
  )
}

function buildDateOnly(
  year: number,
  month: number,
  day: number
): string {
  return `${year}-${pad2(month)}-${pad2(day)}`
}

function getDaysInMonth(
  year: number,
  month: number
): number {
  return new Date(
    Date.UTC(
      year,
      month,
      0
    )
  ).getUTCDate()
}

function getUtcDayOfWeek(
  year: number,
  month: number,
  day: number
): number {
  return new Date(
    Date.UTC(
      year,
      month - 1,
      day
    )
  ).getUTCDay()
}

function calculateWeekdayWorkingDays(
  year: number,
  month: number,
  calendarDays: number
): number {
  let workingDays =
    0

  for (
    let day = 1;
    day <= calendarDays;
    day++
  ) {
    const dayOfWeek =
      getUtcDayOfWeek(
        year,
        month,
        day
      )

    const isSunday =
      dayOfWeek === 0

    const isSaturday =
      dayOfWeek === 6

    if (
      !isSunday &&
      !isSaturday
    ) {
      workingDays++
    }
  }

  return workingDays
}

function validatePeriodInput(
  yearValue: unknown,
  monthValue: unknown
): {
  ok: true
  year: number
  month: number
} | {
  ok: false
  error: string
} {
  const year =
    Number(
      yearValue
    )

  const month =
    Number(
      monthValue
    )

  if (
    !Number.isInteger(
      year
    ) ||
    !Number.isInteger(
      month
    )
  ) {
    return {
      ok: false,
      error:
        'Payroll year and month must be whole numbers.',
    }
  }

  if (
    month < 1 ||
    month > 12
  ) {
    return {
      ok: false,
      error:
        'Payroll month must be between 1 and 12.',
    }
  }

  if (
    year < 1900 ||
    year > 9999
  ) {
    return {
      ok: false,
      error:
        'Payroll year is outside the supported range.',
    }
  }

  return {
    ok: true,
    year,
    month,
  }
}

// ============================================================
// GET — List Payroll Periods
// ============================================================

export async function GET(
  request: Request
) {
  try {
    const auth =
      await resolveRequestContext()

    if (
      !auth.ok
    ) {
      return NextResponse.json(
        {
          success:
            false,
          error:
            auth.error.message,
        },
        {
          status:
            auth.error.status,
        }
      )
    }

    if (
      !hasRole(
        auth.context,
        'SUPER_ADMIN',
        'HR_ADMIN',
        'PAYROLL_ADMIN'
      )
    ) {
      return NextResponse.json(
        {
          success:
            false,
          error:
            'Unauthorized',
        },
        {
          status:
            403,
        }
      )
    }

    const {
      companyId,
    } =
      auth.context

    const admin =
      createAdminClient()

    if (
      !admin
    ) {
      return NextResponse.json(
        {
          success:
            false,
          error:
            'Database unavailable.',
        },
        {
          status:
            503,
        }
      )
    }

    const url =
      new URL(
        request.url
      )

    const yearParam =
      url.searchParams.get(
        'year'
      )

    const monthParam =
      url.searchParams.get(
        'month'
      )

    let query =
      admin
        .from(
          'payroll_periods'
        )
        .select('*')
        .eq(
          'company_id',
          companyId
        )

    if (
      yearParam
    ) {
      const year =
        Number(
          yearParam
        )

      if (
        !Number.isInteger(
          year
        )
      ) {
        return NextResponse.json(
          {
            success:
              false,
            error:
              'Invalid year filter.',
          },
          {
            status:
              400,
          }
        )
      }

      query =
        query.eq(
          'period_year',
          year
        )
    }

    if (
      monthParam
    ) {
      const month =
        Number(
          monthParam
        )

      if (
        !Number.isInteger(
          month
        ) ||
        month < 1 ||
        month > 12
      ) {
        return NextResponse.json(
          {
            success:
              false,
            error:
              'Invalid month filter.',
          },
          {
            status:
              400,
          }
        )
      }

      query =
        query.eq(
          'period_month',
          month
        )
    }

    const {
      data,
      error,
    } =
      await query
        .order(
          'period_year',
          {
            ascending:
              false,
          }
        )
        .order(
          'period_month',
          {
            ascending:
              false,
          }
        )

    if (
      error
    ) {
      return NextResponse.json(
        {
          success:
            false,
          error:
            error.message,
        },
        {
          status:
            500,
        }
      )
    }

    return NextResponse.json({
      success:
        true,
      periods:
        data || [],
      data:
        data || [],
    })
  } catch (
    error: any
  ) {
    console.error(
      '[GET /api/payroll/periods]',
      error
    )

    return NextResponse.json(
      {
        success:
          false,
        error:
          error?.message ||
          'Unable to load payroll periods.',
      },
      {
        status:
          500,
      }
    )
  }
}

// ============================================================
// POST — Create Payroll Period
// ============================================================

export async function POST(
  request: Request
) {
  try {
    const auth =
      await resolveRequestContext()

    if (
      !auth.ok
    ) {
      return NextResponse.json(
        {
          success:
            false,
          error:
            auth.error.message,
        },
        {
          status:
            auth.error.status,
        }
      )
    }

    if (
      !hasRole(
        auth.context,
        'SUPER_ADMIN',
        'HR_ADMIN',
        'PAYROLL_ADMIN'
      )
    ) {
      return NextResponse.json(
        {
          success:
            false,
          error:
            'Unauthorized',
        },
        {
          status:
            403,
        }
      )
    }

    const {
      companyId,
      authUserId,
      email,
      fullName,
    } =
      auth.context

    const body =
      await request.json()

    const validation =
      validatePeriodInput(
        body?.period_year,
        body?.period_month
      )

    if (
      !validation.ok
    ) {
      return NextResponse.json(
        {
          success:
            false,
          error:
            validation.error,
        },
        {
          status:
            400,
        }
      )
    }

    const {
      year,
      month,
    } =
      validation

    /**
     * IMPORTANT:
     *
     * Payroll dates are DATE-ONLY business values.
     *
     * Do not construct local Date objects and then call:
     *
     *   toISOString().split('T')[0]
     *
     * because local midnight in IST can convert to the
     * previous UTC calendar date.
     *
     * Build YYYY-MM-DD directly instead.
     */
    const calendarDays =
      getDaysInMonth(
        year,
        month
      )

    const startDate =
      buildDateOnly(
        year,
        month,
        1
      )

    const endDate =
      buildDateOnly(
        year,
        month,
        calendarDays
      )

    /**
     * This stored working_days value currently represents
     * weekday working days only (Mon-Fri).
     *
     * The payroll-run engine remains authoritative for the
     * final payroll calculation because it additionally
     * reconciles:
     * - company weekly offs
     * - company holidays
     * - joining / exit dates
     * - paid leave
     * - LOP
     * - approved timesheet coverage
     */
    const workingDays =
      calculateWeekdayWorkingDays(
        year,
        month,
        calendarDays
      )

    const admin =
      createAdminClient()

    if (
      !admin
    ) {
      return NextResponse.json(
        {
          success:
            false,
          error:
            'Database unavailable.',
        },
        {
          status:
            503,
        }
      )
    }

    // ========================================================
    // Existing Period
    // ========================================================

    const {
      data:
        existing,
      error:
        existingError,
    } =
      await admin
        .from(
          'payroll_periods'
        )
        .select('*')
        .eq(
          'company_id',
          companyId
        )
        .eq(
          'period_month',
          month
        )
        .eq(
          'period_year',
          year
        )
        .maybeSingle()

    if (
      existingError
    ) {
      return NextResponse.json(
        {
          success:
            false,
          error:
            `Unable to check existing payroll period: ${existingError.message}`,
        },
        {
          status:
            500,
        }
      )
    }

    if (
      existing
    ) {
      /**
       * Do NOT silently rewrite an existing payroll period here.
       *
       * Existing periods may already be referenced by payroll
       * runs and should remain auditable.
       *
       * We return the existing record and expose whether its
       * date boundaries match the canonical month.
       */
      const boundaryValid =
        existing.start_date ===
          startDate &&
        existing.end_date ===
          endDate &&
        Number(
          existing.calendar_days
        ) ===
          calendarDays

      return NextResponse.json(
        {
          success:
            true,

          period:
            existing,

          data:
            existing,

          existing:
            true,

          boundaryValid,

          expectedBoundaries: {
            start_date:
              startDate,
            end_date:
              endDate,
            calendar_days:
              calendarDays,
            weekday_working_days:
              workingDays,
          },

          warning:
            boundaryValid
              ? undefined
              : 'Existing payroll period boundaries do not match the selected calendar month. Review the stored period before running payroll.',
        },
        {
          status:
            200,
        }
      )
    }

    // ========================================================
    // Create Period
    // ========================================================

    const {
      data,
      error,
    } =
      await admin
        .from(
          'payroll_periods'
        )
        .insert({
          company_id:
            companyId,

          period_month:
            month,

          period_year:
            year,

          start_date:
            startDate,

          end_date:
            endDate,

          calendar_days:
            calendarDays,

          working_days:
            workingDays,

          status:
            'upcoming',
        })
        .select()
        .single()

    if (
      error
    ) {
      return NextResponse.json(
        {
          success:
            false,
          error:
            error.message,
        },
        {
          status:
            500,
        }
      )
    }

    await createAuditLog({
      companyId,

      userId:
        authUserId,

      userEmail:
        email,

      userName:
        fullName,

      action:
        'created',

      entityType:
        'payroll_run',

      entityId:
        data.id,

      description:
        `Created payroll period ${month}/${year} with boundaries ${startDate} to ${endDate}.`,
    })

    return NextResponse.json(
      {
        success:
          true,

        period:
          data,

        data,

        existing:
          false,

        boundaryValid:
          true,
      },
      {
        status:
          201,
      }
    )
  } catch (
    error: any
  ) {
    console.error(
      '[POST /api/payroll/periods]',
      error
    )

    return NextResponse.json(
      {
        success:
          false,
        error:
          error?.message ||
          'Unable to create payroll period.',
      },
      {
        status:
          500,
      }
    )
  }
}
