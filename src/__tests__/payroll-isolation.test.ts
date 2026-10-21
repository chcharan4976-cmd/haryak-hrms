import { describe, it, expect } from 'vitest'
import { calculatePayroll, PayrollInput } from '@/lib/payroll/payroll-engine'
import { maskBankAccount } from '@/lib/utils/format'

describe('P0 Payroll & Employee Isolation Invariants', () => {
  const period = {
    id: 'period-2026-08',
    company_id: 'test-company-1',
    period_month: 8,
    period_year: 2026,
    start_date: '2026-08-01',
    end_date: '2026-08-31',
    calendar_days: 31,
    working_days: 22,
    status: 'open',
  }

  it('calculates employee A and employee B independently with distinct PF and bank details', () => {
    // EMPLOYEE A: CTC 600,000, monthly gross 50,000, basic 25,000, PF ceiling ₹15,000 -> PF = ₹1,800, bank provided
    const employeeA = {
      id: 'emp-aaa-111',
      company_id: 'test-company-1',
      employee_code: 'HRK-TEST-A',
      first_name: 'Test',
      last_name: 'A',
      full_name: 'Test A',
      joining_date: '2025-01-01',
    }

    const structureA = {
      id: 'struct-a',
      employee_id: employeeA.id,
      annual_ctc: 600000,
      monthly_gross: 50000,
      effective_from: '2025-01-01',
      status: 'active',
    }

    const componentsA = [
      {
        id: 'c-basic-a',
        salary_structure_id: structureA.id,
        component_id: 'comp-basic',
        monthly_amount: 25000,
        annual_amount: 300000,
        is_active: true,
        component: {
          id: 'comp-basic',
          name: 'Basic Salary',
          code: 'BASIC',
          type: 'earning',
          category: 'basic',
          sort_order: 1,
          is_taxable: true,
          is_statutory: false,
        },
      },
      {
        id: 'c-hra-a',
        salary_structure_id: structureA.id,
        component_id: 'comp-hra',
        monthly_amount: 12500,
        annual_amount: 150000,
        is_active: true,
        component: {
          id: 'comp-hra',
          name: 'House Rent Allowance',
          code: 'HRA',
          type: 'earning',
          category: 'hra',
          sort_order: 2,
          is_taxable: true,
          is_statutory: false,
        },
      },
      {
        id: 'c-special-a',
        salary_structure_id: structureA.id,
        component_id: 'comp-special',
        monthly_amount: 12500,
        annual_amount: 150000,
        is_active: true,
        component: {
          id: 'comp-special',
          name: 'Special Allowance',
          code: 'SPECIAL_ALLOWANCE',
          type: 'earning',
          category: 'allowance',
          sort_order: 3,
          is_taxable: true,
          is_statutory: false,
        },
      },
    ]

    const settingsA = {
      pf_employee_contribution_rate: 12.00,
      pf_employer_contribution_rate: 12.00,
      pf_wage_ceiling: 15000.00, // Capped at ₹15,000 => PF = ₹1,800
      esi_employee_rate: 0.75,
      esi_employer_rate: 3.25,
      esi_wage_ceiling: 21000.00,
    }

    const inputA: PayrollInput = {
      employee: employeeA,
      salaryStructure: structureA,
      salaryComponents: componentsA,
      period,
      settings: settingsA,
      statutoryRules: [],
      calendarDays: 31,
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
      taxRegime: 'new',
      annualCTC: 600000,
    }

    const resultA = calculatePayroll(inputA)

    // EMPLOYEE B: CTC 900,000, monthly gross 75,000, basic 37,500, PF ceiling ₹20,000 -> PF = ₹2,400, bank NOT PROVIDED
    const employeeB = {
      id: 'emp-bbb-222',
      company_id: 'test-company-1',
      employee_code: 'HRK-TEST-B',
      first_name: 'Test',
      last_name: 'B',
      full_name: 'Test B',
      joining_date: '2026-03-01',
    }

    const structureB = {
      id: 'struct-b',
      employee_id: employeeB.id,
      annual_ctc: 900000,
      monthly_gross: 75000,
      effective_from: '2026-03-01',
      status: 'active',
    }

    const componentsB = [
      {
        id: 'c-basic-b',
        salary_structure_id: structureB.id,
        component_id: 'comp-basic',
        monthly_amount: 37500,
        annual_amount: 450000,
        is_active: true,
        component: {
          id: 'comp-basic',
          name: 'Basic Salary',
          code: 'BASIC',
          type: 'earning',
          category: 'basic',
          sort_order: 1,
          is_taxable: true,
          is_statutory: false,
        },
      },
      {
        id: 'c-hra-b',
        salary_structure_id: structureB.id,
        component_id: 'comp-hra',
        monthly_amount: 18750,
        annual_amount: 225000,
        is_active: true,
        component: {
          id: 'comp-hra',
          name: 'House Rent Allowance',
          code: 'HRA',
          type: 'earning',
          category: 'hra',
          sort_order: 2,
          is_taxable: true,
          is_statutory: false,
        },
      },
      {
        id: 'c-special-b',
        salary_structure_id: structureB.id,
        component_id: 'comp-special',
        monthly_amount: 18750,
        annual_amount: 225000,
        is_active: true,
        component: {
          id: 'comp-special',
          name: 'Special Allowance',
          code: 'SPECIAL_ALLOWANCE',
          type: 'earning',
          category: 'allowance',
          sort_order: 3,
          is_taxable: true,
          is_statutory: false,
        },
      },
    ]

    const settingsB = {
      pf_employee_contribution_rate: 12.00,
      pf_employer_contribution_rate: 12.00,
      pf_wage_ceiling: 20000.00, // Capped at ₹20,000 => PF = ₹2,400
      esi_employee_rate: 0.75,
      esi_employer_rate: 3.25,
      esi_wage_ceiling: 21000.00,
    }

    const inputB: PayrollInput = {
      employee: employeeB,
      salaryStructure: structureB,
      salaryComponents: componentsB,
      period,
      settings: settingsB,
      statutoryRules: [],
      calendarDays: 31,
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
      taxRegime: 'new',
      annualCTC: 900000,
    }

    const resultB = calculatePayroll(inputB)

    // 1. Employee A assertions
    expect(resultA.grossEarnings).toBe(50000)
    const pfA = resultA.deductions.find(d => d.componentCode === 'PF')
    expect(pfA).toBeDefined()
    expect(pfA?.amount).toBe(1800) // 12% of 15000 cap = 1800
    expect(resultA.totalDeductions).toBe(1800)

    // 2. Employee B assertions
    expect(resultB.grossEarnings).toBe(75000)
    const pfB = resultB.deductions.find(d => d.componentCode === 'PF')
    expect(pfB).toBeDefined()
    expect(pfB?.amount).toBe(2400) // 12% of 20000 cap = 2400
    expect(resultB.totalDeductions).toBe(2400)

    // 3. Complete cross-contamination check
    expect(resultA.grossEarnings).not.toBe(resultB.grossEarnings)
    expect(pfA?.amount).not.toBe(pfB?.amount)

    // 4. Deduction Invariant: Total deductions === SUM(deduction line items)
    const sumDeductionsA = resultA.deductions.reduce((sum, d) => sum + d.amount, 0)
    expect(resultA.totalDeductions).toBe(sumDeductionsA)

    const sumDeductionsB = resultB.deductions.reduce((sum, d) => sum + d.amount, 0)
    expect(resultB.totalDeductions).toBe(sumDeductionsB)
    expect(resultB.totalDeductions).toBe(2400) // Exactly 2400, no extra deductions!

    // 5. Net Salary = Gross - Total Deductions
    expect(resultA.netSalary).toBe(50000 - 1800)
    expect(resultB.netSalary).toBe(75000 - 2400)
    expect(resultA.netSalary).toBe(48200)
    expect(resultB.netSalary).toBe(72600)

    // 6. Bank account masking isolation: Employee B bank is NOT provided
    const bankBAccount = null
    const maskedB = maskBankAccount(bankBAccount as any)
    expect(maskedB).toBe('Not provided')

    const bankAAccount = '123456789012'
    const maskedA = maskBankAccount(bankAAccount)
    expect(maskedA).toBe('********9012')
    expect(maskedA).not.toBe(maskedB)
  })
})
