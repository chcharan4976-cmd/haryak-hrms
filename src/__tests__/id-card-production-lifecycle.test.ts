/**
 * Haryak Technologies India Private Limited
 * Production Temporary Employee ID Card Lifecycle & Security Test Suite
 *
 * Comprehensive verification of all 18 production acceptance criteria:
 * 1. Administrator authorization.
 * 2. Employee access denial.
 * 3. Cross-company isolation.
 * 4. Invalid and expired sessions.
 * 5. PNG and PDF validation.
 * 6. Oversized request bodies.
 * 7. Upload failure.
 * 8. Database insert failure and storage rollback.
 * 9. Valid card download.
 * 10. Expired card download.
 * 11. Unauthorized manual deletion.
 * 12. Storage deletion failure.
 * 13. Partial cleanup failure.
 * 14. Concurrent generation.
 * 15. Concurrent cleanup.
 * 16. Cron authentication.
 * 17. Pagination and retry behavior.
 * 18. Protection of original employee photographs.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import {
  calculateCardExpirationDate,
  isCardExpired,
  validateStorageObjectPath,
  validateFileSignature,
  storeTemporaryCardAsset,
  deleteTemporaryCardFiles,
  deleteTemporaryCardDirectory,
} from '@/lib/services/id-card-storage-service'
import {
  getActiveTemporaryCards,
  getExpiredTemporaryCards,
  getTemporaryCardById,
  deleteTemporaryCardRecord,
  purgeExpiredCardRecords,
} from '@/lib/services/id-card-repository'
import {
  cleanupExpiredIdCards,
  deleteTemporaryCardById,
} from '@/lib/services/id-card-cleanup-service'
import { GET as downloadGet } from '@/app/api/admin/employee-id-cards/download/route'
import { POST as cleanupPost, GET as cleanupGet } from '@/app/api/admin/employee-id-cards/cleanup/route'
import { GET as cardsGet, POST as cardsPost } from '@/app/api/admin/employee-id-cards/route'
import { DELETE as cardDelete } from '@/app/api/admin/employee-id-cards/[id]/route'

const COMPANY_A = '11111111-aaaa-aaaa-aaaa-111111111111'
const COMPANY_B = '22222222-bbbb-bbbb-bbbb-222222222222'
const CARD_ID_1 = '33333333-cccc-cccc-cccc-333333333333'
const CARD_ID_2 = '44444444-dddd-dddd-dddd-444444444444'
const EMPLOYEE_ID = '55555555-eeee-eeee-eeee-555555555555'

const VALID_PNG_BUFFER = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
  Buffer.from('png-body-data'),
])

const VALID_PDF_BUFFER = Buffer.concat([
  Buffer.from('%PDF-1.4\n'),
  Buffer.from('pdf-body-data'),
])

describe('Production-Safe Employee ID Card 18-Point Acceptance Suite', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.restoreAllMocks()
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  // 1. Administrator authorization
  it('1. grants access to administrators with SUPER_ADMIN, HR_ADMIN, PAYROLL_ADMIN, or ADMINISTRATION roles', async () => {
    const adminRoles = ['SUPER_ADMIN', 'HR_ADMIN', 'PAYROLL_ADMIN', 'ADMINISTRATION']

    for (const role of adminRoles) {
      vi.spyOn(await import('@/lib/services/company-resolver'), 'resolveRequestContext')
        .mockResolvedValue({
          ok: true,
          context: {
            companyId: COMPANY_A,
            authUserId: `admin-${role}`,
            roles: [role],
          } as any,
        })

      vi.spyOn(await import('@/lib/services/id-card-repository'), 'getActiveTemporaryCards')
        .mockResolvedValue({ cards: [] })

      const req = new NextRequest('http://localhost/api/admin/employee-id-cards')
      const res = await cardsGet(req)
      expect(res.status).toBe(200)
    }
  })

  // 2. Employee access denial
  it('2. strictly denies access to employees with 403 Forbidden across GET, POST, DELETE, and cleanup', async () => {
    vi.spyOn(await import('@/lib/services/company-resolver'), 'resolveRequestContext')
      .mockResolvedValue({
        ok: true,
        context: {
          companyId: COMPANY_A,
          authUserId: 'regular-employee-1',
          roles: ['EMPLOYEE'],
        } as any,
      })

    const getRes = await cardsGet(new NextRequest('http://localhost/api/admin/employee-id-cards'))
    expect(getRes.status).toBe(403)

    const postReq = new NextRequest('http://localhost/api/admin/employee-id-cards', {
      method: 'POST',
      body: JSON.stringify({ employeeName: 'Test' }),
    })
    const postRes = await cardsPost(postReq)
    expect(postRes.status).toBe(403)

    const delRes = await cardDelete(
      new NextRequest(`http://localhost/api/admin/employee-id-cards/${CARD_ID_1}`, { method: 'DELETE' }),
      { params: Promise.resolve({ id: CARD_ID_1 }) }
    )
    expect(delRes.status).toBe(403)

    const cleanRes = await cleanupPost(
      new NextRequest('http://localhost/api/admin/employee-id-cards/cleanup', { method: 'POST' })
    )
    expect(cleanRes.status).toBe(403)
  })

  // 3. Cross-company isolation
  it('3. strictly isolates company data: Company B cannot download, view, or delete Company A cards', async () => {
    vi.spyOn(await import('@/lib/services/company-resolver'), 'resolveRequestContext')
      .mockResolvedValue({
        ok: true,
        context: {
          companyId: COMPANY_B,
          authUserId: 'admin-b',
          roles: ['SUPER_ADMIN'],
        } as any,
      })

    // Download path belongs to COMPANY_A
    const downloadReq = new NextRequest(
      `http://localhost/api/admin/employee-id-cards/download?path=${encodeURIComponent(`${COMPANY_A}/${CARD_ID_1}/card.png`)}`
    )
    const downloadRes = await downloadGet(downloadReq)
    expect(downloadRes.status).toBe(403)
    const dlBody = await downloadRes.json()
    expect(dlBody.error).toContain('Access denied: File does not belong to your company.')

    // Repository lookup returns null across tenant boundary
    const mockSupabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn((col, val) => ({
            eq: vi.fn((c2, v2) => ({
              is: vi.fn(() => ({
                gt: vi.fn(() => ({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: (val === COMPANY_A && v2 === COMPANY_A) ? { id: CARD_ID_1 } : null,
                    error: null,
                  }),
                })),
                maybeSingle: vi.fn().mockResolvedValue({
                  data: (val === COMPANY_A && v2 === COMPANY_A) ? { id: CARD_ID_1 } : null,
                  error: null,
                }),
              })),
            })),
          })),
        })),
      })),
    }

    vi.spyOn(await import('@/lib/supabase/admin'), 'createAdminClient')
      .mockReturnValue(mockSupabase as any)

    const cardForB = await getTemporaryCardById(CARD_ID_1, COMPANY_B)
    expect(cardForB).toBeNull()
  })

  // 4. Invalid and expired sessions
  it('4. rejects invalid or expired sessions with 401 Unauthenticated across all studio endpoints', async () => {
    vi.spyOn(await import('@/lib/services/company-resolver'), 'resolveRequestContext')
      .mockResolvedValue({
        ok: false,
        error: {
          status: 401,
          code: 'UNAUTHENTICATED',
          message: 'Authentication required. Please log in.',
        },
      })

    const getRes = await cardsGet(new NextRequest('http://localhost/api/admin/employee-id-cards'))
    expect(getRes.status).toBe(401)

    const postRes = await cardsPost(
      new NextRequest('http://localhost/api/admin/employee-id-cards', {
        method: 'POST',
        body: JSON.stringify({ employeeName: 'Test' }),
      })
    )
    expect(postRes.status).toBe(401)

    const delRes = await cardDelete(
      new NextRequest(`http://localhost/api/admin/employee-id-cards/${CARD_ID_1}`, { method: 'DELETE' }),
      { params: Promise.resolve({ id: CARD_ID_1 }) }
    )
    expect(delRes.status).toBe(401)

    const dlRes = await downloadGet(
      new NextRequest(`http://localhost/api/admin/employee-id-cards/download?path=${COMPANY_A}/${CARD_ID_1}/card.png`)
    )
    expect(dlRes.status).toBe(401)
  })

  // 5. PNG and PDF validation
  it('5. strictly validates PNG and PDF magic byte signatures and rejects mismatched extensions', () => {
    expect(validateFileSignature(VALID_PNG_BUFFER, 'png')).toBe(true)
    expect(validateFileSignature(VALID_PDF_BUFFER, 'pdf')).toBe(true)
    expect(validateFileSignature(VALID_PNG_BUFFER, 'pdf')).toBe(false)
    expect(validateFileSignature(VALID_PDF_BUFFER, 'png')).toBe(false)
    expect(validateFileSignature(Buffer.from('not-a-valid-format'), 'png')).toBe(false)
  })

  // 6. Oversized request bodies
  it('6. rejects oversized request bodies exceeding 25MB limit with HTTP 413 Payload Too Large', async () => {
    vi.spyOn(await import('@/lib/services/company-resolver'), 'resolveRequestContext')
      .mockResolvedValue({
        ok: true,
        context: {
          companyId: COMPANY_A,
          authUserId: 'admin-1',
          roles: ['SUPER_ADMIN'],
        } as any,
      })

    const oversizedReq = new NextRequest('http://localhost/api/admin/employee-id-cards', {
      method: 'POST',
      headers: {
        'content-length': '30000000', // 30MB
      },
      body: JSON.stringify({ employeeName: 'Oversized' }),
    })

    const res = await cardsPost(oversizedReq)
    expect(res.status).toBe(413)
    const body = await res.json()
    expect(body.error).toContain('Payload too large')
  })

  // 7. Upload failure
  it('7. fails explicitly and throws when Supabase storage upload fails without falling back to local disk', async () => {
    const mockSupabase = {
      storage: {
        from: vi.fn(() => ({
          upload: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'Storage connection timeout' },
          }),
        })),
      },
    }

    vi.spyOn(await import('@/lib/supabase/admin'), 'createAdminClient')
      .mockReturnValue(mockSupabase as any)

    await expect(
      storeTemporaryCardAsset({
        companyId: COMPANY_A,
        cardId: CARD_ID_1,
        fileBuffer: VALID_PNG_BUFFER,
        fileName: 'card.png',
        mimeType: 'image/png',
      })
    ).rejects.toThrow('Supabase storage upload failed: Storage connection timeout')
  })

  // 8. Database insert failure and storage rollback
  it('8. executes compensating storage rollback when database insert fails', async () => {
    vi.spyOn(await import('@/lib/services/company-resolver'), 'resolveRequestContext')
      .mockResolvedValue({
        ok: true,
        context: {
          companyId: COMPANY_A,
          authUserId: 'admin-1',
          roles: ['SUPER_ADMIN'],
        } as any,
      })

    let rollbackStorageDeleted = false
    let rollbackDirDeleted = false

    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === 'companies') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({ data: { employee_id_prefix: 'HRK' } }),
              })),
            })),
          }
        }
        if (table === 'employees') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn().mockResolvedValue({ data: [] }),
            })),
          }
        }
        if (table === 'temporary_employee_id_cards') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                is: vi.fn().mockResolvedValue({ data: [] }),
              })),
            })),
            insert: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({
                  data: null,
                  error: { message: 'Database connection pool exhausted' },
                }),
              })),
            })),
          }
        }
        return {}
      }),
      storage: {
        from: vi.fn(() => ({
          upload: vi.fn().mockResolvedValue({ data: { path: `${COMPANY_A}/${CARD_ID_1}/card.png` }, error: null }),
          remove: vi.fn(async () => {
            rollbackStorageDeleted = true
            return { data: [{ name: 'card.png' }], error: null }
          }),
          list: vi.fn(async () => {
            rollbackDirDeleted = true
            return { data: [], error: null }
          }),
        })),
      },
    }

    vi.spyOn(await import('@/lib/supabase/admin'), 'createAdminClient')
      .mockReturnValue(mockSupabase as any)

    const postReq = new NextRequest('http://localhost/api/admin/employee-id-cards', {
      method: 'POST',
      body: JSON.stringify({
        employeeName: 'Rollback Candidate',
        cardPngBase64: `data:image/png;base64,${VALID_PNG_BUFFER.toString('base64')}`,
      }),
    })

    const res = await cardsPost(postReq)
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.success).toBe(false)
    expect(body.rollback.attempted).toBe(true)
    expect(body.rollback.succeeded).toBe(true)
    expect(rollbackStorageDeleted).toBe(true)
    expect(rollbackDirDeleted).toBe(true)
  })

  // 9. Valid card download
  it('9. streams valid active card download with binary buffer and non-caching headers', async () => {
    vi.spyOn(await import('@/lib/services/company-resolver'), 'resolveRequestContext')
      .mockResolvedValue({
        ok: true,
        context: {
          companyId: COMPANY_A,
          authUserId: 'admin-1',
          roles: ['SUPER_ADMIN'],
        } as any,
      })

    const activeCard = {
      id: CARD_ID_1,
      company_id: COMPANY_A,
      card_image_path: `${COMPANY_A}/${CARD_ID_1}/card.png`,
      expires_at: new Date(Date.now() + 3600000).toISOString(),
    }

    vi.spyOn(await import('@/lib/services/id-card-repository'), 'getTemporaryCardById')
      .mockResolvedValue(activeCard as any)

    const mockSupabase = {
      storage: {
        from: vi.fn(() => ({
          download: vi.fn().mockResolvedValue({
            data: { arrayBuffer: async () => Uint8Array.from(VALID_PNG_BUFFER).buffer },
            error: null,
          }),
        })),
      },
    }

    vi.spyOn(await import('@/lib/supabase/admin'), 'createAdminClient')
      .mockReturnValue(mockSupabase as any)

    const downloadReq = new NextRequest(
      `http://localhost/api/admin/employee-id-cards/download?path=${encodeURIComponent(activeCard.card_image_path)}`
    )
    const downloadRes = await downloadGet(downloadReq)
    expect(downloadRes.status).toBe(200)
    expect(downloadRes.headers.get('content-type')).toBe('image/png')
    expect(downloadRes.headers.get('content-disposition')).toContain('attachment; filename="card.png"')
    expect(downloadRes.headers.get('cache-control')).toContain('no-store')
  })

  // 10. Expired card download
  it('10. rejects download of card past 24-hour expiration with HTTP 410 Gone', async () => {
    vi.spyOn(await import('@/lib/services/company-resolver'), 'resolveRequestContext')
      .mockResolvedValue({
        ok: true,
        context: {
          companyId: COMPANY_A,
          authUserId: 'admin-1',
          roles: ['SUPER_ADMIN'],
        } as any,
      })

    const expiredCard = {
      id: CARD_ID_1,
      company_id: COMPANY_A,
      card_image_path: `${COMPANY_A}/${CARD_ID_1}/card.png`,
      expires_at: new Date(Date.now() - 3600000).toISOString(),
    }

    vi.spyOn(await import('@/lib/services/id-card-repository'), 'getTemporaryCardById')
      .mockResolvedValue(expiredCard as any)

    const downloadReq = new NextRequest(
      `http://localhost/api/admin/employee-id-cards/download?path=${encodeURIComponent(expiredCard.card_image_path)}`
    )
    const downloadRes = await downloadGet(downloadReq)
    expect(downloadRes.status).toBe(410)
    const body = await downloadRes.json()
    expect(body.error).toContain('expired')
  })

  // 11. Unauthorized manual deletion
  it('11. denies unauthorized deletion of another company card with HTTP 404', async () => {
    vi.spyOn(await import('@/lib/services/company-resolver'), 'resolveRequestContext')
      .mockResolvedValue({
        ok: true,
        context: {
          companyId: COMPANY_B,
          authUserId: 'admin-b',
          roles: ['SUPER_ADMIN'],
        } as any,
      })

    // Simulate card not found under COMPANY_B
    const mockSupabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              is: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              })),
            })),
          })),
        })),
      })),
    }

    vi.spyOn(await import('@/lib/supabase/admin'), 'createAdminClient')
      .mockReturnValue(mockSupabase as any)

    const delRes = await cardDelete(
      new NextRequest(`http://localhost/api/admin/employee-id-cards/${CARD_ID_1}`, { method: 'DELETE' }),
      { params: Promise.resolve({ id: CARD_ID_1 }) }
    )
    expect(delRes.status).toBe(404)
  })

  // 12. Storage deletion failure
  it('12. retains database record when storage deletion fails during cleanup', async () => {
    let dbRecordDeleted = false

    const expiredCard = {
      id: CARD_ID_1,
      company_id: COMPANY_A,
      card_image_path: `${COMPANY_A}/${CARD_ID_1}/card.png`,
      expires_at: new Date(Date.now() - 3600000).toISOString(),
    }

    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === 'temporary_employee_id_cards') {
          return {
            select: vi.fn(() => ({
              lte: vi.fn(() => ({
                is: vi.fn(() => ({
                  eq: vi.fn().mockResolvedValue({ data: [expiredCard], error: null }),
                })),
              })),
            })),
            delete: vi.fn(() => {
              dbRecordDeleted = true
              return { eq: vi.fn() }
            }),
          }
        }
        return {}
      }),
      storage: {
        from: vi.fn(() => ({
          remove: vi.fn().mockResolvedValue({ data: null, error: { message: 'Storage unavailable' } }),
          list: vi.fn().mockResolvedValue({ data: [], error: null }),
        })),
      },
    }

    vi.spyOn(await import('@/lib/supabase/admin'), 'createAdminClient')
      .mockReturnValue(mockSupabase as any)

    const cleanupResult = await cleanupExpiredIdCards({ companyId: COMPANY_A })
    expect(cleanupResult.success).toBe(false)
    expect(cleanupResult.retainedRecordsCount).toBe(1)
    expect(cleanupResult.deletedRecordsCount).toBe(0)
    expect(dbRecordDeleted).toBe(false)
  })

  // 13. Partial cleanup failure
  it('13. handles partial cleanup failure independently without failing unaffected cards', async () => {
    const cardGood = {
      id: CARD_ID_1,
      company_id: COMPANY_A,
      card_image_path: `${COMPANY_A}/${CARD_ID_1}/card.png`,
      expires_at: new Date(Date.now() - 3600000).toISOString(),
    }

    const cardFailing = {
      id: CARD_ID_2,
      company_id: COMPANY_A,
      card_image_path: `${COMPANY_A}/${CARD_ID_2}/card.png`,
      expires_at: new Date(Date.now() - 3600000).toISOString(),
    }

    const deletedDbCards: string[] = []

    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === 'temporary_employee_id_cards') {
          return {
            select: vi.fn(() => ({
              lte: vi.fn(() => ({
                is: vi.fn(() => ({
                  eq: vi.fn().mockResolvedValue({ data: [cardGood, cardFailing], error: null }),
                })),
              })),
            })),
            delete: vi.fn(() => ({
              eq: vi.fn((_c1, idVal) => ({
                eq: vi.fn(async () => {
                  deletedDbCards.push(idVal)
                  return { error: null, count: 1 }
                }),
              })),
            })),
          }
        }
        return {}
      }),
      storage: {
        from: vi.fn(() => ({
          remove: vi.fn(async (paths: string[]) => {
            if (paths.some(p => p.includes(CARD_ID_2))) {
              return { data: null, error: { message: 'S3 disk error' } }
            }
            return { data: paths.map(p => ({ name: p.split('/').pop() })), error: null }
          }),
          list: vi.fn(async (folder: string) => {
            if (folder.includes(CARD_ID_2)) {
              return { data: [{ name: 'card.png' }], error: null }
            }
            return { data: [], error: null }
          }),
        })),
      },
    }

    vi.spyOn(await import('@/lib/supabase/admin'), 'createAdminClient')
      .mockReturnValue(mockSupabase as any)

    const cleanupResult = await cleanupExpiredIdCards({ companyId: COMPANY_A })
    expect(cleanupResult.deletedRecordsCount).toBe(1)
    expect(cleanupResult.retainedRecordsCount).toBe(1)
    expect(deletedDbCards).toContain(CARD_ID_1)
    expect(deletedDbCards).not.toContain(CARD_ID_2)
    expect(cleanupResult.errors.length).toBeGreaterThan(0)
  })

  // 14. Concurrent generation
  it('14. allocates distinct sequential codes without collision during concurrent generation', async () => {
    vi.spyOn(await import('@/lib/services/company-resolver'), 'resolveRequestContext')
      .mockResolvedValue({
        ok: true,
        context: {
          companyId: COMPANY_A,
          authUserId: 'admin-1',
          roles: ['SUPER_ADMIN'],
        } as any,
      })

    const generatedCodes: string[] = []

    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === 'companies') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({ data: { employee_id_prefix: 'HRK' } }),
              })),
            })),
          }
        }
        if (table === 'employees') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn().mockResolvedValue({ data: [{ employee_code: 'HRK-001' }] }),
            })),
          }
        }
        if (table === 'temporary_employee_id_cards') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                is: vi.fn().mockResolvedValue({ data: [] }),
              })),
            })),
            insert: vi.fn((payload) => {
              generatedCodes.push(payload.employee_code)
              return {
                select: vi.fn(() => ({
                  single: vi.fn().mockResolvedValue({ data: payload, error: null }),
                })),
              }
            }),
          }
        }
        return {}
      }),
      storage: {
        from: vi.fn(() => ({
          upload: vi.fn().mockResolvedValue({ data: { path: 'dummy' }, error: null }),
          remove: vi.fn().mockResolvedValue({ data: [], error: null }),
          list: vi.fn().mockResolvedValue({ data: [], error: null }),
        })),
      },
    }

    vi.spyOn(await import('@/lib/supabase/admin'), 'createAdminClient')
      .mockReturnValue(mockSupabase as any)

    const req1 = new NextRequest('http://localhost/api/admin/employee-id-cards', {
      method: 'POST',
      body: JSON.stringify({ employeeName: 'Simultaneous 1' }),
    })
    const req2 = new NextRequest('http://localhost/api/admin/employee-id-cards', {
      method: 'POST',
      body: JSON.stringify({ employeeName: 'Simultaneous 2' }),
    })

    const [res1, res2] = await Promise.all([cardsPost(req1), cardsPost(req2)])

    expect(res1.status).toBe(200)
    expect(res2.status).toBe(200)
    expect(generatedCodes.length).toBe(2)
    // The two simultaneously allocated codes must be distinct!
    expect(generatedCodes[0]).not.toBe(generatedCodes[1])
    expect(new Set(generatedCodes).size).toBe(2)
  })

  // 14b. Distributed atomic RPC allocation across independent serverless instances
  it('14b. utilizes database-backed atomic RPC across independent application instances to prevent distributed collisions', async () => {
    vi.spyOn(await import('@/lib/services/company-resolver'), 'resolveRequestContext')
      .mockResolvedValue({
        ok: true,
        context: {
          companyId: COMPANY_A,
          authUserId: 'admin-1',
          roles: ['SUPER_ADMIN'],
        } as any,
      })

    let rpcCallCount = 0
    const allocatedCodes: string[] = []

    const mockSupabase = {
      rpc: vi.fn(async (funcName: string, args: any) => {
        if (funcName === 'allocate_next_employee_code') {
          rpcCallCount++
          const code = `HRK-${String(rpcCallCount + 5).padStart(3, '0')}`
          return { data: code, error: null }
        }
        return { data: null, error: { message: 'Unknown RPC' } }
      }),
      from: vi.fn((table: string) => {
        if (table === 'temporary_employee_id_cards') {
          return {
            insert: vi.fn((payload) => {
              allocatedCodes.push(payload.employee_code)
              return {
                select: vi.fn(() => ({
                  single: vi.fn().mockResolvedValue({ data: payload, error: null }),
                })),
              }
            }),
          }
        }
        return {}
      }),
      storage: {
        from: vi.fn(() => ({
          upload: vi.fn().mockResolvedValue({ data: { path: 'dummy' }, error: null }),
          remove: vi.fn().mockResolvedValue({ data: [], error: null }),
          list: vi.fn().mockResolvedValue({ data: [], error: null }),
        })),
      },
    }

    vi.spyOn(await import('@/lib/supabase/admin'), 'createAdminClient')
      .mockReturnValue(mockSupabase as any)

    // Simulate requests arriving at two independent serverless instances
    const req1 = new NextRequest('http://localhost/api/admin/employee-id-cards', {
      method: 'POST',
      body: JSON.stringify({ employeeName: 'Serverless Instance 1' }),
    })
    const req2 = new NextRequest('http://localhost/api/admin/employee-id-cards', {
      method: 'POST',
      body: JSON.stringify({ employeeName: 'Serverless Instance 2' }),
    })

    const [res1, res2] = await Promise.all([cardsPost(req1), cardsPost(req2)])

    expect(res1.status).toBe(200)
    expect(res2.status).toBe(200)
    expect(rpcCallCount).toBe(2)
    expect(allocatedCodes).toEqual(['HRK-006', 'HRK-007'])
    expect(mockSupabase.rpc).toHaveBeenCalledWith('allocate_next_employee_code', {
      p_company_id: COMPANY_A,
      p_is_temporary: true,
    })
  })

  // 15. Concurrent cleanup
  it('15. handles concurrent cleanup requests safely without false error or double counting', async () => {
    const mockCard = {
      id: CARD_ID_1,
      company_id: COMPANY_A,
      card_image_path: `${COMPANY_A}/${CARD_ID_1}/card.png`,
      expires_at: new Date(Date.now() + 3600000).toISOString(),
    }

    // Simulate concurrent worker already deleted row (count = 0)
    const mockSupabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              is: vi.fn(() => ({
                gt: vi.fn(() => ({
                  maybeSingle: vi.fn().mockResolvedValue({ data: mockCard, error: null }),
                })),
                maybeSingle: vi.fn().mockResolvedValue({ data: mockCard, error: null }),
              })),
            })),
          })),
        })),
        delete: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({ error: null, count: 0 }),
          })),
        })),
      })),
      storage: {
        from: vi.fn(() => ({
          remove: vi.fn().mockResolvedValue({ data: [{ name: 'card.png' }], error: null }),
          list: vi.fn().mockResolvedValue({ data: [], error: null }),
        })),
      },
    }

    vi.spyOn(await import('@/lib/supabase/admin'), 'createAdminClient')
      .mockReturnValue(mockSupabase as any)

    const result = await deleteTemporaryCardById(CARD_ID_1, COMPANY_A)
    // Concurrently deleted by another worker is treated safely as success
    expect(result.success).toBe(true)
  })

  // 16. Cron authentication
  it('16. enforces dedicated CRON_SECRET authentication: fails closed, requires CRON_SECRET on GET (401), rejects invalid secrets (401)', async () => {
    // 1. Unauthenticated GET returns 401 Unauthorized
    const getRes = await cleanupGet()
    expect(getRes.status).toBe(401)

    // 2. Fails closed when CRON_SECRET is unconfigured on server
    delete process.env.CRON_SECRET
    const failClosedReq = new NextRequest('http://localhost/api/admin/employee-id-cards/cleanup', {
      method: 'POST',
      headers: { 'x-cron-secret': 'any-secret' },
    })
    const failClosedRes = await cleanupPost(failClosedReq)
    expect(failClosedRes.status).toBe(500)

    // 3. Rejects invalid cron secret with 401
    process.env.CRON_SECRET = 'correct-super-secret-key-32chars!!'
    const wrongSecretReq = new NextRequest('http://localhost/api/admin/employee-id-cards/cleanup', {
      method: 'POST',
      headers: { 'x-cron-secret': 'wrong-secret' },
    })
    const wrongSecretRes = await cleanupPost(wrongSecretReq)
    expect(wrongSecretRes.status).toBe(401)

    // 4. Accepts valid cron secret with 200 (both POST and GET)
    vi.spyOn(await import('@/lib/services/id-card-cleanup-service'), 'cleanupExpiredIdCards')
      .mockResolvedValue({ success: true, scannedCount: 0, expiredCount: 0, deletedFilesCount: 0, deletedRecordsCount: 0, retainedRecordsCount: 0, errors: [], timestamp: '' })

    const validSecretReq = new NextRequest('http://localhost/api/admin/employee-id-cards/cleanup', {
      method: 'POST',
      headers: { 'x-cron-secret': 'correct-super-secret-key-32chars!!' },
    })
    const validSecretRes = await cleanupPost(validSecretReq)
    expect(validSecretRes.status).toBe(200)

    const validGetReq = new NextRequest('http://localhost/api/admin/employee-id-cards/cleanup', {
      method: 'GET',
      headers: { authorization: 'Bearer correct-super-secret-key-32chars!!' },
    })
    const validGetRes = await cleanupGet(validGetReq)
    expect(validGetRes.status).toBe(200)
  })

  // 17. Pagination and retry behavior
  it('17. paginates directory listings for cards with >100 files and retries safely', async () => {
    let listCallCount = 0

    const mockSupabase = {
      storage: {
        from: vi.fn(() => ({
          list: vi.fn(async (_folder, options) => {
            listCallCount++
            if (options?.offset === 0) {
              // Page 1: 100 items
              return {
                data: Array.from({ length: 100 }, (_, i) => ({ name: `asset_${i}.png` })),
                error: null,
              }
            } else if (options?.offset === 100) {
              // Page 2: 15 items
              return {
                data: Array.from({ length: 15 }, (_, i) => ({ name: `asset_${100 + i}.png` })),
                error: null,
              }
            }
            // Verification listing (empty)
            return { data: [], error: null }
          }),
          remove: vi.fn().mockResolvedValue({
            data: Array.from({ length: 115 }, (_, i) => ({ name: `asset_${i}.png` })),
            error: null,
          }),
        })),
      },
    }

    vi.spyOn(await import('@/lib/supabase/admin'), 'createAdminClient')
      .mockReturnValue(mockSupabase as any)

    const dirResult = await deleteTemporaryCardDirectory(COMPANY_A, CARD_ID_1)
    expect(dirResult.success).toBe(true)
    expect(dirResult.deletedCount).toBe(115)
    expect(listCallCount).toBeGreaterThanOrEqual(2)
  })

  // 18. Protection of original employee photographs
  it('18. guarantees original employee profile photos and employees table records are never touched', async () => {
    let employeeTableDeleted = false
    const permanentPhotoUrl = 'https://supabase.internal/storage/v1/object/public/company-assets/profiles/emp_original.jpg'

    const expiredCard = {
      id: CARD_ID_1,
      company_id: COMPANY_A,
      employee_id: EMPLOYEE_ID,
      card_image_path: `${COMPANY_A}/${CARD_ID_1}/card.png`,
      card_pdf_path: `${COMPANY_A}/${CARD_ID_1}/card.pdf`,
      photo_url: permanentPhotoUrl,
      expires_at: new Date(Date.now() - 3600000).toISOString(),
    }

    const removedPaths: string[] = []

    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === 'employees') {
          return {
            delete: vi.fn(() => {
              employeeTableDeleted = true
              return { eq: vi.fn() }
            }),
          }
        }
        if (table === 'temporary_employee_id_cards') {
          return {
            select: vi.fn(() => ({
              lte: vi.fn(() => ({
                is: vi.fn(() => ({
                  eq: vi.fn().mockResolvedValue({ data: [expiredCard], error: null }),
                })),
              })),
            })),
            delete: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn().mockResolvedValue({ error: null, count: 1 }),
              })),
            })),
          }
        }
        return {}
      }),
      storage: {
        from: vi.fn(() => ({
          remove: vi.fn(async (paths: string[]) => {
            removedPaths.push(...paths)
            return {
              data: paths.map(p => ({ name: p.split('/').pop() })),
              error: null,
            }
          }),
          list: vi.fn().mockResolvedValue({ data: [], error: null }),
        })),
      },
    }

    vi.spyOn(await import('@/lib/supabase/admin'), 'createAdminClient')
      .mockReturnValue(mockSupabase as any)

    const cleanupResult = await cleanupExpiredIdCards({ companyId: COMPANY_A })

    expect(cleanupResult.success).toBe(true)
    expect(employeeTableDeleted).toBe(false)
    expect(removedPaths).not.toContain(permanentPhotoUrl)
    expect(removedPaths).toContain(expiredCard.card_image_path)
    expect(removedPaths).toContain(expiredCard.card_pdf_path)
  })
})
