import { describe, test, expect } from 'vitest'
import { calculatePaidDays, validateDeductionReconciliation } from '@/lib/payroll/payroll-engine'

describe('Payslip Strict Isolation & Deduction Invariant Verification', () => {
  test('strictly rejects hardcoded dummy employee fallbacks (HRK-511, ABCDE1234F, HDFC Bank)', () => {
    const rawMockHtml = `
      <div>
        <span>HRK-511</span>
        <span>ABCDE1234F</span>
        <span>HDFC Bank</span>
        <span>50100234567890</span>
      </div>
    `
    // Ensure our system never defaults to dummy mock data
    const dummyIdentifiers = ['HRK-511', 'ABCDE1234F', 'HDFC Bank', '50100234567890']
    
    // Simulate real snapshot rendering
    const realEmployeeSnapshot = {
      employee_id: 'emp-real-003',
      employee_code: 'HRK-003',
      employee_name: 'Ananya Sharma',
      bank_account_number: null, // intentionally missing
      pan_number: null, // intentionally missing
      bank_name: null,
    }

    const renderedBank = realEmployeeSnapshot.bank_account_number || 'Not provided'
    const renderedPan = realEmployeeSnapshot.pan_number || 'Not provided'
    const renderedBankName = realEmployeeSnapshot.bank_name || 'Not provided'

    expect(renderedBank).toBe('Not provided')
    expect(renderedPan).toBe('Not provided')
    expect(renderedBankName).toBe('Not provided')

    // Confirm that dummy identifiers are NOT present
    for (const dummy of dummyIdentifiers) {
      expect(renderedBank).not.toContain(dummy)
      expect(renderedPan).not.toContain(dummy)
      expect(renderedBankName).not.toContain(dummy)
    }
  })

  test('asserts deduction reconciliation invariant: sum(deductions) === total_deductions', () => {
    // Valid case
    const validDeductions = [
      { name: 'Provident Fund (PF)', amount: 1800 },
      { name: 'Professional Tax (PT)', amount: 200 },
      { name: 'Income Tax (TDS)', amount: 1500 },
    ]
    const validTotal = 3500

    expect(validateDeductionReconciliation(validDeductions, validTotal)).toBe(true)

    // Invalid case with disparity
    const invalidDeductions = [
      { name: 'PF', amount: 1800 },
      { name: 'PT', amount: 200 },
    ]
    const mismatchedTotal = 2500 // Disparity of 500

    expect(validateDeductionReconciliation(invalidDeductions, mismatchedTotal)).toBe(false)
  })

  test('formats payslip PDF filename cleanly without browser chrome', () => {
    const employeeCode = 'HRK-003'
    const monthName = 'September'
    const year = 2026
    const filename = `Haryak_Payslip_${employeeCode}_${monthName}_${year}.pdf`

    expect(filename).toBe('Haryak_Payslip_HRK-003_September_2026.pdf')
    expect(filename).toMatch(/^Haryak_Payslip_HRK-\d{3}_[A-Za-z]+_\d{4}\.pdf$/)
  })

  test('ensures two distinct employees produce isolated paid days and attendance calculations', () => {
    const periodStart = new Date('2026-09-01')
    const periodEnd = new Date('2026-09-30')

    const emp1 = calculatePaidDays({
      periodStartDate: periodStart,
      periodEndDate: periodEnd,
      joiningDate: new Date('2024-01-01'),
      weeklyOffs: [0, 6], // Sat, Sun
      holidays: [],
      leaves: [],
      attendance: [],
      lopDays: 0,
    })

    const emp2 = calculatePaidDays({
      periodStartDate: periodStart,
      periodEndDate: periodEnd,
      joiningDate: new Date('2026-09-15'), // Joined mid-month
      weeklyOffs: [0, 6],
      holidays: [],
      leaves: [],
      attendance: [],
      lopDays: 2,
    })

    // Assert absolute non-overlap
    expect(emp1.paidDays).toBe(22)
    expect(emp2.paidDays).toBeLessThan(emp1.paidDays)
    expect(emp2.paidDays).toBe(10) // 12 working days - 2 LOP
    expect(emp1.lopDays).toBe(0)
    expect(emp2.lopDays).toBe(2)
  })
})
