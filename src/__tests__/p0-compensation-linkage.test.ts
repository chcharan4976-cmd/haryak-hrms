import { describe, test, expect } from 'vitest'
import { calculatePayroll, PayrollInput } from '@/lib/payroll/payroll-engine'

describe('P0 — Payroll Compensation Linkage & Invariant Rebuild', () => {
  const baseEmployee: any = {
    id: 'emp-hrk-001',
    employee_code: 'HRK-001',
    full_name: 'CHEGONDI JAI SAI RAMCHARAN TEJA',
    is_active: true,
    joining_date: '2025-09-08',
  }

  const basePeriod: any = {
    id: 'period-2026-09',
    period_year: 2026,
    period_month: 9,
    start_date: '2026-09-01',
    end_date: '2026-09-30',
    calendar_days: 30,
    working_days: 22,
  }

  const baseSettings: any = {
    pf_employee_contribution_rate: 12,
    pf_wage_ceiling: 15000,
    esi_employee_rate: 0.75,
  }

  test('1. Incomplete Compensation: Empty components block calculation with NO_SALARY_COMPONENTS', () => {
    const input: PayrollInput = {
      employee: baseEmployee,
      salaryStructure: {
        id: 'struct-001',
        annual_ctc: 691200,
        monthly_gross: 57600,
        status: 'active',
        effective_from: new Date('2025-09-08'),
      } as any,
      salaryComponents: [], // EMPTY components (HRK-001 actual state)
      period: basePeriod,
      settings: baseSettings,
      statutoryRules: [],
      calendarDays: 30,
      workingDays: 22,
      paidDays: 22,
      lopDays: 0,
      ytdGrossEarnings: 0,
      ytdPfContribution: 0,
      ytdProfessionalTax: 0,
      ytdIncomeTax: 0,
      ytdNetPay: 0,
      pfApplicable: true,
      esiApplicable: false,
      ptApplicable: true,
      ptState: 'Telangana',
      taxRegime: 'new',
      annualCTC: 691200,
    }

    const result = calculatePayroll(input)

    // Calculation must be blocked
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors.some(e => e.code === 'NO_SALARY_COMPONENTS')).toBe(true)
    expect(result.grossEarnings).toBe(0)
    expect(result.totalDeductions).toBe(0)
    expect(result.netSalary).toBe(0)
    expect(result.earnings).toHaveLength(0)
    expect(result.deductions).toHaveLength(0)
  })

  test('2. Professional Tax: NO SILENT ₹200 INVENTED when unconfigured', () => {
    const input: PayrollInput = {
      employee: baseEmployee,
      salaryStructure: {
        id: 'struct-001',
        annual_ctc: 691200,
        monthly_gross: 57600,
        status: 'active',
        effective_from: new Date('2025-09-08'),
      } as any,
      salaryComponents: [
        {
          id: 'sc-1',
          salary_structure_id: 'struct-001',
          component_id: 'c-basic',
          monthly_amount: 28800,
          annual_amount: 345600,
          is_active: true,
          component: {
            id: 'c-basic',
            name: 'Basic Salary',
            code: 'BASIC',
            type: 'earning',
            category: 'basic',
            is_taxable: true,
            is_statutory: false,
            sort_order: 1,
            is_active: true,
          } as any,
        },
        {
          id: 'sc-2',
          salary_structure_id: 'struct-001',
          component_id: 'c-hra',
          monthly_amount: 14400,
          annual_amount: 172800,
          is_active: true,
          component: {
            id: 'c-hra',
            name: 'HRA',
            code: 'HRA',
            type: 'earning',
            category: 'hra',
            is_taxable: true,
            is_statutory: false,
            sort_order: 2,
            is_active: true,
          } as any,
        },
        {
          id: 'sc-3',
          salary_structure_id: 'struct-001',
          component_id: 'c-special',
          monthly_amount: 14400,
          annual_amount: 172800,
          is_active: true,
          component: {
            id: 'c-special',
            name: 'Special Allowance',
            code: 'SPECIAL_ALLOWANCE',
            type: 'earning',
            category: 'allowance',
            is_taxable: true,
            is_statutory: false,
            sort_order: 3,
            is_active: true,
          } as any,
        },
      ] as any[],
      period: basePeriod,
      settings: baseSettings,
      statutoryRules: [],
      calendarDays: 30,
      workingDays: 22,
      paidDays: 22,
      lopDays: 0,
      ytdGrossEarnings: 0,
      ytdPfContribution: 0,
      ytdProfessionalTax: 0,
      ytdIncomeTax: 0,
      ytdNetPay: 0,
      pfApplicable: true,
      esiApplicable: false,
      ptApplicable: true, // PT is applicable
      ptState: 'Telangana',
      ptAmount: null, // But NOT configured!
      taxRegime: 'new',
      annualCTC: 691200,
    }

    const result = calculatePayroll(input)

    // Gross must be 57,600
    expect(result.grossEarnings).toBe(57600)

    // PT deduction MUST NOT be silently created as ₹200
    const ptDeduction = result.deductions.find(d => d.componentCode === 'PT')
    expect(ptDeduction).toBeUndefined()

    // Must warn that PT is NOT CONFIGURED
    expect(result.warnings.some(w => w.code === 'PT_NOT_CONFIGURED')).toBe(true)

    // Only PF should be deducted: 12% of min(28800, 15000) = 1800
    expect(result.totalDeductions).toBe(1800)
    expect(result.netSalary).toBe(55800)
  })

  test('3. Professional Tax: When employee has configured PT = ₹200, exactly ₹200 is deducted', () => {
    const input: PayrollInput = {
      employee: baseEmployee,
      salaryStructure: {
        id: 'struct-001',
        annual_ctc: 691200,
        monthly_gross: 57600,
        status: 'active',
        effective_from: new Date('2025-09-08'),
      } as any,
      salaryComponents: [
        {
          id: 'sc-1',
          salary_structure_id: 'struct-001',
          component_id: 'c-basic',
          monthly_amount: 28800,
          annual_amount: 345600,
          is_active: true,
          component: {
            id: 'c-basic',
            name: 'Basic Salary',
            code: 'BASIC',
            type: 'earning',
            category: 'basic',
            is_taxable: true,
            is_statutory: false,
            sort_order: 1,
            is_active: true,
          } as any,
        },
        {
          id: 'sc-2',
          salary_structure_id: 'struct-001',
          component_id: 'c-hra',
          monthly_amount: 14400,
          annual_amount: 172800,
          is_active: true,
          component: {
            id: 'c-hra',
            name: 'HRA',
            code: 'HRA',
            type: 'earning',
            category: 'hra',
            is_taxable: true,
            is_statutory: false,
            sort_order: 2,
            is_active: true,
          } as any,
        },
        {
          id: 'sc-3',
          salary_structure_id: 'struct-001',
          component_id: 'c-special',
          monthly_amount: 14400,
          annual_amount: 172800,
          is_active: true,
          component: {
            id: 'c-special',
            name: 'Special Allowance',
            code: 'SPECIAL_ALLOWANCE',
            type: 'earning',
            category: 'allowance',
            is_taxable: true,
            is_statutory: false,
            sort_order: 3,
            is_active: true,
          } as any,
        },
      ] as any[],
      period: basePeriod,
      settings: baseSettings,
      statutoryRules: [],
      calendarDays: 30,
      workingDays: 22,
      paidDays: 22,
      lopDays: 0,
      ytdGrossEarnings: 0,
      ytdPfContribution: 0,
      ytdProfessionalTax: 0,
      ytdIncomeTax: 0,
      ytdNetPay: 0,
      pfApplicable: true,
      esiApplicable: false,
      ptApplicable: true,
      ptState: 'Telangana',
      ptAmount: 200, // Explicitly configured PT = ₹200
      taxRegime: 'new',
      annualCTC: 691200,
    }

    const result = calculatePayroll(input)

    expect(result.grossEarnings).toBe(57600)

    const ptDeduction = result.deductions.find(d => d.componentCode === 'PT')
    expect(ptDeduction).toBeDefined()
    expect(ptDeduction?.amount).toBe(200)

    // Total deductions = PF (1800) + PT (200) = 2000
    expect(result.totalDeductions).toBe(2000)
    expect(result.netSalary).toBe(55600)
  })

  test('4. Component Sum Reconciliation: Warns if components sum does not match monthly gross', () => {
    const input: PayrollInput = {
      employee: baseEmployee,
      salaryStructure: {
        id: 'struct-001',
        annual_ctc: 691200,
        monthly_gross: 57600, // Gross is 57,600
        status: 'active',
        effective_from: new Date('2025-09-08'),
      } as any,
      salaryComponents: [
        {
          id: 'sc-1',
          salary_structure_id: 'struct-001',
          component_id: 'c-basic',
          monthly_amount: 25000, // Total = 25000 + 10000 = 35000 (Mismatches 57600)
          annual_amount: 300000,
          is_active: true,
          component: {
            id: 'c-basic',
            name: 'Basic Salary',
            code: 'BASIC',
            type: 'earning',
            category: 'basic',
            is_taxable: true,
            is_statutory: false,
            sort_order: 1,
            is_active: true,
          } as any,
        },
        {
          id: 'sc-2',
          salary_structure_id: 'struct-001',
          component_id: 'c-hra',
          monthly_amount: 10000,
          annual_amount: 120000,
          is_active: true,
          component: {
            id: 'c-hra',
            name: 'HRA',
            code: 'HRA',
            type: 'earning',
            category: 'hra',
            is_taxable: true,
            is_statutory: false,
            sort_order: 2,
            is_active: true,
          } as any,
        },
      ] as any[],
      period: basePeriod,
      settings: baseSettings,
      statutoryRules: [],
      calendarDays: 30,
      workingDays: 22,
      paidDays: 22,
      lopDays: 0,
      ytdGrossEarnings: 0,
      ytdPfContribution: 0,
      ytdProfessionalTax: 0,
      ytdIncomeTax: 0,
      ytdNetPay: 0,
      pfApplicable: true,
      esiApplicable: false,
      ptApplicable: false,
      ptState: 'Telangana',
      taxRegime: 'new',
      annualCTC: 691200,
    }

    const result = calculatePayroll(input)

    // Must warn about component sum mismatch
    expect(result.warnings.some(w => w.code === 'COMPONENT_SUM_MISMATCH')).toBe(true)
  })
})
