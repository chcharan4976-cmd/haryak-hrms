/**
 * Haryak Technologies India Private Limited
 * Temporary ID Card 24-Hour Expiration Cleanup API
 *
 * Endpoints:
 * 1. GET /api/admin/employee-id-cards/cleanup
 *    - Dedicated for Vercel Cron invocation (Vercel Cron natively invokes scheduled endpoints via GET).
 *    - Strictly requires CRON_SECRET presented as a Bearer token in the Authorization header.
 *    - Fails closed if CRON_SECRET is unconfigured on the server (HTTP 500).
 *    - Normal administrator sessions CANNOT trigger cleanup through GET (returns HTTP 401).
 *    - Never falls back to SUPABASE_SERVICE_ROLE_KEY.
 *
 * 2. POST /api/admin/employee-id-cards/cleanup
 *    - Accessible by dedicated Cron workers with CRON_SECRET (global multi-company cleanup).
 *    - Accessible by authenticated Company Administrators via session POST (strictly scoped to their own company).
 *
 * Other HTTP methods (PUT, DELETE, etc.) are rejected with HTTP 405 (Method Not Allowed).
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestContext, isAdmin } from '@/lib/services/company-resolver'
import { cleanupExpiredIdCards } from '@/lib/services/id-card-cleanup-service'
import { isSchemaNotReadyError } from '@/lib/services/id-card-repository'
import crypto from 'crypto'

/**
 * Constant-time string comparison to prevent timing attacks on secrets.
 * Strictly verifies non-empty inputs and equal byte lengths before calling timingSafeEqual.
 */
function timingSafeSecretCheck(provided: string | null | undefined, expected: string | undefined): boolean {
  if (!provided || !expected) return false
  const providedBuf = Buffer.from(provided)
  const expectedBuf = Buffer.from(expected)
  if (providedBuf.length !== expectedBuf.length) return false
  return crypto.timingSafeEqual(providedBuf, expectedBuf)
}

/**
 * Extracts the cron secret from Authorization header (Bearer token) or x-cron-secret header.
 */
function extractCronSecret(request?: NextRequest): string | null {
  if (!request?.headers) return null
  const authHeader = request.headers.get('authorization')
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim()
    if (token) return token
  }
  const cronSecretHeader = request.headers.get('x-cron-secret')
  if (cronSecretHeader && cronSecretHeader.trim()) {
    return cronSecretHeader.trim()
  }
  return null
}

/**
 * GET Authorization: Reserved exclusively for Vercel Cron with CRON_SECRET.
 * Normal administrator sessions are prohibited from triggering global cleanup via GET.
 */
function authorizeCronGet(request?: NextRequest): {
  authorized: boolean
  companyId?: string
  error?: string
  status?: number
} {
  if (!request) {
    return {
      authorized: false,
      error: 'Unauthorized: Missing or invalid authorization header.',
      status: 401,
    }
  }

  const providedSecret = extractCronSecret(request)
  const configuredCronSecret = process.env.CRON_SECRET

  // 1. Missing Authorization / Bearer token
  if (!providedSecret) {
    return {
      authorized: false,
      error: 'Unauthorized: Missing or invalid authorization header.',
      status: 401,
    }
  }

  // 2. CRON_SECRET is not configured on the server -> fail closed
  if (!configuredCronSecret) {
    return {
      authorized: false,
      error: 'Cron cleanup service is disabled: CRON_SECRET is not configured on the server.',
      status: 500,
    }
  }

  // 3. Timing-safe comparison with length validation
  if (!timingSafeSecretCheck(providedSecret, configuredCronSecret)) {
    return {
      authorized: false,
      error: 'Unauthorized: Invalid cron secret provided.',
      status: 401,
    }
  }

  const { searchParams } = new URL(request.url)
  const companyIdParam = searchParams.get('company_id') || undefined

  return { authorized: true, companyId: companyIdParam }
}

/**
 * POST Authorization: Supports both CRON_SECRET (global) and Administrator session (company-scoped).
 */
async function authorizePost(request: NextRequest): Promise<{
  authorized: boolean
  companyId?: string
  isCron: boolean
  error?: string
  status?: number
}> {
  const providedSecret = extractCronSecret(request)
  const configuredCronSecret = process.env.CRON_SECRET

  // 1. Dedicated CRON_SECRET authentication
  if (providedSecret) {
    if (!configuredCronSecret) {
      return {
        authorized: false,
        isCron: true,
        error: 'Cron cleanup service is disabled: CRON_SECRET is not configured on the server.',
        status: 500,
      }
    }

    if (timingSafeSecretCheck(providedSecret, configuredCronSecret)) {
      const { searchParams } = new URL(request.url)
      const companyIdParam = searchParams.get('company_id') || undefined
      return { authorized: true, companyId: companyIdParam, isCron: true }
    }

    return {
      authorized: false,
      isCron: true,
      error: 'Unauthorized: Invalid cron secret provided.',
      status: 401,
    }
  }

  // 2. Fall back to authenticated Admin user session
  const resolved = await resolveRequestContext()
  if (!resolved.ok) {
    return {
      authorized: false,
      isCron: false,
      error: resolved.error.message,
      status: resolved.error.status,
    }
  }

  const { context } = resolved
  if (!isAdmin(context)) {
    return {
      authorized: false,
      isCron: false,
      error: 'Forbidden: Admin authorization required for ID card cleanup.',
      status: 403,
    }
  }

  // Normal administrator: strictly scoped to their own authenticated company.
  // Never permit normal administrators to trigger global cleanup across all companies.
  return { authorized: true, companyId: context.companyId, isCron: false }
}

/**
 * GET: Vercel Cron invocation endpoint
 */
export async function GET(request?: NextRequest) {
  const auth = authorizeCronGet(request)
  if (!auth.authorized) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status || 401 })
  }

  try {
    const result = await cleanupExpiredIdCards({
      companyId: auth.companyId,
      allowGlobalCron: true,
    })
    return NextResponse.json(result)
  } catch (err: any) {
    if (isSchemaNotReadyError(err)) {
      console.warn('[Cleanup API GET] Schema not ready:', err?.message || err)
      return NextResponse.json(
        {
          success: false,
          code: 'ID_CARD_SCHEMA_NOT_READY',
          error: 'Employee ID Card database schema is not initialized or schema cache is refreshing. Database migration required.',
        },
        { status: 503 }
      )
    }
    console.error('[Cleanup API GET] Cleanup operation error:', err?.message || err)
    return NextResponse.json(
      { success: false, error: 'Cleanup operation failed.' },
      { status: 500 }
    )
  }
}

/**
 * POST: Manual Admin cleanup or programmatic Cron POST trigger
 */
export async function POST(request: NextRequest) {
  const auth = await authorizePost(request)
  if (!auth.authorized) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status || 403 })
  }

  try {
    const result = await cleanupExpiredIdCards({
      companyId: auth.companyId,
      allowGlobalCron: auth.isCron,
    })
    return NextResponse.json(result)
  } catch (err: any) {
    if (isSchemaNotReadyError(err)) {
      console.warn('[Cleanup API POST] Schema not ready:', err?.message || err)
      return NextResponse.json(
        {
          success: false,
          code: 'ID_CARD_SCHEMA_NOT_READY',
          error: 'Employee ID Card database schema is not initialized or schema cache is refreshing. Database migration required.',
        },
        { status: 503 }
      )
    }
    console.error('[Cleanup API POST] Cleanup operation error:', err?.message || err)
    return NextResponse.json(
      { success: false, error: 'Cleanup operation failed.' },
      { status: 500 }
    )
  }
}

/**
 * Unsupported HTTP Methods: Returns 405 Method Not Allowed
 */
export async function PUT() {
  return NextResponse.json(
    { success: false, error: 'Method Not Allowed. Cleanup must be triggered via authenticated GET or POST.' },
    { status: 405, headers: { Allow: 'GET, POST' } }
  )
}

export async function DELETE() {
  return NextResponse.json(
    { success: false, error: 'Method Not Allowed. Cleanup must be triggered via authenticated GET or POST.' },
    { status: 405, headers: { Allow: 'GET, POST' } }
  )
}
