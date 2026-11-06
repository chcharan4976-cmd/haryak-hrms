/**
 * Haryak Technologies India Private Limited
 * Temporary ID Card Delete Route
 *
 * Endpoint: DELETE /api/admin/employee-id-cards/[id]
 * Access: Exclusive to Administrators within their own company tenant
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestContext, isAdmin } from '@/lib/services/company-resolver'
import { deleteTemporaryCardById } from '@/lib/services/id-card-cleanup-service'
import { isValidUUID } from '@/lib/services/id-card-storage-service'
import { isSchemaNotReadyError } from '@/lib/services/id-card-repository'

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolved = await resolveRequestContext()
  if (!resolved.ok) {
    return NextResponse.json({ success: false, error: resolved.error.message }, { status: resolved.error.status })
  }

  const { context } = resolved
  if (!isAdmin(context)) {
    return NextResponse.json({ success: false, error: 'Forbidden: Admin access required.' }, { status: 403 })
  }

  const { id: cardId } = await params

  if (!cardId || !isValidUUID(cardId)) {
    return NextResponse.json({ success: false, error: 'Valid card ID parameter is required.' }, { status: 400 })
  }

  try {
    const result = await deleteTemporaryCardById(cardId, context.companyId)

    if (result.notFound) {
      return NextResponse.json(
        { success: false, error: result.error || 'Temporary ID card not found or already deleted.' },
        { status: 404 }
      )
    }

    if (!result.success) {
      console.error(`[DELETE /api/admin/employee-id-cards/${cardId}] Deletion failure:`, result.error)
      return NextResponse.json(
        { success: false, error: result.error || 'Failed to delete temporary ID card.' },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Temporary ID card and storage assets deleted successfully.',
      deletedFilesCount: result.deletedFilesCount,
    })
  } catch (err: any) {
    if (isSchemaNotReadyError(err)) {
      console.warn(`[DELETE /api/admin/employee-id-cards/${cardId}] Schema not ready:`, err?.message || err)
      return NextResponse.json(
        {
          success: false,
          code: 'ID_CARD_SCHEMA_NOT_READY',
          error: 'Employee ID Card database schema is not initialized or schema cache is refreshing. Database migration required.',
        },
        { status: 503 }
      )
    }

    console.error(`[DELETE /api/admin/employee-id-cards/${cardId}] Unexpected exception:`, err?.message || err)
    return NextResponse.json(
      { success: false, error: 'Failed to delete temporary ID card.' },
      { status: 500 }
    )
  }
}
