'use client'

import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'

import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  FileCheck2,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Undo2,
  UserRound,
  XCircle,
} from 'lucide-react'

import {
  toast,
} from 'sonner'

import {
  Badge,
} from '@/components/ui/badge'

import {
  Button,
} from '@/components/ui/button'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

import {
  Tabs,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import {
  cn,
} from '@/lib/utils'

// ============================================================
// TYPES
// ============================================================

type TimesheetStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'RETURNED_FOR_CORRECTION'
  | 'REJECTED'
  | 'LOCKED'

type ReviewAction =
  | 'APPROVE'
  | 'RETURN_FOR_CORRECTION'
  | 'REJECT'

interface TimesheetEntry {
  id?: string
  entryDate?: string
  entry_date?: string
  work_date?: string
  projectName?: string | null
  project_name?: string | null
  taskCategory?: string | null
  task_category?: string | null
  task_title?: string | null
  description?: string | null
  hours?: number
  isBillable?: boolean
  is_billable?: boolean
  isLeave?: boolean
  leaveTypeId?: string | null
  leaveTypeName?: string | null
  leaveTypeCode?: string | null
  leaveReason?: string | null
  isPaid?: boolean
}

interface AdminTimesheet {
  id: string

  employeeId: string
  employeeCode: string
  employeeName: string

  departmentName: string
  designationName: string

  year: number
  month: number

  periodStart: string
  periodEnd: string

  status: TimesheetStatus

  totalHours: number
  billableHours: number

  submittedAt?: string | null
  approvedAt?: string | null

  comments?: string | null
  returnedReason?: string | null

  entries: TimesheetEntry[]
}

interface MissingDaySummary {
  expectedWorkingDates: string[]
  workedDates: string[]
  leaveDates: string[]
  paidLeaveDates: string[]
  unpaidLeaveDates: string[]
  pendingDates: string[]
}

// ============================================================
// CONSTANTS
// ============================================================

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

// ============================================================
// DATE HELPERS
// ============================================================

function pad2(
  value: number
): string {
  return String(
    value
  ).padStart(
    2,
    '0'
  )
}

function makeDateOnly(
  year: number,
  month: number,
  day: number
): string {
  return `${year}-${pad2(month)}-${pad2(day)}`
}

function getDaysInMonth(
  year: number,
  month: number
): number {
  return new Date(
    Date.UTC(
      year,
      month,
      0
    )
  ).getUTCDate()
}

function getDayOfWeek(
  value: string
): number {
  const [
    year,
    month,
    day,
  ] =
    value
      .split('-')
      .map(Number)

  return new Date(
    Date.UTC(
      year,
      month - 1,
      day
    )
  ).getUTCDay()
}

function getWeekdayDates(
  year: number,
  month: number
): string[] {
  const total =
    getDaysInMonth(
      year,
      month
    )

  const dates:
    string[] = []

  for (
    let day = 1;
    day <= total;
    day++
  ) {
    const date =
      makeDateOnly(
        year,
        month,
        day
      )

    const dow =
      getDayOfWeek(
        date
      )

    if (
      dow !== 0 &&
      dow !== 6
    ) {
      dates.push(
        date
      )
    }
  }

  return dates
}

function normalizeDateOnly(
  value: unknown
): string {
  if (!value) {
    return ''
  }

  const text =
    String(
      value
    )

  const match =
    text.match(
      /^\d{4}-\d{2}-\d{2}/
    )

  return (
    match?.[0] ||
    ''
  )
}

function formatDate(
  value: string
): string {
  if (!value) {
    return '—'
  }

  const [
    year,
    month,
    day,
  ] =
    value
      .split('-')
      .map(Number)

  return new Intl.DateTimeFormat(
    'en-IN',
    {
      day:
        '2-digit',
      month:
        'short',
      year:
        'numeric',
    }
  ).format(
    new Date(
      Date.UTC(
        year,
        month - 1,
        day
      )
    )
  )
}

function formatDateTime(
  value?: string | null
): string {
  if (!value) {
    return '—'
  }

  const date =
    new Date(
      value
    )

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return '—'
  }

  return date.toLocaleString(
    'en-IN'
  )
}

// ============================================================
// MAPPING HELPERS
// ============================================================

function mapEntry(
  raw: any
): TimesheetEntry {
  let isLeave = Boolean(
    raw?.is_leave ??
    raw?.isLeave ??
    (raw?.taskCategory === 'Leave' || raw?.task_category === 'Leave')
  )
  let leaveTypeId = raw?.leave_type_id ?? raw?.leaveTypeId ?? null
  let leaveTypeName = raw?.leave_type_name ?? raw?.leaveTypeName ?? null
  let leaveTypeCode = raw?.leave_type_code ?? raw?.leaveTypeCode ?? null
  let leaveReason = raw?.leave_reason ?? raw?.leaveReason ?? null
  let isPaid: boolean | undefined =
    raw?.is_paid !== undefined
      ? Boolean(raw.is_paid)
      : raw?.isPaid !== undefined
      ? Boolean(raw.isPaid)
      : undefined

  const desc = String(raw?.description || '')
  if (desc.startsWith('[LEAVE|')) {
    isLeave = true
    const idCodeMatch = desc.match(/^\[LEAVE\|id:([^|]*)\|code:([^|]*)\|name:([^|]*)\|paid:([^\]]*)\]\s*(.*)$/)
    if (idCodeMatch) {
      const [, id, code, name, paid, rest] = idCodeMatch
      leaveTypeId = id || leaveTypeId
      leaveTypeCode = code || leaveTypeCode
      leaveTypeName = name || leaveTypeName
      isPaid = paid === '1' ? true : paid === '0' ? false : undefined
      leaveReason = rest || leaveReason
    } else {
      const genericMatch = desc.match(/^\[LEAVE\|([^|]+)\|([^|]+)\|([^|]*)\|([^\]]*)\](?:\s*(.*))?$/)
      if (genericMatch) {
        leaveTypeCode = genericMatch[1] || leaveTypeCode
        leaveTypeName = genericMatch[2] || leaveTypeName
        isPaid = genericMatch[3] === 'PAID' || genericMatch[3] === '1'
        leaveReason = genericMatch[4] || leaveReason
      }
    }
  }

  if (isLeave && isPaid === undefined) {
    const code = String(leaveTypeCode || '').toUpperCase()
    const name = String(leaveTypeName || '').toLowerCase()
    isPaid = !(code === 'LOP' || code === 'UNPAID' || name.includes('unpaid') || name.includes('loss of pay'))
  }

  return {
    id:
      raw?.id,

    entryDate:
      normalizeDateOnly(
        raw?.entryDate ??
          raw?.entry_date ??
          raw?.work_date
      ),

    projectName:
      raw?.projectName ??
      raw?.project_name ??
      (isLeave ? 'Leave' : null),

    taskCategory:
      isLeave
        ? 'Leave'
        : (raw?.taskCategory ??
           raw?.task_category ??
           raw?.task_title ??
           null),

    description:
      raw?.description ??
      null,

    hours:
      Number(
        raw?.hours ||
          0
      ),

    isBillable:
      isLeave
        ? false
        : (raw?.isBillable ??
           raw?.is_billable ??
           true),

    isLeave,
    leaveTypeId,
    leaveTypeName,
    leaveTypeCode,
    leaveReason,
    isPaid,
  }
}

function mapTimesheet(
  raw: any
): AdminTimesheet {
  const entriesRaw =
    Array.isArray(
      raw?.entries
    )
      ? raw.entries
      : Array.isArray(
          raw?.timesheet_entries
        )
      ? raw.timesheet_entries
      : []

  const entries:
    TimesheetEntry[] =
    entriesRaw.map(
      (
        entry: any
      ) =>
        mapEntry(
          entry
        )
    )

  const totalHours =
    raw?.totalHours !==
      undefined
      ? Number(
          raw.totalHours
        )
      : raw?.total_hours !==
        undefined
      ? Number(
          raw.total_hours
        )
      : entries.reduce(
          (
            total: number,
            entry: TimesheetEntry
          ) =>
            total +
            Number(
              entry.hours ||
                0
            ),
          0
        )

  const billableHours =
    raw?.billableHours !==
      undefined
      ? Number(
          raw.billableHours
        )
      : raw?.billable_hours !==
        undefined
      ? Number(
          raw.billable_hours
        )
      : entries
          .filter(
            (
              entry: TimesheetEntry
            ) =>
              entry.isBillable !==
              false
          )
          .reduce(
            (
              total: number,
              entry: TimesheetEntry
            ) =>
              total +
              Number(
                entry.hours ||
                  0
              ),
            0
          )

  const year =
    Number(
      raw?.year ||
        0
    )

  const month =
    Number(
      raw?.month ||
        0
    )

  const daysInMonth =
    year &&
    month
      ? getDaysInMonth(
          year,
          month
        )
      : 0

  return {
    id:
      raw?.id,

    employeeId:
      raw?.employeeId ??
      raw?.employee_id ??
      raw?.employee?.id ??
      '',

    employeeCode:
      raw?.employeeCode ??
      raw?.employee_code ??
      raw?.employee?.employee_code ??
      '',

    employeeName:
      raw?.employeeName ??
      raw?.employee_name ??
      raw?.employee?.full_name ??
      'Unknown employee',

    departmentName:
      raw?.departmentName ??
      raw?.department_name ??
      raw?.employee?.department_name ??
      raw?.employee?.departments?.name ??
      'Not assigned',

    designationName:
      raw?.designationName ??
      raw?.designation_name ??
      raw?.employee?.designation_name ??
      raw?.employee?.designations?.name ??
      'Not assigned',

    year,

    month,

    periodStart:
      normalizeDateOnly(
        raw?.periodStart ??
          raw?.period_start
      ) ||
      (
        year &&
        month
          ? makeDateOnly(
              year,
              month,
              1
            )
          : ''
      ),

    periodEnd:
      normalizeDateOnly(
        raw?.periodEnd ??
          raw?.period_end
      ) ||
      (
        year &&
        month &&
        daysInMonth
          ? makeDateOnly(
              year,
              month,
              daysInMonth
            )
          : ''
      ),

    status:
      String(
        raw?.status ||
          'DRAFT'
      ).toUpperCase() as
        TimesheetStatus,

    totalHours,

    billableHours,

    submittedAt:
      raw?.submittedAt ??
      raw?.submitted_at ??
      null,

    approvedAt:
      raw?.approvedAt ??
      raw?.approved_at ??
      null,

    comments:
      raw?.comments ??
      null,

    returnedReason:
      raw?.returnedReason ??
      raw?.returned_reason ??
      raw?.rejection_reason ??
      null,

    entries,
  }
}

function getMissingDaySummary(
  timesheet: AdminTimesheet,
  holidayDates: Set<string> = new Set()
): MissingDaySummary {
  const allWeekdays =
    getWeekdayDates(
      timesheet.year,
      timesheet.month
    )

  const expectedWorkingDates =
    allWeekdays.filter(
      date =>
        !holidayDates.has(date)
    )

  const workedDates =
    [
      ...new Set(
        timesheet.entries
          .filter(
            (
              entry: TimesheetEntry
            ) =>
              !entry.isLeave &&
              entry.taskCategory !== 'Leave' &&
              Number(
                entry.hours ||
                  0
              ) > 0
          )
          .map(
            (
              entry: TimesheetEntry
            ) =>
              normalizeDateOnly(
                entry.entryDate ??
                  entry.entry_date ??
                  entry.work_date
              )
          )
          .filter(Boolean)
      ),
    ].sort()

  const leaveDates =
    [
      ...new Set(
        timesheet.entries
          .filter(
            (
              entry: TimesheetEntry
            ) =>
              entry.isLeave === true ||
              entry.taskCategory === 'Leave' ||
              String(entry.description || '').startsWith('[LEAVE|')
          )
          .map(
            (
              entry: TimesheetEntry
            ) =>
              normalizeDateOnly(
                entry.entryDate ??
                  entry.entry_date ??
                  entry.work_date
              )
          )
          .filter(Boolean)
      ),
    ].sort()

  const paidLeaveDates =
    [
      ...new Set(
        timesheet.entries
          .filter(
            (
              entry: TimesheetEntry
            ) =>
              (entry.isLeave === true ||
               entry.taskCategory === 'Leave' ||
               String(entry.description || '').startsWith('[LEAVE|')) &&
              entry.isPaid !== false
          )
          .map(
            (
              entry: TimesheetEntry
            ) =>
              normalizeDateOnly(
                entry.entryDate ??
                  entry.entry_date ??
                  entry.work_date
              )
          )
          .filter(Boolean)
      ),
    ].sort()

  const unpaidLeaveDates =
    [
      ...new Set(
        timesheet.entries
          .filter(
            (
              entry: TimesheetEntry
            ) =>
              (entry.isLeave === true ||
               entry.taskCategory === 'Leave' ||
               String(entry.description || '').startsWith('[LEAVE|')) &&
              entry.isPaid === false
          )
          .map(
            (
              entry: TimesheetEntry
            ) =>
              normalizeDateOnly(
                entry.entryDate ??
                  entry.entry_date ??
                  entry.work_date
              )
          )
          .filter(Boolean)
      ),
    ].sort()

  const resolvedSet =
    new Set([
      ...workedDates,
      ...leaveDates,
    ])

  const pendingDates =
    expectedWorkingDates.filter(
      date =>
        !resolvedSet.has(
          date
        )
    )

  return {
    expectedWorkingDates,
    workedDates,
    leaveDates,
    paidLeaveDates,
    unpaidLeaveDates,
    pendingDates,
  }
}

// ============================================================
// STATUS UI
// ============================================================

function TimesheetStatusBadge({
  status,
}: {
  status: TimesheetStatus
}) {
  switch (
    status
  ) {
    case 'APPROVED':
      return (
        <Badge className="border border-emerald-200 bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
          Approved
        </Badge>
      )

    case 'LOCKED':
      return (
        <Badge className="border border-blue-200 bg-blue-100 text-blue-800 hover:bg-blue-100">
          Locked
        </Badge>
      )

    case 'SUBMITTED':
    case 'UNDER_REVIEW':
      return (
        <Badge className="border border-amber-200 bg-amber-100 text-amber-800 hover:bg-amber-100">
          Pending Review
        </Badge>
      )

    case 'RETURNED_FOR_CORRECTION':
      return (
        <Badge className="border border-orange-200 bg-orange-100 text-orange-800 hover:bg-orange-100">
          Returned
        </Badge>
      )

    case 'REJECTED':
      return (
        <Badge className="border border-red-200 bg-red-100 text-red-800 hover:bg-red-100">
          Rejected
        </Badge>
      )

    default:
      return (
        <Badge variant="outline">
          Draft
        </Badge>
      )
  }
}

// ============================================================
// PAGE
// ============================================================

export default function TimesheetApprovalsPage() {
  const today =
    new Date()

  const [
    selectedYear,
    setSelectedYear,
  ] =
    useState(
      today.getFullYear()
    )

  const [
    selectedMonth,
    setSelectedMonth,
  ] =
    useState(
      today.getMonth() +
        1
    )

  const [
    activeTab,
    setActiveTab,
  ] =
    useState('ALL')

  const [
    searchQuery,
    setSearchQuery,
  ] =
    useState('')

  const [
    rows,
    setRows,
  ] =
    useState<
      AdminTimesheet[]
    >([])

  const [
    loading,
    setLoading,
  ] =
    useState(true)

  const [
    expandedRows,
    setExpandedRows,
  ] =
    useState<
      Record<
        string,
        boolean
      >
    >({})

  const [
    reviewTimesheet,
    setReviewTimesheet,
  ] =
    useState<
      AdminTimesheet | null
    >(null)

  const [
    reviewAction,
    setReviewAction,
  ] =
    useState<
      ReviewAction | null
    >(null)

  const [
    comments,
    setComments,
  ] =
    useState('')

  const [
    reviewing,
    setReviewing,
  ] =
    useState(false)

  const [
    holidayDates,
    setHolidayDates,
  ] =
    useState<Set<string>>(new Set())

  // ==========================================================
  // LOAD
  // ==========================================================

  const loadTimesheets =
    useCallback(
      async () => {
        setLoading(
          true
        )

        try {
          const [response, holidayResponse] =
            await Promise.all([
              fetch(
                `/api/timesheets?view=admin&year=${selectedYear}&month=${selectedMonth}`,
                {
                  cache:
                    'no-store',

                  credentials:
                    'include',
                }
              ),
              fetch(
                `/api/holidays?year=${selectedYear}`,
                {
                  cache:
                    'no-store',

                  credentials:
                    'include',
                }
              ),
            ])

          if (holidayResponse.ok) {
            const holData = await holidayResponse.json()
            if (holData.success && Array.isArray(holData.holidays)) {
              const hSet = new Set<string>()
              for (const h of holData.holidays) {
                const d = normalizeDateOnly(h.date)
                if (d) {
                  hSet.add(d)
                }
              }
              setHolidayDates(hSet)
            }
          }

          const result =
            await response.json()

          if (
            !response.ok ||
            !result.success
          ) {
            throw new Error(
              result.error ||
                'Unable to load timesheets.'
            )
          }

          const source =
            Array.isArray(
              result.timesheets
            )
              ? result.timesheets
              : Array.isArray(
                  result.data
                )
              ? result.data
              : []

          setRows(
            source.map(
              mapTimesheet
            )
          )
        } catch (
          error: any
        ) {
          console.error(
            '[Timesheet Approvals]',
            error
          )

          toast.error(
            error?.message ||
              'Unable to load timesheets.'
          )

          setRows(
            []
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
      void loadTimesheets()
    },
    [loadTimesheets]
  )

  // ==========================================================
  // DERIVED
  // ==========================================================

  const filteredRows =
    useMemo(
      () => {
        const query =
          searchQuery
            .trim()
            .toLowerCase()

        return rows.filter(
          row => {
            const matchesSearch =
              !query ||
              row.employeeName
                .toLowerCase()
                .includes(
                  query
                ) ||
              row.employeeCode
                .toLowerCase()
                .includes(
                  query
                ) ||
              row.departmentName
                .toLowerCase()
                .includes(
                  query
                )

            if (
              !matchesSearch
            ) {
              return false
            }

            if (
              activeTab ===
              'ALL'
            ) {
              return true
            }

            if (
              activeTab ===
              'PENDING'
            ) {
              return [
                'SUBMITTED',
                'UNDER_REVIEW',
              ].includes(
                row.status
              )
            }

            if (
              activeTab ===
              'APPROVED'
            ) {
              return [
                'APPROVED',
                'LOCKED',
              ].includes(
                row.status
              )
            }

            if (
              activeTab ===
              'RETURNED'
            ) {
              return (
                row.status ===
                'RETURNED_FOR_CORRECTION'
              )
            }

            if (
              activeTab ===
              'REJECTED'
            ) {
              return (
                row.status ===
                'REJECTED'
              )
            }

            return true
          }
        )
      },
      [
        rows,
        activeTab,
        searchQuery,
      ]
    )

  const pendingCount =
    rows.filter(
      row =>
        [
          'SUBMITTED',
          'UNDER_REVIEW',
        ].includes(
          row.status
        )
    ).length

  const approvedCount =
    rows.filter(
      row =>
        [
          'APPROVED',
          'LOCKED',
        ].includes(
          row.status
        )
    ).length

  const returnedCount =
    rows.filter(
      row =>
        row.status ===
        'RETURNED_FOR_CORRECTION'
    ).length

  const rejectedCount =
    rows.filter(
      row =>
        row.status ===
        'REJECTED'
    ).length

  const verifiedHours =
    rows
      .filter(
        row =>
          [
            'APPROVED',
            'LOCKED',
          ].includes(
            row.status
          )
      )
      .reduce(
        (
          total,
          row
        ) =>
          total +
          row.totalHours,
        0
      )

  // ==========================================================
  // REVIEW
  // ==========================================================

  const openReview =
    (
      row: AdminTimesheet,
      action:
        ReviewAction
    ) => {
      setReviewTimesheet(
        row
      )

      setReviewAction(
        action
      )

      setComments(
        ''
      )
    }

  const closeReview =
    () => {
      if (
        reviewing
      ) {
        return
      }

      setReviewTimesheet(
        null
      )

      setReviewAction(
        null
      )

      setComments(
        ''
      )
    }

  const submitReview =
    async () => {
      if (
        !reviewTimesheet ||
        !reviewAction
      ) {
        return
      }

      const cleanComments =
        comments.trim()

      if (
        (
          reviewAction ===
            'RETURN_FOR_CORRECTION' ||
          reviewAction ===
            'REJECT'
        ) &&
        cleanComments.length <
          3
      ) {
        toast.error(
          reviewAction ===
            'RETURN_FOR_CORRECTION'
            ? 'Enter a correction reason for the employee.'
            : 'Enter a rejection reason.'
        )

        return
      }

      setReviewing(
        true
      )

      try {
        const response =
          await fetch(
            `/api/timesheets/${reviewTimesheet.id}/review`,
            {
              method:
                'POST',

              credentials:
                'include',

              headers: {
                'Content-Type':
                  'application/json',
              },

              body:
                JSON.stringify({
                  action:
                    reviewAction,

                  comments:
                    cleanComments,
                }),
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
              'Unable to review timesheet.'
          )
        }

        if (
          reviewAction ===
          'APPROVE'
        ) {
          toast.success(
            `${reviewTimesheet.employeeName}'s timesheet was approved.`
          )
        } else if (
          reviewAction ===
          'RETURN_FOR_CORRECTION'
        ) {
          toast.success(
            `Timesheet returned to ${reviewTimesheet.employeeName} for correction.`
          )
        } else {
          toast.success(
            `${reviewTimesheet.employeeName}'s timesheet was rejected.`
          )
        }

        closeReview()

        await loadTimesheets()
      } catch (
        error: any
      ) {
        toast.error(
          error?.message ||
            'Unable to review timesheet.'
        )
      } finally {
        setReviewing(
          false
        )
      }
    }

  // ==========================================================
  // RENDER
  // ==========================================================

  return (
    <div className="space-y-6">
      {/* =====================================================
          HEADER
          ===================================================== */}
      <div className="flex flex-col gap-4 border-b pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Timesheet Approvals
          </h1>

          <p className="mt-1 text-sm text-muted-foreground">
            Review monthly employee timesheets before payroll processing. Missing work-entry dates remain pending leave/absence until they are supported by leave, attendance, or corrected by the employee.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={String(selectedMonth)}
            onValueChange={(val) => setSelectedMonth(Number(val))}
          >
            <SelectTrigger className="h-9 w-[140px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTHS.map((month, index) => (
                <SelectItem key={month} value={String(index + 1)}>
                  {month}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={String(selectedYear)}
            onValueChange={(val) => setSelectedYear(Number(val))}
          >
            <SelectTrigger className="h-9 w-[100px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[selectedYear - 1, selectedYear, selectedYear + 1].map((year) => (
                <SelectItem key={year} value={String(year)}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              void loadTimesheets()
            }
            disabled={
              loading
            }
          >
            <RefreshCw
              className={cn(
                'mr-2 h-4 w-4',
                loading &&
                  'animate-spin'
              )}
            />

            Refresh
          </Button>
        </div>
      </div>

      {/* =====================================================
          SUMMARY
          ===================================================== */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <SummaryCard
          label="Pending Admin Review"
          value={
            pendingCount
          }
          icon={
            <Clock3 className="h-4 w-4 text-amber-600" />
          }
        />

        <SummaryCard
          label="Approved"
          value={
            approvedCount
          }
          icon={
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          }
        />

        <SummaryCard
          label="Returned"
          value={
            returnedCount
          }
          icon={
            <Undo2 className="h-4 w-4 text-orange-600" />
          }
        />

        <SummaryCard
          label="Rejected"
          value={
            rejectedCount
          }
          icon={
            <XCircle className="h-4 w-4 text-red-600" />
          }
        />

        <SummaryCard
          label="Verified Hours"
          value={`${verifiedHours.toFixed(
            1
          )} hrs`}
          icon={
            <ShieldCheck className="h-4 w-4 text-blue-600" />
          }
        />
      </div>

      {/* =====================================================
          FILTERS
          ===================================================== */}
      <div className="flex flex-col justify-between gap-3 rounded-xl border bg-card p-3 lg:flex-row lg:items-center">
        <Tabs
          value={
            activeTab
          }
          onValueChange={
            setActiveTab
          }
        >
          <TabsList className="h-auto flex-wrap">
            <TabsTrigger value="ALL">
              All ({rows.length})
            </TabsTrigger>

            <TabsTrigger value="PENDING">
              Pending ({pendingCount})
            </TabsTrigger>

            <TabsTrigger value="APPROVED">
              Approved ({approvedCount})
            </TabsTrigger>

            <TabsTrigger value="RETURNED">
              Returned ({returnedCount})
            </TabsTrigger>

            <TabsTrigger value="REJECTED">
              Rejected ({rejectedCount})
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="relative w-full lg:w-72">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />

          <input
            value={
              searchQuery
            }
            onChange={
              event =>
                setSearchQuery(
                  event.target.value
                )
            }
            placeholder="Search employee, ID, department..."
            className="h-9 w-full rounded-md border bg-background pl-9 pr-3 text-sm"
          />
        </div>
      </div>

      {/* =====================================================
          TABLE
          ===================================================== */}
      <div className="overflow-hidden rounded-xl border bg-card">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading timesheets...
          </div>
        ) : filteredRows.length ===
          0 ? (
          <div className="py-16 text-center">
            <FileCheck2 className="mx-auto h-9 w-9 text-muted-foreground/40" />

            <p className="mt-3 text-sm font-semibold">
              No timesheets found
            </p>

            <p className="mt-1 text-xs text-muted-foreground">
              There are no timesheets matching this period and filter.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] text-sm">
              <thead>
                <tr className="border-b bg-muted/30 text-left text-xs text-muted-foreground">
                  <th className="w-10 p-3"></th>

                  <th className="p-3 font-semibold">
                    Employee
                  </th>

                  <th className="p-3 font-semibold">
                    Department
                  </th>

                  <th className="p-3 text-right font-semibold">
                    Hours
                  </th>

                  <th className="p-3 text-right font-semibold">
                    Billable
                  </th>

                  <th className="p-3 text-center font-semibold">
                    Days Filled
                  </th>

                  <th className="p-3 text-center font-semibold">
                    Leaves (Paid / LOP)
                  </th>

                  <th className="p-3 text-center font-semibold">
                    Pending / Missing
                  </th>

                  <th className="p-3 text-center font-semibold">
                    Status
                  </th>

                  <th className="p-3 text-right font-semibold">
                    Review
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y">
                {filteredRows.map(
                  row => {
                    const expanded =
                      Boolean(
                        expandedRows[
                          row.id
                        ]
                      )

                    const daySummary =
                      getMissingDaySummary(
                        row,
                        holidayDates
                      )

                    const pendingReview =
                      [
                        'SUBMITTED',
                        'UNDER_REVIEW',
                      ].includes(
                        row.status
                      )

                    const approvedButReopenable =
                      row.status ===
                      'APPROVED'

                    const canReturnForCorrection =
                      pendingReview ||
                      approvedButReopenable

                    return (
                      <React.Fragment
                        key={
                          row.id
                        }
                      >
                        <tr className="hover:bg-muted/30">
                          <td className="p-3">
                            <button
                              onClick={() =>
                                setExpandedRows(
                                  previous => ({
                                    ...previous,
                                    [row.id]:
                                      !previous[
                                        row.id
                                      ],
                                  })
                                )
                              }
                              className="rounded p-1 text-muted-foreground hover:text-foreground"
                              title="View submitted timesheet"
                            >
                              {expanded ? (
                                <ChevronUp className="h-4 w-4" />
                              ) : (
                                <ChevronDown className="h-4 w-4" />
                              )}
                            </button>
                          </td>

                          <td className="p-3">
                            <div className="flex items-center gap-2.5">
                              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                                <UserRound className="h-4 w-4 text-muted-foreground" />
                              </div>

                              <div>
                                <div className="font-semibold">
                                  {row.employeeName}
                                </div>

                                <div className="font-mono text-[10px] text-muted-foreground">
                                  {row.employeeCode}
                                </div>
                              </div>
                            </div>
                          </td>

                          <td className="p-3 text-muted-foreground">
                            {row.departmentName}
                          </td>

                          <td className="p-3 text-right font-medium">
                            {row.totalHours.toFixed(
                              1
                            )}
                          </td>

                          <td className="p-3 text-right">
                            {row.billableHours.toFixed(
                              1
                            )}
                          </td>

                          <td className="p-3 text-center">
                            {daySummary.workedDates.length + daySummary.leaveDates.length}
                            {' / '}
                            {daySummary.expectedWorkingDates.length}
                          </td>

                          <td className="p-3 text-center">
                            {daySummary.leaveDates.length > 0 ? (
                              <div className="flex flex-col items-center">
                                <span className="font-semibold">{daySummary.leaveDates.length}</span>
                                <span className="text-[10px] text-muted-foreground">
                                  ({daySummary.paidLeaveDates.length} paid, {daySummary.unpaidLeaveDates.length} LOP)
                                </span>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>

                          <td className="p-3 text-center">
                            {daySummary.pendingDates.length >
                            0 ? (
                              <Badge
                                variant="outline"
                                className="border-amber-200 bg-amber-50 text-amber-800"
                              >
                                {daySummary.pendingDates.length} day
                                {daySummary.pendingDates.length ===
                                1
                                  ? ''
                                  : 's'}
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="border-emerald-200 bg-emerald-50 text-emerald-800"
                              >
                                None
                              </Badge>
                            )}
                          </td>

                          <td className="p-3 text-center">
                            <TimesheetStatusBadge
                              status={
                                row.status
                              }
                            />
                          </td>

                          <td className="p-3">
                            {pendingReview ? (
                              <div className="flex justify-end gap-1.5">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 border-orange-200 text-xs text-orange-700 hover:bg-orange-50"
                                  onClick={() =>
                                    openReview(
                                      row,
                                      'RETURN_FOR_CORRECTION'
                                    )
                                  }
                                >
                                  <RotateCcw className="mr-1 h-3.5 w-3.5" />
                                  Return
                                </Button>

                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 border-red-200 text-xs text-red-700 hover:bg-red-50"
                                  onClick={() =>
                                    openReview(
                                      row,
                                      'REJECT'
                                    )
                                  }
                                >
                                  <XCircle className="mr-1 h-3.5 w-3.5" />
                                  Reject
                                </Button>

                                <Button
                                  size="sm"
                                  className="h-8 bg-emerald-700 text-xs text-white hover:bg-emerald-800"
                                  onClick={() =>
                                    openReview(
                                      row,
                                      'APPROVE'
                                    )
                                  }
                                >
                                  <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                                  Approve
                                </Button>
                              </div>
                            ) : approvedButReopenable ? (
                              <div className="flex justify-end">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 border-orange-200 text-xs text-orange-700 hover:bg-orange-50"
                                  onClick={() =>
                                    openReview(
                                      row,
                                      'RETURN_FOR_CORRECTION'
                                    )
                                  }
                                >
                                  <RotateCcw className="mr-1 h-3.5 w-3.5" />
                                  Reopen for Correction
                                </Button>
                              </div>
                            ) : (
                              <div className="text-right text-xs text-muted-foreground">
                                {row.status ===
                                'LOCKED'
                                  ? 'Locked'
                                  : 'Reviewed'}
                              </div>
                            )}
                          </td>
                        </tr>

                        {/* =====================================
                            EXPANDED REVIEW
                            ===================================== */}
                        {expanded && (
                          <tr className="bg-muted/20">
                            <td
                              colSpan={
                                10
                              }
                              className="p-4"
                            >
                              <div className="space-y-4 rounded-xl border bg-background p-4">
                                <div className="flex flex-col gap-2 border-b pb-3 sm:flex-row sm:items-start sm:justify-between">
                                  <div>
                                    <h3 className="font-semibold">
                                      Review Timesheet — {row.employeeName}
                                    </h3>

                                    <p className="mt-1 text-xs text-muted-foreground">
                                      {formatDate(
                                        row.periodStart
                                      )}
                                      {' to '}
                                      {formatDate(
                                        row.periodEnd
                                      )}
                                    </p>
                                  </div>

                                  <TimesheetStatusBadge
                                    status={
                                      row.status
                                    }
                                  />
                                </div>

                                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
                                  <MiniMetric
                                    label="Total Hours"
                                    value={row.totalHours.toFixed(
                                      1
                                    )}
                                  />

                                  <MiniMetric
                                    label="Billable"
                                    value={row.billableHours.toFixed(
                                      1
                                    )}
                                  />

                                  <MiniMetric
                                    label="Worked Days"
                                    value={String(
                                      daySummary.workedDates.length
                                    )}
                                  />

                                  <MiniMetric
                                    label="Paid Leave"
                                    value={String(
                                      daySummary.paidLeaveDates.length
                                    )}
                                  />

                                  <MiniMetric
                                    label="Unpaid Leave (LOP)"
                                    value={String(
                                      daySummary.unpaidLeaveDates.length
                                    )}
                                    danger={
                                      daySummary.unpaidLeaveDates.length >
                                      0
                                    }
                                  />

                                  <MiniMetric
                                    label="Working Days"
                                    value={String(
                                      daySummary.expectedWorkingDates.length
                                    )}
                                  />
                                </div>

                                <div className="rounded-lg border border-primary/20 bg-primary/5 p-3.5 text-xs">
                                  <div className="font-semibold text-primary">
                                    Monthly Payroll & Working-Day Impact
                                  </div>
                                  <p className="mt-1 leading-relaxed text-foreground">
                                    Scheduled Working Days: <strong>{daySummary.expectedWorkingDates.length}</strong> | Worked: <strong>{daySummary.workedDates.length}</strong> | Paid Leave: <strong>{daySummary.paidLeaveDates.length}</strong> | Unpaid Leave / LOP: <strong>{daySummary.unpaidLeaveDates.length}</strong>
                                  </p>
                                  <p className="mt-1.5">
                                    {daySummary.unpaidLeaveDates.length > 0 ? (
                                      <span className="text-orange-700 dark:text-orange-400 font-medium">
                                        ⚠️ {daySummary.unpaidLeaveDates.length} day(s) Loss of Pay (LOP) will be deducted during monthly payroll calculation (Daily Rate × {daySummary.unpaidLeaveDates.length}).
                                      </span>
                                    ) : (
                                      <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                                        ✓ No salary deductions. All scheduled working days are covered by logged work or approved paid leave.
                                      </span>
                                    )}
                                  </p>
                                </div>

                                {daySummary.pendingDates.length >
                                  0 && (
                                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
                                    <div className="flex items-start gap-2">
                                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />

                                      <div>
                                        <p className="font-semibold">
                                          Pending Leave / Absence Review
                                        </p>

                                        <p className="mt-1 leading-relaxed">
                                          These dates contain no timesheet work entry. They are not automatically paid leave and are not automatically LOP. Check the employee&apos;s Leave module / attendance before approving. If the employee entered the month incorrectly, use <strong>Return for Correction</strong>.
                                        </p>

                                        <div className="mt-2 flex flex-wrap gap-1.5">
                                          {daySummary.pendingDates.map(
                                            date => (
                                              <Badge
                                                key={
                                                  date
                                                }
                                                variant="outline"
                                                className="border-amber-300 bg-white/70 text-[10px] text-amber-900 dark:bg-transparent dark:text-amber-200"
                                              >
                                                {formatDate(
                                                  date
                                                )}
                                              </Badge>
                                            )
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                )}

                                <div>
                                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                    Logged Work
                                  </h4>

                                  {row.entries.length ===
                                  0 ? (
                                    <div className="rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground">
                                      No work entries were submitted.
                                    </div>
                                  ) : (
                                    <div className="overflow-x-auto rounded-lg border">
                                      <table className="w-full min-w-[760px] text-xs">
                                        <thead>
                                          <tr className="border-b bg-muted/30 text-left">
                                            <th className="p-2.5">
                                              Date
                                            </th>

                                            <th className="p-2.5">
                                              Project
                                            </th>

                                            <th className="p-2.5">
                                              Category
                                            </th>

                                            <th className="p-2.5">
                                              Description
                                            </th>

                                            <th className="p-2.5 text-right">
                                              Hours
                                            </th>

                                            <th className="p-2.5 text-center">
                                              Billable
                                            </th>
                                          </tr>
                                        </thead>

                                        <tbody className="divide-y">
                                          {row.entries
                                            .slice()
                                            .sort(
                                              (
                                                a,
                                                b
                                              ) =>
                                                String(
                                                  a.entryDate ||
                                                    ''
                                                ).localeCompare(
                                                  String(
                                                    b.entryDate ||
                                                      ''
                                                  )
                                                )
                                            )
                                            .map(
                                              (
                                                entry,
                                                index
                                              ) => (
                                                <tr
                                                  key={
                                                    entry.id ||
                                                    `${entry.entryDate}-${index}`
                                                  }
                                                >
                                                  <td className="p-2.5 font-medium">
                                                    {formatDate(
                                                      entry.entryDate ||
                                                        ''
                                                    )}
                                                  </td>

                                                  <td className="p-2.5">
                                                    {entry.projectName ||
                                                      (entry.isLeave ? 'Leave' : 'Not specified')}
                                                  </td>

                                                  <td className="p-2.5">
                                                    {entry.isLeave ? (
                                                      <Badge
                                                        variant="outline"
                                                        className={
                                                          entry.isPaid === false
                                                            ? 'border-orange-300 bg-orange-50 text-orange-800'
                                                            : 'border-blue-300 bg-blue-50 text-blue-800'
                                                        }
                                                      >
                                                        Leave: {entry.leaveTypeName || 'Leave'} ({entry.isPaid === false ? 'Unpaid / LOP' : 'Paid'})
                                                      </Badge>
                                                    ) : (
                                                      entry.taskCategory ||
                                                        'Not specified'
                                                    )}
                                                  </td>

                                                  <td className="p-2.5 text-muted-foreground">
                                                    {entry.isLeave
                                                      ? (entry.leaveReason || entry.description || 'Leave recorded')
                                                      : (entry.description || '—')}
                                                  </td>

                                                  <td className="p-2.5 text-right font-semibold">
                                                    {Number(
                                                      entry.hours ||
                                                        0
                                                    ).toFixed(
                                                      1
                                                    )}
                                                  </td>

                                                  <td className="p-2.5 text-center">
                                                    {entry.isLeave
                                                      ? 'No'
                                                      : (entry.isBillable !== false ? 'Yes' : 'No')}
                                                  </td>
                                                </tr>
                                              )
                                            )}
                                        </tbody>
                                      </table>
                                    </div>
                                  )}
                                </div>

                                <div className="grid gap-3 border-t pt-3 sm:grid-cols-2">
                                  <div>
                                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                      Submitted
                                    </p>

                                    <p className="mt-1 text-xs">
                                      {formatDateTime(
                                        row.submittedAt
                                      )}
                                    </p>
                                  </div>

                                  <div>
                                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                      Previous Review Feedback
                                    </p>

                                    <p className="mt-1 text-xs">
                                      {row.returnedReason ||
                                        row.comments ||
                                        'None'}
                                    </p>
                                  </div>
                                </div>

                                {canReturnForCorrection && (
                                  <div className="flex flex-wrap justify-end gap-2 border-t pt-3">
                                    <Button
                                      variant="outline"
                                      className="border-orange-200 text-orange-700"
                                      onClick={() =>
                                        openReview(
                                          row,
                                          'RETURN_FOR_CORRECTION'
                                        )
                                      }
                                    >
                                      <RotateCcw className="mr-2 h-4 w-4" />
                                      Return for Correction
                                    </Button>

                                    {pendingReview && (
                                      <>
                                        <Button
                                          variant="outline"
                                          className="border-red-200 text-red-700"
                                          onClick={() =>
                                            openReview(
                                              row,
                                              'REJECT'
                                            )
                                          }
                                        >
                                          <XCircle className="mr-2 h-4 w-4" />
                                          Reject
                                        </Button>

                                        <Button
                                          className="bg-emerald-700 text-white hover:bg-emerald-800"
                                          onClick={() =>
                                            openReview(
                                              row,
                                              'APPROVE'
                                            )
                                          }
                                        >
                                          <CheckCircle2 className="mr-2 h-4 w-4" />
                                          Approve Timesheet
                                        </Button>
                                      </>
                                    )}
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  }
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* =====================================================
          REVIEW DIALOG
          ===================================================== */}
      <Dialog
        open={
          Boolean(
            reviewTimesheet &&
              reviewAction
          )
        }
        onOpenChange={
          open => {
            if (!open) {
              closeReview()
            }
          }
        }
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {reviewAction ===
              'APPROVE'
                ? 'Approve Timesheet'
                : reviewAction ===
                  'RETURN_FOR_CORRECTION'
                ? reviewTimesheet?.status ===
                    'APPROVED'
                  ? 'Reopen Approved Timesheet for Correction'
                  : 'Return Timesheet for Correction'
                : 'Reject Timesheet'}
            </DialogTitle>

            <DialogDescription>
              {reviewTimesheet
                ? `${reviewTimesheet.employeeName} (${reviewTimesheet.employeeCode}) — ${MONTHS[reviewTimesheet.month - 1]} ${reviewTimesheet.year}`
                : ''}
            </DialogDescription>
          </DialogHeader>

          {reviewTimesheet &&
            (() => {
              const summary =
                getMissingDaySummary(
                  reviewTimesheet
                )

              return (
                <div className="space-y-4">
                  {summary.pendingDates.length >
                    0 && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
                      <p className="font-semibold">
                        {summary.pendingDates.length} pending leave / absence day
                        {summary.pendingDates.length ===
                        1
                          ? ''
                          : 's'}
                      </p>

                      <p className="mt-1">
                        These are missing timesheet work dates. Before approval, verify whether they are covered by approved leave or attendance. Do not assume paid leave or LOP automatically.
                      </p>
                    </div>
                  )}

                  {reviewAction ===
                    'APPROVE' && (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-200">
                      Approval makes this monthly timesheet eligible for the payroll workflow. Payroll will still independently validate approved leave, LOP, holidays and attendance.
                    </div>
                  )}

                  {reviewAction ===
                    'RETURN_FOR_CORRECTION' && (
                    <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 text-xs text-orange-900 dark:border-orange-900 dark:bg-orange-950/20 dark:text-orange-200">
                      {reviewTimesheet.status ===
                      'APPROVED'
                        ? 'This approved timesheet will be reopened and moved to Returned for Correction. Payroll eligibility will be removed until the employee corrects and resubmits the month.'
                        : 'The employee will be able to edit this month again and resubmit it. Explain exactly what must be corrected.'}
                    </div>
                  )}

                  {reviewAction ===
                    'REJECT' && (
                    <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-900 dark:border-red-900 dark:bg-red-950/20 dark:text-red-200">
                      Rejected timesheets are not payroll eligible. Use Return for Correction instead when the employee should fix and resubmit the month.
                    </div>
                  )}

                  <div className="space-y-2">
                    <label
                      htmlFor="review-comments"
                      className="text-xs font-semibold"
                    >
                      {reviewAction ===
                      'APPROVE'
                        ? 'Admin comments (optional)'
                        : reviewAction ===
                          'RETURN_FOR_CORRECTION'
                        ? 'Correction reason (required)'
                        : 'Rejection reason (required)'}
                    </label>

                    <textarea
                      id="review-comments"
                      rows={
                        5
                      }
                      value={
                        comments
                      }
                      onChange={
                        event =>
                          setComments(
                            event.target.value
                          )
                      }
                      placeholder={
                        reviewAction ===
                        'RETURN_FOR_CORRECTION'
                          ? 'Example: 21 working dates have no work entry. Please correct the timesheet and/or apply the appropriate leave, then resubmit.'
                          : reviewAction ===
                            'REJECT'
                          ? 'Explain why this timesheet is being rejected.'
                          : 'Optional approval note.'
                      }
                      className="w-full resize-none rounded-md border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                </div>
              )
            })()}

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={
                closeReview
              }
              disabled={
                reviewing
              }
            >
              Cancel
            </Button>

            <Button
              onClick={() =>
                void submitReview()
              }
              disabled={
                reviewing
              }
              className={cn(
                reviewAction ===
                  'APPROVE' &&
                  'bg-emerald-700 text-white hover:bg-emerald-800',

                reviewAction ===
                  'RETURN_FOR_CORRECTION' &&
                  'bg-orange-600 text-white hover:bg-orange-700',

                reviewAction ===
                  'REJECT' &&
                  'bg-red-700 text-white hover:bg-red-800'
              )}
            >
              {reviewing && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}

              {reviewAction ===
              'APPROVE'
                ? 'Approve'
                : reviewAction ===
                  'RETURN_FOR_CORRECTION'
                ? reviewTimesheet?.status ===
                    'APPROVED'
                  ? 'Reopen for Correction'
                  : 'Return for Correction'
                : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ============================================================
// SMALL COMPONENTS
// ============================================================

function SummaryCard({
  label,
  value,
  icon,
}: {
  label: string
  value:
    React.ReactNode
  icon:
    React.ReactNode
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {label}
          </p>

          {icon}
        </div>

        <div className="mt-2 text-xl font-bold">
          {value}
        </div>
      </CardContent>
    </Card>
  )
}

function MiniMetric({
  label,
  value,
  danger = false,
}: {
  label: string
  value: string
  danger?: boolean
}) {
  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>

      <p
        className={cn(
          'mt-1 text-lg font-bold',

          danger &&
            'text-red-600'
        )}
      >
        {value}
      </p>
    </div>
  )
}
