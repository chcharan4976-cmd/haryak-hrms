/**
 * Haryak Technologies India Private Limited
 * Canonical Relational Timesheet Service
 *
 * REAL DATABASE ONLY.
 *
 * Tables:
 * - public.timesheets
 * - public.timesheet_entries
 * - public.timesheet_reviews
 *
 * IMPORTANT:
 * - No in-memory fallback
 * - No fake success
 * - All critical writes must persist to Supabase
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { createAuditLog } from '@/lib/services/audit-service'

export type TimesheetStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'RETURNED_FOR_CORRECTION'
  | 'LOCKED'

export interface TimesheetEntry {
  id?: string
  timesheetId?: string
  entryDate: string
  projectName: string
  taskCategory: string
  description: string
  hours: number
  isBillable: boolean
  createdAt?: string
  updatedAt?: string
}

export interface TimesheetReview {
  id?: string
  timesheetId: string
  action:
    | 'SUBMIT'
    | 'APPROVE'
    | 'REJECT'
    | 'RETURN_FOR_CORRECTION'
    | 'LOCK'
  actorId: string
  actorRole: string
  comments?: string | null
  createdAt?: string
}

export interface MonthlyTimesheet {
  id: string
  companyId: string
  employeeId: string

  employeeCode?: string
  employeeName?: string
  departmentName?: string

  year: number
  month: number

  periodStart: string
  periodEnd: string

  status: TimesheetStatus
  version: number

  totalHours: number
  billableHours: number

  submittedAt?: string | null
  submittedBy?: string | null

  approvedAt?: string | null
  approvedBy?: string | null

  rejectionReason?: string | null
  comments?: string | null

  entries: TimesheetEntry[]
  reviews: TimesheetReview[]

  createdAt?: string
  updatedAt?: string
}

interface UserContext {
  userId: string
  userEmail: string
  userName: string
}

interface AdminContext extends UserContext {
  role?: string
}

function getDatabase() {
  const supabase = createAdminClient()

  if (!supabase) {
    throw new Error(
      'Database service is unavailable. Timesheet operation was not saved.'
    )
  }

  return supabase
}

function getPeriodDates(
  year: number,
  month: number
) {
  if (
    !Number.isInteger(year) ||
    year < 2000 ||
    year > 2200
  ) {
    throw new Error('Invalid timesheet year.')
  }

  if (
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  ) {
    throw new Error('Invalid timesheet month.')
  }

  const start =
    `${year}-${String(month).padStart(2, '0')}-01`

  const lastDay =
    new Date(year, month, 0).getDate()

  const end =
    `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  return {
    start,
    end,
  }
}

function normalizeStatus(
  value: unknown
): TimesheetStatus {
  const status =
    String(value || 'DRAFT')
      .trim()
      .toUpperCase()

  const valid: TimesheetStatus[] = [
    'DRAFT',
    'SUBMITTED',
    'UNDER_REVIEW',
    'APPROVED',
    'REJECTED',
    'RETURNED_FOR_CORRECTION',
    'LOCKED',
  ]

  if (
    valid.includes(
      status as TimesheetStatus
    )
  ) {
    return status as TimesheetStatus
  }

  return 'DRAFT'
}

function mapEntry(
  entry: any
): TimesheetEntry {
  return {
    id: entry.id,

    timesheetId:
      entry.timesheet_id,

    entryDate:
      entry.entry_date ||
      entry.work_date,

    projectName:
      entry.project_name || '',

    taskCategory:
      entry.task_category ||
      entry.task_title ||
      '',

    description:
      entry.description || '',

    hours:
      Number(entry.hours || 0),

    isBillable:
      entry.is_billable === true,

    createdAt:
      entry.created_at,

    updatedAt:
      entry.updated_at,
  }
}

function mapReview(
  review: any
): TimesheetReview {
  return {
    id:
      review.id,

    timesheetId:
      review.timesheet_id,

    action:
      review.action,

    actorId:
      review.actor_id,

    actorRole:
      review.actor_role,

    comments:
      review.comments,

    createdAt:
      review.created_at,
  }
}

function mapTimesheet(
  ts: any,
  entries: TimesheetEntry[] = [],
  reviews: TimesheetReview[] = []
): MonthlyTimesheet {
  return {
    id:
      ts.id,

    companyId:
      ts.company_id,

    employeeId:
      ts.employee_id,

    employeeCode:
      ts.employees?.employee_code,

    employeeName:
      ts.employees?.full_name,

    departmentName:
      ts.employees?.departments?.name,

    year:
      Number(ts.year),

    month:
      Number(ts.month),

    periodStart:
      ts.period_start,

    periodEnd:
      ts.period_end,

    status:
      normalizeStatus(
        ts.status
      ),

    version:
      Number(ts.version || 1),

    totalHours:
      Number(ts.total_hours || 0),

    billableHours:
      Number(ts.billable_hours || 0),

    submittedAt:
      ts.submitted_at,

    submittedBy:
      ts.submitted_by,

    approvedAt:
      ts.approved_at,

    approvedBy:
      ts.approved_by,

    rejectionReason:
      ts.rejection_reason,

    comments:
      ts.comments,

    entries,
    reviews,

    createdAt:
      ts.created_at,

    updatedAt:
      ts.updated_at,
  }
}

/**
 * Fetch employee monthly timesheet.
 */
export async function getEmployeeMonthlyTimesheet(
  companyId: string,
  employeeId: string,
  year: number,
  month: number
): Promise<MonthlyTimesheet> {
  const supabase =
    getDatabase()

  const {
    start,
    end,
  } =
    getPeriodDates(
      year,
      month
    )

  const {
    data: ts,
    error: tsError,
  } =
    await supabase
      .from('timesheets')
      .select(`
        *,
        employees:employee_id(
          id,
          employee_code,
          full_name,
          departments:department_id(
            name
          )
        )
      `)
      .eq(
        'company_id',
        companyId
      )
      .eq(
        'employee_id',
        employeeId
      )
      .eq(
        'year',
        year
      )
      .eq(
        'month',
        month
      )
      .maybeSingle()

  if (tsError) {
    console.error(
      '[TimesheetService] Failed to fetch timesheet:',
      tsError
    )

    throw new Error(
      `Unable to load timesheet: ${tsError.message}`
    )
  }

  if (!ts) {
    return {
      id: '',
      companyId,
      employeeId,
      year,
      month,
      periodStart:
        start,
      periodEnd:
        end,
      status:
        'DRAFT',
      version:
        1,
      totalHours:
        0,
      billableHours:
        0,
      entries:
        [],
      reviews:
        [],
    }
  }

  const {
    data: entries,
    error: entriesError,
  } =
    await supabase
      .from('timesheet_entries')
      .select('*')
      .eq(
        'timesheet_id',
        ts.id
      )
      .order(
        'work_date',
        {
          ascending: true,
        }
      )

  if (entriesError) {
    console.error(
      '[TimesheetService] Failed to load entries:',
      entriesError
    )

    throw new Error(
      `Unable to load timesheet entries: ${entriesError.message}`
    )
  }

  const {
    data: reviews,
    error: reviewsError,
  } =
    await supabase
      .from('timesheet_reviews')
      .select('*')
      .eq(
        'timesheet_id',
        ts.id
      )
      .order(
        'created_at',
        {
          ascending: true,
        }
      )

  if (reviewsError) {
    console.error(
      '[TimesheetService] Failed to load reviews:',
      reviewsError
    )

    throw new Error(
      `Unable to load timesheet review history: ${reviewsError.message}`
    )
  }

  return mapTimesheet(
    ts,
    (entries || []).map(
      mapEntry
    ),
    (reviews || []).map(
      mapReview
    )
  )
}

/**
 * Save timesheet draft.
 */
export async function saveTimesheetDraft(
  companyId: string,
  employeeId: string,
  year: number,
  month: number,
  entries: TimesheetEntry[],
  userContext?: UserContext
): Promise<MonthlyTimesheet> {
  const supabase =
    getDatabase()

  const {
    start,
    end,
  } =
    getPeriodDates(
      year,
      month
    )

  if (
    !Array.isArray(entries)
  ) {
    throw new Error(
      'Timesheet entries must be an array.'
    )
  }

  for (
    const entry of entries
  ) {
    if (
      !entry.entryDate
    ) {
      throw new Error(
        'Every work entry requires a date.'
      )
    }

    const hours =
      Number(
        entry.hours
      )

    if (
      !Number.isFinite(hours) ||
      hours <= 0 ||
      hours > 24
    ) {
      throw new Error(
        `Invalid hours for ${entry.entryDate}.`
      )
    }
  }

  const existing =
    await getEmployeeMonthlyTimesheet(
      companyId,
      employeeId,
      year,
      month
    )

  if (
    existing.id &&
    (
      existing.status ===
        'SUBMITTED' ||
      existing.status ===
        'UNDER_REVIEW' ||
      existing.status ===
        'APPROVED' ||
      existing.status ===
        'LOCKED'
    )
  ) {
    throw new Error(
      `Timesheet cannot be edited while status is ${existing.status}.`
    )
  }

  let totalHours = 0
  let billableHours = 0

  for (
    const entry of entries
  ) {
    const hours =
      Number(
        entry.hours
      )

    totalHours +=
      hours

    if (
      entry.isBillable ===
      true
    ) {
      billableHours +=
        hours
    }
  }

  const now =
    new Date().toISOString()

  const {
    data: ts,
    error: tsError,
  } =
    await supabase
      .from('timesheets')
      .upsert(
        {
          company_id:
            companyId,

          employee_id:
            employeeId,

          year,
          month,

          period_start:
            start,

          period_end:
            end,

          status:
            'DRAFT',

          total_hours:
            totalHours,

          billable_hours:
            billableHours,

          rejection_reason:
            null,

          comments:
            null,

          updated_at:
            now,
        },
        {
          onConflict:
            'company_id,employee_id,year,month',
        }
      )
      .select()
      .single()

  if (
    tsError ||
    !ts
  ) {
    console.error(
      '[TimesheetService] Draft master upsert failed:',
      tsError
    )

    throw new Error(
      `Timesheet could not be saved: ${
        tsError?.message ||
        'Database did not return the saved timesheet.'
      }`
    )
  }

  /**
   * Replace existing daily entries for this monthly timesheet.
   */
  const {
    error: deleteError,
  } =
    await supabase
      .from(
        'timesheet_entries'
      )
      .delete()
      .eq(
        'timesheet_id',
        ts.id
      )

  if (deleteError) {
    console.error(
      '[TimesheetService] Failed to remove existing entries:',
      deleteError
    )

    throw new Error(
      `Timesheet entry update failed: ${deleteError.message}`
    )
  }

  if (
    entries.length >
    0
  ) {
    const insertPayload =
      entries.map(
        entry => ({
          /**
           * Required relational ownership fields.
           */
          timesheet_id:
            ts.id,

          company_id:
            companyId,

          employee_id:
            employeeId,

          /**
           * Native schema date field.
           */
          work_date:
            entry.entryDate,

          /**
           * Compatibility date field used by newer UI/service.
           */
          entry_date:
            entry.entryDate,

          project_name:
            entry.projectName?.trim() ||
            null,

          /**
           * Native required task field.
           */
          task_title:
            entry.taskCategory?.trim() ||
            'General Work',

          /**
           * Compatibility category field.
           */
          task_category:
            entry.taskCategory?.trim() ||
            null,

          description:
            entry.description?.trim() ||
            null,

          hours:
            Number(
              entry.hours
            ),

          is_billable:
            entry.isBillable ===
            true,
        })
      )

    const {
      error: insertError,
    } =
      await supabase
        .from(
          'timesheet_entries'
        )
        .insert(
          insertPayload
        )

    if (
      insertError
    ) {
      console.error(
        '[TimesheetService] Entry insertion failed:',
        insertError
      )

      throw new Error(
        `Timesheet work entries could not be saved: ${insertError.message}`
      )
    }
  }

  if (
    userContext
  ) {
    try {
      await createAuditLog({
        companyId,

        userId:
          userContext.userId,

        userEmail:
          userContext.userEmail,

        userName:
          userContext.userName,

        action:
          'updated',

        entityType:
          'timesheet',

        entityId:
          ts.id,

        entityName:
          `Timesheet ${month}/${year}`,

        description:
          `Saved timesheet draft for ${month}/${year}.`,

        reason:
          'TIMESHEET_DRAFT_SAVED',
      })
    } catch (
      auditError
    ) {
      console.error(
        '[TimesheetService] Draft audit log failed:',
        auditError
      )
    }
  }

  return getEmployeeMonthlyTimesheet(
    companyId,
    employeeId,
    year,
    month
  )
}

/**
 * Submit timesheet for administrator review.
 */
export async function submitTimesheet(
  companyId: string,
  employeeId: string,
  year: number,
  month: number,
  userContext: UserContext
): Promise<MonthlyTimesheet> {
  const supabase =
    getDatabase()

  const ts =
    await getEmployeeMonthlyTimesheet(
      companyId,
      employeeId,
      year,
      month
    )

  if (!ts.id) {
    throw new Error(
      'Timesheet has not been saved to the database. Save Draft before submitting.'
    )
  }

  if (
    ts.status ===
      'APPROVED' ||
    ts.status ===
      'LOCKED'
  ) {
    throw new Error(
      'Timesheet is already approved or locked.'
    )
  }

  if (
    ts.status ===
      'SUBMITTED' ||
    ts.status ===
      'UNDER_REVIEW'
  ) {
    throw new Error(
      'Timesheet has already been submitted for review.'
    )
  }

  if (
    ts.entries.length ===
    0
  ) {
    throw new Error(
      'Cannot submit an empty timesheet.'
    )
  }

  const now =
    new Date().toISOString()

  const {
    data: updated,
    error: updateError,
  } =
    await supabase
      .from('timesheets')
      .update({
        status:
          'SUBMITTED',

        submitted_at:
          now,

        submitted_by:
          userContext.userId,

        rejection_reason:
          null,

        comments:
          null,

        approved_at:
          null,

        approved_by:
          null,

        updated_at:
          now,
      })
      .eq(
        'id',
        ts.id
      )
      .eq(
        'company_id',
        companyId
      )
      .select()
      .single()

  if (
    updateError ||
    !updated
  ) {
    console.error(
      '[TimesheetService] Submission failed:',
      updateError
    )

    throw new Error(
      `Timesheet submission failed: ${
        updateError?.message ||
        'No updated database row was returned.'
      }`
    )
  }

  const {
    error: reviewError,
  } =
    await supabase
      .from(
        'timesheet_reviews'
      )
      .insert({
        timesheet_id:
          ts.id,

        action:
          'SUBMIT',

        actor_id:
          userContext.userId,

        actor_role:
          'EMPLOYEE',

        comments:
          ts.status ===
          'RETURNED_FOR_CORRECTION'
            ? 'Corrected timesheet resubmitted for administrator review'
            : 'Timesheet submitted for administrator review',
      })

  if (
    reviewError
  ) {
    console.error(
      '[TimesheetService] Submission history insert failed:',
      reviewError
    )
  }

  try {
    await createAuditLog({
      companyId,

      userId:
        userContext.userId,

      userEmail:
        userContext.userEmail,

      userName:
        userContext.userName,

      action:
        'updated',

      entityType:
        'timesheet',

      entityId:
        ts.id,

      entityName:
        `Timesheet ${month}/${year}`,

      description:
        ts.status ===
        'RETURNED_FOR_CORRECTION'
          ? `Resubmitted corrected timesheet for ${month}/${year} with ${ts.totalHours} total hours.`
          : `Submitted timesheet for ${month}/${year} with ${ts.totalHours} total hours.`,

      reason:
        ts.status ===
        'RETURNED_FOR_CORRECTION'
          ? 'TIMESHEET_RESUBMITTED'
          : 'TIMESHEET_SUBMITTED',
    })
  } catch (
    auditError
  ) {
    console.error(
      '[TimesheetService] Submission audit failed:',
      auditError
    )
  }

  const verified =
    await getEmployeeMonthlyTimesheet(
      companyId,
      employeeId,
      year,
      month
    )

  if (
    verified.status !==
    'SUBMITTED'
  ) {
    throw new Error(
      'Timesheet submission could not be verified in the database.'
    )
  }

  return verified
}

/**
 * List admin timesheets.
 */
export async function listAdminTimesheets(
  companyId: string,
  filter: {
    status?: string
    year?: number
    month?: number
    employeeId?: string
  } = {}
): Promise<MonthlyTimesheet[]> {
  const supabase =
    getDatabase()

  let query =
    supabase
      .from('timesheets')
      .select(`
        *,
        employees:employee_id(
          id,
          employee_code,
          full_name,
          departments:department_id(
            name
          )
        )
      `)
      .eq(
        'company_id',
        companyId
      )

  const status =
    filter.status
      ?.trim()
      .toLowerCase()

  if (
    status &&
    status !== 'all'
  ) {
    if (
      status ===
        'pending' ||
      status ===
        'submitted'
    ) {
      query =
        query.in(
          'status',
          [
            'SUBMITTED',
            'UNDER_REVIEW',
          ]
        )
    } else if (
      status ===
      'approved'
    ) {
      query =
        query.in(
          'status',
          [
            'APPROVED',
            'LOCKED',
          ]
        )
    } else if (
      status ===
        'returned' ||
      status ===
        'returned_for_correction'
    ) {
      query =
        query.eq(
          'status',
          'RETURNED_FOR_CORRECTION'
        )
    } else if (
      status ===
      'rejected'
    ) {
      query =
        query.eq(
          'status',
          'REJECTED'
        )
    } else if (
      status ===
      'draft'
    ) {
      query =
        query.eq(
          'status',
          'DRAFT'
        )
    }
  }

  if (
    filter.year
  ) {
    query =
      query.eq(
        'year',
        filter.year
      )
  }

  if (
    filter.month
  ) {
    query =
      query.eq(
        'month',
        filter.month
      )
  }

  if (
    filter.employeeId
  ) {
    query =
      query.eq(
        'employee_id',
        filter.employeeId
      )
  }

  query =
    query.order(
      'submitted_at',
      {
        ascending: false,
        nullsFirst: false,
      }
    )

  const {
    data: timesheetRows,
    error: timesheetError,
  } =
    await query

  if (
    timesheetError
  ) {
    console.error(
      '[TimesheetService] Admin list query failed:',
      timesheetError
    )

    throw new Error(
      `Unable to load administrator timesheets: ${timesheetError.message}`
    )
  }

  if (
    !timesheetRows ||
    timesheetRows.length ===
      0
  ) {
    return []
  }

  const timesheetIds =
    timesheetRows
      .map(
        (
          ts: any
        ) =>
          String(
            ts.id ||
              ''
          )
      )
      .filter(
        Boolean
      )

  /**
   * IMPORTANT:
   * The admin dashboard needs the actual daily entries.
   *
   * Returning only the timesheet master row makes totals such as
   * 176 hours appear correctly while "Days Filled" incorrectly
   * becomes 0/22 because the browser receives entries: [].
   *
   * Fetch the relational children in batches to avoid N+1 queries.
   */
  const [
    entriesResult,
    reviewsResult,
  ] =
    await Promise.all([
      supabase
        .from(
          'timesheet_entries'
        )
        .select('*')
        .in(
          'timesheet_id',
          timesheetIds
        )
        .order(
          'work_date',
          {
            ascending:
              true,
          }
        ),

      supabase
        .from(
          'timesheet_reviews'
        )
        .select('*')
        .in(
          'timesheet_id',
          timesheetIds
        )
        .order(
          'created_at',
          {
            ascending:
              true,
          }
        ),
    ])

  if (
    entriesResult.error
  ) {
    console.error(
      '[TimesheetService] Admin entry query failed:',
      entriesResult.error
    )

    throw new Error(
      `Unable to load administrator timesheet entries: ${entriesResult.error.message}`
    )
  }

  if (
    reviewsResult.error
  ) {
    console.error(
      '[TimesheetService] Admin review-history query failed:',
      reviewsResult.error
    )

    throw new Error(
      `Unable to load administrator timesheet review history: ${reviewsResult.error.message}`
    )
  }

  const entriesByTimesheet =
    new Map<
      string,
      TimesheetEntry[]
    >()

  for (
    const rawEntry of
      entriesResult.data ||
      []
  ) {
    const timesheetId =
      String(
        rawEntry.timesheet_id ||
          ''
      )

    if (
      !timesheetId
    ) {
      continue
    }

    const current =
      entriesByTimesheet.get(
        timesheetId
      ) ||
      []

    current.push(
      mapEntry(
        rawEntry
      )
    )

    entriesByTimesheet.set(
      timesheetId,
      current
    )
  }

  const reviewsByTimesheet =
    new Map<
      string,
      TimesheetReview[]
    >()

  for (
    const rawReview of
      reviewsResult.data ||
      []
  ) {
    const timesheetId =
      String(
        rawReview.timesheet_id ||
          ''
      )

    if (
      !timesheetId
    ) {
      continue
    }

    const current =
      reviewsByTimesheet.get(
        timesheetId
      ) ||
      []

    current.push(
      mapReview(
        rawReview
      )
    )

    reviewsByTimesheet.set(
      timesheetId,
      current
    )
  }

  return timesheetRows.map(
    (
      ts: any
    ) =>
      mapTimesheet(
        ts,
        entriesByTimesheet.get(
          ts.id
        ) ||
          [],
        reviewsByTimesheet.get(
          ts.id
        ) ||
          []
      )
  )
}

/**
 * Review timesheet.
 *
 * Supported transitions:
 *
 * SUBMITTED / UNDER_REVIEW
 *   -> APPROVED
 *   -> RETURNED_FOR_CORRECTION
 *   -> REJECTED
 *
 * APPROVED
 *   -> RETURNED_FOR_CORRECTION
 *   -> LOCKED
 *
 * LOCKED
 *   -> immutable
 *
 * Returned timesheets become editable to the employee and are
 * NOT payroll eligible until corrected, resubmitted and approved again.
 */
export async function reviewTimesheet(
  companyId: string,
  timesheetId: string,
  action:
    | 'APPROVE'
    | 'RETURN_FOR_CORRECTION'
    | 'REJECT'
    | 'LOCK',
  comments: string,
  adminContext: AdminContext
): Promise<MonthlyTimesheet> {
  const supabase =
    getDatabase()

  if (
    !timesheetId
  ) {
    throw new Error(
      'Timesheet ID is required.'
    )
  }

  const cleanComments =
    comments.trim()

  if (
    (
      action ===
        'RETURN_FOR_CORRECTION' ||
      action ===
        'REJECT'
    ) &&
    cleanComments.length ===
      0
  ) {
    throw new Error(
      action ===
      'RETURN_FOR_CORRECTION'
        ? 'Comments are mandatory when returning a timesheet for correction.'
        : 'Comments are mandatory when rejecting a timesheet.'
    )
  }

  const {
    data: existing,
    error: existingError,
  } =
    await supabase
      .from('timesheets')
      .select('*')
      .eq(
        'id',
        timesheetId
      )
      .eq(
        'company_id',
        companyId
      )
      .maybeSingle()

  if (
    existingError
  ) {
    throw new Error(
      `Unable to load timesheet for review: ${existingError.message}`
    )
  }

  if (
    !existing
  ) {
    throw new Error(
      'Timesheet not found.'
    )
  }

  const currentStatus =
    normalizeStatus(
      existing.status
    )

  /**
   * LOCKED means the monthly record is final.
   * Do not silently reopen a locked payroll-evidence record.
   */
  if (
    currentStatus ===
    'LOCKED'
  ) {
    throw new Error(
      'Locked timesheets cannot be changed. Reopen the payroll/timesheet through an explicit administrative reversal workflow.'
    )
  }

  if (
    action ===
      'APPROVE' &&
    currentStatus !==
      'SUBMITTED' &&
    currentStatus !==
      'UNDER_REVIEW'
  ) {
    throw new Error(
      `Timesheet cannot be approved while status is ${currentStatus}.`
    )
  }

  /**
   * An administrator can return:
   * - a newly submitted timesheet, OR
   * - an approved-but-not-locked timesheet.
   *
   * This is the important correction workflow requested by HR.
   */
  if (
    action ===
      'RETURN_FOR_CORRECTION' &&
    currentStatus !==
      'SUBMITTED' &&
    currentStatus !==
      'UNDER_REVIEW' &&
    currentStatus !==
      'APPROVED'
  ) {
    throw new Error(
      `Timesheet cannot be returned while status is ${currentStatus}.`
    )
  }

  if (
    action ===
      'REJECT' &&
    currentStatus !==
      'SUBMITTED' &&
    currentStatus !==
      'UNDER_REVIEW'
  ) {
    throw new Error(
      `Timesheet cannot be rejected while status is ${currentStatus}.`
    )
  }

  if (
    action ===
      'LOCK' &&
    currentStatus !==
      'APPROVED'
  ) {
    throw new Error(
      'Only an approved timesheet can be locked.'
    )
  }

  let newStatus:
    TimesheetStatus

  switch (
    action
  ) {
    case 'APPROVE':
      newStatus =
        'APPROVED'
      break

    case 'RETURN_FOR_CORRECTION':
      newStatus =
        'RETURNED_FOR_CORRECTION'
      break

    case 'REJECT':
      newStatus =
        'REJECTED'
      break

    case 'LOCK':
      newStatus =
        'LOCKED'
      break

    default:
      throw new Error(
        'Unsupported review action.'
      )
  }

  const now =
    new Date().toISOString()

  const updateData: any = {
    status:
      newStatus,

    comments:
      cleanComments ||
      null,

    updated_at:
      now,
  }

  if (
    action ===
    'APPROVE'
  ) {
    updateData.approved_at =
      now

    updateData.approved_by =
      adminContext.userId

    updateData.rejection_reason =
      null
  }

  if (
    action ===
    'RETURN_FOR_CORRECTION'
  ) {
    /**
     * Critical:
     * Once reopened, the previous approval must no longer make
     * this timesheet payroll eligible.
     */
    updateData.approved_at =
      null

    updateData.approved_by =
      null

    updateData.rejection_reason =
      cleanComments
  }

  if (
    action ===
    'REJECT'
  ) {
    updateData.approved_at =
      null

    updateData.approved_by =
      null

    updateData.rejection_reason =
      cleanComments ||
      'Rejected by administrator'
  }

  const {
    data: updated,
    error: updateError,
  } =
    await supabase
      .from('timesheets')
      .update(
        updateData
      )
      .eq(
        'id',
        timesheetId
      )
      .eq(
        'company_id',
        companyId
      )
      .select()
      .single()

  if (
    updateError ||
    !updated
  ) {
    console.error(
      '[TimesheetService] Review update failed:',
      updateError
    )

    throw new Error(
      `Timesheet review could not be saved: ${
        updateError?.message ||
        'No updated database row returned.'
      }`
    )
  }

  const {
    error: reviewInsertError,
  } =
    await supabase
      .from(
        'timesheet_reviews'
      )
      .insert({
        timesheet_id:
          timesheetId,

        action,

        actor_id:
          adminContext.userId,

        actor_role:
          adminContext.role ||
          'HR_ADMIN',

        comments:
          cleanComments ||
          null,
      })

  if (
    reviewInsertError
  ) {
    console.error(
      '[TimesheetService] Review history insert failed:',
      reviewInsertError
    )
  }

  try {
    await createAuditLog({
      companyId,

      userId:
        adminContext.userId,

      userEmail:
        adminContext.userEmail,

      userName:
        adminContext.userName,

      action:
        'updated',

      entityType:
        'timesheet',

      entityId:
        timesheetId,

      entityName:
        `Timesheet Review ${action}`,

      description:
        action ===
        'RETURN_FOR_CORRECTION' &&
        currentStatus ===
        'APPROVED'
          ? `${adminContext.userName} reopened previously approved timesheet ${timesheetId} for employee correction. Reason: ${cleanComments}`
          : `${adminContext.userName} performed ${action} on timesheet ${timesheetId}.`,

      reason:
        action ===
        'RETURN_FOR_CORRECTION' &&
        currentStatus ===
        'APPROVED'
          ? 'TIMESHEET_APPROVAL_REOPENED_FOR_CORRECTION'
          : `TIMESHEET_${action}`,
    })
  } catch (
    auditError
  ) {
    console.error(
      '[TimesheetService] Review audit failed:',
      auditError
    )
  }

  return getEmployeeMonthlyTimesheet(
    companyId,
    updated.employee_id,
    updated.year,
    updated.month
  )
}

/**
 * Payroll readiness gate.
 */
export async function isTimesheetApprovedForPayroll(
  companyId: string,
  employeeId: string,
  year: number,
  month: number
): Promise<{
  approved: boolean
  status: string
  reason?: string
  timesheetId?: string
}> {
  const ts =
    await getEmployeeMonthlyTimesheet(
      companyId,
      employeeId,
      year,
      month
    )

  if (
    !ts.id
  ) {
    return {
      approved:
        false,

      status:
        'NOT_CREATED',

      reason:
        'No timesheet exists for this payroll period.',
    }
  }

  if (
    ts.status ===
      'APPROVED' ||
    ts.status ===
      'LOCKED'
  ) {
    return {
      approved:
        true,

      status:
        ts.status,

      timesheetId:
        ts.id,
    }
  }

  let reason =
    'Timesheet is not approved.'

  if (
    ts.status ===
    'DRAFT'
  ) {
    reason =
      'Timesheet is still in Draft state and has not been submitted by the employee.'
  }

  if (
    ts.status ===
      'SUBMITTED' ||
    ts.status ===
      'UNDER_REVIEW'
  ) {
    reason =
      'Timesheet has been submitted and is pending administrator review and approval.'
  }

  if (
    ts.status ===
    'RETURNED_FOR_CORRECTION'
  ) {
    reason =
      `Timesheet was returned for correction: ${
        ts.comments ||
        'Awaiting employee update'
      }.`
  }

  if (
    ts.status ===
    'REJECTED'
  ) {
    reason =
      `Timesheet was rejected: ${
        ts.rejectionReason ||
        'Contact management'
      }.`
  }

  return {
    approved:
      false,

    status:
      ts.status,

    reason,

    timesheetId:
      ts.id,
  }
}
