'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'

import {
  Check,
  CheckCircle2,
  CheckSquare,
  Clock3,
  FileClock,
  Loader2,
  RefreshCw,
  RotateCcw,
  X,
} from 'lucide-react'

import { toast } from 'sonner'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/shared/empty-state'
import { PageHeader } from '@/components/shared/page-header'
import {
  Card,
  CardContent,
} from '@/components/ui/card'

type ApprovalTab =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'all'

type ApprovalStatus =
  | 'Pending'
  | 'Approved'
  | 'Rejected'
  | 'Returned'
  | 'Locked'

type ApprovalSource =
  | 'leave'
  | 'timesheet'

interface ApprovalItem {
  id: string
  source: ApprovalSource
  type: string
  details: string
  requester: string
  requesterCode?: string
  department?: string
  date: string
  rawDate?: string
  status: ApprovalStatus
  metadata?: Record<string, unknown>
}

interface LeaveRequestApi {
  id: string
  employee_id?: string
  leave_type?: string
  leave_type_code?: string
  start_date?: string
  end_date?: string
  total_days?: number
  days?: number
  reason?: string
  status?: string
  applied_at?: string
  created_at?: string
  employee_name?: string
  employee_code?: string
  department?: string

  employee?: {
    id?: string
    name?: string
    code?: string
    department?: string
  } | null
}

interface TimesheetApi {
  id: string
  status?: string

  year?: number
  month?: number

  period_year?: number
  period_month?: number

  submitted_at?: string
  created_at?: string
  updated_at?: string

  employee_id?: string
  employee_name?: string
  employee_code?: string
  department?: string
  department_name?: string

  total_hours?: number
  working_hours?: number
  hours?: number

  employee?: {
    id?: string
    name?: string
    full_name?: string
    code?: string
    employee_code?: string
    department?: string
  } | null

  employees?: {
    id?: string
    full_name?: string
    employee_code?: string
    departments?: {
      name?: string
    } | null
  } | null
}

interface ActionDialogState {
  item: ApprovalItem
  action:
    | 'reject'
    | 'return'
}

const IST_TIME_ZONE =
  'Asia/Kolkata'

function normalizeStatus(
  value?: string
): ApprovalStatus {
  const status =
    String(value || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_')

  if (
    status === 'approved'
  ) {
    return 'Approved'
  }

  if (
    status === 'rejected'
  ) {
    return 'Rejected'
  }

  if (
    status === 'returned' ||
    status ===
      'returned_for_correction' ||
    status ===
      'return_for_correction'
  ) {
    return 'Returned'
  }

  if (
    status === 'locked'
  ) {
    return 'Locked'
  }

  return 'Pending'
}

function formatIstDateTime(
  value?: string
): string {
  if (!value) {
    return 'Not available'
  }

  const date =
    new Date(value)

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return value
  }

  return new Intl.DateTimeFormat(
    'en-IN',
    {
      timeZone:
        IST_TIME_ZONE,
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }
  ).format(date)
}

function formatDateOnly(
  value?: string
): string {
  if (!value) {
    return 'Not available'
  }

  /*
   * DATE columns such as leave start_date/end_date
   * must not be timezone-shifted.
   */
  const parts =
    value
      .slice(0, 10)
      .split('-')

  if (
    parts.length !== 3
  ) {
    return value
  }

  const [
    year,
    month,
    day,
  ] = parts

  const date =
    new Date(
      Number(year),
      Number(month) - 1,
      Number(day)
    )

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return value
  }

  return new Intl.DateTimeFormat(
    'en-IN',
    {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }
  ).format(date)
}

function getMonthName(
  month?: number
): string {
  if (
    !month ||
    month < 1 ||
    month > 12
  ) {
    return 'Month'
  }

  return new Intl.DateTimeFormat(
    'en-IN',
    {
      month: 'long',
    }
  ).format(
    new Date(
      2026,
      month - 1,
      1
    )
  )
}

function escapeText(
  value: unknown
): string {
  if (
    value === null ||
    value === undefined
  ) {
    return ''
  }

  return String(value)
}

function getStatusBadgeClass(
  status: ApprovalStatus
): string {
  switch (status) {
    case 'Approved':
      return [
        'border-emerald-200',
        'bg-emerald-100',
        'text-emerald-800',
        'dark:border-emerald-900',
        'dark:bg-emerald-950',
        'dark:text-emerald-300',
      ].join(' ')

    case 'Rejected':
      return [
        'border-red-200',
        'bg-red-100',
        'text-red-800',
        'dark:border-red-900',
        'dark:bg-red-950',
        'dark:text-red-300',
      ].join(' ')

    case 'Returned':
      return [
        'border-orange-200',
        'bg-orange-100',
        'text-orange-800',
        'dark:border-orange-900',
        'dark:bg-orange-950',
        'dark:text-orange-300',
      ].join(' ')

    case 'Locked':
      return [
        'border-blue-200',
        'bg-blue-100',
        'text-blue-800',
        'dark:border-blue-900',
        'dark:bg-blue-950',
        'dark:text-blue-300',
      ].join(' ')

    default:
      return [
        'border-amber-200',
        'bg-amber-100',
        'text-amber-800',
        'dark:border-amber-900',
        'dark:bg-amber-950',
        'dark:text-amber-300',
      ].join(' ')
  }
}

function isPendingTimesheet(
  status?: string
): boolean {
  const normalized =
    String(status || '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '_')

  return [
    'SUBMITTED',
    'UNDER_REVIEW',
    'PENDING',
    'PENDING_APPROVAL',
    'APPROVAL_PENDING',
  ].includes(normalized)
}

function mapLeaveRequest(
  request: LeaveRequestApi
): ApprovalItem {
  const days =
    Number(
      request.total_days ??
        request.days ??
        0
    )

  const employeeName =
    request.employee_name ||
    request.employee?.name ||
    'Employee'

  const employeeCode =
    request.employee_code ||
    request.employee?.code ||
    ''

  const department =
    request.department ||
    request.employee?.department ||
    ''

  const leaveType =
    request.leave_type ||
    request.leave_type_code ||
    'Leave'

  const period =
    request.start_date ===
    request.end_date
      ? formatDateOnly(
          request.start_date
        )
      : `${formatDateOnly(
          request.start_date
        )} – ${formatDateOnly(
          request.end_date
        )}`

  const reason =
    request.reason?.trim()

  const detailParts = [
    `${leaveType} • ${days || 0} ${
      days === 1
        ? 'day'
        : 'days'
    }`,
    period,
  ]

  if (reason) {
    detailParts.push(
      `Reason: ${reason}`
    )
  }

  return {
    id:
      request.id,

    source:
      'leave',

    type:
      'Leave Request',

    details:
      detailParts.join(
        ' • '
      ),

    requester:
      employeeName,

    requesterCode:
      employeeCode,

    department,

    date:
      formatIstDateTime(
        request.applied_at ||
          request.created_at
      ),

    rawDate:
      request.applied_at ||
      request.created_at,

    status:
      normalizeStatus(
        request.status
      ),

    metadata: {
      employeeId:
        request.employee_id,

      leaveType,

      startDate:
        request.start_date,

      endDate:
        request.end_date,

      days,

      reason:
        request.reason || '',
    },
  }
}

function mapTimesheet(
  timesheet: TimesheetApi
): ApprovalItem {
  const employeeName =
    timesheet.employee_name ||
    timesheet.employee?.name ||
    timesheet.employee?.full_name ||
    timesheet.employees?.full_name ||
    'Employee'

  const employeeCode =
    timesheet.employee_code ||
    timesheet.employee?.code ||
    timesheet.employee?.employee_code ||
    timesheet.employees?.employee_code ||
    ''

  const department =
    timesheet.department ||
    timesheet.department_name ||
    timesheet.employee?.department ||
    timesheet.employees
      ?.departments?.name ||
    ''

  const month =
    Number(
      timesheet.month ??
        timesheet.period_month ??
        0
    )

  const year =
    Number(
      timesheet.year ??
        timesheet.period_year ??
        0
    )

  const totalHours =
    Number(
      timesheet.total_hours ??
        timesheet.working_hours ??
        timesheet.hours ??
        0
    )

  const details: string[] =
    []

  if (
    month &&
    year
  ) {
    details.push(
      `${getMonthName(
        month
      )} ${year}`
    )
  } else if (year) {
    details.push(
      String(year)
    )
  } else {
    details.push(
      'Monthly timesheet'
    )
  }

  if (
    Number.isFinite(
      totalHours
    ) &&
    totalHours > 0
  ) {
    details.push(
      `${totalHours} hours`
    )
  }

  return {
    id:
      timesheet.id,

    source:
      'timesheet',

    type:
      'Timesheet',

    details:
      details.join(
        ' • '
      ),

    requester:
      employeeName,

    requesterCode:
      employeeCode,

    department,

    date:
      formatIstDateTime(
        timesheet.submitted_at ||
          timesheet.updated_at ||
          timesheet.created_at
      ),

    rawDate:
      timesheet.submitted_at ||
      timesheet.updated_at ||
      timesheet.created_at,

    status:
      normalizeStatus(
        timesheet.status
      ),

    metadata: {
      employeeId:
        timesheet.employee_id,

      month,

      year,

      rawStatus:
        timesheet.status || '',
    },
  }
}

export default function ApprovalsPage() {
  const [
    approvals,
    setApprovals,
  ] =
    useState<
      ApprovalItem[]
    >([])

  const [
    activeTab,
    setActiveTab,
  ] =
    useState<ApprovalTab>(
      'pending'
    )

  const [
    loading,
    setLoading,
  ] =
    useState(true)

  const [
    refreshing,
    setRefreshing,
  ] =
    useState(false)

  const [
    processingId,
    setProcessingId,
  ] =
    useState<
      string | null
    >(null)

  const [
    actionDialog,
    setActionDialog,
  ] =
    useState<
      ActionDialogState | null
    >(null)

  const [
    actionComments,
    setActionComments,
  ] =
    useState('')

  const loadApprovals =
    useCallback(
      async (
        showRefreshToast =
          false
      ) => {
        try {
          if (
            showRefreshToast
          ) {
            setRefreshing(
              true
            )
          } else {
            setLoading(
              true
            )
          }

          /*
           * Load the actual business workflows.
           *
           * Leave:
           * GET /api/leave
           *
           * Timesheets:
           * GET /api/timesheets?view=admin
           *
           * We intentionally do NOT use approval_requests
           * as a fake intermediary because the existing
           * employee workflows do not populate that table.
           */
          const [
            leaveResponse,
            timesheetResponse,
          ] =
            await Promise.all([
              fetch(
                '/api/leave',
                {
                  cache:
                    'no-store',
                }
              ),

              fetch(
                '/api/timesheets?view=admin&status=all',
                {
                  cache:
                    'no-store',
                }
              ),
            ])

          const [
            leavePayload,
            timesheetPayload,
          ] =
            await Promise.all([
              leaveResponse.json(),
              timesheetResponse.json(),
            ])

          if (
            !leaveResponse.ok ||
            !leavePayload.success
          ) {
            throw new Error(
              leavePayload.error ||
                'Unable to load leave requests.'
            )
          }

          if (
            !timesheetResponse.ok ||
            !timesheetPayload.success
          ) {
            throw new Error(
              timesheetPayload.error ||
                'Unable to load timesheets.'
            )
          }

          const leaveRows:
            LeaveRequestApi[] =
              Array.isArray(
                leavePayload.requests
              )
                ? leavePayload.requests
                : Array.isArray(
                      leavePayload.data
                    )
                  ? leavePayload.data
                  : []

          const timesheetRows:
            TimesheetApi[] =
              Array.isArray(
                timesheetPayload.timesheets
              )
                ? timesheetPayload.timesheets
                : Array.isArray(
                      timesheetPayload.data
                    )
                  ? timesheetPayload.data
                  : []

          const mappedLeaves =
            leaveRows.map(
              mapLeaveRequest
            )

          const mappedTimesheets =
            timesheetRows.map(
              mapTimesheet
            )

          const combined = [
            ...mappedLeaves,
            ...mappedTimesheets,
          ].sort(
            (
              a,
              b
            ) => {
              const aTime =
                a.rawDate
                  ? new Date(
                      a.rawDate
                    ).getTime()
                  : 0

              const bTime =
                b.rawDate
                  ? new Date(
                      b.rawDate
                    ).getTime()
                  : 0

              return (
                bTime -
                aTime
              )
            }
          )

          setApprovals(
            combined
          )

          if (
            showRefreshToast
          ) {
            toast.success(
              'Approval queue refreshed.'
            )
          }
        } catch (
          error: unknown
        ) {
          console.error(
            'Unable to load approvals:',
            error
          )

          toast.error(
            error instanceof
              Error
              ? error.message
              : 'Unable to load approval queue.'
          )
        } finally {
          setLoading(
            false
          )

          setRefreshing(
            false
          )
        }
      },
      []
    )

  useEffect(() => {
    void loadApprovals()
  }, [loadApprovals])

  const counts =
    useMemo(() => {
      return {
        pending:
          approvals.filter(
            (item) =>
              item.status ===
              'Pending'
          ).length,

        approved:
          approvals.filter(
            (item) =>
              item.status ===
                'Approved' ||
              item.status ===
                'Locked'
          ).length,

        rejected:
          approvals.filter(
            (item) =>
              item.status ===
                'Rejected' ||
              item.status ===
                'Returned'
          ).length,

        all:
          approvals.length,
      }
    }, [approvals])

  const filteredApprovals =
    useMemo(() => {
      if (
        activeTab === 'all'
      ) {
        return approvals
      }

      if (
        activeTab ===
        'pending'
      ) {
        return approvals.filter(
          (item) =>
            item.status ===
            'Pending'
        )
      }

      if (
        activeTab ===
        'approved'
      ) {
        return approvals.filter(
          (item) =>
            item.status ===
              'Approved' ||
            item.status ===
              'Locked'
        )
      }

      return approvals.filter(
        (item) =>
          item.status ===
            'Rejected' ||
          item.status ===
            'Returned'
      )
    }, [
      approvals,
      activeTab,
    ])

  const updateLeave =
    async (
      item: ApprovalItem,
      status:
        | 'approved'
        | 'rejected',
      reason = ''
    ) => {
      const response =
        await fetch(
          '/api/leave',
          {
            method:
              'PUT',

            headers: {
              'Content-Type':
                'application/json',
            },

            body:
              JSON.stringify({
                id:
                  item.id,

                status,

                rejection_reason:
                  status ===
                  'rejected'
                    ? reason
                    : undefined,
              }),
          }
        )

      const payload =
        await response.json()

      if (
        !response.ok ||
        !payload.success
      ) {
        throw new Error(
          payload.error ||
            'Unable to update leave request.'
        )
      }

      return payload
    }

  const reviewTimesheet =
    async (
      item: ApprovalItem,
      action:
        | 'APPROVE'
        | 'REJECT'
        | 'RETURN_FOR_CORRECTION',
      comments = ''
    ) => {
      const response =
        await fetch(
          `/api/timesheets/${encodeURIComponent(
            item.id
          )}/review`,
          {
            method:
              'POST',

            headers: {
              'Content-Type':
                'application/json',
            },

            body:
              JSON.stringify({
                action,
                comments,
              }),
          }
        )

      const payload =
        await response.json()

      if (
        !response.ok ||
        !payload.success
      ) {
        throw new Error(
          payload.error ||
            'Unable to review timesheet.'
        )
      }

      return payload
    }

  const handleApprove =
    async (
      item: ApprovalItem
    ) => {
      try {
        setProcessingId(
          item.id
        )

        if (
          item.source ===
          'leave'
        ) {
          await updateLeave(
            item,
            'approved'
          )
        } else {
          await reviewTimesheet(
            item,
            'APPROVE'
          )
        }

        toast.success(
          item.source ===
            'leave'
            ? 'Leave request approved successfully.'
            : 'Timesheet approved successfully.'
        )

        await loadApprovals()
      } catch (
        error: unknown
      ) {
        toast.error(
          error instanceof
            Error
            ? error.message
            : 'Approval failed.'
        )
      } finally {
        setProcessingId(
          null
        )
      }
    }

  const openRejectDialog =
    (
      item: ApprovalItem
    ) => {
      setActionComments(
        ''
      )

      setActionDialog({
        item,
        action:
          'reject',
      })
    }

  const openReturnDialog =
    (
      item: ApprovalItem
    ) => {
      setActionComments(
        ''
      )

      setActionDialog({
        item,
        action:
          'return',
      })
    }

  const closeActionDialog =
    () => {
      if (processingId) {
        return
      }

      setActionDialog(
        null
      )

      setActionComments(
        ''
      )
    }

  const confirmAction =
    async () => {
      if (
        !actionDialog
      ) {
        return
      }

      const {
        item,
        action,
      } = actionDialog

      const comments =
        actionComments.trim()

      /*
       * The timesheet review API requires at least
       * 3 characters for REJECT and RETURN_FOR_CORRECTION.
       *
       * Leave rejection also benefits from keeping an
       * explicit reason for the employee/audit trail.
       */
      if (
        comments.length < 3
      ) {
        toast.error(
          'Please enter a clear reason of at least 3 characters.'
        )

        return
      }

      try {
        setProcessingId(
          item.id
        )

        if (
          item.source ===
          'leave'
        ) {
          if (
            action ===
            'return'
          ) {
            throw new Error(
              'Return for correction is available only for timesheets.'
            )
          }

          await updateLeave(
            item,
            'rejected',
            comments
          )

          toast.success(
            'Leave request rejected successfully.'
          )
        } else {
          if (
            action ===
            'return'
          ) {
            await reviewTimesheet(
              item,
              'RETURN_FOR_CORRECTION',
              comments
            )

            toast.success(
              'Timesheet returned for correction.'
            )
          } else {
            await reviewTimesheet(
              item,
              'REJECT',
              comments
            )

            toast.success(
              'Timesheet rejected successfully.'
            )
          }
        }

        setActionDialog(
          null
        )

        setActionComments(
          ''
        )

        await loadApprovals()
      } catch (
        error: unknown
      ) {
        toast.error(
          error instanceof
            Error
            ? error.message
            : 'Unable to process request.'
        )
      } finally {
        setProcessingId(
          null
        )
      }
    }

  const tabs: Array<{
    key: ApprovalTab
    label: string
    count: number
  }> = [
    {
      key: 'pending',
      label: 'Pending',
      count:
        counts.pending,
    },
    {
      key: 'approved',
      label: 'Approved',
      count:
        counts.approved,
    },
    {
      key: 'rejected',
      label:
        'Rejected / Returned',
      count:
        counts.rejected,
    },
    {
      key: 'all',
      label: 'All',
      count:
        counts.all,
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <PageHeader
          title="Authorization & Approvals Queue"
          description="Review employee leave requests and submitted timesheets from one live authorization queue."
        />

        <Button
          variant="outline"
          size="sm"
          className="h-9 w-fit text-xs"
          disabled={
            refreshing ||
            loading
          }
          onClick={() =>
            void loadApprovals(
              true
            )
          }
        >
          {refreshing ? (
            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-3.5 w-3.5" />
          )}

          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-xl bg-amber-100 p-2.5 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
              <Clock3 className="h-4 w-4" />
            </div>

            <div>
              <p className="text-[11px] font-medium text-muted-foreground">
                Pending
              </p>

              <p className="text-xl font-bold">
                {counts.pending}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-xl bg-emerald-100 p-2.5 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              <CheckCircle2 className="h-4 w-4" />
            </div>

            <div>
              <p className="text-[11px] font-medium text-muted-foreground">
                Approved
              </p>

              <p className="text-xl font-bold">
                {counts.approved}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-xl bg-red-100 p-2.5 text-red-700 dark:bg-red-950 dark:text-red-300">
              <X className="h-4 w-4" />
            </div>

            <div>
              <p className="text-[11px] font-medium text-muted-foreground">
                Rejected / Returned
              </p>

              <p className="text-xl font-bold">
                {counts.rejected}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-xl bg-blue-100 p-2.5 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
              <CheckSquare className="h-4 w-4" />
            </div>

            <div>
              <p className="text-[11px] font-medium text-muted-foreground">
                Total
              </p>

              <p className="text-xl font-bold">
                {counts.all}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="border-b bg-muted/20 px-4">
          <nav
            className="flex gap-5 overflow-x-auto text-xs"
            aria-label="Approval tabs"
          >
            {tabs.map(
              (tab) => (
                <button
                  key={
                    tab.key
                  }
                  type="button"
                  onClick={() =>
                    setActiveTab(
                      tab.key
                    )
                  }
                  className={cn(
                    'flex shrink-0 items-center gap-1.5 border-b-2 px-1 py-3 font-medium transition-colors',

                    activeTab ===
                      tab.key
                      ? 'border-[#1e2a78] font-bold text-[#1e2a78] dark:border-blue-400 dark:text-blue-400'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  )}
                >
                  {
                    tab.label
                  }

                  <Badge
                    variant="secondary"
                    className="h-5 min-w-5 justify-center px-1.5 text-[10px]"
                  >
                    {
                      tab.count
                    }
                  </Badge>
                </button>
              )
            )}
          </nav>
        </div>

        <CardContent className="p-0">
          {loading ? (
            <div className="flex min-h-[280px] flex-col items-center justify-center gap-3">
              <Loader2 className="h-7 w-7 animate-spin text-[#1e2a78]" />

              <p className="text-xs text-muted-foreground">
                Loading live approval queue...
              </p>
            </div>
          ) : filteredApprovals.length ===
            0 ? (
            <div className="p-6">
              <EmptyState
                icon={
                  CheckSquare
                }
                title={
                  activeTab ===
                  'pending'
                    ? 'No approvals are currently pending.'
                    : activeTab ===
                        'approved'
                      ? 'No approved requests found.'
                      : activeTab ===
                          'rejected'
                        ? 'No rejected or returned requests found.'
                        : 'No approval records found.'
                }
                description={
                  activeTab ===
                  'pending'
                    ? 'Submitted leave requests and timesheets requiring administrator action will appear here.'
                    : 'Approval history for the selected status will appear here.'
                }
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1050px] text-left text-xs">
                <thead className="border-b bg-muted/50 text-[10px] font-semibold uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">
                      Request
                    </th>

                    <th className="px-4 py-3">
                      Details
                    </th>

                    <th className="px-4 py-3">
                      Requested By
                    </th>

                    <th className="px-4 py-3">
                      Department
                    </th>

                    <th className="px-4 py-3">
                      Submitted
                    </th>

                    <th className="px-4 py-3">
                      Status
                    </th>

                    <th className="px-4 py-3 text-right">
                      Actions
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-border">
                  {filteredApprovals.map(
                    (item) => {
                      const isProcessing =
                        processingId ===
                        item.id

                      return (
                        <tr
                          key={`${item.source}-${item.id}`}
                          className="transition-colors hover:bg-muted/30"
                        >
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-2">
                              <div
                                className={cn(
                                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',

                                  item.source ===
                                    'leave'
                                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                                    : 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                                )}
                              >
                                {item.source ===
                                'leave' ? (
                                  <CheckSquare className="h-4 w-4" />
                                ) : (
                                  <FileClock className="h-4 w-4" />
                                )}
                              </div>

                              <div>
                                <p className="font-semibold text-foreground">
                                  {
                                    item.type
                                  }
                                </p>

                                <p className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                                  {item.source ===
                                  'leave'
                                    ? 'Leave workflow'
                                    : 'Timesheet workflow'}
                                </p>
                              </div>
                            </div>
                          </td>

                          <td className="max-w-[340px] px-4 py-4">
                            <p className="leading-relaxed text-foreground">
                              {
                                item.details
                              }
                            </p>
                          </td>

                          <td className="px-4 py-4">
                            <p className="font-semibold text-foreground">
                              {
                                item.requester
                              }
                            </p>

                            {item.requesterCode && (
                              <p className="mt-0.5 font-mono text-[10px] text-blue-700 dark:text-blue-400">
                                {
                                  item.requesterCode
                                }
                              </p>
                            )}
                          </td>

                          <td className="px-4 py-4 text-muted-foreground">
                            {item.department ||
                              'Not assigned'}
                          </td>

                          <td className="whitespace-nowrap px-4 py-4 text-muted-foreground">
                            {
                              item.date
                            }
                          </td>

                          <td className="px-4 py-4">
                            <Badge
                              variant="outline"
                              className={cn(
                                'text-[10px] font-semibold',

                                getStatusBadgeClass(
                                  item.status
                                )
                              )}
                            >
                              {
                                item.status
                              }
                            </Badge>
                          </td>

                          <td className="px-4 py-4 text-right">
                            {item.status ===
                            'Pending' ? (
                              <div className="flex items-center justify-end gap-2">
                                {item.source ===
                                  'timesheet' && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-8 text-[11px] text-orange-700 hover:bg-orange-50 dark:text-orange-300 dark:hover:bg-orange-950"
                                    disabled={
                                      isProcessing
                                    }
                                    onClick={() =>
                                      openReturnDialog(
                                        item
                                      )
                                    }
                                  >
                                    <RotateCcw className="mr-1 h-3.5 w-3.5" />
                                    Return
                                  </Button>
                                )}

                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 text-[11px] text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950"
                                  disabled={
                                    isProcessing
                                  }
                                  onClick={() =>
                                    void handleApprove(
                                      item
                                    )
                                  }
                                >
                                  {isProcessing ? (
                                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Check className="mr-1 h-3.5 w-3.5" />
                                  )}

                                  Approve
                                </Button>

                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 text-[11px] text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950"
                                  disabled={
                                    isProcessing
                                  }
                                  onClick={() =>
                                    openRejectDialog(
                                      item
                                    )
                                  }
                                >
                                  <X className="mr-1 h-3.5 w-3.5" />
                                  Reject
                                </Button>
                              </div>
                            ) : (
                              <span className="text-[11px] text-muted-foreground">
                                No action required
                              </span>
                            )}
                          </td>
                        </tr>
                      )
                    }
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="rounded-xl border bg-muted/20 px-4 py-3">
        <div className="flex items-start gap-2">
          <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />

          <div className="text-[11px] leading-relaxed text-muted-foreground">
            <span className="font-semibold text-foreground">
              Live workflow queue.
            </span>{' '}
            Leave requests are read directly from the leave workflow and
            timesheets are read directly from the timesheet workflow.
            Displayed timestamps use India Standard Time (Asia/Kolkata).
          </div>
        </div>
      </div>

      {actionDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg rounded-2xl border bg-background p-5 shadow-2xl">
            <div className="space-y-1">
              <h2 className="text-base font-bold text-foreground">
                {actionDialog.action ===
                'return'
                  ? 'Return Timesheet for Correction'
                  : `Reject ${actionDialog.item.type}`}
              </h2>

              <p className="text-xs leading-relaxed text-muted-foreground">
                {actionDialog.action ===
                'return'
                  ? 'Explain what the employee must correct before resubmitting the timesheet.'
                  : 'Provide a clear reason. This reason will be stored with the workflow record.'}
              </p>
            </div>

            <div className="mt-4 rounded-xl border bg-muted/20 p-3">
              <p className="text-xs font-semibold">
                {
                  actionDialog.item.requester
                }

                {actionDialog.item.requesterCode
                  ? ` (${actionDialog.item.requesterCode})`
                  : ''}
              </p>

              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                {
                  actionDialog.item.details
                }
              </p>
            </div>

            <div className="mt-4">
              <label
                htmlFor="approval-comments"
                className="mb-1.5 block text-xs font-semibold text-foreground"
              >
                Reason
              </label>

              <textarea
                id="approval-comments"
                value={
                  actionComments
                }
                onChange={(
                  event
                ) =>
                  setActionComments(
                    event.target
                      .value
                  )
                }
                placeholder={
                  actionDialog.action ===
                  'return'
                    ? 'Example: Please correct the missing hours for 15 September and resubmit.'
                    : 'Enter rejection reason...'
                }
                rows={4}
                disabled={
                  Boolean(
                    processingId
                  )
                }
                className="w-full resize-none rounded-xl border bg-background px-3 py-2.5 text-xs outline-none transition focus:border-[#1e2a78] focus:ring-2 focus:ring-[#1e2a78]/10 disabled:opacity-60"
              />

              <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                <span>
                  Minimum 3 characters
                </span>

                <span>
                  {
                    actionComments.trim()
                      .length
                  }{' '}
                  characters
                </span>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={
                  Boolean(
                    processingId
                  )
                }
                onClick={
                  closeActionDialog
                }
              >
                Cancel
              </Button>

              <Button
                size="sm"
                disabled={
                  Boolean(
                    processingId
                  ) ||
                  actionComments.trim()
                    .length < 3
                }
                className={
                  actionDialog.action ===
                  'return'
                    ? 'bg-orange-600 text-white hover:bg-orange-700'
                    : 'bg-red-600 text-white hover:bg-red-700'
                }
                onClick={() =>
                  void confirmAction()
                }
              >
                {processingId ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : actionDialog.action ===
                  'return' ? (
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                ) : (
                  <X className="mr-1.5 h-3.5 w-3.5" />
                )}

                {actionDialog.action ===
                'return'
                  ? 'Return for Correction'
                  : 'Confirm Rejection'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}