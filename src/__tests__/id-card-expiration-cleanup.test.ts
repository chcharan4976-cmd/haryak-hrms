import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanupExpiredIdCards, deleteTemporaryCardById } from '@/lib/services/id-card-cleanup-service'
import { calculateCardExpirationDate, isCardExpired } from '@/lib/services/id-card-storage-service'
import { NextRequest } from 'next/server'
import {
  GET as cleanupGet,
  POST as cleanupPost,
  PUT as cleanupPut,
  DELETE as cleanupDelete,
} from '@/app/api/admin/employee-id-cards/cleanup/route'
import * as idCardCleanupService from '@/lib/services/id-card-cleanup-service'
import * as companyResolver from '@/lib/services/company-resolver'
import { DatabaseSchemaNotReadyError } from '@/lib/services/id-card-repository'

describe('Employee ID Card 24-Hour Expiration & Automatic Cleanup (Phase 2)', () => {
  const companyId = '88888888-8888-8888-8888-888888888888'
  const employeeId = '99999999-9999-9999-9999-999999999999'

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('correctly sets expiration to exactly 24 hours from creation', () => {
    vi.useFakeTimers()
    try {
      const creationTime = new Date('2026-11-02T10:00:00.000Z')
      vi.setSystemTime(creationTime)

      const expirationTime = calculateCardExpirationDate(creationTime)
      const expiryTime = expirationTime.getTime()

      expect(expirationTime.toISOString()).toBe('2026-11-03T10:00:00.000Z')
      expect(expirationTime.getTime() - creationTime.getTime()).toBe(24 * 60 * 60 * 1000)

      // 1 millisecond before expiry → not expired
      vi.setSystemTime(new Date(expiryTime - 1))
      expect(isCardExpired(expirationTime)).toBe(false)

      // Exactly at expiry → expired
      vi.setSystemTime(new Date(expiryTime))
      expect(isCardExpired(expirationTime)).toBe(true)

      // 1 millisecond after expiry → expired
      vi.setSystemTime(new Date(expiryTime + 1))
      expect(isCardExpired(expirationTime)).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('identifies and deletes expired cards after verifying directory is empty', async () => {
    const expiredCardId = '11111111-2222-3333-4444-555555555555'

    const mockCards = [
      {
        id: expiredCardId,
        company_id: companyId,
        employee_id: employeeId,
        card_image_path: `${companyId}/${expiredCardId}/card.png`,
        card_pdf_path: `${companyId}/${expiredCardId}/card.pdf`,
        photo_url: 'https://example.com/permanent-photo.jpg', // permanent employee photo
        expires_at: new Date(Date.now() - 3600000).toISOString(), // expired 1h ago
      },
    ]

    const createQueryChain = (data: any) => {
      const chain: any = {
        select: vi.fn(() => chain),
        lte: vi.fn(() => chain),
        is: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        then: (resolve: any) => Promise.resolve({ data, error: null }).then(resolve),
      }
      return chain
    }

    const createDeleteChain = () => {
      const chain: any = {
        eq: vi.fn(() => chain),
        then: (resolve: any) => Promise.resolve({ error: null, count: 1 }).then(resolve),
      }
      return chain
    }

    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === 'temporary_employee_id_cards') {
          return {
            select: vi.fn(() => createQueryChain(mockCards)),
            delete: vi.fn(() => createDeleteChain()),
          }
        }
        return {}
      }),
      storage: {
        from: vi.fn(() => ({
          remove: vi.fn().mockResolvedValue({
            data: [{ name: 'card.png' }, { name: 'card.pdf' }],
            error: null,
          }),
          list: vi.fn().mockResolvedValue({ data: [], error: null }),
        })),
      },
    }

    vi.spyOn(await import('@/lib/supabase/admin'), 'createAdminClient')
      .mockReturnValue(mockSupabase as any)

    const cleanupResult = await cleanupExpiredIdCards({ companyId })

    expect(cleanupResult.success).toBe(true)
    expect(cleanupResult.expiredCount).toBe(1)
    expect(cleanupResult.deletedFilesCount).toBe(2)
    expect(cleanupResult.deletedRecordsCount).toBe(1)
  })

  it('retains database record if directory cleanup verification reveals remaining files', async () => {
    const expiredCardId = '11111111-2222-3333-4444-555555555555'
    let dbDeleteCalled = false

    const mockCards = [
      {
        id: expiredCardId,
        company_id: companyId,
        card_image_path: `${companyId}/${expiredCardId}/card.png`,
        card_pdf_path: `${companyId}/${expiredCardId}/card.pdf`,
        expires_at: new Date(Date.now() - 3600000).toISOString(),
      },
    ]

    const createQueryChain = (data: any) => {
      const chain: any = {
        select: vi.fn(() => chain),
        lte: vi.fn(() => chain),
        is: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        then: (resolve: any) => Promise.resolve({ data, error: null }).then(resolve),
      }
      return chain
    }

    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === 'temporary_employee_id_cards') {
          return {
            select: vi.fn(() => createQueryChain(mockCards)),
            delete: vi.fn(() => {
              dbDeleteCalled = true
              return { eq: vi.fn() }
            }),
          }
        }
        return {}
      }),
      storage: {
        from: vi.fn(() => ({
          remove: vi.fn().mockResolvedValue({
            data: [{ name: 'card.png' }],
            error: null,
          }),
          // List returns remaining file during post-cleanup check!
          list: vi.fn().mockResolvedValue({ data: [{ name: 'residual.pdf' }], error: null }),
        })),
      },
    }

    vi.spyOn(await import('@/lib/supabase/admin'), 'createAdminClient')
      .mockReturnValue(mockSupabase as any)

    const cleanupResult = await cleanupExpiredIdCards({ companyId })

    expect(cleanupResult.success).toBe(false)
    expect(cleanupResult.retainedRecordsCount).toBe(1)
    expect(cleanupResult.deletedRecordsCount).toBe(0)
    expect(dbDeleteCalled).toBe(false) // Database record MUST be retained!
  })

  it('supports immediate manual deletion of temporary ID card by Admin', async () => {
    const cardId = '22222222-3333-4444-5555-666666666666'

    const createChain = (data: any) => {
      const chain: any = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        gt: vi.fn(() => chain),
        is: vi.fn(() => chain),
        order: vi.fn(() => chain),
        maybeSingle: vi.fn().mockResolvedValue({ data, error: null }),
        then: (resolve: any) => Promise.resolve({ data, error: null }).then(resolve),
      }
      return chain
    }

    const createDeleteChain = () => {
      const chain: any = {
        eq: vi.fn(() => chain),
        then: (resolve: any) => Promise.resolve({ error: null, count: 1 }).then(resolve),
      }
      return chain
    }

    const mockCard = {
      id: cardId,
      company_id: companyId,
      card_image_path: `${companyId}/${cardId}/card.png`,
      card_pdf_path: `${companyId}/${cardId}/card.pdf`,
      expires_at: new Date(Date.now() + 3600000).toISOString(),
    }

    const mockSupabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => createChain(mockCard)),
        delete: vi.fn(() => createDeleteChain()),
      })),
      storage: {
        from: vi.fn(() => ({
          remove: vi.fn().mockResolvedValue({
            data: [{ name: 'card.png' }, { name: 'card.pdf' }],
            error: null,
          }),
          list: vi.fn().mockResolvedValue({ data: [], error: null }),
        })),
      },
    }

    vi.spyOn(await import('@/lib/supabase/admin'), 'createAdminClient')
      .mockReturnValue(mockSupabase as any)

    const result = await deleteTemporaryCardById(cardId, companyId)
    expect(result.success).toBe(true)
    expect(result.deletedFilesCount).toBe(2)
  })
})

describe('Vercel Cron & Administrator ID Card Cleanup Route API (GET & POST)', () => {
  const originalCronSecret = process.env.CRON_SECRET

  beforeEach(() => {
    vi.restoreAllMocks()
    process.env.CRON_SECRET = 'valid-test-cron-secret-12345'
  })

  afterEach(() => {
    if (originalCronSecret !== undefined) {
      process.env.CRON_SECRET = originalCronSecret
    } else {
      delete process.env.CRON_SECRET
    }
  })

  it('1. Valid cron GET with Bearer token executes global cleanup', async () => {
    const cleanupSpy = vi.spyOn(idCardCleanupService, 'cleanupExpiredIdCards').mockResolvedValue({
      success: true,
      scannedCount: 5,
      expiredCount: 5,
      deletedFilesCount: 10,
      deletedRecordsCount: 5,
      retainedRecordsCount: 0,
      errors: [],
      timestamp: new Date().toISOString(),
    })

    const req = new NextRequest('http://localhost:3000/api/admin/employee-id-cards/cleanup', {
      method: 'GET',
      headers: {
        authorization: 'Bearer valid-test-cron-secret-12345',
      },
    })

    const res = await cleanupGet(req)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)
    expect(json.deletedRecordsCount).toBe(5)
    expect(cleanupSpy).toHaveBeenCalledWith({
      allowGlobalCron: true,
      companyId: undefined,
    })
  })

  it('2. GET with missing CRON_SECRET on server fails closed with HTTP 500', async () => {
    delete process.env.CRON_SECRET
    const cleanupSpy = vi.spyOn(idCardCleanupService, 'cleanupExpiredIdCards')

    const req = new NextRequest('http://localhost:3000/api/admin/employee-id-cards/cleanup', {
      method: 'GET',
      headers: {
        authorization: 'Bearer valid-test-cron-secret-12345',
      },
    })

    const res = await cleanupGet(req)
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.success).toBe(false)
    expect(json.error).toContain('CRON_SECRET is not configured on the server')
    expect(cleanupSpy).not.toHaveBeenCalled()
  })

  it('3. GET with invalid Bearer token returns HTTP 401', async () => {
    const cleanupSpy = vi.spyOn(idCardCleanupService, 'cleanupExpiredIdCards')

    const req = new NextRequest('http://localhost:3000/api/admin/employee-id-cards/cleanup', {
      method: 'GET',
      headers: {
        authorization: 'Bearer invalid-cron-token-99999',
      },
    })

    const res = await cleanupGet(req)
    expect(res.status).toBe(401)
    const json = await res.json()
    expect(json.success).toBe(false)
    expect(json.error).toContain('Invalid cron secret provided')
    expect(cleanupSpy).not.toHaveBeenCalled()
  })

  it('4. GET with mismatched length Bearer token fails safely with HTTP 401', async () => {
    const cleanupSpy = vi.spyOn(idCardCleanupService, 'cleanupExpiredIdCards')

    const req = new NextRequest('http://localhost:3000/api/admin/employee-id-cards/cleanup', {
      method: 'GET',
      headers: {
        authorization: 'Bearer short',
      },
    })

    const res = await cleanupGet(req)
    expect(res.status).toBe(401)
    const json = await res.json()
    expect(json.success).toBe(false)
    expect(json.error).toContain('Invalid cron secret provided')
    expect(cleanupSpy).not.toHaveBeenCalled()
  })

  it('5. GET with missing Authorization header returns HTTP 401', async () => {
    const cleanupSpy = vi.spyOn(idCardCleanupService, 'cleanupExpiredIdCards')

    const req = new NextRequest('http://localhost:3000/api/admin/employee-id-cards/cleanup', {
      method: 'GET',
    })

    const res = await cleanupGet(req)
    expect(res.status).toBe(401)
    const json = await res.json()
    expect(json.success).toBe(false)
    expect(json.error).toContain('Missing or invalid authorization header')
    expect(cleanupSpy).not.toHaveBeenCalled()
  })

  it('6. Administrator session cannot trigger global cleanup through GET (returns HTTP 401)', async () => {
    // Administrator is logged in with a valid SUPER_ADMIN session
    vi.spyOn(companyResolver, 'resolveRequestContext').mockResolvedValue({
      ok: true,
      context: {
        authUserId: 'admin-auth-1',
        email: 'admin@haryak.com',
        fullName: 'Super Administrator',
        companyId: 'comp-admin-1',
        employeeId: null,
        employeeCode: null,
        roles: ['SUPER_ADMIN'],
      },
    })
    const cleanupSpy = vi.spyOn(idCardCleanupService, 'cleanupExpiredIdCards')

    // Admin attempts to call GET without CRON_SECRET (e.g. browser navigation)
    const req = new NextRequest('http://localhost:3000/api/admin/employee-id-cards/cleanup', {
      method: 'GET',
    })

    const res = await cleanupGet(req)
    expect(res.status).toBe(401)
    const json = await res.json()
    expect(json.success).toBe(false)
    expect(json.error).toContain('Missing or invalid authorization header')
    expect(cleanupSpy).not.toHaveBeenCalled()
  })

  it('7. Existing POST by authenticated administrator performs company-scoped cleanup', async () => {
    vi.spyOn(companyResolver, 'resolveRequestContext').mockResolvedValue({
      ok: true,
      context: {
        authUserId: 'admin-auth-1',
        email: 'companyadmin@haryak.com',
        fullName: 'Company Administrator',
        companyId: 'comp-target-888',
        employeeId: null,
        employeeCode: null,
        roles: ['HR_ADMIN'],
      },
    })

    const cleanupSpy = vi.spyOn(idCardCleanupService, 'cleanupExpiredIdCards').mockResolvedValue({
      success: true,
      scannedCount: 2,
      expiredCount: 2,
      deletedFilesCount: 4,
      deletedRecordsCount: 2,
      retainedRecordsCount: 0,
      errors: [],
      timestamp: new Date().toISOString(),
    })

    const req = new NextRequest('http://localhost:3000/api/admin/employee-id-cards/cleanup', {
      method: 'POST',
    })

    const res = await cleanupPost(req)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)
    // Strictly scoped to the administrator's company, global cleanup forbidden
    expect(cleanupSpy).toHaveBeenCalledWith({
      companyId: 'comp-target-888',
      allowGlobalCron: false,
    })
  })

  it('8. Existing POST by non-admin employee returns HTTP 403 Forbidden', async () => {
    vi.spyOn(companyResolver, 'resolveRequestContext').mockResolvedValue({
      ok: true,
      context: {
        authUserId: 'emp-auth-1',
        email: 'emp@haryak.com',
        fullName: 'Standard Employee',
        companyId: 'comp-target-888',
        employeeId: 'emp-profile-1',
        employeeCode: 'HRK-001',
        roles: ['EMPLOYEE'],
      },
    })
    const cleanupSpy = vi.spyOn(idCardCleanupService, 'cleanupExpiredIdCards')

    const req = new NextRequest('http://localhost:3000/api/admin/employee-id-cards/cleanup', {
      method: 'POST',
    })

    const res = await cleanupPost(req)
    expect(res.status).toBe(403)
    const json = await res.json()
    expect(json.success).toBe(false)
    expect(json.error).toContain('Admin authorization required')
    expect(cleanupSpy).not.toHaveBeenCalled()
  })

  it('9. Existing POST with valid cron Bearer token performs global cleanup', async () => {
    const cleanupSpy = vi.spyOn(idCardCleanupService, 'cleanupExpiredIdCards').mockResolvedValue({
      success: true,
      scannedCount: 1,
      expiredCount: 1,
      deletedFilesCount: 2,
      deletedRecordsCount: 1,
      retainedRecordsCount: 0,
      errors: [],
      timestamp: new Date().toISOString(),
    })

    const req = new NextRequest('http://localhost:3000/api/admin/employee-id-cards/cleanup', {
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-test-cron-secret-12345',
      },
    })

    const res = await cleanupPost(req)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)
    expect(cleanupSpy).toHaveBeenCalledWith({
      allowGlobalCron: true,
      companyId: undefined,
    })
  })

  it('10. Database schema uninitialized returns HTTP 503 ID_CARD_SCHEMA_NOT_READY', async () => {
    vi.spyOn(idCardCleanupService, 'cleanupExpiredIdCards').mockRejectedValue(
      new DatabaseSchemaNotReadyError('Table missing')
    )

    const req = new NextRequest('http://localhost:3000/api/admin/employee-id-cards/cleanup', {
      method: 'GET',
      headers: {
        authorization: 'Bearer valid-test-cron-secret-12345',
      },
    })

    const res = await cleanupGet(req)
    expect(res.status).toBe(503)
    const json = await res.json()
    expect(json.code).toBe('ID_CARD_SCHEMA_NOT_READY')
  })

  it('11. Unsupported HTTP methods (PUT, DELETE) return HTTP 405 Method Not Allowed', async () => {
    const putRes = await cleanupPut()
    expect(putRes.status).toBe(405)
    expect(putRes.headers.get('Allow')).toBe('GET, POST')

    const delRes = await cleanupDelete()
    expect(delRes.status).toBe(405)
    expect(delRes.headers.get('Allow')).toBe('GET, POST')
  })
})
