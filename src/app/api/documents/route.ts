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
  computeExpiryStatus,
  getCategoryLabel,
  type DocumentLifecycleStatus,
} from '@/lib/types/document'

function parseMetadata(
  description: unknown
): Record<string, any> {
  if (!description) {
    return {}
  }

  if (
    typeof description === 'object'
  ) {
    return {
      ...(description as Record<string, any>),
    }
  }

  try {
    const parsed = JSON.parse(String(description))
    return (
      parsed &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed)
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
  const normalized = String(value || '')
    .trim()
    .toUpperCase()

  const valid: DocumentLifecycleStatus[] = [
    'DRAFT',
    'UPLOADED',
    'PENDING_VERIFICATION',
    'VERIFIED',
    'REJECTED',
    'REPLACEMENT_REQUESTED',
    'EXPIRED',
    'ARCHIVED',
    'APPROVED',
    'ISSUED',
    'ACKNOWLEDGED',
    'SUPERSEDED',
  ]

  return valid.includes(normalized as DocumentLifecycleStatus)
    ? (normalized as DocumentLifecycleStatus)
    : 'DRAFT'
}

function mapDocument(
  row: any,
  meta: Record<string, any>
) {
  const status = normalizeStatus(row.status || meta.status)
  const expiryDate = row.expiry_date || meta.expiryDate || meta.expiry_date || null
  const expiryInfo = computeExpiryStatus(expiryDate)
  const categoryCode = row.category || meta.category || 'employment_hr'

  return {
    id: row.id,
    companyId: row.company_id,
    employeeId: row.employee_id,

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

    employeeEmail:
      row.employees?.official_email ||
      meta.content?.employeeEmail ||
      '',

    departmentName:
      row.employees?.departments?.name ||
      row.employees?.department ||
      meta.content?.departmentName ||
      '',

    designationName:
      row.employees?.designations?.name ||
      row.employees?.designation ||
      meta.content?.designationName ||
      '',

    category: categoryCode,
    categoryName: getCategoryLabel(categoryCode),
    subcategory: row.subcategory || meta.subcategory || null,

    documentType:
      meta.documentType ||
      meta.document_type ||
      row.document_type ||
      categoryCode ||
      'custom_letter',

    documentNumber:
      meta.documentNumber ||
      meta.referenceNumber ||
      meta.document_number ||
      row.reference_number ||
      row.document_number ||
      `HRK/DOC/${String(row.id || '').slice(0, 6)}`,

    referenceNumber:
      row.reference_number ||
      meta.referenceNumber ||
      meta.documentNumber ||
      null,

    issuingAuthority:
      row.issuing_authority ||
      meta.issuingAuthority ||
      'Haryak Technologies India Private Limited',

    title:
      row.title ||
      meta.subject ||
      'Official Document',

    description:
      typeof meta.description === 'string'
        ? meta.description
        : row.title || '',

    fileName:
      row.file_name ||
      meta.fileName ||
      '',

    fileUrl:
      row.file_url ||
      meta.fileUrl ||
      null,

    fileSize:
      Number(row.file_size || meta.fileSize || 0),

    mimeType:
      row.mime_type ||
      meta.mimeType ||
      'application/pdf',

    checksumSha256:
      row.checksum_sha256 ||
      meta.checksumSha256 ||
      meta.fileHash ||
      null,

    version:
      Number(
        row.version ||
        meta.version ||
        1
      ),

    status,

    verificationStatus:
      row.verification_status ||
      meta.verificationStatus ||
      (status === 'VERIFIED' ? 'verified' : status === 'REJECTED' ? 'rejected' : 'unverified'),

    verifiedBy:
      row.verified_by ||
      meta.verifiedBy ||
      null,

    verifiedAt:
      row.verified_at ||
      meta.verifiedAt ||
      null,

    verificationNotes:
      row.verification_notes ||
      meta.verificationNotes ||
      null,

    rejectionReason:
      row.rejection_reason ||
      meta.rejectionReason ||
      null,

    replacementRequestedAt:
      row.replacement_requested_at ||
      meta.replacementRequestedAt ||
      null,

    replacementReason:
      row.replacement_reason ||
      meta.replacementReason ||
      null,

    issueDate:
      row.issue_date ||
      meta.issueDate ||
      meta.issue_date ||
      row.created_at?.split('T')[0] ||
      '',

    effectiveDate:
      row.effective_date ||
      meta.effectiveDate ||
      meta.effective_date ||
      '',

    expiryDate,
    expiryStatus: expiryInfo.status,
    daysUntilExpiry: expiryInfo.daysRemaining,

    isArchived:
      Boolean(row.is_archived || meta.isArchived),

    archivedAt:
      row.archived_at ||
      meta.archivedAt ||
      null,

    retentionPeriodMonths:
      Number(row.retention_period_months || meta.retentionPeriodMonths || 84),

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
      row.acknowledged_at ||
      meta.acknowledgedAt ||
      meta.acknowledged_at ||
      null,

    acknowledgedBy:
      row.acknowledged_by ||
      meta.acknowledgedBy ||
      meta.acknowledged_by ||
      null,

    content:
      meta.content ||
      meta.documentContent ||
      meta.document_content ||
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
      'private',

    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function GET(request: NextRequest) {
  const resolved = await resolveRequestContext()

  if (!resolved.ok) {
    return NextResponse.json(
      {
        success: false,
        error: resolved.error.message,
      },
      {
        status: resolved.error.status,
      }
    )
  }

  const { context } = resolved
  const userIsAdmin = isAdmin(context)

  const { searchParams } = new URL(request.url)
  const employeeIdParam = searchParams.get('employee_id')
  const typeParam = searchParams.get('type')
  const categoryParam = searchParams.get('category')
  const statusParam = searchParams.get('status')
  const expiryParam = searchParams.get('expiry')
  const includeArchived = searchParams.get('archived') === 'true'
  const searchParam = searchParams.get('search')?.trim().toLowerCase()

  const supabase = createAdminClient()
  if (!supabase) {
    return NextResponse.json(
      {
        success: false,
        error: 'Database unavailable.',
      },
      {
        status: 503,
      }
    )
  }

  let query = supabase
    .from('documents')
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
        employment_status,
        departments:department_id(name),
        designations:designation_id(name)
      )
    `)
    .eq('company_id', context.companyId)
    .neq('document_type', 'letterhead')
    .order('created_at', { ascending: false })

  /* ============================================================
     ADMIN QUERY
     ============================================================ */
  if (userIsAdmin) {
    if (employeeIdParam) {
      query = query.eq('employee_id', employeeIdParam)
    }

    if (typeParam) {
      query = query.eq('document_type', typeParam)
    }

    if (categoryParam && categoryParam !== 'ALL') {
      query = query.eq('category', categoryParam)
    }
  } else {
    /* ==========================================================
       EMPLOYEE PORTAL — STRICT SERVER-SIDE ISOLATION
       ========================================================== */
    if (!context.employeeId) {
      return NextResponse.json({
        success: true,
        documents: [],
        total: 0,
      })
    }

    /**
     * Strict isolation:
     * Non-admin employee can only see their own documents or company-wide documents.
     */
    query = query.or(
      `employee_id.eq.${context.employeeId},visibility.in.(company,company_wide)`
    )
  }

  const { data, error } = await query

  if (error) {
    console.error('[GET /api/documents] Query failed:', error)
    return NextResponse.json(
      {
        success: false,
        error: `Unable to load documents: ${error.message}`,
      },
      {
        status: 500,
      }
    )
  }

  const mapped = (data || []).map((row: any) => {
    const meta = parseMetadata(row.description)
    return mapDocument(row, meta)
  })

  /* ============================================================
     AUTHORITATIVE LIFECYCLE & SEARCH FILTERING
     ============================================================ */
  let list = mapped.filter(document => {
    // 1. Archival filter
    if (!includeArchived && document.isArchived) {
      return false
    }

    // 2. Admin vs Employee visibility
    if (userIsAdmin) {
      if (statusParam && statusParam !== 'ALL') {
        const targetStatus = normalizeStatus(statusParam)
        if (document.status !== targetStatus) {
          return false
        }
      }
    } else {
      /**
       * Non-admin employee access rules:
       * - Company policies: visible
       * - Uploaded documents by/for this employee: visible (tracked with lifecycle status)
       * - Official generated letters: ONLY visible if ISSUED or ACKNOWLEDGED.
       *   Draft or internal pending letters remain hidden.
       */
      const isCompanyDoc =
        document.visibility === 'company' || document.visibility === 'company_wide'

      if (isCompanyDoc) {
        return true
      }

      const isGeneratedLetter = [
        'offer_letter',
        'appointment_letter',
        'joining_letter',
        'salary_revision',
        'relieving_letter',
        'experience_letter',
        'resignation_acceptance',
        'custom_letter',
      ].includes(document.documentType)

      if (isGeneratedLetter) {
        return (
          document.status === 'ISSUED' || document.status === 'ACKNOWLEDGED'
        )
      }

      // Uploaded employee documents (PAN, Aadhaar, certificates) are visible so employee can track verification
      return true
    }

    return true
  })

  // 3. Expiry filtering
  if (expiryParam && expiryParam !== 'ALL') {
    list = list.filter(doc => doc.expiryStatus.toLowerCase() === expiryParam.toLowerCase())
  }

  // 4. In-memory search filtering (by title, ref no, employee name/code)
  if (searchParam) {
    list = list.filter(doc => {
      return (
        (doc.title && doc.title.toLowerCase().includes(searchParam)) ||
        (doc.documentNumber && doc.documentNumber.toLowerCase().includes(searchParam)) ||
        (doc.employeeName && doc.employeeName.toLowerCase().includes(searchParam)) ||
        (doc.employeeCode && doc.employeeCode.toLowerCase().includes(searchParam)) ||
        (doc.categoryName && doc.categoryName.toLowerCase().includes(searchParam))
      )
    })
  }

  return NextResponse.json({
    success: true,
    documents: list,
    total: list.length,
    stats: {
      total: list.length,
      pendingVerification: list.filter(d => d.status === 'PENDING_VERIFICATION' || d.status === 'UPLOADED').length,
      verified: list.filter(d => d.status === 'VERIFIED').length,
      rejected: list.filter(d => d.status === 'REJECTED' || d.status === 'REPLACEMENT_REQUESTED').length,
      expiringSoon: list.filter(d => d.expiryStatus === 'EXPIRING_SOON').length,
      expired: list.filter(d => d.expiryStatus === 'EXPIRED').length,
    },
  })
}
