import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveRequestContext, isAdmin } from '@/lib/services/company-resolver'
import { createAuditLog } from '@/lib/services/audit-service'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolved = await resolveRequestContext()
  if (!resolved.ok) {
    return NextResponse.json({ success: false, error: resolved.error.message }, { status: resolved.error.status })
  }
  const { context } = resolved

  if (!isAdmin(context)) {
    return NextResponse.json({ success: false, error: 'Unauthorized: Only HR Administrators can verify documents.' }, { status: 403 })
  }

  const { id } = await params
  const body = await request.json()
  const { action, notes, reason } = body

  if (!action || !['VERIFY', 'REJECT', 'REQUEST_REPLACEMENT', 'ARCHIVE', 'RESTORE'].includes(action)) {
    return NextResponse.json({ success: false, error: 'Invalid verification action.' }, { status: 400 })
  }

  if ((action === 'REJECT' || action === 'REQUEST_REPLACEMENT') && (!reason || !reason.trim())) {
    return NextResponse.json({ success: false, error: 'A specific reason is required for rejection or replacement requests.' }, { status: 400 })
  }

  const supabase = createAdminClient()
  if (!supabase) return NextResponse.json({ success: false, error: 'Database unavailable' }, { status: 503 })

  const { data: doc, error: docErr } = await supabase
    .from('documents')
    .select(`
      *,
      employees:employee_id(id, user_id, full_name, employee_code, official_email)
    `)
    .eq('company_id', context.companyId)
    .eq('id', id)
    .maybeSingle()

  if (docErr || !doc) {
    return NextResponse.json({ success: false, error: 'Document not found.' }, { status: 404 })
  }

  const now = new Date().toISOString()
  let meta: any = {}
  try { meta = JSON.parse(doc.description || '{}') } catch {}

  const updates: Record<string, any> = {
    updated_at: now,
  }

  let notificationMessage = ''
  let notificationTitle = ''

  switch (action) {
    case 'VERIFY':
      updates.status = 'VERIFIED'
      updates.verification_status = 'verified'
      updates.verified_by = context.authUserId
      updates.verified_at = now
      updates.verification_notes = notes || null
      updates.rejection_reason = null
      meta.status = 'VERIFIED'
      meta.verifiedBy = context.fullName
      meta.verifiedAt = now
      meta.verificationNotes = notes || null
      notificationTitle = `Document Verified: ${doc.title}`
      notificationMessage = `Your submitted document "${doc.title}" has been reviewed and verified by HR.`
      break

    case 'REJECT':
      updates.status = 'REJECTED'
      updates.verification_status = 'rejected'
      updates.rejection_reason = reason.trim()
      updates.verification_notes = notes || null
      meta.status = 'REJECTED'
      meta.rejectionReason = reason.trim()
      meta.rejectedBy = context.fullName
      meta.rejectedAt = now
      notificationTitle = `Document Rejected: ${doc.title}`
      notificationMessage = `Your submitted document "${doc.title}" was rejected by HR. Reason: ${reason.trim()}. Please submit a replacement.`
      break

    case 'REQUEST_REPLACEMENT':
      updates.status = 'REPLACEMENT_REQUESTED'
      updates.verification_status = 'replacement_requested'
      updates.replacement_requested_at = now
      updates.replacement_reason = reason.trim()
      meta.status = 'REPLACEMENT_REQUESTED'
      meta.replacementReason = reason.trim()
      meta.replacementRequestedAt = now
      notificationTitle = `Action Required: Replacement Document Requested`
      notificationMessage = `HR requested a replacement for document "${doc.title}". Note: ${reason.trim()}. Open My Documents to upload a new version.`
      break

    case 'ARCHIVE':
      updates.is_archived = true
      updates.archived_at = now
      updates.archived_by = context.authUserId
      meta.isArchived = true
      meta.archivedAt = now
      break

    case 'RESTORE':
      updates.is_archived = false
      updates.archived_at = null
      updates.archived_by = null
      meta.isArchived = false
      break
  }

  updates.description = JSON.stringify(meta)

  const { data: updatedDoc, error: updateErr } = await supabase
    .from('documents')
    .update(updates)
    .eq('id', id)
    .eq('company_id', context.companyId)
    .select()
    .single()

  if (updateErr) {
    return NextResponse.json({ success: false, error: updateErr.message }, { status: 500 })
  }

  // Notify employee if linked
  const employeeUserId = doc.employees?.user_id
  if (employeeUserId && notificationTitle) {
    try {
      await supabase.from('notifications').insert({
        company_id: context.companyId,
        user_id: employeeUserId,
        title: notificationTitle,
        message: notificationMessage,
        type: 'document_verification',
        reference_type: 'document',
        reference_id: id,
        action_url: '/portal/my-documents',
      })
    } catch (notifErr) {
      console.warn('[VerifyDocument] Notification dispatch warning:', notifErr)
    }
  }

  // Audit log
  await createAuditLog({
    companyId: context.companyId,
    userId: context.authUserId,
    userEmail: context.email,
    userName: context.fullName,
    action: action === 'VERIFY' ? 'approved' : action === 'REJECT' ? 'rejected' : action === 'ARCHIVE' ? 'deleted' : 'updated',
    entityType: 'document',
    entityId: id,
    entityName: doc.title,
    description: `Document ${doc.title} ${action} by ${context.fullName}${reason ? ` (${reason})` : ''}`,
    reason: `DOCUMENT_${action}`,
  })

  return NextResponse.json({
    success: true,
    message: `Document successfully updated: ${action}.`,
    document: updatedDoc,
  })
}
