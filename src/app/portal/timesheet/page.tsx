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

function toIsoDate(
  date: Date
) {
  const year =
    date.getFullYear()

  const month =
    String(
      date.getMonth() + 1
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
  const result:
    Date[] = []

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
            .filter(
              Boolean
            )
        ),
      [holidays]
    )

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
        } catch (
          error
        ) {
          console.error(
            'Unable to load leave/holiday context:',
            error
          )

          setLeaveTypes(
            []
          )

          setLeaveRequests(
            []
          )

          setHolidays(
            []
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
              leaveRequests.find(
                item =>
                  normalizeLeaveStatus(
                    item.status
                  ) ===
                    'APPROVED' &&
                  dateInRange(
                    iso,
                    item.startDate,
                    item.endDate
                  )
              )

            if (
              leave
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
        leaveRequests,
      ]
    )

  /* ============================================================
     ENTRY METRICS
     ============================================================ */

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
        entries
          .filter(
            entry =>
              entry.isBillable !==
              false
          )
          .reduce(
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

  const nonBillableHours =
    totalHours -
    billableHours

  const completedWorkingDates =
    useMemo(
      () => {
        const dates =
          new Set<string>()

        entries.forEach(
          entry => {
            if (
              workingDateStrings.has(
                entry.entryDate
              ) &&
              Number(
                entry.hours ||
                  0
              ) > 0
            ) {
              dates.add(
                entry.entryDate
              )
            }
          }
        )

        return dates
      },
      [
        entries,
        workingDateStrings,
      ]
    )

  const completedDays =
    new Set([
      ...completedWorkingDates,
      ...approvedLeaveDateSet,
    ]).size

  const workingDays =
    workingDates.length

  const approvedLeaveDays =
    approvedLeaveDateSet.size

  const workDays =
    completedWorkingDates.size

  const pendingLeaveDays =
    workingDates.filter(
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
          !leave
        ) {
          return false
        }

        const leaveStatus =
          normalizeLeaveStatus(
            leave.status
          )

        return (
          leaveStatus ===
            'PENDING' ||
          leaveStatus ===
            'SUBMITTED' ||
          leaveStatus ===
            'UNDER_REVIEW'
        )
      }
    ).length

  const completionPercent =
    workingDays >
    0
      ? Math.min(
          100,
          Math.round(
            (
              completedDays /
              workingDays
            ) *
              100
          )
        )
      : 0

  /* ============================================================
     GROUP ENTRIES BY WEEK
     ============================================================ */

  const weeks =
    useMemo(
      () => {
        const groups =
          new Map<
            number,
            {
              weekNumber: number
              dates: Date[]
              entries: Array<{
                entry:
                  TimesheetEntry
                index: number
              }>
            }
          >()

        monthDates.forEach(
          date => {
            const week =
              getWeekNumberOfMonth(
                date
              )

            if (
              !groups.has(
                week
              )
            ) {
              groups.set(
                week,
                {
                  weekNumber:
                    week,
                  dates: [],
                  entries:
                    [],
                }
              )
            }

            groups
              .get(
                week
              )!
              .dates.push(
                date
              )
          }
        )

        entries.forEach(
          (
            entry,
            index
          ) => {
            if (
              !entry.entryDate
            ) {
              return
            }

            const date =
              new Date(
                `${entry.entryDate}T00:00:00`
              )

            const week =
              getWeekNumberOfMonth(
                date
              )

            if (
              groups.has(
                week
              )
            ) {
              groups
                .get(
                  week
                )!
                .entries.push(
                  {
                    entry,
                    index,
                  }
                )
            }
          }
        )

        return Array.from(
          groups.values()
        )
      },
      [
        monthDates,
        entries,
      ]
    )

  const openLeaveDialog =
    (
      date: string
    ) => {
      if (
        !editable
      ) {
        return
      }

      const existingLeave =
        leaveForDate(
          date
        )

      if (
        existingLeave
      ) {
        toast.info(
          `${existingLeave.leaveTypeName} already exists for ${formatLongDate(
            date
          )} (${normalizeLeaveStatus(
            existingLeave.status
          ) || 'status unavailable'}).`
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

      setLeaveReason(
        ''
      )
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

      setLeaveReason(
        ''
      )
    }

  const applyLeaveFromTimesheet =
    async () => {
      if (
        !leaveDialogDate
      ) {
        return
      }

      if (
        !selectedLeaveTypeId
      ) {
        toast.error(
          'Select a leave type.'
        )

        return
      }

      if (
        leaveReason.trim().length <
        2
      ) {
        toast.error(
          'Enter a short reason for the leave request.'
        )

        return
      }

      if (
        entries.some(
          entry =>
            entry.entryDate ===
              leaveDialogDate &&
            Number(
              entry.hours ||
                0
            ) >
              0
        )
      ) {
        toast.error(
          'Remove the work entry for this date before applying leave.'
        )

        return
      }

      setApplyingLeave(
        true
      )

      try {
        const response =
          await fetch(
            '/api/leave',
            {
              method:
                'POST',

              headers: {
                'Content-Type':
                  'application/json',
              },

              body:
                JSON.stringify({
                  leave_type_id:
                    selectedLeaveTypeId,

                  start_date:
                    leaveDialogDate,

                  end_date:
                    leaveDialogDate,

                  total_days:
                    1,

                  reason:
                    leaveReason.trim(),
                }),
            }
          )

        const result =
          await response.json()

        if (
          !response.ok ||
          result.success ===
            false
        ) {
          throw new Error(
            result.error ||
              'Unable to submit leave request.'
          )
        }

        toast.success(
          `Leave request submitted for ${formatLongDate(
            leaveDialogDate
          )}.`
        )

        setLeaveDialogDate(
          null
        )

        setSelectedLeaveTypeId(
          ''
        )

        setLeaveReason(
          ''
        )

        await fetchSupportingCalendarData()
      } catch (
        error: any
      ) {
        toast.error(
          error?.message ||
            'Unable to submit leave request.'
        )
      } finally {
        setApplyingLeave(
          false
        )
      }
    }

  /* ============================================================
     ENTRY ACTIONS
     ============================================================ */

  const addEntryForDate = (
    date: string
  ) => {
    if (!editable) {
      return
    }

    if (
      holidayByDate.has(
        date
      )
    ) {
      toast.info(
        'This date is a company holiday. No work entry is required.'
      )

      return
    }

    const existingLeave =
      leaveForDate(
        date
      )

    if (
      existingLeave
    ) {
      toast.info(
        `${existingLeave.leaveTypeName} is already recorded for this date (${normalizeLeaveStatus(
          existingLeave.status
        )}).`
      )

      return
    }

    setEntries(
      previous => [
        ...previous,
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

  const addNextMissingDay =
    () => {
      if (!editable) {
        return
      }

      const existing =
        new Set(
          entries.map(
            entry =>
              entry.entryDate
          )
        )

      const missing =
        workingDates.find(
          date =>
            !existing.has(
              toIsoDate(
                date
              )
            )
        )

      if (!missing) {
        toast.info(
          'Every working day already has an entry.'
        )

        return
      }

      addEntryForDate(
        toIsoDate(
          missing
        )
      )
    }

  const updateEntry = (
    index: number,
    field:
      keyof TimesheetEntry,
    value: any
  ) => {
    setEntries(
      previous =>
        previous.map(
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

  const removeEntry = (
    index: number
  ) => {
    setEntries(
      previous =>
        previous.filter(
          (
            _,
            entryIndex
          ) =>
            entryIndex !==
            index
        )
    )
  }

  const copyPreviousDay = (
    index: number
  ) => {
    const target =
      entries[index]

    if (!target) {
      return
    }

    const candidates =
      entries
        .map(
          (
            entry,
            entryIndex
          ) => ({
            entry,
            entryIndex,
          })
        )
        .filter(
          item =>
            item.entry.entryDate <
            target.entryDate
        )
        .sort(
          (
            a,
            b
          ) =>
            b.entry.entryDate.localeCompare(
              a.entry.entryDate
            )
        )

    const previous =
      candidates[0]

    if (!previous) {
      toast.info(
        'No previous entry available.'
      )
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

                  projectName:
                    previous.entry
                      .projectName,

                  taskCategory:
                    previous.entry
                      .taskCategory,

                  description:
                    previous.entry
                      .description,

                  hours:
                    previous.entry
                      .hours,

                  isBillable:
                    previous.entry
                      .isBillable,
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
      weekNumber: number
    ) => {
      if (
        weekNumber <= 1
      ) {
        toast.info(
          'There is no previous week to copy.'
        )

        return
      }

      const currentWeek =
        weeks.find(
          week =>
            week.weekNumber ===
            weekNumber
        )

      const previousWeek =
        weeks.find(
          week =>
            week.weekNumber ===
            weekNumber -
              1
        )

      if (
        !currentWeek ||
        !previousWeek ||
        previousWeek.entries
          .length === 0
      ) {
        toast.info(
          'Previous week has no entries to copy.'
        )

        return
      }

      const previousByDay =
        new Map<
          number,
          TimesheetEntry
        >()

      previousWeek.entries.forEach(
        ({
          entry,
        }) => {
          const day =
            new Date(
              `${entry.entryDate}T00:00:00`
            ).getDay()

          if (
            !previousByDay.has(
              day
            )
          ) {
            previousByDay.set(
              day,
              entry
            )
          }
        }
      )

      const newEntries:
        TimesheetEntry[] =
          []

      currentWeek.dates
        .filter(
          date =>
            !isWeekend(
              date
            )
        )
        .forEach(
          date => {
            const iso =
              toIsoDate(
                date
              )

            const alreadyExists =
              entries.some(
                entry =>
                  entry.entryDate ===
                  iso
              )

            if (
              alreadyExists
            ) {
              return
            }

            const source =
              previousByDay.get(
                date.getDay()
              )

            if (!source) {
              return
            }

            newEntries.push({
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
        newEntries.length ===
        0
      ) {
        toast.info(
          'No missing days could be copied into this week.'
        )

        return
      }

      setEntries(
        previous => [
          ...previous,
          ...newEntries,
        ]
      )

      toast.success(
        `${newEntries.length} work entries copied from the previous week.`
      )
    }

  /* ============================================================
     VALIDATE
     ============================================================ */

  const validateEntries =
    () => {
      if (
        entries.length ===
        0
      ) {
        toast.error(
          'Add at least one work entry.'
        )

        return false
      }

      for (
        let index = 0;
        index <
        entries.length;
        index++
      ) {
        const entry =
          entries[index]

        if (
          !entry.entryDate
        ) {
          toast.error(
            `Entry ${
              index + 1
            }: Work date is required.`
          )

          return false
        }

        if (
          !entry.description?.trim()
        ) {
          toast.error(
            `${formatShortDate(
              entry.entryDate
            )}: Work description is required.`
          )

          return false
        }

        const hours =
          Number(
            entry.hours
          )

        if (
          !Number.isFinite(
            hours
          ) ||
          hours <= 0 ||
          hours > 24
        ) {
          toast.error(
            `${formatShortDate(
              entry.entryDate
            )}: Hours must be greater than 0 and not exceed 24.`
          )

          return false
        }

        const entryDate =
          new Date(
            `${entry.entryDate}T00:00:00`
          )

        if (
          entryDate.getFullYear() !==
            selectedYear ||
          entryDate.getMonth() +
            1 !==
            selectedMonth
        ) {
          toast.error(
            `${entry.entryDate} does not belong to the selected month.`
          )

          return false
        }
      }

      return true
    }

  /* ============================================================
     SAVE DRAFT
     ============================================================ */

  const saveDraft =
    async () => {
      if (
        !validateEntries()
      ) {
        return
      }

      setSaving(true)

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
                JSON.stringify({
                  action:
                    'draft',

                  year:
                    selectedYear,

                  month:
                    selectedMonth,

                  entries,
                }),
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
              'Unable to save draft.'
          )

          return
        }

        const updated =
          result.data ||
          result.timesheet

        if (updated) {
          setTimesheet(
            updated
          )

          if (
            Array.isArray(
              updated.entries
            )
          ) {
            setEntries(
              updated.entries
            )
          }
        }

        toast.success(
          'Monthly timesheet draft saved.'
        )
      } catch (
        error
      ) {
        console.error(
          error
        )

        toast.error(
          'Network error while saving the timesheet.'
        )
      } finally {
        setSaving(
          false
        )
      }
    }

  /* ============================================================
     SUBMIT MONTH
     ============================================================ */

  const submitTimesheet =
    async () => {
      if (
        !validateEntries()
      ) {
        return
      }

      /**
       * Final monthly submission is blocked when the employee
       * has not filled every currently expected weekday.
       *
       * IMPORTANT:
       * - Save Draft remains available throughout the month.
       * - Missing dates are NOT treated as LOP here.
       * - Payroll will still perform authoritative reconciliation
       *   against paid leave, LOP, holidays, attendance and
       *   employment dates.
       *
       * This client-side rule prevents obviously incomplete
       * monthly timesheets such as 1/22 days from being submitted.
       */
      if (
        completionPercent <
        100
      ) {
        const pendingLeaveOrAbsenceDays =
          Math.max(
            workingDays -
              completedDays,
            0
          )

        const confirmed =
          window.confirm(
            `${pendingLeaveOrAbsenceDays} working day${
              pendingLeaveOrAbsenceDays ===
              1
                ? ''
                : 's'
            } have no timesheet work entry.\n\nThese dates will be sent to Administration as Pending Leave / Absence for review. They are NOT automatically treated as paid leave or LOP.\n\nIf the entries are incorrect, Administration can return the timesheet for correction and you can edit and resubmit it.\n\nSubmit this month now?`
          )

        if (
          !confirmed
        ) {
          return
        }
      }

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
                JSON.stringify({
                  action:
                    'submit',

                  year:
                    selectedYear,

                  month:
                    selectedMonth,

                  entries,
                }),
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
              'Unable to submit timesheet.'
          )

          return
        }

        const updated =
          result.data ||
          result.timesheet

        if (updated) {
          setTimesheet(
            updated
          )

          if (
            Array.isArray(
              updated.entries
            )
          ) {
            setEntries(
              updated.entries
            )
          }
        }

        toast.success(
          `${
            MONTHS[
              selectedMonth -
                1
            ]
          } ${selectedYear} timesheet submitted for administrator approval.`
        )
      } catch (
        error
      ) {
        console.error(
          'Timesheet submission failed:',
          error
        )

        toast.error(
          'Network error while submitting the timesheet.'
        )
      } finally {
        setSubmitting(
          false
        )
      }
    }

  /* ============================================================
     PERIOD NAVIGATION
     ============================================================ */

  const moveMonth = (
    delta: number
  ) => {
    const date =
      new Date(
        selectedYear,
        selectedMonth -
          1 +
          delta,
        1
      )

    setSelectedYear(
      date.getFullYear()
    )

    setSelectedMonth(
      date.getMonth() +
        1
    )
  }

  const goCurrentMonth =
    () => {
      setSelectedYear(
        today.getFullYear()
      )

      setSelectedMonth(
        today.getMonth() +
          1
      )
    }

  /* ============================================================
     LOADING
     ============================================================ */

  if (loading) {
    return (
      <div className="flex min-h-[520px] items-center justify-center">
        <div className="space-y-3 text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#1e2a78]" />

          <p className="text-xs text-muted-foreground">
            Loading your monthly timesheet...
          </p>
        </div>
      </div>
    )
  }

  /* ============================================================
     RENDER
     ============================================================ */

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-16">
      {/* =====================================================
          HEADER
         ===================================================== */}

      <div className="flex flex-col gap-4 border-b pb-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1e2a78]/10">
              <CalendarDays className="h-5 w-5 text-[#1e2a78] dark:text-blue-400" />
            </div>

            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                My Timesheet
              </h1>

              <p className="mt-0.5 text-xs text-muted-foreground">
                Fill work weekly, save throughout the month, and submit the completed month once for approval.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() =>
              moveMonth(-1)
            }
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <Select
            value={String(
              selectedMonth
            )}
            onValueChange={value =>
              setSelectedMonth(
                Number(value)
              )
            }
          >
            <SelectTrigger className="w-[145px]">
              <SelectValue />
            </SelectTrigger>

            <SelectContent>
              {MONTHS.map(
                (
                  month,
                  index
                ) => (
                  <SelectItem
                    key={month}
                    value={String(
                      index + 1
                    )}
                  >
                    {month}
                  </SelectItem>
                )
              )}
            </SelectContent>
          </Select>

          <Select
            value={String(
              selectedYear
            )}
            onValueChange={value =>
              setSelectedYear(
                Number(value)
              )
            }
          >
            <SelectTrigger className="w-[105px]">
              <SelectValue />
            </SelectTrigger>

            <SelectContent>
              {Array.from(
                {
                  length:
                    7,
                },
                (
                  _,
                  index
                ) =>
                  today.getFullYear() -
                  3 +
                  index
              ).map(year => (
                <SelectItem
                  key={year}
                  value={String(
                    year
                  )}
                >
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            onClick={
              goCurrentMonth
            }
            className="text-xs"
          >
            Current Month
          </Button>

          <Button
            variant="outline"
            size="icon"
            onClick={() =>
              moveMonth(1)
            }
          >
            <ChevronRight className="h-4 w-4" />
          </Button>

          <Button
            variant="outline"
            size="icon"
            onClick={() =>
              void fetchTimesheet()
            }
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* =====================================================
          RETURNED ALERT
         ===================================================== */}

      {isReturned && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />

          <AlertTitle>
            Returned for Correction
          </AlertTitle>

          <AlertDescription>
            <span className="font-semibold">
              Administrator feedback:
            </span>{' '}

            {timesheet?.returnedReason ||
              timesheet?.comments ||
              'Please review the timesheet and submit the corrected month again.'}
          </AlertDescription>
        </Alert>
      )}

      {/* =====================================================
          SUMMARY
         ===================================================== */}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <SummaryCard
          label="Status"
          value={
            <StatusBadge
              status={
                status
              }
            />
          }
        />

        <SummaryCard
          label="Working Days"
          value={String(
            workingDays
          )}
        />

        <SummaryCard
          label="Days Filled"
          value={`${completedDays} / ${workingDays}`}
        />

        <SummaryCard
          label="Total Hours"
          value={`${totalHours.toFixed(
            1
          )} hrs`}
        />

        <SummaryCard
          label="Billable"
          value={`${billableHours.toFixed(
            1
          )} hrs`}
        />

        <SummaryCard
          label="Non-Billable"
          value={`${nonBillableHours.toFixed(
            1
          )} hrs`}
        />
      </div>

      <div className="w-full rounded-xl border border-blue-200 bg-blue-50/70 p-4 dark:border-blue-900 dark:bg-blue-950/20">
        <div className="flex w-full items-start gap-3">
          <CalendarOff className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />

          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-blue-950 dark:text-blue-200">
              Work, Leave & Off-Day Rules
            </h3>

            <div className="mt-1.5 space-y-2 text-sm leading-6 text-blue-900/90 dark:text-blue-300">
              <p className="whitespace-normal break-words">
                Log work only for days actually worked. For a leave day, use the Leave action on that date.
              </p>

              <p className="whitespace-normal break-words">
                Approved paid leave counts as a resolved paid day. Approved Loss of Pay (LOP) is passed to payroll for salary deduction.
              </p>

              <p className="whitespace-normal break-words">
                Saturdays, Sundays, and configured company holidays do not require a work entry. Pending leave requests remain subject to administrator approval.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-[10px] font-semibold uppercase text-muted-foreground">
              Worked Days
            </p>

            <p className="mt-1 text-xl font-bold">
              {workDays}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-[10px] font-semibold uppercase text-muted-foreground">
              Approved Leave
            </p>

            <p className="mt-1 text-xl font-bold text-emerald-700">
              {approvedLeaveDays}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-[10px] font-semibold uppercase text-muted-foreground">
              Pending Leave
            </p>

            <p className="mt-1 text-xl font-bold text-amber-700">
              {pendingLeaveDays}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-[10px] font-semibold uppercase text-muted-foreground">
              Company Holidays
            </p>

            <p className="mt-1 text-xl font-bold text-blue-700">
              {holidays.filter(
                holiday => {
                  const date =
                    new Date(
                      `${holiday.date}T00:00:00`
                    )

                  return (
                    date.getFullYear() ===
                      selectedYear &&
                    date.getMonth() +
                      1 ===
                      selectedMonth
                  )
                }
              ).length}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* =====================================================
          COMPLETION
         ===================================================== */}

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold">
                Monthly Completion
              </p>

              <p className="text-[11px] text-muted-foreground">
                This indicator counts resolved working dates: days with work entries plus approved leave. Weekends and company holidays are excluded. Pending leave remains pending until Administration approves it.
              </p>
            </div>

            <div className="text-right">
              <span className="text-xl font-bold">
                {completionPercent}%
              </span>
            </div>
          </div>

          <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-[#1e2a78] transition-all duration-500"
              style={{
                width: `${completionPercent}%`,
              }}
            />
          </div>
        </CardContent>
      </Card>

      {/* =====================================================
          WEEKLY SHEETS
         ===================================================== */}

      <div className="space-y-4">
        {weeks.map(
          week => {
            const validDates =
              week.dates.filter(
                date =>
                  !isWeekend(
                    date
                  ) &&
                  !holidayDateSet.has(
                    toIsoDate(
                      date
                    )
                  )
              )

            const weekHours =
              week.entries.reduce(
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

            const weekBillable =
              week.entries
                .filter(
                  item =>
                    item.entry
                      .isBillable !==
                    false
                )
                .reduce(
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

            const filledWorkDates =
              new Set(
                week.entries
                  .filter(
                    item =>
                      Number(
                        item.entry
                          .hours ||
                          0
                      ) > 0
                  )
                  .map(
                    item =>
                      item.entry
                        .entryDate
                  )
              )

            const filled =
              new Set([
                ...filledWorkDates,
                ...validDates
                  .map(
                    toIsoDate
                  )
                  .filter(
                    date =>
                      approvedLeaveDateSet.has(
                        date
                      )
                  ),
              ]).size

            const first =
              week.dates[0]

            const last =
              week.dates[
                week.dates
                  .length - 1
              ]

            return (
              <Card
                key={
                  week.weekNumber
                }
                className="overflow-hidden"
              >
                <CardHeader className="border-b bg-muted/20 px-4 py-3">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2 text-sm">
                        Week{' '}
                        {week.weekNumber}

                        {filled >=
                          validDates.length &&
                          validDates.length >
                            0 && (
                            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                          )}
                      </CardTitle>

                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {formatShortDate(
                          toIsoDate(
                            first
                          )
                        )}{' '}
                        –{' '}
                        {formatShortDate(
                          toIsoDate(
                            last
                          )
                        )}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">
                        {filled}/
                        {
                          validDates.length
                        }{' '}
                        days
                      </Badge>

                      <Badge variant="outline">
                        {weekHours.toFixed(
                          1
                        )}{' '}
                        hrs
                      </Badge>

                      <Badge variant="outline">
                        {weekBillable.toFixed(
                          1
                        )}{' '}
                        billable
                      </Badge>

                      {editable &&
                        week.weekNumber >
                          1 && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-xs"
                            onClick={() =>
                              copyPreviousWeek(
                                week.weekNumber
                              )
                            }
                          >
                            <Copy className="mr-1.5 h-3.5 w-3.5" />
                            Copy Previous Week
                          </Button>
                        )}
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="p-0">
                  {/* Daily quick status row */}

                  <div className="grid grid-cols-2 gap-px border-b bg-border sm:grid-cols-3 lg:grid-cols-5">
                    {validDates.map(
                      date => {
                        const iso =
                          toIsoDate(
                            date
                          )

                        const dayEntries =
                          week.entries.filter(
                            item =>
                              item.entry
                                .entryDate ===
                              iso
                          )

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

                        const leaveIsLop =
                          Boolean(
                            leave &&
                            (
                              leave.isPaid ===
                                false ||
                              leave.leaveTypeCode
                                .toUpperCase() ===
                                'LOP'
                            )
                          )

                        return (
                          <div
                            key={
                              iso
                            }
                            className={cn(
                              'bg-background p-3 text-left transition-colors',
                              hasApprovedLeave &&
                                (leaveIsLop
                                  ? 'bg-red-50/70 dark:bg-red-950/15'
                                  : 'bg-emerald-50/70 dark:bg-emerald-950/15'),
                              hasPendingLeave &&
                                'bg-amber-50/70 dark:bg-amber-950/15'
                            )}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-semibold">
                                {date.toLocaleDateString(
                                  'en-IN',
                                  {
                                    weekday:
                                      'short',
                                  }
                                )}
                              </span>

                              {dayHours >
                              0 ? (
                                <BriefcaseBusiness className="h-3.5 w-3.5 text-emerald-600" />
                              ) : hasApprovedLeave ? (
                                <Palmtree
                                  className={cn(
                                    'h-3.5 w-3.5',
                                    leaveIsLop
                                      ? 'text-red-600'
                                      : 'text-emerald-600'
                                  )}
                                />
                              ) : hasPendingLeave ? (
                                <Clock3 className="h-3.5 w-3.5 text-amber-600" />
                              ) : (
                                <span className="h-2 w-2 rounded-full bg-muted-foreground/25" />
                              )}
                            </div>

                            <p className="mt-1 text-xs">
                              {formatShortDate(
                                iso
                              )}
                            </p>

                            <p className="mt-1 min-h-4 text-[10px] text-muted-foreground">
                              {dayHours >
                              0
                                ? `${dayHours.toFixed(
                                    1
                                  )} hrs worked`
                                : hasApprovedLeave
                                  ? `${leave?.leaveTypeName || 'Leave'} • ${
                                      leaveIsLop
                                        ? 'LOP'
                                        : 'Approved'
                                    }`
                                  : hasPendingLeave
                                    ? `${leave?.leaveTypeName || 'Leave'} • Pending`
                                    : 'No work / leave'}
                            </p>

                            {editable &&
                              dayHours ===
                                0 &&
                              !leave && (
                                <div className="mt-2 flex flex-wrap gap-1.5">
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
                                    className="h-7 border-amber-200 px-2 text-[10px] text-amber-700 hover:bg-amber-50"
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

                            {editable &&
                              leave && (
                                <p className="mt-2 text-[9px] text-muted-foreground">
                                  Leave status comes from My Leaves / Administration.
                                </p>
                              )}
                          </div>
                        )
                      }
                    )}
                  </div>

                  {/* Week rows */}

                  {week.entries.length ===
                  0 ? (
                    <div className="px-4 py-8 text-center">
                      <Clock3 className="mx-auto h-7 w-7 text-muted-foreground/40" />

                      <p className="mt-2 text-xs font-medium">
                        No work logged for this week
                      </p>

                      {editable && (
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Select a working day above to begin.
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[1000px] text-left text-xs">
                        <thead className="border-b bg-muted/40 text-[10px] uppercase text-muted-foreground">
                          <tr>
                            <th className="w-[135px] px-3 py-2.5">
                              Date
                            </th>

                            <th className="w-[165px] px-3 py-2.5">
                              Project
                            </th>

                            <th className="w-[150px] px-3 py-2.5">
                              Category
                            </th>

                            <th className="px-3 py-2.5">
                              Work Description
                            </th>

                            <th className="w-[95px] px-3 py-2.5 text-right">
                              Hours
                            </th>

                            <th className="w-[90px] px-3 py-2.5 text-center">
                              Billable
                            </th>

                            {editable && (
                              <th className="w-[100px] px-3 py-2.5 text-right">
                                Actions
                              </th>
                            )}
                          </tr>
                        </thead>

                        <tbody className="divide-y">
                          {week.entries
                            .sort(
                              (
                                a,
                                b
                              ) =>
                                a.entry.entryDate.localeCompare(
                                  b.entry.entryDate
                                )
                            )
                            .map(
                              ({
                                entry,
                                index,
                              }) => (
                                <tr
                                  key={`${entry.entryDate}-${index}`}
                                  className="hover:bg-muted/20"
                                >
                                  <td className="px-3 py-2">
                                    {editable ? (
                                      <Input
                                        type="date"
                                        className="h-8 text-xs"
                                        value={
                                          entry.entryDate
                                        }
                                        onChange={event =>
                                          updateEntry(
                                            index,
                                            'entryDate',
                                            event.target
                                              .value
                                          )
                                        }
                                      />
                                    ) : (
                                      <div>
                                        <p className="font-medium">
                                          {formatShortDate(
                                            entry.entryDate
                                          )}
                                        </p>

                                        <p className="text-[10px] text-muted-foreground">
                                          {new Date(
                                            `${entry.entryDate}T00:00:00`
                                          ).toLocaleDateString(
                                            'en-IN',
                                            {
                                              weekday:
                                                'short',
                                            }
                                          )}
                                        </p>
                                      </div>
                                    )}
                                  </td>

                                  <td className="px-3 py-2">
                                    {editable ? (
                                      <Input
                                        className="h-8 text-xs"
                                        placeholder="Project / Client"
                                        value={
                                          entry.projectName
                                        }
                                        onChange={event =>
                                          updateEntry(
                                            index,
                                            'projectName',
                                            event.target
                                              .value
                                          )
                                        }
                                      />
                                    ) : (
                                      entry.projectName ||
                                      'Not specified'
                                    )}
                                  </td>

                                  <td className="px-3 py-2">
                                    {editable ? (
                                      <Select
                                        value={
                                          entry.taskCategory ||
                                          'Development'
                                        }
                                        onValueChange={value =>
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
                                      'Not specified'
                                    )}
                                  </td>

                                  <td className="px-3 py-2">
                                    {editable ? (
                                      <Input
                                        className="h-8 text-xs"
                                        placeholder="What did you work on?"
                                        value={
                                          entry.description
                                        }
                                        onChange={event =>
                                          updateEntry(
                                            index,
                                            'description',
                                            event.target
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
                                        onChange={event =>
                                          updateEntry(
                                            index,
                                            'hours',
                                            Number(
                                              event.target
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
                                      onCheckedChange={checked =>
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
              label="Work entries added"
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
                    Number(
                      entry.hours
                    ) > 0
                )
              }
              label="Hours valid"
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

          {editable && completionPercent < 100 && (
            <div className="w-full rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30">
              <div className="flex w-full items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />

                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                    Pending Leave / Absence Review
                  </h3>

                  <div className="mt-1.5 space-y-2 text-sm leading-6 text-amber-800 dark:text-amber-300">
                    <p className="whitespace-normal break-words">
                      You have work entries for{' '}
                      <strong>
                        {completedDays} of {workingDays}
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
                      currently have no work entry.
                    </p>

                    <p className="whitespace-normal break-words">
                      Those dates are not automatically treated as paid leave or LOP.
                      If you submit now, Administration must review them.
                    </p>

                    <p className="whitespace-normal break-words">
                      Administration may approve the month when the dates are already
                      covered by valid leave, or return/reject the timesheet with a
                      reason so you can correct and resubmit it.
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
                  Fill weekly. Submit only once for the entire month.
                </p>

                <p className="mt-1 text-[11px] text-muted-foreground">
                  Saving a draft does not send the timesheet to Administration.
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
                  . Editing is disabled until the timesheet is approved or returned for correction.
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
                  This month is cleared for the payroll workflow. The approved timesheet cannot be edited unless Administration explicitly reopens it.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      <Dialog
        open={
          Boolean(
            leaveDialogDate
          )
        }
        onOpenChange={
          open => {
            if (
              !open
            ) {
              closeLeaveDialog()
            }
          }
        }
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Apply Leave from Timesheet
            </DialogTitle>

            <DialogDescription>
              {leaveDialogDate
                ? `Create a leave request for ${formatLongDate(
                    leaveDialogDate
                  )}. The day becomes approved leave/LOP only after the normal leave approval workflow.`
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
                          {leaveType.name}
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
                Reason
              </Label>

              <Input
                id="timesheet-leave-reason"
                value={
                  leaveReason
                }
                onChange={
                  event =>
                    setLeaveReason(
                      event.target.value
                    )
                }
                placeholder="Reason for leave"
              />
            </div>

            <Alert>
              <AlertTriangle className="h-4 w-4" />

              <AlertDescription>
                Applying leave here creates a real leave request. It does not auto-approve the day. Payroll uses the final approved Leave record to decide paid leave versus LOP.
              </AlertDescription>
            </Alert>
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
              onClick={() =>
                void applyLeaveFromTimesheet()
              }
              disabled={
                applyingLeave ||
                !selectedLeaveTypeId ||
                selectedLeaveTypeId ===
                  '__none'
              }
              className="bg-[#1e2a78] text-white hover:bg-[#152060]"
            >
              {applyingLeave && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}

              Submit Leave Request
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
  value:
    React.ReactNode
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
  status:
    TimesheetStatus
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