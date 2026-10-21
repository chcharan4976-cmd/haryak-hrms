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
})
