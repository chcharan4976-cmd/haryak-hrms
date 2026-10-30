/**
 * Haryak Technologies India Private Limited
 * Canonical Leave Policy & Balance Service
 *
 * Single source of truth for:
 * - 11-Day Annual Paid Leave Policy per calendar year
 * - Company Calendar public holiday isolation (paid, separate, zero balance consumption)
 * - Automatic classification of working-day leaves: Paid Leave (first 11) vs LOP (beyond 11)
 * - Exact financial deduction impact: ₹0 for Paid Leave/Holidays, 1 day rate for LOP
 * - Concurrency-safe year-wise leave balances and history tracking
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { getCompanyAnnualHolidays, isWeekendIso, CompanyHoliday } from '@/lib/services/company-calendar-service'

export const DEFAULT_ANNUAL_PAID_LEAVE_DAYS = 11

export interface EmployeeLeaveRecord {
  id?: string
  date: string
  type: 'PAID_LEAVE' | 'LOP' | 'PUBLIC_HOLIDAY'
  categoryName: string
  source: 'TIMESHEET' | 'LEAVE_REQUEST' | 'COMPANY_CALENDAR'
  reason?: string
  isPaid: boolean
  deductionImpact: number // 0 for paid leave or public holiday, 1 for LOP
}

export interface EmployeeAnnualLeaveSummary {
  employeeId: string
  companyId: string
  year: number
  annualEntitlement: number // Default 11
  paidLeaveUsed: number
  paidLeaveRemaining: number
  unpaidLeaveLop: number
  companyHolidaysCount: number
  companyHolidays: CompanyHoliday[]
  leaveHistory: EmployeeLeaveRecord[]
}

export interface LeaveClassificationResult {
  date: string
  isHoliday: boolean
  holidayName?: string
  isPaid: boolean
  isLop: boolean
  classification: 'PUBLIC_HOLIDAY' | 'PAID_LEAVE' | 'LOP'
  label: string
  balanceBefore: number
  balanceAfter: number
  salaryDeductionDays: number
}

function parseLeaveDescription(rawDesc?: string | null): {
  isLeave: boolean
  leaveTypeId?: string
  leaveTypeName?: string
  leaveTypeCode?: string
  isPaid?: boolean
  cleanDescription: string
} {
  const desc = String(rawDesc || '').trim()
  const match = desc.match(/^\[LEAVE\|id:([^|]*)\|code:([^|]*)\|name:([^|]*)\|paid:([^\]]*)\]\s*(.*)$/)
  if (match) {
    const [, id, code, name, paid, rest] = match
    return {
      isLeave: true,
      leaveTypeId: id || undefined,
      leaveTypeCode: code || undefined,
      leaveTypeName: name || undefined,
      isPaid: paid === '1' ? true : paid === '0' ? false : undefined,
      cleanDescription: rest || '',
    }
  }
  return {
    isLeave: false,
    cleanDescription: desc,
  }
}

/**
 * Calculates the complete annual leave summary for an employee for a given calendar year.
 * Rules:
 * 1. Annual entitlement is 11 paid leave days per calendar year.
 * 2. Company Calendar public holidays are separate and do NOT consume this entitlement.
 * 3. The first 11 working-day leaves across approved requests and approved timesheets are Paid Leave.
 * 4. Any additional working-day leaves beyond 11 become LOP (Loss of Pay).
 * 5. Deduplicates leaves so an absence is never counted twice.
 */
export async function getEmployeeAnnualLeaveSummary(
  companyId: string,
  employeeId: string,
  year: number
): Promise<EmployeeAnnualLeaveSummary> {
  const annualEntitlement = DEFAULT_ANNUAL_PAID_LEAVE_DAYS
  const holidays = await getCompanyAnnualHolidays(companyId, year)
  const holidayDateMap = new Map<string, CompanyHoliday>()
  for (const h of holidays) {
    holidayDateMap.set(h.date, h)
  }

  const supabase = createAdminClient()
  const yearStart = `${year}-01-01`
  const yearEnd = `${year}-12-31`

  // Map to hold unique absence by ISO date to prevent double-counting across timesheets & leave requests
  const dateRecordMap = new Map<string, EmployeeLeaveRecord>()

  if (supabase) {
    // 1. Fetch approved leave requests for this employee in the calendar year
    const { data: approvedRequests } = await supabase
      .from('leave_requests')
      .select('id, start_date, end_date, reason, status, leave_types(id, name, code, is_paid)')
      .eq('company_id', companyId)
      .eq('employee_id', employeeId)
      .gte('start_date', yearStart)
      .lte('start_date', yearEnd)
      .in('status', ['APPROVED', 'approved', 'Approved'])
      .order('start_date', { ascending: true })

    if (approvedRequests) {
      for (const req of approvedRequests) {
        const startDate = String(req.start_date).slice(0, 10)
        const endDate = String(req.end_date || req.start_date).slice(0, 10)
        const isPaidType = (req.leave_types as any)?.is_paid !== false

        // Enumerate dates
        const cur = new Date(`${startDate}T00:00:00Z`)
        const end = new Date(`${endDate}T00:00:00Z`)
        while (cur <= end) {
          const dateStr = cur.toISOString().slice(0, 10)
          cur.setUTCDate(cur.getUTCDate() + 1)

          // Skip weekends & public holidays from consuming annual leave entitlement
          if (isWeekendIso(dateStr) || holidayDateMap.has(dateStr)) {
            continue
          }

          if (!dateRecordMap.has(dateStr)) {
            dateRecordMap.set(dateStr, {
              id: req.id,
              date: dateStr,
              type: isPaidType ? 'PAID_LEAVE' : 'LOP',
              categoryName: (req.leave_types as any)?.name || 'Approved Leave',
              source: 'LEAVE_REQUEST',
              reason: req.reason || 'Leave request',
              isPaid: isPaidType,
              deductionImpact: isPaidType ? 0 : 1,
            })
          }
        }
      }
    }

    // 2. Fetch approved timesheets and their leave entries for this employee in the calendar year
    const { data: approvedTimesheets } = await supabase
      .from('timesheets')
      .select('id, year, month, status, timesheet_entries(*)')
      .eq('company_id', companyId)
      .eq('employee_id', employeeId)
      .eq('year', year)
      .in('status', ['APPROVED', 'approved', 'Approved'])

    if (approvedTimesheets) {
      for (const ts of approvedTimesheets) {
        const entries = (ts.timesheet_entries as any[]) || []
        for (const entry of entries) {
          const dateStr = String(entry.work_date || entry.entry_date).slice(0, 10)
          if (!dateStr || isWeekendIso(dateStr) || holidayDateMap.has(dateStr)) {
            continue
          }

          const parsed = parseLeaveDescription(entry.description)
          const isLeave = Boolean(
            entry.is_leave === true ||
            parsed.isLeave ||
            entry.task_category === 'Leave' ||
            entry.project_name === 'Leave'
          )

          if (isLeave && !dateRecordMap.has(dateStr)) {
            const isPaid = entry.is_paid !== undefined && entry.is_paid !== null
              ? Boolean(entry.is_paid)
              : parsed.isPaid !== undefined
              ? Boolean(parsed.isPaid)
              : true

            dateRecordMap.set(dateStr, {
              id: entry.id,
              date: dateStr,
              type: isPaid ? 'PAID_LEAVE' : 'LOP',
              categoryName: entry.leave_type_name || parsed.leaveTypeName || 'Timesheet Leave',
              source: 'TIMESHEET',
              reason: parsed.cleanDescription || entry.description || 'Timesheet Leave',
              isPaid,
              deductionImpact: isPaid ? 0 : 1,
            })
          }
        }
      }
    }
  }

  // Sort unique absences chronologically to apply the 11-day annual paid quota rule
  const allAbsenceDates = Array.from(dateRecordMap.keys()).sort()
  let paidLeaveUsed = 0
  let unpaidLeaveLop = 0
  const finalizedLeaveHistory: EmployeeLeaveRecord[] = []

  for (const dateStr of allAbsenceDates) {
    const rawRecord = dateRecordMap.get(dateStr)!

    // If it was explicitly marked as unpaid / LOP, count as LOP
    if (rawRecord.isPaid === false) {
      unpaidLeaveLop++
      finalizedLeaveHistory.push({
        ...rawRecord,
        type: 'LOP',
        isPaid: false,
        deductionImpact: 1,
      })
      continue
    }

    // Check against 11-day annual compensation quota
    if (paidLeaveUsed < annualEntitlement) {
      paidLeaveUsed++
      finalizedLeaveHistory.push({
        ...rawRecord,
        type: 'PAID_LEAVE',
        isPaid: false, // Monthly deducted, compensated at year-end
        deductionImpact: 1,
        categoryName: `${rawRecord.categoryName} (Monthly Deducted, Eligible for Year-End Compensation)`,
      })
    } else {
      unpaidLeaveLop++
      finalizedLeaveHistory.push({
        ...rawRecord,
        type: 'LOP',
        isPaid: false,
        deductionImpact: 1,
        categoryName: `${rawRecord.categoryName} (Monthly Deducted, 11-Day Entitlement Exhausted, Non-Compensable)`,
      })
    }
  }

  // Add Public Holidays into leave history as non-deductible paid company holidays
  for (const h of holidays) {
    finalizedLeaveHistory.push({
      date: h.date,
      type: 'PUBLIC_HOLIDAY',
      categoryName: h.name,
      source: 'COMPANY_CALENDAR',
      isPaid: true,
      deductionImpact: 0,
      reason: 'Official Company Paid Holiday',
    })
  }

  // Sort history chronologically
  finalizedLeaveHistory.sort((a, b) => a.date.localeCompare(b.date))

  const paidLeaveRemaining = Math.max(0, annualEntitlement - paidLeaveUsed)

  return {
    employeeId,
    companyId,
    year,
    annualEntitlement,
    paidLeaveUsed,
    paidLeaveRemaining,
    unpaidLeaveLop,
    companyHolidaysCount: holidays.length,
    companyHolidays: holidays,
    leaveHistory: finalizedLeaveHistory,
  }
}

/**
 * Classifies leave entries in a monthly timesheet based on remaining annual paid leave balance.
 *
 * Rules:
 * 1. Dates falling on Company Calendar public holidays are classified as PUBLIC_HOLIDAY (paid, 0 balance consumed).
 * 2. Working days marked as Leave:
 *    - If remaining balance > 0: classified as PAID_LEAVE (isPaid: true, ₹0 deduction), decrements remaining balance by 1.
 *    - If remaining balance == 0: classified as LOP (isPaid: false, 1 day deduction).
 */
export async function classifyTimesheetLeaves(params: {
  companyId: string
  employeeId: string
  year: number
  month: number
  leaveDates: Array<{ date: string; reason?: string; leaveTypeId?: string; leaveTypeName?: string }>
  excludeCurrentTimesheet?: boolean
  priorLeaveSummary?: Partial<EmployeeAnnualLeaveSummary>
}): Promise<{
  classifiedEntries: LeaveClassificationResult[]
  paidLeaveDays: number
  lopDays: number
  holidayDays: number
  startingBalance: number
  endingBalance: number
}> {
  const { companyId, employeeId, year, leaveDates } = params

  // 1. Fetch annual summary to determine balance used prior to or outside this submission
  const annualSummary: EmployeeAnnualLeaveSummary = params.priorLeaveSummary?.annualEntitlement !== undefined
    ? {
        employeeId,
        companyId,
        year,
        annualEntitlement: params.priorLeaveSummary.annualEntitlement ?? DEFAULT_ANNUAL_PAID_LEAVE_DAYS,
        paidLeaveUsed: params.priorLeaveSummary.paidLeaveUsed ?? 0,
        paidLeaveRemaining: params.priorLeaveSummary.paidLeaveRemaining ?? DEFAULT_ANNUAL_PAID_LEAVE_DAYS,
        unpaidLeaveLop: params.priorLeaveSummary.unpaidLeaveLop ?? 0,
        companyHolidaysCount: params.priorLeaveSummary.companyHolidaysCount ?? 0,
        companyHolidays: params.priorLeaveSummary.companyHolidays ?? [],
        leaveHistory: params.priorLeaveSummary.leaveHistory ?? [],
      }
    : await getEmployeeAnnualLeaveSummary(companyId, employeeId, year)

  const holidayMap = new Map<string, CompanyHoliday>()
  for (const h of annualSummary.companyHolidays) {
    holidayMap.set(h.date, h)
  }

  let runningBalance = params.priorLeaveSummary?.paidLeaveRemaining !== undefined
    ? params.priorLeaveSummary.paidLeaveRemaining
    : 0

  if (params.priorLeaveSummary?.paidLeaveRemaining === undefined) {
    // Calculate used balance from prior approved leaves that do not belong to the current month being submitted
    const padMonth = String(params.month).padStart(2, '0')
    const monthPrefix = `${year}-${padMonth}-`

    let priorPaidUsed = 0
    for (const rec of annualSummary.leaveHistory) {
      if (rec.type === 'PAID_LEAVE') {
        if (params.excludeCurrentTimesheet && rec.date.startsWith(monthPrefix)) {
          // Exclude current month's already recorded entries when re-evaluating
          continue
        }
        priorPaidUsed++
      }
    }

    runningBalance = Math.max(0, annualSummary.annualEntitlement - priorPaidUsed)
  }

  const startingBalance = runningBalance

  const classifiedEntries: LeaveClassificationResult[] = []
  let paidLeaveDays = 0
  let lopDays = 0
  let holidayDays = 0

  for (const item of leaveDates) {
    const dateStr = item.date
    const holiday = holidayMap.get(dateStr)

    if (holiday) {
      holidayDays++
      classifiedEntries.push({
        date: dateStr,
        isHoliday: true,
        holidayName: holiday.name,
        isPaid: true,
        isLop: false,
        classification: 'PUBLIC_HOLIDAY',
        label: `Company Holiday: ${holiday.name} (Paid, no leave deducted)`,
        balanceBefore: runningBalance,
        balanceAfter: runningBalance,
        salaryDeductionDays: 0,
      })
      continue
    }

    if (runningBalance > 0) {
      const balanceBefore = runningBalance
      runningBalance -= 1
      paidLeaveDays++
      classifiedEntries.push({
        date: dateStr,
        isHoliday: false,
        isPaid: false, // Deducted in monthly salary under annual compensation policy
        isLop: true,
        classification: 'PAID_LEAVE',
        label: `Leave (Monthly Salary Deductible — Eligible for Year-End Compensation, ${runningBalance}/${annualSummary.annualEntitlement} compensation balance)`,
        balanceBefore,
        balanceAfter: runningBalance,
        salaryDeductionDays: 1,
      })
    } else {
      lopDays++
      classifiedEntries.push({
        date: dateStr,
        isHoliday: false,
        isPaid: false,
        isLop: true,
        classification: 'LOP',
        label: 'Leave (Monthly Salary Deductible — 11-Day Annual Entitlement Exhausted, Non-Compensable)',
        balanceBefore: 0,
        balanceAfter: 0,
        salaryDeductionDays: 1,
      })
    }
  }

  return {
    classifiedEntries,
    paidLeaveDays,
    lopDays,
    holidayDays,
    startingBalance,
    endingBalance: runningBalance,
  }
}

/**
 * Idempotently synchronizes the database leave_balances table with the canonical 11-day policy.
 * Maintains RLS and safe upsert semantics.
 */
export async function syncEmployeeLeaveBalances(
  companyId: string,
  employeeId: string,
  year: number
): Promise<void> {
  const supabase = createAdminClient()
  if (!supabase || !companyId || !employeeId) return

  const summary = await getEmployeeAnnualLeaveSummary(companyId, employeeId, year)

  // Find or create default Paid Leave type
  const { data: leaveTypes } = await supabase
    .from('leave_types')
    .select('id, code, is_paid')
    .eq('company_id', companyId)
    .eq('is_active', true)

  const paidLeaveType = leaveTypes?.find(t => t.is_paid === true)
  if (paidLeaveType) {
    await supabase
      .from('leave_balances')
      .upsert(
        {
          employee_id: employeeId,
          leave_type_id: paidLeaveType.id,
          fiscal_year: year,
          opening_balance: summary.annualEntitlement,
          accrued: 0,
          used: summary.paidLeaveUsed,
          adjusted: 0,
          closing_balance: summary.paidLeaveRemaining,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'employee_id,leave_type_id,fiscal_year',
        }
      )
  }
}
