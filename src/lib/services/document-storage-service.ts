import { createAdminClient } from '@/lib/supabase/admin'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

export interface UploadFileOptions {
  companyId: string
  employeeId?: string | null
  file: File | Buffer
  originalName: string
  mimeType: string
  size: number
  userId: string
  userName: string
}

export interface UploadResult {
  fileUrl: string
  fileName: string
  fileSize: number
  mimeType: string
  checksumSha256: string
  storageBackend: 'supabase' | 'local'
}

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/msword', // .doc
  'application/vnd.ms-excel', // .xls
])

const ALLOWED_EXTENSIONS = new Set([
  'pdf',
  'jpg',
  'jpeg',
  'png',
  'webp',
  'docx',
  'xlsx',
  'doc',
  'xls',
])

export const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024 // 15 MB

/**
 * Validate file type, extension, and size
 */
export function validateUploadFile(fileName: string, mimeType: string, size: number): { valid: boolean; error?: string } {
  if (!fileName || !fileName.trim()) {
    return { valid: false, error: 'Filename is required.' }
  }

  if (size <= 0) {
    return { valid: false, error: 'Selected file is empty.' }
  }

  if (size > MAX_FILE_SIZE_BYTES) {
    return { valid: false, error: 'File size exceeds maximum permitted limit of 15 MB.' }
  }

  const ext = fileName.toLowerCase().split('.').pop() || ''
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return {
      valid: false,
      error: `Invalid file extension .${ext}. Permitted formats: PDF, JPG, PNG, WEBP, DOCX, XLSX.`,
    }
  }

  // Normalise MIME type check
  const normalizedMime = mimeType.toLowerCase().split(';')[0].trim()
  if (normalizedMime && !ALLOWED_MIME_TYPES.has(normalizedMime) && !normalizedMime.startsWith('image/')) {
    return {
      valid: false,
      error: `Invalid file type (${normalizedMime}). Please upload an approved PDF, image, or office document.`,
    }
  }

  return { valid: true }
}

/**
 * Clean and create a safe filename
 */
export function sanitizeFileName(originalName: string): string {
  const ext = originalName.split('.').pop() || 'bin'
  const baseName = originalName
    .slice(0, originalName.length - ext.length - 1)
    .replace(/[^a-zA-Z0-9_\-\s]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 60)

  const token = crypto.randomBytes(4).toString('hex')
  const timestamp = Date.now()
  return `${baseName || 'doc'}_${timestamp}_${token}.${ext.toLowerCase()}`
}

/**
 * Calculate SHA-256 checksum of file buffer
 */
export function calculateChecksum(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

/**
 * Upload file to Supabase Storage or secure local app storage fallback
 */
export async function storeDocumentFile(options: UploadFileOptions): Promise<UploadResult> {
  const { companyId, employeeId, file, originalName, mimeType, size } = options

  // 1. Validate
  const validation = validateUploadFile(originalName, mimeType, size)
  if (!validation.valid) {
    throw new Error(validation.error)
  }

  // 2. Prepare Buffer
  let buffer: Buffer
  if (Buffer.isBuffer(file)) {
    buffer = file
  } else if (file instanceof Blob || typeof (file as any).arrayBuffer === 'function') {
    const arrayBuffer = await file.arrayBuffer()
    buffer = Buffer.from(arrayBuffer)
  } else {
    throw new Error('Unsupported file buffer structure')
  }

  // 3. Checksum & Safe Name
  const checksumSha256 = calculateChecksum(buffer)
  const safeFileName = sanitizeFileName(originalName)
  const targetFolder = employeeId ? `employees/${employeeId}` : 'company-wide'
  const storagePath = `${companyId}/${targetFolder}/${safeFileName}`

  // 4. Try Supabase Storage first if available
  const supabase = createAdminClient()
  if (supabase) {
    try {
      // Ensure bucket exists or probe upload
      const { data, error } = await supabase.storage
        .from('documents')
        .upload(storagePath, buffer, {
          contentType: mimeType,
          upsert: true,
        })

      if (!error && data?.path) {
        // Return private storage path reference
        const fileUrl = `/api/documents/file?path=${encodeURIComponent(storagePath)}`
        return {
          fileUrl,
          fileName: safeFileName,
          fileSize: buffer.length,
          mimeType,
          checksumSha256,
          storageBackend: 'supabase',
        }
      }
    } catch (storageErr) {
      console.warn('[storeDocumentFile] Supabase storage upload failed, falling back to secure local storage:', storageErr)
    }
  }

  // 5. Fallback: Secure local document storage (e.g. for offline/local development or mock DB)
  const localDir = path.join(process.cwd(), 'storage', 'documents', companyId, targetFolder)
  if (!fs.existsSync(localDir)) {
    fs.mkdirSync(localDir, { recursive: true })
  }
  const localFilePath = path.join(localDir, safeFileName)
  fs.writeFileSync(localFilePath, buffer)

  const fileUrl = `/api/documents/file?path=${encodeURIComponent(storagePath)}`
  return {
    fileUrl,
    fileName: safeFileName,
    fileSize: buffer.length,
    mimeType,
    checksumSha256,
    storageBackend: 'local',
  }
}

/**
 * Retrieve file content buffer for streaming download or preview
 */
export async function retrieveDocumentFileBuffer(storagePath: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
  const supabase = createAdminClient()

  // 1. Try Supabase Storage
  if (supabase) {
    try {
      const { data, error } = await supabase.storage.from('documents').download(storagePath)
      if (!error && data) {
        const arrayBuf = await data.arrayBuffer()
        return {
          buffer: Buffer.from(arrayBuf),
          mimeType: data.type || 'application/octet-stream',
        }
      }
    } catch (err) {
      console.warn('[retrieveDocumentFileBuffer] Supabase download failed:', err)
    }
  }

  // 2. Try local storage
  try {
    const localFilePath = path.join(process.cwd(), 'storage', 'documents', storagePath)
    if (fs.existsSync(localFilePath)) {
      const buffer = fs.readFileSync(localFilePath)
      const ext = storagePath.split('.').pop()?.toLowerCase() || ''
      const mimeMap: Record<string, string> = {
        pdf: 'application/pdf',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        webp: 'image/webp',
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }
      return {
        buffer,
        mimeType: mimeMap[ext] || 'application/octet-stream',
      }
    }
  } catch (localErr) {
    console.error('[retrieveDocumentFileBuffer] Local file retrieval failed:', localErr)
  }

  return null
}
