import { describe, it, expect } from 'vitest'
import { resolveEmployeeAccess, ResolvedContext } from '@/lib/services/company-resolver'

describe('P0 Document & Access Isolation', () => {
  const employeeAContext: ResolvedContext = {
    authUserId: 'user-auth-a',
    email: 'employeeA@haryak.com',
    fullName: 'Employee A',
    companyId: 'company-haryak-1',
    employeeId: 'emp-id-a',
    employeeCode: 'HRK-001',
    roles: ['EMPLOYEE'],
  }

  const employeeBContext: ResolvedContext = {
    authUserId: 'user-auth-b',
    email: 'employeeB@haryak.com',
    fullName: 'Employee B',
    companyId: 'company-haryak-1',
    employeeId: 'emp-id-b',
    employeeCode: 'HRK-002',
    roles: ['EMPLOYEE'],
  }

  const adminContext: ResolvedContext = {
    authUserId: 'admin-auth-1',
    email: 'admin@haryak.com',
    fullName: 'HR Admin',
    companyId: 'company-haryak-1',
    employeeId: null,
    employeeCode: null,
    roles: ['HR_ADMIN'],
  }

  it('enforces that Employee A cannot access Employee B documents by manipulating employee_id', () => {
    // Attack scenario: Employee A tries to pass Employee B's employee_id in query
    const attackAccess = resolveEmployeeAccess(employeeAContext, 'emp-id-b')
    
    // Server must ignore client-supplied employee_id and force Employee A's own ID
    expect(attackAccess.denied).toBe(false)
    expect(attackAccess.employeeId).toBe('emp-id-a') // Must NOT be emp-id-b!
    expect(attackAccess.employeeId).not.toBe('emp-id-b')
  })

  it('allows HR Admin to filter by a specific employee_id', () => {
    const adminAccessA = resolveEmployeeAccess(adminContext, 'emp-id-a')
    expect(adminAccessA.denied).toBe(false)
    expect(adminAccessA.employeeId).toBe('emp-id-a')

    const adminAccessB = resolveEmployeeAccess(adminContext, 'emp-id-b')
    expect(adminAccessB.denied).toBe(false)
    expect(adminAccessB.employeeId).toBe('emp-id-b')

    const adminAccessAll = resolveEmployeeAccess(adminContext, null)
    expect(adminAccessAll.denied).toBe(false)
    expect(adminAccessAll.employeeId).toBeNull()
  })

  it('denies employee access if employee has no profile linked', () => {
    const unlinkedEmployeeContext: ResolvedContext = {
      ...employeeAContext,
      employeeId: null,
      employeeCode: null,
    }

    const access = resolveEmployeeAccess(unlinkedEmployeeContext, 'emp-id-b')
    expect(access.denied).toBe(true)
    expect(access.message).toContain('No employee profile linked')
  })
})
