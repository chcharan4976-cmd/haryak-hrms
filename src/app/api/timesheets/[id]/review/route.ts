import {
  NextRequest,
  NextResponse,
} from 'next/server'

import {
  resolveRequestContext,
  isAdmin,
} from '@/lib/services/company-resolver'

import {
  reviewTimesheet,
} from '@/lib/services/timesheet-service'

type ReviewAction =
  | 'APPROVE'
  | 'RETURN_FOR_CORRECTION'
  | 'REJECT'
  | 'LOCK'

const VALID_ACTIONS:
  ReviewAction[] = [
    'APPROVE',
    'RETURN_FOR_CORRECTION',
    'REJECT',
    'LOCK',
  ]

function normalizeComments(
  value: unknown
): string {
  if (
    typeof value !==
    'string'
  ) {
    return ''
  }

  return value.trim()
}

function getSuccessMessage(
  action: ReviewAction
): string {
  switch (
    action
  ) {
    case 'APPROVE':
      return 'Timesheet approved successfully.'

    case 'RETURN_FOR_CORRECTION':
      return 'Timesheet returned to the employee for correction.'

    case 'REJECT':
      return 'Timesheet rejected successfully.'

    case 'LOCK':
      return 'Timesheet locked successfully.'

    default:
      return 'Timesheet reviewed successfully.'
  }
}

export async function POST(
  request: NextRequest,
  {
    params,
  }: {
    params:
      Promise<{
        id: string
      }>
  }
) {
  try {
    // ========================================================
    // AUTHENTICATION / AUTHORIZATION
    // ========================================================

    const resolved =
      await resolveRequestContext()

    if (
      !resolved.ok
    ) {
      return NextResponse.json(
        {
          success:
            false,

          error:
            resolved.error.message,
        },
        {
          status:
            resolved.error.status,
        }
      )
    }

    const {
      context,
    } =
      resolved

    if (
      !isAdmin(
        context
      )
    ) {
      return NextResponse.json(
        {
          success:
            false,

          error:
            'Only authorized administrators can review timesheets.',
        },
        {
          status:
            403,
        }
      )
    }

    // ========================================================
    // TIMESHEET ID
    // ========================================================

    const {
      id,
    } =
      await params

    const timesheetId =
      String(
        id || ''
      ).trim()

    if (
      !timesheetId
    ) {
      return NextResponse.json(
        {
          success:
            false,

          error:
            'Timesheet ID is required.',
        },
        {
          status:
            400,
        }
      )
    }

    // ========================================================
    // REQUEST BODY
    // ========================================================

    let body:
      Record<
        string,
        unknown
      >

    try {
      body =
        await request.json()
    } catch {
      return NextResponse.json(
        {
          success:
            false,

          error:
            'Invalid JSON request body.',
        },
        {
          status:
            400,
        }
      )
    }

    const action =
      String(
        body.action ||
          ''
      )
        .trim()
        .toUpperCase() as
        ReviewAction

    const comments =
      normalizeComments(
        body.comments
      )

    if (
      !VALID_ACTIONS.includes(
        action
      )
    ) {
      return NextResponse.json(
        {
          success:
            false,

          error:
            'Invalid review action. Allowed actions are APPROVE, RETURN_FOR_CORRECTION, REJECT, and LOCK.',
        },
        {
          status:
            400,
        }
      )
    }

    // ========================================================
    // REVIEW REASON VALIDATION
    // ========================================================

    /**
     * If the employee must correct or if HR rejects the month,
     * the employee needs a clear reason.
     */
    if (
      (
        action ===
          'RETURN_FOR_CORRECTION' ||
        action ===
          'REJECT'
      ) &&
      comments.length <
        3
    ) {
      return NextResponse.json(
        {
          success:
            false,

          error:
            action ===
            'RETURN_FOR_CORRECTION'
              ? 'Please provide a reason before returning the timesheet for correction.'
              : 'Please provide a reason before rejecting the timesheet.',
        },
        {
          status:
            400,
        }
      )
    }

    // ========================================================
    // REVIEWER CONTEXT
    // ========================================================

    const adminContext = {
      userId:
        context.authUserId,

      userEmail:
        context.email,

      userName:
        context.fullName,

      role:
        context.roles[0] ||
        'HR_ADMIN',
    }

    // ========================================================
    // PERFORM REVIEW
    // ========================================================

    const reviewed =
      await reviewTimesheet(
        context.companyId,
        timesheetId,
        action,
        comments,
        adminContext
      )

    // ========================================================
    // RESPONSE
    // ========================================================

    return NextResponse.json({
      success:
        true,

      message:
        getSuccessMessage(
          action
        ),

      action,

      data:
        reviewed,
    })
  } catch (
    error: any
  ) {
    console.error(
      '[POST /api/timesheets/[id]/review]',
      error
    )

    const message =
      error?.message ||
      'Unable to review timesheet.'

    /**
     * Validation / state-transition failures from the service
     * remain 400-level errors.
     */
    return NextResponse.json(
      {
        success:
          false,

        error:
          message,
      },
      {
        status:
          400,
      }
    )
  }
}