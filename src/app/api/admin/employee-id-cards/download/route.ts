/**
 * Haryak Technologies India Private Limited
 * Temporary ID Card Secure Download Endpoint
 *
 * Route: GET /api/admin/employee-id-cards/download?path=...
 *
 * Security & Lifecycle Verifications:
 * 1. Authenticated Administrator check.
 * 2. Path syntax and directory traversal validation (without redundant URL decoding).
 * 3. Multi-tenant company ownership check.
 * 4. Database existence and ownership verification.
 * 5. Expiration check (returns 410 Gone for expired cards).
 * 6. Exact card asset matching (rejects paths not belonging to the card with 403).
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestContext, isAdmin } from '@/lib/services/company-resolver'
import {
  retrieveTemporaryCardBuffer,
  validateStorageObjectPath,
  isCardExpired,
} from '@/lib/services/id-card-storage-service'
import { getTemporaryCardById, isSchemaNotReadyError } from '@/lib/services/id-card-repository'

export async function GET(request: NextRequest) {
  const resolved = await resolveRequestContext()
  if (!resolved.ok) {
    return NextResponse.json({ success: false, error: resolved.error.message }, { status: resolved.error.status })
  }

  const { context } = resolved
  if (!isAdmin(context)) {
    return NextResponse.json({ success: false, error: 'Forbidden: Admin access required.' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const rawPath = searchParams.get('path')
  if (!rawPath) {
    return NextResponse.json({ success: false, error: 'Missing path parameter.' }, { status: 400 })
  }

  // searchParams.get('path') is already decoded by the URL parser; do not perform redundant decodeURIComponent
  const cleanPath = rawPath.trim()

  // 1. Validate storage path syntax and prevent path traversal
  const pathValidation = validateStorageObjectPath(cleanPath)
  if (!pathValidation.valid || !pathValidation.companyId || !pathValidation.cardId) {
    return NextResponse.json(
      { success: false, error: `Invalid storage path: ${pathValidation.error || 'malformed path'}` },
      { status: 400 }
    )
  }

  // 2. Strict company isolation check: path company must match user's authenticated company
  if (pathValidation.companyId !== context.companyId) {
    return NextResponse.json(
      { success: false, error: 'Access denied: File does not belong to your company.' },
      { status: 403 }
    )
  }

  // 3. Database existence and ownership verification (never trust path alone)
  let card: any
  try {
    card = await getTemporaryCardById(pathValidation.cardId, context.companyId, { includeExpired: true })
  } catch (dbErr: any) {
    if (isSchemaNotReadyError(dbErr)) {
      console.warn('[Download API] Schema not ready:', dbErr?.message || dbErr)
      return NextResponse.json(
        {
          success: false,
          code: 'ID_CARD_SCHEMA_NOT_READY',
          error: 'Employee ID Card database schema is not initialized or schema cache is refreshing. Database migration required.',
        },
        { status: 503 }
      )
    }
    console.error('[Download API] Database verification error:', dbErr?.message || dbErr)
    return NextResponse.json(
      { success: false, error: 'Failed to verify temporary ID card.' },
      { status: 500 }
    )
  }

  if (!card) {
    return NextResponse.json(
      { success: false, error: 'Temporary ID card not found or already deleted.' },
      { status: 404 }
    )
  }

  // 4. Expiration check: Reject downloads for expired cards awaiting cleanup
  if (isCardExpired(card.expires_at)) {
    return NextResponse.json(
      { success: false, error: 'Temporary ID card has expired and is no longer available for download.' },
      { status: 410 }
    )
  }

  // 5. Verify the requested path matches the card's recorded generated assets
  if (cleanPath !== card.card_image_path && cleanPath !== card.card_pdf_path) {
    return NextResponse.json(
      { success: false, error: 'Access denied: Requested path is not associated with this ID card.' },
      { status: 403 }
    )
  }

  // 6. Retrieve file buffer from private Supabase Storage
  let fileData: { buffer: Buffer; mimeType: string } | null
  try {
    fileData = await retrieveTemporaryCardBuffer(cleanPath)
  } catch (storageErr: any) {
    console.error('[Download API] Storage retrieval error:', storageErr?.message || storageErr)
    return NextResponse.json(
      { success: false, error: 'Storage service temporarily unavailable.' },
      { status: 503 }
    )
  }

  if (!fileData) {
    return NextResponse.json(
      { success: false, error: 'File not found in storage or has already been cleaned up.' },
      { status: 404 }
    )
  }

  const fileName = pathValidation.fileName || 'temporary-id-card'

  return new NextResponse(fileData.buffer as any, {
    status: 200,
    headers: {
      'Content-Type': fileData.mimeType,
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      'Pragma': 'no-cache',
    },
  })
}
