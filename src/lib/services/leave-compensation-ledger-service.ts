/**
 * Haryak Technologies India Private Limited
 * Canonical Annual Leave Compensation Ledger & Year-End Audit Service
 *
 * Implements the mandatory Company Payroll Policy:
 * 1. 11 annual paid-leave compensation days per calendar year.
 * 2. Every employee-requested leave day on a normal scheduled working day is initially deducted
 *    from that month's salary (monthly deduction followed by annual compensation model).
 * 3. Company Calendar public holidays are automatically paid, never deducted, and never consume entitlement.
 * 4. Deductions are tracked date-by-date in this centralized annual compensation ledger.
 * 5. Up to 11 eligible deducted days can be compensated at the end of the year after audit.
 * 6. Audit, approval, and settlement workflow integrated with payroll adjustments and payslips.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import {
  getCompanyAnnualHolidays,
  getCompanyMonthlyCalendar,
  isWeekendIso,
  CompanyHoliday,
} from '@/lib/services/company-calendar-service'

export const DEFAULT_ANNUAL_COMPENSATION_DAYS = 11

export interface LeaveCompensationDeductionEntry {
  id?: string
  leaveDate: string
  leaveTypeName: string
  reason?: string
  source: 'TIMESHEET' | 'LEAVE_REQUEST' | 'ATTENDANCE'
  dailySalaryRate: number
  deductionAmount: number
  payrollPeriod?: string
  payrollPeriodId?: string
  payrollRunId?: string
  isEligibleForCompensation: boolean
  compensationSequence: number | null // 1..11 for eligible, null for >11
  ineligibilityReason?: string
  isCompensated: boolean
  compensatedAmount: number
}

export type AuditStatus = 'PENDING_AUDIT' | 'AUDITED' | 'APPROVED' | 'SETTLED' | 'REJECTED'

export interface AnnualLeaveCompensationLedger {
  employeeId: string
  employeeCode: string
  employeeName: string
  departmentName: string
  companyId: string
  calendarYear: number
  annualEntitlement: number
  totalLeavesTaken: number
  totalDeductionsAmount: number
  eligibleCompensationDays: number
  eligibleCompensationAmount: number
  ineligibleDays: number
  approvedCompensationDays: number
  approvedCompensationAmount: number
  paidCompensationAmount: number
  remainingCompensationEntitlement: number
  auditStatus: AuditStatus
  auditedBy?: string
  auditedAt?: string
  auditNotes?: string
  settlementReference?: string
  settledAt?: string
  entries: LeaveCompensationDeductionEntry[]
}

function parseLeaveDescription(rawDesc?: string | null): {
  isLeave: boolean
  leaveTypeName?: string
  cleanDescription: string
} {
  const desc = String(rawDesc || '').trim()
  const match = desc.match(/^\[LEAVE\|id:([^|]*)\|code:([^|]*)\|name:([^|]*)\|paid:([^\]]*)\]\s*(.*)$/)
  if (match) {
    const [, , , name, , rest] = match
    return {
      isLeave: true,
      leaveTypeName: name || undefined,
      cleanDescription: rest || '',
    }
  }
  return {
    isLeave: false,
    cleanDescription: desc,
  }
}

/**
 * Computes the Annual Leave Compensation Ledger for an individual employee.
 * Strictly enforces:
 * - Public holidays excluded and zero deduction
 * - Weekends excluded
 * - Every normal working-day leave has a recorded daily salary rate deduction
 * - First 11 leaves are marked eligible for year-end reimbursement
 * - Subsequent leaves (>11) are marked ineligible
 */
export async function getEmployeeAnnualCompensationLedger(
  companyId: string,
  employeeId: string,
  year: number
): Promise<AnnualLeaveCompensationLedger> {
  const supabase = createAdminClient()
  const annualEntitlement = DEFAULT_ANNUAL_COMPENSATION_DAYS

  // 1. Employee metadata & compensation structure
  let employeeCode = 'EMP'
  let employeeName = 'Employee'
  let departmentName = 'General'
  let monthlyGross = 0

  if (supabase) {
    const { data: emp } = await supabase
      .from('employees')
      .select('id, employee_code, full_name, departments(name)')
      .eq('id', employeeId)
      .maybeSingle()

    if (emp) {
      employeeCode = emp.employee_code || employeeCode
      employeeName = emp.full_name || employeeName
      departmentName = (emp.departments as any)?.name || departmentName
    }

    const { data: structures } = await supabase
      .from('salary_structures')
      .select('monthly_gross, status')
      .eq('employee_id', employeeId)
      .order('effective_from', { ascending: false })

    if (structures && structures.length > 0) {
      const active = structures.find(s => s.status === 'active' || s.status === 'approved') || structures[0]
      monthlyGross = Number(active.monthly_gross || 0)
    }
  }

  // 2. Fetch public holidays for the year to guarantee zero deduction and isolation
  const holidays = await getCompanyAnnualHolidays(companyId, year)
  const holidayMap = new Map<string, CompanyHoliday>()
  for (const h of holidays) {
    holidayMap.set(h.date, h)
  }

  // 3. Cache calendar working days per month for accurate daily rates:
  // Daily rate = Monthly eligible salary ÷ Scheduled payable working days for that payroll month
  const monthlyWorkingDaysCache = new Map<number, number>()
  for (let m = 1; m <= 12; m++) {
    const cal = await getCompanyMonthlyCalendar(companyId, year, m)
    monthlyWorkingDaysCache.set(m, cal.workingDays > 0 ? cal.workingDays : 21)
  }

  // 4. Collect unique date-level working-day leave absences across timesheets & requests
  const rawAbsencesByDate = new Map<string, {
    source: 'TIMESHEET' | 'LEAVE_REQUEST'
    leaveTypeName: string
    reason?: string
  }>()

  if (supabase) {
    // A. Approved/Submitted/Draft timesheet entries
    const { data: timesheets } = await supabase
      .from('timesheets')
      .select('id, year, month, status, timesheet_entries(*)')
      .eq('company_id', companyId)
      .eq('employee_id', employeeId)
      .eq('year', year)

    if (timesheets) {
      for (const ts of timesheets) {
        const entries = (ts.timesheet_entries as any[]) || []
        for (const entry of entries) {
          const dateStr = String(entry.work_date || entry.entry_date).slice(0, 10)
          if (!dateStr || isWeekendIso(dateStr) || holidayMap.has(dateStr)) {
            continue
          }

          const parsed = parseLeaveDescription(entry.description)
          const isLeave = Boolean(
            entry.is_leave === true ||
            parsed.isLeave ||
            entry.task_category === 'Leave' ||
            entry.project_name === 'Leave'
          )

          if (isLeave && !rawAbsencesByDate.has(dateStr)) {
            rawAbsencesByDate.set(dateStr, {
              source: 'TIMESHEET',
              leaveTypeName: entry.leave_type_name || parsed.leaveTypeName || 'Timesheet Leave',
              reason: parsed.cleanDescription || entry.description || 'Monthly Timesheet Leave',
            })
          }
        }
      }
    }

    // B. Approved leave requests
    const yearStart = `${year}-01-01`
    const yearEnd = `${year}-12-31`
    const { data: leaveRequests } = await supabase
      .from('leave_requests')
      .select('id, start_date, end_date, reason, status, leave_types(name)')
      .eq('company_id', companyId)
      .eq('employee_id', employeeId)
      .gte('start_date', yearStart)
      .lte('start_date', yearEnd)
      .in('status', ['APPROVED', 'approved', 'Approved'])

    if (leaveRequests) {
      for (const req of leaveRequests) {
        const start = new Date(`${String(req.start_date).slice(0, 10)}T00:00:00Z`)
        const end = new Date(`${String(req.end_date || req.start_date).slice(0, 10)}T00:00:00Z`)
        const cur = new Date(start)
        while (cur <= end) {
          const dateStr = cur.toISOString().slice(0, 10)
          cur.setUTCDate(cur.getUTCDate() + 1)

          if (isWeekendIso(dateStr) || holidayMap.has(dateStr)) {
            continue
          }

          if (!rawAbsencesByDate.has(dateStr)) {
            rawAbsencesByDate.set(dateStr, {
              source: 'LEAVE_REQUEST',
              leaveTypeName: (req.leave_types as any)?.name || 'Approved Leave',
              reason: req.reason || 'Leave Request',
            })
          }
        }
      }
    }
  }

  // 5. Build date-level deduction entries chronologically
  const sortedDates = Array.from(rawAbsencesByDate.keys()).sort()
  const entries: LeaveCompensationDeductionEntry[] = []
  let totalDeductionsAmount = 0
  let eligibleCompensationAmount = 0

  sortedDates.forEach((dateStr, index) => {
    const abs = rawAbsencesByDate.get(dateStr)!
    const monthNum = Number(dateStr.slice(5, 7))
    const workingDaysInMonth = monthlyWorkingDaysCache.get(monthNum) || 21

    // Exact Daily Salary Rate = Monthly eligible salary ÷ Scheduled payable working days
    const dailyRate = workingDaysInMonth > 0 && monthlyGross > 0
      ? Math.round((monthlyGross / workingDaysInMonth) * 100) / 100
      : 0

    const deductionAmount = dailyRate
    totalDeductionsAmount += deductionAmount

    const isEligible = index < annualEntitlement
    const compensationSeq = isEligible ? index + 1 : null

    if (isEligible) {
      eligibleCompensationAmount += deductionAmount
    }

    entries.push({
      leaveDate: dateStr,
      leaveTypeName: abs.leaveTypeName,
      reason: abs.reason,
      source: abs.source,
      dailySalaryRate: dailyRate,
      deductionAmount,
      payrollPeriod: `${new Date(dateStr).toLocaleString('default', { month: 'long' })} ${year}`,
      isEligibleForCompensation: isEligible,
      compensationSequence: compensationSeq,
      ineligibilityReason: isEligible ? undefined : 'Beyond 11-day annual compensation entitlement',
      isCompensated: false,
      compensatedAmount: 0,
    })
  })

  const totalLeavesTaken = sortedDates.length
  const eligibleCompensationDays = Math.min(totalLeavesTaken, annualEntitlement)
  const ineligibleDays = Math.max(0, totalLeavesTaken - annualEntitlement)
  const remainingCompensationEntitlement = Math.max(0, annualEntitlement - eligibleCompensationDays)

  // 6. Check for existing audit / settlement records in payroll_adjustments
  let auditStatus: AuditStatus = 'PENDING_AUDIT'
  let approvedDays = 0
  let approvedAmount = 0
  let paidAmount = 0
  let auditedBy: string | undefined
  let auditedAt: string | undefined
  let auditNotes: string | undefined
  let settlementReference: string | undefined
  let settledAt: string | undefined

  if (supabase) {
    const { data: adjustments } = await supabase
      .from('payroll_adjustments')
      .select('*')
      .eq('company_id', companyId)
      .eq('employee_id', employeeId)
      .eq('adjustment_type', 'ANNUAL_LEAVE_COMPENSATION')
      .order('created_at', { ascending: false })

    if (adjustments && adjustments.length > 0) {
      // Find matching year adjustment
      const adj = adjustments.find(a => a.metadata?.calendarYear === year) || adjustments[0]
      if (adj) {
        approvedDays = Number(adj.metadata?.approvedDays || eligibleCompensationDays)
        approvedAmount = Number(adj.amount || eligibleCompensationAmount)
        auditedBy = adj.approved_by || undefined
        auditedAt = adj.approved_at || undefined
        auditNotes = adj.description || adj.metadata?.auditNotes || undefined

        if (adj.status === 'applied') {
          auditStatus = 'SETTLED'
          paidAmount = approvedAmount
          settlementReference = adj.metadata?.settlementReference || `SETTLEMENT-${adj.id.slice(0, 8).toUpperCase()}`
          settledAt = adj.updated_at || undefined
        } else if (adj.status === 'approved') {
          auditStatus = 'APPROVED'
          settlementReference = `APPROVED-AUDIT-${adj.id.slice(0, 8).toUpperCase()}`
        } else if (adj.status === 'rejected') {
          auditStatus = 'REJECTED'
        } else {
          auditStatus = 'AUDITED'
        }
      }
    }
  }

  // Update entries if settlement or approval has completed
  if (auditStatus === 'SETTLED') {
    entries.forEach(e => {
      if (e.isEligibleForCompensation) {
        e.isCompensated = true
        e.compensatedAmount = e.deductionAmount
      }
    })
  }

  return {
    employeeId,
    employeeCode,
    employeeName,
    departmentName,
    companyId,
    calendarYear: year,
    annualEntitlement,
    totalLeavesTaken,
    totalDeductionsAmount: Math.round(totalDeductionsAmount * 100) / 100,
    eligibleCompensationDays,
    eligibleCompensationAmount: Math.round(eligibleCompensationAmount * 100) / 100,
    ineligibleDays,
    approvedCompensationDays: approvedDays || (auditStatus === 'APPROVED' ? eligibleCompensationDays : 0),
    approvedCompensationAmount: approvedAmount || (auditStatus === 'APPROVED' ? eligibleCompensationAmount : 0),
    paidCompensationAmount: paidAmount,
    remainingCompensationEntitlement,
    auditStatus,
    auditedBy,
    auditedAt,
    auditNotes,
    settlementReference,
    settledAt,
    entries,
  }
}

/**
 * Aggregates annual leave compensation ledgers for all active employees of a company for the year-end audit.
 */
export async function getCompanyAnnualCompensationAuditList(
  companyId: string,
  year: number
): Promise<AnnualLeaveCompensationLedger[]> {
  const supabase = createAdminClient()
  if (!supabase) return []

  const { data: employees } = await supabase
    .from('employees')
    .select('id')
    .eq('company_id', companyId)
    .eq('employment_status', 'active')
    .order('employee_code', { ascending: true })

  if (!employees || employees.length === 0) return []

  const ledgers: AnnualLeaveCompensationLedger[] = []
  for (const emp of employees) {
    const ledger = await getEmployeeAnnualCompensationLedger(companyId, emp.id, year)
    ledgers.push(ledger)
  }

  return ledgers
}

/**
 * Saves HR/Payroll administrator's annual leave audit decision (Approve or Reject).
 * Idempotently records the verified reimbursement amount in payroll_adjustments.
 */
export async function saveAnnualLeaveAudit(params: {
  companyId: string
  employeeId: string
  year: number
  approvedDays: number
  approvedAmount: number
  auditNotes?: string
  auditedBy?: string
  status: 'APPROVED' | 'REJECTED'
}): Promise<AnnualLeaveCompensationLedger> {
  const { companyId, employeeId, year, approvedDays, approvedAmount, auditNotes, auditedBy, status } = params
  const supabase = createAdminClient()
  if (!supabase) throw new Error('Database unavailable')

  // Check existing adjustment for this year
  const { data: existing } = await supabase
    .from('payroll_adjustments')
    .select('id, metadata')
    .eq('company_id', companyId)
    .eq('employee_id', employeeId)
    .eq('adjustment_type', 'ANNUAL_LEAVE_COMPENSATION')

  const existingAdj = (existing || []).find(a => a.metadata?.calendarYear === year)

  const payload = {
    company_id: companyId,
    employee_id: employeeId,
    adjustment_type: 'ANNUAL_LEAVE_COMPENSATION',
    direction: 'earning',
    amount: status === 'APPROVED' ? Math.max(0, approvedAmount) : 0,
    description: `Year-End 11-Day Paid Leave Compensation Audit (${status}) for Calendar Year ${year}: ${auditNotes || 'Standard Audit'}`,
    effective_date: `${year}-12-31`,
    status: status === 'APPROVED' ? 'approved' : 'rejected',
    approved_by: auditedBy || null,
    approved_at: new Date().toISOString(),
    metadata: {
      calendarYear: year,
      approvedDays,
      approvedAmount,
      auditNotes: auditNotes || '',
      auditedAt: new Date().toISOString(),
    },
  }

  if (existingAdj?.id) {
    await supabase
      .from('payroll_adjustments')
      .update(payload)
      .eq('id', existingAdj.id)
  } else {
    await supabase
      .from('payroll_adjustments')
      .insert(payload)
  }

  return getEmployeeAnnualCompensationLedger(companyId, employeeId, year)
}

/**
 * Executes or finalizes year-end settlement payout for approved annual leave compensation.
 * Transitions adjustment to 'applied' and records settlement reference.
 */
export async function settleAnnualLeaveCompensation(params: {
  companyId: string
  employeeId: string
  year: number
  payrollPeriodId?: string
  payrollRunId?: string
  settledBy?: string
}): Promise<{ success: boolean; settlementReference: string; amount: number }> {
  const { companyId, employeeId, year, payrollPeriodId, payrollRunId, settledBy } = params
  const supabase = createAdminClient()
  if (!supabase) throw new Error('Database unavailable')

  const ledger = await getEmployeeAnnualCompensationLedger(companyId, employeeId, year)
  if (ledger.auditStatus !== 'APPROVED' && ledger.auditStatus !== 'AUDITED') {
    throw new Error(`Cannot settle compensation with status '${ledger.auditStatus}'. Audit must be approved first.`)
  }

  const settlementRef = `SETTLEMENT-COMP-${year}-${ledger.employeeCode}-${Date.now().toString().slice(-6)}`

  // Update payroll adjustment status to 'applied'
  const { data: existing } = await supabase
    .from('payroll_adjustments')
    .select('id, metadata')
    .eq('company_id', companyId)
    .eq('employee_id', employeeId)
    .eq('adjustment_type', 'ANNUAL_LEAVE_COMPENSATION')

  const existingAdj = (existing || []).find(a => a.metadata?.calendarYear === year)

  const payload = {
    company_id: companyId,
    employee_id: employeeId,
    adjustment_type: 'ANNUAL_LEAVE_COMPENSATION',
    direction: 'earning',
    amount: ledger.approvedCompensationAmount,
    description: `Settled Year-End Paid Leave Compensation for Year ${year} (${ledger.approvedCompensationDays} days)`,
    effective_date: `${year}-12-31`,
    status: 'applied',
    payroll_period_id: payrollPeriodId || null,
    payroll_run_id: payrollRunId || null,
    approved_by: settledBy || null,
    approved_at: new Date().toISOString(),
    metadata: {
      calendarYear: year,
      approvedDays: ledger.approvedCompensationDays,
      approvedAmount: ledger.approvedCompensationAmount,
      settlementReference: settlementRef,
      settledAt: new Date().toISOString(),
    },
  }

  if (existingAdj?.id) {
    await supabase.from('payroll_adjustments').update(payload).eq('id', existingAdj.id)
  } else {
    await supabase.from('payroll_adjustments').insert(payload)
  }

  return {
    success: true,
    settlementReference: settlementRef,
    amount: ledger.approvedCompensationAmount,
  }
}
