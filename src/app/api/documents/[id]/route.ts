import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveRequestContext, isAdmin } from '@/lib/services/company-resolver'
import { createAuditLog } from '@/lib/services/audit-service'
import { getActiveLetterhead } from '@/lib/services/letterhead-service'
import { computeExpiryStatus, getCategoryLabel } from '@/lib/types/document'
import { deleteDocumentFile } from '@/lib/services/document-storage-service'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolved = await resolveRequestContext()
  if (!resolved.ok) {
    return NextResponse.json({ success: false, error: resolved.error.message }, { status: resolved.error.status })
  }
  const { context } = resolved
  const { id } = await params

  const supabase = createAdminClient()
  if (!supabase) return NextResponse.json({ success: false, error: 'Database unavailable' }, { status: 503 })

  const { data: doc, error } = await supabase
    .from('documents')
    .select(`
      *,
      employees:employee_id(
        id,
        employee_code,
        full_name,
        official_email,
        department_id,
        designation_id,
        departments:department_id(name),
        designations:designation_id(name)
      )
    `)
    .eq('company_id', context.companyId)
    .eq('id', id)
    .maybeSingle()

  if (error || !doc) {
    return NextResponse.json({ success: false, error: 'Document not found' }, { status: 404 })
  }

  let meta: any = {}
  try { meta = JSON.parse(doc.description || '{}') } catch {}

  const isUserAdmin = isAdmin(context)

  // Access control
  if (!isUserAdmin) {
    const isCompanyWide = doc.visibility === 'company' || doc.visibility === 'company_wide'
    if (doc.employee_id !== context.employeeId && !isCompanyWide) {
      return NextResponse.json({ success: false, error: 'Forbidden: Access to another employee document is denied.' }, { status: 403 })
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
    ].includes(doc.document_type)

    // Normal employees must only see ISSUED or ACKNOWLEDGED generated letters
    if (isGeneratedLetter && meta.status !== 'ISSUED' && meta.status !== 'ACKNOWLEDGED') {
      return NextResponse.json({ success: false, error: 'Document not yet published or issued.' }, { status: 403 })
    }
  }

  const activeLetterhead = await getActiveLetterhead(context.companyId)

  // Fetch version history
  const { data: versions } = await supabase
    .from('document_versions')
    .select('*, users:uploaded_by(full_name, email)')
    .eq('document_id', id)
    .order('version_number', { ascending: false })

  const mappedVersions = (versions || []).map((v: any) => ({
    id: v.id,
    documentId: v.document_id,
    versionNumber: v.version_number,
    fileUrl: v.file_url,
    fileName: v.file_name,
    fileSize: v.file_size,
    mimeType: v.mime_type,
    checksumSha256: v.checksum_sha256,
    changeSummary: v.change_summary,
    uploadedByName: v.users?.full_name || 'HR Admin',
    createdAt: v.created_at,
  }))

  const expiryDate = doc.expiry_date || meta.expiryDate || null
  const expiryInfo = computeExpiryStatus(expiryDate)
  const categoryCode = doc.category || meta.category || 'employment_hr'

  return NextResponse.json({
    success: true,
    document: {
      id: doc.id,
      companyId: doc.company_id,
      employeeId: doc.employee_id,
      employeeCode: doc.employees?.employee_code || meta.employeeCode || '',
      employeeName: doc.employees?.full_name || meta.employeeName || 'Company Wide',
      employeeEmail: doc.employees?.official_email || '',
      departmentName: doc.employees?.departments?.name || '',
      designationName: doc.employees?.designations?.name || '',

      category: categoryCode,
      categoryName: getCategoryLabel(categoryCode),
      subcategory: doc.subcategory || meta.subcategory || null,
      documentType: doc.document_type,
      documentNumber: meta.documentNumber || doc.reference_number || `HRK/DOC/${doc.id.slice(0, 6)}`,
      referenceNumber: doc.reference_number || meta.referenceNumber || null,
      issuingAuthority: doc.issuing_authority || meta.issuingAuthority || 'Haryak Technologies India Private Limited',
      title: doc.title,
      description: doc.title,

      fileName: doc.file_name,
      fileUrl: doc.file_url,
      fileSize: doc.file_size || 0,
      mimeType: doc.mime_type || 'application/pdf',
      checksumSha256: doc.checksum_sha256 || meta.checksumSha256 || null,

      version: doc.version || 1,
      status: doc.status || meta.status || 'DRAFT',
      verificationStatus: doc.verification_status || meta.verificationStatus || 'unverified',
      verifiedBy: doc.verified_by,
      verifiedByName: meta.verifiedBy,
      verifiedAt: doc.verified_at || meta.verifiedAt,
      verificationNotes: doc.verification_notes || meta.verificationNotes,
      rejectionReason: doc.rejection_reason || meta.rejectionReason,
      replacementRequestedAt: doc.replacement_requested_at || meta.replacementRequestedAt,
      replacementReason: doc.replacement_reason || meta.replacementReason,

      issueDate: doc.issue_date || meta.issueDate || doc.created_at?.split('T')[0],
      effectiveDate: doc.effective_date || meta.effectiveDate || '',
      expiryDate,
      expiryStatus: expiryInfo.status,
      daysUntilExpiry: expiryInfo.daysRemaining,

      isArchived: Boolean(doc.is_archived || meta.isArchived),
      archivedAt: doc.archived_at || meta.archivedAt,
      retentionPeriodMonths: doc.retention_period_months || 84,

      generatedAt: meta.generatedAt || doc.created_at,
      issuedAt: meta.issuedAt,
      acknowledgedAt: doc.acknowledged_at || meta.acknowledgedAt,
      content: meta.content,
      letterheadVersion: meta.letterheadVersion || 1,
      supersedesDocumentId: meta.supersedesDocumentId,
      visibility: doc.visibility || 'private',
      versions: mappedVersions,
      createdAt: doc.created_at,
      updatedAt: doc.updated_at,
    },
    letterhead: activeLetterhead,
  })
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolved = await resolveRequestContext()
  if (!resolved.ok) {
    return NextResponse.json({ success: false, error: resolved.error.message }, { status: resolved.error.status })
  }
  const { context } = resolved
  if (!isAdmin(context)) {
    return NextResponse.json({ success: false, error: 'Unauthorized: Only admins can edit documents.' }, { status: 403 })
  }

  const { id } = await params
  const body = await request.json()
  const { content, status, issueDate, effectiveDate, expiryDate, changeReason, category, subcategory, referenceNumber } = body

  const supabase = createAdminClient()
  if (!supabase) return NextResponse.json({ success: false, error: 'Database unavailable' }, { status: 503 })

  const { data: existingDoc } = await supabase
    .from('documents')
    .select('*')
    .eq('company_id', context.companyId)
    .eq('id', id)
    .maybeSingle()

  if (!existingDoc) {
    return NextResponse.json({ success: false, error: 'Document not found' }, { status: 404 })
  }

  let meta: any = {}
  try { meta = JSON.parse(existingDoc.description || '{}') } catch {}

  // If updating content on an already ISSUED document, create version 2 instead of silently overwriting!
  if (content && (meta.status === 'ISSUED' || meta.status === 'ACKNOWLEDGED')) {
    const newVersion = (existingDoc.version || 1) + 1
    const newMeta = {
      ...meta,
      version: newVersion,
      status: 'DRAFT',
      supersedesDocumentId: existingDoc.id,
      reasonForRevision: changeReason || 'Administrative content revision',
      generatedAt: new Date().toISOString(),
      generatedBy: context.fullName,
      content: content || meta.content,
      issueDate: issueDate || meta.issueDate,
      effectiveDate: effectiveDate || meta.effectiveDate,
      expiryDate: expiryDate !== undefined ? expiryDate : meta.expiryDate,
    }

    const { data: vDoc, error: vErr } = await supabase
      .from('documents')
      .insert({
        company_id: context.companyId,
        employee_id: existingDoc.employee_id,
        document_type: existingDoc.document_type,
        category: category || existingDoc.category,
        subcategory: subcategory || existingDoc.subcategory,
        reference_number: referenceNumber || existingDoc.reference_number,
        title: content?.subject || existingDoc.title,
        description: JSON.stringify(newMeta),
        file_url: existingDoc.file_url,
        file_name: existingDoc.file_name.replace(/(\.pdf)/i, `_v${newVersion}$1`),
        version: newVersion,
        visibility: 'private',
        status: 'DRAFT',
        uploaded_by: context.authUserId,
      })
      .select()
      .single()

    if (vErr) return NextResponse.json({ success: false, error: vErr.message }, { status: 500 })

    // Record in document_versions table
    await supabase.from('document_versions').insert({
      company_id: context.companyId,
      document_id: vDoc.id,
      version_number: newVersion,
      file_url: vDoc.file_url,
      file_name: vDoc.file_name,
      change_summary: changeReason || 'Administrative content revision',
      uploaded_by: context.authUserId,
      created_at: new Date().toISOString(),
    })

    // Mark previous version as superseded
    meta.status = 'SUPERSEDED'
    meta.supersededBy = vDoc.id
    await supabase.from('documents').update({ status: 'SUPERSEDED', description: JSON.stringify(meta) }).eq('id', existingDoc.id)

    return NextResponse.json({
      success: true,
      message: `Created Document Version ${newVersion} (Draft). Previous version marked as SUPERSEDED.`,
      document: { id: vDoc.id, version: newVersion, status: 'DRAFT' },
    })
  }

  // Update existing document metadata or draft content
  if (content) meta.content = content
  if (status) meta.status = status
  if (issueDate) meta.issueDate = issueDate
  if (effectiveDate !== undefined) meta.effectiveDate = effectiveDate || null
  if (expiryDate !== undefined) {
    const cleanExpiry = expiryDate ? String(expiryDate).slice(0, 10) : null
    meta.expiryDate = cleanExpiry
  }

  const updates: Record<string, any> = {
    title: content?.subject || existingDoc.title,
    description: JSON.stringify(meta),
    updated_at: new Date().toISOString(),
  }
  if (issueDate) updates.issue_date = issueDate
  if (effectiveDate !== undefined) updates.effective_date = effectiveDate || null
  if (expiryDate !== undefined) {
    updates.expiry_date = expiryDate ? String(expiryDate).slice(0, 10) : null
  }
  if (status) updates.status = status
  if (category) updates.category = category
  if (subcategory) updates.subcategory = subcategory
  if (referenceNumber) updates.reference_number = referenceNumber

  const { error: updateErr } = await supabase
    .from('documents')
    .update(updates)
    .eq('id', id)

  if (updateErr) {
    return NextResponse.json({ success: false, error: updateErr.message }, { status: 500 })
  }

  await createAuditLog({
    companyId: context.companyId,
    userId: context.authUserId,
    userEmail: context.email,
    userName: context.fullName,
    action: 'updated',
    entityType: 'document',
    entityId: id,
    entityName: meta.content?.subject || existingDoc.title,
    description: `Updated document ${meta.documentNumber || id} details (expiry: ${updates.expiry_date || 'none'})`,
    reason: 'DOCUMENT_EDIT',
  })

  return NextResponse.json({
    success: true,
    message: 'Document updated successfully.',
  })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolved = await resolveRequestContext()
  if (!resolved.ok) {
    return NextResponse.json({ success: false, error: resolved.error.message }, { status: resolved.error.status })
  }
  const { context } = resolved
  const userIsAdmin = isAdmin(context)

  const { id } = await params
  const supabase = createAdminClient()
  if (!supabase) return NextResponse.json({ success: false, error: 'Database unavailable' }, { status: 503 })

  // 1. Fetch document with employee information
  const { data: doc, error: docErr } = await supabase
    .from('documents')
    .select(`
      *,
      employees:employee_id(id, employee_code, full_name, user_id)
    `)
    .eq('company_id', context.companyId)
    .eq('id', id)
    .maybeSingle()

  if (docErr || !doc) {
    return NextResponse.json({ success: false, error: 'Document not found.' }, { status: 404 })
  }

  // 2. Strict permission enforcement
  if (!userIsAdmin) {
    // Non-admin employee can only delete their own uploaded documents
    if (doc.employee_id !== context.employeeId) {
      return NextResponse.json({ success: false, error: 'Forbidden: You can only delete your own documents.' }, { status: 403 })
    }

    if (doc.uploaded_by && doc.uploaded_by !== context.authUserId) {
      return NextResponse.json({ success: false, error: 'Forbidden: You can only delete documents that you uploaded.' }, { status: 403 })
    }

    const isOfficialLetter = [
      'offer_letter',
      'appointment_letter',
      'joining_letter',
      'salary_revision',
      'relieving_letter',
      'experience_letter',
      'resignation_acceptance',
      'custom_letter',
    ].includes(doc.document_type) || Boolean(doc.description?.includes('"content":')) || doc.category === 'company_policy' || doc.category === 'employment_hr'

    if (isOfficialLetter) {
      return NextResponse.json({
        success: false,
        error: 'Forbidden: Official company employment records cannot be deleted by employees.',
      }, { status: 403 })
    }

    if (doc.status === 'VERIFIED' || doc.verification_status === 'verified') {
      return NextResponse.json({
        success: false,
        error: 'Forbidden: Verified documents cannot be deleted without HR administrator approval.',
      }, { status: 403 })
    }
  }

  // 3. Check for soft-archive vs permanent delete
  const actionParam = request.nextUrl.searchParams.get('action')
  if (actionParam === 'archive') {
    const now = new Date().toISOString()
    const { error: archiveErr } = await supabase
      .from('documents')
      .update({
        is_archived: true,
        archived_at: now,
        archived_by: context.authUserId,
        status: 'ARCHIVED',
        updated_at: now,
      })
      .eq('id', id)

    if (archiveErr) {
      return NextResponse.json({ success: false, error: archiveErr.message }, { status: 500 })
    }

    await createAuditLog({
      companyId: context.companyId,
      userId: context.authUserId,
      userEmail: context.email,
      userName: context.fullName,
      action: 'deleted',
      entityType: 'document',
      entityId: id,
      entityName: doc.title,
      description: `Archived document "${doc.title}" (${doc.id})`,
      reason: 'DOCUMENT_ARCHIVE',
    })

    return NextResponse.json({
      success: true,
      message: 'Document safely archived.',
    })
  }

  // 4. Permanent deletion: clean up storage file if unreferenced
  if (doc.file_url) {
    try {
      const { count } = await supabase
        .from('documents')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', context.companyId)
        .eq('file_url', doc.file_url)
        .neq('id', id)

      if (!count || count === 0) {
        await deleteDocumentFile(doc.file_url)
      }
    } catch (storageErr) {
      console.warn('[DELETE document] Storage cleanup notice:', storageErr)
    }
  }

  // 5. Remove version history records
  await supabase.from('document_versions').delete().eq('document_id', id)

  // 6. Delete document row from database
  const { error: delErr } = await supabase.from('documents').delete().eq('id', id)
  if (delErr) {
    return NextResponse.json({ success: false, error: delErr.message }, { status: 500 })
  }

  // 7. Audit log
  await createAuditLog({
    companyId: context.companyId,
    userId: context.authUserId,
    userEmail: context.email,
    userName: context.fullName,
    action: 'deleted',
    entityType: 'document',
    entityId: id,
    entityName: doc.title,
    description: `Permanently deleted document "${doc.title}" (${doc.document_type}) for employee ${doc.employees?.full_name || 'N/A'} (${doc.employees?.employee_code || 'N/A'})`,
    reason: 'DOCUMENT_PERMANENT_DELETION',
  })

  return NextResponse.json({
    success: true,
    message: 'Document permanently deleted.',
  })
}

