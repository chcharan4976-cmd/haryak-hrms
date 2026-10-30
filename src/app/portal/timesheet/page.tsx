'use client'

import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'

import {
  AlertTriangle,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Copy,
  FileCheck2,
  Loader2,
  LockKeyhole,
  Palmtree,
  CalendarOff,
  BriefcaseBusiness,
  RefreshCw,
  Save,
  Send,
  TimerReset,
  Trash2,
  Undo2,
} from 'lucide-react'

import { toast } from 'sonner'

import { cn } from '@/lib/utils'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

/* ============================================================
   TYPES
   ============================================================ */

type TimesheetStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'RETURNED_FOR_CORRECTION'
  | 'REJECTED'
  | 'LOCKED'

type TimesheetEntry = {
  id?: string
  entryDate: string
  projectName: string
  taskCategory: string
  description: string
  hours: number
  isBillable: boolean
  isLeave?: boolean
  leaveTypeId?: string | null
  leaveTypeName?: string | null
  leaveTypeCode?: string | null
  leaveReason?: string | null
  isPaid?: boolean | null
}

type LeaveType = {
  id: string
  name: string
  code: string
  isPaid: boolean
  isActive: boolean
}

type LeaveRequest = {
  id: string
  leaveTypeId: string
  leaveTypeName: string
  leaveTypeCode: string
  isPaid: boolean | null
  startDate: string
  endDate: string
  status: string
  reason?: string
}

type Holiday = {
  id?: string
  date: string
  name: string
}

type TimesheetData = {
  id?: string
  status?: TimesheetStatus
  periodStart?: string
  periodEnd?: string
  submittedAt?: string | null
  approvedAt?: string | null
  comments?: string | null
  returnedReason?: string | null
  entries?: TimesheetEntry[]
}

/* ============================================================
   CONSTANTS
   ============================================================ */

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

const TASK_CATEGORIES = [
  'Development',
  'Code Review',
  'Architecture',
  'Testing & QA',
  'Documentation',
  'Client Meeting',
  'Support',
  'Research',
  'Training',
  'Internal Meeting',
  'Other',
]

/* ============================================================
   DATE HELPERS
   ============================================================ */

function toIsoDate(date: Date) {
  const year = date.getFullYear()

  const month = String(
    date.getMonth() + 1
  ).padStart(2, '0')

  const day = String(
    date.getDate()
  ).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function getDaysInMonth(
  year: number,
  month: number
) {
  return new Date(
    year,
    month,
    0
  ).getDate()
}

function getMonthDates(
  year: number,
  month: number
) {
  const result: Date[] = []

  const total =
    getDaysInMonth(
      year,
      month
    )

  for (
    let day = 1;
    day <= total;
    day++
  ) {
    result.push(
      new Date(
        year,
        month - 1,
        day
      )
    )
  }

  return result
}

function isWeekend(
  date: Date
) {
  const day =
    date.getDay()

  return (
    day === 0 ||
    day === 6
  )
}

function formatShortDate(
  value: string
) {
  if (!value) {
    return ''
  }

  const date =
    new Date(
      `${value}T00:00:00`
    )

  return date.toLocaleDateString(
    'en-IN',
    {
      day: '2-digit',
      month: 'short',
    }
  )
}

function formatLongDate(
  value: string
) {
  if (!value) {
    return ''
  }

  return new Date(
    `${value}T00:00:00`
  ).toLocaleDateString(
    'en-IN',
    {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }
  )
}

function getWeekNumberOfMonth(
  date: Date
) {
  const first =
    new Date(
      date.getFullYear(),
      date.getMonth(),
      1
    )

  const adjusted =
    date.getDate() +
    first.getDay()

  return Math.ceil(
    adjusted / 7
  )
}

function normalizeDateOnly(
  value: unknown
): string {
  if (!value) {
    return ''
  }

  const match =
    String(value)
      .trim()
      .match(
        /^\d{4}-\d{2}-\d{2}/
      )

  return (
    match?.[0] ||
    ''
  )
}

function dateInRange(
  date: string,
  start: string,
  end: string
): boolean {
  return (
    Boolean(date) &&
    Boolean(start) &&
    Boolean(end) &&
    date >= start &&
    date <= end
  )
}

function normalizeLeaveStatus(
  value: unknown
): string {
  return String(
    value || ''
  )
    .trim()
    .toUpperCase()
}

/* ============================================================
   PAGE
   ============================================================ */

export default function EmployeeTimesheetPortalPage() {
  const today =
    new Date()

  const [
    selectedYear,
    setSelectedYear,
  ] = useState(
    today.getFullYear()
  )

  const [
    selectedMonth,
    setSelectedMonth,
  ] = useState(
    today.getMonth() + 1
  )

  const [
    timesheet,
    setTimesheet,
  ] =
    useState<TimesheetData | null>(
      null
    )

  const [
    entries,
    setEntries,
  ] =
    useState<TimesheetEntry[]>(
      []
    )

  const [
    loading,
    setLoading,
  ] = useState(true)

  const [
    saving,
    setSaving,
  ] = useState(false)

  const [
    submitting,
    setSubmitting,
  ] = useState(false)

  const [
    leaveTypes,
    setLeaveTypes,
  ] = useState<LeaveType[]>(
    []
  )

  const [
    leaveRequests,
    setLeaveRequests,
  ] = useState<LeaveRequest[]>(
    []
  )

  const [
    holidays,
    setHolidays,
  ] = useState<Holiday[]>(
    []
  )

  const [
    leaveDialogDate,
    setLeaveDialogDate,
  ] = useState<string | null>(
    null
  )

  const [
    selectedLeaveTypeId,
    setSelectedLeaveTypeId,
  ] = useState('')

  const [
    leaveReason,
    setLeaveReason,
  ] = useState('')

  const [
    applyingLeave,
    setApplyingLeave,
  ] = useState(false)

  const [
    showSubmitConfirm,
    setShowSubmitConfirm,
  ] = useState(false)

  const [
    annualLeaveSummary,
    setAnnualLeaveSummary,
  ] = useState<{
    annualEntitlement: number
    paidLeaveUsed: number
    paidLeaveRemaining: number
    unpaidLeaveLop: number
    companyHolidaysCount: number
  }>({
    annualEntitlement: 11,
    paidLeaveUsed: 0,
    paidLeaveRemaining: 11,
    unpaidLeaveLop: 0,
    companyHolidaysCount: 0,
  })

  const [
    compensationLedger,
    setCompensationLedger,
  ] = useState<any>(null)

  /* ============================================================
     MONTH MODEL
     ============================================================ */

  const monthDates =
    useMemo(
      () =>
        getMonthDates(
          selectedYear,
          selectedMonth
        ),
      [
        selectedYear,
        selectedMonth,
      ]
    )

  const holidayDateSet =
    useMemo(
      () =>
        new Set(
          holidays
            .map(
              holiday =>
                holiday.date
            )
            .filter(Boolean)
        ),
      [holidays]
    )

  /*
   * IMPORTANT:
   *
   * workingDates represents dates on which an employee is
   * actually expected to work.
   *
   * Company holidays remain excluded from this collection so
   * they do not incorrectly affect timesheet completion,
   * required work-entry counts or payroll-related validation.
   *
   * This is intentionally different from the dates rendered
   * in each weekly card. The weekly UI displays every
   * Monday-Friday, including company holidays.
   */
  const workingDates =
    useMemo(
      () =>
        monthDates.filter(
          date => {
            if (
              isWeekend(
                date
              )
            ) {
              return false
            }

            return !holidayDateSet.has(
              toIsoDate(
                date
              )
            )
          }
        ),
      [
        monthDates,
        holidayDateSet,
      ]
    )

  const workingDateStrings =
    useMemo(
      () =>
        new Set(
          workingDates.map(
            toIsoDate
          )
        ),
      [workingDates]
    )

  /* ============================================================
     FETCH
     ============================================================ */

  const fetchTimesheet =
    useCallback(
      async () => {
        setLoading(true)

        try {
          const response =
            await fetch(
              `/api/timesheets?year=${selectedYear}&month=${selectedMonth}`,
              {
                cache:
                  'no-store',
              }
            )

          const result =
            await response.json()

          if (
            !response.ok ||
            !result.success
          ) {
            toast.error(
              result.error ||
                'Unable to load timesheet.'
            )

            setTimesheet(
              null
            )

            setEntries(
              []
            )

            return
          }

          const sheet =
            result.timesheet ||
            result.data ||
            null

          setTimesheet(
            sheet
          )

          setEntries(
            Array.isArray(
              sheet?.entries
            )
              ? sheet.entries
              : []
          )
        } catch (
          error
        ) {
          console.error(
            'Timesheet fetch failed:',
            error
          )

          toast.error(
            'Network error while loading timesheet.'
          )
        } finally {
          setLoading(
            false
          )
        }
      },
      [
        selectedYear,
        selectedMonth,
      ]
    )

  useEffect(
    () => {
      void fetchTimesheet()
    },
    [fetchTimesheet]
  )

  const fetchSupportingCalendarData =
    useCallback(
      async () => {
        try {
          const monthStart =
            `${selectedYear}-${String(
              selectedMonth
            ).padStart(
              2,
              '0'
            )}-01`

          const monthEnd =
            `${selectedYear}-${String(
              selectedMonth
            ).padStart(
              2,
              '0'
            )}-${String(
              getDaysInMonth(
                selectedYear,
                selectedMonth
              )
            ).padStart(
              2,
              '0'
            )}`

          const [
            leaveTypesResponse,
            leaveResponse,
            holidayResponse,
            balancesResponse,
          ] =
            await Promise.all([
              fetch(
                '/api/leave/types',
                {
                  cache:
                    'no-store',
                }
              ),

              fetch(
                `/api/leave?start_date=${monthStart}&end_date=${monthEnd}`,
                {
                  cache:
                    'no-store',
                }
              ),

              fetch(
                `/api/holidays?year=${selectedYear}`,
                {
                  cache:
                    'no-store',
                }
              ),

              fetch(
                `/api/leave/balances?year=${selectedYear}`,
                {
                  cache:
                    'no-store',
                }
              ),
            ])

          if (
            leaveTypesResponse.ok
          ) {
            const result =
              await leaveTypesResponse.json()

            const source =
              Array.isArray(
                result.data
              )
                ? result.data
                : Array.isArray(
                    result.leaveTypes
                  )
                ? result.leaveTypes
                : Array.isArray(
                    result.leave_types
                  )
                ? result.leave_types
                : []

            setLeaveTypes(
              source
                .map(
                  (
                    item: any
                  ) => ({
                    id:
                      String(
                        item.id ||
                          ''
                      ),

                    name:
                      String(
                        item.name ||
                          item.code ||
                          'Leave'
                      ),

                    code:
                      String(
                        item.code ||
                          ''
                      ),

                    isPaid:
                      item.is_paid ===
                        true ||
                      item.isPaid ===
                        true,

                    isActive:
                      item.is_active !==
                        false &&
                      item.isActive !==
                        false,
                  })
                )
                .filter(
                  (
                    item: LeaveType
                  ) =>
                    item.id &&
                    item.isActive
                )
            )
          }

          if (
            leaveResponse.ok
          ) {
            const result =
              await leaveResponse.json()

            const source =
              Array.isArray(
                result.data
              )
                ? result.data
                : Array.isArray(
                    result.requests
                  )
                ? result.requests
                : Array.isArray(
                    result.leaves
                  )
                ? result.leaves
                : []

            setLeaveRequests(
              source.map(
                (
                  item: any
                ) => {
                  const leaveType =
                    item.leave_type ||
                    item.leave_types ||
                    item.leaveType ||
                    {}

                  const explicitPaid =
                    leaveType.is_paid ??
                    leaveType.isPaid ??
                    item.is_paid ??
                    item.isPaid

                  return {
                    id:
                      String(
                        item.id ||
                          ''
                      ),

                    leaveTypeId:
                      String(
                        item.leave_type_id ||
                          leaveType.id ||
                          ''
                      ),

                    leaveTypeName:
                      String(
                        leaveType.name ||
                          item.leave_type_name ||
                          item.leaveTypeName ||
                          'Leave'
                      ),

                    leaveTypeCode:
                      String(
                        leaveType.code ||
                          item.leave_type_code ||
                          item.leaveTypeCode ||
                          ''
                      ),

                    isPaid:
                      explicitPaid ===
                        undefined ||
                      explicitPaid ===
                        null
                        ? null
                        : Boolean(
                            explicitPaid
                          ),

                    startDate:
                      normalizeDateOnly(
                        item.start_date ||
                          item.startDate
                      ),

                    endDate:
                      normalizeDateOnly(
                        item.end_date ||
                          item.endDate
                      ),

                    status:
                      normalizeLeaveStatus(
                        item.status
                      ),

                    reason:
                      item.reason ||
                      '',
                  }
                }
              )
            )
          }

          if (
            holidayResponse.ok
          ) {
            const result =
              await holidayResponse.json()

            const source =
              Array.isArray(
                result.data
              )
                ? result.data
                : Array.isArray(
                    result.holidays
                  )
                ? result.holidays
                : []

            setHolidays(
              source
                .map(
                  (
                    item: any
                  ) => ({
                    id:
                      item.id,

                    date:
                      normalizeDateOnly(
                        item.holiday_date ||
                          item.date
                      ),

                    name:
                      String(
                        item.name ||
                          item.holiday_name ||
                          'Company Holiday'
                      ),
                  })
                )
                .filter(
                  (
                    item: Holiday
                  ) =>
                    Boolean(
                      item.date
                    )
                )
            )
          }

          if (balancesResponse.ok) {
            const balResult = await balancesResponse.json()
            if (balResult.summary) {
              setAnnualLeaveSummary({
                annualEntitlement: Number(balResult.summary.annualEntitlement ?? 11),
                paidLeaveUsed: Number(balResult.summary.paidLeaveUsed ?? 0),
                paidLeaveRemaining: Number(balResult.summary.paidLeaveRemaining ?? 11),
                unpaidLeaveLop: Number(balResult.summary.unpaidLeaveLop ?? 0),
                companyHolidaysCount: Number(balResult.summary.companyHolidaysCount ?? 0),
              })
            }
            if (balResult.compensation_ledger) {
              setCompensationLedger(balResult.compensation_ledger)
            }
          }
        } catch (
          error
        ) {
          console.error(
            'Unable to load leave/holiday context:',
            error
          )

          setLeaveTypes([])
          setLeaveRequests([])
          setHolidays([])
        }
      },
      [
        selectedYear,
        selectedMonth,
      ]
    )

  useEffect(
    () => {
      void fetchSupportingCalendarData()
    },
    [fetchSupportingCalendarData]
  )

  /* ============================================================
     STATUS
     ============================================================ */

  const status:
    TimesheetStatus =
      timesheet?.status ||
      'DRAFT'

  const isLocked =
    status ===
      'APPROVED' ||
    status ===
      'LOCKED'

  const isPending =
    status ===
      'SUBMITTED' ||
    status ===
      'UNDER_REVIEW'

  const isReturned =
    status ===
    'RETURNED_FOR_CORRECTION'

  const editable =
    !isLocked &&
    !isPending

  const holidayByDate =
    useMemo(
      () => {
        const map =
          new Map<
            string,
            Holiday
          >()

        holidays.forEach(
          holiday => {
            if (
              holiday.date
            ) {
              map.set(
                holiday.date,
                holiday
              )
            }
          }
        )

        return map
      },
      [holidays]
    )

  const leaveForDate =
    useCallback(
      (
        date: string
      ) => {
        const matches =
          leaveRequests
            .filter(
              leave =>
                dateInRange(
                  date,
                  leave.startDate,
                  leave.endDate
                ) &&
                ![
                  'CANCELLED',
                  'CANCELED',
                  'REJECTED',
                ].includes(
                  normalizeLeaveStatus(
                    leave.status
                  )
                )
            )
            .sort(
              (
                a,
                b
              ) => {
                const priority = (
                  value: string
                ) => {
                  const status =
                    normalizeLeaveStatus(
                      value
                    )

                  if (
                    status ===
                    'APPROVED'
                  ) {
                    return 3
                  }

                  if (
                    status ===
                      'PENDING' ||
                    status ===
                      'SUBMITTED' ||
                    status ===
                      'UNDER_REVIEW'
                  ) {
                    return 2
                  }

                  return 1
                }

                return (
                  priority(
                    b.status
                  ) -
                  priority(
                    a.status
                  )
                )
              }
            )

        return (
          matches[0] ||
          null
        )
      },
      [leaveRequests]
    )
      const approvedLeaveDateSet =
    useMemo(
      () => {
        const result =
          new Set<string>()

        workingDates.forEach(
          date => {
            const iso =
              toIsoDate(
                date
              )

            const leave =
              leaveForDate(
                iso
              )

            if (
              leave &&
              normalizeLeaveStatus(
                leave.status
              ) ===
                'APPROVED'
            ) {
              result.add(
                iso
              )
            }
          }
        )

        return result
      },
      [
        workingDates,
        leaveForDate,
      ]
    )

  /* ============================================================
     ENTRY HELPERS
     ============================================================ */

  const entriesByDate =
    useMemo(
      () => {
        const map =
          new Map<
            string,
            Array<{
              entry: TimesheetEntry
              index: number
            }>
          >()

        entries.forEach(
          (
            entry,
            index
          ) => {
            const date =
              normalizeDateOnly(
                entry.entryDate
              )

            if (!date) {
              return
            }

            const current =
              map.get(
                date
              ) || []

            current.push({
              entry,
              index,
            })

            map.set(
              date,
              current
            )
          }
        )

        return map
      },
      [entries]
    )

  const getHoursForDate =
    useCallback(
      (
        date: string
      ) => {
        return (
          entriesByDate
            .get(
              date
            )
            ?.reduce(
              (
                total,
                item
              ) =>
                total +
                Number(
                  item.entry
                    .hours ||
                    0
                ),
              0
            ) || 0
        )
      },
      [entriesByDate]
    )

  const totalHours =
    useMemo(
      () =>
        entries.reduce(
          (
            total,
            entry
          ) =>
            total +
            Number(
              entry.hours ||
              0
            ),
          0
        ),
      [entries]
    )

  const billableHours =
    useMemo(
      () =>
        entries.reduce(
          (
            total,
            entry
          ) =>
            total +
            (entry.isBillable
              ? Number(
                  entry.hours ||
                    0
                )
              : 0),
          0
        ),
      [entries]
    )

  const workingDays =
    workingDates.length

  const completedWorkDateSet =
    useMemo(
      () => {
        const result =
          new Set<string>()

        entries.forEach(
          entry => {
            const date =
              normalizeDateOnly(
                entry.entryDate
              )

            const isLeave =
              entry.isLeave === true ||
              entry.taskCategory === 'Leave' ||
              (typeof entry.description === 'string' &&
                entry.description.startsWith('[LEAVE|'))

            if (
              date &&
              workingDateStrings.has(
                date
              ) &&
              !isLeave &&
              Number(
                entry.hours ||
                  0
              ) > 0
            ) {
              result.add(
                date
              )
            }
          }
        )

        return result
      },
      [
        entries,
        workingDateStrings,
      ]
    )

  const timesheetLeaveDateSet =
    useMemo(
      () => {
        const result =
          new Set<string>()

        entries.forEach(
          entry => {
            const isLeave =
              entry.isLeave === true ||
              entry.taskCategory === 'Leave' ||
              (typeof entry.description === 'string' &&
                entry.description.startsWith('[LEAVE|'))

            if (isLeave) {
              const date =
                normalizeDateOnly(
                  entry.entryDate
                )

              if (
                date &&
                workingDateStrings.has(
                  date
                )
              ) {
                result.add(
                  date
                )
              }
            }
          }
        )

        return result
      },
      [
        entries,
        workingDateStrings,
      ]
    )

  const timesheetPaidLeaveDateSet =
    useMemo(
      () => {
        const result =
          new Set<string>()

        entries.forEach(
          entry => {
            const isLeave =
              entry.isLeave === true ||
              entry.taskCategory === 'Leave' ||
              (typeof entry.description === 'string' &&
                entry.description.startsWith('[LEAVE|'))

            if (isLeave && entry.isPaid !== false) {
              const date =
                normalizeDateOnly(
                  entry.entryDate
                )

              if (
                date &&
                workingDateStrings.has(
                  date
                )
              ) {
                result.add(
                  date
                )
              }
            }
          }
        )

        return result
      },
      [
        entries,
        workingDateStrings,
      ]
    )

  const timesheetUnpaidLeaveDateSet =
    useMemo(
      () => {
        const result =
          new Set<string>()

        entries.forEach(
          entry => {
            const isLeave =
              entry.isLeave === true ||
              entry.taskCategory === 'Leave' ||
              (typeof entry.description === 'string' &&
                entry.description.startsWith('[LEAVE|'))

            if (isLeave && entry.isPaid === false) {
              const date =
                normalizeDateOnly(
                  entry.entryDate
                )

              if (
                date &&
                workingDateStrings.has(
                  date
                )
              ) {
                result.add(
                  date
                )
              }
            }
          }
        )

        return result
      },
      [
        entries,
        workingDateStrings,
      ]
    )

  const allLeaveDateSet =
    useMemo(
      () => {
        const result =
          new Set<string>()

        timesheetLeaveDateSet.forEach(
          date =>
            result.add(
              date
            )
        )

        approvedLeaveDateSet.forEach(
          date =>
            result.add(
              date
            )
        )

        return result
      },
      [
        timesheetLeaveDateSet,
        approvedLeaveDateSet,
      ]
    )

  const resolvedWorkingDateSet =
    useMemo(
      () => {
        const result =
          new Set<string>()

        completedWorkDateSet.forEach(
          date =>
            result.add(
              date
            )
        )

        allLeaveDateSet.forEach(
          date =>
            result.add(
              date
            )
        )

        return result
      },
      [
        completedWorkDateSet,
        allLeaveDateSet,
      ]
    )

  const completedDays =
    resolvedWorkingDateSet.size

  const completionPercent =
    workingDays === 0
      ? 100
      : Math.min(
          100,
          Math.round(
            (completedDays /
              workingDays) *
              100
          )
        )

  const expectedHours =
    Math.max(
      workingDays -
        allLeaveDateSet.size,
      0
    ) * 8

  const remainingHours =
    Math.max(
      expectedHours -
        totalHours,
      0
    )

  /* ============================================================
     WEEK MODEL
     ============================================================ */

  const weeks =
    useMemo(
      () => {
        const map =
          new Map<
            number,
            Date[]
          >()

        monthDates.forEach(
          date => {
            const weekNumber =
              getWeekNumberOfMonth(
                date
              )

            const existing =
              map.get(
                weekNumber
              ) || []

            existing.push(
              date
            )

            map.set(
              weekNumber,
              existing
            )
          }
        )

        return Array.from(
          map.entries()
        )
          .sort(
            (
              a,
              b
            ) =>
              a[0] -
              b[0]
          )
          .map(
            ([
              weekNumber,
              dates,
            ]) => ({
              weekNumber,
              dates,
            })
          )
      },
      [monthDates]
    )

  /* ============================================================
     MONTH NAVIGATION
     ============================================================ */

  const goPreviousMonth =
    () => {
      if (
        selectedMonth ===
        1
      ) {
        setSelectedMonth(
          12
        )

        setSelectedYear(
          year =>
            year - 1
        )

        return
      }

      setSelectedMonth(
        month =>
          month - 1
      )
    }

  const goNextMonth =
    () => {
      if (
        selectedMonth ===
        12
      ) {
        setSelectedMonth(
          1
        )

        setSelectedYear(
          year =>
            year + 1
        )

        return
      }

      setSelectedMonth(
        month =>
          month + 1
      )
    }

  const goCurrentMonth =
    () => {
      const current =
        new Date()

      setSelectedYear(
        current.getFullYear()
      )

      setSelectedMonth(
        current.getMonth() +
          1
      )
    }

  /* ============================================================
     ENTRY ACTIONS
     ============================================================ */

  const addEntryForDate =
    (
      date: string
    ) => {
      if (!editable) {
        return
      }

      if (
        holidayDateSet.has(
          date
        )
      ) {
        toast.info(
          `${
            holidayByDate.get(
              date
            )?.name ||
            'Company Holiday'
          } is a company holiday. No work entry is required.`
        )

        return
      }

      const leave =
        leaveForDate(
          date
        )

      if (
        leave &&
        normalizeLeaveStatus(
          leave.status
        ) ===
          'APPROVED'
      ) {
        toast.info(
          `${formatLongDate(
            date
          )} is covered by approved ${leave.leaveTypeName}.`
        )

        return
      }

      setEntries(
        current => [
          ...current,
          {
            entryDate:
              date,

            projectName:
              '',

            taskCategory:
              'Development',

            description:
              '',

            hours: 8,

            isBillable:
              true,
          },
        ]
      )
    }

  const updateEntry =
    <
      K extends keyof TimesheetEntry
    >(
      index: number,
      field: K,
      value:
        TimesheetEntry[K]
    ) => {
      if (!editable) {
        return
      }

      setEntries(
        current =>
          current.map(
            (
              entry,
              entryIndex
            ) =>
              entryIndex ===
              index
                ? {
                    ...entry,
                    [field]:
                      value,
                  }
                : entry
          )
      )
    }

  const removeEntry =
    (
      index: number
    ) => {
      if (!editable) {
        return
      }

      setEntries(
        current =>
          current.filter(
            (
              _,
              entryIndex
            ) =>
              entryIndex !==
              index
          )
      )
    }

  const copyPreviousDay =
    (
      index: number
    ) => {
      if (!editable) {
        return
      }

      const current =
        entries[index]

      if (!current) {
        return
      }

      const currentDate =
        new Date(
          `${current.entryDate}T00:00:00`
        )

      const previous =
        [...entries]
          .filter(
            (
              entry,
              entryIndex
            ) =>
              entryIndex !==
                index &&
              normalizeDateOnly(
                entry.entryDate
              ) <
                normalizeDateOnly(
                  current.entryDate
                )
          )
          .sort(
            (
              a,
              b
            ) =>
              normalizeDateOnly(
                b.entryDate
              ).localeCompare(
                normalizeDateOnly(
                  a.entryDate
                )
              )
          )[0]

      if (!previous) {
        toast.info(
          'No previous work entry is available to copy.'
        )

        return
      }

      if (
        Number.isNaN(
          currentDate.getTime()
        )
      ) {
        return
      }

      setEntries(
        existing =>
          existing.map(
            (
              entry,
              entryIndex
            ) =>
              entryIndex ===
              index
                ? {
                    ...entry,

                    projectName:
                      previous.projectName,

                    taskCategory:
                      previous.taskCategory,

                    description:
                      previous.description,

                    hours:
                      previous.hours,

                    isBillable:
                      previous.isBillable,
                  }
                : entry
          )
      )

      toast.success(
        'Previous work details copied.'
      )
    }

  const copyPreviousWeek =
    (
      weekDates: Date[]
    ) => {
      if (!editable) {
        return
      }

      const displayDates =
        weekDates.filter(
          date =>
            !isWeekend(
              date
            )
        )

      const eligibleDates =
        displayDates.filter(
          date => {
            const iso =
              toIsoDate(
                date
              )

            if (
              holidayDateSet.has(
                iso
              )
            ) {
              return false
            }

            const leave =
              leaveForDate(
                iso
              )

            return !(
              leave &&
              normalizeLeaveStatus(
                leave.status
              ) ===
                'APPROVED'
            )
          }
        )

      if (
        eligibleDates.length ===
        0
      ) {
        toast.info(
          'There are no working dates available in this week.'
        )

        return
      }

      const firstDate =
        eligibleDates[0]

      const previousWeekDate =
        new Date(
          firstDate
        )

      previousWeekDate.setDate(
        previousWeekDate.getDate() -
          7
      )

      const previousWeekNumber =
        getWeekNumberOfMonth(
          previousWeekDate
        )

      const previousWeek =
        weeks.find(
          week =>
            week.weekNumber ===
            previousWeekNumber
        )

      if (!previousWeek) {
        toast.info(
          'No previous week is available in this month.'
        )

        return
      }

      const previousEntries =
        previousWeek.dates
          .filter(
            date =>
              !isWeekend(
                date
              )
          )
          .flatMap(
            date =>
              entriesByDate.get(
                toIsoDate(
                  date
                )
              ) || []
          )
          .map(
            item =>
              item.entry
          )

      if (
        previousEntries.length ===
        0
      ) {
        toast.info(
          'The previous week has no work entries to copy.'
        )

        return
      }

      const copied:
        TimesheetEntry[] =
          []

      eligibleDates.forEach(
        (
          date,
          dateIndex
        ) => {
          const iso =
            toIsoDate(
              date
            )

          if (
            (
              entriesByDate.get(
                iso
              ) || []
            ).length >
            0
          ) {
            return
          }

          const source =
            previousEntries[
              Math.min(
                dateIndex,
                previousEntries.length -
                  1
              )
            ]

          if (!source) {
            return
          }

          copied.push({
            entryDate:
              iso,

            projectName:
              source.projectName,

            taskCategory:
              source.taskCategory,

            description:
              source.description,

            hours:
              source.hours,

            isBillable:
              source.isBillable,
          })
        }
      )

      if (
        copied.length ===
        0
      ) {
        toast.info(
          'All available dates in this week already have entries.'
        )

        return
      }

      setEntries(
        current => [
          ...current,
          ...copied,
        ]
      )

      toast.success(
        `${copied.length} work ${
          copied.length ===
          1
            ? 'entry'
            : 'entries'
        } copied from the previous week.`
      )
    }

  const addNextMissingDay =
    () => {
      if (!editable) {
        return
      }

      const missing =
        workingDates.find(
          date => {
            const iso =
              toIsoDate(
                date
              )

            if (
              approvedLeaveDateSet.has(
                iso
              )
            ) {
              return false
            }

            return (
              getHoursForDate(
                iso
              ) <= 0
            )
          }
        )

      if (!missing) {
        toast.success(
          'Every required working date is already resolved.'
        )

        return
      }

      addEntryForDate(
        toIsoDate(
          missing
        )
      )
    }

  /* ============================================================
     LEAVE ACTIONS
     ============================================================ */

  const openLeaveDialog =
    (
      date: string
    ) => {
      if (!editable) {
        return
      }

      if (
        holidayDateSet.has(
          date
        )
      ) {
        toast.info(
          `${
            holidayByDate.get(
              date
            )?.name ||
            'Company Holiday'
          } is already a company holiday.`
        )

        return
      }

      const existing =
        leaveForDate(
          date
        )

      if (existing) {
        toast.info(
          `${formatLongDate(
            date
          )} already has ${existing.leaveTypeName} (${existing.status}).`
        )

        return
      }

      setLeaveDialogDate(
        date
      )

      setSelectedLeaveTypeId(
        leaveTypes[0]?.id ||
          ''
      )

      setLeaveReason('')
    }

  const closeLeaveDialog =
    () => {
      if (
        applyingLeave
      ) {
        return
      }

      setLeaveDialogDate(
        null
      )

      setSelectedLeaveTypeId(
        ''
      )

      setLeaveReason('')
    }

  const applyLeaveFromTimesheet = () => {
    if (
      !leaveDialogDate ||
      !selectedLeaveTypeId
    ) {
      toast.error(
        'Select a leave type.'
      )

      return
    }

    // Company Calendar public holidays are paid company holidays and must never consume annual leave
    if (holidayDateSet.has(leaveDialogDate)) {
      toast.info(
        'This date is an official Company Paid Holiday. Public holidays are already paid and do not consume your 11 annual paid leave days.'
      )
      closeLeaveDialog()
      return
    }

    const selectedLeave =
      leaveTypes.find(
        item =>
          item.id ===
          selectedLeaveTypeId
      )

    if (!selectedLeave) {
      toast.error(
        'The selected leave type is no longer available.'
      )

      return
    }

    // Calculate how many paid leave days are already marked in the current timesheet (excluding this date)
    const otherTimesheetPaidCount = entries.filter(
      e => e.isLeave && e.isPaid && normalizeDateOnly(e.entryDate) !== leaveDialogDate
    ).length

    // Available remaining balance from annual entitlement of 11 days
    const availablePaidRemaining = Math.max(0, annualLeaveSummary.paidLeaveRemaining - otherTimesheetPaidCount)
    const isEligibleForYearEndCompensation = availablePaidRemaining > 0
    const code = isEligibleForYearEndCompensation ? (selectedLeave.code || 'LV') : 'LOP'
    const name = isEligibleForYearEndCompensation
      ? `${selectedLeave.name} (Monthly Deductible, Year-End Compensation Eligible)`
      : `${selectedLeave.name} (Monthly Deductible, Non-Compensable)`

    const trimmedReason =
      leaveReason.trim()

    // Working-day leaves are initially deducted from monthly salary under company policy
    const description =
      trimmedReason
        ? `[LEAVE|id:${selectedLeave.id}|code:${code}|name:${name}|paid:0] ${trimmedReason}`
        : `[LEAVE|id:${selectedLeave.id}|code:${code}|name:${name}|paid:0] Leave: ${name}`

    const leaveEntry: TimesheetEntry = {
      entryDate:
        leaveDialogDate,

      projectName:
        'Leave',

      taskCategory:
        'Leave',

      description,

      hours: 0,

      isBillable:
        false,

      isLeave:
        true,

      leaveTypeId:
        selectedLeave.id,

      leaveTypeName:
        name,

      leaveTypeCode:
        code,

      leaveReason:
        trimmedReason || undefined,

      isPaid: false, // Deducted in current month's payroll
    }

    // Replace any existing entries for this date with the leave entry
    setEntries(current => [
      ...current.filter(
        entry =>
          normalizeDateOnly(
            entry.entryDate
          ) !== leaveDialogDate
      ),
      leaveEntry,
    ])

    if (isEligibleForYearEndCompensation) {
      toast.success(
        `Marked as Leave (Deducted monthly; eligible for year-end compensation, ${availablePaidRemaining - 1}/11 remaining).`
      )
    } else {
      toast.warning(
        'Marked as Loss of Pay (LOP) (Annual 11-day compensation limit reached; monthly deductible, non-compensable).'
      )
    }

    closeLeaveDialog()
  }

  const handleClearLeave = (date: string) => {
    if (!editable) {
      return
    }

    setEntries(current =>
      current.filter(
        entry =>
          normalizeDateOnly(
            entry.entryDate
          ) !== date
      )
    )

    toast.info(
      `Cleared leave entry for ${formatShortDate(date)}.`
    )
  }

  /* ============================================================
     SAVE / SUBMIT
     ============================================================ */

  const validateEntries = () => {
    for (const entry of entries) {
      const date =
        normalizeDateOnly(
          entry.entryDate
        )

      if (!date) {
        toast.error(
          'One or more entries have an invalid date.'
        )

        return false
      }

      if (
        holidayDateSet.has(
          date
        )
      ) {
        toast.error(
          `Remove the entry for ${formatLongDate(
            date
          )}. It is a company holiday.`
        )

        return false
      }

      if (
        !workingDateStrings.has(
          date
        )
      ) {
        toast.error(
          `Entry cannot be recorded for ${formatLongDate(
            date
          )} because it is not a working date.`
        )

        return false
      }

      const isLeaveEntry =
        entry.isLeave === true ||
        entry.taskCategory === 'Leave' ||
        (typeof entry.description === 'string' &&
          entry.description.startsWith('[LEAVE|'))

      if (!isLeaveEntry) {
        const leave =
          leaveForDate(
            date
          )

        if (
          leave &&
          normalizeLeaveStatus(
            leave.status
          ) ===
            'APPROVED'
        ) {
          toast.error(
            `Remove the work entry for ${formatLongDate(
              date
            )}. It already has approved ${leave.leaveTypeName}.`
          )

          return false
        }

        if (
          !entry.description?.trim()
        ) {
          toast.error(
            `Add a work description for ${formatLongDate(
              date
            )}.`
          )

          return false
        }

        if (
          Number(
            entry.hours
          ) <= 0 ||
          Number(
            entry.hours
          ) > 24
        ) {
          toast.error(
            `Enter valid hours for ${formatLongDate(
              date
            )}.`
          )

          return false
        }
      } else {
        if (
          !entry.description?.trim()
        ) {
          toast.error(
            `Add a description for leave on ${formatLongDate(
              date
            )}.`
          )

          return false
        }

        if (
          Number(
            entry.hours
          ) < 0 ||
          Number(
            entry.hours
          ) > 24
        ) {
          toast.error(
            `Invalid hours for leave on ${formatLongDate(
              date
            )}.`
          )

          return false
        }
      }
    }

    return true
  }

  const saveDraft =
    async () => {
      if (!editable) {
        return
      }

      if (
        !validateEntries()
      ) {
        return
      }

      setSaving(
        true
      )

      try {
        const response =
          await fetch(
            '/api/timesheets',
            {
              method:
                'POST',

              headers: {
                'Content-Type':
                  'application/json',
              },

              body:
                JSON.stringify(
                  {
                    year:
                      selectedYear,

                    month:
                      selectedMonth,

                    entries:
                      entries.map(
                        entry => ({
                          ...entry,

                          entryDate:
                            normalizeDateOnly(
                              entry.entryDate
                            ),
                        })
                      ),

                    action:
                      'SAVE_DRAFT',
                  }
                ),
            }
          )

        const result =
          await response.json()

        if (
          !response.ok ||
          !result.success
        ) {
          throw new Error(
            result.error ||
              'Unable to save draft.'
          )
        }

        toast.success(
          'Timesheet draft saved.'
        )

        await fetchTimesheet()
      } catch (
        error: any
      ) {
        toast.error(
          error?.message ||
            'Unable to save timesheet.'
        )
      } finally {
        setSaving(
          false
        )
      }
    }

  const doSubmitTimesheet =
    async () => {
      setShowSubmitConfirm(
        false
      )

      setSubmitting(
        true
      )

      try {
        const response =
          await fetch(
            '/api/timesheets',
            {
              method:
                'POST',

              headers: {
                'Content-Type':
                  'application/json',
              },

              body:
                JSON.stringify(
                  {
                    year:
                      selectedYear,

                    month:
                      selectedMonth,

                    entries:
                      entries.map(
                        entry => ({
                          ...entry,

                          entryDate:
                            normalizeDateOnly(
                              entry.entryDate
                            ),
                        })
                      ),

                    action:
                      'submit',
                  }
                ),
            }
          )

        const result =
          await response.json()

        if (
          !response.ok ||
          !result.success
        ) {
          throw new Error(
            result.error ||
              'Unable to submit timesheet.'
          )
        }

        toast.success(
          'Timesheet submitted for administrator approval.'
        )

        await fetchTimesheet()
      } catch (
        error: any
      ) {
        toast.error(
          error?.message ||
            'Unable to submit timesheet.'
        )
      } finally {
        setSubmitting(
          false
        )
      }
    }

  const submitTimesheet = () => {
    if (!editable) {
      return
    }

    if (
      entries.length ===
      0
    ) {
      toast.error(
        'Add at least one entry before submitting.'
      )

      return
    }

    if (
      !validateEntries()
    ) {
      return
    }

    setShowSubmitConfirm(
      true
    )
  }

  /* ============================================================
     LOADING
     ============================================================ */

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-7 w-7 animate-spin text-[#1e2a78]" />

          <p className="text-sm font-medium text-muted-foreground">
            Loading your timesheet...
          </p>
        </div>
      </div>
    )
  }

  /* ============================================================
     RENDER
     ============================================================ */

  return (
    <div className="space-y-5 pb-10">
      {/* =====================================================
          PAGE HEADER
         ===================================================== */}

      <div className="overflow-hidden rounded-2xl border border-[#1e2a78]/20 bg-gradient-to-r from-[#101b5c] via-[#1e2a78] to-[#273b9b] text-white shadow-sm">
        <div className="flex flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/15">
              <CalendarDays className="h-5 w-5" />
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
                  My Timesheet
                </h1>

                <StatusBadge
                  status={
                    status
                  }
                />
              </div>

              <p className="mt-1 max-w-2xl text-xs leading-5 text-white/75">
                Record work against each working day, manage leave context, save weekly progress and submit the month for approval.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-between sm:justify-start">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={
                goCurrentMonth
              }
              className="bg-white/10 text-white hover:bg-white/20"
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              Current Month
            </Button>

            <div className="flex items-center overflow-hidden rounded-lg border border-white/20 bg-white/10">
              <button
                type="button"
                aria-label="Previous month"
                onClick={
                  goPreviousMonth
                }
                className="flex h-9 w-9 items-center justify-center transition hover:bg-white/10"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              <div className="min-w-[130px] sm:min-w-[150px] border-x border-white/20 px-3 sm:px-4 text-center text-xs sm:text-sm font-semibold">
                {
                  MONTHS[
                    selectedMonth -
                      1
                  ]
                }{' '}
                {selectedYear}
              </div>

              <button
                type="button"
                aria-label="Next month"
                onClick={
                  goNextMonth
                }
                className="flex h-9 w-9 items-center justify-center transition hover:bg-white/10"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* =====================================================
          STATUS MESSAGES
         ===================================================== */}

      {isReturned && (
        <Alert className="border-rose-200 bg-rose-50 dark:border-rose-900 dark:bg-rose-950/30">
          <Undo2 className="h-4 w-4 text-rose-600" />

          <AlertTitle className="text-rose-900 dark:text-rose-200">
            Returned for Correction
          </AlertTitle>

          <AlertDescription className="text-rose-800 dark:text-rose-300">
            {timesheet?.returnedReason ||
              timesheet?.comments ||
              'Administration returned this timesheet. Review the entries, make the required corrections and submit it again.'}
          </AlertDescription>
        </Alert>
      )}

      {status ===
        'REJECTED' && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />

          <AlertTitle>
            Timesheet Rejected
          </AlertTitle>

          <AlertDescription>
            {timesheet?.returnedReason ||
              timesheet?.comments ||
              'This timesheet was rejected. Review the administrator comments before making any further changes.'}
          </AlertDescription>
        </Alert>
      )}

      {/* =====================================================
          ANNUAL PAID-LEAVE COMPENSATION & COMPANY HOLIDAY BANNER
         ===================================================== */}

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50/70 p-3.5 sm:px-4 text-xs dark:border-blue-900/60 dark:bg-blue-950/20">
        <div className="flex items-center gap-2.5">
          <Palmtree className="h-4 w-4 text-[#1e2a78] dark:text-blue-400 shrink-0" />
          <div className="text-foreground">
            <span className="font-semibold text-[#1e2a78] dark:text-blue-300">Annual Paid-Leave Compensation: </span>
            <span>
              {compensationLedger?.eligibleCompensationDays ?? annualLeaveSummary.paidLeaveUsed} of 11 days eligible for year-end reimbursement
              {compensationLedger?.totalDeductionsAmount ? ` (₹${compensationLedger.totalDeductionsAmount.toLocaleString('en-IN')} deducted so far)` : ''}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 text-muted-foreground">
          <CalendarDays className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
          <span>{annualLeaveSummary.companyHolidaysCount} Company Holidays (Paid, never deducted)</span>
        </div>
      </div>

      {/* =====================================================
          SUMMARY
         ===================================================== */}

      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <SummaryCard
          label="Working Days"
          value={
            workingDays
          }
        />

        <SummaryCard
          label="Workdays Worked"
          value={
            completedWorkDateSet.size
          }
        />

        <SummaryCard
          label="Leave Days"
          value={
            <div>
              <span>
                {allLeaveDateSet.size}
              </span>
              <span className="block text-[10px] font-normal text-muted-foreground">
                {timesheetPaidLeaveDateSet.size} Paid • {timesheetUnpaidLeaveDateSet.size} LOP
              </span>
            </div>
          }
        />

        <SummaryCard
          label="Resolved Days"
          value={
            `${completedDays} / ${workingDays}`
          }
        />

        <SummaryCard
          label="Total Hours"
          value={
            totalHours.toFixed(
              1
            )
          }
        />

        <SummaryCard
          label="Completion"
          value={`${completionPercent}%`}
        />
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-semibold">
                Monthly Work Progress
              </p>

              <p className="mt-1 text-xs text-muted-foreground">
                Expected work hours: {expectedHours.toFixed(
                  1
                )} • Recorded: {totalHours.toFixed(
                  1
                )} • Remaining: {remainingHours.toFixed(
                  1
                )}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="h-2 w-44 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-[#1e2a78] transition-all"
                  style={{
                    width:
                      `${completionPercent}%`,
                  }}
                />
              </div>

              <span className="min-w-10 text-right text-xs font-bold">
                {completionPercent}%
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
            {/* =====================================================
          WEEKLY TIMESHEET
         ===================================================== */}

      <div className="space-y-4">
        {weeks.map(
          week => {
            /*
             * DISPLAY RULE:
             *
             * Every Monday-Friday is displayed in the employee
             * timesheet, even when the date is a company holiday.
             *
             * Saturday and Sunday are the only dates removed from
             * the visual weekly strip.
             */
            const displayDates =
              week.dates.filter(
                date =>
                  !isWeekend(
                    date
                  )
              )

            /*
             * WORKING-DAY RULE:
             *
             * Company holidays are still excluded from actual
             * working-day calculations. This prevents holidays
             * from affecting completion %, required entries,
             * expected hours and payroll-related validation.
             */
            const validDates =
              displayDates.filter(
                date =>
                  !holidayDateSet.has(
                    toIsoDate(
                      date
                    )
                  )
              )

            if (
              displayDates.length ===
              0
            ) {
              return null
            }

            const weekStart =
              displayDates[0]

            const weekEnd =
              displayDates[
                displayDates.length -
                  1
              ]

            const weekEntries =
              validDates.flatMap(
                date =>
                  entriesByDate.get(
                    toIsoDate(
                      date
                    )
                  ) || []
              )

            const weekHours =
              weekEntries.reduce(
                (
                  total,
                  item
                ) =>
                  total +
                  Number(
                    item.entry
                      .hours ||
                      0
                  ),
                0
              )

            const weekBillableHours =
              weekEntries.reduce(
                (
                  total,
                  item
                ) =>
                  total +
                  (item.entry
                    .isBillable
                    ? Number(
                        item.entry
                          .hours ||
                          0
                      )
                    : 0),
                0
              )

            const resolvedDates =
              validDates.filter(
                date => {
                  const iso =
                    toIsoDate(
                      date
                    )

                  return (
                    getHoursForDate(
                      iso
                    ) >
                      0 ||
                    approvedLeaveDateSet.has(
                      iso
                    )
                  )
                }
              ).length

            const weekComplete =
              validDates.length ===
                0 ||
              resolvedDates ===
                validDates.length

            return (
              <Card
                key={
                  week.weekNumber
                }
                className="overflow-hidden"
              >
                <CardHeader className="border-b bg-muted/30 px-4 py-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <CardTitle className="text-sm">
                          Week{' '}
                          {
                            week.weekNumber
                          }
                        </CardTitle>

                        {weekComplete ? (
                          <Badge className="border-emerald-200 bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
                            <Check className="mr-1 h-3 w-3" />
                            Complete
                          </Badge>
                        ) : (
                          <Badge variant="secondary">
                            {
                              resolvedDates
                            }
                            /
                            {
                              validDates.length
                            }{' '}
                            working days
                          </Badge>
                        )}
                      </div>

                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {formatShortDate(
                          toIsoDate(
                            weekStart
                          )
                        )}{' '}
                        –{' '}
                        {formatShortDate(
                          toIsoDate(
                            weekEnd
                          )
                        )}
                        {' • '}
                        {weekHours.toFixed(
                          1
                        )}{' '}
                        hrs
                        {' • '}
                        {weekBillableHours.toFixed(
                          1
                        )}{' '}
                        billable
                      </p>
                    </div>

                    {editable && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          copyPreviousWeek(
                            week.dates
                          )
                        }
                      >
                        <Copy className="mr-1.5 h-3.5 w-3.5" />
                        Copy Previous Week
                      </Button>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="space-y-4 p-4">
                  {/* ===========================================
                      WEEKDAY STRIP
                     =========================================== */}

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
                    {displayDates.map(
                      date => {
                        const iso =
                          toIsoDate(
                            date
                          )

                        const dayEntries =
                          entriesByDate.get(
                            iso
                          ) || []

                        const dayHours =
                          dayEntries.reduce(
                            (
                              total,
                              item
                            ) =>
                              total +
                              Number(
                                item.entry
                                  .hours ||
                                  0
                              ),
                            0
                          )

                        /*
                         * A holiday is DISPLAYED rather than
                         * removed from the weekday strip.
                         */
                        const holiday =
                          holidayByDate.get(
                            iso
                          )

                        const isHoliday =
                          Boolean(
                            holiday
                          )

                        const leave =
                          leaveForDate(
                            iso
                          )

                        const leaveStatus =
                          leave
                            ? normalizeLeaveStatus(
                                leave.status
                              )
                            : ''

                        const timesheetLeaveEntry =
                          dayEntries.find(
                            item =>
                              item.entry.isLeave === true ||
                              item.entry.taskCategory === 'Leave' ||
                              (typeof item.entry.description === 'string' &&
                                item.entry.description.startsWith('[LEAVE|'))
                          )?.entry

                        const isTimesheetLeave =
                          Boolean(timesheetLeaveEntry)

                        const hasApprovedLeave =
                          leaveStatus ===
                          'APPROVED'

                        const hasPendingLeave =
                          leaveStatus ===
                            'PENDING' ||
                          leaveStatus ===
                            'SUBMITTED' ||
                          leaveStatus ===
                            'UNDER_REVIEW'

                        const isResolved =
                          isHoliday ||
                          dayHours >
                            0 ||
                          hasApprovedLeave ||
                          isTimesheetLeave

                        return (
                          <div
                            key={
                              iso
                            }
                            className={cn(
                              'rounded-xl border p-3 transition-colors',

                              isResolved &&
                                !isHoliday &&
                                'border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/15',

                              hasPendingLeave &&
                                'border-amber-200 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950/15',

                              isHoliday &&
                                'border-blue-200 bg-blue-50/80 dark:border-blue-900 dark:bg-blue-950/20'
                            )}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                  {date.toLocaleDateString(
                                    'en-IN',
                                    {
                                      weekday:
                                        'short',
                                    }
                                  )}
                                </p>

                                <p className="mt-0.5 text-sm font-bold">
                                  {date.toLocaleDateString(
                                    'en-IN',
                                    {
                                      day:
                                        '2-digit',

                                      month:
                                        'short',
                                    }
                                  )}
                                </p>
                              </div>

                              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-background/80">
                                {isHoliday ? (
                                  <CalendarOff className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                                ) : isTimesheetLeave ? (
                                  <Palmtree className={cn(
                                    "h-3.5 w-3.5",
                                    timesheetLeaveEntry?.isPaid !== false
                                      ? "text-emerald-600"
                                      : "text-amber-600"
                                  )} />
                                ) : dayHours >
                                  0 ? (
                                  <BriefcaseBusiness className="h-3.5 w-3.5 text-emerald-600" />
                                ) : hasApprovedLeave ? (
                                  <Palmtree className="h-3.5 w-3.5 text-emerald-600" />
                                ) : hasPendingLeave ? (
                                  <Clock3 className="h-3.5 w-3.5 text-amber-600" />
                                ) : (
                                  <TimerReset className="h-3.5 w-3.5 text-muted-foreground" />
                                )}
                              </div>
                            </div>

                            <div className="mt-3 min-h-[34px]">
                              <p
                                className={cn(
                                  'text-[11px] font-medium leading-4',

                                  isHoliday &&
                                    'text-blue-700 dark:text-blue-300',

                                  !isHoliday &&
                                    isTimesheetLeave &&
                                    (timesheetLeaveEntry?.isPaid !== false
                                      ? 'text-emerald-700 dark:text-emerald-300'
                                      : 'text-amber-700 dark:text-amber-300'),

                                  !isHoliday &&
                                    !isTimesheetLeave &&
                                    hasApprovedLeave &&
                                    'text-emerald-700 dark:text-emerald-300',

                                  !isHoliday &&
                                    !isTimesheetLeave &&
                                    hasPendingLeave &&
                                    'text-amber-700 dark:text-amber-300',

                                  !isHoliday &&
                                    !isTimesheetLeave &&
                                    !hasApprovedLeave &&
                                    !hasPendingLeave &&
                                    dayHours ===
                                      0 &&
                                    'text-muted-foreground'
                                )}
                              >
                                {isHoliday
                                  ? `${
                                      holiday?.name ||
                                      'Company Holiday'
                                    } • Holiday`
                                  : isTimesheetLeave
                                  ? `${
                                      timesheetLeaveEntry?.leaveTypeName ||
                                      'Leave'
                                    } • ${
                                      timesheetLeaveEntry?.isPaid !== false
                                        ? 'Paid'
                                        : 'Unpaid / LOP'
                                    }`
                                  : dayHours >
                                    0
                                  ? `${dayHours.toFixed(
                                      1
                                    )} hrs worked`
                                  : hasApprovedLeave
                                  ? `${
                                      leave?.leaveTypeName ||
                                      'Leave'
                                    } • Approved`
                                  : hasPendingLeave
                                  ? `${
                                      leave?.leaveTypeName ||
                                      'Leave'
                                    } • Pending`
                                  : 'No work entered'}
                              </p>

                              {!isHoliday &&
                                (timesheetLeaveEntry?.leaveReason ||
                                  leave?.reason) && (
                                  <p className="mt-1 line-clamp-1 text-[10px] text-muted-foreground">
                                    {
                                      timesheetLeaveEntry?.leaveReason ||
                                      leave?.reason
                                    }
                                  </p>
                                )}
                            </div>

                            {/* Company holidays remain visible,
                                but employees cannot add work or
                                leave from the holiday card. */}

                            {editable &&
                              !isHoliday &&
                              isTimesheetLeave && (
                                <div className="mt-3">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="h-7 w-full px-2 text-[10px] text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                                    onClick={() =>
                                      handleClearLeave(
                                        iso
                                      )
                                    }
                                  >
                                    <Trash2 className="mr-1 h-3 w-3" />
                                    Clear Leave
                                  </Button>
                                </div>
                              )}

                            {editable &&
                              !isHoliday &&
                              !isTimesheetLeave &&
                              dayHours ===
                                0 &&
                              !leave && (
                                <div className="mt-3 grid grid-cols-2 gap-1.5">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="h-7 px-2 text-[10px]"
                                    onClick={() =>
                                      addEntryForDate(
                                        iso
                                      )
                                    }
                                  >
                                    <BriefcaseBusiness className="mr-1 h-3 w-3" />
                                    Work
                                  </Button>

                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="h-7 px-2 text-[10px]"
                                    onClick={() =>
                                      openLeaveDialog(
                                        iso
                                      )
                                    }
                                  >
                                    <Palmtree className="mr-1 h-3 w-3" />
                                    Leave
                                  </Button>
                                </div>
                              )}

                            {isHoliday && (
                              <div className="mt-3 rounded-lg border border-blue-200/80 bg-background/60 px-2 py-1.5 text-center dark:border-blue-900">
                                <span className="text-[10px] font-semibold text-blue-700 dark:text-blue-300">
                                  No timesheet entry required
                                </span>
                              </div>
                            )}

                            {!isHoliday &&
                              editable &&
                              dayHours >
                                0 && (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="mt-2 h-7 w-full text-[10px]"
                                  onClick={() =>
                                    addEntryForDate(
                                      iso
                                    )
                                  }
                                >
                                  + Add another entry
                                </Button>
                              )}
                          </div>
                        )
                      }
                    )}
                  </div>

                  {/* ===========================================
                      WEEK WORK ENTRY TABLE
                     =========================================== */}

                  {weekEntries.length ===
                  0 ? (
                    <div className="rounded-xl border border-dashed bg-muted/20 px-4 py-6 text-center">
                      <BriefcaseBusiness className="mx-auto h-5 w-5 text-muted-foreground" />

                      <p className="mt-2 text-xs font-medium">
                        No work entries for this week
                      </p>

                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Use the Work button on an available weekday to add an entry.
                        Company holidays remain visible above but do not require work entries.
                      </p>
                    </div>
                  ) : (
                    <div className="relative w-full overflow-x-auto rounded-xl border">
                      <table className="w-full min-w-[760px] text-xs">
                        <thead className="border-b bg-muted/30">
                          <tr>
                            <th className="w-[115px] px-3 py-2 text-left font-semibold">
                              Date
                            </th>

                            <th className="w-[170px] px-3 py-2 text-left font-semibold">
                              Project
                            </th>

                            <th className="w-[165px] px-3 py-2 text-left font-semibold">
                              Category
                            </th>

                            <th className="px-3 py-2 text-left font-semibold">
                              Work Description
                            </th>

                            <th className="w-[100px] px-3 py-2 text-right font-semibold">
                              Hours
                            </th>

                            <th className="w-[85px] px-3 py-2 text-center font-semibold">
                              Billable
                            </th>

                            {editable && (
                              <th className="w-[90px] px-3 py-2 text-right font-semibold">
                                Actions
                              </th>
                            )}
                          </tr>
                        </thead>

                        <tbody className="divide-y">
                          {weekEntries.map(
                            ({
                              entry,
                              index,
                            }) => (
                              <tr
                                key={
                                  entry.id ||
                                  `${entry.entryDate}-${index}`
                                }
                                className="bg-background align-top"
                              >
                                <td className="px-3 py-2">
                                  <div className="font-medium">
                                    {formatShortDate(
                                      normalizeDateOnly(
                                        entry.entryDate
                                      )
                                    )}
                                  </div>

                                  <div className="mt-0.5 text-[10px] text-muted-foreground">
                                    {new Date(
                                      `${normalizeDateOnly(
                                        entry.entryDate
                                      )}T00:00:00`
                                    ).toLocaleDateString(
                                      'en-IN',
                                      {
                                        weekday:
                                          'short',
                                      }
                                    )}
                                  </div>
                                </td>

                                {(() => {
                                  const isLeaveRow =
                                    entry.isLeave === true ||
                                    entry.taskCategory === 'Leave' ||
                                    (typeof entry.description === 'string' &&
                                      entry.description.startsWith('[LEAVE|'))

                                  if (isLeaveRow) {
                                    return (
                                      <>
                                        <td className="px-3 py-2">
                                          <span className="inline-flex items-center gap-1 font-semibold text-blue-700 dark:text-blue-300">
                                            <Palmtree className="h-3 w-3" />
                                            Leave
                                          </span>
                                        </td>

                                        <td className="px-3 py-2">
                                          <Badge
                                            variant="outline"
                                            className="text-[10px]"
                                          >
                                            {entry.leaveTypeName ||
                                              'Leave'}
                                          </Badge>
                                        </td>

                                        <td className="px-3 py-2">
                                          <span className="text-xs text-muted-foreground">
                                            {entry.leaveReason ||
                                              entry.leaveTypeName ||
                                              'Leave entry'}
                                          </span>
                                        </td>

                                        <td className="px-3 py-2 text-right font-mono text-xs text-muted-foreground">
                                          0.0
                                        </td>

                                        <td className="px-3 py-2 text-center text-muted-foreground">
                                          —
                                        </td>

                                        {editable && (
                                          <td className="px-3 py-2">
                                            <div className="flex justify-end gap-1">
                                              <Button
                                                type="button"
                                                size="icon"
                                                variant="ghost"
                                                className="h-7 w-7 text-rose-600"
                                                title="Remove leave entry"
                                                onClick={() =>
                                                  removeEntry(
                                                    index
                                                  )
                                                }
                                              >
                                                <Trash2 className="h-3.5 w-3.5" />
                                              </Button>
                                            </div>
                                          </td>
                                        )}
                                      </>
                                    )
                                  }

                                  return (
                                    <>
                                      <td className="px-3 py-2">
                                        {editable ? (
                                          <Input
                                            className="h-8 text-xs"
                                            placeholder="Project / Client"
                                            value={
                                              entry.projectName
                                            }
                                            onChange={
                                              event =>
                                                updateEntry(
                                                  index,
                                                  'projectName',
                                                  event
                                                    .target
                                                    .value
                                                )
                                            }
                                          />
                                        ) : (
                                          entry.projectName ||
                                          '—'
                                        )}
                                      </td>

                                      <td className="px-3 py-2">
                                        {editable ? (
                                          <Select
                                            value={
                                              entry.taskCategory ||
                                              'Development'
                                            }
                                            onValueChange={
                                              value =>
                                                updateEntry(
                                                  index,
                                                  'taskCategory',
                                                  value
                                                )
                                            }
                                          >
                                            <SelectTrigger className="h-8 text-xs">
                                              <SelectValue />
                                            </SelectTrigger>

                                            <SelectContent>
                                              {TASK_CATEGORIES.map(
                                                category => (
                                                  <SelectItem
                                                    key={
                                                      category
                                                    }
                                                    value={
                                                      category
                                                    }
                                                  >
                                                    {
                                                      category
                                                    }
                                                  </SelectItem>
                                                )
                                              )}
                                            </SelectContent>
                                          </Select>
                                        ) : (
                                          entry.taskCategory ||
                                          '—'
                                        )}
                                      </td>

                                      <td className="px-3 py-2">
                                        {editable ? (
                                          <Input
                                            className="h-8 min-w-[250px] text-xs"
                                            placeholder="What did you work on?"
                                            value={
                                              entry.description
                                            }
                                            onChange={
                                              event =>
                                                updateEntry(
                                                  index,
                                                  'description',
                                                  event
                                                    .target
                                                    .value
                                                )
                                            }
                                          />
                                        ) : (
                                          entry.description ||
                                          'Not provided'
                                        )}
                                      </td>

                                      <td className="px-3 py-2">
                                        {editable ? (
                                          <Input
                                            type="number"
                                            step="0.5"
                                            min="0.5"
                                            max="24"
                                            className="ml-auto h-8 w-20 text-right font-mono text-xs"
                                            value={
                                              entry.hours
                                            }
                                            onChange={
                                              event =>
                                                updateEntry(
                                                  index,
                                                  'hours',
                                                  Number(
                                                    event
                                                      .target
                                                      .value
                                                  )
                                                )
                                            }
                                          />
                                        ) : (
                                          <div className="text-right font-mono font-bold">
                                            {
                                              entry.hours
                                            }
                                          </div>
                                        )}
                                      </td>

                                      <td className="px-3 py-2 text-center">
                                        <Checkbox
                                          checked={
                                            entry.isBillable !==
                                            false
                                          }
                                          disabled={
                                            !editable
                                          }
                                          onCheckedChange={
                                            checked =>
                                              updateEntry(
                                                index,
                                                'isBillable',
                                                Boolean(
                                                  checked
                                                )
                                              )
                                          }
                                        />
                                      </td>

                                      {editable && (
                                        <td className="px-3 py-2">
                                          <div className="flex justify-end gap-1">
                                            <Button
                                              type="button"
                                              size="icon"
                                              variant="ghost"
                                              className="h-7 w-7"
                                              title="Copy previous day's work"
                                              onClick={() =>
                                                copyPreviousDay(
                                                  index
                                                )
                                              }
                                            >
                                              <Copy className="h-3.5 w-3.5" />
                                            </Button>

                                            <Button
                                              type="button"
                                              size="icon"
                                              variant="ghost"
                                              className="h-7 w-7 text-rose-600"
                                              title="Delete entry"
                                              onClick={() =>
                                                removeEntry(
                                                  index
                                                )
                                              }
                                            >
                                              <Trash2 className="h-3.5 w-3.5" />
                                            </Button>
                                          </div>
                                        </td>
                                      )}
                                    </>
                                  )
                                })()}
                              </tr>
                            )
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          }
        )}
      </div>

      {/* =====================================================
          FINAL SUBMISSION PANEL
         ===================================================== */}

      <Card className="overflow-hidden border-[#1e2a78]/20">
        <CardHeader className="border-b bg-[#1e2a78]/5">
          <CardTitle className="flex items-center gap-2 text-sm">
            <FileCheck2 className="h-4 w-4 text-[#1e2a78]" />
            Monthly Submission
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-5 p-5">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <ValidationItem
              ok={
                entries.length >
                0
              }
              label="Entries recorded"
            />

            <ValidationItem
              ok={
                entries.every(
                  entry =>
                    Boolean(
                      entry.description?.trim()
                    )
                )
              }
              label="Descriptions completed"
            />

            <ValidationItem
              ok={
                entries.every(
                  entry =>
                    entry.isLeave ||
                    entry.taskCategory === 'Leave' ||
                    Number(
                      entry.hours
                    ) > 0
                )
              }
              label="Hours / Leave valid"
            />

            <ValidationItem
              ok={
                completionPercent ===
                100
              }
              warning={
                completionPercent !==
                100
              }
              label={`${completedDays}/${workingDays} working dates resolved`}
            />
          </div>

          {editable &&
            completionPercent <
              100 && (
              <div className="w-full rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30">
                <div className="flex w-full items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />

                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                      Pending Leave / Absence Review
                    </h3>

                    <div className="mt-1.5 space-y-2 text-sm leading-6 text-amber-800 dark:text-amber-300">
                      <p className="whitespace-normal break-words">
                        You have work
                        entries for{' '}
                        <strong>
                          {
                            completedDays
                          }{' '}
                          of{' '}
                          {
                            workingDays
                          }
                        </strong>{' '}
                        working days.{' '}
                        <strong>
                          {Math.max(
                            workingDays -
                              completedDays,
                            0
                          )}
                        </strong>{' '}
                        working day
                        {workingDays -
                          completedDays ===
                        1
                          ? ''
                          : 's'}{' '}
                        currently have no
                        work entry.
                      </p>

                      <p className="whitespace-normal break-words">
                        Those dates are not
                        automatically treated
                        as paid leave or LOP.
                        If you submit now,
                        Administration must
                        review them.
                      </p>

                      <p className="whitespace-normal break-words">
                        Administration may
                        approve the month when
                        the dates are already
                        covered by valid
                        leave, or
                        return/reject the
                        timesheet with a
                        reason so you can
                        correct and resubmit
                        it.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

          {editable && (
            <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-medium">
                  Fill weekly. Submit
                  only once for the
                  entire month.
                </p>

                <p className="mt-1 text-[11px] text-muted-foreground">
                  Saving a draft does
                  not send the
                  timesheet to
                  Administration.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={
                    addNextMissingDay
                  }
                >
                  <TimerReset className="mr-1.5 h-3.5 w-3.5" />
                  Add Next Missing Day
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={
                    saveDraft
                  }
                  disabled={
                    saving ||
                    submitting
                  }
                >
                  {saving ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="mr-1.5 h-3.5 w-3.5" />
                  )}

                  Save Draft
                </Button>

                <Button
                  type="button"
                  size="sm"
                  onClick={
                    submitTimesheet
                  }
                  disabled={
                    saving ||
                    submitting ||
                    entries.length ===
                      0
                  }
                  className="bg-[#1e2a78] text-white hover:bg-[#152060] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="mr-1.5 h-3.5 w-3.5" />
                  )}

                  Submit{' '}
                  {
                    MONTHS[
                      selectedMonth -
                        1
                    ]
                  }{' '}
                  Timesheet
                </Button>
              </div>
            </div>
          )}
                    {isPending && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              <Clock3 className="mt-0.5 h-4 w-4 shrink-0" />

              <div>
                <p className="text-xs font-bold">
                  Awaiting Administrator Approval
                </p>

                <p className="mt-1 text-[11px]">
                  Submitted{' '}
                  {timesheet?.submittedAt
                    ? new Date(
                        timesheet.submittedAt
                      ).toLocaleString(
                        'en-IN'
                      )
                    : 'recently'}
                  . Editing is disabled
                  until the timesheet is
                  approved or returned for
                  correction.
                </p>
              </div>
            </div>
          )}

          {isLocked && (
            <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
              <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" />

              <div>
                <p className="text-xs font-bold">
                  Timesheet Approved
                </p>

                <p className="mt-1 text-[11px]">
                  This month is cleared
                  for the payroll
                  workflow. The approved
                  timesheet cannot be
                  edited unless
                  Administration
                  explicitly reopens it.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* =====================================================
          LEAVE APPLICATION DIALOG
         ===================================================== */}

      <Dialog
        open={
          Boolean(
            leaveDialogDate
          )
        }
        onOpenChange={
          open => {
            if (!open) {
              closeLeaveDialog()
            }
          }
        }
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Mark Leave in Timesheet
            </DialogTitle>

            <DialogDescription>
              {leaveDialogDate
                ? `Record leave for ${formatLongDate(
                    leaveDialogDate
                  )}. This entry is saved directly into your timesheet and submitted for approval with the entire month.`
                : ''}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>
                Leave Type
              </Label>

              <Select
                value={
                  selectedLeaveTypeId
                }
                onValueChange={
                  setSelectedLeaveTypeId
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select leave type" />
                </SelectTrigger>

                <SelectContent>
                  {leaveTypes.length ===
                  0 ? (
                    <SelectItem
                      value="__none"
                      disabled
                    >
                      No leave types available
                    </SelectItem>
                  ) : (
                    leaveTypes.map(
                      leaveType => (
                        <SelectItem
                          key={
                            leaveType.id
                          }
                          value={
                            leaveType.id
                          }
                        >
                          {
                            leaveType.name
                          }

                          {leaveType.code
                            ? ` (${leaveType.code})`
                            : ''}

                          {' • '}

                          {leaveType.isPaid
                            ? 'Paid'
                            : 'Unpaid / LOP'}
                        </SelectItem>
                      )
                    )
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="timesheet-leave-reason">
                Reason (Optional)
              </Label>

              <Input
                id="timesheet-leave-reason"
                value={
                  leaveReason
                }
                onChange={
                  event =>
                    setLeaveReason(
                      event.target
                        .value
                    )
                }
                placeholder="Reason for leave"
              />
            </div>

            {leaveDialogDate && holidayDateSet.has(leaveDialogDate) ? (
              <Alert className="border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
                <CalendarDays className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <AlertDescription className="text-xs">
                  This date is an official <strong>Company Paid Holiday</strong>. Public holidays are paid non-working days and are never deducted from your salary. You do not need to mark leave.
                </AlertDescription>
              </Alert>
            ) : (
              <Alert className="border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
                <Palmtree className="h-4 w-4 text-[#1e2a78] dark:text-blue-400 shrink-0" />
                <AlertDescription className="text-xs space-y-1">
                  <div>
                    <strong>Monthly Salary Deduction:</strong> This leave will initially be deducted in this month&apos;s salary at the canonical daily rate (<em>Monthly Gross ÷ Working Days</em>).
                  </div>
                  <div>
                    {annualLeaveSummary.paidLeaveRemaining > 0 ? (
                      <span className="text-emerald-700 dark:text-emerald-300 font-semibold">
                        ✓ Eligible for Year-End Compensation: You have {annualLeaveSummary.paidLeaveRemaining} of 11 annual compensation days remaining. This deduction will be reimbursed at year-end after audit.
                      </span>
                    ) : (
                      <span className="text-amber-700 dark:text-amber-300 font-semibold">
                        ⚠ 11-Day Entitlement Exhausted: This leave is non-compensable at year-end.
                      </span>
                    )}
                  </div>
                </AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={
                closeLeaveDialog
              }
              disabled={
                applyingLeave
              }
            >
              Cancel
            </Button>

            <Button
              onClick={
                applyLeaveFromTimesheet
              }
              disabled={
                !selectedLeaveTypeId ||
                selectedLeaveTypeId ===
                  '__none'
              }
              className="bg-[#1e2a78] text-white hover:bg-[#152060]"
            >
              Mark as Leave
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* =====================================================
          PRE-SUBMISSION CONFIRMATION DIALOG
         ===================================================== */}

      <Dialog
        open={showSubmitConfirm}
        onOpenChange={open => {
          if (!open && !submitting) {
            setShowSubmitConfirm(false)
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Submit {MONTHS[selectedMonth - 1]} {selectedYear} Timesheet
            </DialogTitle>
            <DialogDescription>
              Review your monthly summary before submitting to Administration for approval.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 rounded-xl border bg-muted/20 p-4 text-xs">
            <div className="flex justify-between py-1 border-b">
              <span className="text-muted-foreground">Scheduled Working Days:</span>
              <span className="font-semibold">{workingDays} days</span>
            </div>
            <div className="flex justify-between py-1 border-b">
              <span className="text-muted-foreground">Workdays Worked:</span>
              <span className="font-semibold text-emerald-600">{completedWorkDateSet.size} days</span>
            </div>
            <div className="flex justify-between py-1 border-b">
              <span className="text-muted-foreground">Leave Days:</span>
              <span className="font-semibold text-blue-600">
                {allLeaveDateSet.size} days
                <span className="text-[10px] text-muted-foreground ml-1">
                  ({timesheetPaidLeaveDateSet.size} Paid, {timesheetUnpaidLeaveDateSet.size} LOP)
                </span>
              </span>
            </div>
            <div className="flex justify-between py-1 border-b">
              <span className="text-muted-foreground">Total Resolved Days:</span>
              <span className="font-semibold">{completedDays} of {workingDays}</span>
            </div>
            <div className="flex justify-between py-1 border-b">
              <span className="text-muted-foreground">Company Holidays:</span>
              <span className="font-semibold">{holidays.length} days</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-muted-foreground">Total Logged Work Hours:</span>
              <span className="font-semibold">{totalHours.toFixed(1)} hrs ({billableHours.toFixed(1)} billable)</span>
            </div>
          </div>

          <Alert className="border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
            <AlertTriangle className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <AlertDescription className="text-xs">
              Submitting locks this timesheet from editing and sends it to Administration. The entire month, including work and leave entries, will be approved together as a unit.
            </AlertDescription>
          </Alert>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowSubmitConfirm(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void doSubmitTimesheet()}
              disabled={submitting}
              className="bg-[#1e2a78] text-white hover:bg-[#152060]"
            >
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm & Submit to Admin
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* ============================================================
   SUBCOMPONENTS
   ============================================================ */

function SummaryCard({
  label,
  value,
}: {
  label: string
  value: React.ReactNode
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>

        <div className="mt-2 text-xl font-bold">
          {value}
        </div>
      </CardContent>
    </Card>
  )
}

function StatusBadge({
  status,
}: {
  status: TimesheetStatus
}) {
  switch (status) {
    case 'APPROVED':
      return (
        <Badge className="border-emerald-200 bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
          Approved
        </Badge>
      )

    case 'LOCKED':
      return (
        <Badge className="border-blue-200 bg-blue-100 text-blue-800 hover:bg-blue-100">
          Locked
        </Badge>
      )

    case 'SUBMITTED':
    case 'UNDER_REVIEW':
      return (
        <Badge className="border-amber-200 bg-amber-100 text-amber-800 hover:bg-amber-100">
          Pending Review
        </Badge>
      )

    case 'RETURNED_FOR_CORRECTION':
      return (
        <Badge variant="destructive">
          Returned
        </Badge>
      )

    case 'REJECTED':
      return (
        <Badge variant="destructive">
          Rejected
        </Badge>
      )

    default:
      return (
        <Badge variant="secondary">
          Draft
        </Badge>
      )
  }
}

function ValidationItem({
  ok,
  warning = false,
  label,
}: {
  ok: boolean
  warning?: boolean
  label: string
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border p-3">
      {ok ? (
        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
      ) : warning ? (
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
      ) : (
        <Undo2 className="h-4 w-4 shrink-0 text-muted-foreground" />
      )}

      <span className="text-[11px] font-medium">
        {label}
      </span>
    </div>
  )
}