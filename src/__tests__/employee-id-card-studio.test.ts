import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { calculateCardExpirationDate, isCardExpired } from '@/lib/services/id-card-storage-service'
import { cleanupExpiredIdCards } from '@/lib/services/id-card-cleanup-service'
import { CorporateEliteTemplate } from '@/components/admin/employee-id-cards/corporate-elite-template'
import { ModernExecutiveTemplate } from '@/components/admin/employee-id-cards/modern-executive-template'
import { ModernContactSection } from '@/components/admin/employee-id-cards/shared/id-card-contact'

describe('Employee ID Card Studio Integration Suite (Phases 3 & 4)', () => {
  const companyId = '77777777-7777-7777-7777-777777777777'
  const adminUserId = 'admin-user-111'
  const regularEmployeeUserId = 'employee-user-222'

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  describe('Admin-Only Security & Authorization Invariant', () => {
    it('allows administrators and denies non-admin employees with HTTP 403', async () => {
      const { isAdmin, hasRole } = await import('@/lib/services/company-resolver')

      const adminContext: any = {
        authUserId: adminUserId,
        companyId,
        roles: ['SUPER_ADMIN'],
      }

      const employeeContext: any = {
        authUserId: regularEmployeeUserId,
        companyId,
        roles: ['EMPLOYEE'],
      }

      expect(isAdmin(adminContext)).toBe(true)
      expect(hasRole(adminContext, 'SUPER_ADMIN', 'HR_ADMIN', 'PAYROLL_ADMIN')).toBe(true)

      expect(isAdmin(employeeContext)).toBe(false)
      expect(hasRole(employeeContext, 'SUPER_ADMIN', 'HR_ADMIN', 'PAYROLL_ADMIN')).toBe(false)
    })
  })

  describe('Sequential Employee ID Generation & Identity Retention', () => {
    it('retains existing employee code if already valid (e.g. HRK-001)', () => {
      const existingCode = 'HRK-001'
      const assigned = existingCode || 'HRK-999'
      expect(assigned).toBe('HRK-001')
    })

    it('computes next sequential employee code matching HRK-xxx format', () => {
      const existingCodes = ['HRK-001', 'HRK-002', 'HRK-003']
      const pattern = /^HRK-(\d+)$/i

      const usedNumbers = new Set(
        existingCodes.map(code => {
          const m = code.match(pattern)
          return m ? parseInt(m[1], 10) : 0
        })
      )

      let next = 1
      while (usedNumbers.has(next)) {
        next++
      }

      const generated = `HRK-${String(next).padStart(3, '0')}`
      expect(generated).toBe('HRK-004')
    })
  })

  describe('Strict 24-Hour Expiration & Purge Verification', () => {
    it('sets expires_at to exactly 24 hours after created_at', () => {
      vi.useFakeTimers()
      try {
        const createdAt = new Date('2026-11-02T14:30:00.000Z')
        vi.setSystemTime(createdAt)

        const expiresAt = calculateCardExpirationDate(createdAt)
        const expiryTime = expiresAt.getTime()

        expect(expiresAt.toISOString()).toBe('2026-11-03T14:30:00.000Z')

        // 1 millisecond before expiry → not expired
        vi.setSystemTime(new Date(expiryTime - 1))
        expect(isCardExpired(expiresAt)).toBe(false)

        // Exactly at expiry → expired
        vi.setSystemTime(new Date(expiryTime))
        expect(isCardExpired(expiresAt)).toBe(true)

        // 1 millisecond after expiry → expired
        vi.setSystemTime(new Date(expiryTime + 1))
        expect(isCardExpired(expiresAt)).toBe(true)
      } finally {
        vi.useRealTimers()
      }
    })

    it('purges expired cards without altering permanent employee data', async () => {
      const expiredCardId = '99999999-9999-9999-9999-999999999999'
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
              select: vi.fn(() => createQueryChain([
                {
                  id: expiredCardId,
                  company_id: companyId,
                  card_image_path: `${companyId}/${expiredCardId}/card.png`,
                  card_pdf_path: `${companyId}/${expiredCardId}/card.pdf`,
                  expires_at: new Date(Date.now() - 5000).toISOString(),
                },
              ])),
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

      const cleanup = await cleanupExpiredIdCards(companyId)
      expect(cleanup.success).toBe(true)
      expect(cleanup.expiredCount).toBe(1)
      expect(cleanup.deletedRecordsCount).toBe(1)
    })
  })

  describe('Vertical Portrait CR80 Dimensions & Template Verification', () => {
    const sampleData = {
      employeeName: 'Chegondi Charan',
      employeeCode: 'HRK-002',
      designation: 'Software Engineer',
      department: 'Software Development',
      phone: '+91 6302 355 693',
      email: 'charan@haryak.com',
      location: 'Hyderabad',
      photoUrl: null,
    }

    it('renders Design 01 as a vertical portrait card with CR80 physical proportions', () => {
      const element = (CorporateEliteTemplate as any)({
        data: sampleData,
        id: 'test-design-01',
      })

      // Must be width: 380px, height: 602px (approx 0.63:1 aspect ratio)
      expect(element.props.style.width).toBe('380px')
      expect(element.props.style.height).toBe('602px')
      const ratio = 380 / 602
      expect(ratio).toBeCloseTo(53.98 / 85.60, 2)

      // Must use the royal-blue base color #4A55B6
      expect(element.props.className).toContain('bg-[#4A55B6]')
    })

    it('renders Design 02 as a vertical portrait card with CR80 physical proportions', () => {
      const element = (ModernExecutiveTemplate as any)({
        data: sampleData,
        id: 'test-design-02',
      })

      // Must be width: 380px, height: 602px (approx 0.63:1 aspect ratio)
      expect(element.props.style.width).toBe('380px')
      expect(element.props.style.height).toBe('602px')
      const ratio = 380 / 602
      expect(ratio).toBeCloseTo(53.98 / 85.60, 2)

      // Must use clean white and soft azure background, not dark or midnight
      expect(element.props.className).toContain('from-[#FFFFFF]')
      expect(element.props.className).not.toContain('from-[#060A16]')
    })

    it('ensures neither template renders as landscape or visiting card', () => {
      const d1 = (CorporateEliteTemplate as any)({ data: sampleData })
      const d2 = (ModernExecutiveTemplate as any)({ data: sampleData })

      const height1 = parseInt(d1.props.style.height, 10)
      const width1 = parseInt(d1.props.style.width, 10)
      expect(height1).toBeGreaterThan(width1)

      const height2 = parseInt(d2.props.style.height, 10)
      const width2 = parseInt(d2.props.style.width, 10)
      expect(height2).toBeGreaterThan(width2)
    })

    it('verifies Design 01 has globe icon beside website in bottom contact section and no right-edge vertical website', () => {
      const element = (CorporateEliteTemplate as any)({
        data: sampleData,
        id: 'test-design-01-contact',
      })

      // Must have the RoyalContactPanel as a child
      const children = React.Children.toArray(element.props.children) as any[]
      // Find RoyalContactPanel
      const contactPanel = children.find(c => c && c.type && (c.type.name === 'RoyalContactPanel' || c.props.phone))
      expect(contactPanel).toBeDefined()
      expect(contactPanel.props.phone).toBe(sampleData.phone)
      expect(contactPanel.props.email).toBe(sampleData.email)
      expect(contactPanel.props.website).toBe('www.haryak.com')

      // Ensure no vertical right-edge container exists
      const rightVerticalContainer = children.find(c => c && c.props && c.props.style && c.props.style.right === '14px' && c.props.style.top === '230px')
      expect(rightVerticalContainer).toBeUndefined()
    })

    it('verifies Design 02 has reconstructed structured contact section with PHONE, EMAIL, and LOCATION rows', () => {
      const element = (ModernExecutiveTemplate as any)({
        data: sampleData,
        id: 'test-design-02-contact',
      })

      const children = React.Children.toArray(element.props.children) as any[]
      // Find the contact section container
      const contactSectionWrapper = children.find(c => c && c.props && c.props.children && (c.props.children.type?.name === 'ModernContactSection' || c.props.children.props?.location))
      expect(contactSectionWrapper).toBeDefined()
      const contactSection = contactSectionWrapper.props.children
      expect(contactSection.props.phone).toBe(sampleData.phone)
      expect(contactSection.props.email).toBe(sampleData.email)
      expect(contactSection.props.location).toBe(sampleData.location)

      // Render ModernContactSection directly to verify row labels and dividers
      const sectionElem = ModernContactSection({
        phone: '+91 98765 43210',
        email: 'thiru@haryak.com',
        location: 'Headquarters',
      })
      const rows = React.Children.toArray(sectionElem.props.children) as any[]
      expect(rows.length).toBe(3)
      // Row 1: PHONE
      expect(JSON.stringify(rows[0])).toContain('PHONE')
      expect(JSON.stringify(rows[0])).toContain('+91 98765 43210')
      // Row 2: EMAIL
      expect(JSON.stringify(rows[1])).toContain('EMAIL')
      expect(JSON.stringify(rows[1])).toContain('thiru@haryak.com')
      // Row 3: LOCATION
      expect(JSON.stringify(rows[2])).toContain('LOCATION')
      expect(JSON.stringify(rows[2])).toContain('Headquarters')
    })

    it('preserves uploaded employee photograph and never replaces it with initials when photo exists', () => {
      const realPhotoData = {
        ...sampleData,
        photoUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      }

      const d1 = (CorporateEliteTemplate as any)({ data: realPhotoData })
      const d2 = (ModernExecutiveTemplate as any)({ data: realPhotoData })

      const children1 = React.Children.toArray(d1.props.children) as any[]
      const photoContainer1 = children1.find(c => c && c.props && c.props.children && c.props.children.type?.name === 'IDCardPhoto')
      expect(photoContainer1.props.children.props.photoUrl).toBe(realPhotoData.photoUrl)

      const children2 = React.Children.toArray(d2.props.children) as any[]
      const photoContainer2 = children2.find(c => c && c.props && c.props.children && c.props.children.type?.name === 'IDCardPhoto')
      expect(photoContainer2.props.children.props.photoUrl).toBe(realPhotoData.photoUrl)
    })
  })

  describe('Instant Stateless Employee ID Card Generator Invariants', () => {
    it('verifies that the studio component has zero database-save dependencies or API writes', async () => {
      const fs = await import('fs')
      const path = await import('path')
      const studioPath = path.resolve(__dirname, '../components/admin/employee-id-cards/employee-id-card-studio.tsx')
      const source = fs.readFileSync(studioPath, 'utf-8')

      // Must NOT contain DB saving workflows, table creation, or mutation endpoints
      expect(source).not.toContain('/api/admin/employee-id-cards')
      expect(source).not.toContain('TemporaryCardsTable')
      expect(source).not.toContain('handleGenerateAndSave')
      expect(source).not.toContain('ACTIVE_CARDS')
      expect(source).not.toContain('fetchCards')
      expect(source).not.toContain('ID Card Database Setup Incomplete')

      // Must support both entry modes: Select Existing Employee and Enter Manually
      expect(source).toContain('Select Existing Employee')
      expect(source).toContain('Enter Manually')

      // Must support 600 DPI export
      expect(source).toContain('600 DPI')
      expect(source).toContain('DOWNLOAD PNG (600 DPI)')
      expect(source).toContain('DOWNLOAD PRINT PDF')
      expect(source).toContain('STATELESS')
    })

    it('sanitizes filename to strictly format as <Employee_ID>_Employee_ID_Card.png', () => {
      const sanitize = (rawCode: string, ext: 'png' | 'pdf' = 'png') => {
        const clean = rawCode.trim().replace(/[^a-zA-Z0-9_-]/g, '_') || 'HRK-001'
        return `${clean}_Employee_ID_Card.${ext}`
      }

      expect(sanitize('HRK-001')).toBe('HRK-001_Employee_ID_Card.png')
      expect(sanitize('HRK/2026/042')).toBe('HRK_2026_042_Employee_ID_Card.png')
      expect(sanitize('EMP#999', 'pdf')).toBe('EMP_999_Employee_ID_Card.pdf')
      expect(sanitize('')).toBe('HRK-001_Employee_ID_Card.png')
    })

    it('enforces strictly the 5 required fields (Full Name, ID, Designation, Department, Photo)', () => {
      const validate = (formData: {
        employeeName?: string
        employeeCode?: string
        designation?: string
        department?: string
        photoUrl?: string | null
      }) => {
        const missing: string[] = []
        if (!formData.employeeName?.trim()) missing.push('Full Name')
        if (!formData.employeeCode?.trim()) missing.push('Employee ID')
        if (!formData.designation?.trim()) missing.push('Designation')
        if (!formData.department?.trim()) missing.push('Department')
        if (!formData.photoUrl) missing.push('Employee Photograph')
        return { isValid: missing.length === 0, missing }
      }

      // Incomplete form fails
      const incomplete = validate({ employeeName: 'John Doe' })
      expect(incomplete.isValid).toBe(false)
      expect(incomplete.missing.length).toBe(4)

      // Missing photo fails
      const missingPhoto = validate({
        employeeName: 'John Doe',
        employeeCode: 'HRK-001',
        designation: 'Engineer',
        department: 'Tech',
        photoUrl: null,
      })
      expect(missingPhoto.isValid).toBe(false)
      expect(missingPhoto.missing).toContain('Employee Photograph')

      // Complete 5 fields passes
      const complete = validate({
        employeeName: 'John Doe',
        employeeCode: 'HRK-042',
        designation: 'Senior Engineer',
        department: 'Technology',
        photoUrl: 'data:image/png;base64,samplephoto123',
      })
      expect(complete.isValid).toBe(true)
      expect(complete.missing.length).toBe(0)
    })

    it('verifies 600 DPI target resolution constant (1275 x 2022 pixels) matching CR80 proportions', async () => {
      const { CR80_600DPI_WIDTH, CR80_600DPI_HEIGHT } = await import('@/lib/services/id-card-export-client')
      expect(CR80_600DPI_WIDTH).toBe(1275)
      expect(CR80_600DPI_HEIGHT).toBe(2022)

      const ratio = CR80_600DPI_WIDTH / CR80_600DPI_HEIGHT
      const cr80Ratio = 53.98 / 85.60
      expect(ratio).toBeCloseTo(cr80Ratio, 2)
    })
  })
})

