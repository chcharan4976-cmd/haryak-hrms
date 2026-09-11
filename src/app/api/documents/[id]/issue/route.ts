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

import {
  createAuditLog,
} from '@/lib/services/audit-service'

type DocumentLifecycleStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'ISSUED'
  | 'ACKNOWLEDGED'
  | 'SUPERSEDED'

function parseDocumentMeta(
  description: unknown
): Record<string, any> {
  if (
    !description
  ) {
    return {}
  }

  if (
    typeof description ===
    'object'
  ) {
    return {
      ...(description as Record<
        string,
        any
      >),
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

function normalizeLifecycleStatus(
  value: unknown
): DocumentLifecycleStatus {
  const normalized =
    String(
      value ||
      'DRAFT'
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

function mapDocumentForClient(
  doc: any,
  meta: Record<string, any>
) {
  return {
    id:
      doc.id,

    companyId:
      doc.company_id,

    employeeId:
      doc.employee_id,

    employeeName:
      doc.employees
        ?.full_name ||
      null,

    employeeCode:
      doc.employees
        ?.employee_code ||
      null,

    documentType:
      meta.documentType ||
      meta.document_type ||
      doc.document_type ||
      'custom_letter',

    documentNumber:
      meta.documentNumber ||
      meta.referenceNumber ||
      meta.document_number ||
      doc.document_number ||
      doc.title ||
      doc.id,

    title:
      doc.title,

    fileName:
      doc.file_name ||
      meta.fileName ||
      '',

    fileUrl:
      doc.file_url ||
      meta.fileUrl ||
      null,

    version:
      Number(
        meta.version ||
        doc.version ||
        1
      ),

    status:
      normalizeLifecycleStatus(
        meta.status
      ),

    issueDate:
      meta.issueDate ||
      meta.issue_date ||
      doc.issue_date ||
      doc.created_at,

    effectiveDate:
      meta.effectiveDate ||
      meta.effective_date ||
      '',

    generatedAt:
      meta.generatedAt ||
      meta.generated_at ||
      doc.created_at,

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

    content:
      meta.content ||
      meta.documentContent ||
      meta.document_content ||
      doc.document_content ||
      null,

    letterheadVersion:
      Number(
        meta.letterheadVersion ||
        meta.letterhead_version ||
        1
      ),

    visibility:
      doc.visibility ||
      'internal',
  }
}

export async function POST(
  _request: NextRequest,
  {
    params,
  }: {
    params:
      Promise<{
        id: string
      }>
  }
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
          'Unauthorized: Only administrators can issue official documents.',
      },
      {
        status:
          403,
      }
    )
  }

  const {
    id,
  } =
    await params

  if (
    !id
  ) {
    return NextResponse.json(
      {
        success:
          false,

        error:
          'Document ID is required.',
      },
      {
        status:
          400,
      }
    )
  }

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

  /* ============================================================
     LOAD AUTHORITATIVE DOCUMENT
     ============================================================ */

  const {
    data:
      doc,

    error:
      documentError,
  } =
    await supabase
      .from(
        'documents'
      )
      .select(`
        *,
        employees:employee_id(
          id,
          user_id,
          full_name,
          employee_code,
          official_email,
          is_active,
          employment_status
        )
      `)
      .eq(
        'company_id',
        context.companyId
      )
      .eq(
        'id',
        id
      )
      .maybeSingle()

  if (
    documentError
  ) {
    console.error(
      '[IssueDocument] Load failed:',
      documentError
    )

    return NextResponse.json(
      {
        success:
          false,

        error:
          `Unable to load document: ${documentError.message}`,
      },
      {
        status:
          500,
      }
    )
  }

  if (
    !doc
  ) {
    return NextResponse.json(
      {
        success:
          false,

        error:
          'Document not found.',
      },
      {
        status:
          404,
      }
    )
  }

  if (
    !doc.employee_id
  ) {
    return NextResponse.json(
      {
        success:
          false,

        error:
          'This document is not linked to an employee and cannot be issued to the Employee Portal.',
      },
      {
        status:
          400,
      }
    )
  }

  if (
    !doc.employees
  ) {
    return NextResponse.json(
      {
        success:
          false,

        error:
          'The employee linked to this document could not be resolved.',
      },
      {
        status:
          400,
      }
    )
  }

  const meta =
    parseDocumentMeta(
      doc.description
    )

  const currentStatus =
    normalizeLifecycleStatus(
      meta.status
    )

  /* ============================================================
     LIFECYCLE VALIDATION
     ============================================================ */

  if (
    currentStatus ===
    'ISSUED'
  ) {
    /**
     * Idempotent response:
     * issuing the same already-issued document again should not create
     * duplicate portal notifications or pretend another issuance occurred.
     */
    return NextResponse.json(
      {
        success:
          true,

        message:
          `Document ${
            meta.documentNumber ||
            meta.referenceNumber ||
            doc.title ||
            id
          } is already ISSUED.`,

        document:
          mapDocumentForClient(
            doc,
            meta
          ),
      },
      {
        status:
          200,
      }
    )
  }

  if (
    currentStatus ===
      'ACKNOWLEDGED'
  ) {
    return NextResponse.json(
      {
        success:
          false,

        error:
          'This document has already been acknowledged by the employee and cannot be issued again.',
      },
      {
        status:
          409,
      }
    )
  }

  if (
    currentStatus ===
      'SUPERSEDED'
  ) {
    return NextResponse.json(
      {
        success:
          false,

        error:
          'A superseded document cannot be issued. Create or use the active revision instead.',
      },
      {
        status:
          409,
      }
    )
  }

  if (
    currentStatus !==
    'APPROVED'
  ) {
    return NextResponse.json(
      {
        success:
          false,

        error:
          `Only an APPROVED document can be issued. Current status is ${currentStatus}.`,
      },
      {
        status:
          409,
      }
    )
  }

  const now =
    new Date()
      .toISOString()

  /* ============================================================
     BUILD ISSUED SNAPSHOT
     ============================================================ */

  const issuedMeta = {
    ...meta,

    status:
      'ISSUED',

    issuedAt:
      now,

    issuedBy:
      context.authUserId,

    issuedByName:
      context.fullName,

    issuedByEmail:
      context.email,

    /**
     * Preserve a truthful lifecycle transition record in the same
     * metadata container currently used by this project.
     */
    lifecycle:
      Array.isArray(
        meta.lifecycle
      )
        ? [
            ...meta.lifecycle,

            {
              action:
                'ISSUED',

              at:
                now,

              byUserId:
                context.authUserId,

              byName:
                context.fullName,

              byEmail:
                context.email,
            },
          ]
        : [
            {
              action:
                'ISSUED',

              at:
                now,

              byUserId:
                context.authUserId,

              byName:
                context.fullName,

              byEmail:
                context.email,
            },
          ],
  }

  /* ============================================================
     PERSIST ISSUANCE
     ============================================================ */

  const {
    data:
      updated,

    error:
      updateError,
  } =
    await supabase
      .from(
        'documents'
      )
      .update({
        description:
          JSON.stringify(
            issuedMeta
          ),

        /**
         * This is the existing schema field that makes the document
         * eligible for Employee Portal visibility.
         */
        visibility:
          'employee',

        updated_at:
          now,
      })
      .eq(
        'id',
        id
      )
      .eq(
        'company_id',
        context.companyId
      )
      .select(`
        *,
        employees:employee_id(
          id,
          user_id,
          full_name,
          employee_code,
          official_email,
          is_active,
          employment_status
        )
      `)
      .single()

  if (
    updateError ||
    !updated
  ) {
    console.error(
      '[IssueDocument] Database update failed:',
      updateError
    )

    return NextResponse.json(
      {
        success:
          false,

        error:
          `Document could not be issued: ${
            updateError?.message ||
            'The database did not return the updated document.'
          }`,
      },
      {
        status:
          500,
      }
    )
  }

  const verifiedMeta =
    parseDocumentMeta(
      updated.description
    )

  const verifiedStatus =
    normalizeLifecycleStatus(
      verifiedMeta.status
    )

  if (
    verifiedStatus !==
      'ISSUED' ||
    updated.visibility !==
      'employee'
  ) {
    console.error(
      '[IssueDocument] Verification failed:',
      {
        verifiedStatus,
        visibility:
          updated.visibility,
      }
    )

    return NextResponse.json(
      {
        success:
          false,

        error:
          'Document issuance was written but could not be verified as ISSUED and employee-visible.',
      },
      {
        status:
          500,
      }
    )
  }

  /* ============================================================
     EMPLOYEE NOTIFICATION
     ============================================================ */

  const employeeUserId =
    updated.employees
      ?.user_id ||
    doc.employees
      ?.user_id

  if (
    employeeUserId
  ) {
    const {
      error:
        notificationError,
    } =
      await supabase
        .from(
          'notifications'
        )
        .insert({
          company_id:
            context.companyId,

          user_id:
            employeeUserId,

          title:
            `Official Document Issued: ${updated.title}`,

          message:
            `An official document (${
              verifiedMeta.documentNumber ||
              verifiedMeta.referenceNumber ||
              updated.title
            }) has been issued to your Employee Portal. Open My Documents to preview, download and acknowledge it.`,

          type:
            'document_uploaded',

          reference_type:
            'document',

          reference_id:
            updated.id,

          action_url:
            '/portal/my-documents',
        })

    /**
     * Notification delivery should not falsely roll back an already
     * persisted issuance. Log the failure, but keep the document issued.
     */
    if (
      notificationError
    ) {
      console.error(
        '[IssueDocument] Notification insert failed:',
        notificationError
      )
    }
  } else {
    console.warn(
      '[IssueDocument] Employee has no linked auth user; document was issued but no portal notification could be created.',
      {
        employeeId:
          updated.employee_id,
      }
    )
  }

  /* ============================================================
     AUDIT
     ============================================================ */

  try {
    await createAuditLog({
      companyId:
        context.companyId,

      userId:
        context.authUserId,

      userEmail:
        context.email,

      userName:
        context.fullName,

      action:
        'updated',

      entityType:
        'document',

      entityId:
        id,

      entityName:
        updated.title,

      description:
        `Issued official document ${
          verifiedMeta.documentNumber ||
          verifiedMeta.referenceNumber ||
          id
        } to ${
          updated.employees
            ?.full_name ||
          'employee'
        } (${
          updated.employees
            ?.employee_code ||
          updated.employee_id
        }).`,

      reason:
        'DOCUMENT_ISSUANCE',
    })
  } catch (
    auditError
  ) {
    console.error(
      '[IssueDocument] Audit log failed:',
      auditError
    )
  }

  /* ============================================================
     AUTHORITATIVE RESPONSE
     ============================================================ */

  const responseDocument =
    mapDocumentForClient(
      updated,
      verifiedMeta
    )

  return NextResponse.json(
    {
      success:
        true,

      message:
        `Document ${
          responseDocument.documentNumber
        } has been ISSUED to the Employee Portal.`,

      status:
        responseDocument.status,

      document:
        responseDocument,
    },
    {
      status:
        200,
    }
  )
}
