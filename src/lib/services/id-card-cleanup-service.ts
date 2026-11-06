/**
 * Haryak Technologies India Private Limited
 * Temporary Employee ID Card Automatic & Manual Cleanup Service
 *
 * Enforces strict 24-hour expiration lifecycle:
 * - Scans for temporary cards where expires_at <= NOW()
 * - Permanently removes generated PNG and PDF files from Supabase Storage
 * - Verifies that the card storage directory is completely empty
 * - Removes temporary database records ONLY after verified storage cleanup
 * - Retains database records and reports errors if storage deletion or directory verification fails
 * - PRESERVES all permanent employee master records and original profile photos
 * - Independent per-card processing ensures partial failure does not corrupt other cleanups
 * - Safe against concurrent cleanups and idempotent for automatic retry
 */

import {
  deleteTemporaryCardFiles,
  deleteTemporaryCardDirectory,
  isCardExpired,
} from '@/lib/services/id-card-storage-service'
import {
  getExpiredTemporaryCards,
  getTemporaryCardById,
  deleteTemporaryCardRecord,
  isSchemaNotReadyError,
} from '@/lib/services/id-card-repository'

export interface CleanupResult {
  success: boolean
  scannedCount: number
  expiredCount: number
  deletedFilesCount: number
  deletedRecordsCount: number
  retainedRecordsCount: number
  errors: string[]
  timestamp: string
}

export interface ManualDeleteResult {
  success: boolean
  notFound?: boolean
  deletedFilesCount?: number
  error?: string
}

/**
 * Execute cleanup of all expired temporary ID cards (past 24 hours).
 *
 * Sequence:
 * 1. Retrieve expired records (expires_at <= NOW).
 * 2. Process each card independently:
 *    a. Verify card is expired.
 *    b. Delete generated PNG and PDF files from Storage.
 *    c. Verify directory is empty via deleteTemporaryCardDirectory.
 *    d. ONLY after storage deletion and directory emptiness are verified, delete DB record.
 *    e. If storage cleanup or directory verification fails, retain DB record.
 * 3. Never delete permanent employee records or original profile photos.
 *
 * @param options.companyId Optional filter by company ID.
 * @param options.allowGlobalCron Explicit flag required for global cleanup across all companies.
 */
export async function cleanupExpiredIdCards(optionsOrCompanyId?: string | {
  companyId?: string
  allowGlobalCron?: boolean
}): Promise<CleanupResult> {
  const options = typeof optionsOrCompanyId === 'string'
    ? { companyId: optionsOrCompanyId, allowGlobalCron: false }
    : optionsOrCompanyId
  const result: CleanupResult = {
    success: true,
    scannedCount: 0,
    expiredCount: 0,
    deletedFilesCount: 0,
    deletedRecordsCount: 0,
    retainedRecordsCount: 0,
    errors: [],
    timestamp: new Date().toISOString(),
  }

  try {
    // 1. Fetch expired cards (expires_at <= NOW)
    const expiredCards = await getExpiredTemporaryCards(options)

    result.scannedCount = expiredCards.length
    result.expiredCount = expiredCards.length

    if (expiredCards.length === 0) {
      return result
    }

    // 2. Process each card independently
    for (const card of expiredCards) {
      try {
        // Double-check eligibility: ensure card is actually expired
        if (!isCardExpired(card.expires_at)) {
          continue
        }

        const filePaths: string[] = []
        if (card.card_image_path) filePaths.push(card.card_image_path)
        if (card.card_pdf_path) filePaths.push(card.card_pdf_path)

        let storageDeletionSucceeded = true

        // Delete primary card assets if recorded
        if (filePaths.length > 0) {
          const storageResult = await deleteTemporaryCardFiles(filePaths)
          if (!storageResult.success || storageResult.failed.length > 0) {
            storageDeletionSucceeded = false
            const failedList = storageResult.failed.join(', ')
            result.errors.push(
              `Storage file deletion failed for card ${card.id}: [${failedList}]. Retaining database record.`
            )
          } else {
            result.deletedFilesCount += storageResult.deletedCount
          }
        }

        // Verify and purge entire card directory
        if (storageDeletionSucceeded) {
          const dirResult = await deleteTemporaryCardDirectory(card.company_id, card.id)
          if (!dirResult.success || dirResult.remainingCount > 0) {
            storageDeletionSucceeded = false
            result.errors.push(
              `Directory cleanup verification failed for card ${card.id}: ${dirResult.error || `${dirResult.remainingCount} files remaining`}. Retaining database record.`
            )
          } else {
            result.deletedFilesCount += dirResult.deletedCount
          }
        }

        // 3. Delete database record ONLY after successful storage deletion AND verified empty directory
        if (storageDeletionSucceeded) {
          const dbResult = await deleteTemporaryCardRecord(card.id, card.company_id)
          if (dbResult.success && dbResult.deletedCount > 0) {
            result.deletedRecordsCount++
          } else if (dbResult.notFound) {
            // Handled concurrently by another worker; not an error
            result.deletedRecordsCount++
          } else {
            result.errors.push(
              `Failed to delete database record for card ${card.id} after verified storage cleanup.`
            )
            result.retainedRecordsCount++
            result.success = false
          }
        } else {
          // Storage cleanup failed or incomplete -> retain record for subsequent retry
          result.retainedRecordsCount++
          result.success = false
        }
      } catch (cardErr: any) {
        result.errors.push(`Error processing cleanup for card ${card.id}: ${cardErr.message}`)
        result.retainedRecordsCount++
        result.success = false
      }
    }

    if (result.errors.length > 0) {
      result.success = false
    }
  } catch (err: any) {
    if (isSchemaNotReadyError(err)) {
      throw err
    }
    result.success = false
    result.errors.push(`Unexpected error during expired ID card cleanup: ${err.message}`)
  }

  return result
}

/**
 * Delete a specific temporary ID card immediately (manual deletion by Admin).
 *
 * Sequence:
 * 1. Retrieve the record using card ID AND company ID (including expired cards).
 * 2. Delete generated storage files first (PNG and PDF only).
 * 3. Verify directory is empty via deleteTemporaryCardDirectory.
 * 4. Delete the database record only after verified storage deletion and directory emptiness.
 * 5. Returns notFound when the card does not exist.
 */
export async function deleteTemporaryCardById(
  cardId: string,
  companyId: string
): Promise<ManualDeleteResult> {
  try {
    // 1. Retrieve the card record by card ID and company ID (including expired cards)
    const card = await getTemporaryCardById(cardId, companyId, { includeExpired: true })

    if (!card) {
      return {
        success: false,
        notFound: true,
        error: 'Temporary ID card not found or already deleted.',
      }
    }

    // 2. Collect generated card storage files only (never touch employee profile photos)
    const filePaths: string[] = []
    if (card.card_image_path) filePaths.push(card.card_image_path)
    if (card.card_pdf_path) filePaths.push(card.card_pdf_path)

    let totalDeletedFiles = 0

    if (filePaths.length > 0) {
      const storageResult = await deleteTemporaryCardFiles(filePaths)
      if (!storageResult.success || storageResult.failed.length > 0) {
        return {
          success: false,
          error: `Storage deletion failed for card files: ${storageResult.failed.join(', ')}. Database record retained.`,
        }
      }
      totalDeletedFiles += storageResult.deletedCount
    }

    // 3. Purge and verify directory is completely empty
    const dirResult = await deleteTemporaryCardDirectory(card.company_id, card.id)
    if (!dirResult.success || dirResult.remainingCount > 0) {
      return {
        success: false,
        error: `Storage directory verification failed for card ${card.id}: ${dirResult.error || 'directory not empty'}. Database record retained.`,
      }
    }
    totalDeletedFiles += dirResult.deletedCount

    // 4. Delete database record only after verified storage deletion
    const dbResult = await deleteTemporaryCardRecord(cardId, companyId)
    if (!dbResult.success && !dbResult.notFound) {
      return {
        success: false,
        error: 'Failed to delete database record for temporary ID card after storage cleanup.',
      }
    }

    return {
      success: true,
      deletedFilesCount: totalDeletedFiles,
    }
  } catch (err: any) {
    if (isSchemaNotReadyError(err)) {
      throw err
    }
    return {
      success: false,
      error: err.message || 'Failed to delete temporary ID card.',
    }
  }
}
