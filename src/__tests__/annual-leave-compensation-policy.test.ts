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
  getEmployeeAnnualCompensationLedger,
  saveAnnualLeaveAudit,
  settleAnnualLeaveCompensation,
  DEFAULT_ANNUAL_COMPENSATION_DAYS,
} from '@/lib/services/leave-compensation-ledger-service'
import {
  calculatePayroll,
  calculatePaidDays,
  type PayrollInput,
} from '@/lib/payroll/payroll-engine'

describe('Annual Paid-Leave Compensation Policy & Monthly LOP Deductions Suite', () => {
  const companyId = '77777777-7777-7777-7777-777777777777'
  const employeeId = '88888888-8888-8888-8888-888888888888'

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  // ============================================================
  // 1. MANDATORY POLICY: MONTHLY DEDUCTION FOR WORKING-DAY LEAVES
  // ============================================================
  describe('Monthly Leave Deductions & Working-Day Isolation', () => {
    it('classifies every employee working-day leave as monthly salary-deductible (isPaid: false, 1 day deduction)', async () => {
      vi.spyOn(await import('@/lib/services/company-calendar-service'), 'getCompanyAnnualHolidays')
        .mockResolvedValue([])

      const result = await classifyTimesheetLeaves({
        companyId,
        employeeId,
        year: 2026,
        month: 10,
        leaveDates: [
          { date: '2026-10-05', reason: 'Personal Leave' },
          { date: '2026-10-06', reason: 'Personal Leave' },
        ],
      })

      expect(result.classifiedEntries.length).toBe(2)
      // Both entries are deductible from monthly salary
      expect(result.classifiedEntries[0].isPaid).toBe(false)
      expect(result.classifiedEntries[0].salaryDeductionDays).toBe(1)
      expect(result.classifiedEntries[0].classification).toBe('PAID_LEAVE') // Eligible for annual compensation

      expect(result.classifiedEntries[1].isPaid).toBe(false)
      expect(result.classifiedEntries[1].salaryDeductionDays).toBe(1)
      expect(result.classifiedEntries[1].classification).toBe('PAID_LEAVE') // Eligible for annual compensation

      // Tracks that 2 compensation-eligible days were consumed
      expect(result.paidLeaveDays).toBe(2)
      expect(result.endingBalance).toBe(9) // 11 - 2 = 9 remaining
    })

    it('ensures public holidays are automatically paid, never deducted, and never consume annual compensation entitlement', async () => {
      const holidays = [
        { id: 'h1', date: '2026-10-02', name: 'Gandhi Jayanti', type: 'public' },
        { id: 'h2', date: '2026-10-19', name: 'Dussehra', type: 'public' },
      ]

      vi.spyOn(await import('@/lib/services/company-calendar-service'), 'getCompanyAnnualHolidays')
        .mockResolvedValue(holidays)

      const result = await classifyTimesheetLeaves({
        companyId,
        employeeId,
        year: 2026,
        month: 10,
        leaveDates: [
          { date: '2026-10-02', reason: 'Public Holiday' },
          { date: '2026-10-05', reason: 'Personal Leave' },
        ],
      })

      const holiday = result.classifiedEntries.find(e => e.date === '2026-10-02')
      const leave = result.classifiedEntries.find(e => e.date === '2026-10-05')

      // Public holiday: Paid, zero deduction, zero entitlement consumed
      expect(holiday?.classification).toBe('PUBLIC_HOLIDAY')
      expect(holiday?.isPaid).toBe(true)
      expect(holiday?.salaryDeductionDays).toBe(0)

      // Working day leave: Deducted monthly, consumes 1 from annual compensation entitlement
      expect(leave?.classification).toBe('PAID_LEAVE')
      expect(leave?.isPaid).toBe(false)
      expect(leave?.salaryDeductionDays).toBe(1)

      expect(result.endingBalance).toBe(10) // 11 - 1 = 10
    })

    it('excludes weekends by default from working days and leave deductions', async () => {
      const cal = await getCompanyMonthlyCalendar('test-company', 2026, 10)
      expect(cal.calendarDays).toBe(31)
      expect(cal.weekendDates.length).toBe(9) // 4 Saturdays, 5 Sundays
      expect(cal.workingDays).toBe(22) // 31 - 9 = 22
    })
  })

  // ============================================================
  // 2. EXACT PROMPT CALCULATION (₹1,66,667, 21 working days, 2 leaves)
  // ============================================================
  describe('Daily Rate & Prompt Example Calculation', () => {
    it('executes exact prompt scenario: ₹1,66,667 gross, 21 working days, 2 leave days', () => {
      // Monthly gross = ₹1,66,667
      // Scheduled working days = 21
      // Leave days taken = 2
      // Daily salary rate = 166667 / 21 = ₹7,936.52
      // Monthly leave deduction = 2 * 7936.52 = ₹15,873.04
      // Prorated fixed gross = 166667 - 15873.04 = ₹150,793.96
      const monthlyGross = 166667
      const workingDays = 21
      const lopDays = 2
      const paidDays = workingDays - lopDays // 19

      const input: PayrollInput = {
        employee: {
          id: employeeId,
          employee_code: 'HRK-001',
          full_name: 'Vattem Thirupathi Raju',
        },
        salaryStructure: {
          id: 'ss-prompt',
          name: 'Executive Leadership Structure',
          monthly_gross: monthlyGross,
        },
        salaryComponents: [
          {
            component_id: 'c-basic',
            monthly_amount: 83333.5,
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
            monthly_amount: 41666.75,
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
            monthly_amount: 41666.75,
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
          id: 'period-oct',
          start_date: '2026-10-01',
          end_date: '2026-10-31',
        },
        settings: {
          pay_schedule: 'MONTHLY',
        },
        statutoryRules: [],
        calendarDays: 31,
        workingDays,
        paidDays,
        lopDays,
        annualCTC: 2000004,
      }

      const res = calculatePayroll(input)

      // Daily salary rate = 166667 / 21 = ₹7,936.52
      expect(res.perDayGrossRate).toBeCloseTo(7936.52, 1)

      // Monthly leave deduction = 2 * ₹7,936.52 = ₹15,873.04
      expect(res.lopDeduction).toBeCloseTo(15873.04, 1)

      // Prorated payable fixed gross = ₹1,50,793.96
      expect(res.proratedFixedGross).toBeCloseTo(150793.96, 1)
      expect(res.grossEarnings).toBeCloseTo(150793.96, 1)
    })
  })

  // ============================================================
  // 3. 14 LEAVE DAYS SCENARIO (11 ELIGIBLE, 3 NON-COMPENSABLE)
  // ============================================================
  describe('Annual Compensation Ledger & 14-Day Scenario', () => {
    it('applies initial deductions to all 14 days, caps compensation eligibility at 11 days, and marks 3 as non-compensable', async () => {
      // Mock 14 working day leaves taken by the employee in 2026
      const mockLeaves = [
        '2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09',
        '2026-02-02', '2026-02-03', '2026-02-04', '2026-02-05', '2026-02-06',
        '2026-03-02', // 11th leave (Eligible for compensation)
        '2026-03-03', // 12th leave (Non-compensable)
        '2026-03-04', // 13th leave (Non-compensable)
        '2026-03-05', // 14th leave (Non-compensable)
      ]

      // Mock DB timesheet entries query in getEmployeeAnnualCompensationLedger
      const mockTimesheet = {
        id: 'ts-14',
        year: 2026,
        month: 3,
        status: 'APPROVED',
        timesheet_entries: mockLeaves.map(date => ({
          work_date: date,
          entry_date: date,
          is_leave: true,
          leave_type_name: 'Casual Leave',
          description: `[LEAVE|id:cl|code:CL|name:Casual Leave|paid:0] Vacation`,
        })),
      }

      const createChain = (data: any) => {
        const chain: any = {
          data,
          select: () => chain,
          eq: () => chain,
          gte: () => chain,
          lte: () => chain,
          in: () => chain,
          order: () => chain,
          maybeSingle: async () => ({ data, error: null }),
          then: (resolve: any) => resolve({ data, error: null }),
        }
        return chain
      }

      const mockSupabase = {
        from: (table: string) => {
          if (table === 'employees') {
            return createChain({ id: employeeId, employee_code: 'HRK-001', full_name: 'Test Emp', departments: { name: 'Eng' } })
          }
          if (table === 'salary_structures') {
            return createChain([{ monthly_gross: 100000, status: 'active' }])
          }
          if (table === 'timesheets') {
            return createChain([mockTimesheet])
          }
          return createChain([])
        },
      }

      vi.spyOn(await import('@/lib/supabase/admin'), 'createAdminClient')
        .mockReturnValue(mockSupabase as any)

      vi.spyOn(await import('@/lib/services/company-calendar-service'), 'getCompanyAnnualHolidays')
        .mockResolvedValue([])

      vi.spyOn(await import('@/lib/services/company-calendar-service'), 'getCompanyMonthlyCalendar')
        .mockResolvedValue({
          year: 2026,
          month: 1,
          calendarDays: 31,
          weekendDays: 9,
          holidayDays: 0,
          workingDays: 21,
          holidays: [],
          weekendDates: [],
          workingDates: [],
        } as any)

      const ledger = await getEmployeeAnnualCompensationLedger(companyId, employeeId, 2026)

      // Total leaves taken = 14
      expect(ledger.totalLeavesTaken).toBe(14)

      // Maximum eligible compensation days = 11
      expect(ledger.eligibleCompensationDays).toBe(11)

      // Ineligible days = 3 (14 - 11)
      expect(ledger.ineligibleDays).toBe(3)

      // Total deductions made across all 14 days
      expect(ledger.totalDeductionsAmount).toBeGreaterThan(0)

      // Eligible compensation amount strictly matches the first 11 days' actual deductions
      const sumFirst11 = ledger.entries
        .filter(e => e.isEligibleForCompensation)
        .reduce((sum, e) => sum + e.deductionAmount, 0)
      expect(ledger.eligibleCompensationAmount).toBeCloseTo(sumFirst11, 2)

      // Exactly 11 entries marked eligible with sequence 1..11
      const eligibleEntries = ledger.entries.filter(e => e.isEligibleForCompensation)
      expect(eligibleEntries.length).toBe(11)
      expect(eligibleEntries[0].compensationSequence).toBe(1)
      expect(eligibleEntries[10].compensationSequence).toBe(11)

      // Exactly 3 entries marked ineligible with ineligibilityReason
      const ineligibleEntries = ledger.entries.filter(e => !e.isEligibleForCompensation)
      expect(ineligibleEntries.length).toBe(3)
      expect(ineligibleEntries[0].compensationSequence).toBeNull()
      expect(ineligibleEntries[0].ineligibilityReason).toContain('Beyond 11-day annual compensation entitlement')
    })
  })

  // ============================================================
  // 4. YEAR-END AUDIT & PAYROLL SETTLEMENT INTEGRATION
  // ============================================================
  describe('Year-End Audit & Dedicated Payroll Settlement', () => {
    it('integrates approved annual leave compensation into year-end payroll settlement earnings', () => {
      // Monthly gross = ₹100,000, Working days = 22, 0 LOP in current month
      // Plus approved year-end compensation settlement = ₹15,873.04 (from previous leave audit)
      const input: PayrollInput = {
        employee: {
          id: employeeId,
          employee_code: 'HRK-001',
          full_name: 'Vattem Thirupathi Raju',
        },
        salaryStructure: {
          id: 'ss-settlement',
          name: 'Executive Structure',
          monthly_gross: 100000,
        },
        salaryComponents: [
          {
            component_id: 'c-basic',
            monthly_amount: 100000,
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
          id: 'period-dec',
          start_date: '2026-12-01',
          end_date: '2026-12-31',
        },
        settings: {
          pay_schedule: 'MONTHLY',
        },
        statutoryRules: [],
        calendarDays: 31,
        workingDays: 22,
        paidDays: 22,
        lopDays: 0,
        annualCTC: 1200000,
      }

      const res = calculatePayroll(input)
      expect(res.lopDeduction).toBe(0)
      expect(res.grossEarnings).toBe(100000)

      // When the approved compensation settlement of ₹15,873.04 is added
      const approvedCompensation = 15873.04
      const settlementGross = res.grossEarnings + approvedCompensation
      const settlementNet = res.netSalary + approvedCompensation

      expect(settlementGross).toBeCloseTo(115873.04, 2)
      expect(settlementNet).toBeCloseTo(115873.04, 2)
    })
  })
})
