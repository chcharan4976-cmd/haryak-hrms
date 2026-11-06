/**
 * Haryak HRMS — Safe JSON Parsing and API Route Resilience Regression Tests
 *
 * Verifies immunity against "SyntaxError: Unexpected end of JSON input":
 * 1. safeParseResponse handles valid JSON, 204 No Content, 205 Reset Content, empty bodies,
 *    non-JSON HTML/text error pages, malformed JSON, and stream read errors.
 * 2. safeFetchJson intercepts network transport rejections gracefully.
 * 3. GET /api/admin/employee-id-cards always emits structured JSON responses even when
 *    PostgREST schema cache reports missing tables or database exceptions occur.
 */

import { describe, it, expect, vi } from 'vitest'
import { safeParseResponse, safeFetchJson, parseJsonResponse } from '@/lib/api-client'
import { GET as getAdminIdCards } from '@/app/api/admin/employee-id-cards/route'
import { NextRequest } from 'next/server'

describe('Safe JSON Parsing Utility (safeParseResponse & safeFetchJson)', () => {
  it('parses valid JSON response with HTTP 200 successfully', async () => {
    const mockResponse = new Response(JSON.stringify({ success: true, count: 42, label: 'test' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })

    const result = await safeParseResponse<{ success: boolean; count: number; label: string }>(mockResponse)

    expect(result.ok).toBe(true)
    expect(result.status).toBe(200)
    expect(result.data).toEqual({ success: true, count: 42, label: 'test' })
    expect(result.error).toBeUndefined()
  })

  it('supports vendor-specific JSON Content-Types (+json)', async () => {
    const mockResponse = new Response(JSON.stringify({ problem: 'none' }), {
      status: 200,
      headers: { 'Content-Type': 'application/problem+json' },
    })

    const result = await safeParseResponse<{ problem: string }>(mockResponse)

    expect(result.ok).toBe(true)
    expect(result.data).toEqual({ problem: 'none' })
  })

  it('handles HTTP 204 No Content gracefully without attempting JSON parse', async () => {
    const mockResponse = new Response(null, {
      status: 204,
      statusText: 'No Content',
    })

    const result = await safeParseResponse(mockResponse)

    expect(result.ok).toBe(true)
    expect(result.status).toBe(204)
    expect(result.data).toBeNull()
    expect(result.error).toBeUndefined()
  })

  it('handles HTTP 205 Reset Content gracefully without attempting JSON parse', async () => {
    const mockResponse = new Response(null, {
      status: 205,
      statusText: 'Reset Content',
    })

    const result = await safeParseResponse(mockResponse)

    expect(result.ok).toBe(true)
    expect(result.status).toBe(205)
    expect(result.data).toBeNull()
  })

  it('handles HTTP 200 with an empty body string safely without throwing SyntaxError', async () => {
    const mockResponse = new Response('', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })

    const result = await safeParseResponse(mockResponse)

    expect(result.ok).toBe(true)
    expect(result.status).toBe(200)
    expect(result.data).toBeNull()
    expect(result.error).toBeUndefined()
  })

  it('handles HTTP 500 with an empty body string safely without throwing SyntaxError', async () => {
    const mockResponse = new Response('', {
      status: 500,
      statusText: 'Internal Server Error',
    })

    const result = await safeParseResponse(mockResponse)

    expect(result.ok).toBe(false)
    expect(result.status).toBe(500)
    expect(result.data).toBeNull()
    expect(result.error).toContain('empty response body')
  })

  it('handles non-JSON HTML error page (e.g. 500 HTML) safely without throwing SyntaxError', async () => {
    const htmlPayload = '<!DOCTYPE html><html><body><h1>500 Internal Server Error</h1><p>Crash</p></body></html>'
    const mockResponse = new Response(htmlPayload, {
      status: 500,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })

    const result = await safeParseResponse(mockResponse)

    expect(result.ok).toBe(false)
    expect(result.status).toBe(500)
    expect(result.data).toBeNull()
    expect(result.error).toContain('Expected JSON response')
    expect(result.error).toContain('text/html')
  })

  it('handles non-JSON plain text error safely without throwing SyntaxError', async () => {
    const mockResponse = new Response('Bad Gateway', {
      status: 502,
      headers: { 'Content-Type': 'text/plain' },
    })

    const result = await safeParseResponse(mockResponse)

    expect(result.ok).toBe(false)
    expect(result.status).toBe(502)
    expect(result.data).toBeNull()
    expect(result.error).toContain('Expected JSON response')
  })

  it('handles malformed JSON payload safely without throwing unhandled SyntaxError', async () => {
    const mockResponse = new Response('{"broken": true, unclosed', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })

    const result = await safeParseResponse(mockResponse)

    expect(result.ok).toBe(false)
    expect(result.status).toBe(200)
    expect(result.data).toBeNull()
    expect(result.error).toContain('Malformed JSON response')
  })

  it('extracts error message from structured JSON error responses', async () => {
    const mockResponse = new Response(JSON.stringify({ success: false, error: 'Custom domain constraint failed.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })

    const result = await safeParseResponse<{ success: boolean; error: string }>(mockResponse)

    expect(result.ok).toBe(false)
    expect(result.status).toBe(400)
    expect(result.data?.success).toBe(false)
    expect(result.error).toBe('Custom domain constraint failed.')
  })

  it('parseJsonResponse returns default value when parsing fails or response is empty', async () => {
    const emptyResponse = new Response(null, { status: 204 })
    const defaultValue = { fallback: true }

    const parsed = await parseJsonResponse(emptyResponse, defaultValue)
    expect(parsed).toEqual(defaultValue)
  })

  it('safeFetchJson catches network fetch rejections and returns status 0 error', async () => {
    const originalFetch = global.fetch
    global.fetch = vi.fn().mockRejectedValue(new Error('Failed to fetch: Connection refused'))

    try {
      const result = await safeFetchJson('http://localhost:3000/api/nonexistent')

      expect(result.ok).toBe(false)
      expect(result.status).toBe(0)
      expect(result.data).toBeNull()
      expect(result.error).toContain('Network request failed')
      expect(result.error).toContain('Connection refused')
    } finally {
      global.fetch = originalFetch
    }
  })
})

describe('Server Route Resilience: GET /api/admin/employee-id-cards', () => {
  it('returns structured JSON with 401 when request is unauthenticated', async () => {
    const request = new NextRequest('http://localhost:3000/api/admin/employee-id-cards', {
      method: 'GET',
    })

    const response = await getAdminIdCards(request)

    expect(response.status).toBe(401)
    expect(response.headers.get('content-type')).toContain('application/json')

    const body = await response.json()
    expect(body.success).toBe(false)
    expect(body.error).toBeDefined()
  })
})

describe('Database Schema Error Handling & Missing Table Distinction', () => {
  const COMPANY_ID = '11111111-aaaa-aaaa-aaaa-111111111111'
  const CARD_ID = '22222222-bbbb-bbbb-bbbb-222222222222'

  it('correctly classifies 42P01/PGRST205 (missing table), PGRST204 (missing column), and PGRST200 (missing relationship)', async () => {
    const {
      isTableMissingError,
      isColumnMissingError,
      isRelationshipMissingError,
      DatabaseSchemaNotReadyError,
    } = await import('@/lib/services/id-card-repository')

    // Missing table (42P01, PGRST205, or table schema cache messages)
    expect(isTableMissingError({ code: 'PGRST205', message: 'Could not find the table in the schema cache' })).toBe(true)
    expect(isTableMissingError({ code: '42P01', message: 'relation "public.temporary_employee_id_cards" does not exist' })).toBe(true)
    expect(isTableMissingError({ message: 'could not find the table "public.temporary_employee_id_cards" in the schema cache' })).toBe(true)
    expect(isTableMissingError('Could not find the table public.temporary_employee_id_cards in the schema cache')).toBe(true)
    expect(isTableMissingError(new DatabaseSchemaNotReadyError())).toBe(true)
    expect(isTableMissingError({ code: 'ID_CARD_SCHEMA_NOT_READY' })).toBe(true)

    // Crucial: Missing column (PGRST204) and missing relationship (PGRST200) must NOT be misclassified as missing table
    expect(isTableMissingError({ code: 'PGRST204', message: 'Could not find the column "pt_amount" in the schema cache' })).toBe(false)
    expect(isTableMissingError({ code: 'PGRST200', message: 'Could not find a relationship between tables' })).toBe(false)

    // Accurate classification helpers
    expect(isColumnMissingError({ code: 'PGRST204', message: 'Could not find the column in the schema cache' })).toBe(true)
    expect(isColumnMissingError({ code: '42703', message: 'column does not exist' })).toBe(true)
    expect(isRelationshipMissingError({ code: 'PGRST200', message: 'Could not find a relationship' })).toBe(true)

    // Unrelated errors should not match
    expect(isTableMissingError(null)).toBe(false)
    expect(isTableMissingError({ code: '23505', message: 'duplicate key value violates unique constraint' })).toBe(false)
    expect(isTableMissingError({ code: '42501', message: 'permission denied for table' })).toBe(false)
  })

  it('Scenario A: returns HTTP 200 with empty cards array when table exists and contains zero cards', async () => {
    vi.spyOn(await import('@/lib/services/company-resolver'), 'resolveRequestContext')
      .mockResolvedValue({
        ok: true,
        context: {
          companyId: COMPANY_ID,
          authUserId: 'admin-user-1',
          roles: ['SUPER_ADMIN'],
        } as any,
      })

    // Simulate table existing but containing 0 records
    vi.spyOn(await import('@/lib/services/id-card-repository'), 'getActiveTemporaryCards')
      .mockResolvedValue({ cards: [] })

    const request = new NextRequest('http://localhost:3000/api/admin/employee-id-cards', { method: 'GET' })
    const response = await getAdminIdCards(request)

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/json')

    const body = await response.json()
    expect(body.success).toBe(true)
    expect(body.cards).toEqual([])
    expect(body.stats).toEqual({
      totalToday: 0,
      activeCount: 0,
      expiringSoonCount: 0,
      deletedAfter24Hours: true,
    })
  })

  it('Scenario B & C: returns HTTP 503 with ID_CARD_SCHEMA_NOT_READY when table is missing or schema cache is not ready', async () => {
    const { DatabaseSchemaNotReadyError } = await import('@/lib/services/id-card-repository')

    vi.spyOn(await import('@/lib/services/company-resolver'), 'resolveRequestContext')
      .mockResolvedValue({
        ok: true,
        context: {
          companyId: COMPANY_ID,
          authUserId: 'admin-user-1',
          roles: ['SUPER_ADMIN'],
        } as any,
      })

    // Simulate missing table throwing DatabaseSchemaNotReadyError
    vi.spyOn(await import('@/lib/services/id-card-repository'), 'getActiveTemporaryCards')
      .mockRejectedValue(new DatabaseSchemaNotReadyError('Could not find the table "public.temporary_employee_id_cards" in the schema cache'))

    const request = new NextRequest('http://localhost:3000/api/admin/employee-id-cards', { method: 'GET' })
    const response = await getAdminIdCards(request)

    expect(response.status).toBe(503)
    expect(response.headers.get('content-type')).toContain('application/json')

    const body = await response.json()
    expect(body.success).toBe(false)
    expect(body.code).toBe('ID_CARD_SCHEMA_NOT_READY')
    expect(body.error).toContain('schema is not initialized')
    expect(body.cards).toEqual([])
  })

  it('returns HTTP 503 with ID_CARD_SCHEMA_NOT_READY when DELETE /api/admin/employee-id-cards/[id] encounters missing table', async () => {
    const { DELETE: deleteCard } = await import('@/app/api/admin/employee-id-cards/[id]/route')
    const { DatabaseSchemaNotReadyError } = await import('@/lib/services/id-card-repository')

    vi.spyOn(await import('@/lib/services/company-resolver'), 'resolveRequestContext')
      .mockResolvedValue({
        ok: true,
        context: {
          companyId: COMPANY_ID,
          authUserId: 'admin-user-1',
          roles: ['HR_ADMIN'],
        } as any,
      })

    vi.spyOn(await import('@/lib/services/id-card-cleanup-service'), 'deleteTemporaryCardById')
      .mockRejectedValue(new DatabaseSchemaNotReadyError())

    const req = new NextRequest(`http://localhost:3000/api/admin/employee-id-cards/${CARD_ID}`, { method: 'DELETE' })
    const res = await deleteCard(req, { params: Promise.resolve({ id: CARD_ID }) })

    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.success).toBe(false)
    expect(body.code).toBe('ID_CARD_SCHEMA_NOT_READY')
  })

  it('returns HTTP 503 with ID_CARD_SCHEMA_NOT_READY when GET /api/admin/employee-id-cards/download encounters missing table', async () => {
    const { GET: downloadCard } = await import('@/app/api/admin/employee-id-cards/download/route')
    const { DatabaseSchemaNotReadyError } = await import('@/lib/services/id-card-repository')

    vi.spyOn(await import('@/lib/services/company-resolver'), 'resolveRequestContext')
      .mockResolvedValue({
        ok: true,
        context: {
          companyId: COMPANY_ID,
          authUserId: 'admin-user-1',
          roles: ['SUPER_ADMIN'],
        } as any,
      })

    vi.spyOn(await import('@/lib/services/id-card-repository'), 'getTemporaryCardById')
      .mockRejectedValue(new DatabaseSchemaNotReadyError())

    const req = new NextRequest(`http://localhost:3000/api/admin/employee-id-cards/download?path=${COMPANY_ID}/${CARD_ID}/card.png`, { method: 'GET' })
    const res = await downloadCard(req)

    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.success).toBe(false)
    expect(body.code).toBe('ID_CARD_SCHEMA_NOT_READY')
  })

  it('returns HTTP 503 with ID_CARD_SCHEMA_NOT_READY when POST /api/admin/employee-id-cards/cleanup encounters missing table', async () => {
    const { POST: cleanupCards } = await import('@/app/api/admin/employee-id-cards/cleanup/route')
    const { DatabaseSchemaNotReadyError } = await import('@/lib/services/id-card-repository')

    vi.spyOn(await import('@/lib/services/company-resolver'), 'resolveRequestContext')
      .mockResolvedValue({
        ok: true,
        context: {
          companyId: COMPANY_ID,
          authUserId: 'admin-user-1',
          roles: ['SUPER_ADMIN'],
        } as any,
      })

    vi.spyOn(await import('@/lib/services/id-card-cleanup-service'), 'cleanupExpiredIdCards')
      .mockRejectedValue(new DatabaseSchemaNotReadyError())

    const req = new NextRequest('http://localhost:3000/api/admin/employee-id-cards/cleanup', { method: 'POST' })
    const res = await cleanupCards(req)

    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.success).toBe(false)
    expect(body.code).toBe('ID_CARD_SCHEMA_NOT_READY')
  })
})
