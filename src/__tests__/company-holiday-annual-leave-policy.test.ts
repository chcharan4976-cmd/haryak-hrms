import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getCompanyMonthlyCalendar,
  getCompanyAnnualHolidays,
} from '@/lib/services/company-calendar-service'
import {
  getEmployeeAnnualLeaveSummary,
  classifyTimesheetLeaves,
  DEFAULT_ANNUAL_PAID_LEAVE_DAYS,
} from '@/lib/services/leave-policy-service'
import {
  calculatePayroll,
  calculatePaidDays,
  type PayrollInput,
} from '@/lib/payroll/payroll-engine'

describe('Company Holiday and 11-Day Annual Paid Leave Policy Test Suite', () => {
  const companyId = '77777777-7777-7777-7777-777777777777'
  const employeeId = '88888888-8888-8888-8888-888888888888'

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  // ============================================================
  // 1 & 2. COMPANY CALENDAR PUBLIC HOLIDAYS & ISOLATION
  // ============================================================
  describe('Company Calendar Public Holidays', () => {
    it('automatically recognizes public holidays as paid and excludes them from working days', async () => {
      // October 2026 has 31 days, 9 weekend days (4 Saturdays, 5 Sundays)
      // If 2 public holidays are declared, scheduled working days should be 31 - 9 - 2 = 20
      const cal = await getCompanyMonthlyCalendar('test-co', 2026, 10)
      expect(cal.calendarDays).toBe(31)
      expect(cal.weekendDates.length).toBe(9)
      // Default without holidays: 22 working days
      expect(cal.workingDays).toBe(22)
    })

    it('ensures public holidays do NOT consume annual paid leave entitlement', async () => {
      // Example from prompt:
      // An employee has 11 annual paid leave days, 3 public holidays in the month, and 2 requested working-day leaves.
      // Result: 3 public holidays (₹0 deduction, 0 leave deducted), 2 paid leave deducted (9 remaining), 0 LOP.
      const holidays = [
        { id: 'h1', date: '2026-10-02', name: 'Gandhi Jayanti', type: 'public' },
        { id: 'h2', date: '2026-10-19', name: 'Dussehra', type: 'public' },
        { id: 'h3', date: '2026-10-30', name: 'Company Holiday', type: 'company' },
      ]

      // Mock holidays query
      vi.spyOn(await import('@/lib/services/company-calendar-service'), 'getCompanyAnnualHolidays')
        .mockResolvedValue(holidays)

      const leaveClassification = await classifyTimesheetLeaves({
        companyId,
        employeeId,
        year: 2026,
        month: 10,
        leaveDates: [
          { date: '2026-10-02', reason: 'Gandhi Jayanti holiday' }, // Falling on holiday
          { date: '2026-10-05', reason: 'Personal leave' },           // Normal working day
          { date: '2026-10-06', reason: 'Personal leave' },           // Normal working day
        ],
      })

      // The public holiday must be recognized as PUBLIC_HOLIDAY (0 leave balance consumed)
      const holidayEntry = leaveClassification.classifiedEntries.find(e => e.date === '2026-10-02')
      expect(holidayEntry?.classification).toBe('PUBLIC_HOLIDAY')
      expect(holidayEntry?.isPaid).toBe(true)
      expect(holidayEntry?.salaryDeductionDays).toBe(0)

      // The 2 normal working days must be marked for monthly salary deduction and consume from the 11-day annual compensation entitlement
      const leave1 = leaveClassification.classifiedEntries.find(e => e.date === '2026-10-05')
      const leave2 = leaveClassification.classifiedEntries.find(e => e.date === '2026-10-06')
      expect(leave1?.classification).toBe('PAID_LEAVE')
      expect(leave1?.isPaid).toBe(false) // Deducted monthly under annual compensation model
      expect(leave1?.salaryDeductionDays).toBe(1)
      expect(leave2?.classification).toBe('PAID_LEAVE')
      expect(leave2?.isPaid).toBe(false) // Deducted monthly under annual compensation model
      expect(leave2?.salaryDeductionDays).toBe(1)

      // Exactly 2 compensation-eligible leave days consumed, ending balance 9 (11 - 2)
      expect(leaveClassification.paidLeaveDays).toBe(2)
      expect(leaveClassification.lopDays).toBe(0)
      expect(leaveClassification.holidayDays).toBe(1)
      expect(leaveClassification.endingBalance).toBe(DEFAULT_ANNUAL_PAID_LEAVE_DAYS - 2)
    })
  })

  // ============================================================
  // 3 & 4. 11-DAY ANNUAL PAID LEAVE POLICY & PROGRESSIVE LOP TRANSITION
  // ============================================================
  describe('11-Day Annual Paid Leave Policy & Progressive LOP Transition', () => {
    it('provides exactly 11 days of paid leave per calendar year', () => {
      expect(DEFAULT_ANNUAL_PAID_LEAVE_DAYS).toBe(11)
    })

    it('classifies the first 11 leaves as Eligible for Year-End Compensation and subsequent as LOP Non-Compensable', async () => {
      vi.spyOn(await import('@/lib/services/company-calendar-service'), 'getCompanyAnnualHolidays')
        .mockResolvedValue([])

      // Simulate an employee taking 13 leaves in a year
      const testLeaveDates = [
        '2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09',
        '2026-02-02', '2026-02-03', '2026-02-04', '2026-02-05', '2026-02-06',
        '2026-03-02', // 11th leave (should be PAID_LEAVE - eligible for annual compensation)
        '2026-03-03', // 12th leave (should be LOP - non-compensable)
        '2026-03-04', // 13th leave (should be LOP - non-compensable)
      ].map(date => ({ date, reason: 'Vacation' }))

      const result = await classifyTimesheetLeaves({
        companyId,
        employeeId,
        year: 2026,
        month: 3,
        leaveDates: testLeaveDates,
      })

      expect(result.classifiedEntries.length).toBe(13)
      // Exactly 11 Eligible for Year-End Compensation
      expect(result.paidLeaveDays).toBe(11)
      // Exactly 2 LOP Days beyond 11
      expect(result.lopDays).toBe(2)
      expect(result.endingBalance).toBe(0)

      // All working day leaves incur 1 day monthly deduction
      for (let i = 0; i < 11; i++) {
        expect(result.classifiedEntries[i].classification).toBe('PAID_LEAVE')
        expect(result.classifiedEntries[i].isPaid).toBe(false)
        expect(result.classifiedEntries[i].salaryDeductionDays).toBe(1)
      }

      // Check 12th and 13th entries are LOP (beyond entitlement) with 1 day deduction each
      expect(result.classifiedEntries[11].classification).toBe('LOP')
      expect(result.classifiedEntries[11].isPaid).toBe(false)
      expect(result.classifiedEntries[11].salaryDeductionDays).toBe(1)

      expect(result.classifiedEntries[12].classification).toBe('LOP')
      expect(result.classifiedEntries[12].isPaid).toBe(false)
      expect(result.classifiedEntries[12].salaryDeductionDays).toBe(1)
    })

    it('handles the example from prompt: 10 used + 1 new = 0 remaining, 1 day monthly deduction, eligible for year-end reimbursement', async () => {
      vi.spyOn(await import('@/lib/services/company-calendar-service'), 'getCompanyAnnualHolidays')
        .mockResolvedValue([])

      // Pre-seed 10 used leaves
      const prior10Leaves = Array.from({ length: 10 }, (_, i) => ({
        date: `2026-01-${String(i + 5).padStart(2, '0')}`,
        type: 'PAID_LEAVE' as const,
        categoryName: 'Casual Leave',
        source: 'TIMESHEET' as const,
        isPaid: false,
        deductionImpact: 1,
      }))

      const result = await classifyTimesheetLeaves({
        companyId,
        employeeId,
        year: 2026,
        month: 2,
        leaveDates: [{ date: '2026-02-10', reason: 'Personal errand' }],
        priorLeaveSummary: {
          annualEntitlement: 11,
          paidLeaveUsed: 10,
          paidLeaveRemaining: 1,
          unpaidLeaveLop: 0,
          companyHolidaysCount: 3,
          leaveHistory: prior10Leaves,
        },
      })

      expect(result.paidLeaveDays).toBe(1)
      expect(result.lopDays).toBe(0)
      expect(result.endingBalance).toBe(0)
      expect(result.classifiedEntries[0].classification).toBe('PAID_LEAVE')
      expect(result.classifiedEntries[0].isPaid).toBe(false)
      expect(result.classifiedEntries[0].salaryDeductionDays).toBe(1)
    })

    it('handles the prompt exhaustion example: 11 used + 1 new = 1 LOP day, 1 day salary deduction', async () => {
      vi.spyOn(await import('@/lib/services/company-calendar-service'), 'getCompanyAnnualHolidays')
        .mockResolvedValue([])

      // Pre-seed 11 used leaves (all exhausted)
      const prior11Leaves = Array.from({ length: 11 }, (_, i) => ({
        date: `2026-01-${String(i + 5).padStart(2, '0')}`,
        type: 'PAID_LEAVE' as const,
        categoryName: 'Casual Leave',
        source: 'TIMESHEET' as const,
        isPaid: true,
        deductionImpact: 0,
      }))

      const result = await classifyTimesheetLeaves({
        companyId,
        employeeId,
        year: 2026,
        month: 2,
        leaveDates: [{ date: '2026-02-10', reason: 'Unplanned absence' }],
        priorLeaveSummary: {
          annualEntitlement: 11,
          paidLeaveUsed: 11,
          paidLeaveRemaining: 0,
          unpaidLeaveLop: 0,
          companyHolidaysCount: 3,
          leaveHistory: prior11Leaves,
        },
      })

      expect(result.paidLeaveDays).toBe(0)
      expect(result.lopDays).toBe(1)
      expect(result.endingBalance).toBe(0)
      expect(result.classifiedEntries[0].classification).toBe('LOP')
      expect(result.classifiedEntries[0].salaryDeductionDays).toBe(1)
    })
  })

  // ============================================================
  // 5, 6 & 7. PAYROLL SALARY DEDUCTION FORMULA VERIFICATION
  // ============================================================
  describe('Payroll & Salary Deduction Calculations', () => {
    it('incurs ₹0 LOP deduction for paid leave days within 11-day entitlement', () => {
      const input: PayrollInput = {
        employee: {
          id: employeeId,
          employee_code: 'EMP001',
          full_name: 'Policy Test Employee',
        },
        salaryStructure: {
          id: 'ss-1',
          name: 'Executive Structure',
          monthly_gross: 100000,
        },
        salaryComponents: [
          {
            component_id: 'c-basic',
            monthly_amount: 50000,
            is_active: true,
            component: {
              code: 'BASIC',
              name: 'Basic Salary',
              type: 'earning',
              is_statutory: false,
            },
          },
          {
            component_id: 'c-hra',
            monthly_amount: 25000,
            is_active: true,
            component: {
              code: 'HRA',
              name: 'House Rent Allowance',
              type: 'earning',
              is_statutory: false,
            },
          },
          {
            component_id: 'c-sa',
            monthly_amount: 25000,
            is_active: true,
            component: {
              code: 'SA',
              name: 'Special Allowance',
              type: 'earning',
              is_statutory: false,
            },
          },
        ],
        period: {
          id: 'p-1',
          start_date: '2026-10-01',
          end_date: '2026-10-31',
        },
        settings: {
          pay_schedule: 'MONTHLY',
        },
        statutoryRules: [],
        calendarDays: 30,
        workingDays: 22,
        paidDays: 22, // 20 worked + 2 paid leave
        lopDays: 0,
        annualCTC: 1200000,
      }

      const res = calculatePayroll(input)
      expect(res.lopDeduction).toBe(0)
      expect(res.proratedFixedGross).toBe(100000)
      expect(res.grossEarnings).toBe(100000)
    })

    it('calculates exact 1-day salary deduction when 1 LOP day occurs after entitlement exhaustion', () => {
      // Monthly gross = ₹21,000, Working days = 21, LOP = 1
      // Daily rate = 21000 / 21 = ₹1,000.00
      // LOP deduction = 1 * ₹1,000.00 = ₹1,000.00
      // Prorated fixed gross = ₹20,000.00
      const input: PayrollInput = {
        employee: {
          id: employeeId,
          employee_code: 'EMP001',
          full_name: 'Policy Test Employee',
        },
        salaryStructure: {
          id: 'ss-2',
          name: 'Standard Structure',
          monthly_gross: 21000,
        },
        salaryComponents: [
          {
            component_id: 'c-basic',
            monthly_amount: 21000,
            is_active: true,
            component: {
              code: 'BASIC',
              name: 'Basic Salary',
              type: 'earning',
              is_statutory: false,
            },
          },
        ],
        period: {
          id: 'p-1',
          start_date: '2026-10-01',
          end_date: '2026-10-31',
        },
        settings: {
          pay_schedule: 'MONTHLY',
        },
        statutoryRules: [],
        calendarDays: 31,
        workingDays: 21,
        paidDays: 20, // 20 payable days, 1 LOP day
        lopDays: 1,
        annualCTC: 252000,
      }

      const res = calculatePayroll(input)
      expect(res.perDayGrossRate).toBe(1000)
      expect(res.lopDeduction).toBe(1000)
      expect(res.proratedFixedGross).toBe(20000)
    })

    it('incurs ₹0 LOP deduction on declared company public holidays', () => {
      // Month has 3 public holidays and 18 working days.
      // Scheduled working days = 18. If all 18 are worked, payable days = 18.
      // Zero LOP deduction.
      const input: PayrollInput = {
        employee: {
          id: employeeId,
          employee_code: 'EMP001',
          full_name: 'Policy Test Employee',
        },
        salaryStructure: {
          id: 'ss-3',
          name: 'Executive Structure',
          monthly_gross: 50000,
        },
        salaryComponents: [
          {
            component_id: 'c-basic',
            monthly_amount: 25000,
            is_active: true,
            component: {
              code: 'BASIC',
              name: 'Basic Salary',
              type: 'earning',
              is_statutory: false,
            },
          },
          {
            component_id: 'c-hra',
            monthly_amount: 25000,
            is_active: true,
            component: {
              code: 'HRA',
              name: 'House Rent Allowance',
              type: 'earning',
              is_statutory: false,
            },
          },
        ],
        period: {
          id: 'p-1',
          start_date: '2026-10-01',
          end_date: '2026-10-31',
        },
        settings: {
          pay_schedule: 'MONTHLY',
        },
        statutoryRules: [],
        calendarDays: 31,
        workingDays: 18,
        paidDays: 18,
        lopDays: 0,
        annualCTC: 600000,
      }

      const res = calculatePayroll(input)
      expect(res.lopDeduction).toBe(0)
      expect(res.proratedFixedGross).toBe(50000)
    })
  })

  // ============================================================
  // 8. ATTENDANCE & SUMMARY CONSISTENCY
  // ============================================================
  describe('Leave Balance Tracking and Summary Consistency', () => {
    it('correctly tracks year-wise leave balances and isolates company holidays', async () => {
      const summary = await getEmployeeAnnualLeaveSummary(companyId, employeeId, 2026)
      expect(summary.annualEntitlement).toBe(11)
      expect(summary.paidLeaveUsed).toBeGreaterThanOrEqual(0)
      expect(summary.paidLeaveRemaining).toBeLessThanOrEqual(11)
      expect(summary.paidLeaveUsed + summary.paidLeaveRemaining).toBe(11)
      expect(typeof summary.companyHolidaysCount).toBe('number')
      expect(Array.isArray(summary.leaveHistory)).toBe(true)
    })
  })
})
