import { createAdminClient } from '@/lib/supabase/admin'
import { Decimal } from '@/lib/utils/decimal'

export interface EffectiveComponent {
  id: string
  componentId: string
  name: string
  code: string
  type: 'earning' | 'deduction'
  category: string
  monthlyAmount: number
  annualAmount: number
  isTaxable: boolean
  isStatutory: boolean
  sortOrder: number
  isActive: boolean
}

export interface EffectiveCompensation {
  structureId: string | null
  annualCtc: number
  monthlyGross: number
  effectiveFrom: string | null
  effectiveUntil: string | null
  status:
    | 'active'
    | 'review_required'
    | 'draft'
    | 'superseded'
    | 'none'
  components: EffectiveComponent[]
  isComplete: boolean
  incompletenessReasons: string[]
  grossEarningsFromComponents: number
  totalDeductionsFromComponents: number
  hasBasic: boolean
  hasHra: boolean
  rawStructure?: any
}

/* =========================================================
   EMPTY RESULT
   ========================================================= */

function emptyCompensation(
  reason: string
): EffectiveCompensation {
  return {
    structureId: null,
    annualCtc: 0,
    monthlyGross: 0,
    effectiveFrom: null,
    effectiveUntil: null,
    status: 'none',
    components: [],
    isComplete: false,
    incompletenessReasons: [reason],
    grossEarningsFromComponents: 0,
    totalDeductionsFromComponents: 0,
    hasBasic: false,
    hasHra: false,
  }
}

/* =========================================================
   DATE HELPERS

   Salary dates are DATE values, not timestamps.

   Keep comparisons as YYYY-MM-DD strings so timezone
   conversion cannot move a compensation revision into the
   previous or next day.
   ========================================================= */

function normalizeDateOnly(
  value: string | null | undefined
): string | null {
  if (!value) {
    return null
  }

  const date = String(value)
    .trim()
    .slice(0, 10)

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      date
    )
  ) {
    return null
  }

  return date
}

/**
 * Return today's date as YYYY-MM-DD.
 *
 * Compensation effective dates are DATE values. We therefore
 * deliberately keep all comparisons date-only instead of
 * converting compensation dates into local timestamps.
 */
function getTodayDateOnly(): string {
  return new Date()
    .toISOString()
    .slice(0, 10)
}

/**
 * Determines whether a salary structure is effective for the
 * supplied date.
 *
 * Valid interval:
 *
 * effective_from <= targetDate
 *
 * AND
 *
 * effective_until IS NULL
 * OR
 * effective_until >= targetDate
 */
function structureCoversDate(
  structure: any,
  targetDate: string
): boolean {
  const effectiveFrom =
    normalizeDateOnly(
      structure?.effective_from
    )

  const effectiveUntil =
    normalizeDateOnly(
      structure?.effective_until
    )

  if (!effectiveFrom) {
    return false
  }

  if (
    effectiveFrom >
    targetDate
  ) {
    return false
  }

  if (
    effectiveUntil &&
    effectiveUntil <
      targetDate
  ) {
    return false
  }

  return true
}

/**
 * Only activated compensation history may be used for
 * entitlement/payroll.
 *
 * ACTIVE:
 *   Normal/current activated structure.
 *
 * SUPERSEDED:
 *   Historical activated structure that was replaced by a
 *   later revision.
 *
 * A superseded structure can still be the correct structure
 * for:
 *
 * - historical payroll, or
 * - today's date when a future-dated revision has already
 *   been created and the previous structure was closed with
 *   a future effective_until.
 *
 * Draft/review/inactive structures must never silently enter
 * payroll.
 */
function isPayrollEligibleStatus(
  status: unknown
): boolean {
  return [
    'active',
    'superseded',
  ].includes(
    String(status || '')
  )
}

/* =========================================================
   AUTHORITATIVE CANONICAL COMPENSATION SERVICE

   Used by:
   - Employee Profile Compensation tab
   - Payroll Run
   - Payroll Readiness
   - Payslip generation
   - AI salary explanation
   - Reports

   IMPORTANT:
   - Never fabricates fallback salary proportions.
   - Effective dates are authoritative.
   - Current compensation is the eligible structure whose
     effective interval contains TODAY.
   - Historical compensation is the eligible structure whose
     effective interval contains the requested payroll date.
   - Future-dated salary revisions must never become current
     before effective_from.
   - Later revisions must never replace historical
     compensation for earlier payroll periods.
   ========================================================= */

export async function getEffectiveCompensation(
  employeeId: string,
  companyId: string,
  periodEndDate?: string | null
): Promise<EffectiveCompensation> {
  const admin =
    createAdminClient()

  if (!admin) {
    return emptyCompensation(
      'Database unavailable'
    )
  }

  /* -------------------------------------------------------
     RESOLVE EMPLOYEE UUID
     ------------------------------------------------------- */

  let resolvedEmpId =
    employeeId

  const isUUID =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      employeeId
    )

  if (!isUUID) {
    const {
      data: emp,
      error: employeeError,
    } = await admin
      .from('employees')
      .select('id')
      .eq(
        'company_id',
        companyId
      )
      .eq(
        'employee_code',
        employeeId.toUpperCase()
      )
      .maybeSingle()

    if (employeeError) {
      return emptyCompensation(
        employeeError.message
      )
    }

    if (!emp?.id) {
      return emptyCompensation(
        'Employee not found.'
      )
    }

    resolvedEmpId =
      emp.id
  }

  /* -------------------------------------------------------
     LOAD ALL SALARY STRUCTURES

     Do NOT filter by status at database level.

     Historical payroll may legitimately need a superseded
     structure.

     Future revisions may also exist in the same history.
     Effective-date selection below decides which structure
     actually applies.
     ------------------------------------------------------- */

  const {
    data: structures,
    error: structErr,
  } = await admin
    .from('salary_structures')
    .select('*')
    .eq(
      'employee_id',
      resolvedEmpId
    )
    .eq(
      'company_id',
      companyId
    )
    .order(
      'effective_from',
      {
        ascending: false,
      }
    )

  if (structErr) {
    return emptyCompensation(
      structErr.message
    )
  }

  if (
    !structures ||
    structures.length === 0
  ) {
    return emptyCompensation(
      'No salary structure assigned to this employee.'
    )
  }

  /* -------------------------------------------------------
     SELECT EFFECTIVE STRUCTURE
     ------------------------------------------------------- */

  let effectiveStructure:
    any | null = null

  const requestedPeriodEnd =
    normalizeDateOnly(
      periodEndDate
    )

  if (periodEndDate) {
    if (!requestedPeriodEnd) {
      return emptyCompensation(
        'Invalid payroll period end date.'
      )
    }

    /**
     * HISTORICAL / PERIOD-SPECIFIC LOOKUP
     *
     * Effective dates are authoritative.
     *
     * The structure must:
     *
     * 1. Cover the requested payroll date.
     * 2. Represent an activated compensation state.
     *
     * A superseded structure is intentionally allowed because
     * it may be the historically correct salary for that
     * payroll period.
     */
    effectiveStructure =
      structures.find(
        (structure: any) =>
          structureCoversDate(
            structure,
            requestedPeriodEnd
          ) &&
          isPayrollEligibleStatus(
            structure.status
          )
      ) || null
  } else {
    /**
     * CURRENT LOOKUP
     *
     * IMPORTANT:
     *
     * Do NOT simply select status === "active".
     *
     * Example:
     *
     * Today:
     *   2026-09-19
     *
     * New hike:
     *   effective_from = 2026-10-01
     *
     * The future structure may already exist and may already
     * have status "active", but it must NOT become the
     * employee's current compensation before 2026-10-01.
     *
     * Conversely, the previous structure may already be
     * "superseded", but if its effective_until is 2026-09-30,
     * it remains the correct compensation on 2026-09-19.
     *
     * Therefore:
     *
     * DATE INTERVAL + ELIGIBLE LIFECYCLE STATUS
     *
     * determines current compensation.
     */
    const today =
      getTodayDateOnly()

    effectiveStructure =
      structures.find(
        (structure: any) =>
          structureCoversDate(
            structure,
            today
          ) &&
          isPayrollEligibleStatus(
            structure.status
          )
      ) || null
  }

  if (!effectiveStructure) {
    if (requestedPeriodEnd) {
      return emptyCompensation(
        `No eligible salary structure is effective for ${requestedPeriodEnd}.`
      )
    }

    return emptyCompensation(
      'No eligible salary structure is effective for the current date.'
    )
  }

  /* -------------------------------------------------------
     CORE ENTITLEMENT
     ------------------------------------------------------- */

  const annualCtc =
    Number(
      effectiveStructure
        .annual_ctc || 0
    )

  const monthlyGross =
    Number(
      effectiveStructure
        .monthly_gross || 0
    )

  /* -------------------------------------------------------
     DATA REVIEW / SCALING ANOMALY
     ------------------------------------------------------- */

  if (
    effectiveStructure.status ===
      'review_required' ||
    (
      monthlyGross >
        annualCtc &&
      annualCtc > 0
    )
  ) {
    return {
      structureId:
        effectiveStructure.id,

      annualCtc,

      monthlyGross,

      effectiveFrom:
        effectiveStructure
          .effective_from,

      effectiveUntil:
        effectiveStructure
          .effective_until,

      status:
        'review_required',

      components: [],

      isComplete: false,

      incompletenessReasons: [
        'Salary structure marked DATA_REVIEW_REQUIRED due to scaling anomaly.',
      ],

      grossEarningsFromComponents:
        0,

      totalDeductionsFromComponents:
        0,

      hasBasic: false,

      hasHra: false,

      rawStructure:
        effectiveStructure,
    }
  }

  /* -------------------------------------------------------
     COMPONENTS
     ------------------------------------------------------- */

  const {
    data: rawComponents,
    error: compErr,
  } = await admin
    .from(
      'salary_structure_components'
    )
    .select(
      '*, component:component_id(*)'
    )
    .eq(
      'salary_structure_id',
      effectiveStructure.id
    )
    .eq(
      'is_active',
      true
    )

  if (compErr) {
    return {
      structureId:
        effectiveStructure.id,

      annualCtc,

      monthlyGross,

      effectiveFrom:
        effectiveStructure
          .effective_from,

      effectiveUntil:
        effectiveStructure
          .effective_until,

      status:
        effectiveStructure.status,

      components: [],

      isComplete: false,

      incompletenessReasons: [
        `Unable to load salary components: ${compErr.message}`,
      ],

      grossEarningsFromComponents:
        0,

      totalDeductionsFromComponents:
        0,

      hasBasic: false,

      hasHra: false,

      rawStructure:
        effectiveStructure,
    }
  }

  const components:
    EffectiveComponent[] =
    (rawComponents || []).map(
      (sc: any) => ({
        id:
          sc.id,

        componentId:
          sc.component_id,

        name:
          sc.component?.name ||
          'Component',

        code:
          sc.component?.code ||
          '',

        type:
          (
            sc.component?.type ||
            'earning'
          ) as
            | 'earning'
            | 'deduction',

        category:
          sc.component?.category ||
          'custom',

        monthlyAmount:
          Number(
            sc.monthly_amount ||
            0
          ),

        annualAmount:
          Number(
            sc.annual_amount ||
            0
          ),

        isTaxable:
          sc.component
            ?.is_taxable ??
          true,

        isStatutory:
          sc.component
            ?.is_statutory ??
          false,

        sortOrder:
          sc.component
            ?.sort_order ||
          0,

        isActive:
          sc.is_active ??
          true,
      })
    )

  components.sort(
    (a, b) =>
      a.sortOrder -
      b.sortOrder
  )

  /* -------------------------------------------------------
     COMPONENT RECONCILIATION
     ------------------------------------------------------- */

  const earningComps =
    components.filter(
      component =>
        component.type ===
        'earning'
    )

  const deductionComps =
    components.filter(
      component =>
        component.type ===
        'deduction'
    )

  const grossEarningsFromComponents =
    earningComps.reduce(
      (
        sum,
        component
      ) =>
        Decimal.from(sum)
          .add(
            component
              .monthlyAmount
          )
          .toNumber(),
      0
    )

  const totalDeductionsFromComponents =
    deductionComps.reduce(
      (
        sum,
        component
      ) =>
        Decimal.from(sum)
          .add(
            component
              .monthlyAmount
          )
          .toNumber(),
      0
    )

  const hasBasic =
    earningComps.some(
      component =>
        component.code
          .toUpperCase() ===
          'BASIC' &&
        component
          .monthlyAmount >
          0
    )

  const hasHra =
    earningComps.some(
      component =>
        component.code
          .toUpperCase() ===
          'HRA'
    )

  const incompletenessReasons:
    string[] = []

  /* -------------------------------------------------------
     COMPONENT COMPLETENESS
     ------------------------------------------------------- */

  if (
    earningComps.length ===
    0
  ) {
    incompletenessReasons.push(
      'Salary structure incomplete. Configure earning and deduction components before payroll.'
    )
  } else if (
    monthlyGross > 0 &&
    Math.abs(
      grossEarningsFromComponents -
        monthlyGross
    ) > 1.0
  ) {
    incompletenessReasons.push(
      `Sum of earning components (₹${grossEarningsFromComponents.toLocaleString(
        'en-IN'
      )}) does not match monthly gross entitlement (₹${monthlyGross.toLocaleString(
        'en-IN'
      )}).`
    )
  }

  /* -------------------------------------------------------
     STATUS ELIGIBILITY

     Effective dates decide WHICH structure applies.

     Status decides whether that structure represents an
     activated compensation state.

     ACTIVE and SUPERSEDED are both valid because:
     - active = activated/current lifecycle structure
     - superseded = previously activated historical structure

     Draft/review/inactive structures are never silently used.
     ------------------------------------------------------- */

  if (
    !isPayrollEligibleStatus(
      effectiveStructure.status
    )
  ) {
    incompletenessReasons.push(
      `Salary structure status is "${effectiveStructure.status}" and is not eligible for compensation or payroll.`
    )
  }

  const isComplete =
    incompletenessReasons
      .length === 0

  return {
    structureId:
      effectiveStructure.id,

    annualCtc,

    monthlyGross,

    effectiveFrom:
      effectiveStructure
        .effective_from,

    effectiveUntil:
      effectiveStructure
        .effective_until,

    status:
      effectiveStructure.status,

    components,

    isComplete,

    incompletenessReasons,

    grossEarningsFromComponents,

    totalDeductionsFromComponents,

    hasBasic,

    hasHra,

    rawStructure:
      effectiveStructure,
  }
}