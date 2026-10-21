import {
  NextRequest,
  NextResponse,
} from 'next/server'

import {
  createAdminClient,
} from '@/lib/supabase/admin'

import {
  resolveRequestContext,
} from '@/lib/services/company-resolver'

/**
 * GET /api/compensation
 *
 * Company-level compensation listing.
 *
 * IMPORTANT:
 * This route has NO dynamic route parameter.
 *
 * Employee-specific compensation belongs in:
 * /api/compensation/[employeeId]
 */
export async function GET(
  _request: NextRequest
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

  const {
    context,
  } = resolved

  const supabase =
    createAdminClient()

  if (!supabase) {
    return NextResponse.json(
      {
        success: false,
        error:
          'Database unavailable',
      },
      {
        status: 503,
      }
    )
  }

  /*
   * Fetch company salary structures.
   *
   * Do not assume that status='active' alone means
   * "currently effective".
   *
   * Future-dated compensation revisions may already exist.
   * Current employee compensation is resolved by the
   * canonical compensation service in employee-specific
   * workflows.
   *
   * This company-level endpoint remains a listing endpoint.
   */
  const {
    data: structures,
    error: structError,
  } = await supabase
    .from('salary_structures')
    .select(`
      *,
      employees (
        id,
        full_name,
        employee_code,
        departments:department_id(name)
      ),
      salary_structure_components (
        *,
        salary_components (*)
      )
    `)
    .eq(
      'company_id',
      context.companyId
    )
    .eq(
      'status',
      'active'
    )
    .order(
      'created_at',
      {
        ascending: false,
      }
    )

  if (structError) {
    return NextResponse.json(
      {
        success: false,
        error:
          structError.message,
      },
      {
        status: 500,
      }
    )
  }

  /*
   * Fetch active company salary component definitions.
   */
  const {
    data: componentsData,
    error: compError,
  } = await supabase
    .from('salary_components')
    .select('*')
    .eq(
      'company_id',
      context.companyId
    )
    .eq(
      'is_active',
      true
    )
    .order(
      'sort_order',
      {
        ascending: true,
      }
    )

  if (compError) {
    return NextResponse.json(
      {
        success: false,
        error:
          compError.message,
      },
      {
        status: 500,
      }
    )
  }

  const formattedCompensations =
    (structures || []).map(
      (structure: any) => ({
        id:
          structure.id,

        annual_ctc:
          Number(
            structure.annual_ctc
          ),

        monthly_gross:
          Number(
            structure.monthly_gross
          ),

        effective_date:
          structure.effective_from,

        effective_from:
          structure.effective_from,

        effective_until:
          structure.effective_until ??
          null,

        status:
          structure.status,

        employee: {
          id:
            structure.employees
              ?.id ||
            structure.employee_id,

          name:
            structure.employees
              ?.full_name ||
            'Employee',

          code:
            structure.employees
              ?.employee_code ||
            '',

          department:
            structure.employees
              ?.departments
              ?.name ||
            '',
        },

        components:
          structure
            .salary_structure_components ||
          [],
      })
    )

  const formattedComponents =
    (componentsData || []).map(
      (component: any) => ({
        id:
          component.id,

        name:
          component.name,

        code:
          component.code,

        type:
          component.type ===
          'earning'
            ? 'Earning'
            : 'Deduction',

        calculation_type:
          component.category ||
          'Standard',

        statutory:
          Boolean(
            component.is_statutory
          ),
      })
    )

  return NextResponse.json({
    success: true,

    compensations:
      formattedCompensations,

    components:
      formattedComponents,

    data:
      formattedCompensations,
  })
}