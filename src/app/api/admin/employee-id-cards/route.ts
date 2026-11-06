/**
 * Haryak Technologies India Private Limited
 * Employee ID Card Studio - Admin CRUD & Generation API
 *
 * Route: /api/admin/employee-id-cards
 * Access: Exclusive to Administrators (SUPER_ADMIN, HR_ADMIN, PAYROLL_ADMIN, ADMINISTRATION)
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestContext, isAdmin } from '@/lib/services/company-resolver'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  storeTemporaryCardAsset,
  calculateCardExpirationDate,
  deleteTemporaryCardFiles,
  deleteTemporaryCardDirectory,
  isValidUUID,
  validateFileSignature,
  MAX_CARD_FILE_SIZE,
} from '@/lib/services/id-card-storage-service'
import {
  getActiveTemporaryCards,
  insertTemporaryCard,
  deleteTemporaryCardRecord,
  isSchemaNotReadyError,
} from '@/lib/services/id-card-repository'
import crypto from 'crypto'

const MAX_REQUEST_BODY_BYTES = 25 * 1024 * 1024 // 25MB pre-decode limit

/**
 * Validates photo URL to prevent SSRF and unsafe schemes
 */
function isSafePhotoUrl(url: string | null | undefined): boolean {
  if (!url) return true
  const trimmed = url.trim()
  if (trimmed.startsWith('data:image/')) return true
  if (trimmed.startsWith('/api/')) return true

  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== 'https:') return false
    const hostname = parsed.hostname.toLowerCase()
    // Block loopback, link-local, private IP addresses
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('10.') ||
      hostname.startsWith('169.254.')
    ) {
      return false
    }
    return true
  } catch {
    return false
  }
}

/**
 * In-process lock/reservation set for in-flight temporary employee code generation per company
 * Prevents race conditions during simultaneous generation.
 */
const inFlightCodeAllocations = new Map<string, Set<number>>()

function reserveNextCodeNumber(companyId: string, usedNumbers: Set<number>): { nextNumber: number; release: () => void } {
  let allocated = inFlightCodeAllocations.get(companyId)
  if (!allocated) {
    allocated = new Set<number>()
    inFlightCodeAllocations.set(companyId, allocated)
  }

  let next = 1
  while (usedNumbers.has(next) || allocated.has(next)) {
    next++
  }

  allocated.add(next)
  return {
    nextNumber: next,
    release: () => {
      const current = inFlightCodeAllocations.get(companyId)
      if (current) {
        current.delete(next)
        if (current.size === 0) {
          inFlightCodeAllocations.delete(companyId)
        }
      }
    },
  }
}

/**
 * Concurrency-Safe Sequential Employee Code Generator helper.
 * 1. Attempts database-backed atomic RPC allocation (allocate_next_employee_code) with transaction-level advisory locking.
 * 2. Falls back to combined employees + temporary_employee_id_cards query with in-process reservation.
 * Follows canonical format: HRK-001, HRK-002, etc.
 */
async function getNextSequentialEmployeeCode(
  supabase: any,
  companyId: string,
  userId?: string
): Promise<{
  code: string
  reservationId?: string
  renew: (additionalMinutes?: number) => Promise<boolean>
  release: () => Promise<void> | void
}> {
  // 1. Try atomic database-backed reservation RPC first
  if (supabase?.rpc) {
    try {
      const { data: rpcRes, error: rpcErr } = await supabase.rpc(
        'reserve_next_employee_code',
        {
          p_company_id: companyId,
          p_reservation_type: 'TEMPORARY_CARD',
          p_user_id: userId || null,
          p_ttl_minutes: 15,
          p_is_service_role: true,
        }
      )
      const row = Array.isArray(rpcRes) ? rpcRes[0] : rpcRes
      if (!rpcErr && row?.employee_code) {
        const resId = row.reservation_id
        return {
          code: row.employee_code,
          reservationId: resId,
          renew: async (additionalMinutes = 15) => {
            if (resId && supabase?.rpc) {
              try {
                const { data: renewed, error: renewErr } = await supabase.rpc('renew_employee_code_reservation', {
                  p_reservation_id: resId,
                  p_company_id: companyId,
                  p_user_id: userId || null,
                  p_additional_minutes: additionalMinutes,
                  p_is_service_role: true,
                })
                return !renewErr && renewed === true
              } catch {
                return false
              }
            }
            return true
          },
          release: async () => {
            if (resId && supabase?.rpc) {
              try {
                await supabase.rpc('release_employee_code_reservation', {
                  p_reservation_id: resId,
                  p_company_id: companyId,
                  p_user_id: userId || null,
                  p_is_service_role: true,
                })
              } catch {
                // best-effort cleanup
              }
            }
          },
        }
      }
    } catch {
      // Fall through to legacy allocate_next_employee_code
    }

    // Secondary fallback: allocate_next_employee_code if database migration has not applied reservation RPC
    try {
      const { data: legacyCode, error: legacyErr } = await supabase.rpc(
        'allocate_next_employee_code',
        {
          p_company_id: companyId,
          p_is_temporary: true,
        }
      )
      if (!legacyErr && legacyCode && typeof legacyCode === 'string') {
        return {
          code: legacyCode,
          reservationId: undefined,
          renew: async () => true,
          release: () => {},
        }
      }
    } catch {
      // Fall through
    }

    // Fail closed in production: do NOT silently fall back to unmanaged in-memory allocation
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Database-backed atomic employee code reservation is required in production but unavailable.')
    }
  }

  // 2. Fallback: dual-table scan and in-process reservation
  const { data: company } = await supabase
    .from('companies')
    .select('employee_id_prefix')
    .eq('id', companyId)
    .maybeSingle()

  const prefix = String(company?.employee_id_prefix || 'HRK').trim().toUpperCase()

  const [empRes, tempRes] = await Promise.all([
    supabase
      .from('employees')
      .select('employee_code')
      .eq('company_id', companyId),
    supabase
      .from('temporary_employee_id_cards')
      .select('employee_code')
      .eq('company_id', companyId)
      .is('deleted_at', null),
  ])

  const pattern = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d+)$`, 'i')
  const usedNumbers = new Set<number>()

  for (const row of empRes.data || []) {
    const match = String(row.employee_code || '').match(pattern)
    if (!match) continue
    const val = Number(match[1])
    if (Number.isInteger(val) && val > 0) {
      usedNumbers.add(val)
    }
  }

  for (const row of tempRes.data || []) {
    const match = String(row.employee_code || '').match(pattern)
    if (!match) continue
    const val = Number(match[1])
    if (Number.isInteger(val) && val > 0) {
      usedNumbers.add(val)
    }
  }

  const { nextNumber, release } = reserveNextCodeNumber(companyId, usedNumbers)
  return {
    code: `${prefix}-${String(nextNumber).padStart(3, '0')}`,
    renew: async () => true,
    release,
  }
}

/**
 * Safely parses JSON with strict streaming byte limits prior to buffer accumulation.
 * Protects against chunked-encoding and missing Content-Length DoS attacks.
 */
async function parseJsonWithStreamLimit<T = any>(
  request: NextRequest,
  maxBytes: number
): Promise<{ success: true; data: T } | { success: false; response: NextResponse }> {
  const contentLength = Number(request.headers.get('content-length') || '0')
  if (contentLength > maxBytes) {
    return {
      success: false,
      response: NextResponse.json(
        { success: false, error: 'Payload too large: request body exceeds 25MB limit.' },
        { status: 413 }
      ),
    }
  }

  if (!request.body) {
    try {
      const text = await request.text()
      if (!text.trim()) {
        return {
          success: false,
          response: NextResponse.json({ success: false, error: 'Empty JSON request body.' }, { status: 400 }),
        }
      }
      const data = JSON.parse(text)
      return { success: true, data }
    } catch {
      return {
        success: false,
        response: NextResponse.json({ success: false, error: 'Invalid JSON request body.' }, { status: 400 }),
      }
    }
  }

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) {
        totalBytes += value.byteLength
        if (totalBytes > maxBytes) {
          try {
            await reader.cancel()
          } catch {}
          return {
            success: false,
            response: NextResponse.json(
              { success: false, error: 'Payload too large: request body exceeds 25MB limit.' },
              { status: 413 }
            ),
          }
        }
        chunks.push(value)
      }
    }
  } catch (err: any) {
    return {
      success: false,
      response: NextResponse.json(
        { success: false, error: `Failed to read request body stream: ${err.message}` },
        { status: 400 }
      ),
    }
  }

  const rawString = Buffer.concat(chunks.map(c => Buffer.from(c.buffer, c.byteOffset, c.byteLength)))
    .toString('utf-8')
    .trim()

  if (!rawString) {
    return {
      success: false,
      response: NextResponse.json({ success: false, error: 'Empty JSON payload.' }, { status: 400 }),
    }
  }

  try {
    const data = JSON.parse(rawString)
    return { success: true, data }
  } catch {
    return {
      success: false,
      response: NextResponse.json({ success: false, error: 'Invalid JSON payload.' }, { status: 400 }),
    }
  }
}

/**
 * GET: Fetch active temporary ID cards and studio dashboard statistics.
 * Strictly read-only; does NOT execute destructive background cleanups during read requests.
 */
export async function GET(_request: NextRequest) {
  try {
    const resolved = await resolveRequestContext()
    if (!resolved.ok) {
      return NextResponse.json({ success: false, error: resolved.error.message }, { status: resolved.error.status })
    }

    const { context } = resolved
    if (!isAdmin(context)) {
      return NextResponse.json({ success: false, error: 'Forbidden: Admin privileges required.' }, { status: 403 })
    }

    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const threeHoursFromNow = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString()

    // 1. Fetch active temporary ID cards via authoritative repository
    const { cards: activeCards } = await getActiveTemporaryCards(context.companyId)

    // 2. Compute Dashboard Statistics purely in memory
    const safeCards = activeCards || []
    const totalToday = safeCards.filter(c => new Date(c.created_at) >= todayStart).length
    const activeCount = safeCards.length
    const expiringSoonCount = safeCards.filter(c => c.expires_at <= threeHoursFromNow).length

    return NextResponse.json({
      success: true,
      cards: safeCards,
      stats: {
        totalToday,
        activeCount,
        expiringSoonCount,
        deletedAfter24Hours: true,
      },
    })
  } catch (err: any) {
    if (isSchemaNotReadyError(err)) {
      console.warn('[GET /api/admin/employee-id-cards] Schema not ready:', err?.message || err)
      return NextResponse.json(
        {
          success: false,
          code: 'ID_CARD_SCHEMA_NOT_READY',
          error: 'Employee ID Card database schema is not initialized or schema cache is refreshing. Database migration required.',
          cards: [],
          stats: {
            totalToday: 0,
            activeCount: 0,
            expiringSoonCount: 0,
            deletedAfter24Hours: true,
          },
        },
        { status: 503 }
      )
    }

    console.error('[GET /api/admin/employee-id-cards] Handler error:', err?.message || err)
    return NextResponse.json(
      {
        success: false,
        code: 'INTERNAL_SERVER_ERROR',
        error: 'Failed to fetch temporary ID cards.',
        cards: [],
        stats: {
          totalToday: 0,
          activeCount: 0,
          expiringSoonCount: 0,
          deletedAfter24Hours: true,
        },
      },
      { status: 500 }
    )
  }
}

interface ReservationLeaseHeartbeat {
  checkAndRenew: () => Promise<boolean>
  stop: () => void
  isAborted: () => boolean
}

/**
 * Manages periodic active lease renewal for long-running reservation-owning operations.
 * - Enforces periodic lease extension (default every 30s) while execution is active.
 * - Enforces a strict maximum processing duration ceiling (default 14 min) with fail-closed behavior.
 * - Stops processing immediately if renewal fails or lease is lost.
 * - Explicitly stops background timer when stopped.
 */
function startReservationHeartbeat(options: {
  renewFn: (additionalMins?: number) => Promise<boolean>
  intervalMs?: number
  maxDurationMs?: number
  onHeartbeatFailure?: (err: Error) => void
}): ReservationLeaseHeartbeat {
  let isStopped = false
  let isFailed = false
  const startTime = Date.now()
  const intervalMs = options.intervalMs || 30 * 1000
  const maxDurationMs = options.maxDurationMs || 14 * 60 * 1000

  const checkAndRenew = async (): Promise<boolean> => {
    if (isStopped) return true
    if (isFailed) return false
    if (Date.now() - startTime > maxDurationMs) {
      isFailed = true
      options.onHeartbeatFailure?.(new Error('Maximum reservation processing duration exceeded.'))
      return false
    }
    const success = await options.renewFn(15)
    if (!success) {
      isFailed = true
      options.onHeartbeatFailure?.(new Error('Reservation lease renewal failed; lease lost or reclaimed.'))
      return false
    }
    return true
  }

  const timer = setInterval(async () => {
    if (isStopped || isFailed) {
      clearInterval(timer)
      return
    }
    try {
      await checkAndRenew()
    } catch (err: any) {
      isFailed = true
      clearInterval(timer)
      options.onHeartbeatFailure?.(err)
    }
  }, intervalMs)

  if (timer.unref) {
    timer.unref()
  }

  return {
    checkAndRenew,
    stop: () => {
      isStopped = true
      clearInterval(timer)
    },
    isAborted: () => isFailed || (Date.now() - startTime > maxDurationMs),
  }
}

/**
 * POST: Generate, store, and record a new 24-hour Temporary Employee ID Card.
 * Enforces pre-decode streaming limits, signature validation, employee ownership, and compensating rollback.
 */
export async function POST(request: NextRequest) {
  const resolved = await resolveRequestContext()
  if (!resolved.ok) {
    return NextResponse.json({ success: false, error: resolved.error.message }, { status: resolved.error.status })
  }

  const { context } = resolved
  if (!isAdmin(context)) {
    return NextResponse.json({ success: false, error: 'Forbidden: Admin privileges required.' }, { status: 403 })
  }

  const supabase = createAdminClient()
  if (!supabase) {
    return NextResponse.json({ success: false, error: 'Database service unavailable.' }, { status: 503 })
  }

  // Enforce streaming body size limit prior to full buffering
  const parsedBody = await parseJsonWithStreamLimit(request, MAX_REQUEST_BODY_BYTES)
  if (!parsedBody.success) {
    return parsedBody.response
  }

  const uploadedPaths: string[] = []
  const cardId = crypto.randomUUID()
  let codeReleaseFn: (() => Promise<void> | void) | null = null
  let codeRenewFn: ((mins?: number) => Promise<boolean>) | null = null
  let activeReservationId: string | null = null
  let heartbeat: ReservationLeaseHeartbeat | null = null
  let isCommitted = false

  try {
    const body = parsedBody.data
    const {
      employeeId,
      designType = 'CORPORATE_ELITE',
      employeeName,
      designation,
      department,
      phone,
      email,
      location,
      photoUrl,
      cardPngBase64,
      cardPdfBase64,
      customCode,
    } = body

    if (!employeeName || typeof employeeName !== 'string' || !employeeName.trim()) {
      return NextResponse.json({ success: false, error: 'Employee name is required.' }, { status: 400 })
    }

    if (employeeName.trim().length > 255) {
      return NextResponse.json({ success: false, error: 'Employee name exceeds maximum length of 255 characters.' }, { status: 400 })
    }

    if (designType !== 'CORPORATE_ELITE' && designType !== 'MODERN_EXECUTIVE') {
      return NextResponse.json({ success: false, error: 'Invalid design type: must be CORPORATE_ELITE or MODERN_EXECUTIVE.' }, { status: 400 })
    }

    if (customCode && !/^[A-Za-z0-9\-_]{2,30}$/.test(customCode.trim())) {
      return NextResponse.json({ success: false, error: 'Custom employee code must be 2-30 alphanumeric characters, hyphens, or underscores.' }, { status: 400 })
    }

    if (photoUrl && !isSafePhotoUrl(photoUrl)) {
      return NextResponse.json({ success: false, error: 'Invalid or unsafe photo URL.' }, { status: 400 })
    }

    // 1. Validate employee company relationship if employeeId is supplied
    let verifiedEmployeeCode: string | null = null
    if (employeeId) {
      if (!isValidUUID(employeeId)) {
        return NextResponse.json({ success: false, error: 'Invalid employee ID format.' }, { status: 400 })
      }

      const { data: existingEmp, error: empErr } = await supabase
        .from('employees')
        .select('id, employee_code, company_id')
        .eq('id', employeeId)
        .eq('company_id', context.companyId)
        .maybeSingle()

      if (empErr || !existingEmp) {
        return NextResponse.json(
          { success: false, error: 'Selected employee does not exist or does not belong to your company.' },
          { status: 400 }
        )
      }

      verifiedEmployeeCode = existingEmp.employee_code
    }

    // 2. Determine employee code (concurrency-safe)
    let finalCode = customCode?.trim() || verifiedEmployeeCode
    if (!finalCode) {
      const codeAlloc = await getNextSequentialEmployeeCode(supabase, context.companyId, context.authUserId)
      finalCode = codeAlloc.code
      codeReleaseFn = codeAlloc.release
      codeRenewFn = codeAlloc.renew
      activeReservationId = codeAlloc.reservationId || null
    }

    // Initialize active reservation heartbeat lease manager for long-running processing
    if (activeReservationId && codeRenewFn) {
      heartbeat = startReservationHeartbeat({
        renewFn: codeRenewFn,
        intervalMs: 30 * 1000,
        maxDurationMs: 14 * 60 * 1000,
        onHeartbeatFailure: (err) => {
          console.warn('[EmployeeIDCardStudio] Lease renewal heartbeat failure:', err.message)
        },
      })
    }

    const createdAt = new Date()
    const expiresAt = calculateCardExpirationDate(createdAt)

    let cardImagePath: string | null = null
    let cardPdfPath: string | null = null

    // 3. Store PNG file in private Supabase Storage if provided
    if (cardPngBase64 && typeof cardPngBase64 === 'string') {
      // Lease checkpoint before PNG upload
      if (heartbeat && !(await heartbeat.checkAndRenew())) {
        return NextResponse.json(
          { success: false, error: 'Employee code reservation expired or was reclaimed before PNG upload. Card generation aborted.' },
          { status: 409 }
        )
      }

      const cleanBase64 = cardPngBase64.replace(/^data:image\/\w+;base64,/, '')
      const pngBuffer = Buffer.from(cleanBase64, 'base64')

      if (pngBuffer.length > MAX_CARD_FILE_SIZE) {
        return NextResponse.json({ success: false, error: 'PNG image exceeds maximum allowed size of 10MB.' }, { status: 400 })
      }

      if (!validateFileSignature(pngBuffer, 'png')) {
        return NextResponse.json({ success: false, error: 'Invalid PNG file content: magic byte signature check failed.' }, { status: 400 })
      }

      const storedPng = await storeTemporaryCardAsset({
        companyId: context.companyId,
        cardId,
        fileBuffer: pngBuffer,
        fileName: `${finalCode}_id_card_hd.png`,
        mimeType: 'image/png',
      })
      cardImagePath = storedPng.storagePath
      uploadedPaths.push(cardImagePath)
    }

    // 4. Store PDF file in private Supabase Storage if provided
    if (cardPdfBase64 && typeof cardPdfBase64 === 'string') {
      // Lease checkpoint before PDF upload
      if (heartbeat && !(await heartbeat.checkAndRenew())) {
        if (uploadedPaths.length > 0) {
          try {
            await deleteTemporaryCardFiles(uploadedPaths)
            await deleteTemporaryCardDirectory(context.companyId, cardId)
          } catch {}
        }
        return NextResponse.json(
          { success: false, error: 'Employee code reservation expired or was reclaimed before PDF upload. Card generation aborted.' },
          { status: 409 }
        )
      }

      const cleanPdfBase64 = cardPdfBase64.replace(/^data:application\/pdf;base64,/, '')
      const pdfBuffer = Buffer.from(cleanPdfBase64, 'base64')

      if (pdfBuffer.length > MAX_CARD_FILE_SIZE) {
        return NextResponse.json({ success: false, error: 'PDF file exceeds maximum allowed size of 10MB.' }, { status: 400 })
      }

      if (!validateFileSignature(pdfBuffer, 'pdf')) {
        return NextResponse.json({ success: false, error: 'Invalid PDF file content: magic byte signature check failed.' }, { status: 400 })
      }

      const storedPdf = await storeTemporaryCardAsset({
        companyId: context.companyId,
        cardId,
        fileBuffer: pdfBuffer,
        fileName: `${finalCode}_id_card_cr80.pdf`,
        mimeType: 'application/pdf',
      })
      cardPdfPath = storedPdf.storagePath
      uploadedPaths.push(cardPdfPath)
    }

    // Validate lease freshness before insert (heartbeat checkpoint 3)
    if (heartbeat && !(await heartbeat.checkAndRenew())) {
      if (uploadedPaths.length > 0) {
        try {
          await deleteTemporaryCardFiles(uploadedPaths)
          await deleteTemporaryCardDirectory(context.companyId, cardId)
        } catch {}
      }
      return NextResponse.json(
        { success: false, error: 'Employee code reservation expired or was reclaimed during file upload. Card generation aborted.' },
        { status: 409 }
      )
    }

    // 5. Record into temporary cards repository
    const insertPayload = {
      id: cardId,
      company_id: context.companyId,
      employee_id: employeeId || null,
      employee_code: finalCode,
      design_type: designType,
      employee_name: employeeName.trim(),
      designation: designation?.trim() || null,
      department: department?.trim() || null,
      phone: phone?.trim() || null,
      email: email?.trim() || null,
      location: location?.trim() || 'Headquarters',
      photo_url: photoUrl || null,
      card_image_path: cardImagePath,
      card_pdf_path: cardPdfPath,
      card_format: 'CR80_PORTRAIT',
      dimensions: '53.98x85.60mm',
      resolution_dpi: 300,
      export_resolution: '638x1011',
      created_by: context.authUserId,
      created_at: createdAt.toISOString(),
      expires_at: expiresAt.toISOString(),
      deleted_at: null,
      metadata: {
        reservation_id: activeReservationId || undefined,
        generated_by_role: context.roles,
        company_name: 'Haryak Technologies India Private Limited',
      },
    }

    const { success, card: createdCard, error: insertError } = await insertTemporaryCard(insertPayload)

    // 6. Compensating rollback: delete uploaded files if database insert fails
    if (!success || !createdCard) {
      let rollbackSucceeded = true
      let rollbackErrorMessage: string | undefined

      if (uploadedPaths.length > 0) {
        try {
          const deleteResult = await deleteTemporaryCardFiles(uploadedPaths)
          const dirResult = await deleteTemporaryCardDirectory(context.companyId, cardId)
          if (!deleteResult.success || !dirResult.success) {
            rollbackSucceeded = false
            rollbackErrorMessage = 'Storage rollback was incomplete.'
          }
        } catch (rollbackErr: any) {
          rollbackSucceeded = false
          rollbackErrorMessage = rollbackErr.message
        }
      }

      console.error('[POST /api/admin/employee-id-cards] Database insert failure:', insertError)

      if (isSchemaNotReadyError(insertError)) {
        return NextResponse.json(
          {
            success: false,
            code: 'ID_CARD_SCHEMA_NOT_READY',
            error: 'Employee ID Card database schema is not initialized or schema cache is refreshing. Database migration required.',
          },
          { status: 503 }
        )
      }

      return NextResponse.json(
        {
          success: false,
          error: 'Failed to persist ID card record.',
          rollback: {
            attempted: uploadedPaths.length > 0,
            succeeded: rollbackSucceeded,
            error: rollbackErrorMessage,
          },
        },
        { status: 500 }
      )
    }

    isCommitted = true
    if (activeReservationId && supabase?.rpc) {
      try {
        const { data: commitResult, error: commitErr } = await supabase.rpc('commit_employee_code_reservation', {
          p_reservation_id: activeReservationId,
          p_company_id: context.companyId,
          p_user_id: context.authUserId,
          p_temporary_card_id: createdCard.id,
          p_is_service_role: true,
        })

        if (commitErr || commitResult === false) {
          // Stale lease expired or reclaimed by another request!
          isCommitted = false
          await deleteTemporaryCardRecord(createdCard.id, context.companyId)
          if (uploadedPaths.length > 0) {
            try {
              await deleteTemporaryCardFiles(uploadedPaths)
              await deleteTemporaryCardDirectory(context.companyId, cardId)
            } catch {}
          }
          return NextResponse.json(
            { success: false, error: 'Employee code reservation expired or was reclaimed. Card generation cancelled.' },
            { status: 409 }
          )
        }
      } catch (commitEx) {
        console.error('[POST /api/admin/employee-id-cards] Commit exception:', commitEx)
      }
    }

    return NextResponse.json({
      success: true,
      card: createdCard,
      message: 'Temporary employee ID card generated successfully. Valid for exactly 24 hours.',
    })
  } catch (err: any) {
    // Compensating rollback on unhandled error
    if (uploadedPaths.length > 0) {
      try {
        await deleteTemporaryCardFiles(uploadedPaths)
        await deleteTemporaryCardDirectory(context.companyId, cardId)
      } catch (rollbackErr: any) {
        console.error('[POST /api/admin/employee-id-cards] Rollback exception during unhandled error:', rollbackErr?.message || 'Unknown error')
      }
    }

    if (isSchemaNotReadyError(err)) {
      console.warn('[POST /api/admin/employee-id-cards] Schema not ready exception:', err?.message || err)
      return NextResponse.json(
        {
          success: false,
          code: 'ID_CARD_SCHEMA_NOT_READY',
          error: 'Employee ID Card database schema is not initialized or schema cache is refreshing. Database migration required.',
        },
        { status: 503 }
      )
    }

    console.error('[POST /api/admin/employee-id-cards] Unhandled exception:', err?.message || err)
    return NextResponse.json({ success: false, error: 'ID Card generation failed.' }, { status: 500 })
  } finally {
    if (heartbeat) {
      heartbeat.stop()
    }
    if (codeReleaseFn && !isCommitted) {
      try {
        await codeReleaseFn()
      } catch {
        // best-effort cleanup
      }
    }
  }
}
