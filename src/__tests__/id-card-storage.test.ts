import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  calculateCardExpirationDate,
  isCardExpired,
  storeTemporaryCardAsset,
  retrieveTemporaryCardBuffer,
  deleteTemporaryCardFiles,
  deleteTemporaryCardDirectory,
  validateStorageObjectPath,
  validateFileSignature,
  isValidUUID,
  MAX_CARD_FILE_SIZE,
} from '@/lib/services/id-card-storage-service'

const COMPANY_ID = '11111111-1111-1111-1111-111111111111'
const CARD_ID = '22222222-2222-2222-2222-222222222222'

// Valid mock buffers with authentic magic bytes
const VALID_PNG_BUFFER = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
  Buffer.from('sample-png-content'),
])

const VALID_PDF_BUFFER = Buffer.concat([
  Buffer.from('%PDF-1.4\n'),
  Buffer.from('sample-pdf-content'),
])

describe('Employee ID Card Storage & Security Service Hardening', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('1. calculates strict 24-hour expiration timestamp using exact arithmetic', () => {
    const start = new Date('2026-11-03T10:00:00Z')
    const expires = calculateCardExpirationDate(start)
    expect(expires.toISOString()).toBe('2026-11-04T10:00:00.000Z')
    expect(expires.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000)
  })

  it('2. evaluates expiration at exact millisecond boundaries: -1ms active, 0ms expired, +1ms expired', () => {
    vi.useFakeTimers()
    try {
      const startTime = new Date('2026-11-03T12:00:00.000Z')
      vi.setSystemTime(startTime)

      const expiryDate = calculateCardExpirationDate(startTime)
      const expiryTime = expiryDate.getTime()

      // 1 millisecond before expiry → not expired
      vi.setSystemTime(new Date(expiryTime - 1))
      expect(isCardExpired(expiryDate)).toBe(false)

      // Exactly at expiry → expired
      vi.setSystemTime(new Date(expiryTime))
      expect(isCardExpired(expiryDate)).toBe(true)

      // 1 millisecond after expiry → expired
      vi.setSystemTime(new Date(expiryTime + 1))
      expect(isCardExpired(expiryDate)).toBe(true)

      // Null, undefined, and empty string handling (fails closed)
      expect(isCardExpired(null)).toBe(true)
      expect(isCardExpired(undefined)).toBe(true)
      expect(isCardExpired('')).toBe(true)
      expect(isCardExpired('invalid-date')).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('3. validates UUIDs and storage path integrity against path traversal', () => {
    expect(isValidUUID(COMPANY_ID)).toBe(true)
    expect(isValidUUID(CARD_ID)).toBe(true)
    expect(isValidUUID('invalid-uuid')).toBe(false)
    expect(isValidUUID(null)).toBe(false)

    // Valid paths
    const validPng = validateStorageObjectPath(`${COMPANY_ID}/${CARD_ID}/card.png`)
    expect(validPng.valid).toBe(true)
    expect(validPng.fileName).toBe('card.png')

    const validPdf = validateStorageObjectPath(`${COMPANY_ID}/${CARD_ID}/card.pdf`)
    expect(validPdf.valid).toBe(true)
    expect(validPdf.fileName).toBe('card.pdf')

    // Directory traversal rejected
    expect(validateStorageObjectPath(`../${COMPANY_ID}/${CARD_ID}/card.png`).valid).toBe(false)
    expect(validateStorageObjectPath(`${COMPANY_ID}/../${CARD_ID}/card.png`).valid).toBe(false)
    expect(validateStorageObjectPath(`${COMPANY_ID}/${CARD_ID}/../../secret.txt`).valid).toBe(false)
    expect(validateStorageObjectPath(`/${COMPANY_ID}/${CARD_ID}/card.png`).valid).toBe(false)
    expect(validateStorageObjectPath(`${COMPANY_ID}\\${CARD_ID}\\card.png`).valid).toBe(false)

    // Invalid extension rejected
    const invalidExt = validateStorageObjectPath(`${COMPANY_ID}/${CARD_ID}/malicious.exe`)
    expect(invalidExt.valid).toBe(false)
    expect(invalidExt.error).toContain('only alphanumeric, hyphen, underscore, and .png or .pdf')
  })

  it('4. strictly validates PNG and PDF magic byte signatures', () => {
    expect(validateFileSignature(VALID_PNG_BUFFER, 'png')).toBe(true)
    expect(validateFileSignature(VALID_PDF_BUFFER, 'pdf')).toBe(true)

    // Cross-format mismatch
    expect(validateFileSignature(VALID_PNG_BUFFER, 'pdf')).toBe(false)
    expect(validateFileSignature(VALID_PDF_BUFFER, 'png')).toBe(false)

    // Corrupted / random buffers
    expect(validateFileSignature(Buffer.from('corrupted-data'), 'png')).toBe(false)
    expect(validateFileSignature(Buffer.from('corrupted-data'), 'pdf')).toBe(false)
    expect(validateFileSignature(Buffer.alloc(4), 'png')).toBe(false)
  })

  it('5. rejects mismatched MIME types and oversized files', async () => {
    // MIME mismatch: passing application/pdf for a .png file
    await expect(
      storeTemporaryCardAsset({
        companyId: COMPANY_ID,
        cardId: CARD_ID,
        fileBuffer: VALID_PNG_BUFFER,
        fileName: 'card.png',
        mimeType: 'application/pdf',
      })
    ).rejects.toThrow('MIME type mismatch')

    // Oversized buffer (> 10MB)
    const oversizedBuffer = Buffer.alloc(MAX_CARD_FILE_SIZE + 1024)
    // Put valid PNG header so size check is tested
    for (let i = 0; i < 8; i++) oversizedBuffer[i] = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A][i]

    await expect(
      storeTemporaryCardAsset({
        companyId: COMPANY_ID,
        cardId: CARD_ID,
        fileBuffer: oversizedBuffer,
        fileName: 'card.png',
        mimeType: 'image/png',
      })
    ).rejects.toThrow('exceeds maximum limit')
  })

  it('6. stores and retrieves temporary ID card PNG buffer securely using Supabase Storage', async () => {
    const mockUpload = vi.fn().mockResolvedValue({
      data: { path: `${COMPANY_ID}/${CARD_ID}/employee-card.png` },
      error: null,
    })
    const mockDownload = vi.fn().mockResolvedValue({
      data: {
        arrayBuffer: async () => Uint8Array.from(VALID_PNG_BUFFER).buffer,
      },
      error: null,
    })

    const mockSupabase = {
      storage: {
        from: vi.fn(() => ({
          upload: mockUpload,
          download: mockDownload,
        })),
      },
    }

    vi.spyOn(await import('@/lib/supabase/admin'), 'createAdminClient')
      .mockReturnValue(mockSupabase as any)

    const stored = await storeTemporaryCardAsset({
      companyId: COMPANY_ID,
      cardId: CARD_ID,
      fileBuffer: VALID_PNG_BUFFER,
      fileName: 'employee-card.png',
      mimeType: 'image/png',
    })

    expect(stored.storagePath).toBe(`${COMPANY_ID}/${CARD_ID}/employee-card.png`)
    expect(stored.fileUrl).toContain('download?path=')

    // Verify upsert is false
    expect(mockUpload).toHaveBeenCalledWith(
      `${COMPANY_ID}/${CARD_ID}/employee-card.png`,
      VALID_PNG_BUFFER,
      expect.objectContaining({ upsert: false })
    )

    const retrieved = await retrieveTemporaryCardBuffer(stored.storagePath)
    expect(retrieved).not.toBeNull()
    expect(retrieved?.buffer.equals(VALID_PNG_BUFFER)).toBe(true)
    expect(retrieved?.mimeType).toBe('image/png')
  })

  it('7. distinguishes missing files from storage service outages', async () => {
    // 7a: 404 / Object not found returns null cleanly
    const mockSupabaseNotFound = {
      storage: {
        from: vi.fn(() => ({
          download: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'Object not found', status: 404 },
          }),
        })),
      },
    }

    vi.spyOn(await import('@/lib/supabase/admin'), 'createAdminClient')
      .mockReturnValue(mockSupabaseNotFound as any)

    const resultNotFound = await retrieveTemporaryCardBuffer(`${COMPANY_ID}/${CARD_ID}/missing.png`)
    expect(resultNotFound).toBeNull()

    // 7b: Storage outage / 503 throws an explicit error
    const mockSupabaseOutage = {
      storage: {
        from: vi.fn(() => ({
          download: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'Connection to S3 endpoint timed out', status: 503 },
          }),
        })),
      },
    }

    vi.spyOn(await import('@/lib/supabase/admin'), 'createAdminClient')
      .mockReturnValue(mockSupabaseOutage as any)

    await expect(
      retrieveTemporaryCardBuffer(`${COMPANY_ID}/${CARD_ID}/card.png`)
    ).rejects.toThrow('Storage service error while retrieving file')
  })

  it('8. handles paginated directory listings and verifies complete folder emptiness', async () => {
    // Simulate first page returns 100 items, second page returns 2 items
    const page1 = Array.from({ length: 100 }, (_, i) => ({ name: `file_${i}.png` }))
    const page2 = [{ name: 'file_100.png' }, { name: 'file_101.pdf' }]

    let listCallCount = 0
    const mockList = vi.fn(async (_folder: string, options?: any) => {
      listCallCount++
      if (options?.offset === 0) return { data: page1, error: null }
      if (options?.offset === 100) return { data: page2, error: null }
      // Post-cleanup verification listing: returns empty
      return { data: [], error: null }
    })

    const mockRemove = vi.fn().mockResolvedValue({
      data: [{ name: 'dummy' }],
      error: null,
    })

    const mockSupabase = {
      storage: {
        from: vi.fn(() => ({
          list: mockList,
          remove: mockRemove,
        })),
      },
    }

    vi.spyOn(await import('@/lib/supabase/admin'), 'createAdminClient')
      .mockReturnValue(mockSupabase as any)

    const result = await deleteTemporaryCardDirectory(COMPANY_ID, CARD_ID)

    expect(result.success).toBe(true)
    expect(result.remainingCount).toBe(0)
    // 2 pagination calls + 1 post-cleanup verification call = 3
    expect(listCallCount).toBe(3)
  })
})
