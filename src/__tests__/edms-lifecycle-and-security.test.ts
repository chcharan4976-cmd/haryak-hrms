import { describe, it, expect } from 'vitest'
import {
  computeExpiryStatus,
  formatFileSize,
  getCategoryDefinition,
  getCategoryLabel,
  isFilePreviewable,
  DOCUMENT_CATEGORIES,
} from '@/lib/types/document'
import {
  validateUploadFile,
  calculateChecksum,
  sanitizeFileName,
  MAX_FILE_SIZE_BYTES,
} from '@/lib/services/document-storage-service'
import { resolveEmployeeAccess, ResolvedContext } from '@/lib/services/company-resolver'

describe('EDMS Lifecycle, Storage Integrity, and Security Invariants', () => {
  /* ============================================================
     1. EXPIRY COMPUTATION INVARIANTS
     ============================================================ */
  describe('Expiry Status Calculation', () => {
    it('returns NOT_APPLICABLE when no expiry date is set', () => {
      const resNull = computeExpiryStatus(null)
      expect(resNull.status).toBe('NOT_APPLICABLE')
      expect(resNull.daysRemaining).toBeNull()

      const resUndefined = computeExpiryStatus(undefined)
      expect(resUndefined.status).toBe('NOT_APPLICABLE')
    })

    it('flags documents expiring in more than 30 days as ACTIVE', () => {
      const futureDate = new Date()
      futureDate.setDate(futureDate.getDate() + 90)
      const res = computeExpiryStatus(futureDate.toISOString().split('T')[0])

      expect(res.status).toBe('ACTIVE')
      expect(res.daysRemaining).toBeGreaterThan(30)
      expect(res.label).toContain('Active')
    })

    it('flags documents expiring within 30 days as EXPIRING_SOON', () => {
      const soonDate = new Date()
      soonDate.setDate(soonDate.getDate() + 15)
      const res = computeExpiryStatus(soonDate.toISOString().split('T')[0])

      expect(res.status).toBe('EXPIRING_SOON')
      expect(res.daysRemaining).toBeLessThanOrEqual(30)
      expect(res.daysRemaining).toBeGreaterThanOrEqual(0)
      expect(res.label).toContain('Expiring in')
    })

    it('flags documents whose expiry date is in the past as EXPIRED', () => {
      const pastDate = new Date()
      pastDate.setDate(pastDate.getDate() - 5)
      const res = computeExpiryStatus(pastDate.toISOString().split('T')[0])

      expect(res.status).toBe('EXPIRED')
      expect(res.daysRemaining).toBeLessThan(0)
      expect(res.label).toContain('Expired')
    })
  })

  /* ============================================================
     2. FILE UPLOAD & INTEGRITY VALIDATION
     ============================================================ */
  describe('File Validation & Anti-Tamper Checksum', () => {
    it('accepts approved enterprise file types (PDF, JPG, PNG, WEBP, DOCX, XLSX)', () => {
      const pdfVal = validateUploadFile('pan_card.pdf', 'application/pdf', 1024 * 500)
      expect(pdfVal.valid).toBe(true)

      const imgVal = validateUploadFile('aadhaar.jpg', 'image/jpeg', 1024 * 300)
      expect(imgVal.valid).toBe(true)

      const docxVal = validateUploadFile(
        'handbook.docx',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        1024 * 1024
      )
      expect(docxVal.valid).toBe(true)

      const xlsxVal = validateUploadFile(
        'reimbursement.xlsx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        1024 * 200
      )
      expect(xlsxVal.valid).toBe(true)
    })

    it('strictly rejects dangerous or unapproved executable extensions', () => {
      const exeVal = validateUploadFile('trojan.exe', 'application/x-msdownload', 1000)
      expect(exeVal.valid).toBe(false)
      expect(exeVal.error).toContain('Invalid file extension')

      const shVal = validateUploadFile('exploit.sh', 'text/x-shellscript', 1000)
      expect(shVal.valid).toBe(false)

      const batVal = validateUploadFile('script.bat', 'application/x-bat', 1000)
      expect(batVal.valid).toBe(false)

      const htmlVal = validateUploadFile('phishing.html', 'text/html', 1000)
      expect(htmlVal.valid).toBe(false)
    })

    it('enforces maximum 15 MB file size limit', () => {
      const oversized = MAX_FILE_SIZE_BYTES + 1024
      const res = validateUploadFile('huge_scan.pdf', 'application/pdf', oversized)
      expect(res.valid).toBe(false)
      expect(res.error).toContain('15 MB')
    })

    it('rejects 0 byte empty files', () => {
      const res = validateUploadFile('empty.pdf', 'application/pdf', 0)
      expect(res.valid).toBe(false)
      expect(res.error).toContain('empty')
    })

    it('computes deterministic SHA-256 checksum for anti-tamper verification', () => {
      const sample = Buffer.from('Haryak Enterprise Document Management System - Safe Hashing Test')
      const checksum1 = calculateChecksum(sample)
      const checksum2 = calculateChecksum(sample)

      expect(checksum1).toBe(checksum2)
      expect(checksum1).toHaveLength(64)
      expect(checksum1).toMatch(/^[0-9a-f]{64}$/)
    })

    it('sanitizes unsafe filenames with timestamp and token collision protection', () => {
      const unsafe = 'My Passport Copy @#$ %^&* (1).PDF'
      const sanitized = sanitizeFileName(unsafe)

      expect(sanitized).toMatch(/^[a-zA-Z0-9_-]+\.pdf$/)
      expect(sanitized).not.toContain('@')
      expect(sanitized).not.toContain('%')
      expect(sanitized).not.toContain(' ')
    })
  })

  /* ============================================================
     3. PREVIEWABILITY & FORMAT DETECTION
     ============================================================ */
  describe('Preview Detection', () => {
    it('correctly classifies preview modes', () => {
      expect(isFilePreviewable('application/pdf', 'doc.pdf')).toBe('pdf')
      expect(isFilePreviewable('image/jpeg', 'photo.jpg')).toBe('image')
      expect(isFilePreviewable('image/png', 'stamp.png')).toBe('image')
      expect(
        isFilePreviewable(
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'file.docx'
        )
      ).toBe('unsupported')
    })

    it('formats file sizes accurately without undefined or misleading labels', () => {
      expect(formatFileSize(0)).toBe('0 B')
      expect(formatFileSize(null)).toBe('0 B')
      expect(formatFileSize(1024)).toBe('1.0 KB')
      expect(formatFileSize(1024 * 1024 * 3.5)).toBe('3.5 MB')
    })
  })

  /* ============================================================
     4. ENTERPRISE CATEGORIES INTEGRITY
     ============================================================ */
  describe('Enterprise Categories Configuration', () => {
    it('defines comprehensive categories across all 4 mandatory business domains', () => {
      const groups = new Set(DOCUMENT_CATEGORIES.map(c => c.group))
      expect(groups.has('identity_onboarding')).toBe(true)
      expect(groups.has('employment_hr')).toBe(true)
      expect(groups.has('payroll_statutory')).toBe(true)
      expect(groups.has('company_policy')).toBe(true)

      // Must have extensive enterprise coverage
      expect(DOCUMENT_CATEGORIES.length).toBeGreaterThanOrEqual(25)
    })

    it('includes critical statutory Indian employment categories', () => {
      const codes = DOCUMENT_CATEGORIES.map(c => c.code)
      expect(codes).toContain('pan_card')
      expect(codes).toContain('aadhaar_card')
      expect(codes).toContain('form_16')
      expect(codes).toContain('pf_document')
      expect(codes).toContain('esi_document')
      expect(codes).toContain('offer_letter')
      expect(codes).toContain('appointment_letter')
    })

    it('returns human-readable labels for category codes', () => {
      expect(getCategoryLabel('pan_card')).toBe('PAN Documentation')
      expect(getCategoryLabel('offer_letter')).toBe('Offer Letter')
      expect(getCategoryLabel('unknown_custom_doc')).toBe('Unknown Custom Doc')
    })
  })

  /* ============================================================
     5. ACCESS ISOLATION & PRIVACY INVARIANTS
     ============================================================ */
  describe('Server-Side Security & Employee Isolation', () => {
    const employeeA: ResolvedContext = {
      authUserId: 'auth-user-001',
      email: 'empA@haryak.com',
      fullName: 'Vikram Sharma',
      companyId: 'company-haryak-test',
      employeeId: 'emp-uuid-001',
      employeeCode: 'HRK-001',
      roles: ['EMPLOYEE'],
    }

    const employeeB: ResolvedContext = {
      authUserId: 'auth-user-002',
      email: 'empB@haryak.com',
      fullName: 'Ananya Rao',
      companyId: 'company-haryak-test',
      employeeId: 'emp-uuid-002',
      employeeCode: 'HRK-002',
      roles: ['EMPLOYEE'],
    }

    const hrAdmin: ResolvedContext = {
      authUserId: 'auth-admin-001',
      email: 'hr.admin@haryak.com',
      fullName: 'Kiran Patel',
      companyId: 'company-haryak-test',
      employeeId: null,
      employeeCode: null,
      roles: ['HR_ADMIN'],
    }

    it('enforces that non-admin employee cannot access another employee documents', () => {
      // Employee A tries to filter for Employee B's records
      const access = resolveEmployeeAccess(employeeA, 'emp-uuid-002')

      // Server MUST override to Employee A's ID
      expect(access.denied).toBe(false)
      expect(access.employeeId).toBe('emp-uuid-001')
      expect(access.employeeId).not.toBe('emp-uuid-002')
    })

    it('allows HR Administrator to inspect any employee document or view all', () => {
      const adminAccessA = resolveEmployeeAccess(hrAdmin, 'emp-uuid-001')
      expect(adminAccessA.denied).toBe(false)
      expect(adminAccessA.employeeId).toBe('emp-uuid-001')

      const adminAccessAll = resolveEmployeeAccess(hrAdmin, null)
      expect(adminAccessAll.denied).toBe(false)
      expect(adminAccessAll.employeeId).toBeNull()
    })
  })
})
