import {
  NextRequest,
  NextResponse,
} from 'next/server'

import {
  createAdminClient,
} from '@/lib/supabase/admin'

import {
  isAdmin,
  resolveRequestContext,
} from '@/lib/services/company-resolver'

const ALLOWED_TYPES = [
  'public',
  'company',
  'optional',
  'restricted',
] as const

type HolidayType =
  (typeof ALLOWED_TYPES)[number]

function isValidDate(
  value: unknown
): value is string {
  if (
    typeof value !== 'string'
  ) {
    return false
  }

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      value
    )
  ) {
    return false
  }

  const date =
    new Date(
      `${value}T00:00:00`
    )

  return !Number.isNaN(
    date.getTime()
  )
}

function normalizeType(
  value: unknown
): HolidayType {
  const normalized =
    String(
      value ||
      'public'
    )
      .trim()
      .toLowerCase()

  return ALLOWED_TYPES.includes(
    normalized as HolidayType
  )
    ? (
        normalized as HolidayType
      )
    : 'public'
}

function parseYear(
  value: string | null
): number {
  const year =
    Number(
      value
    )

  if (
    Number.isInteger(
      year
    ) &&
    year >= 2000 &&
    year <= 2100
  ) {
    return year
  }

  return new Date()
    .getFullYear()
}

/* ============================================================
   GET HOLIDAYS

   Admin and employee portal both use this route.
   Server always scopes results to the authenticated company.

   Optional:
     /api/holidays?year=2026
   ============================================================ */

export async function GET(
  request: NextRequest
) {
  try {
    const resolution =
      await resolveRequestContext()

    if (
      !resolution.ok
    ) {
      return NextResponse.json(
        {
          success:
            false,

          error:
            resolution.error.message,
        },
        {
          status:
            resolution.error.status,
        }
      )
    }

    const {
      companyId,
    } =
      resolution.context

    const {
      searchParams,
    } =
      new URL(
        request.url
      )

    const year =
      parseYear(
        searchParams.get(
          'year'
        )
      )

    const supabase =
      createAdminClient()

    if (
      !supabase
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

    const {
      data,
      error,
    } =
      await supabase
        .from(
          'holidays'
        )
        .select(
          'id, company_id, name, date, type, is_active'
        )
        .eq(
          'company_id',
          companyId
        )
        .eq(
          'is_active',
          true
        )
        .gte(
          'date',
          `${year}-01-01`
        )
        .lte(
          'date',
          `${year}-12-31`
        )
        .order(
          'date',
          {
            ascending:
              true,
          }
        )

    if (
      error
    ) {
      console.error(
        '[GET /api/holidays]',
        error
      )

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

      year,

      holidays:
        (
          data ||
          []
        ).map(
          (
            holiday:
              any
          ) => ({
            id:
              holiday.id,

            name:
              holiday.name,

            date:
              holiday.date,

            type:
              normalizeType(
                holiday.type
              ),

            isActive:
              Boolean(
                holiday.is_active
              ),
          })
        ),
    })
  } catch (
    error:
      any
  ) {
    console.error(
      '[GET /api/holidays] Unexpected error:',
      error
    )

    return NextResponse.json(
      {
        success:
          false,

        error:
          error?.message ||
          'Unable to load holidays.',
      },
      {
        status:
          500,
      }
    )
  }
}

/* ============================================================
   CREATE HOLIDAY — ADMIN ONLY
   ============================================================ */

export async function POST(
  request: NextRequest
) {
  try {
    const resolution =
      await resolveRequestContext()

    if (
      !resolution.ok
    ) {
      return NextResponse.json(
        {
          success:
            false,

          error:
            resolution.error.message,
        },
        {
          status:
            resolution.error.status,
        }
      )
    }

    if (
      !isAdmin(
        resolution.context
      )
    ) {
      return NextResponse.json(
        {
          success:
            false,

          error:
            'Admin access required.',
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
      resolution.context

    const body =
      await request.json()

    const name =
      String(
        body?.name ||
        ''
      ).trim()

    const date =
      String(
        body?.date ||
        ''
      ).trim()

    const type =
      normalizeType(
        body?.type
      )

    if (
      !name
    ) {
      return NextResponse.json(
        {
          success:
            false,

          error:
            'Holiday name is required.',
        },
        {
          status:
            400,
        }
      )
    }

    if (
      !isValidDate(
        date
      )
    ) {
      return NextResponse.json(
        {
          success:
            false,

          error:
            'A valid holiday date is required.',
        },
        {
          status:
            400,
        }
      )
    }

    const supabase =
      createAdminClient()

    if (
      !supabase
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

    /**
     * Prevent duplicate active holidays for the same company/date.
     */
    const {
      data:
        existing,
      error:
        existingError,
    } =
      await supabase
        .from(
          'holidays'
        )
        .select(
          'id, name'
        )
        .eq(
          'company_id',
          companyId
        )
        .eq(
          'date',
          date
        )
        .eq(
          'is_active',
          true
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
            existingError.message,
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
      return NextResponse.json(
        {
          success:
            false,

          error:
            `A holiday already exists on ${date}: ${existing.name}.`,
        },
        {
          status:
            409,
        }
      )
    }

    const {
      data,
      error,
    } =
      await supabase
        .from(
          'holidays'
        )
        .insert({
          company_id:
            companyId,

          name,

          date,

          type,

          is_active:
            true,
        })
        .select(
          'id, name, date, type, is_active'
        )
        .single()

    if (
      error
    ) {
      console.error(
        '[POST /api/holidays]',
        error
      )

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

    return NextResponse.json(
      {
        success:
          true,

        holiday: {
          id:
            data.id,

          name:
            data.name,

          date:
            data.date,

          type:
            normalizeType(
              data.type
            ),

          isActive:
            Boolean(
              data.is_active
            ),
        },
      },
      {
        status:
          201,
      }
    )
  } catch (
    error:
      any
  ) {
    return NextResponse.json(
      {
        success:
          false,

        error:
          error?.message ||
          'Unable to create holiday.',
      },
      {
        status:
          500,
      }
    )
  }
}

/* ============================================================
   UPDATE HOLIDAY — ADMIN ONLY
   Body:
   {
     id,
     name,
     date,
     type
   }
   ============================================================ */

export async function PATCH(
  request: NextRequest
) {
  try {
    const resolution =
      await resolveRequestContext()

    if (
      !resolution.ok
    ) {
      return NextResponse.json(
        {
          success:
            false,

          error:
            resolution.error.message,
        },
        {
          status:
            resolution.error.status,
        }
      )
    }

    if (
      !isAdmin(
        resolution.context
      )
    ) {
      return NextResponse.json(
        {
          success:
            false,

          error:
            'Admin access required.',
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
      resolution.context

    const body =
      await request.json()

    const id =
      String(
        body?.id ||
        ''
      ).trim()

    const name =
      String(
        body?.name ||
        ''
      ).trim()

    const date =
      String(
        body?.date ||
        ''
      ).trim()

    const type =
      normalizeType(
        body?.type
      )

    if (
      !id
    ) {
      return NextResponse.json(
        {
          success:
            false,

          error:
            'Holiday ID is required.',
        },
        {
          status:
            400,
        }
      )
    }

    if (
      !name
    ) {
      return NextResponse.json(
        {
          success:
            false,

          error:
            'Holiday name is required.',
        },
        {
          status:
            400,
        }
      )
    }

    if (
      !isValidDate(
        date
      )
    ) {
      return NextResponse.json(
        {
          success:
            false,

          error:
            'A valid holiday date is required.',
        },
        {
          status:
            400,
        }
      )
    }

    const supabase =
      createAdminClient()

    if (
      !supabase
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

    const {
      data:
        duplicate,
      error:
        duplicateError,
    } =
      await supabase
        .from(
          'holidays'
        )
        .select(
          'id, name'
        )
        .eq(
          'company_id',
          companyId
        )
        .eq(
          'date',
          date
        )
        .eq(
          'is_active',
          true
        )
        .neq(
          'id',
          id
        )
        .maybeSingle()

    if (
      duplicateError
    ) {
      return NextResponse.json(
        {
          success:
            false,

          error:
            duplicateError.message,
        },
        {
          status:
            500,
        }
      )
    }

    if (
      duplicate
    ) {
      return NextResponse.json(
        {
          success:
            false,

          error:
            `Another holiday already exists on ${date}: ${duplicate.name}.`,
        },
        {
          status:
            409,
        }
      )
    }

    const {
      data,
      error,
    } =
      await supabase
        .from(
          'holidays'
        )
        .update({
          name,

          date,

          type,
        })
        .eq(
          'company_id',
          companyId
        )
        .eq(
          'id',
          id
        )
        .eq(
          'is_active',
          true
        )
        .select(
          'id, name, date, type, is_active'
        )
        .maybeSingle()

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

    if (
      !data
    ) {
      return NextResponse.json(
        {
          success:
            false,

          error:
            'Holiday not found.',
        },
        {
          status:
            404,
        }
      )
    }

    return NextResponse.json({
      success:
        true,

      holiday: {
        id:
          data.id,

        name:
          data.name,

        date:
          data.date,

        type:
          normalizeType(
            data.type
          ),

        isActive:
          Boolean(
            data.is_active
          ),
      },
    })
  } catch (
    error:
      any
  ) {
    return NextResponse.json(
      {
        success:
          false,

        error:
          error?.message ||
          'Unable to update holiday.',
      },
      {
        status:
          500,
      }
    )
  }
}

/* ============================================================
   REMOVE HOLIDAY — ADMIN ONLY

   Soft-delete by setting is_active = false.
   Body:
   {
     id
   }
   ============================================================ */

export async function DELETE(
  request: NextRequest
) {
  try {
    const resolution =
      await resolveRequestContext()

    if (
      !resolution.ok
    ) {
      return NextResponse.json(
        {
          success:
            false,

          error:
            resolution.error.message,
        },
        {
          status:
            resolution.error.status,
        }
      )
    }

    if (
      !isAdmin(
        resolution.context
      )
    ) {
      return NextResponse.json(
        {
          success:
            false,

          error:
            'Admin access required.',
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
      resolution.context

    const body =
      await request.json()

    const id =
      String(
        body?.id ||
        ''
      ).trim()

    if (
      !id
    ) {
      return NextResponse.json(
        {
          success:
            false,

          error:
            'Holiday ID is required.',
        },
        {
          status:
            400,
        }
      )
    }

    const supabase =
      createAdminClient()

    if (
      !supabase
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

    const {
      data,
      error,
    } =
      await supabase
        .from(
          'holidays'
        )
        .update({
          is_active:
            false,
        })
        .eq(
          'company_id',
          companyId
        )
        .eq(
          'id',
          id
        )
        .select(
          'id'
        )
        .maybeSingle()

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

    if (
      !data
    ) {
      return NextResponse.json(
        {
          success:
            false,

          error:
            'Holiday not found.',
        },
        {
          status:
            404,
        }
      )
    }

    return NextResponse.json({
      success:
        true,
    })
  } catch (
    error:
      any
  ) {
    return NextResponse.json(
      {
        success:
          false,

        error:
          error?.message ||
          'Unable to remove holiday.',
      },
      {
        status:
          500,
      }
    )
  }
}
