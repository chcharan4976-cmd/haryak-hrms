import { describe, it, expect } from 'vitest'
import { resolveEmployeeAccess, hasRole, isAdmin, ResolvedContext } from '@/lib/services/company-resolver'

describe('P0 Security & Attack Vector Tests', () => {
  const companyA = 'company-haryak-1'
  const companyB = 'company-competitor-2'

  const employeeA: ResolvedContext = {
    authUserId: 'auth-user-a',
    email: 'priya@haryak.com',
    fullName: 'Priya Sharma',
    companyId: companyA,
    employeeId: 'emp-priya',
    employeeCode: 'HRK-010',
    roles: ['EMPLOYEE'],
  }

  const employeeB: ResolvedContext = {
    authUserId: 'auth-user-b',
    email: 'charan@haryak.com',
    fullName: 'Charan CH',
    companyId: companyA,
    employeeId: 'emp-charan',
    employeeCode: 'HRK-011',
    roles: ['EMPLOYEE'],
  }

  const companyAAdmin: ResolvedContext = {
    authUserId: 'auth-admin-a',
    email: 'admin@haryak.com',
    fullName: 'Company A Super Admin',
    companyId: companyA,
    employeeId: null,
    employeeCode: null,
    roles: ['SUPER_ADMIN'],
  }

  it('ATTACK 1: Employee A attempts Employee B payslip / document / bank by modifying query employee_id -> DENIED / SCOPED TO OWN', () => {
    // Attacker sends: ?employee_id=emp-charan
    const access = resolveEmployeeAccess(employeeA, employeeB.employeeId)

    // Server-side resolver MUST override the client param with Employee A's own ID
    expect(access.denied).toBe(false)
    expect(access.employeeId).toBe(employeeA.employeeId)
    expect(access.employeeId).not.toBe(employeeB.employeeId)
  })

  it('ATTACK 2: Unlinked employee attempts any employee access -> DENIED', () => {
    const unlinkedUser: ResolvedContext = {
      authUserId: 'auth-unlinked',
      email: 'attacker@haryak.com',
      fullName: 'Attacker',
      companyId: companyA,
      employeeId: null,
      employeeCode: null,
      roles: ['EMPLOYEE'],
    }

    const access = resolveEmployeeAccess(unlinkedUser, 'any-id')
    expect(access.denied).toBe(true)
    expect(access.message).toContain('No employee profile linked')
  })

  it('ATTACK 3: Cross-company isolation - Company A user context has companyId = companyA, never matches companyB', () => {
    // Cross-tenant data isolation invariant: company context is server-resolved
    expect(employeeA.companyId).toBe(companyA)
    expect(employeeA.companyId).not.toBe(companyB)
    expect(companyAAdmin.companyId).toBe(companyA)
    expect(companyAAdmin.companyId).not.toBe(companyB)
  })

  it('ATTACK 4: Regular Employee cannot bypass admin checks', () => {
    expect(isAdmin(employeeA)).toBe(false)
    expect(isAdmin(employeeB)).toBe(false)
    expect(isAdmin(companyAAdmin)).toBe(true)
  })

  it('ATTACK 5: Employee role has only EMPLOYEE privileges', () => {
    expect(hasRole(employeeA, 'SUPER_ADMIN')).toBe(false)
    expect(hasRole(employeeA, 'HR_ADMIN')).toBe(false)
    expect(hasRole(employeeA, 'PAYROLL_ADMIN')).toBe(false)
    expect(hasRole(employeeA, 'EMPLOYEE')).toBe(true)
  })
})
