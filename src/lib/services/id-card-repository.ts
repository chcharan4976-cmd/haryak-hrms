/**
 * Haryak Technologies India Private Limited
 * Temporary Employee ID Card Repository
 *
 * Production-authoritative database repository backed by Supabase.
 * Local filesystem fallback is completely removed in production.
 * Enforces company-level multi-tenant isolation on all operations.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { isValidUUID } from '@/lib/services/id-card-storage-service'

export interface TemporaryCardRecord {
  id: string
  company_id: string
  employee_id?: string | null
  employee_code: string
  design_type: string // 'CORPORATE_ELITE' | 'MODERN_EXECUTIVE'
  employee_name: string
  designation?: string | null
  department?: string | null
  phone?: string | null
  email?: string | null
  location?: string | null
  photo_url?: string | null
  card_image_path?: string | null
  card_pdf_path?: string | null
  card_format?: string
  dimensions?: string
  resolution_dpi?: number
  export_resolution?: string
  created_by?: string | null
  created_at: string
  expires_at: string
  deleted_at?: string | null
  metadata?: Record<string, any>
}

export interface RecordDeletionResult {
  success: boolean
  deletedCount: number
  notFound: boolean
  error?: string
}

/**
 * Explicit Error thrown when the temporary ID card schema or table is not ready / missing in PostgreSQL.
 */
export class DatabaseSchemaNotReadyError extends Error {
  readonly code = 'ID_CARD_SCHEMA_NOT_READY'
  readonly status = 503

  constructor(
    message = 'Employee ID Card database schema is not initialized or schema cache is refreshing. Database migration required.'
  ) {
    super(message)
    this.name = 'DatabaseSchemaNotReadyError'
    Object.setPrototypeOf(this, DatabaseSchemaNotReadyError.prototype)
  }
}

/**
 * Precise error classification for PostgREST and PostgreSQL database errors:
 * - 42P01: undefined table (PostgreSQL)
 * - PGRST205: table missing from schema cache (PostgREST 12+)
 * - PGRST204: column missing from schema cache (PostgREST)
 * - PGRST200: relationship missing from schema cache (PostgREST)
 */
export function isTableMissingError(error: any): boolean {
  if (!error) return false
  if (error instanceof DatabaseSchemaNotReadyError) return true
  if (error?.code === 'ID_CARD_SCHEMA_NOT_READY') return true

  const errorCode = (error?.code || '').toString().trim()
  const errorMsg = (error?.message || (typeof error === 'string' ? error : '')).toString().toLowerCase()

  // Guard: missing column (PGRST204) and missing relationship (PGRST200) must NOT be misclassified as missing table
  if (errorCode === 'PGRST204' || errorCode === 'PGRST200') {
    return false
  }
  if (errorMsg.includes('could not find the column') || errorMsg.includes('could not find a relationship')) {
    return false
  }

  return (
    errorCode === 'PGRST205' ||
    errorCode === '42P01' ||
    errorMsg.includes('could not find the table') ||
    (errorMsg.includes('relation') && errorMsg.includes('does not exist')) ||
    errorMsg.includes('undefined_table')
  )
}

export function isColumnMissingError(error: any): boolean {
  if (!error) return false
  const errorCode = (error?.code || '').toString().trim()
  const errorMsg = (error?.message || (typeof error === 'string' ? error : '')).toString().toLowerCase()
  return (
    errorCode === 'PGRST204' ||
    errorCode === '42703' ||
    errorMsg.includes('could not find the column')
  )
}

export function isRelationshipMissingError(error: any): boolean {
  if (!error) return false
  const errorCode = (error?.code || '').toString().trim()
  const errorMsg = (error?.message || (typeof error === 'string' ? error : '')).toString().toLowerCase()
  return (
    errorCode === 'PGRST200' ||
    errorMsg.includes('could not find a relationship')
  )
}

export const isSchemaNotReadyError = isTableMissingError

/**
 * Fetch all active temporary ID cards for a company (expires_at > NOW and not deleted).
 * Company ID is strictly required.
 * - When table exists and has 0 records: returns { cards: [] }
 * - When table is missing / schema cache not ready: throws DatabaseSchemaNotReadyError
 */
export async function getActiveTemporaryCards(
  companyId: string
): Promise<{ cards: TemporaryCardRecord[] }> {
  if (!isValidUUID(companyId)) {
    throw new Error('Invalid company ID provided for active cards lookup.')
  }

  const supabase = createAdminClient()
  if (!supabase) {
    throw new Error('Supabase admin client is unavailable.')
  }

  const nowIso = new Date().toISOString()

  const { data, error } = await supabase
    .from('temporary_employee_id_cards')
    .select('*')
    .eq('company_id', companyId)
    .gt('expires_at', nowIso)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (error) {
    if (isSchemaNotReadyError(error)) {
      throw new DatabaseSchemaNotReadyError(
        'Database table "temporary_employee_id_cards" is not available in the schema cache. Please apply the database migration.'
      )
    }
    throw new Error(`Database query failed in getActiveTemporaryCards: ${error.message}`)
  }

  return { cards: data || [] }
}

/**
 * Retrieve a temporary ID card by card ID and company ID.
 * Supports retrieving expired records awaiting cleanup via { includeExpired: true }.
 * - When record exists: returns TemporaryCardRecord
 * - When record does not exist: returns null
 * - When table is missing / schema cache not ready: throws DatabaseSchemaNotReadyError
 */
export async function getTemporaryCardById(
  cardId: string,
  companyId: string,
  options?: { includeExpired?: boolean }
): Promise<TemporaryCardRecord | null> {
  if (!isValidUUID(cardId) || !isValidUUID(companyId)) {
    return null
  }

  const supabase = createAdminClient()
  if (!supabase) {
    throw new Error('Supabase admin client is unavailable.')
  }

  let query = supabase
    .from('temporary_employee_id_cards')
    .select('*')
    .eq('id', cardId)
    .eq('company_id', companyId)
    .is('deleted_at', null)

  if (!options?.includeExpired) {
    const nowIso = new Date().toISOString()
    query = query.gt('expires_at', nowIso)
  }

  const { data, error } = await query.maybeSingle()

  if (error) {
    if (isSchemaNotReadyError(error)) {
      throw new DatabaseSchemaNotReadyError(
        'Database table "temporary_employee_id_cards" is not available in the schema cache. Please apply the database migration.'
      )
    }
    throw new Error(`Database query failed in getTemporaryCardById: ${error.message}`)
  }

  return data || null
}

/**
 * Insert a new temporary ID card record
 */
export async function insertTemporaryCard(
  record: TemporaryCardRecord
): Promise<{ success: boolean; card: TemporaryCardRecord; error?: string }> {
  if (!isValidUUID(record.company_id)) {
    throw new Error('Invalid company ID provided for card record.')
  }
  if (!isValidUUID(record.id)) {
    throw new Error('Invalid card ID provided for card record.')
  }

  const supabase = createAdminClient()
  if (!supabase) {
    throw new Error('Supabase admin client is unavailable.')
  }

  const { data, error } = await supabase
    .from('temporary_employee_id_cards')
    .insert(record)
    .select('*')
    .single()

  if (error || !data) {
    if (isSchemaNotReadyError(error)) {
      throw new DatabaseSchemaNotReadyError(
        'Database table "temporary_employee_id_cards" is not available in the schema cache. Please apply the database migration.'
      )
    }
    const errorMsg = error?.message || 'Database insert failed to return card record.'
    return { success: false, card: record, error: errorMsg }
  }

  return { success: true, card: data }
}

/**
 * Delete a temporary ID card by ID with company-level isolation.
 * Checks affected database rows to ensure records are not falsely reported as deleted.
 */
export async function deleteTemporaryCardRecord(
  cardId: string,
  companyId: string
): Promise<RecordDeletionResult> {
  if (!isValidUUID(cardId) || !isValidUUID(companyId)) {
    return { success: false, deletedCount: 0, notFound: true, error: 'Invalid UUID provided.' }
  }

  const supabase = createAdminClient()
  if (!supabase) {
    throw new Error('Supabase admin client is unavailable.')
  }

  const { error, count } = await supabase
    .from('temporary_employee_id_cards')
    .delete({ count: 'exact' })
    .eq('id', cardId)
    .eq('company_id', companyId)

  if (error) {
    if (isSchemaNotReadyError(error)) {
      throw new DatabaseSchemaNotReadyError(
        'Database table "temporary_employee_id_cards" is not available in the schema cache. Please apply the database migration.'
      )
    }
    throw new Error(`Database delete failed in deleteTemporaryCardRecord: ${error.message}`)
  }

  const deletedCount = count ?? 0
  if (deletedCount === 0) {
    return { success: false, deletedCount: 0, notFound: true }
  }

  return { success: true, deletedCount, notFound: false }
}

/**
 * Fetch expired cards for cleanup (expires_at <= NOW).
 * Ordinary callers MUST provide companyId. Global queries are restricted strictly to trusted cron.
 */
export async function getExpiredTemporaryCards(optionsOrCompanyId?: string | {
  companyId?: string
  allowGlobalCron?: boolean
}): Promise<TemporaryCardRecord[]> {
  const options = typeof optionsOrCompanyId === 'string'
    ? { companyId: optionsOrCompanyId, allowGlobalCron: false }
    : optionsOrCompanyId
  const companyId = options?.companyId
  const allowGlobalCron = options?.allowGlobalCron ?? false

  if (!companyId && !allowGlobalCron) {
    throw new Error('Company ID is required for temporary card queries unless explicitly executing trusted server-side cron.')
  }

  if (companyId && !isValidUUID(companyId)) {
    throw new Error('Invalid company ID provided for expired cards lookup.')
  }

  const supabase = createAdminClient()
  if (!supabase) {
    throw new Error('Supabase admin client is unavailable.')
  }

  const nowIso = new Date().toISOString()
  let query = supabase
    .from('temporary_employee_id_cards')
    .select('*')
    .lte('expires_at', nowIso)
    .is('deleted_at', null)

  if (companyId) {
    query = query.eq('company_id', companyId)
  }

  const { data, error } = await query

  if (error) {
    if (isSchemaNotReadyError(error)) {
      throw new DatabaseSchemaNotReadyError(
        'Database table "temporary_employee_id_cards" is not available in the schema cache. Please apply the database migration.'
      )
    }
    throw new Error(`Database query failed in getExpiredTemporaryCards: ${error.message}`)
  }

  return data || []
}

/**
 * Purge expired cards from database with exact deletion count verification.
 * Enforces that only records with expires_at <= NOW and deleted_at is null can be purged.
 * Company ID is strictly required unless explicitly executing authorized server-side cron.
 */
export async function purgeExpiredCardRecords(
  cardIds: string[],
  optionsOrCompanyId?: string | {
    companyId?: string
    allowGlobalCron?: boolean
  }
): Promise<number> {
  const options = typeof optionsOrCompanyId === 'string'
    ? { companyId: optionsOrCompanyId, allowGlobalCron: false }
    : optionsOrCompanyId
  const companyId = options?.companyId
  const allowGlobalCron = options?.allowGlobalCron ?? false

  if (!companyId && !allowGlobalCron) {
    throw new Error('Company ID is required for temporary card purge unless explicitly executing trusted server-side cron.')
  }

  if (companyId && !isValidUUID(companyId)) {
    throw new Error('Invalid company ID provided for purge.')
  }

  if (!cardIds || cardIds.length === 0) return 0

  const validIds = cardIds.filter(id => isValidUUID(id))
  if (validIds.length === 0) return 0

  const supabase = createAdminClient()
  if (!supabase) {
    throw new Error('Supabase admin client is unavailable.')
  }

  const nowIso = new Date().toISOString()
  let query = supabase
    .from('temporary_employee_id_cards')
    .delete({ count: 'exact' })
    .in('id', validIds)
    .lte('expires_at', nowIso)
    .is('deleted_at', null)

  if (companyId) {
    query = query.eq('company_id', companyId)
  }

  const { error, count } = await query

  if (error) {
    if (isSchemaNotReadyError(error)) {
      throw new DatabaseSchemaNotReadyError(
        'Database table "temporary_employee_id_cards" is not available in the schema cache. Please apply the database migration.'
      )
    }
    throw new Error(`Database delete failed in purgeExpiredCardRecords: ${error.message}`)
  }

  return count ?? 0
}
