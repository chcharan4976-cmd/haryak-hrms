import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveRequestContext, isAdmin } from '@/lib/services/company-resolver'
import { createAuditLog } from '@/lib/services/audit-service'
import { storeDocumentFile } from '@/lib/services/document-storage-service'
import { getCategoryLabel } from '@/lib/types/document'

export async function POST(request: NextRequest) {
  const resolved = await resolveRequestContext()
  if (!resolved.ok) {
    return NextResponse.json(
      { success: false, error: resolved.error.message },
      { status: resolved.error.status }
    )
  }
  const { context } = resolved
  const userIsAdmin = isAdmin(context)

  let formData: FormData
  try {
    formData = await request.formData()
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: 'Malformed multipart form data: ' + err.message },
      { status: 400 }
    )
  }

  const file = formData.get('file') as File | null
  if (!file) {
    return NextResponse.json(
      { success: false, error: 'No file provided for upload.' },
      { status: 400 }
    )
  }

  const title = (formData.get('title') as string | null)?.trim() || file.name
  const category = (formData.get('category') as string | null)?.trim() || 'identity_onboarding'
  const subcategory = (formData.get('subcategory') as string | null)?.trim() || null
  const documentType = (formData.get('documentType') as string | null)?.trim() || category
  const rawEmployeeId = (formData.get('employeeId') as string | null)?.trim() || null
  const issueDate = (formData.get('issueDate') as string | null)?.trim() || new Date().toISOString().split('T')[0]
  const effectiveDate = (formData.get('effectiveDate') as string | null)?.trim() || null
  const expiryDate = (formData.get('expiryDate') as string | null)?.trim() || null
  const issuingAuthority = (formData.get('issuingAuthority') as string | null)?.trim() || 'Haryak Technologies India Private Limited'
  const referenceNumber = (formData.get('referenceNumber') as string | null)?.trim() || null
  const descriptionText = (formData.get('description') as string | null)?.trim() || ''
  const replacesDocumentId = (formData.get('replacesDocumentId') as string | null)?.trim() || null
  const isCompanyWide = formData.get('isCompanyWide') === 'true'

  // Server-side identity & permission enforcement
  let targetEmployeeId: string | null = null
  let visibility: 'employee' | 'company' | 'private' = 'employee'

  if (userIsAdmin) {
    if (isCompanyWide) {
      targetEmployeeId = null
      visibility = 'company'
    } else {
      targetEmployeeId = rawEmployeeId
      visibility = 'employee'
    }
  } else {
    // Non-admin employee: STRICT ISOLATION
    if (!context.employeeId) {
      return NextResponse.json(
        { success: false, error: 'Employee profile not linked to user account.' },
        { status: 403 }
      )
    }

    // Force context employee ID regardless of client input
    targetEmployeeId = context.employeeId
    visibility = 'employee'

    if (rawEmployeeId && rawEmployeeId !== context.employeeId) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: You cannot upload documents for another employee.' },
        { status: 403 }
      )
    }
  }

  const supabase = createAdminClient()
  if (!supabase) {
    return NextResponse.json(
      { success: false, error: 'Database unavailable' },
      { status: 503 }
    )
  }

  // If target employee is specified, resolve employee code and name
  let employeeCode = ''
  let employeeName = ''
  if (targetEmployeeId) {
    const { data: empRecord } = await supabase
      .from('employees')
      .select('employee_code, full_name')
      .eq('id', targetEmployeeId)
      .eq('company_id', context.companyId)
      .maybeSingle()

    if (empRecord) {
      employeeCode = empRecord.employee_code
      employeeName = empRecord.full_name
    }
  }

  // 1. Store the file securely
  let uploadResult
  try {
    uploadResult = await storeDocumentFile({
      companyId: context.companyId,
      employeeId: targetEmployeeId,
      file,
      originalName: file.name,
      mimeType: file.type || 'application/octet-stream',
      size: file.size,
      userId: context.authUserId,
      userName: context.fullName,
    })
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'File upload failed.' },
      { status: 400 }
    )
  }

  const now = new Date().toISOString()
  const initialStatus = userIsAdmin ? 'VERIFIED' : 'PENDING_VERIFICATION'

  // 2. Handle Replacement of Rejected/Existing Document
  if (replacesDocumentId) {
    const { data: existingDoc, error: existingErr } = await supabase
      .from('documents')
      .select('*')
      .eq('company_id', context.companyId)
      .eq('id', replacesDocumentId)
      .maybeSingle()

    if (existingErr || !existingDoc) {
      return NextResponse.json(
        { success: false, error: 'Original document to replace was not found.' },
        { status: 404 }
      )
    }

    // Employee isolation check on replacement
    if (!userIsAdmin && existingDoc.employee_id !== context.employeeId) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Cannot replace another employee document.' },
        { status: 403 }
      )
    }

    const nextVersion = (existingDoc.version || 1) + 1

    // A. Record in document_versions table
    await supabase.from('document_versions').insert({
      company_id: context.companyId,
      document_id: existingDoc.id,
      version_number: nextVersion,
      file_url: uploadResult.fileUrl,
      file_name: uploadResult.fileName,
      file_size: uploadResult.fileSize,
      mime_type: uploadResult.mimeType,
      checksum_sha256: uploadResult.checksumSha256,
      change_summary: `Replacement uploaded by ${context.fullName}: ${file.name}`,
      uploaded_by: context.authUserId,
      created_at: now,
    })

    // B. Update primary document
    let meta: any = {}
    try { meta = JSON.parse(existingDoc.description || '{}') } catch {}

    const updatedMeta = {
      ...meta,
      version: nextVersion,
      fileName: uploadResult.fileName,
      fileUrl: uploadResult.fileUrl,
      fileSize: uploadResult.fileSize,
      mimeType: uploadResult.mimeType,
      checksumSha256: uploadResult.checksumSha256,
      status: 'PENDING_VERIFICATION',
      replacementSubmittedAt: now,
      previousRejectionReason: existingDoc.rejection_reason || meta.rejectionReason,
    }

    const { data: updatedDoc, error: updateErr } = await supabase
      .from('documents')
      .update({
        file_url: uploadResult.fileUrl,
        file_name: uploadResult.fileName,
        file_size: uploadResult.fileSize,
        mime_type: uploadResult.mimeType,
        checksum_sha256: uploadResult.checksumSha256,
        version: nextVersion,
        status: 'PENDING_VERIFICATION',
        verification_status: 'unverified',
        rejection_reason: null,
        description: JSON.stringify(updatedMeta),
        updated_at: now,
      })
      .eq('id', existingDoc.id)
      .select()
      .single()

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
      entityId: existingDoc.id,
      entityName: existingDoc.title,
      description: `Uploaded replacement document v${nextVersion} for ${existingDoc.title}`,
      reason: 'DOCUMENT_REPLACEMENT',
    })

    return NextResponse.json({
      success: true,
      message: `Document replacement version ${nextVersion} uploaded successfully and is pending verification.`,
      document: updatedDoc,
    })
  }

  // 3. New Document Record
  const docMeta = {
    category,
    categoryName: getCategoryLabel(category),
    subcategory,
    documentType,
    referenceNumber,
    issuingAuthority,
    description: descriptionText,
    fileName: uploadResult.fileName,
    fileUrl: uploadResult.fileUrl,
    fileSize: uploadResult.fileSize,
    mimeType: uploadResult.mimeType,
    checksumSha256: uploadResult.checksumSha256,
    version: 1,
    status: initialStatus,
    issueDate,
    effectiveDate,
    expiryDate,
    uploadedBy: context.authUserId,
    uploadedByName: context.fullName,
    uploadedAt: now,
  }

  const { data: newDoc, error: insertErr } = await supabase
    .from('documents')
    .insert({
      company_id: context.companyId,
      employee_id: targetEmployeeId,
      document_type: documentType,
      category,
      subcategory,
      title,
      description: JSON.stringify(docMeta),
      file_url: uploadResult.fileUrl,
      file_name: uploadResult.fileName,
      file_size: uploadResult.fileSize,
      mime_type: uploadResult.mimeType,
      checksum_sha256: uploadResult.checksumSha256,
      version: 1,
      visibility,
      status: initialStatus,
      verification_status: userIsAdmin ? 'verified' : 'unverified',
      verified_by: userIsAdmin ? context.authUserId : null,
      verified_at: userIsAdmin ? now : null,
      issue_date: issueDate,
      effective_date: effectiveDate,
      expiry_date: expiryDate,
      issuing_authority: issuingAuthority,
      reference_number: referenceNumber,
      uploaded_by: context.authUserId,
      created_at: now,
      updated_at: now,
    })
    .select()
    .single()

  if (insertErr) {
    console.error('[UploadDocument] DB insert failed:', insertErr)
    return NextResponse.json(
      { success: false, error: `Document record creation failed: ${insertErr.message}` },
      { status: 500 }
    )
  }

  // 4. Record Version 1 in document_versions table
  try {
    await supabase.from('document_versions').insert({
      company_id: context.companyId,
      document_id: newDoc.id,
      version_number: 1,
      file_url: uploadResult.fileUrl,
      file_name: uploadResult.fileName,
      file_size: uploadResult.fileSize,
      mime_type: uploadResult.mimeType,
      checksum_sha256: uploadResult.checksumSha256,
      change_summary: `Initial upload by ${context.fullName}: ${file.name}`,
      uploaded_by: context.authUserId,
      created_at: now,
    })
  } catch (vErr) {
    console.warn('[UploadDocument] Version insert warning:', vErr)
  }

  // 5. Audit Log
  await createAuditLog({
    companyId: context.companyId,
    userId: context.authUserId,
    userEmail: context.email,
    userName: context.fullName,
    action: 'created',
    entityType: 'document',
    entityId: newDoc.id,
    entityName: title,
    description: `Uploaded document ${title} (${category}) for ${employeeName || 'Company'} (${employeeCode || 'N/A'})`,
    reason: 'DOCUMENT_UPLOAD',
  })

  return NextResponse.json({
    success: true,
    message: userIsAdmin
      ? `Document "${title}" uploaded and verified successfully.`
      : `Document "${title}" uploaded successfully. Verification is pending.`,
    document: newDoc,
  })
}
