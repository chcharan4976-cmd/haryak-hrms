/**
 * Haryak Technologies India Private Limited
 * Temporary Employee ID Card Storage Service
 *
 * Dedicated private Supabase Storage handler for temporary ID card assets (PNG & PDF)
 * with strict 24-hour expiration lifecycle.
 * Local filesystem fallback is completely removed in production.
 */

import { createAdminClient } from '@/lib/supabase/admin'

export const TEMPORARY_BUCKET_NAME = 'temporary-id-cards'
export const DEFAULT_EXPIRATION_HOURS = 24
export const MAX_CARD_FILE_SIZE = 10 * 1024 * 1024 // 10MB maximum allowed file size

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SAFE_FILENAME_REGEX = /^[a-zA-Z0-9_\-]+\.(png|pdf)$/i

// Magic byte signatures for file verification
const PNG_MAGIC = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2D] // "%PDF-"

export interface StoreTemporaryFileOptions {
  companyId: string
  cardId: string
  fileBuffer: Buffer
  fileName: string
  mimeType: string
}

export interface StoredCardFileResult {
  storagePath: string
  fileUrl: string
  fileSize: number
  mimeType: string
}

export interface StorageDeletionResult {
  success: boolean
  deleted: string[]
  failed: string[]
  alreadyAbsent: string[]
  deletedCount: number
}

export interface DirectoryCleanupResult {
  success: boolean
  deletedCount: number
  remainingCount: number
  error?: string
}

/**
 * Validates a UUID string
 */
export function isValidUUID(id: string | null | undefined): boolean {
  return typeof id === 'string' && UUID_REGEX.test(id.trim())
}

/**
 * Validates file signature (magic bytes) to verify actual file format
 */
export function validateFileSignature(fileBuffer: Buffer, ext: 'png' | 'pdf'): boolean {
  if (!Buffer.isBuffer(fileBuffer) || fileBuffer.length < 8) {
    return false
  }

  if (ext === 'png') {
    return PNG_MAGIC.every((byte, idx) => fileBuffer[idx] === byte)
  }

  if (ext === 'pdf') {
    return PDF_MAGIC.every((byte, idx) => fileBuffer[idx] === byte)
  }

  return false
}

/**
 * Validates that a storage path belongs to the temporary-id-cards bucket structure:
 * Format: {companyId}/{cardId}/{fileName}.(png|pdf)
 */
export function validateStorageObjectPath(storagePath: string): {
  valid: boolean
  companyId?: string
  cardId?: string
  fileName?: string
  error?: string
} {
  if (!storagePath || typeof storagePath !== 'string') {
    return { valid: false, error: 'Storage path is required.' }
  }

  if (storagePath.length > 255) {
    return { valid: false, error: 'Storage path exceeds maximum allowed length.' }
  }

  // Prevent directory traversal and invalid path characters
  if (
    storagePath.includes('..') ||
    storagePath.startsWith('/') ||
    storagePath.includes('\\')
  ) {
    return { valid: false, error: 'Path traversal or invalid path characters detected.' }
  }

  const parts = storagePath.split('/')
  if (parts.length !== 3) {
    return {
      valid: false,
      error: 'Invalid storage path structure: expected {companyId}/{cardId}/{fileName}.',
    }
  }

  const [companyId, cardId, fileName] = parts

  if (!isValidUUID(companyId)) {
    return { valid: false, error: 'Invalid company ID in storage path.' }
  }

  if (!isValidUUID(cardId)) {
    return { valid: false, error: 'Invalid card ID in storage path.' }
  }

  if (!SAFE_FILENAME_REGEX.test(fileName) || fileName.length < 5 || fileName.length > 100) {
    return {
      valid: false,
      error: 'Invalid file name: only alphanumeric, hyphen, underscore, and .png or .pdf extensions allowed.',
    }
  }

  return { valid: true, companyId, cardId, fileName }
}

/**
 * Calculates strict 24-hour expiration timestamp
 */
export function calculateCardExpirationDate(startDate: Date = new Date()): Date {
  return new Date(
    startDate.getTime() + DEFAULT_EXPIRATION_HOURS * 60 * 60 * 1000
  )
}

/**
 * Check if an ID card has expired
 */
export function isCardExpired(expiresAt: string | Date | null | undefined): boolean {
  if (!expiresAt) return true
  const expiryTime = new Date(expiresAt).getTime()
  if (isNaN(expiryTime)) return true
  return Date.now() >= expiryTime
}

/**
 * Store a generated temporary card asset (PNG or PDF) in private Supabase Storage.
 * Enforces file size limits, extension matching, magic byte signatures, and disables upsert.
 */
export async function storeTemporaryCardAsset(
  options: StoreTemporaryFileOptions
): Promise<StoredCardFileResult> {
  const { companyId, cardId, fileBuffer, fileName, mimeType } = options

  if (!isValidUUID(companyId)) {
    throw new Error('Invalid company ID provided for card storage.')
  }

  if (!isValidUUID(cardId)) {
    throw new Error('Invalid card ID provided for card storage.')
  }

  if (!fileBuffer || !Buffer.isBuffer(fileBuffer) || fileBuffer.length === 0) {
    throw new Error('Invalid or empty file buffer provided for card storage.')
  }

  if (fileBuffer.length > MAX_CARD_FILE_SIZE) {
    throw new Error(`File size (${fileBuffer.length} bytes) exceeds maximum limit of ${MAX_CARD_FILE_SIZE} bytes.`)
  }

  if (!SAFE_FILENAME_REGEX.test(fileName)) {
    throw new Error('Unsafe or invalid file name provided for card storage.')
  }

  const ext = fileName.split('.').pop()?.toLowerCase() as 'png' | 'pdf'
  if (ext !== 'png' && ext !== 'pdf') {
    throw new Error('Invalid file extension: only .png and .pdf temporary card assets are permitted.')
  }

  // Strict MIME type matching
  const expectedMime = ext === 'png' ? 'image/png' : 'application/pdf'
  if (mimeType !== expectedMime) {
    throw new Error(`MIME type mismatch: expected ${expectedMime} for .${ext} file, received ${mimeType}.`)
  }

  // Strict magic bytes signature verification
  if (!validateFileSignature(fileBuffer, ext)) {
    throw new Error(`Invalid file content: buffer does not match valid ${ext.toUpperCase()} magic byte signature.`)
  }

  const storagePath = `${companyId}/${cardId}/${fileName}`
  const pathValidation = validateStorageObjectPath(storagePath)
  if (!pathValidation.valid) {
    throw new Error(`Storage path validation failed: ${pathValidation.error}`)
  }

  const supabase = createAdminClient()
  if (!supabase) {
    throw new Error('Supabase admin client is unavailable. Cannot store temporary ID card asset.')
  }

  // Avoid unnecessary upsert: true to prevent silent file collisions
  const { data, error } = await supabase.storage
    .from(TEMPORARY_BUCKET_NAME)
    .upload(storagePath, fileBuffer, {
      contentType: mimeType,
      upsert: false,
    })

  if (error) {
    throw new Error(`Supabase storage upload failed: ${error.message}`)
  }

  if (!data?.path) {
    throw new Error('Supabase storage upload completed but no object path was returned.')
  }

  return {
    storagePath,
    fileUrl: `/api/admin/employee-id-cards/download?path=${encodeURIComponent(storagePath)}`,
    fileSize: fileBuffer.length,
    mimeType,
  }
}

/**
 * Retrieve temporary card file buffer from private Supabase Storage.
 * Distinguishes missing files (returns null) from storage outages (throws explicit error).
 */
export async function retrieveTemporaryCardBuffer(
  storagePath: string
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  const pathValidation = validateStorageObjectPath(storagePath)
  if (!pathValidation.valid) {
    return null
  }

  const ext = storagePath.split('.').pop()?.toLowerCase() || ''
  const mimeMap: Record<string, string> = {
    png: 'image/png',
    pdf: 'application/pdf',
  }
  const mimeType = mimeMap[ext] || 'application/octet-stream'

  const supabase = createAdminClient()
  if (!supabase) {
    throw new Error('Supabase admin client is unavailable.')
  }

  const { data, error } = await supabase.storage
    .from(TEMPORARY_BUCKET_NAME)
    .download(storagePath)

  if (error) {
    const errorMsg = error.message?.toLowerCase() || ''
    const isNotFound =
      errorMsg.includes('not found') ||
      (error as any).status === 404 ||
      (error as any).statusCode === '404'

    if (isNotFound) {
      return null
    }

    // Storage outage or network/permission failure
    throw new Error(`Storage service error while retrieving file: ${error.message}`)
  }

  if (!data) {
    return null
  }

  const arrayBuf = await data.arrayBuffer()
  return {
    buffer: Buffer.from(arrayBuf),
    mimeType,
  }
}

/**
 * Delete one or more generated temporary card files (PNG and PDF only) from Supabase Storage.
 * Never deletes employee profile photos or paths outside temporary-id-cards.
 * Returns accurate deletion results distinguishing deleted, already absent, and failed.
 */
export async function deleteTemporaryCardFiles(
  storagePaths: string[]
): Promise<StorageDeletionResult> {
  const result: StorageDeletionResult = {
    success: true,
    deleted: [],
    failed: [],
    alreadyAbsent: [],
    deletedCount: 0,
  }

  if (!storagePaths || storagePaths.length === 0) {
    return result
  }

  const supabase = createAdminClient()
  if (!supabase) {
    result.success = false
    result.failed = [...storagePaths]
    return result
  }

  // Filter and validate paths strictly
  const validPathsToProcess: string[] = []
  for (const rawPath of storagePaths) {
    if (!rawPath) continue
    const validation = validateStorageObjectPath(rawPath)
    if (!validation.valid) {
      result.failed.push(rawPath)
      result.success = false
      continue
    }
    validPathsToProcess.push(rawPath)
  }

  if (validPathsToProcess.length === 0) {
    return result
  }

  try {
    const { data, error } = await supabase.storage
      .from(TEMPORARY_BUCKET_NAME)
      .remove(validPathsToProcess)

    if (error) {
      result.success = false
      result.failed.push(...validPathsToProcess)
      return result
    }

    const removedNames = new Set(
      (data || []).map((f: any) => f.name || f.path || f)
    )

    for (const p of validPathsToProcess) {
      const fileName = p.split('/').pop() || ''
      if (removedNames.has(p) || removedNames.has(fileName)) {
        result.deleted.push(p)
      } else {
        // In Supabase Storage, objects that were already absent return without error
        result.alreadyAbsent.push(p)
      }
    }

    result.deletedCount = result.deleted.length
    result.success = result.failed.length === 0
  } catch (err: any) {
    console.error('[StorageService] Error deleting temporary card files:', err.message || err)
    result.success = false
    result.failed.push(...validPathsToProcess)
  }

  return result
}

/**
 * Delete entire temporary card folder in Supabase Storage: {companyId}/{cardId}/
 * Handles paginated listings, deletes temporary assets, and verifies directory is empty.
 * Never touches employee profile photos or paths outside the temporary card folder.
 */
export async function deleteTemporaryCardDirectory(
  companyId: string,
  cardId: string
): Promise<DirectoryCleanupResult> {
  if (!isValidUUID(companyId) || !isValidUUID(cardId)) {
    return { success: false, deletedCount: 0, remainingCount: 0, error: 'Invalid company ID or card ID' }
  }

  const supabase = createAdminClient()
  if (!supabase) {
    return { success: false, deletedCount: 0, remainingCount: 0, error: 'Supabase admin client unavailable' }
  }

  const folder = `${companyId}/${cardId}`

  try {
    // 1. Paginated directory listing to retrieve all files in folder
    let offset = 0
    const limit = 100
    const allFiles: any[] = []
    let hasMore = true

    while (hasMore) {
      const { data: files, error: listError } = await supabase.storage
        .from(TEMPORARY_BUCKET_NAME)
        .list(folder, { limit, offset })

      if (listError) {
        return { success: false, deletedCount: 0, remainingCount: 0, error: `Storage list error: ${listError.message}` }
      }

      if (!files || files.length === 0) {
        break
      }

      allFiles.push(...files)
      if (files.length < limit) {
        hasMore = false
      } else {
        offset += limit
      }
    }

    if (allFiles.length === 0) {
      return { success: true, deletedCount: 0, remainingCount: 0 }
    }

    // 2. Identify generated temporary card assets (PNG and PDF only)
    const filePaths = allFiles
      .map((f: any) => `${folder}/${f.name}`)
      .filter((p: string) => {
        const ext = p.split('.').pop()?.toLowerCase()
        return ext === 'png' || ext === 'pdf'
      })

    let deletedCount = 0

    if (filePaths.length > 0) {
      const deleteResult = await deleteTemporaryCardFiles(filePaths)
      if (!deleteResult.success || deleteResult.failed.length > 0) {
        return {
          success: false,
          deletedCount: deleteResult.deletedCount,
          remainingCount: filePaths.length - deleteResult.deletedCount,
          error: `Failed to delete files: ${deleteResult.failed.join(', ')}`,
        }
      }
      deletedCount = deleteResult.deletedCount
    }

    // 3. Post-cleanup verification: check that directory is now empty
    const { data: verifyFiles, error: verifyError } = await supabase.storage
      .from(TEMPORARY_BUCKET_NAME)
      .list(folder, { limit: 10 })

    if (verifyError) {
      return {
        success: false,
        deletedCount,
        remainingCount: 0,
        error: `Post-cleanup directory verification failed: ${verifyError.message}`,
      }
    }

    const remainingCount = verifyFiles?.length || 0
    if (remainingCount > 0) {
      return {
        success: false,
        deletedCount,
        remainingCount,
        error: `Directory still contains ${remainingCount} file(s) after cleanup.`,
      }
    }

    return {
      success: true,
      deletedCount,
      remainingCount: 0,
    }
  } catch (err: any) {
    return { success: false, deletedCount: 0, remainingCount: 0, error: err.message }
  }
}
