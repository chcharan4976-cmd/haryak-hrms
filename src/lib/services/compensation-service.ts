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
  status: 'active' | 'review_required' | 'draft' | 'superseded' | 'none'
  components: EffectiveComponent[]
  isComplete: boolean
  incompletenessReasons: string[]
  grossEarningsFromComponents: number
  totalDeductionsFromComponents: number
  hasBasic: boolean
  hasHra: boolean
  rawStructure?: any
}

/**
 * Authoritative Canonical Compensation Service.
 * Used by:
 * - Employee Profile Compensation tab
 * - Payroll Run
 * - Payroll Readiness
 * - Payslip generation
 * - AI salary explanation
 * - Reports
 * 
 * NEVER fabricates fallback proportions (e.g. 50/25/remainder).
 * If components are missing, reports isComplete: false with clear reasons.
 */
export async function getEffectiveCompensation(
  employeeId: string,
  companyId: string,
  periodEndDate?: string | null
): Promise<EffectiveCompensation> {
  const admin = createAdminClient()
  if (!admin) {
    return {
      structureId: null,
      annualCtc: 0,
      monthlyGross: 0,
      effectiveFrom: null,
      effectiveUntil: null,
      status: 'none',
      components: [],
      isComplete: false,
      incompletenessReasons: ['Database unavailable'],
      grossEarningsFromComponents: 0,
      totalDeductionsFromComponents: 0,
      hasBasic: false,
      hasHra: false,
    }
  }

  // First, verify employee exists and resolve UUID if employee_code was passed
  let resolvedEmpId = employeeId
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(employeeId)
  if (!isUUID) {
    const { data: emp } = await admin
      .from('employees')
      .select('id')
      .eq('company_id', companyId)
      .eq('employee_code', employeeId.toUpperCase())
      .maybeSingle()
    if (emp?.id) {
      resolvedEmpId = emp.id
    }
  }

  // Query salary structures for this employee
  let query = admin
    .from('salary_structures')
    .select('*')
    .eq('employee_id', resolvedEmpId)
    .eq('company_id', companyId)
    .order('effective_from', { ascending: false })

  if (periodEndDate) {
    query = query.lte('effective_from', periodEndDate)
  }

  const { data: structures, error: structErr } = await query

  if (structErr || !structures || structures.length === 0) {
    return {
      structureId: null,
      annualCtc: 0,
      monthlyGross: 0,
      effectiveFrom: null,
      effectiveUntil: null,
      status: 'none',
      components: [],
      isComplete: false,
      incompletenessReasons: ['No salary structure assigned to this employee.'],
      grossEarningsFromComponents: 0,
      totalDeductionsFromComponents: 0,
      hasBasic: false,
      hasHra: false,
    }
  }

  // Active structure priority: active status first, then newest
  const activeStructure = structures.find((s: any) => s.status === 'active') || structures[0]

  const annualCtc = Number(activeStructure.annual_ctc || 0)
  const monthlyGross = Number(activeStructure.monthly_gross || 0)

  // Flag review_required or scaling anomaly
  if (activeStructure.status === 'review_required' || (monthlyGross > annualCtc && annualCtc > 0)) {
    return {
      structureId: activeStructure.id,
      annualCtc,
      monthlyGross,
      effectiveFrom: activeStructure.effective_from,
      effectiveUntil: activeStructure.effective_until,
      status: 'review_required',
      components: [],
      isComplete: false,
      incompletenessReasons: ['Salary structure marked DATA_REVIEW_REQUIRED due to scaling anomaly.'],
      grossEarningsFromComponents: 0,
      totalDeductionsFromComponents: 0,
      hasBasic: false,
      hasHra: false,
      rawStructure: activeStructure,
    }
  }

  // Fetch components
  const { data: rawComponents, error: compErr } = await admin
    .from('salary_structure_components')
    .select('*, component:component_id(*)')
    .eq('salary_structure_id', activeStructure.id)
    .eq('is_active', true)

  const components: EffectiveComponent[] = (rawComponents || []).map((sc: any) => ({
    id: sc.id,
    componentId: sc.component_id,
    name: sc.component?.name || 'Component',
    code: sc.component?.code || '',
    type: (sc.component?.type || 'earning') as 'earning' | 'deduction',
    category: sc.component?.category || 'custom',
    monthlyAmount: Number(sc.monthly_amount || 0),
    annualAmount: Number(sc.annual_amount || 0),
    isTaxable: sc.component?.is_taxable ?? true,
    isStatutory: sc.component?.is_statutory ?? false,
    sortOrder: sc.component?.sort_order || 0,
    isActive: sc.is_active ?? true,
  }))

  // Sort by sortOrder
  components.sort((a, b) => a.sortOrder - b.sortOrder)

  const earningComps = components.filter(c => c.type === 'earning')
  const deductionComps = components.filter(c => c.type === 'deduction')

  const grossEarningsFromComponents = earningComps.reduce(
    (sum, c) => Decimal.from(sum).add(c.monthlyAmount).toNumber(),
    0
  )
  const totalDeductionsFromComponents = deductionComps.reduce(
    (sum, c) => Decimal.from(sum).add(c.monthlyAmount).toNumber(),
    0
  )

  const hasBasic = earningComps.some(c => c.code.toUpperCase() === 'BASIC' && c.monthlyAmount > 0)
  const hasHra = earningComps.some(c => c.code.toUpperCase() === 'HRA')

  const incompletenessReasons: string[] = []

  if (earningComps.length === 0) {
    incompletenessReasons.push(
      'Salary structure incomplete. Configure earning and deduction components before payroll.'
    )
  } else if (monthlyGross > 0 && Math.abs(grossEarningsFromComponents - monthlyGross) > 1.0) {
    incompletenessReasons.push(
      `Sum of earning components (₹${grossEarningsFromComponents.toLocaleString('en-IN')}) does not match monthly gross entitlement (₹${monthlyGross.toLocaleString('en-IN')}).`
    )
  }

  if (activeStructure.status !== 'active') {
    incompletenessReasons.push(`Salary structure status is "${activeStructure.status}", not active.`)
  }

  const isComplete = incompletenessReasons.length === 0

  return {
    structureId: activeStructure.id,
    annualCtc,
    monthlyGross,
    effectiveFrom: activeStructure.effective_from,
    effectiveUntil: activeStructure.effective_until,
    status: activeStructure.status,
    components,
    isComplete,
    incompletenessReasons,
    grossEarningsFromComponents,
    totalDeductionsFromComponents,
    hasBasic,
    hasHra,
    rawStructure: activeStructure,
  }
}
