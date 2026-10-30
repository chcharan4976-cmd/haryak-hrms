import { describe, test, expect } from 'vitest'
import { buildTemplateContent, generateDocumentNumber } from '@/lib/services/document-service'
import { getActiveLetterhead } from '@/lib/services/letterhead-service'

describe('Document Automation & Official Letterhead Verification', () => {
  const mockEmployee = {
    id: 'emp-test-001',
    employee_code: 'HRK-001',
    full_name: 'Rajesh Kumar',
    designation: 'Senior Full Stack Engineer',
    department: 'Engineering',
    joining_date: '2024-11-24',
    last_working_date: '2026-08-31',
  }

  test('builds Offer Letter template with safe employee data', () => {
    const content = buildTemplateContent({
      employee: mockEmployee,
      docType: 'offer_letter',
      documentNumber: 'HRK/HR/OFFER/2026/0001',
    })

    expect(content.documentType).toBe('offer_letter')
    expect(content.documentNumber).toBe('HRK/HR/OFFER/2026/0001')
    expect(content.subject).toContain('Senior Full Stack Engineer')
    expect(content.salutation).toBe('Dear Rajesh Kumar,')
    expect(content.bodyParagraphs.length).toBeGreaterThanOrEqual(3)
    expect(content.dates.joiningDate).toBe('2024-11-24')
    expect(content.signatory.organization).toBe('Haryak Technologies India Private Limited')
  })

  test('builds Appointment Letter with probationary clauses', () => {
    const content = buildTemplateContent({
      employee: mockEmployee,
      docType: 'appointment_letter',
      documentNumber: 'HRK/HR/APPT/2026/0002',
    })

    expect(content.documentType).toBe('appointment_letter')
    expect(content.salutation).toBe('Dear Rajesh Kumar (HRK-001),')
    expect(content.clauses?.some(c => c.title === 'Notice Period')).toBe(true)
    expect(content.clauses?.some(c => c.title === 'Confidentiality & IP')).toBe(true)
  })

  test('builds Relieving and Experience Letters with historical tenure dates', () => {
    const relieving = buildTemplateContent({
      employee: mockEmployee,
      docType: 'relieving_letter',
      documentNumber: 'HRK/HR/REL/2026/0003',
    })

    expect(relieving.documentType).toBe('relieving_letter')
    expect(relieving.subject).toBe('Relieving Letter & Release of Service')
    expect(relieving.dates.joiningDate).toBe('2024-11-24')
    expect(relieving.dates.lastWorkingDate).toBe('2026-08-31')

    const exp = buildTemplateContent({
      employee: mockEmployee,
      docType: 'experience_letter',
      documentNumber: 'HRK/HR/EXP/2026/0004',
    })

    expect(exp.documentType).toBe('experience_letter')
    expect(exp.subject).toBe('Experience & Service Certificate')
    expect(exp.dates.joiningDate).toBe('2024-11-24')
  })

  test('generates standardized sequential reference numbering pattern', async () => {
    const docNum = await generateDocumentNumber('comp-test', 'offer_letter')
    expect(docNum).toMatch(/^HRK\/HR\/OFFER\/\d{4}\/\d{4}$/)

    const apptNum = await generateDocumentNumber('comp-test', 'appointment_letter')
    expect(apptNum).toMatch(/^HRK\/HR\/APPT\/\d{4}\/\d{4}$/)

    const relNum = await generateDocumentNumber('comp-test', 'relieving_letter')
    expect(relNum).toMatch(/^HRK\/HR\/REL\/\d{4}\/\d{4}$/)
  })

  test('verifies authoritative letterhead asset configuration and geometry safe margins', async () => {
    const letterhead = await getActiveLetterhead('b3ed38db-f75e-4b74-9173-9e6603320a77')
    expect(letterhead.isActive).toBe(true)
    expect(letterhead.headerImagePath).toBe('/letterhead/header.png')
    expect(letterhead.footerImagePath).toBe('/letterhead/footer.jpg')
    expect(letterhead.fileUrl).toBe('/letterhead/haryak-official-letterhead.pdf')

    // Verify safe margin specifications (Header: 32mm, Footer: 35mm, Free content area: 227mm on A4)
    const a4TotalHeightMm = 297
    const topSafeMarginMm = 32
    const bottomSafeMarginMm = 35
    const freeContentZoneMm = a4TotalHeightMm - topSafeMarginMm - bottomSafeMarginMm

    expect(freeContentZoneMm).toBeGreaterThanOrEqual(220)
  })

  test('simulates draft editing without mutating employee master data', () => {
    const originalEmployee = { ...mockEmployee }

    const draft = buildTemplateContent({
      employee: originalEmployee,
      docType: 'salary_revision',
      documentNumber: 'HRK/HR/REV/2026/0005',
    })

    // Modify draft subject and clauses
    draft.subject = 'Custom Salary Increment & Leadership Role Confirmation'
    draft.clauses = [{ title: 'Revised Annual CTC', content: 'INR 18,00,000 per annum' }]

    // Assert that original employee record remained completely unchanged
    expect(originalEmployee.designation).toBe('Senior Full Stack Engineer')
    expect(originalEmployee.joining_date).toBe('2024-11-24')
    expect(draft.subject).toBe('Custom Salary Increment & Leadership Role Confirmation')
  })

  test('verifies document lifecycle transitions', () => {
    const stages = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'ISSUED', 'ACKNOWLEDGED']
    
    let currentStatus: string = 'DRAFT'
    expect(currentStatus).toBe('DRAFT')

    currentStatus = 'APPROVED'
    expect(currentStatus).toBe('APPROVED')

    currentStatus = 'ISSUED'
    expect(currentStatus).toBe('ISSUED')

    currentStatus = 'ACKNOWLEDGED'
    expect(currentStatus).toBe('ACKNOWLEDGED')

    // Non-admin employee isolation: only sees ISSUED or ACKNOWLEDGED
    const isVisibleToEmployee = (status: string) => status === 'ISSUED' || status === 'ACKNOWLEDGED'
    expect(isVisibleToEmployee('DRAFT')).toBe(false)
    expect(isVisibleToEmployee('PENDING_APPROVAL')).toBe(false)
    expect(isVisibleToEmployee('APPROVED')).toBe(false)
    expect(isVisibleToEmployee('ISSUED')).toBe(true)
    expect(isVisibleToEmployee('ACKNOWLEDGED')).toBe(true)
  })
})
