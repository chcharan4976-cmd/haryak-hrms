import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveRequestContext, isAdmin } from '@/lib/services/company-resolver'
import { createAuditLog } from '@/lib/services/audit-service'
import { getActiveLetterhead } from '@/lib/services/letterhead-service'

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
      employees:employee_id(id, employee_code, full_name, department_id, designation_id)
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
    if (doc.employee_id !== context.employeeId) {
      return NextResponse.json({ success: false, error: 'Forbidden: Access to another employee document is denied.' }, { status: 403 })
    }
    // Normal employees must only see ISSUED or ACKNOWLEDGED documents
    if (meta.status !== 'ISSUED' && meta.status !== 'ACKNOWLEDGED') {
      return NextResponse.json({ success: false, error: 'Document not yet published or issued.' }, { status: 403 })
    }
  }

  const activeLetterhead = await getActiveLetterhead(context.companyId)

  return NextResponse.json({
    success: true,
    document: {
      id: doc.id,
      companyId: doc.company_id,
      employeeId: doc.employee_id,
      employeeCode: doc.employees?.employee_code,
      employeeName: doc.employees?.full_name,
      documentType: doc.document_type,
      documentNumber: meta.documentNumber,
      title: doc.title,
      fileName: doc.file_name,
      fileUrl: doc.file_url,
      version: doc.version || 1,
      status: meta.status || 'DRAFT',
      issueDate: meta.issueDate,
      effectiveDate: meta.effectiveDate,
      generatedAt: meta.generatedAt || doc.created_at,
      issuedAt: meta.issuedAt,
      content: meta.content,
      letterheadVersion: meta.letterheadVersion || 1,
      supersedesDocumentId: meta.supersedesDocumentId,
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
  const { content, status, issueDate, effectiveDate, changeReason } = body

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

  // If already ISSUED, create version 2 instead of silently overwriting!
  if (meta.status === 'ISSUED' || meta.status === 'ACKNOWLEDGED') {
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
    }

    const { data: vDoc, error: vErr } = await supabase
      .from('documents')
      .insert({
        company_id: context.companyId,
        employee_id: existingDoc.employee_id,
        document_type: existingDoc.document_type,
        title: content?.subject || existingDoc.title,
        description: JSON.stringify(newMeta),
        file_url: existingDoc.file_url,
        file_name: existingDoc.file_name.replace(/(\.pdf)/i, `_v${newVersion}$1`),
        version: newVersion,
        visibility: 'private',
        uploaded_by: context.authUserId,
      })
      .select()
      .single()

  if (vErr) return NextResponse.json({ success: false, error: vErr.message }, { status: 500 })

    // Mark previous version as superseded
    meta.status = 'SUPERSEDED'
    meta.supersededBy = vDoc.id
    await supabase.from('documents').update({ description: JSON.stringify(meta) }).eq('id', existingDoc.id)

    return NextResponse.json({
      success: true,
      message: `Created Document Version ${newVersion} (Draft). Previous version marked as SUPERSEDED.`,
      document: { id: vDoc.id, version: newVersion, status: 'DRAFT' },
    })
  }

  // Update existing draft
  if (content) meta.content = content
  if (status) meta.status = status
  if (issueDate) meta.issueDate = issueDate
  if (effectiveDate) meta.effectiveDate = effectiveDate

  const { error: updateErr } = await supabase
    .from('documents')
    .update({
      title: content?.subject || existingDoc.title,
      description: JSON.stringify(meta),
      updated_at: new Date().toISOString(),
    })
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
    description: `Edited document draft ${meta.documentNumber || id}`,
    reason: 'DOCUMENT_EDIT',
  })

  return NextResponse.json({
    success: true,
    message: 'Document draft updated successfully.',
  })
}
