/**
 * Haryak Technologies India Private Limited — Payroll Calculation Engine
 *
 * Core deterministic business logic for employee payroll.
 *
 * IMPORTANT:
 * - No AI/LLM calls.
 * - No hardcoded payable working days.
 * - Missing timesheet alone must NOT become LOP.
 * - LOP/unpaid absence must come from validated attendance + leave rules.
 * - Statutory configuration must be reviewed by the company's
 *   authorized payroll/accounting professional.
 */

import type {
  Employee,
  SalaryStructure,
  SalaryStructureComponent,
  SalaryComponent,
  PayrollPeriod,
  PayrollSettings,
  StatutoryRule,
} from '@/lib/types'

import { Decimal } from '@/lib/utils/decimal'

// ============================================================
// Types
// ============================================================

export interface PayrollInput {
  employee: Employee

  salaryStructure: SalaryStructure

  salaryComponents: (
    SalaryStructureComponent & {
      component: SalaryComponent
    }
  )[]

  period: PayrollPeriod

  settings: PayrollSettings

  statutoryRules: StatutoryRule[]

  // Attendance / payroll-day inputs
  calendarDays: number
  workingDays: number
  paidDays: number
  lopDays: number

  // Variable inputs
  variablePay?: VariablePayInput[]

  reimbursements?: ReimbursementInput[]

  additionalDeductions?: AdditionalDeductionInput[]

  // YTD from previous approved payrolls
  ytdGrossEarnings: number
  ytdPfContribution: number
  ytdProfessionalTax: number
  ytdIncomeTax: number
  ytdNetPay: number

  // Statutory details
  pfApplicable: boolean
  esiApplicable: boolean
  ptApplicable: boolean
  ptState: string

  ptAmount?: number | null
  pfAmount?: number | null

  taxRegime: 'old' | 'new'

  annualCTC: number
}

export interface VariablePayInput {
  componentName: string
  componentCode: string
  amount: number
  description?: string
}

export interface ReimbursementInput {
  componentName: string
  componentCode: string
  amount: number
  description?: string
}

export interface AdditionalDeductionInput {
  componentName: string
  componentCode: string
  amount: number
  description?: string
  isStatutory: boolean
}

export interface PayrollCalculationResult {
  earnings: CalculatedEarning[]

  deductions: CalculatedDeduction[]

  monthlyGrossEntitlement: number

  perDayGrossRate: number

  lopDeduction: number

  proratedFixedGross: number

  grossEarnings: number

  totalDeductions: number

  netSalary: number

  warnings: PayrollWarning[]

  errors: PayrollError[]

  calculationDetails: {
    calendarDays: number
    workingDays: number
    paidDays: number
    lopDays: number
    paidDayFactor: number

    monthlyGrossEntitlement: number

    perDayGrossRate: number

    lopDeduction: number

    proratedFixedGross: number

    variablePay: number

    reimbursements: number

    finalGrossEarnings: number

    totalDeductions: number

    netSalary: number

    annualCTC: number
  }
}

export interface CalculatedEarning {
  componentId?: string

  componentName: string

  componentCode: string

  monthlyEntitlement: number

  paidDayFactor: number

  adjustment: number

  finalAmount: number

  isTaxable: boolean

  sortOrder: number

  calculationBreakdown: {
    description: string
    steps: string[]
  }
}

export interface CalculatedDeduction {
  componentId?: string

  componentName: string

  componentCode: string

  amount: number

  isStatutory: boolean

  sortOrder: number

  calculationBreakdown: {
    description: string
    steps: string[]
  }
}

export interface PayrollWarning {
  code: string
  message: string
  field?: string
}

export interface PayrollError {
  code: string
  message: string
  field?: string
}

// ============================================================
// Main Calculation Function
// ============================================================

export function calculatePayroll(
  input: PayrollInput
): PayrollCalculationResult {
  const warnings: PayrollWarning[] = []

  const errors: PayrollError[] = []

  validateInputs(
    input,
    warnings,
    errors
  )

  const monthlyGrossEntitlement =
    roundAmount(
      Number(
        input.salaryStructure?.monthly_gross ||
          0
      ),
      2
    )

  if (errors.length > 0) {
    return {
      earnings: [],

      deductions: [],

      monthlyGrossEntitlement,

      perDayGrossRate: 0,

      lopDeduction: 0,

      proratedFixedGross: 0,

      grossEarnings: 0,

      totalDeductions: 0,

      netSalary: 0,

      warnings,

      errors,

      calculationDetails: {
        calendarDays:
          Number(
            input.calendarDays || 0
          ),

        workingDays:
          Number(
            input.workingDays || 0
          ),

        paidDays:
          Number(
            input.paidDays || 0
          ),

        lopDays:
          Number(
            input.lopDays || 0
          ),

        paidDayFactor: 0,

        monthlyGrossEntitlement,

        perDayGrossRate: 0,

        lopDeduction: 0,

        proratedFixedGross: 0,

        variablePay: 0,

        reimbursements: 0,

        finalGrossEarnings: 0,

        totalDeductions: 0,

        netSalary: 0,

        annualCTC:
          Number(
            input.annualCTC || 0
          ),
      },
    }
  }

  /**
   * IMPORTANT:
   *
   * paidDays must represent payable days after attendance/leave processing.
   *
   * Paid days can include:
   * - present days
   * - approved paid leave
   *
   * Paid days should exclude:
   * - LOP
   * - unpaid leave
   * - confirmed unpaid absence
   *
   * Missing timesheet days alone must NOT be treated as LOP.
   */
  const paidDayFactor =
    input.workingDays > 0
      ? Math.min(
          1,
          Math.max(
            0,
            Number(input.paidDays) /
              Number(
                input.workingDays
              )
          )
        )
      : 0

  /**
   * Example:
   *
   * Monthly gross = ₹10,000
   * Working days = 22
   *
   * Per day = 10000 / 22
   */
  const perDayGrossRate =
    input.workingDays > 0
      ? roundAmount(
          monthlyGrossEntitlement /
            Number(
              input.workingDays
            ),
          2
        )
      : 0

  /**
   * Fixed salary entitlement after proration.
   *
   * This covers:
   * - LOP
   * - mid-month joining
   * - mid-month relieving
   *
   * provided paidDays has been calculated correctly upstream.
   */
  const proratedFixedGross =
    roundAmount(
      monthlyGrossEntitlement *
        paidDayFactor,
      2
    )

  /**
   * Difference between full monthly gross and payable fixed gross.
   */
  const lopDeduction =
    roundAmount(
      monthlyGrossEntitlement -
        proratedFixedGross,
      2
    )

  // ============================================================
  // Fixed Earnings
  // ============================================================

  const earnings =
    calculateEarnings(
      input,
      paidDayFactor,
      warnings
    )

  let totalVariablePay = 0

  let totalReimbursements = 0

  // ============================================================
  // Variable Pay
  // ============================================================

  if (
    input.variablePay
  ) {
    for (
      const vp of
        input.variablePay
    ) {
      const amount =
        roundAmount(
          Number(
            vp.amount || 0
          ),
          2
        )

      totalVariablePay =
        roundAmount(
          totalVariablePay +
            amount,
          2
        )

      earnings.push({
        componentName:
          vp.componentName,

        componentCode:
          vp.componentCode,

        monthlyEntitlement:
          amount,

        paidDayFactor:
          1,

        adjustment:
          0,

        finalAmount:
          amount,

        isTaxable:
          true,

        sortOrder:
          100,

        calculationBreakdown: {
          description:
            `Variable pay: ${vp.componentName}`,

          steps: [
            `Amount: ₹${amount.toFixed(2)}`,

            'Variable pay is not prorated by paid days under the current payroll policy.',
          ],
        },
      })
    }
  }

  // ============================================================
  // Reimbursements
  // ============================================================

  if (
    input.reimbursements
  ) {
    for (
      const reimbursement of
        input.reimbursements
    ) {
      const amount =
        roundAmount(
          Number(
            reimbursement.amount ||
              0
          ),
          2
        )

      totalReimbursements =
        roundAmount(
          totalReimbursements +
            amount,
          2
        )

      earnings.push({
        componentName:
          reimbursement.componentName,

        componentCode:
          reimbursement.componentCode,

        monthlyEntitlement:
          amount,

        paidDayFactor:
          1,

        adjustment:
          0,

        finalAmount:
          amount,

        isTaxable:
          false,

        sortOrder:
          200,

        calculationBreakdown: {
          description:
            `Reimbursement: ${reimbursement.componentName}`,

          steps: [
            `Amount: ₹${amount.toFixed(2)}`,

            'Reimbursements are not prorated by paid days.',
          ],
        },
      })
    }
  }

  // ============================================================
  // Gross Earnings
  // ============================================================

  const grossEarnings =
    roundAmount(
      earnings.reduce(
        (
          sum,
          earning
        ) =>
          sum +
          Number(
            earning.finalAmount ||
              0
          ),
        0
      ),
      2
    )

  // ============================================================
  // Deductions
  // ============================================================

  const deductions =
    calculateDeductions(
      input,
      earnings,
      grossEarnings,
      paidDayFactor,
      warnings
    )

  // ============================================================
  // Additional Deductions
  // ============================================================

  if (
    input.additionalDeductions
  ) {
    for (
      const deduction of
        input.additionalDeductions
    ) {
      const amount =
        roundAmount(
          Number(
            deduction.amount ||
              0
          ),
          2
        )

      deductions.push({
        componentName:
          deduction.componentName,

        componentCode:
          deduction.componentCode,

        amount,

        isStatutory:
          deduction.isStatutory,

        sortOrder:
          100,

        calculationBreakdown: {
          description:
            `Additional deduction: ${deduction.componentName}`,

          steps: [
            `Amount: ₹${amount.toFixed(2)}`,
          ],
        },
      })
    }
  }

  // ============================================================
  // Totals
  // ============================================================

  const totalDeductions =
    roundAmount(
      deductions.reduce(
        (
          sum,
          deduction
        ) =>
          sum +
          Number(
            deduction.amount ||
              0
          ),
        0
      ),
      2
    )

  const netSalary =
    roundAmount(
      grossEarnings -
        totalDeductions,
      2
    )

  // ============================================================
  // Validation / Sanity Checks
  // ============================================================

  if (
    netSalary < 0
  ) {
    errors.push({
      code:
        'NEGATIVE_NET_PAY',

      message:
        `Net salary is negative (₹${netSalary.toFixed(2)}). ` +
        `Total deductions (₹${totalDeductions.toFixed(2)}) exceed ` +
        `gross earnings (₹${grossEarnings.toFixed(2)}).`,
    })
  }

  if (
    netSalary >= 0 &&
    grossEarnings > 0 &&
    netSalary <
      grossEarnings * 0.3
  ) {
    warnings.push({
      code:
        'LOW_NET_PAY',

      message:
        `Net salary (₹${netSalary.toFixed(2)}) is less than 30% ` +
        `of gross earnings (₹${grossEarnings.toFixed(2)}). ` +
        'Please verify payroll deductions.',
    })
  }

  /**
   * Verify fixed earning components reconcile with expected prorated gross.
   */
  const fixedEarningCodes =
    new Set(
      input.salaryComponents
        .filter(
          sc =>
            sc.is_active &&
            sc.component?.type ===
              'earning'
        )
        .map(
          sc =>
            sc.component.code
        )
    )

  const calculatedFixedGross =
    roundAmount(
      earnings
        .filter(
          earning =>
            fixedEarningCodes.has(
              earning.componentCode
            )
        )
        .reduce(
          (
            sum,
            earning
          ) =>
            sum +
            Number(
              earning.finalAmount ||
                0
            ),
          0
        ),
      2
    )

  if (
    Math.abs(
      calculatedFixedGross -
        proratedFixedGross
    ) > 1
  ) {
    warnings.push({
      code:
        'PRORATED_GROSS_MISMATCH',

      message:
        `Prorated salary components total ₹${calculatedFixedGross.toFixed(2)}, ` +
        `while expected prorated fixed gross is ₹${proratedFixedGross.toFixed(2)}.`,
    })
  }

  // ============================================================
  // Final Result
  // ============================================================

  return {
    earnings,

    deductions,

    monthlyGrossEntitlement,

    perDayGrossRate,

    lopDeduction,

    proratedFixedGross,

    grossEarnings,

    totalDeductions,

    netSalary,

    warnings,

    errors,

    calculationDetails: {
      calendarDays:
        input.calendarDays,

      workingDays:
        input.workingDays,

      paidDays:
        input.paidDays,

      lopDays:
        input.lopDays,

      paidDayFactor,

      monthlyGrossEntitlement,

      perDayGrossRate,

      lopDeduction,

      proratedFixedGross,

      variablePay:
        totalVariablePay,

      reimbursements:
        totalReimbursements,

      finalGrossEarnings:
        grossEarnings,

      totalDeductions,

      netSalary,

      annualCTC:
        Number(
          input.annualCTC ||
            0
        ),
    },
  }
}

// ============================================================
// Earnings Calculation
// ============================================================

function calculateEarnings(
  input: PayrollInput,
  paidDayFactor: number,
  warnings: PayrollWarning[]
): CalculatedEarning[] {
  const earnings:
    CalculatedEarning[] = []

  const sortedComponents =
    [
      ...input.salaryComponents,
    ].sort(
      (
        a,
        b
      ) =>
        (
          a.component
            .sort_order || 0
        ) -
        (
          b.component
            .sort_order || 0
        )
    )

  for (
    const sc of
      sortedComponents
  ) {
    if (!sc.is_active) {
      continue
    }

    if (
      sc.component.type !==
      'earning'
    ) {
      continue
    }

    const monthlyEntitlement =
      Number(
        sc.monthly_amount ||
          0
      )

    const componentPerDay =
      input.workingDays > 0
        ? monthlyEntitlement /
          input.workingDays
        : 0

    const proratedAmount =
      monthlyEntitlement *
      paidDayFactor

    const finalAmount =
      roundAmount(
        proratedAmount,
        2
      )

    const reductionAmount =
      roundAmount(
        monthlyEntitlement -
          finalAmount,
        2
      )

    const adjustment =
      roundAmount(
        finalAmount -
          monthlyEntitlement,
        2
      )

    const steps:
      string[] = [
        `Monthly entitlement: ₹${monthlyEntitlement.toFixed(2)}`,

        `Working days: ${input.workingDays}`,

        `Paid days: ${input.paidDays}`,

        `LOP days: ${input.lopDays}`,
      ]

    if (
      input.workingDays >
      0
    ) {
      steps.push(
        `Per-day ${sc.component.name}: ₹${componentPerDay.toFixed(2)}`
      )
    }

    if (
      paidDayFactor <
      1
    ) {
      steps.push(
        `Paid-day factor: ${paidDayFactor.toFixed(6)}`,

        `Prorated ${sc.component.name}: ` +
          `₹${monthlyEntitlement.toFixed(2)} × ` +
          `${paidDayFactor.toFixed(6)} = ` +
          `₹${proratedAmount.toFixed(2)}`,

        `Salary reduction due to unpaid/non-eligible days: ₹${reductionAmount.toFixed(2)}`
      )
    } else {
      steps.push(
        'No LOP / employment-period proration applied.'
      )
    }

    steps.push(
      `Final ${sc.component.name}: ₹${finalAmount.toFixed(2)}`
    )

    if (
      monthlyEntitlement ===
      0
    ) {
      warnings.push({
        code:
          'ZERO_EARNING',

        message:
          `${sc.component.name} has zero amount.`,

        field:
          sc.component.code,
      })
    }

    earnings.push({
      componentId:
        sc.component_id,

      componentName:
        sc.component.name,

      componentCode:
        sc.component.code,

      monthlyEntitlement,

      paidDayFactor,

      adjustment,

      finalAmount,

      isTaxable:
        sc.component.is_taxable,

      sortOrder:
        sc.component
          .sort_order || 0,

      calculationBreakdown: {
        description:
          `${sc.component.name} calculation`,

        steps,
      },
    })
  }

  return earnings
}

// ============================================================
// Deductions Calculation
// ============================================================

function calculateDeductions(
  input: PayrollInput,
  earnings: CalculatedEarning[],
  grossEarnings: number,
  paidDayFactor: number,
  warnings: PayrollWarning[]
): CalculatedDeduction[] {
  const deductions:
    CalculatedDeduction[] = []

  // ============================================================
  // 1. Provident Fund
  // ============================================================

  if (
    input.pfApplicable
  ) {
    const pfDeduction =
      calculatePF(
        input,
        earnings,
        warnings
      )

    if (
      pfDeduction
    ) {
      deductions.push(
        pfDeduction
      )
    }
  }

  // ============================================================
  // 2. Professional Tax
  // ============================================================

  if (
    input.ptApplicable
  ) {
    const ptDeduction =
      calculatePT(
        input,
        grossEarnings,
        warnings
      )

    if (
      ptDeduction
    ) {
      deductions.push(
        ptDeduction
      )
    }
  }

  // ============================================================
  // 3. Income Tax / TDS
  // ============================================================

  const tdsDeduction =
    calculateTDS(
      input,
      grossEarnings,
      earnings,
      warnings
    )

  if (
    tdsDeduction
  ) {
    deductions.push(
      tdsDeduction
    )
  }

  // ============================================================
  // 4. ESI
  // ============================================================

  if (
    input.esiApplicable
  ) {
    const esiDeduction =
      calculateESI(
        input,
        grossEarnings,
        warnings
      )

    if (
      esiDeduction
    ) {
      deductions.push(
        esiDeduction
      )
    }
  }

  // ============================================================
  // 5. Non-statutory salary structure deductions
  // ============================================================

  const sortedComponents =
    [
      ...input.salaryComponents,
    ].sort(
      (
        a,
        b
      ) =>
        (
          a.component
            .sort_order || 0
        ) -
        (
          b.component
            .sort_order || 0
        )
    )

  for (
    const sc of
      sortedComponents
  ) {
    if (
      !sc.is_active
    ) {
      continue
    }

    if (
      sc.component.type !==
      'deduction'
    ) {
      continue
    }

    /**
     * Statutory components are already handled above.
     */
    if (
      sc.component
        .is_statutory
    ) {
      continue
    }

    const monthlyAmount =
      Number(
        sc.monthly_amount ||
          0
      )

    const amount =
      roundAmount(
        monthlyAmount *
          paidDayFactor,
        2
      )

    deductions.push({
      componentId:
        sc.component_id,

      componentName:
        sc.component.name,

      componentCode:
        sc.component.code,

      amount,

      isStatutory:
        false,

      sortOrder:
        sc.component
          .sort_order ||
        50,

      calculationBreakdown: {
        description:
          `${sc.component.name} deduction`,

        steps: [
          `Monthly amount: ₹${monthlyAmount.toFixed(2)}`,

          `Paid-day factor: ${paidDayFactor.toFixed(6)}`,

          `After proration: ₹${amount.toFixed(2)}`,
        ],
      },
    })
  }

  return deductions
}

// ============================================================
// Statutory Calculators
// ============================================================

/**
 * Calculate Employee PF Contribution.
 *
 * Current default:
 * 12% of PF-eligible Basic wage, with configurable wage ceiling.
 *
 * This is CONFIGURABLE.
 * Do not assume this formula is correct for every employee/company.
 */
function calculatePF(
  input: PayrollInput,
  earnings: CalculatedEarning[],
  warnings: PayrollWarning[]
): CalculatedDeduction | null {
  /**
   * If an explicit employee PF amount has been configured,
   * honor that first.
   */
  if (
    input.pfAmount !==
      undefined &&
    input.pfAmount !==
      null
  ) {
    const explicitPf =
      roundAmount(
        Number(
          input.pfAmount
        ),
        2
      )

    if (
      explicitPf < 0
    ) {
      warnings.push({
        code:
          'INVALID_PF_AMOUNT',

        message:
          'Configured PF amount cannot be negative.',
      })

      return null
    }

    return {
      componentName:
        'Provident Fund (PF)',

      componentCode:
        'PF',

      amount:
        explicitPf,

      isStatutory:
        true,

      sortOrder:
        1,

      calculationBreakdown: {
        description:
          'Employee PF Contribution',

        steps: [
          `Configured employee PF amount: ₹${explicitPf.toFixed(2)}`,

          'Source: Employee statutory profile configuration',
        ],
      },
    }
  }

  const pfRate =
    Number(
      input.settings
        .pf_employee_contribution_rate ??
        12
    )

  const pfCeiling =
    Number(
      input.settings
        .pf_wage_ceiling ??
        15000
    )

  const basicEarning =
    earnings.find(
      earning => {
        const code =
          String(
            earning.componentCode ||
              ''
          ).toUpperCase()

        return (
          code === 'BASIC' ||
          code ===
            'BASIC_SALARY'
        )
      }
    )

  if (
    !basicEarning
  ) {
    warnings.push({
      code:
        'PF_NO_BASIC',

      message:
        'PF is applicable but no Basic Salary component was found.',
    })

    return null
  }

  const basicAmount =
    Number(
      basicEarning.finalAmount ||
        0
    )

  const pfWage =
    pfCeiling > 0
      ? Math.min(
          basicAmount,
          pfCeiling
        )
      : basicAmount

  const pfAmount =
    roundAmount(
      (
        pfWage *
        pfRate
      ) /
        100,
      2
    )

  const steps:
    string[] = [
      `PF Rate: ${pfRate}%`,

      `Prorated Basic Salary: ₹${basicAmount.toFixed(2)}`,
    ]

  if (
    pfCeiling > 0
  ) {
    steps.push(
      `PF Wage Ceiling: ₹${pfCeiling.toFixed(2)}`,

      `PF Eligible Wage: ₹${pfWage.toFixed(2)}`
    )
  }

  steps.push(
    `PF = ₹${pfWage.toFixed(2)} × ${pfRate}% = ₹${pfAmount.toFixed(2)}`
  )

  return {
    componentName:
      'Provident Fund (PF)',

    componentCode:
      'PF',

    amount:
      pfAmount,

    isStatutory:
      true,

    sortOrder:
      1,

    calculationBreakdown: {
      description:
        'Employee PF Contribution',

      steps,
    },
  }
}

/**
 * Calculate Professional Tax.
 *
 * Professional Tax varies by state and applicable slabs.
 *
 * Never invent a fallback amount.
 */
function calculatePT(
  input: PayrollInput,
  grossEarnings: number,
  warnings: PayrollWarning[]
): CalculatedDeduction | null {
  if (
    !input.ptApplicable
  ) {
    return null
  }

  let configuredPT:
    number | null = null

  let ptSource = ''

  /**
   * Employee-level configured PT takes priority.
   */
  if (
    input.ptAmount !==
      undefined &&
    input.ptAmount !==
      null
  ) {
    configuredPT =
      Number(
        input.ptAmount
      )

    ptSource =
      'Employee statutory profile configuration'
  } else {
    /**
     * Otherwise check active salary structure PT component.
     */
    const ptComponent =
      input.salaryComponents.find(
        sc => {
          if (
            !sc.is_active
          ) {
            return false
          }

          const code =
            String(
              sc.component
                ?.code || ''
            ).toUpperCase()

          return (
            code === 'PT' ||
            code ===
              'PROFESSIONAL_TAX'
          )
        }
      )

    if (
      ptComponent &&
      ptComponent.monthly_amount !==
        undefined &&
      ptComponent.monthly_amount !==
        null
    ) {
      configuredPT =
        Number(
          ptComponent.monthly_amount
        )

      ptSource =
        'Employee salary structure PT component'
    }
  }

  if (
    configuredPT !==
    null
  ) {
    const finalPT =
      roundAmount(
        Math.max(
          0,
          configuredPT
        ),
        2
      )

    return {
      componentName:
        'Professional Tax (PT)',

      componentCode:
        'PT',

      amount:
        finalPT,

      isStatutory:
        true,

      sortOrder:
        2,

      calculationBreakdown: {
        description:
          'Professional Tax (Configured Amount)',

        steps: [
          `Configured PT: ₹${finalPT.toFixed(2)}`,

          `Source: ${ptSource}`,
        ],
      },
    }
  }

  /**
   * Check active state-level statutory rule.
   */
  const ptRule =
    input.statutoryRules.find(
      rule => {
        if (
          rule.rule_type !==
          'pt'
        ) {
          return false
        }

        if (
          !rule.is_active
        ) {
          return false
        }

        if (
          !rule.state
        ) {
          return true
        }

        return (
          rule.state.toLowerCase() ===
          (
            input.ptState ||
            ''
          ).toLowerCase()
        )
      }
    )

  if (
    ptRule
  ) {
    const config =
      ptRule.config as {
        slabs?: {
          from: number
          to: number
          amount: number
        }[]
      }

    const slabs =
      config?.slabs || []

    let ptAmount = 0

    let matchedSlab =
      'None'

    for (
      const slab of
        slabs
    ) {
      const lower =
        Number(
          slab.from || 0
        )

      const upper =
        Number(
          slab.to || 0
        )

      const amount =
        Number(
          slab.amount || 0
        )

      const matches =
        grossEarnings >=
          lower &&
        (
          upper === 0 ||
          grossEarnings <=
            upper
        )

      if (
        matches
      ) {
        ptAmount =
          amount

        matchedSlab =
          `₹${lower.toFixed(2)} - ` +
          `${
            upper === 0
              ? 'above'
              : `₹${upper.toFixed(2)}`
          } → ₹${amount.toFixed(2)}`

        break
      }
    }

    return {
      componentName:
        'Professional Tax (PT)',

      componentCode:
        'PT',

      amount:
        roundAmount(
          ptAmount,
          2
        ),

      isStatutory:
        true,

      sortOrder:
        2,

      calculationBreakdown: {
        description:
          'Professional Tax (State Rule)',

        steps: [
          `State: ${input.ptState || 'Not specified'}`,

          `Gross Earnings: ₹${grossEarnings.toFixed(2)}`,

          `Matched Slab: ${matchedSlab}`,

          `PT Amount: ₹${ptAmount.toFixed(2)}`,
        ],
      },
    }
  }

  warnings.push({
    code:
      'PT_NOT_CONFIGURED',

    message:
      `Professional Tax is applicable for ${input.ptState || 'this employee'}, ` +
      'but no PT amount or statutory rule is configured.',
  })

  return null
}

/**
 * Calculate TDS.
 *
 * This remains configuration driven.
 *
 * Real payroll TDS generally requires annual projection,
 * exemptions/deductions, regime treatment, previous-employer income, etc.
 */
function calculateTDS(
  input: PayrollInput,
  grossEarnings: number,
  earnings: CalculatedEarning[],
  warnings: PayrollWarning[]
): CalculatedDeduction | null {
  const tdsRule =
    input.statutoryRules.find(
      rule =>
        rule.rule_type ===
          'tds' &&
        rule.is_active
    )

  if (
    !tdsRule
  ) {
    return {
      componentName:
        'Income Tax (TDS)',

      componentCode:
        'TDS',

      amount:
        0,

      isStatutory:
        true,

      sortOrder:
        3,

      calculationBreakdown: {
        description:
          'Income Tax (TDS)',

        steps: [
          'No TDS rule configured.',

          'TDS calculation requires annual income projection.',

          'TDS is shown as ₹0 for this payroll cycle.',
        ],
      },
    }
  }

  const config =
    tdsRule.config as {
      method?:
        | 'fixed'
        | 'slab'
        | 'percentage'

      amount?: number

      percentage?: number

      slabs?: {
        from: number
        to: number
        rate: number
      }[]
    }

  let tdsAmount = 0

  const steps:
    string[] = [
      `Tax Regime: ${input.taxRegime}`,
    ]

  if (
    config.method ===
    'fixed'
  ) {
    tdsAmount =
      Number(
        config.amount ||
          0
      )

    steps.push(
      `Fixed TDS: ₹${tdsAmount.toFixed(2)}`
    )
  } else if (
    config.method ===
    'percentage'
  ) {
    const taxableEarnings =
      earnings
        .filter(
          earning =>
            earning.isTaxable
        )
        .reduce(
          (
            sum,
            earning
          ) =>
            sum +
            Number(
              earning.finalAmount ||
                0
            ),
          0
        )

    const percentage =
      Number(
        config.percentage ||
          0
      )

    tdsAmount =
      roundAmount(
        (
          taxableEarnings *
          percentage
        ) /
          100,
        2
      )

    steps.push(
      `Taxable Earnings: ₹${taxableEarnings.toFixed(2)}`,

      `TDS Rate: ${percentage}%`,

      `TDS: ₹${tdsAmount.toFixed(2)}`
    )
  } else {
    /**
     * Simplified annual projection.
     */
    const annualGross =
      grossEarnings * 12

    steps.push(
      `Projected Annual Gross: ₹${annualGross.toFixed(2)}`
    )

    if (
      config.slabs
    ) {
      let annualTax = 0

      for (
        const slab of
          config.slabs
      ) {
        const from =
          Number(
            slab.from ||
              0
          )

        const to =
          Number(
            slab.to ||
              0
          )

        const rate =
          Number(
            slab.rate ||
              0
          )

        if (
          annualGross >
          from
        ) {
          const taxableInSlab =
            Math.max(
              0,
              Math.min(
                annualGross -
                  from,

                to > 0
                  ? to -
                      from
                  : annualGross -
                      from
              )
            )

          const slabTax =
            (
              taxableInSlab *
              rate
            ) /
            100

          annualTax +=
            slabTax

          steps.push(
            `Slab ₹${from.toFixed(2)} - ` +
              `${
                to > 0
                  ? `₹${to.toFixed(2)}`
                  : '∞'
              } @ ${rate}%: ₹${slabTax.toFixed(2)}`
          )
        }
      }

      tdsAmount =
        roundAmount(
          annualTax /
            12,
          2
        )

      steps.push(
        `Monthly TDS: ₹${annualTax.toFixed(2)} / 12 = ₹${tdsAmount.toFixed(2)}`
      )
    } else {
      warnings.push({
        code:
          'TDS_SLABS_MISSING',

        message:
          'TDS rule is configured as slab-based but no tax slabs are defined.',
      })
    }
  }

  return {
    componentName:
      'Income Tax (TDS)',

    componentCode:
      'TDS',

    amount:
      roundAmount(
        Math.max(
          0,
          tdsAmount
        ),
        2
      ),

    isStatutory:
      true,

    sortOrder:
      3,

    calculationBreakdown: {
      description:
        'Income Tax (TDS)',

      steps,
    },
  }
}

/**
 * Calculate ESI.
 */
function calculateESI(
  input: PayrollInput,
  grossEarnings: number,
  warnings: PayrollWarning[]
): CalculatedDeduction | null {
  const esiRate =
    Number(
      input.settings
        .esi_employee_rate ??
        0.75
    )

  const esiCeiling =
    Number(
      input.settings
        .esi_wage_ceiling ??
        21000
    )

  if (
    grossEarnings >
    esiCeiling
  ) {
    return null
  }

  if (
    esiRate < 0
  ) {
    warnings.push({
      code:
        'INVALID_ESI_RATE',

      message:
        'Configured ESI employee rate cannot be negative.',
    })

    return null
  }

  const esiAmount =
    roundAmount(
      (
        grossEarnings *
        esiRate
      ) /
        100,
      2
    )

  return {
    componentName:
      'ESI',

    componentCode:
      'ESI',

    amount:
      esiAmount,

    isStatutory:
      true,

    sortOrder:
      4,

    calculationBreakdown: {
      description:
        'Employee State Insurance',

      steps: [
        `Gross Earnings: ₹${grossEarnings.toFixed(2)}`,

        `ESI Wage Ceiling: ₹${esiCeiling.toFixed(2)}`,

        `Employee ESI Rate: ${esiRate}%`,

        `ESI = ₹${grossEarnings.toFixed(2)} × ${esiRate}% = ₹${esiAmount.toFixed(2)}`,
      ],
    },
  }
}

// ============================================================
// Validation
// ============================================================

function validateInputs(
  input: PayrollInput,
  warnings: PayrollWarning[],
  errors: PayrollError[]
): void {
  // ============================================================
  // Employee
  // ============================================================

  if (
    !input.employee
  ) {
    errors.push({
      code:
        'NO_EMPLOYEE',

      message:
        'Employee data is missing.',
    })

    return
  }

  if (
    !input.salaryStructure
  ) {
    errors.push({
      code:
        'NO_SALARY_STRUCTURE',

      message:
        `Employee ${input.employee.employee_code || ''} has no active salary structure.`,
    })
  }

  if (
    !input.salaryComponents ||
    input.salaryComponents
      .length === 0
  ) {
    errors.push({
      code:
        'NO_SALARY_COMPONENTS',

      message:
        'No salary components are defined for this employee.',
    })
  }

  // ============================================================
  // Payroll period / attendance
  // ============================================================

  if (
    !Number.isFinite(
      Number(
        input.calendarDays
      )
    ) ||
    input.calendarDays <=
      0
  ) {
    errors.push({
      code:
        'INVALID_CALENDAR_DAYS',

      message:
        'Calendar days must be positive.',
    })
  }

  if (
    !Number.isFinite(
      Number(
        input.workingDays
      )
    ) ||
    input.workingDays <=
      0
  ) {
    errors.push({
      code:
        'INVALID_WORKING_DAYS',

      message:
        'Working days must be positive.',
    })
  }

  if (
    !Number.isFinite(
      Number(
        input.paidDays
      )
    ) ||
    input.paidDays <
      0
  ) {
    errors.push({
      code:
        'INVALID_PAID_DAYS',

      message:
        'Paid days cannot be negative.',
    })
  }

  if (
    input.paidDays >
    input.workingDays
  ) {
    errors.push({
      code:
        'EXCESS_PAID_DAYS',

      message:
        `Paid days (${input.paidDays}) cannot exceed working days (${input.workingDays}).`,
    })
  }

  if (
    !Number.isFinite(
      Number(
        input.lopDays
      )
    ) ||
    input.lopDays <
      0
  ) {
    errors.push({
      code:
        'INVALID_LOP_DAYS',

      message:
        'LOP days cannot be negative.',
    })
  }

  if (
    input.lopDays >
    input.workingDays
  ) {
    errors.push({
      code:
        'LOP_EXCEEDS_WORKING_DAYS',

      message:
        `LOP days (${input.lopDays}) cannot exceed working days (${input.workingDays}).`,
    })
  }

  const expectedMaximumPaidDays =
    Math.max(
      0,
      input.workingDays -
        input.lopDays
    )

  if (
    input.paidDays >
    expectedMaximumPaidDays
  ) {
    warnings.push({
      code:
        'PAID_LOP_RECONCILIATION',

      message:
        `Paid days (${input.paidDays}) plus LOP days (${input.lopDays}) ` +
        `do not reconcile cleanly against ${input.workingDays} working days. ` +
        'Verify attendance, approved paid leave, joining date, and relieving date.',
    })
  }

  // ============================================================
  // Joining date
  // ============================================================

  if (
    input.employee
      .joining_date
  ) {
    const joiningDate =
      parseDateInput(
        input.employee
          .joining_date
      )

    const periodEnd =
      parseDateInput(
        input.period
          .end_date
      )

    if (
      joiningDate >
      periodEnd
    ) {
      errors.push({
        code:
          'JOINING_AFTER_PERIOD',

        message:
          'Employee joined after the payroll period end date.',
      })
    }
  }

  // ============================================================
  // Exit date
  // ============================================================

  if (
    input.employee
      .last_working_date
  ) {
    const lastDay =
      parseDateInput(
        input.employee
          .last_working_date
      )

    const periodStart =
      parseDateInput(
        input.period
          .start_date
      )

    if (
      lastDay <
      periodStart
    ) {
      errors.push({
        code:
          'EXIT_BEFORE_PERIOD',

        message:
          `Employee's last working date is before payroll period start.`,
      })
    }
  }

  // ============================================================
  // Employee code
  // ============================================================

  if (
    !input.employee
      .employee_code
  ) {
    warnings.push({
      code:
        'NO_EMPLOYEE_CODE',

      message:
        'Employee code is missing.',
    })
  }

  // ============================================================
  // PF Basic component
  // ============================================================

  if (
    input.pfApplicable &&
    !input.salaryComponents.some(
      sc => {
        const code =
          String(
            sc.component
              ?.code || ''
          ).toUpperCase()

        return (
          code === 'BASIC' ||
          code ===
            'BASIC_SALARY'
        )
      }
    )
  ) {
    warnings.push({
      code:
        'PF_NO_BASIC_COMPONENT',

      message:
        'PF is applicable but no Basic Salary component exists in the salary structure.',
    })
  }

  // ============================================================
  // Scaling anomaly
  // ============================================================

  const ctc =
    Number(
      input.annualCTC ||
        input.salaryStructure
          ?.annual_ctc ||
        0
    )

  const monthlyGross =
    Number(
      input.salaryStructure
        ?.monthly_gross ||
        0
    )

  if (
    monthlyGross >
      0 &&
    ctc >
      0
  ) {
    if (
      monthlyGross >
      ctc
    ) {
      errors.push({
        code:
          'SCALING_ANOMALY',

        message:
          `Monthly gross (₹${monthlyGross.toFixed(2)}) exceeds annual CTC (₹${ctc.toFixed(2)}). Data review is required.`,
      })
    }
  }

  // ============================================================
  // Salary component reconciliation
  // ============================================================

  if (
    input.salaryComponents &&
    monthlyGross > 0
  ) {
    const sumEarnings =
      input.salaryComponents
        .filter(
          sc =>
            sc.is_active &&
            sc.component
              ?.type ===
              'earning'
        )
        .reduce(
          (
            sum,
            sc
          ) =>
            Decimal.from(
              sum
            )
              .add(
                sc.monthly_amount ||
                  0
              )
              .toNumber(),
          0
        )

    if (
      Math.abs(
        sumEarnings -
          monthlyGross
      ) > 1
    ) {
      warnings.push({
        code:
          'COMPONENT_SUM_MISMATCH',

        message:
          `Sum of earning components (₹${sumEarnings.toFixed(2)}) ` +
          `does not match monthly gross entitlement (₹${monthlyGross.toFixed(2)}).`,
      })
    }
  }
}

// ============================================================
// Paid Days Calculator
// ============================================================

export interface PaidDaysInput {
  periodStartDate:
    | Date
    | string

  periodEndDate:
    | Date
    | string

  joiningDate?:
    | Date
    | string
    | null

  lastWorkingDate?:
    | Date
    | string
    | null

  /**
   * Confirmed unpaid days only.
   *
   * Examples:
   * - unpaid leave
   * - LOP
   * - confirmed unpaid absence
   *
   * Do NOT send "missing timesheet days" as LOP unless company policy
   * has actually converted those days into unpaid absence.
   */
  lopDays: number

  holidays?: (
    | Date
    | string
  )[]

  /**
   * 0 = Sunday
   * 6 = Saturday
   *
   * Default = [0, 6]
   */
  weeklyOffs?: number[]

  policy?:
    | 'CALENDAR_DAYS'
    | 'WORKING_DAYS'
    | 'ATTENDANCE_DAYS'
}

export interface PaidDaysResult {
  calendarDays: number

  workingDays: number

  paidDays: number

  lopDays: number

  eligibleDays: number

  prorated: boolean

  paidDayFactor: number

  effectiveStartDate: Date

  effectiveEndDate: Date
}

function parseDateInput(
  value: Date | string
): Date {
  let date: Date

  if (
    value instanceof
    Date
  ) {
    date =
      new Date(
        value.getTime()
      )
  } else {
    /**
     * Date-only DB values should be interpreted as local calendar dates,
     * avoiding timezone shifts caused by new Date('YYYY-MM-DD').
     */
    const dateOnlyPattern =
      /^\d{4}-\d{2}-\d{2}$/

    if (
      dateOnlyPattern.test(
        value
      )
    ) {
      const [
        year,
        month,
        day,
      ] =
        value
          .split('-')
          .map(Number)

      date =
        new Date(
          year,
          month - 1,
          day
        )
    } else {
      date =
        new Date(
          value
        )
    }
  }

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    throw new Error(
      `Invalid date value: ${String(value)}`
    )
  }

  date.setHours(
    0,
    0,
    0,
    0
  )

  return date
}

function getDateKey(
  date: Date
): string {
  const year =
    date.getFullYear()

  const month =
    String(
      date.getMonth() +
        1
    ).padStart(
      2,
      '0'
    )

  const day =
    String(
      date.getDate()
    ).padStart(
      2,
      '0'
    )

  return `${year}-${month}-${day}`
}

function countCalendarDaysInclusive(
  startDate: Date,
  endDate: Date
): number {
  if (
    endDate <
    startDate
  ) {
    return 0
  }

  /**
   * Calendar iteration avoids DST / timezone duration errors.
   */
  let count = 0

  const current =
    new Date(
      startDate
    )

  while (
    current <=
    endDate
  ) {
    count++

    current.setDate(
      current.getDate() +
        1
    )
  }

  return count
}

export function calculatePaidDays(
  input: PaidDaysInput
): PaidDaysResult {
  const periodStartDate =
    parseDateInput(
      input.periodStartDate
    )

  const periodEndDate =
    parseDateInput(
      input.periodEndDate
    )

  if (
    periodEndDate <
    periodStartDate
  ) {
    throw new Error(
      'Payroll period end date cannot be before start date.'
    )
  }

  const joiningDate =
    input.joiningDate
      ? parseDateInput(
          input.joiningDate
        )
      : periodStartDate

  const lastWorkingDate =
    input.lastWorkingDate
      ? parseDateInput(
          input.lastWorkingDate
        )
      : periodEndDate

  const weeklyOffs =
    input.weeklyOffs ??
    [
      0,
      6,
    ]

  const policy =
    input.policy ||
    'WORKING_DAYS'

  const holidayKeys =
    new Set(
      (
        input.holidays ||
        []
      ).map(
        holiday =>
          getDateKey(
            parseDateInput(
              holiday
            )
          )
      )
    )

  const effectiveStartDate =
    joiningDate >
    periodStartDate
      ? joiningDate
      : periodStartDate

  const effectiveEndDate =
    lastWorkingDate <
    periodEndDate
      ? lastWorkingDate
      : periodEndDate

  const calendarDays =
    countCalendarDaysInclusive(
      periodStartDate,
      periodEndDate
    )

  let activeCalendarDays =
    0

  let totalWorkingDays =
    0

  let effectiveWorkingDays =
    0

  const current =
    new Date(
      periodStartDate
    )

  while (
    current <=
    periodEndDate
  ) {
    const insideEmploymentWindow =
      current >=
        effectiveStartDate &&
      current <=
        effectiveEndDate

    if (
      insideEmploymentWindow
    ) {
      activeCalendarDays++
    }

    const isWeeklyOff =
      weeklyOffs.includes(
        current.getDay()
      )

    const isHoliday =
      holidayKeys.has(
        getDateKey(
          current
        )
      )

    const isWorkingDay =
      !isWeeklyOff &&
      !isHoliday

    if (
      isWorkingDay
    ) {
      totalWorkingDays++

      if (
        insideEmploymentWindow
      ) {
        effectiveWorkingDays++
      }
    }

    current.setDate(
      current.getDate() +
        1
    )
  }

  let eligibleDays = 0

  if (
    effectiveStartDate >
      periodEndDate ||
    effectiveEndDate <
      periodStartDate
  ) {
    eligibleDays = 0
  } else if (
    policy ===
    'CALENDAR_DAYS'
  ) {
    eligibleDays =
      activeCalendarDays
  } else {
    eligibleDays =
      effectiveWorkingDays
  }

  const rawLopDays =
    Math.max(
      0,
      Number(
        input.lopDays ||
          0
      )
    )

  /**
   * LOP cannot exceed employment-eligible days.
   */
  const effectiveLopDays =
    Math.min(
      rawLopDays,
      eligibleDays
    )

  const paidDays =
    Math.max(
      0,
      eligibleDays -
        effectiveLopDays
    )

  /**
   * Denominator is the entire payroll period basis,
   * so joining and relieving mid-month are prorated.
   */
  const denominator =
    policy ===
    'CALENDAR_DAYS'
      ? calendarDays
      : totalWorkingDays

  const paidDayFactor =
    denominator > 0
      ? Number(
          (
            paidDays /
            denominator
          ).toFixed(
            6
          )
        )
      : 0

  const prorated =
    effectiveStartDate >
      periodStartDate ||
    effectiveEndDate <
      periodEndDate ||
    effectiveLopDays >
      0

  return {
    calendarDays,

    workingDays:
      totalWorkingDays,

    paidDays,

    lopDays:
      effectiveLopDays,

    eligibleDays,

    prorated,

    paidDayFactor,

    effectiveStartDate,

    effectiveEndDate,
  }
}

// ============================================================
// YTD Calculator
// ============================================================

export interface YTDInput {
  previousPayrollRecords: {
    grossEarnings: number

    totalDeductions: number

    netSalary: number

    earnings: {
      componentCode: string
      amount: number
    }[]

    deductions: {
      componentCode: string
      amount: number
    }[]
  }[]
}

export function calculateYTD(
  input: YTDInput
) {
  const result = {
    ytdGrossEarnings: 0,

    ytdTotalDeductions: 0,

    ytdNetPay: 0,

    ytdPF: 0,

    ytdPT: 0,

    ytdTDS: 0,

    ytdByComponent:
      {} as Record<
        string,
        number
      >,
  }

  for (
    const record of
      input.previousPayrollRecords
  ) {
    result.ytdGrossEarnings +=
      Number(
        record.grossEarnings ||
          0
      )

    result.ytdTotalDeductions +=
      Number(
        record.totalDeductions ||
          0
      )

    result.ytdNetPay +=
      Number(
        record.netSalary ||
          0
      )

    for (
      const earning of
        record.earnings
    ) {
      result.ytdByComponent[
        earning.componentCode
      ] =
        (
          result
            .ytdByComponent[
            earning
              .componentCode
          ] ||
          0
        ) +
        Number(
          earning.amount ||
            0
        )
    }

    for (
      const deduction of
        record.deductions
    ) {
      const amount =
        Number(
          deduction.amount ||
            0
        )

      if (
        deduction.componentCode ===
        'PF'
      ) {
        result.ytdPF +=
          amount
      } else if (
        deduction.componentCode ===
        'PT'
      ) {
        result.ytdPT +=
          amount
      } else if (
        deduction.componentCode ===
        'TDS'
      ) {
        result.ytdTDS +=
          amount
      }

      result.ytdByComponent[
        deduction.componentCode
      ] =
        (
          result
            .ytdByComponent[
            deduction
              .componentCode
          ] ||
          0
        ) +
        amount
    }
  }

  result.ytdGrossEarnings =
    roundAmount(
      result.ytdGrossEarnings,
      2
    )

  result.ytdTotalDeductions =
    roundAmount(
      result.ytdTotalDeductions,
      2
    )

  result.ytdNetPay =
    roundAmount(
      result.ytdNetPay,
      2
    )

  result.ytdPF =
    roundAmount(
      result.ytdPF,
      2
    )

  result.ytdPT =
    roundAmount(
      result.ytdPT,
      2
    )

  result.ytdTDS =
    roundAmount(
      result.ytdTDS,
      2
    )

  for (
    const key of
      Object.keys(
        result.ytdByComponent
      )
  ) {
    result.ytdByComponent[
      key
    ] =
      roundAmount(
        result
          .ytdByComponent[
          key
        ],
        2
      )
  }

  return result
}

// ============================================================
// Payroll Comparison
// ============================================================

export interface PayrollComparison {
  componentCode: string

  componentName: string

  currentAmount: number

  previousAmount: number

  difference: number

  percentageChange: number

  reason?: string
}

export function comparePayrolls(
  current: PayrollCalculationResult,
  previous:
    | PayrollCalculationResult
    | null
): PayrollComparison[] {
  if (
    !previous
  ) {
    return []
  }

  const comparisons:
    PayrollComparison[] = []

  // ============================================================
  // Compare Earnings
  // ============================================================

  for (
    const earning of
      current.earnings
  ) {
    const previousEarning =
      previous.earnings.find(
        item =>
          item.componentCode ===
          earning.componentCode
      )

    const previousAmount =
      previousEarning
        ?.finalAmount ??
      0

    const difference =
      roundAmount(
        earning.finalAmount -
          previousAmount,
        2
      )

    if (
      Math.abs(
        difference
      ) > 0.01
    ) {
      comparisons.push({
        componentCode:
          earning.componentCode,

        componentName:
          earning.componentName,

        currentAmount:
          earning.finalAmount,

        previousAmount,

        difference,

        percentageChange:
          previousAmount >
          0
            ? (
                difference /
                previousAmount
              ) *
              100
            : 100,
      })
    }
  }

  // ============================================================
  // Compare Deductions
  // ============================================================

  for (
    const deduction of
      current.deductions
  ) {
    const previousDeduction =
      previous.deductions.find(
        item =>
          item.componentCode ===
          deduction.componentCode
      )

    const previousAmount =
      previousDeduction
        ?.amount ??
      0

    const difference =
      roundAmount(
        deduction.amount -
          previousAmount,
        2
      )

    if (
      Math.abs(
        difference
      ) > 0.01
    ) {
      comparisons.push({
        componentCode:
          deduction.componentCode,

        componentName:
          deduction.componentName,

        currentAmount:
          deduction.amount,

        previousAmount,

        difference,

        percentageChange:
          previousAmount >
          0
            ? (
                difference /
                previousAmount
              ) *
              100
            : 100,
      })
    }
  }

  // ============================================================
  // Compare Gross
  // ============================================================

  const grossDifference =
    roundAmount(
      current.grossEarnings -
        previous.grossEarnings,
      2
    )

  if (
    Math.abs(
      grossDifference
    ) > 0.01
  ) {
    comparisons.push({
      componentCode:
        'GROSS',

      componentName:
        'Gross Earnings',

      currentAmount:
        current.grossEarnings,

      previousAmount:
        previous.grossEarnings,

      difference:
        grossDifference,

      percentageChange:
        previous.grossEarnings >
        0
          ? (
              grossDifference /
              previous.grossEarnings
            ) *
            100
          : 100,
    })
  }

  // ============================================================
  // Compare Net
  // ============================================================

  const netDifference =
    roundAmount(
      current.netSalary -
        previous.netSalary,
      2
    )

  if (
    Math.abs(
      netDifference
    ) > 0.01
  ) {
    comparisons.push({
      componentCode:
        'NET',

      componentName:
        'Net Salary',

      currentAmount:
        current.netSalary,

      previousAmount:
        previous.netSalary,

      difference:
        netDifference,

      percentageChange:
        previous.netSalary >
        0
          ? (
              netDifference /
              previous.netSalary
            ) *
            100
          : 100,
    })
  }

  return comparisons
}

// ============================================================
// Helpers
// ============================================================

export function roundAmount(
  amount: number,
  decimals: number = 2
): number {
  const numeric =
    Number(
      amount || 0
    )

  if (
    !Number.isFinite(
      numeric
    )
  ) {
    return 0
  }

  const factor =
    Math.pow(
      10,
      decimals
    )

  return (
    Math.round(
      (
        numeric +
        Number.EPSILON
      ) *
        factor
    ) /
    factor
  )
}

/**
 * Deduction reconciliation assertion.
 *
 * Validates:
 *
 * total deductions
 * =
 * sum of individual deduction line items
 */
export function validateDeductionReconciliation(
  deductions: {
    amount: number
  }[],
  totalDeductions: number
): boolean {
  const sum =
    deductions.reduce(
      (
        accumulator,
        item
      ) =>
        accumulator +
        Number(
          item.amount ||
            0
        ),
      0
    )

  return (
    Math.abs(
      roundAmount(
        sum,
        2
      ) -
        roundAmount(
          totalDeductions,
          2
        )
    ) <= 0.01
  )
}