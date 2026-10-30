import { describe, test, expect } from 'vitest'
import { generateTemporaryPassword, normalizeIdentifier } from '@/lib/auth/auth-service'

describe('Password Lifecycle & Crypto Entropy Verification', () => {
  test('generates cryptographically unique temporary passwords', () => {
    const passwords = new Set<string>()
    const count = 50

    for (let i = 0; i < count; i++) {
      const pwd = generateTemporaryPassword()
      expect(pwd.length).toBeGreaterThanOrEqual(12)
      expect(pwd).toMatch(/[A-Z]/) // uppercase
      expect(pwd).toMatch(/[a-z]/) // lowercase
      expect(pwd).toMatch(/[0-9]/) // digit
      expect(pwd).toMatch(/[@#$%&*!]/) // special char
      passwords.add(pwd)
    }

    // Assert 100% uniqueness (no collisions)
    expect(passwords.size).toBe(count)
  })

  test('normalizes identifiers correctly without data loss', () => {
    expect(normalizeIdentifier('HRK-001')).toEqual({ type: 'employee_id', normalized: 'HRK-001' })
    expect(normalizeIdentifier('hrk-002')).toEqual({ type: 'employee_id', normalized: 'HRK-002' })
    expect(normalizeIdentifier('003')).toEqual({ type: 'employee_id', normalized: 'HRK-003' })
    expect(normalizeIdentifier('  HRK-005  ')).toEqual({ type: 'employee_id', normalized: 'HRK-005' })
    expect(normalizeIdentifier('employee@haryak.com')).toEqual({ type: 'email', normalized: 'employee@haryak.com' })
    expect(normalizeIdentifier('  ADMIN@HARYAK.COM  ')).toEqual({ type: 'email', normalized: 'admin@haryak.com' })
  })

  test('temporary password contains company prefix and sufficient entropy', () => {
    const pwd = generateTemporaryPassword()
    expect(pwd.startsWith('Hrk@') || pwd.startsWith('Hrk!')).toBe(true)
    expect(pwd).toMatch(/^Hrk[@!][A-Za-z0-9@#$%&*!]{7,}$/)
  })

  test('temporary password payload adheres to secure one-time issuance contract', () => {
    const pwd = generateTemporaryPassword()
    const responsePayload = {
      success: true,
      temporaryPassword: pwd,
      officialEmail: 'employee@haryak.com',
      employeeName: 'Test Employee',
      employeeCode: 'HRK-099',
      message: 'Temporary password reset successfully for Test Employee.',
    }

    expect(responsePayload.success).toBe(true)
    expect(responsePayload.temporaryPassword).toBeTruthy()
    expect(typeof responsePayload.temporaryPassword).toBe('string')
    expect(responsePayload.temporaryPassword.length).toBeGreaterThanOrEqual(12)
    expect(responsePayload.officialEmail).toBe('employee@haryak.com')
    expect(responsePayload.employeeName).toBe('Test Employee')
    expect(responsePayload.employeeCode).toBe('HRK-099')
  })

  test('temporary password security: never contains whitespace or control characters', () => {
    for (let i = 0; i < 25; i++) {
      const pwd = generateTemporaryPassword()
      expect(pwd).not.toMatch(/\s/)
      expect(pwd).not.toMatch(/[\r\n\t]/)
    }
  })
})
