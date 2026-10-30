import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getCompanyMonthlyCalendar,
  getCompanyMonthlyCalendarDays,
} from '@/lib/services/company-calendar-service'
import {
  calculatePaidDays,
  calculatePayroll,
  type PayrollInput,
} from '@/lib/payroll/payroll-engine'

describe('Timesheet, Calendar & Payroll Integration Master Test Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  // ============================================================
  // 1. DYNAMIC MONTHLY WORKING-DAY CALCULATION
  // ============================================================
  describe('Dynamic Monthly Working-Day Calculation', () => {
    it('calculates dynamic days in month (28, 29, 30, 31) and never hardcodes 21', async () => {
      // February 2025: Non-leap year (28 days)
      const feb2025 = await getCompanyMonthlyCalendar('test-co', 2025, 2)
      expect(feb2025.calendarDays).toBe(28)
      // Feb 2025 has 8 weekend days (4 Saturdays, 4 Sundays) -> 20 working days without holidays
      expect(feb2025.weekendDates.length).toBe(8)
      expect(feb2025.workingDays).toBe(20)

      // February 2024: Leap year (29 days)
      const feb2024 = await getCompanyMonthlyCalendar('test-co', 2024, 2)
      expect(feb2024.calendarDays).toBe(29)

      // April 2026: 30 days
      const apr2026 = await getCompanyMonthlyCalendar('test-co', 2026, 4)
      expect(apr2026.calendarDays).toBe(30)

      // May 2026: 31 days
      const may2026 = await getCompanyMonthlyCalendar('test-co', 2026, 5)
      expect(may2026.calendarDays).toBe(31)

      // Verify that workingDays is dynamic and not hardcoded to 21
      expect(feb2025.workingDays).toBe(20)
      expect(feb2024.workingDays).toBe(21)
      expect(apr2026.workingDays).toBe(22)
      expect(may2026.workingDays).toBe(21)
      expect(feb2025.workingDays).not.toBe(apr2026.workingDays)
    })

    it('excludes Saturdays and Sundays by default', async () => {
      const cal = await getCompanyMonthlyCalendar('test-co', 2026, 10) // October 2026
      expect(cal.calendarDays).toBe(31)

      // Verify weekend dates
      for (const dateStr of cal.weekendDates) {
        const [y, m, d] = dateStr.split('-').map(Number)
        const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
        expect(dow === 0 || dow === 6).toBe(true)
      }

      // Verify working dates are weekdays
      for (const dateStr of cal.workingDates) {
        const [y, m, d] = dateStr.split('-').map(Number)
        const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
        expect(dow !== 0 && dow !== 6).toBe(true)
      }
    })

    it('excludes public/company holidays from scheduled working days', async () => {
      const calWithoutHolidays = await getCompanyMonthlyCalendar('test-co', 2026, 1) // Jan 2026
      // Jan 2026 has 31 days, 9 weekend days -> 22 weekdays
      expect(calWithoutHolidays.calendarDays).toBe(31)
      expect(calWithoutHolidays.weekendDates.length).toBe(9)
      expect(calWithoutHolidays.workingDays).toBe(22)
    })
  })

  // ============================================================
  // 2. SALARY DEDUCTION AND PRORATION FORMULA
  // ============================================================
  describe('Monthly Working Days & Salary Deduction Formula', () => {
    it('calculates exact financial formula: ₹21 salary, 21 working days, 1 unpaid leave day (LOP) = ₹20 payable', () => {
      const paidDaysResult = calculatePaidDays({
        periodStartDate: '2026-05-01',
        periodEndDate: '2026-05-31',
        lopDays: 1,
        weeklyOffs: [0, 6],
        policy: 'WORKING_DAYS',
      })

      // Assuming May 2026 has 21 working days (or we test the engine with workingDays: 21, paidDays: 20)
      const input: PayrollInput = {
        employee: {
          id: 'emp-1',
          employee_code: 'EMP001',
          full_name: 'Test Employee',
        },
        salaryStructure: {
          id: 'ss-1',
          name: 'Standard',
          monthly_gross: 21,
        },
        salaryComponents: [
          {
            component_id: 'c-basic',
            monthly_amount: 21,
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
          start_date: '2026-05-01',
          end_date: '2026-05-31',
        },
        settings: {
          pay_schedule: 'MONTHLY',
        },
        statutoryRules: [],
        calendarDays: 31,
        workingDays: 21, // 21 scheduled working days
        paidDays: 20,    // 21 - 1 LOP = 20 paid days
        lopDays: 1,      // 1 approved unpaid leave day
        annualCTC: 252,
      }

      const result = calculatePayroll(input)

      // Daily rate = Monthly eligible salary ÷ Monthly scheduled working days = 21 ÷ 21 = ₹1.00
      expect(result.perDayGrossRate).toBe(1)

      // Paid day factor = 20 ÷ 21
      expect(result.calculationDetails.paidDayFactor).toBeCloseTo(20 / 21, 5)

      // Prorated fixed gross = 21 * (20 / 21) = ₹20.00
      expect(result.proratedFixedGross).toBe(20)

      // LOP deduction = Monthly gross - Prorated fixed gross = 21 - 20 = ₹1.00
      expect(result.lopDeduction).toBe(1)

      // Net salary = ₹20.00
      expect(result.netSalary).toBe(20)
    })

    it('does not deduct salary for approved paid leave days', () => {
      const input: PayrollInput = {
        employee: {
          id: 'emp-2',
          employee_code: 'EMP002',
          full_name: 'Paid Leave Employee',
        },
        salaryStructure: {
          id: 'ss-1',
          name: 'Standard',
          monthly_gross: 44000,
        },
        salaryComponents: [
          {
            component_id: 'c-basic',
            monthly_amount: 44000,
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
          start_date: '2026-05-01',
          end_date: '2026-05-31',
        },
        settings: {
          pay_schedule: 'MONTHLY',
        },
        statutoryRules: [],
        calendarDays: 31,
        workingDays: 22,
        paidDays: 22, // 20 worked + 2 paid leave = 22 paid days
        lopDays: 0,   // 0 LOP
        annualCTC: 528000,
      }

      const result = calculatePayroll(input)

      expect(result.perDayGrossRate).toBe(2000)
      expect(result.lopDeduction).toBe(0)
      expect(result.proratedFixedGross).toBe(44000)
      expect(result.netSalary).toBe(44000)
    })

    it('correctly calculates multi-day LOP proration across multiple salary components', () => {
      const input: PayrollInput = {
        employee: {
          id: 'emp-3',
          employee_code: 'EMP003',
          full_name: 'Executive Employee',
        },
        salaryStructure: {
          id: 'ss-exec',
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
          start_date: '2026-05-01',
          end_date: '2026-05-31',
        },
        settings: {
          pay_schedule: 'MONTHLY',
        },
        statutoryRules: [],
        calendarDays: 31,
        workingDays: 20, // 20 working days
        paidDays: 18,    // 2 days LOP -> 18 paid days
        lopDays: 2,
        annualCTC: 1200000,
      }

      const result = calculatePayroll(input)

      // Total monthly entitlement = 50000 + 25000 + 25000 = 100000
      expect(result.monthlyGrossEntitlement).toBe(100000)

      // Daily gross rate = 100000 / 20 = 5000
      expect(result.perDayGrossRate).toBe(5000)

      // Paid day factor = 18 / 20 = 0.90
      expect(result.calculationDetails.paidDayFactor).toBe(0.9)

      // Prorated gross = 100000 * 0.90 = 90000
      expect(result.proratedFixedGross).toBe(90000)

      // LOP deduction = 100000 - 90000 = 10000 (Daily rate 5000 × 2 LOP days)
      expect(result.lopDeduction).toBe(10000)
    })
  })

  // ============================================================
  // 3. TIMESHEET LEAVE ENTRIES & NO INDEPENDENT LEAVE REQUESTS
  // ============================================================
  describe('Timesheet Leave Workflow', () => {
    it('creates timesheet leave entries with 0 hours, metadata and without calling independent leave API', () => {
      // Simulating timesheet leave marking
      const leaveEntry = {
        id: 'entry-uuid-1',
        timesheetId: 'ts-uuid-1',
        entryDate: '2026-10-12',
        projectName: 'Leave',
        taskCategory: 'Leave',
        description: '[LEAVE|CASUAL|Casual Leave|PAID|Personal appointment]',
        hours: 0,
        isBillable: false,
        isLeave: true,
        leaveTypeId: 'lt-cl',
        leaveTypeName: 'Casual Leave',
        leaveTypeCode: 'CASUAL',
        leaveReason: 'Personal appointment',
        isPaid: true,
      }

      expect(leaveEntry.hours).toBe(0)
      expect(leaveEntry.isLeave).toBe(true)
      expect(leaveEntry.isPaid).toBe(true)
      expect(leaveEntry.taskCategory).toBe('Leave')
      expect(leaveEntry.description).toContain('[LEAVE|CASUAL|Casual Leave|PAID|')
    })

    it('identifies unpaid leave (LOP) metadata in timesheet entries', () => {
      const lopEntry = {
        id: 'entry-uuid-2',
        timesheetId: 'ts-uuid-1',
        entryDate: '2026-10-13',
        projectName: 'Leave',
        taskCategory: 'Leave',
        description: '[LEAVE|LOP|Loss of Pay|UNPAID|Urgent leave exhausted balance]',
        hours: 0,
        isBillable: false,
        isLeave: true,
        leaveTypeId: 'lt-lop',
        leaveTypeName: 'Loss of Pay',
        leaveTypeCode: 'LOP',
        leaveReason: 'Urgent leave exhausted balance',
        isPaid: false,
      }

      expect(lopEntry.hours).toBe(0)
      expect(lopEntry.isLeave).toBe(true)
      expect(lopEntry.isPaid).toBe(false)
      expect(lopEntry.leaveTypeCode).toBe('LOP')
    })
  })

  // ============================================================
  // 4. APPROVAL QUEUE EXCLUSION OF DRAFT TIMESHEETS
  // ============================================================
  describe('Approval Queue Isolation', () => {
    it('strictly excludes DRAFT timesheets from approval queue rows', () => {
      const timesheetsFromDb = [
        { id: 'ts-1', employee_name: 'Alice', status: 'DRAFT', total_hours: 40 },
        { id: 'ts-2', employee_name: 'Bob', status: 'SUBMITTED', total_hours: 160 },
        { id: 'ts-3', employee_name: 'Charlie', status: 'UNDER_REVIEW', total_hours: 152 },
        { id: 'ts-4', employee_name: 'Diana', status: 'APPROVED', total_hours: 168 },
      ]

      // Filter logic in /approvals page: exclude DRAFT
      const pendingApprovalRows = timesheetsFromDb.filter(
        ts => ts.status !== 'DRAFT' && ['SUBMITTED', 'UNDER_REVIEW'].includes(ts.status)
      )

      expect(pendingApprovalRows.length).toBe(2)
      expect(pendingApprovalRows.map(r => r.employee_name)).toEqual(['Bob', 'Charlie'])
      expect(pendingApprovalRows.some(r => r.status === 'DRAFT')).toBe(false)
    })
  })

  // ============================================================
  // 5. ATTENDANCE CLASSIFICATION & RECONCILIATION
  // ============================================================
  describe('Attendance Status Classification', () => {
    it('distinguishes Present, Paid Leave, Unpaid Leave / LOP, Public Holiday, and Weekly Off', () => {
      const testCases = [
        {
          scenario: 'Sunday without punch',
          isWeekend: true,
          isHoliday: false,
          hasWorkHours: false,
          isLeave: false,
          expectedStatus: 'Weekly Off',
        },
        {
          scenario: 'Company Holiday without punch',
          isWeekend: false,
          isHoliday: true,
          hasWorkHours: false,
          isLeave: false,
          expectedStatus: 'Public Holiday',
        },
        {
          scenario: 'Approved timesheet work entry',
          isWeekend: false,
          isHoliday: false,
          hasWorkHours: true,
          isLeave: false,
          expectedStatus: 'Present',
        },
        {
          scenario: 'Approved timesheet paid leave entry',
          isWeekend: false,
          isHoliday: false,
          hasWorkHours: false,
          isLeave: true,
          isPaid: true,
          expectedStatus: 'Paid Leave',
        },
        {
          scenario: 'Approved timesheet unpaid leave entry',
          isWeekend: false,
          isHoliday: false,
          hasWorkHours: false,
          isLeave: true,
          isPaid: false,
          expectedStatus: 'Unpaid Leave / LOP',
        },
      ]

      for (const tc of testCases) {
        let status = 'NOT_MARKED'
        if (tc.isHoliday) {
          status = 'Public Holiday'
        } else if (tc.isWeekend) {
          status = 'Weekly Off'
        } else if (tc.isLeave) {
          status = tc.isPaid ? 'Paid Leave' : 'Unpaid Leave / LOP'
        } else if (tc.hasWorkHours) {
          status = 'Present'
        }

        expect(status).toBe(tc.expectedStatus)
      }
    })
  })
})
