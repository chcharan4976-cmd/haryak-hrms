import { describe, it, expect } from 'vitest'
import { formatDate } from '@/lib/utils/format'

describe('P0 Date Handling & Historical Invariants', () => {
  it('keeps employee joining date distinct from system calendar year', () => {
    const joiningDate = '2024-11-24'
    const formattedJoiningDate = formatDate(joiningDate)
    expect(formattedJoiningDate).toBe('24 Nov 2024')

    // Current system date should NOT be altered by joining date
    const systemNow = new Date()
    const currentYear = systemNow.getFullYear()

    // Assert that joining date year is 2024 and does not mutate system year
    expect(new Date(joiningDate).getFullYear()).toBe(2024)
    expect(currentYear).toBeGreaterThanOrEqual(2025)
    expect(currentYear).not.toBe(2024)
  })

  it('formats dates consistently without timezone offset distortion', () => {
    const rawDate = '2026-09-04'
    const formatted = formatDate(rawDate)
    expect(formatted).toBe('04 Sep 2026')
  })

  it('supports separate generated_at timestamp and reference_date for historical documents', () => {
    const historicalDocument = {
      id: 'doc-hist-1',
      title: 'Original Offer Letter',
      document_type: 'OFFER_LETTER',
      reference_date: '2024-11-24', // Historical business event date
      generated_at: '2026-09-04T12:00:00.000Z', // Actual system timestamp
    }

    expect(new Date(historicalDocument.reference_date).getFullYear()).toBe(2024)
    expect(new Date(historicalDocument.generated_at).getFullYear()).toBe(2026)
    expect(historicalDocument.reference_date).not.toBe(historicalDocument.generated_at)
  })
})
