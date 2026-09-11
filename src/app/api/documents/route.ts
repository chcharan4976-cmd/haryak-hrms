import {
  NextRequest,
  NextResponse,
} from 'next/server'

import {
  createAdminClient,
} from '@/lib/supabase/admin'

import {
  resolveRequestContext,
  isAdmin,
} from '@/lib/services/company-resolver'

type DocumentLifecycleStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'ISSUED'
  | 'ACKNOWLEDGED'
  | 'SUPERSEDED'

function parseMetadata(
  description: unknown
): Record<string, any> {
  if (!description) {
    return {}
  }

  if (
    typeof description ===
    'object'
  ) {
    return {
      ...(description as Record<string, any>),
    }
  }

  try {
    const parsed =
      JSON.parse(
        String(
          description
        )
      )

    return (
      parsed &&
      typeof parsed ===
        'object' &&
      !Array.isArray(
        parsed
      )
    )
      ? parsed
      : {}
  } catch {
    return {}
  }
}

function normalizeStatus(
  value: unknown
): DocumentLifecycleStatus {
  const normalized =
    String(
      value ||
      ''
    )
      .trim()
      .toUpperCase()

  const valid:
    DocumentLifecycleStatus[] =
    [
      'DRAFT',
      'PENDING_APPROVAL',
      'APPROVED',
      'ISSUED',
      'ACKNOWLEDGED',
      'SUPERSEDED',
    ]

  return valid.includes(
    normalized as DocumentLifecycleStatus
  )
    ? (
        normalized as DocumentLifecycleStatus
      )
    : 'DRAFT'
}

function mapDocument(
  row: any,
  meta: Record<string, any>
) {
  return {
    id:
      row.id,

    companyId:
      row.company_id,

    employeeId:
      row.employee_id,

    employeeCode:
      row.employees?.employee_code ||
      meta.content?.employeeCode ||
      meta.employeeCode ||
      '',

    employeeName:
      row.employees?.full_name ||
      meta.content?.employeeName ||
      meta.employeeName ||
      '',

    documentType:
      meta.documentType ||
      meta.document_type ||
      row.document_type ||
      'custom_letter',

    documentNumber:
      meta.documentNumber ||
      meta.referenceNumber ||
      meta.document_number ||
      row.document_number ||
      `HRK/DOC/${String(row.id || '').slice(0, 6)}`,

    title:
      row.title ||
      meta.subject ||
      'Official Document',

    fileName:
      row.file_name ||
      meta.fileName ||
      '',

    fileUrl:
      row.file_url ||
      meta.fileUrl ||
      null,

    version:
      Number(
        meta.version ||
        row.version ||
        1
      ),

    status:
      normalizeStatus(
        meta.status
      ),

    issueDate:
      meta.issueDate ||
      meta.issue_date ||
      row.issue_date ||
      row.created_at?.split('T')[0] ||
      '',

    effectiveDate:
      meta.effectiveDate ||
      meta.effective_date ||
      '',

    generatedAt:
      meta.generatedAt ||
      meta.generated_at ||
      row.created_at ||
      '',

    issuedAt:
      meta.issuedAt ||
      meta.issued_at ||
      null,

    issuedBy:
      meta.issuedBy ||
      meta.issued_by ||
      null,

    acknowledgedAt:
      meta.acknowledgedAt ||
      meta.acknowledged_at ||
      null,

    acknowledgedBy:
      meta.acknowledgedBy ||
      meta.acknowledged_by ||
      null,

    content:
      meta.content ||
      meta.documentContent ||
      meta.document_content ||
      row.document_content ||
      null,

    letterheadVersion:
      Number(
        meta.letterheadVersion ||
        meta.letterhead_version ||
        1
      ),

    supersedesDocumentId:
      meta.supersedesDocumentId ||
      meta.supersedes_document_id ||
      null,

    visibility:
      row.visibility ||
      'internal',

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at,
  }
}

export async function GET(
  request: NextRequest
) {
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

  const userIsAdmin =
    isAdmin(
      context
    )

  const {
    searchParams,
  } =
    new URL(
      request.url
    )

  const employeeIdParam =
    searchParams.get(
      'employee_id'
    )

  const typeParam =
    searchParams.get(
      'type'
    )

  const statusParam =
    searchParams.get(
      'status'
    )

  const supabase =
    createAdminClient()

  if (
    !supabase
  ) {
    return NextResponse.json(
      {
        success:
          false,

        error:
          'Database unavailable.',
      },
      {
        status:
          503,
      }
    )
  }

  let query =
    supabase
      .from(
        'documents'
      )
      .select(`
        *,
        employees:employee_id(
          id,
          user_id,
          employee_code,
          full_name,
          official_email,
          department_id,
          designation_id,
          is_active,
          employment_status
        )
      `)
      .eq(
        'company_id',
        context.companyId
      )
      .neq(
        'document_type',
        'letterhead'
      )
      .order(
        'created_at',
        {
          ascending:
            false,
        }
      )

  /* ============================================================
     ADMIN QUERY
     ============================================================ */

  if (
    userIsAdmin
  ) {
    if (
      employeeIdParam
    ) {
      query =
        query.eq(
          'employee_id',
          employeeIdParam
        )
    }

    if (
      typeParam
    ) {
      query =
        query.eq(
          'document_type',
          typeParam
        )
    }
  } else {
    /* ==========================================================
       EMPLOYEE PORTAL — STRICT SERVER-SIDE ISOLATION
       ========================================================== */

    if (
      !context.employeeId
    ) {
      return NextResponse.json({
        success:
          true,

        documents:
          [],

        total:
          0,
      })
    }

    /**
     * Critical:
     * Employee identity comes ONLY from resolved authenticated
     * server context. Ignore employee_id query-string values.
     */
    query =
      query
        .eq(
          'employee_id',
          context.employeeId
        )
        .eq(
          'visibility',
          'employee'
        )
  }

  const {
    data,
    error,
  } =
    await query

  if (
    error
  ) {
    console.error(
      '[GET /api/documents] Query failed:',
      error
    )

    return NextResponse.json(
      {
        success:
          false,

        error:
          `Unable to load documents: ${error.message}`,
      },
      {
        status:
          500,
      }
    )
  }

  const mapped =
    (
      data ||
      []
    ).map(
      (
        row:
          any
      ) => {
        const meta =
          parseMetadata(
            row.description
          )

        return mapDocument(
          row,
          meta
        )
      }
    )

  /* ============================================================
     AUTHORITATIVE LIFECYCLE FILTERING
     ============================================================ */

  const list =
    mapped.filter(
      document => {
        if (
          userIsAdmin
        ) {
          if (
            statusParam
          ) {
            return (
              document.status ===
              normalizeStatus(
                statusParam
              )
            )
          }

          return true
        }

        /**
         * NEVER default an employee document to ISSUED.
         *
         * If metadata status is missing/corrupt, normalizeStatus()
         * returns DRAFT and this record stays hidden.
         */
        return (
          document.visibility ===
            'employee' &&
          (
            document.status ===
              'ISSUED' ||
            document.status ===
              'ACKNOWLEDGED'
          )
        )
      }
    )

  return NextResponse.json({
    success:
      true,

    documents:
      list,

    total:
      list.length,
  })
}
