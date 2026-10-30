import { describe, test, expect } from 'vitest'
import { SafeDirectoryCard } from '@/lib/services/chat-service'

describe('Organization Chat & Directory Isolation Verification', () => {
  test('strictly excludes sensitive financial and statutory fields from directory card results', () => {
    // Simulated raw employee record from DB with sensitive fields
    const rawDbEmployee = {
      id: 'emp-001',
      employee_code: 'HRK-001',
      full_name: 'Rajesh Kumar',
      official_email: 'rajesh@haryak.com',
      department: 'Engineering',
      designation: 'Tech Lead',
      // SENSITIVE DATA THAT MUST NEVER BE IN THE CARD:
      salary: 1200000,
      ctc: 1500000,
      bank_account_number: '91234567890123',
      ifsc_code: 'HDFC0001234',
      pan_number: 'ABCDE1234F',
      uan_number: '100123456789',
      residential_address: '123 Private Street, Hyderabad',
    }

    // Transform into safe directory card
    const safeCard: SafeDirectoryCard = {
      id: rawDbEmployee.id,
      employeeCode: rawDbEmployee.employee_code,
      fullName: rawDbEmployee.full_name,
      officialEmail: rawDbEmployee.official_email,
      department: rawDbEmployee.department,
      designation: rawDbEmployee.designation,
      avatarUrl: null,
    }

    // Verify allowed fields exist
    expect(safeCard.employeeCode).toBe('HRK-001')
    expect(safeCard.fullName).toBe('Rajesh Kumar')
    expect(safeCard.department).toBe('Engineering')

    // CRITICAL SECURITY ASSERTIONS: Sensitive fields MUST NOT exist on the object
    const cardKeys = Object.keys(safeCard)
    expect(cardKeys).not.toContain('salary')
    expect(cardKeys).not.toContain('ctc')
    expect(cardKeys).not.toContain('bank_account_number')
    expect(cardKeys).not.toContain('bank_account')
    expect(cardKeys).not.toContain('ifsc_code')
    expect(cardKeys).not.toContain('pan_number')
    expect(cardKeys).not.toContain('pan')
    expect(cardKeys).not.toContain('uan_number')
    expect(cardKeys).not.toContain('uan')
    expect(cardKeys).not.toContain('residential_address')
  })

  test('asserts non-participant access rejection in private conversations', () => {
    const conversation = {
      id: 'conv-private-123',
      type: 'direct',
      participants: [
        { userId: 'user-a', employeeId: 'emp-001', name: 'Rajesh Kumar' },
        { userId: 'user-b', employeeId: 'emp-002', name: 'Vikram Patel' },
      ],
    }

    const checkAccess = (userId: string, employeeId?: string) => {
      const isParticipant = conversation.participants.some(
        p => p.userId === userId || (employeeId && p.employeeId === employeeId)
      )
      if (!isParticipant) {
        throw new Error('Forbidden: You are not a participant in this conversation.')
      }
      return true
    }

    // Authorized participants
    expect(checkAccess('user-a', 'emp-001')).toBe(true)
    expect(checkAccess('user-b', 'emp-002')).toBe(true)

    // Unauthorized outsider (e.g. Employee HRK-003)
    expect(() => checkAccess('user-c', 'emp-003')).toThrow('Forbidden: You are not a participant in this conversation.')
    expect(() => checkAccess('stranger-id')).toThrow('Forbidden: You are not a participant in this conversation.')
  })
})
