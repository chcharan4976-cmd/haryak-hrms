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
    return NextResponse.json({ success: false, error: 'Unauthorized: Only admins can approve official documents.' }, { status: 403 })
  }

  const { id } = await params
  const supabase = createAdminClient()
  if (!supabase) return NextResponse.json({ success: false, error: 'Database unavailable' }, { status: 503 })

  const { data: doc, error } = await supabase
    .from('documents')
    .select('*')
    .eq('company_id', context.companyId)
    .eq('id', id)
    .single()

  if (error || !doc) {
    return NextResponse.json({ success: false, error: 'Document not found' }, { status: 404 })
  }

  let meta: any = {}
  try { meta = JSON.parse(doc.description || '{}') } catch {}

  meta.status = 'APPROVED'
  meta.approvedAt = new Date().toISOString()
  meta.approvedBy = context.fullName

  await supabase
    .from('documents')
    .update({
      status: 'APPROVED',
      description: JSON.stringify(meta),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  await createAuditLog({
    companyId: context.companyId,
    userId: context.authUserId,
    userEmail: context.email,
    userName: context.fullName,
    action: 'approved',
    entityType: 'document',
    entityId: id,
    entityName: doc.title,
    description: `Approved official letter ${meta.documentNumber || id}`,
    reason: 'DOCUMENT_APPROVAL',
  })

  return NextResponse.json({
    success: true,
    message: `Document ${meta.documentNumber || id} is APPROVED and ready for issuance.`,
  })
}
