import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveRequestContext, isAdmin } from '@/lib/services/company-resolver'

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
  const userIsAdmin = isAdmin(context)

  const supabase = createAdminClient()
  if (!supabase) return NextResponse.json({ success: false, error: 'Database unavailable' }, { status: 503 })

  // 1. Verify parent document access
  const { data: doc, error: docErr } = await supabase
    .from('documents')
    .select('id, company_id, employee_id, visibility, title')
    .eq('company_id', context.companyId)
    .eq('id', id)
    .maybeSingle()

  if (docErr || !doc) {
    return NextResponse.json({ success: false, error: 'Document not found.' }, { status: 404 })
  }

  if (!userIsAdmin) {
    const isCompanyWide = doc.visibility === 'company' || doc.visibility === 'company_wide'
    const isOwn = context.employeeId && doc.employee_id === context.employeeId
    if (!isCompanyWide && !isOwn) {
      return NextResponse.json({ success: false, error: 'Forbidden: Access denied.' }, { status: 403 })
    }
  }

  // 2. Query versions
  const { data: versions, error: vErr } = await supabase
    .from('document_versions')
    .select(`
      *,
      users:uploaded_by(full_name, email)
    `)
    .eq('document_id', id)
    .order('version_number', { ascending: false })

  if (vErr) {
    return NextResponse.json({ success: false, error: vErr.message }, { status: 500 })
  }

  const mapped = (versions || []).map((v: any) => ({
    id: v.id,
    documentId: v.document_id,
    versionNumber: v.version_number,
    fileUrl: v.file_url,
    fileName: v.file_name,
    fileSize: v.file_size,
    mimeType: v.mime_type,
    checksumSha256: v.checksum_sha256,
    changeSummary: v.change_summary,
    uploadedBy: v.uploaded_by,
    uploadedByName: v.users?.full_name || 'System',
    createdAt: v.created_at,
  }))

  return NextResponse.json({
    success: true,
    documentId: id,
    documentTitle: doc.title,
    versions: mapped,
  })
}
