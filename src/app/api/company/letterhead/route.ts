import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestContext, isAdmin } from '@/lib/services/company-resolver'
import { getActiveLetterhead, getLetterheadHistory } from '@/lib/services/letterhead-service'
import { createAdminClient } from '@/lib/supabase/admin'
import { createAuditLog } from '@/lib/services/audit-service'

export async function GET(request: NextRequest) {
  const resolved = await resolveRequestContext()
  if (!resolved.ok) {
    return NextResponse.json({ success: false, error: resolved.error.message }, { status: resolved.error.status })
  }
  const { context } = resolved

  const active = await getActiveLetterhead(context.companyId)
  const history = await getLetterheadHistory(context.companyId)

  return NextResponse.json({
    success: true,
    letterhead: active,
    history,
  })
}

export async function POST(request: NextRequest) {
  const resolved = await resolveRequestContext()
  if (!resolved.ok) {
    return NextResponse.json({ success: false, error: resolved.error.message }, { status: resolved.error.status })
  }
  const { context } = resolved
  if (!isAdmin(context)) {
    return NextResponse.json({ success: false, error: 'Unauthorized: Only admins can manage letterhead.' }, { status: 403 })
  }

  const body = await request.json()
  const { fileUrl, fileName, mimeType, headerImagePath, footerImagePath } = body

  if (!fileUrl) {
    return NextResponse.json({ success: false, error: 'Missing fileUrl for letterhead asset' }, { status: 400 })
  }

  const supabase = createAdminClient()
  if (!supabase) return NextResponse.json({ success: false, error: 'Database unavailable' }, { status: 503 })

  const history = await getLetterheadHistory(context.companyId)
  const nextVersion = history.length > 0 ? Math.max(...history.map(h => h.version)) + 1 : 1

  // Mark previous letterhead versions as inactive
  const { data: existing } = await supabase
    .from('documents')
    .select('id, description')
    .eq('company_id', context.companyId)
    .eq('document_type', 'letterhead')

  if (existing) {
    for (const doc of existing) {
      try {
        const meta = JSON.parse(doc.description || '{}')
        meta.isActive = false
        meta.archivedAt = new Date().toISOString()
        await supabase.from('documents').update({ description: JSON.stringify(meta) }).eq('id', doc.id)
      } catch {}
    }
  }

  // Insert new version
  const meta = {
    isActive: true,
    version: nextVersion,
    uploadedBy: context.fullName,
    headerImagePath: headerImagePath || '/letterhead/header.png',
    footerImagePath: footerImagePath || '/letterhead/footer.jpg',
  }

  const { data: newDoc, error: insertErr } = await supabase
    .from('documents')
    .insert({
      company_id: context.companyId,
      document_type: 'letterhead',
      title: `Official Letterhead V${nextVersion}`,
      description: JSON.stringify(meta),
      file_url: fileUrl,
      file_name: fileName || `Haryak_Official_Letterhead_v${nextVersion}.pdf`,
      mime_type: mimeType || 'application/pdf',
      version: nextVersion,
      visibility: 'company',
      uploaded_by: context.authUserId,
    })
    .select()
    .single()

  if (insertErr) {
    return NextResponse.json({ success: false, error: insertErr.message }, { status: 500 })
  }

  await createAuditLog({
    companyId: context.companyId,
    userId: context.authUserId,
    userEmail: context.email,
    userName: context.fullName,
    action: 'created',
    entityType: 'document',
    entityId: newDoc.id,
    entityName: `Official Letterhead V${nextVersion}`,
    description: `Uploaded and activated official company letterhead version ${nextVersion}`,
    reason: 'COMPANY_LETTERHEAD_UPDATE',
  })

  return NextResponse.json({
    success: true,
    message: `Official Letterhead version ${nextVersion} activated successfully.`,
    letterhead: {
      id: newDoc.id,
      version: nextVersion,
      fileUrl,
      isActive: true,
    },
  })
}
