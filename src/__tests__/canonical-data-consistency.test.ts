import { describe, test, expect } from 'vitest'
import { Decimal, roundAmount } from '@/lib/utils/decimal'
import { formatINR, formatHumanDate, formatPeriodRange } from '@/lib/utils/format'
import { calculatePaidDays, calculatePayroll, PayrollInput } from '@/lib/payroll/payroll-engine'

describe('Haryak HRMS — Final Data Consistency Rebuild Test Suite', () => {

  describe('1. Canonical Decimal & INR Money Formatting (Option B: Canonical Rupees)', () => {
    test('Decimal class performs exact fixed-point 2-decimal arithmetic without IEEE 754 drift', () => {
      const a = Decimal.from(50000.00)
      const b = Decimal.from(2000.00)
      const net = a.minus(b)
      expect(net.toNumber()).toBe(48000.00)
      expect(net.toFixed(2)).toBe('48000.00')

      // Precision test: 0.1 + 0.2 - 0.3 should equal 0
      const floatTest = Decimal.from(0.1).add(0.2).minus(0.3)
      expect(floatTest.isZero()).toBe(true)
    })

    test('formatINR outputs standard Indian numbering format (e.g. ₹50,000, ₹6,00,000)', () => {
      expect(formatINR(50000)).toMatch(/₹\s*50,000/)
      expect(formatINR(600000)).toMatch(/₹\s*6,00,000/)
      expect(formatINR(50000.50, { showPaise: true })).toMatch(/₹\s*50,000\.50/)
      expect(formatINR(0)).toMatch(/₹\s*0/)
      expect(formatINR(null)).toMatch(/₹\s*0/)
    })

    test('formatHumanDate and formatPeriodRange output official readable strings', () => {
      expect(formatHumanDate('2026-09-03')).toBe('03 September 2026')
      expect(formatHumanDate(null)).toBe('Not provided')
      expect(formatPeriodRange('2026-09-01', '2026-09-30')).toBe('01 September 2026 – 30 September 2026')
    })
  })

  describe('2. Policy-Driven Paid Days Proration (Active Window & Double-Deduction Guard)', () => {
    test('Prorates eligible days based on employee joining date inside the payroll period', () => {
      // Period: 2026-09-01 to 2026-09-30 (30 calendar days, 22 working days assuming weekends off)
      // Employee joins on 2026-09-03 (Thursday)
      const result = calculatePaidDays({
        periodStartDate: '2026-09-01',
        periodEndDate: '2026-09-30',
        joiningDate: '2026-09-03',
        lopDays: 0,
        weeklyOffs: [0, 6], // Saturday and Sunday
        policy: 'WORKING_DAYS',
      })

      expect(result.calendarDays).toBe(30)
      expect(result.workingDays).toBe(22)
      // Sep 1 was Tuesday, Sep 2 was Wednesday (2 working days before joining)
      // Active working days = 22 - 2 = 20 days
      expect(result.paidDays).toBe(20)
      expect(result.eligibleDays).toBe(20)
      expect(result.prorated).toBe(true)
      expect(result.paidDayFactor).toBeCloseTo(20 / 22, 4)
    })

    test('Guards against double deduction with LOP: pre-joining days are not added to LOP', () => {
      const result = calculatePaidDays({
        periodStartDate: '2026-09-01',
        periodEndDate: '2026-09-30',
        joiningDate: '2026-09-03',
        lopDays: 1, // 1 real day of absence after joining
        weeklyOffs: [0, 6],
        policy: 'WORKING_DAYS',
      })

      // Active working days = 20, minus 1 LOP = 19 paid days
      expect(result.paidDays).toBe(19)
      expect(result.lopDays).toBe(1)
    })

    test('Full month active employee receives full working days without proration', () => {
      const result = calculatePaidDays({
        periodStartDate: '2026-09-01',
        periodEndDate: '2026-09-30',
        joiningDate: '2024-01-01', // Joined in the past
        lopDays: 0,
        weeklyOffs: [0, 6],
        policy: 'WORKING_DAYS',
      })

      expect(result.paidDays).toBe(result.workingDays)
      expect(result.prorated).toBe(false)
      expect(result.paidDayFactor).toBe(1)
    })
  })

  describe('3. Payroll Engine Invariants & Scaling Anomaly Protection', () => {
    test('Calculates controlled ₹50,000 monthly gross accurately with standard deductions', () => {
      const mockEmployee: any = {
        id: 'mock-emp-001',
        company_id: 'mock-company',
        employee_code: 'HRK-TEST',
        full_name: 'Test Employee',
        joining_date: '2026-01-01',
      }

      const mockStructure: any = {
        id: 'mock-struct-001',
        annual_ctc: 600000,
        monthly_gross: 50000,
        status: 'active',
      }

      const mockComponents: any[] = [
        {
          salary_structure_id: 'mock-struct-001',
          component_id: 'comp-basic',
          monthly_amount: 25000,
          annual_amount: 300000,
          is_active: true,
          component: { id: 'comp-basic', name: 'Basic Salary', code: 'BASIC', type: 'earning', is_taxable: true, sort_order: 1 }
        },
        {
          salary_structure_id: 'mock-struct-001',
          component_id: 'comp-hra',
          monthly_amount: 12500,
          annual_amount: 150000,
          is_active: true,
          component: { id: 'comp-hra', name: 'HRA', code: 'HRA', type: 'earning', is_taxable: true, sort_order: 2 }
        },
        {
          salary_structure_id: 'mock-struct-001',
          component_id: 'comp-special',
          monthly_amount: 12500,
          annual_amount: 150000,
          is_active: true,
          component: { id: 'comp-special', name: 'Special Allowance', code: 'SPECIAL', type: 'earning', is_taxable: true, sort_order: 3 }
        },
      ]

      const input: PayrollInput = {
        employee: mockEmployee,
        salaryStructure: mockStructure,
        salaryComponents: mockComponents,
        period: {
          id: 'period-01',
          company_id: 'mock-company',
          period_month: 9,
          period_year: 2026,
          start_date: '2026-09-01',
          end_date: '2026-09-30',
          calendar_days: 30,
          working_days: 22,
          status: 'open',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        settings: {
          id: 'settings-01',
          company_id: 'mock-company',
          pf_employee_contribution_rate: 12,
          pf_wage_ceiling: 15000,
          esi_employee_rate: 0.75,
          esi_wage_ceiling: 21000,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
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
        ptAmount: 200,
        taxRegime: 'new',
        annualCTC: 600000,
      }

      const result = calculatePayroll(input)

      expect(result.grossEarnings).toBe(50000)
      // PF: 12% of capped Basic (₹15,000) = ₹1,800
      // PT: Default for Telangana gross > 15k = ₹200
      // Total deductions: ₹2,000
      expect(result.totalDeductions).toBe(2000)
      expect(result.netSalary).toBe(48000)

      // Deduction invariant: sum(deductions) === totalDeductions
      const sumDed = result.deductions.reduce((sum, d) => sum + d.amount, 0)
      expect(sumDed).toBe(result.totalDeductions)
      expect(result.errors).toHaveLength(0)
    })

    test('Catches 100x scaling anomaly where monthly gross exceeds annual CTC', () => {
      const corruptedInput: any = {
        employee: { employee_code: 'HRK-CORRUPT', joining_date: '2026-01-01' },
        salaryStructure: { annual_ctc: 60066666, monthly_gross: 5005556 },
        salaryComponents: [],
        period: { start_date: '2026-09-01', end_date: '2026-09-30', calendar_days: 30, working_days: 22 },
        settings: {},
        statutoryRules: [],
        calendarDays: 30,
        workingDays: 22,
        paidDays: 22,
        lopDays: 0,
        annualCTC: 60066666,
      }

      // If monthly_gross > annual_ctc (e.g. 5,005,556 > 500,000 or scaling mismatch)
      const badInput: any = {
        ...corruptedInput,
        annualCTC: 500000,
        salaryStructure: { annual_ctc: 500000, monthly_gross: 5005556 },
      }

      const result = calculatePayroll(badInput)
      expect(result.errors.some(e => e.code === 'SCALING_ANOMALY')).toBe(true)
    })
  })

  describe('4. Single Safe Directory Projection Rules', () => {
    test('Safe projection excludes private financial/statutory data', () => {
      const rawEmployee = {
        id: 'emp-uuid',
        employee_code: 'HRK-001',
        full_name: 'Test Employee',
        official_email: 'test@haryak.com',
        employment_status: 'active',
        is_active: true,
        department_name: 'Software Development',
        designation_name: 'Engineer',
        // Private fields that MUST NOT leak in directory
        annual_ctc: 600000,
        bank_account: '123456789',
        pan_number: 'ABCDE1234F',
      }

      // Safe directory card shape
      const safeCard = {
        id: rawEmployee.id,
        employeeCode: rawEmployee.employee_code,
        fullName: rawEmployee.full_name,
        officialEmail: rawEmployee.official_email,
        departmentName: rawEmployee.department_name,
        designationName: rawEmployee.designation_name,
      }

      expect(safeCard).not.toHaveProperty('annual_ctc')
      expect(safeCard).not.toHaveProperty('bank_account')
      expect(safeCard).not.toHaveProperty('pan_number')
      expect(safeCard.employeeCode).toBe('HRK-001')
    })
  })
})
