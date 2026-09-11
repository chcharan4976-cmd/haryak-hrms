import {
  NextRequest,
  NextResponse,
} from 'next/server'

import {
  createAdminClient,
} from '@/lib/supabase/admin'

import {
  resolveRequestContext,
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

    documentNumber:
      meta.documentNumber ||
      meta.referenceNumber ||
      meta.document_number ||
      doc.document_number ||
      doc.title ||
      doc.id,

    documentType:
      meta.documentType ||
      meta.document_type ||
      doc.document_type ||
      'custom_letter',

    title:
      doc.title,

    status:
      normalizeStatus(
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
    !context.employeeId
  ) {
    return NextResponse.json(
      {
        success:
          false,

        error:
          'Employee Portal account is not linked to an employee record.',
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
     LOAD DOCUMENT
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
      .select('*')
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
      '[AcknowledgeDocument] Load failed:',
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

  /* ============================================================
     EMPLOYEE OWNERSHIP
     ============================================================ */

  if (
    doc.employee_id !==
    context.employeeId
  ) {
    return NextResponse.json(
      {
        success:
          false,

        error:
          'Forbidden: You can only acknowledge your own documents.',
      },
      {
        status:
          403,
      }
    )
  }

  if (
    doc.visibility !==
    'employee'
  ) {
    return NextResponse.json(
      {
        success:
          false,

        error:
          'This document has not been issued to the Employee Portal.',
      },
      {
        status:
          409,
      }
    )
  }

  const meta =
    parseDocumentMeta(
      doc.description
    )

  const currentStatus =
    normalizeStatus(
      meta.status
    )

  /* ============================================================
     LIFECYCLE VALIDATION
     ============================================================ */

  if (
    currentStatus ===
    'ACKNOWLEDGED'
  ) {
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
          } is already acknowledged.`,

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
    currentStatus !==
    'ISSUED'
  ) {
    return NextResponse.json(
      {
        success:
          false,

        error:
          `Only an ISSUED document can be acknowledged. Current status is ${currentStatus}.`,
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
     BUILD ACKNOWLEDGED SNAPSHOT
     ============================================================ */

  const acknowledgedMeta = {
    ...meta,

    status:
      'ACKNOWLEDGED',

    acknowledgedAt:
      now,

    acknowledgedBy:
      context.authUserId,

    acknowledgedByName:
      context.fullName,

    acknowledgedByEmail:
      context.email,

    lifecycle:
      Array.isArray(
        meta.lifecycle
      )
        ? [
            ...meta.lifecycle,

            {
              action:
                'ACKNOWLEDGED',

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
                'ACKNOWLEDGED',

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
     PERSIST ACKNOWLEDGEMENT
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
            acknowledgedMeta
          ),

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
      .eq(
        'employee_id',
        context.employeeId
      )
      .select('*')
      .single()

  if (
    updateError ||
    !updated
  ) {
    console.error(
      '[AcknowledgeDocument] Update failed:',
      updateError
    )

    return NextResponse.json(
      {
        success:
          false,

        error:
          `Document acknowledgement could not be saved: ${
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

  /* ============================================================
     VERIFY DATABASE TRUTH
     ============================================================ */

  const verifiedMeta =
    parseDocumentMeta(
      updated.description
    )

  const verifiedStatus =
    normalizeStatus(
      verifiedMeta.status
    )

  if (
    verifiedStatus !==
    'ACKNOWLEDGED'
  ) {
    return NextResponse.json(
      {
        success:
          false,

        error:
          'Document acknowledgement was written but could not be verified in the database.',
      },
      {
        status:
          500,
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
        `Employee acknowledged receipt of official document ${
          verifiedMeta.documentNumber ||
          verifiedMeta.referenceNumber ||
          id
        }.`,

      reason:
        'DOCUMENT_ACKNOWLEDGMENT',
    })
  } catch (
    auditError
  ) {
    console.error(
      '[AcknowledgeDocument] Audit failed:',
      auditError
    )
  }

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
        } acknowledged successfully.`,

      status:
        responseDocument.status,

      acknowledgedAt:
        responseDocument.acknowledgedAt,

      document:
        responseDocument,
    },
    {
      status:
        200,
    }
  )
}
