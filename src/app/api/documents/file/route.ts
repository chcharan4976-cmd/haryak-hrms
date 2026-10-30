import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestContext, isAdmin } from '@/lib/services/company-resolver'
import { retrieveDocumentFileBuffer } from '@/lib/services/document-storage-service'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  const resolved = await resolveRequestContext()
  if (!resolved.ok) {
    return NextResponse.json({ success: false, error: resolved.error.message }, { status: resolved.error.status })
  }
  const { context } = resolved
  const userIsAdmin = isAdmin(context)

  const { searchParams } = new URL(request.url)
  const storagePath = searchParams.get('path')
  const download = searchParams.get('download') === 'true'

  if (!storagePath) {
    return NextResponse.json({ success: false, error: 'File path is required.' }, { status: 400 })
  }

  // Anti-path-traversal check
  if (storagePath.includes('..') || storagePath.startsWith('/') || storagePath.startsWith('\\')) {
    return NextResponse.json({ success: false, error: 'Invalid path.' }, { status: 400 })
  }

  // Must begin with user's company ID
  if (!storagePath.startsWith(context.companyId)) {
    return NextResponse.json({ success: false, error: 'Forbidden: Unauthorized company scope.' }, { status: 403 })
  }

  // If non-admin employee, verify file belongs to them or is company-wide
  if (!userIsAdmin) {
    const isCompanyWide = storagePath.includes('/company-wide/')
    const isOwnFile = context.employeeId && storagePath.includes(`/employees/${context.employeeId}/`)

    if (!isCompanyWide && !isOwnFile) {
      return NextResponse.json({ success: false, error: 'Forbidden: Access to another employee file is denied.' }, { status: 403 })
    }
  }

  const result = await retrieveDocumentFileBuffer(storagePath)
  if (!result) {
    return NextResponse.json({ success: false, error: 'File not found on storage.' }, { status: 404 })
  }

  const fileName = storagePath.split('/').pop() || 'document'
  const disposition = download ? `attachment; filename="${fileName}"` : `inline; filename="${fileName}"`

  return new NextResponse(new Uint8Array(result.buffer), {
    status: 200,
    headers: {
      'Content-Type': result.mimeType,
      'Content-Disposition': disposition,
      'Content-Length': String(result.buffer.length),
      'Cache-Control': 'private, max-age=3600, no-transform',
    },
  })
}
