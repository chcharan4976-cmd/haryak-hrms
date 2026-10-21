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
  hasRole,
} from '@/lib/services/company-resolver'

import {
  getEffectiveCompensation,
} from '@/lib/services/compensation-service'

import {
  Decimal,
} from '@/lib/utils/decimal'

/* =========================================================
   HELPERS
   ========================================================= */

function normalizeDateOnly(
  value: unknown
): string | null {
  if (
    typeof value !== 'string'
  ) {
    return null
  }

  const normalized =
    value.trim().slice(0, 10)

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      normalized
    )
  ) {
    return null
  }

  return normalized
}

/**
 * DATE-only previous-day calculation.
 *
 * Compensation dates are PostgreSQL DATE values.
 * Use UTC intentionally so local timezone conversion cannot
 * move the boundary into another calendar day.
 */
function previousDate(
  dateOnly: string
): string | null {
  const normalized =
    normalizeDateOnly(dateOnly)

  if (!normalized) {
    return null
  }

  const [
    year,
    month,
    day,
  ] = normalized
    .split('-')
    .map(Number)

  const date =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day
      )
    )

  date.setUTCDate(
    date.getUTCDate() - 1
  )

  return date
    .toISOString()
    .slice(0, 10)
}

/* =========================================================
   GET EMPLOYEE COMPENSATION
   ========================================================= */

export async function GET(
  _request: NextRequest,
  {
    params,
  }: {
    params: Promise<{
      employeeId: string
    }>
  }
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

  const {
    employeeId,
  } = await params

  const access =
    resolveEmployeeAccess(
      context,
      employeeId
    )

  if (
    access.denied ||
    (
      access.employeeId &&
      access.employeeId !==
        employeeId
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
        error:
          'Database unavailable.',
      },
      {
        status: 503,
      }
    )
  }

  const {
    data: structures,
    error: structureError,
  } = await supabase
    .from('salary_structures')
    .select(`
      *,
      salary_structure_components (
        *,
        component:component_id (*)
      )
    `)
    .eq(
      'company_id',
      context.companyId
    )
    .eq(
      'employee_id',
      employeeId
    )
    .order(
      'effective_from',
      {
        ascending: false,
      }
    )

  if (structureError) {
    return NextResponse.json(
      {
        success: false,
        error:
          structureError.message,
      },
      {
        status: 500,
      }
    )
  }

  const {
    data: statutoryDetails,
    error: statutoryError,
  } = await supabase
    .from(
      'employee_statutory_details'
    )
    .select(`
      pf_applicable,
      uan_number,
      pf_number,
      pf_joining_date,
      esi_applicable,
      esi_number,
      pt_applicable,
      pt_state,
      pt_amount,
      tax_regime,
      pan_masked
    `)
    .eq(
      'employee_id',
      employeeId
    )
    .maybeSingle()

  if (statutoryError) {
    return NextResponse.json(
      {
        success: false,
        error:
          statutoryError.message,
      },
      {
        status: 500,
      }
    )
  }

  const effective =
    await getEffectiveCompensation(
      employeeId,
      context.companyId
    )

  let compensation:
    any = null

  if (
    effective.structureId
  ) {
    const findComponent = (
      ...codes: string[]
    ) =>
      effective.components.find(
        component =>
          codes.includes(
            component.code
              .toUpperCase()
          )
      )

    const basic =
      findComponent('BASIC')

    const hra =
      findComponent('HRA')

    const special =
      findComponent(
        'SPECIAL_ALLOWANCE',
        'SPECIAL'
      )

    const conveyance =
      findComponent(
        'CONVEYANCE'
      )

    compensation = {
      id:
        effective.structureId,

      ctc:
        effective.annualCtc,

      annual_ctc:
        effective.annualCtc,

      monthly_gross:
        effective.monthlyGross,

      basic_salary:
        basic
          ? basic.monthlyAmount
          : null,

      hra:
        hra
          ? hra.monthlyAmount
          : null,

      special_allowance:
        special
          ? special.monthlyAmount
          : null,

      conveyance_allowance:
        conveyance
          ? conveyance.monthlyAmount
          : null,

      /*
       * Professional Tax is employee statutory configuration.
       * It is never fabricated from a salary component.
       */
      pt_deduction:
        statutoryDetails
          ?.pt_amount ??
        null,

      pt_applicable:
        statutoryDetails
          ?.pt_applicable ??
        null,

      pt_state:
        statutoryDetails
          ?.pt_state ??
        null,

      pf_applicable:
        statutoryDetails
          ?.pf_applicable ??
        null,

      esi_applicable:
        statutoryDetails
          ?.esi_applicable ??
        null,

      pan_masked:
        statutoryDetails
          ?.pan_masked ??
        null,

      effective_from:
        effective.effectiveFrom,

      effective_until:
        effective.effectiveUntil,

      status:
        effective.status,

      isComplete:
        effective.isComplete,

      incompletenessReasons:
        effective
          .incompletenessReasons,

      grossEarningsFromComponents:
        effective
          .grossEarningsFromComponents,

      totalDeductionsFromComponents:
        effective
          .totalDeductionsFromComponents,

      components:
        effective.components.map(
          component => ({
            id:
              component.id,

            componentId:
              component.componentId,

            name:
              component.name,

            code:
              component.code,

            type:
              component.type,

            category:
              component.category,

            monthly:
              component.monthlyAmount,

            monthly_amount:
              component.monthlyAmount,

            annual:
              component.annualAmount,

            annual_amount:
              component.annualAmount,

            isTaxable:
              component.isTaxable,

            isStatutory:
              component.isStatutory,

            isActive:
              component.isActive,
          })
        ),
    }
  }

  return NextResponse.json({
    success: true,

    compensation,

    statutoryDetails:
      statutoryDetails || null,

    effective,

    history:
      structures || [],

    data:
      structures || [],
  })
}

/* =========================================================
   CREATE NEW COMPENSATION VERSION
   ========================================================= */

export async function POST(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{
      employeeId: string
    }>
  }
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

  if (
    !hasRole(
      context,
      'SUPER_ADMIN',
      'HR_ADMIN',
      'PAYROLL_ADMIN'
    )
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          'Insufficient permissions to modify compensation.',
      },
      {
        status: 403,
      }
    )
  }

  const {
    employeeId,
  } = await params

  const supabase =
    createAdminClient()

  if (!supabase) {
    return NextResponse.json(
      {
        success: false,
        error:
          'Database unavailable.',
      },
      {
        status: 503,
      }
    )
  }

  /* -------------------------------------------------------
     VERIFY EMPLOYEE BELONGS TO COMPANY
     ------------------------------------------------------- */

  const {
    data: employee,
    error: employeeError,
  } = await supabase
    .from('employees')
    .select('id')
    .eq(
      'id',
      employeeId
    )
    .eq(
      'company_id',
      context.companyId
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

  if (!employee) {
    return NextResponse.json(
      {
        success: false,
        error:
          'Employee not found.',
      },
      {
        status: 404,
      }
    )
  }

  const body =
    await request.json()

  const {
    annual_ctc,
    monthly_gross,
    effective_from,
    components,
    reason,

    pt_amount,
    pt_applicable,
    pt_state,

    allow_incomplete =
      false,
  } = body

  /* -------------------------------------------------------
     CORE COMPENSATION VALIDATION
     ------------------------------------------------------- */

  const ctc =
    Number(
      annual_ctc || 0
    )

  const gross =
    Number(
      monthly_gross || 0
    )

  if (
    !Number.isFinite(ctc) ||
    ctc <= 0
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          'Annual CTC must be greater than zero.',
      },
      {
        status: 400,
      }
    )
  }

  if (
    !Number.isFinite(gross) ||
    gross <= 0
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          'Monthly Gross must be greater than zero.',
      },
      {
        status: 400,
      }
    )
  }

  if (gross > ctc) {
    return NextResponse.json(
      {
        success: false,
        error:
          'Monthly Gross cannot exceed Annual CTC.',
      },
      {
        status: 400,
      }
    )
  }

  const suppliedEffectiveDate =
    effective_from ===
      undefined ||
    effective_from ===
      null ||
    effective_from ===
      ''
      ? new Date()
          .toISOString()
          .slice(0, 10)
      : normalizeDateOnly(
          String(
            effective_from
          )
        )

  if (!suppliedEffectiveDate) {
    return NextResponse.json(
      {
        success: false,
        error:
          'Effective date must be a valid YYYY-MM-DD date.',
      },
      {
        status: 400,
      }
    )
  }

  const effectiveDate =
    suppliedEffectiveDate

  const requestedComponents =
    Array.isArray(components)
      ? components
      : []

  if (
    requestedComponents.length ===
      0 &&
    !allow_incomplete
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          'Salary components are required before activating this compensation structure.',
      },
      {
        status: 400,
      }
    )
  }

  /* -------------------------------------------------------
     PROFESSIONAL TAX VALIDATION

     IMPORTANT:
     - No hard-coded Telangana.
     - No inferred state.
     - If PT is enabled, amount AND state must be supplied.
     ------------------------------------------------------- */

  const ptAmountProvided =
    pt_amount !== undefined &&
    pt_amount !== null &&
    pt_amount !== ''

  const ptAmount =
    ptAmountProvided
      ? Number(pt_amount)
      : null

  if (
    ptAmount !== null &&
    (
      !Number.isFinite(
        ptAmount
      ) ||
      ptAmount < 0
    )
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          'Professional Tax amount must be zero or positive.',
      },
      {
        status: 400,
      }
    )
  }

  const ptApplicable =
    typeof pt_applicable ===
      'boolean'
      ? pt_applicable
      : ptAmount !== null &&
        ptAmount > 0

  const normalizedPtState =
    typeof pt_state ===
      'string'
      ? pt_state.trim()
      : ''

  if (
    ptApplicable &&
    !ptAmountProvided
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          'Professional Tax amount is required when Professional Tax is applicable.',
      },
      {
        status: 400,
      }
    )
  }

  if (
    ptApplicable &&
    !normalizedPtState
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          'PT State is required when Professional Tax is applicable.',
      },
      {
        status: 400,
      }
    )
  }

  /* -------------------------------------------------------
     RESOLVE COMPONENT DEFINITIONS
     ------------------------------------------------------- */

  const resolvedComponents:
    Array<{
      componentId: string
      code: string
      name: string
      type: string
      monthlyAmount: number
      annualAmount: number
      calculationType: string
    }> = []

  for (
    const component of
      requestedComponents
  ) {
    let code =
      String(
        component.code ||
          component
            .component_code ||
          ''
      )
        .trim()
        .toUpperCase()

    if (
      code === 'SPECIAL'
    ) {
      code =
        'SPECIAL_ALLOWANCE'
    }

    if (!code) {
      continue
    }

    const monthlyAmount =
      Number(
        component
          .monthly_amount ??
          component.monthly ??
          0
      )

    if (
      !Number.isFinite(
        monthlyAmount
      ) ||
      monthlyAmount < 0
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            `Invalid monthly amount for ${code}.`,
        },
        {
          status: 400,
        }
      )
    }

    const annualAmount =
      Number(
        component
          .annual_amount ??
          component.annual ??
          monthlyAmount * 12
      )

    if (
      !Number.isFinite(
        annualAmount
      ) ||
      annualAmount < 0
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            `Invalid annual amount for ${code}.`,
        },
        {
          status: 400,
        }
      )
    }

    const {
      data: definition,
      error: definitionError,
    } = await supabase
      .from(
        'salary_components'
      )
      .select(
        'id, code, name, type'
      )
      .eq(
        'company_id',
        context.companyId
      )
      .eq(
        'code',
        code
      )
      .eq(
        'is_active',
        true
      )
      .maybeSingle()

    if (definitionError) {
      return NextResponse.json(
        {
          success: false,
          error:
            definitionError.message,
        },
        {
          status: 500,
        }
      )
    }

    if (!definition) {
      return NextResponse.json(
        {
          success: false,
          error:
            `Salary component "${code}" is not configured for this company.`,
        },
        {
          status: 400,
        }
      )
    }

    resolvedComponents.push({
      componentId:
        definition.id,

      code:
        definition.code,

      name:
        definition.name,

      type:
        definition.type,

      monthlyAmount,

      annualAmount,

      calculationType:
        component
          .calculation_type ||
        'fixed',
    })
  }

  /* -------------------------------------------------------
     GROSS RECONCILIATION
     ------------------------------------------------------- */

  const earningComponents =
    resolvedComponents.filter(
      component =>
        component.type ===
        'earning'
    )

  const earningsTotal =
    earningComponents.reduce(
      (
        total,
        component
      ) =>
        Decimal.from(total)
          .add(
            component
              .monthlyAmount
          )
          .toNumber(),
      0
    )

  if (
    earningComponents.length >
      0 &&
    Math.abs(
      earningsTotal -
        gross
    ) > 0.01
  ) {
    return NextResponse.json(
      {
        success: false,

        error:
          `Component total ₹${earningsTotal.toLocaleString(
            'en-IN'
          )} does not match Monthly Gross ₹${gross.toLocaleString(
            'en-IN'
          )}.`,
      },
      {
        status: 400,
      }
    )
  }

  /* -------------------------------------------------------
     FIND STRUCTURE THAT PRECEDES THIS REVISION

     We intentionally do not rely on status='active' alone.

     Future-dated revisions can exist, so compensation
     history must be considered chronologically.
     ------------------------------------------------------- */

  const {
    data: existingStructures,
    error:
      existingStructuresError,
  } = await supabase
    .from('salary_structures')
    .select(`
      id,
      annual_ctc,
      effective_from,
      effective_until,
      status
    `)
    .eq(
      'company_id',
      context.companyId
    )
    .eq(
      'employee_id',
      employeeId
    )
    .order(
      'effective_from',
      {
        ascending: false,
      }
    )

  if (existingStructuresError) {
    return NextResponse.json(
      {
        success: false,
        error:
          existingStructuresError
            .message,
      },
      {
        status: 500,
      }
    )
  }

  /*
   * Prevent duplicate compensation boundaries.
   *
   * Two structures for the same employee must not start on
   * the exact same effective date.
   */
  const duplicateEffectiveDate =
    (
      existingStructures || []
    ).find(
      structure =>
        normalizeDateOnly(
          structure.effective_from
        ) === effectiveDate
    )

  if (duplicateEffectiveDate) {
    return NextResponse.json(
      {
        success: false,
        error:
          `A salary structure already exists with effective date ${effectiveDate}.`,
      },
      {
        status: 409,
      }
    )
  }

  /*
   * Find the most recent activated structure whose start date
   * is before the new revision.
   */
  const previousStructure =
    (
      existingStructures || []
    ).find(
      structure => {
        const from =
          normalizeDateOnly(
            structure.effective_from
          )

        return (
          from !== null &&
          from < effectiveDate &&
          [
            'active',
            'superseded',
          ].includes(
            String(
              structure.status
            )
          )
        )
      }
    ) || null

  /*
   * Do not permit insertion into the middle of an already
   * established later compensation timeline through this
   * endpoint.
   *
   * That would require rebuilding multiple effective_until
   * boundaries and is a separate correction workflow.
   */
  const laterStructure =
    (
      existingStructures || []
    ).find(
      structure => {
        const from =
          normalizeDateOnly(
            structure.effective_from
          )

        return (
          from !== null &&
          from > effectiveDate &&
          [
            'active',
            'superseded',
          ].includes(
            String(
              structure.status
            )
          )
        )
      }
    )

  if (laterStructure) {
    return NextResponse.json(
      {
        success: false,
        error:
          'A later compensation revision already exists. Insertions into the middle of compensation history are not allowed through this workflow.',
      },
      {
        status: 409,
      }
    )
  }

  const previousEnd =
    previousDate(
      effectiveDate
    )

  if (!previousEnd) {
    return NextResponse.json(
      {
        success: false,
        error:
          'Unable to calculate the previous compensation end date.',
      },
      {
        status: 400,
      }
    )
  }

  /* -------------------------------------------------------
     CREATE REVISION
     ------------------------------------------------------- */

  const oldCtc =
    Number(
      previousStructure
        ?.annual_ctc || 0
    )

  const {
    data: revision,
    error: revisionError,
  } = await supabase
    .from('salary_revisions')
    .insert({
      company_id:
        context.companyId,

      employee_id:
        employeeId,

      old_salary_structure_id:
        previousStructure?.id ||
        null,

      old_ctc:
        oldCtc,

      new_ctc:
        ctc,

      increment_amount:
        ctc - oldCtc,

      increment_percentage:
        oldCtc > 0
          ? (
              (
                ctc -
                oldCtc
              ) /
              oldCtc
            ) *
            100
          : 0,

      effective_date:
        effectiveDate,

      reason:
        reason ||
        'Compensation structure revision',

      status:
        'activated',

      requested_by:
        context.authUserId,

      approved_by:
        context.authUserId,

      approved_at:
        new Date()
          .toISOString(),
    })
    .select('id')
    .single()

  if (
    revisionError ||
    !revision
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          revisionError?.message ||
          'Unable to create compensation revision.',
      },
      {
        status: 500,
      }
    )
  }

  /* -------------------------------------------------------
     CREATE NEW STRUCTURE
     ------------------------------------------------------- */

  const {
    data: newStructure,
    error: structureError,
  } = await supabase
    .from('salary_structures')
    .insert({
      company_id:
        context.companyId,

      employee_id:
        employeeId,

      annual_ctc:
        ctc,

      monthly_gross:
        gross,

      effective_from:
        effectiveDate,

      effective_until:
        null,

      /*
       * Lifecycle is activated now, but entitlement is
       * determined by effective dates in
       * getEffectiveCompensation().
       *
       * Therefore a future-dated active row cannot become
       * current prematurely.
       */
      status:
        'active',

      revision_id:
        revision.id,

      notes:
        resolvedComponents.length ===
        0
          ? 'Salary structure incomplete.'
          : null,

      created_by:
        context.authUserId,

      approved_by:
        context.authUserId,

      approved_at:
        new Date()
          .toISOString(),
    })
    .select('id')
    .single()

  if (
    structureError ||
    !newStructure
  ) {
    await supabase
      .from('salary_revisions')
      .delete()
      .eq(
        'id',
        revision.id
      )

    return NextResponse.json(
      {
        success: false,
        error:
          structureError?.message ||
          'Unable to create salary structure.',
      },
      {
        status: 500,
      }
    )
  }

  /* -------------------------------------------------------
     CREATE COMPONENT SNAPSHOT
     ------------------------------------------------------- */

  if (
    resolvedComponents.length >
    0
  ) {
    const rows =
      resolvedComponents.map(
        component => ({
          salary_structure_id:
            newStructure.id,

          component_id:
            component.componentId,

          monthly_amount:
            component.monthlyAmount,

          annual_amount:
            component.annualAmount,

          calculation_type:
            component
              .calculationType,

          is_active:
            true,
        })
      )

    const {
      error: componentError,
    } = await supabase
      .from(
        'salary_structure_components'
      )
      .insert(rows)

    if (componentError) {
      await supabase
        .from(
          'salary_structures'
        )
        .delete()
        .eq(
          'id',
          newStructure.id
        )

      await supabase
        .from(
          'salary_revisions'
        )
        .delete()
        .eq(
          'id',
          revision.id
        )

      return NextResponse.json(
        {
          success: false,
          error:
            componentError.message,
        },
        {
          status: 500,
        }
      )
    }
  }

  /* -------------------------------------------------------
     UPDATE EMPLOYEE PT CONFIGURATION

     No state is invented.

     PT OFF:
       pt_applicable = false
       pt_amount = null
       pt_state = null

     PT ON:
       pt_applicable = true
       explicit amount
       explicit state
     ------------------------------------------------------- */

  const {
    data: existingStatutory,
    error:
      existingStatutoryError,
  } = await supabase
    .from(
      'employee_statutory_details'
    )
    .select('id')
    .eq(
      'employee_id',
      employeeId
    )
    .maybeSingle()

  if (
    existingStatutoryError
  ) {
    /*
     * Compensation rows have already been created.
     * Remove them before returning so a PT read failure does
     * not leave a partially-created compensation revision.
     */
    await supabase
      .from(
        'salary_structures'
      )
      .delete()
      .eq(
        'id',
        newStructure.id
      )

    await supabase
      .from(
        'salary_revisions'
      )
      .delete()
      .eq(
        'id',
        revision.id
      )

    return NextResponse.json(
      {
        success: false,
        error:
          existingStatutoryError
            .message,
      },
      {
        status: 500,
      }
    )
  }

  const statutoryPayload = {
    pt_applicable:
      ptApplicable,

    pt_amount:
      ptApplicable
        ? ptAmount
        : null,

    pt_state:
      ptApplicable
        ? normalizedPtState
        : null,
  }

  if (existingStatutory) {
    const {
      error: statutoryError,
    } = await supabase
      .from(
        'employee_statutory_details'
      )
      .update(
        statutoryPayload
      )
      .eq(
        'id',
        existingStatutory.id
      )

    if (statutoryError) {
      await supabase
        .from(
          'salary_structures'
        )
        .delete()
        .eq(
          'id',
          newStructure.id
        )

      await supabase
        .from(
          'salary_revisions'
        )
        .delete()
        .eq(
          'id',
          revision.id
        )

      return NextResponse.json(
        {
          success: false,
          error:
            statutoryError.message,
        },
        {
          status: 500,
        }
      )
    }
  } else {
    const {
      error: statutoryError,
    } = await supabase
      .from(
        'employee_statutory_details'
      )
      .insert({
        employee_id:
          employeeId,

        ...statutoryPayload,
      })

    if (statutoryError) {
      await supabase
        .from(
          'salary_structures'
        )
        .delete()
        .eq(
          'id',
          newStructure.id
        )

      await supabase
        .from(
          'salary_revisions'
        )
        .delete()
        .eq(
          'id',
          revision.id
        )

      return NextResponse.json(
        {
          success: false,
          error:
            statutoryError.message,
        },
        {
          status: 500,
        }
      )
    }
  }

  /* -------------------------------------------------------
     CLOSE PREVIOUS STRUCTURE

     This happens only after:
     - revision creation
     - new structure creation
     - component creation
     - statutory update

     A future revision may therefore make the previous
     structure status "superseded" before its effective_until
     date.

     That is safe because the canonical compensation service
     now allows an ACTIVE or SUPERSEDED structure when its
     effective interval covers the requested date.
     ------------------------------------------------------- */

  if (previousStructure) {
    const {
      error: supersedeError,
    } = await supabase
      .from(
        'salary_structures'
      )
      .update({
        status:
          'superseded',

        effective_until:
          previousEnd,
      })
      .eq(
        'id',
        previousStructure.id
      )

    if (supersedeError) {
      return NextResponse.json(
        {
          success: false,
          error:
            supersedeError.message,
        },
        {
          status: 500,
        }
      )
    }
  }

  /* -------------------------------------------------------
     LINK REVISION TO NEW STRUCTURE
     ------------------------------------------------------- */

  const {
    error: revisionLinkError,
  } = await supabase
    .from('salary_revisions')
    .update({
      new_salary_structure_id:
        newStructure.id,
    })
    .eq(
      'id',
      revision.id
    )

  if (revisionLinkError) {
    return NextResponse.json(
      {
        success: false,
        error:
          revisionLinkError.message,
      },
      {
        status: 500,
      }
    )
  }

  /* -------------------------------------------------------
     FINAL CANONICAL CURRENT RESULT
     ------------------------------------------------------- */

  const updated =
    await getEffectiveCompensation(
      employeeId,
      context.companyId
    )

  return NextResponse.json({
    success: true,

    message:
      updated.isComplete
        ? 'Salary structure updated successfully.'
        : 'Salary structure saved but remains incomplete.',

    revisionId:
      revision.id,

    newStructureId:
      newStructure.id,

    effectiveDate,

    compensation:
      updated,
  })
}