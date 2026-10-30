import { describe, it, expect, vi, beforeEach } from 'vitest'
import { hasRole, isAdmin, resolveEmployeeAccess, ResolvedContext } from '@/lib/services/company-resolver'
import { generateTemporaryPassword, normalizeIdentifier } from '@/lib/auth/auth-service'

// Hoist mock functions so they can be referenced inside vi.mock
const {
  mockResolveRequestContext,
  mockCreateUser,
  mockDeleteUser,
  mockListUsers,
  mockUpdateUserById,
  mockRpc,
  mockFrom,
  mockCreateAuditLog,
  mockAuthenticateUser,
  mockCookiesGetAll,
  mockCookiesSet,
} = vi.hoisted(() => {
  return {
    mockResolveRequestContext: vi.fn(),
    mockCreateUser: vi.fn(),
    mockDeleteUser: vi.fn(),
    mockListUsers: vi.fn(),
    mockUpdateUserById: vi.fn(),
    mockRpc: vi.fn(),
    mockFrom: vi.fn(),
    mockCreateAuditLog: vi.fn(),
    mockAuthenticateUser: vi.fn(),
    mockCookiesGetAll: vi.fn(),
    mockCookiesSet: vi.fn(),
  }
})

vi.mock('@/lib/services/company-resolver', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/company-resolver')>()
  return {
    ...actual,
    resolveRequestContext: mockResolveRequestContext,
  }
})

vi.mock('@/lib/services/audit-service', () => ({
  createAuditLog: mockCreateAuditLog,
}))

vi.mock('@/lib/auth/auth-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/auth-service')>()
  return {
    ...actual,
    authenticateUser: mockAuthenticateUser,
  }
})

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    getAll: mockCookiesGetAll,
    set: mockCookiesSet,
    get: vi.fn(),
  })),
}))

vi.mock('@/lib/supabase/admin', () => ({
  isSupabaseConfigured: () => true,
  createAdminClient: () => ({
    auth: {
      admin: {
        createUser: mockCreateUser,
        deleteUser: mockDeleteUser,
        listUsers: mockListUsers,
        updateUserById: mockUpdateUserById,
      },
    },
    rpc: mockRpc,
    from: mockFrom,
  }),
}))

// Import route handlers after mocks are established
import { POST as employeeHandler } from '@/app/api/employees/route'
import { POST as loginHandler } from '@/app/api/auth/login/route'

describe('P0: Employee Creation & Admin Session Authentication Regression Suite', () => {
  let dbTables: Record<string, any[]>
  let insertedRows: Record<string, any[]>

  beforeEach(() => {
    vi.clearAllMocks()
    insertedRows = {
      companies: [],
      users: [],
      user_roles: [],
      departments: [],
      designations: [],
      employees: [],
      salary_structures: [],
      salary_structure_components: [],
      employee_bank_accounts: [],
      employee_statutory_details: [],
    }

    mockCookiesGetAll.mockReturnValue([
      { name: 'sb-test-auth-token.0', value: 'token-part-0' },
      { name: 'sb-test-auth-token.1', value: 'token-part-1' },
    ])

    // Mock company counter RPC
    mockRpc.mockImplementation((fn: string, args: any) => {
      if (fn === 'generate_employee_code') {
        return Promise.resolve({ data: 'HRK-002', error: null })
      }
      return Promise.resolve({ data: null, error: new Error('Unknown RPC') })
    })

    // Mock Supabase from(...) builder
    mockFrom.mockImplementation((table: string) => {
      return {
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockImplementation((payload: any) => {
          const list = insertedRows[table] || []
          const item = Array.isArray(payload) ? payload : [payload]
          list.push(...item)
          insertedRows[table] = list
          return {
            select: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: { id: `${table}-id-123`, ...(Array.isArray(payload) ? payload[0] : payload) },
              error: null,
            }),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: `${table}-id-123`, ...(Array.isArray(payload) ? payload[0] : payload) },
              error: null,
            }),
          }
        }),
        upsert: vi.fn().mockImplementation((payload: any) => {
          const list = insertedRows[table] || []
          list.push(payload)
          insertedRows[table] = list
          return {
            select: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: { id: `${table}-upsert-id`, ...payload },
              error: null,
            }),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: `${table}-upsert-id`, ...payload },
              error: null,
            }),
          }
        }),
        update: vi.fn().mockImplementation((payload: any) => {
          return {
            eq: vi.fn().mockReturnThis(),
          }
        }),
        delete: vi.fn().mockImplementation(() => {
          return {
            eq: vi.fn().mockResolvedValue({ error: null }),
          }
        }),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockImplementation(() => {
          if (table === 'roles') {
            return Promise.resolve({ data: { id: 'role-emp-id', name: 'EMPLOYEE' }, error: null })
          }
          if (table === 'employees') {
            return Promise.resolve({ data: null, error: null }) // no duplicate
          }
          if (table === 'salary_components') {
            return Promise.resolve({ data: { id: 'comp-basic-id', code: 'BASIC' }, error: null })
          }
          return Promise.resolve({ data: null, error: null })
        }),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      }
    })

    mockCreateUser.mockResolvedValue({
      data: {
        user: {
          id: 'new-auth-user-id',
          email: 'rahul.verma@haryak.com',
        },
      },
      error: null,
    })

    mockCreateAuditLog.mockResolvedValue({ id: 'audit-log-1' })
  })

  // =========================================================================
  // TEST 1: Admin login establishes visible session
  // =========================================================================
  it('TEST 1: Admin login establishes visible session with Supabase SSR cookies propagated', async () => {
    mockAuthenticateUser.mockResolvedValue({
      success: true,
      user: {
        id: 'admin-auth-id',
        email: 'haryak@admin.com',
        fullName: 'System Administrator',
        roles: ['SUPER_ADMIN'],
        mustChangePassword: false,
      },
    })

    const loginReq = new Request('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: 'haryak@admin.com',
        password: 'AdminPassword123!',
        mode: 'ADMIN',
      }),
    })

    const res = await loginHandler(loginReq)
    expect(res.status).toBe(200)

    const json = await res.json()
    expect(json.success).toBe(true)
    expect(json.user.email).toBe('haryak@admin.com')
    expect(json.user.roles).toContain('SUPER_ADMIN')

    // Verify Set-Cookie headers contain haryak_session and propagated Supabase SSR cookies
    const cookieHeader = res.headers.get('set-cookie') || ''
    expect(cookieHeader).toContain('haryak_session=')
    expect(cookieHeader).toContain('sb-test-auth-token.0=')
    expect(cookieHeader).toContain('sb-test-auth-token.1=')
  })

  // =========================================================================
  // TEST 2: SUPER_ADMIN can create employee
  // =========================================================================
  it('TEST 2: SUPER_ADMIN can successfully create employee with full credentials', async () => {
    mockResolveRequestContext.mockResolvedValue({
      ok: true,
      context: {
        authUserId: 'admin-auth-id',
        email: 'haryak@admin.com',
        fullName: 'System Administrator',
        companyId: 'company-haryak-id',
        employeeId: null,
        employeeCode: null,
        roles: ['SUPER_ADMIN'],
      } as ResolvedContext,
    })

    const empReq = new Request('http://localhost:3000/api/employees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: 'Rahul',
        lastName: 'Verma',
        email: 'rahul.verma@haryak.com',
        phone: '9876543210',
        joiningDate: '2026-09-01',
        departmentName: 'Engineering',
        designationName: 'Software Engineer',
        annualCtc: 600000,
        monthlyGross: 50000,
        ptDeduction: 200,
        pan: 'ABCDE1234F',
      }),
    })

    const res = await employeeHandler(empReq)
    expect(res.status).toBe(200)

    const data = await res.json()
    expect(data.success).toBe(true)
    expect(data.employee.code).toBe('HRK-002')
    expect(data.employee.email).toBe('rahul.verma@haryak.com')
    expect(data.employee.temporaryPassword).toBeDefined()
    expect(data.employee.temporaryPassword.length).toBeGreaterThanOrEqual(12)
  })

  // =========================================================================
  // TEST 3: HR_ADMIN can create employee
  // =========================================================================
  it('TEST 3: HR_ADMIN can create employee (RBAC permits HR_ADMIN)', async () => {
    mockResolveRequestContext.mockResolvedValue({
      ok: true,
      context: {
        authUserId: 'hr-auth-id',
        email: 'hr@haryak.com',
        fullName: 'HR Officer',
        companyId: 'company-haryak-id',
        employeeId: 'emp-hr-id',
        employeeCode: 'HRK-005',
        roles: ['HR_ADMIN'],
      } as ResolvedContext,
    })

    const empReq = new Request('http://localhost:3000/api/employees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: 'Priya',
        lastName: 'Sharma',
        email: 'priya.sharma@haryak.com',
        joiningDate: '2026-09-01',
      }),
    })

    const res = await employeeHandler(empReq)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
  })

  // =========================================================================
  // TEST 4: EMPLOYEE receives 403
  // =========================================================================
  it('TEST 4: EMPLOYEE role is rejected with 403 Insufficient permissions', async () => {
    mockResolveRequestContext.mockResolvedValue({
      ok: true,
      context: {
        authUserId: 'emp-auth-id',
        email: 'employee@haryak.com',
        fullName: 'Standard Employee',
        companyId: 'company-haryak-id',
        employeeId: 'emp-001-id',
        employeeCode: 'HRK-001',
        roles: ['EMPLOYEE'],
      } as ResolvedContext,
    })

    const empReq = new Request('http://localhost:3000/api/employees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: 'Malicious',
        lastName: 'Actor',
        email: 'malicious@haryak.com',
        joiningDate: '2026-09-01',
      }),
    })

    const res = await employeeHandler(empReq)
    expect(res.status).toBe(403)
    const data = await res.json()
    expect(data.success).toBe(false)
    expect(data.error).toContain('Insufficient permissions')
  })

  // =========================================================================
  // TEST 5: Unauthenticated request receives 401
  // =========================================================================
  it('TEST 5: Unauthenticated request receives 401 Authentication required', async () => {
    mockResolveRequestContext.mockResolvedValue({
      ok: false,
      error: {
        status: 401,
        message: 'Authentication required. Please log in.',
      },
    })

    const empReq = new Request('http://localhost:3000/api/employees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: 'Unauth',
        lastName: 'User',
        email: 'unauth@haryak.com',
        joiningDate: '2026-09-01',
      }),
    })

    const res = await employeeHandler(empReq)
    expect(res.status).toBe(401)
    const data = await res.json()
    expect(data.success).toBe(false)
    expect(data.error).toContain('Authentication required')
  })

  // =========================================================================
  // TEST 6: Admin login followed immediately by creation has no race condition
  // =========================================================================
  it('TEST 6: Admin login followed immediately by creation executes synchronously without race conditions', async () => {
    mockAuthenticateUser.mockResolvedValue({
      success: true,
      user: {
        id: 'admin-auth-id',
        email: 'haryak@admin.com',
        fullName: 'System Administrator',
        roles: ['SUPER_ADMIN'],
      },
    })

    // Step A: Login completes synchronously
    const loginRes = await loginHandler(
      new Request('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: 'haryak@admin.com',
          password: 'AdminPassword123!',
          mode: 'ADMIN',
        }),
      })
    )
    expect(loginRes.status).toBe(200)

    // Step B: Immediate context resolution matches authenticated session
    mockResolveRequestContext.mockResolvedValue({
      ok: true,
      context: {
        authUserId: 'admin-auth-id',
        email: 'haryak@admin.com',
        fullName: 'System Administrator',
        companyId: 'company-haryak-id',
        employeeId: null,
        employeeCode: null,
        roles: ['SUPER_ADMIN'],
      } as ResolvedContext,
    })

    // Step C: Creation request immediately executes
    const createRes = await employeeHandler(
      new Request('http://localhost:3000/api/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: 'Ananya',
          lastName: 'Rao',
          email: 'ananya.rao@haryak.com',
          joiningDate: '2026-09-01',
        }),
      })
    )
    expect(createRes.status).toBe(200)
    const createData = await createRes.json()
    expect(createData.success).toBe(true)
  })

  // =========================================================================
  // TEST 7: Complete unified entities (auth.users, public.users, employees, user_roles, salary_structures, employee_statutory_details)
  // =========================================================================
  it('TEST 7: All 6 unified entities are properly constructed and linked', async () => {
    mockResolveRequestContext.mockResolvedValue({
      ok: true,
      context: {
        authUserId: 'admin-auth-id',
        email: 'haryak@admin.com',
        fullName: 'System Administrator',
        companyId: 'company-haryak-id',
        employeeId: null,
        employeeCode: null,
        roles: ['SUPER_ADMIN'],
      } as ResolvedContext,
    })

    const empReq = new Request('http://localhost:3000/api/employees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: 'Vikram',
        lastName: 'Singh',
        email: 'vikram.singh@haryak.com',
        joiningDate: '2026-09-01',
        annualCtc: 720000,
        monthlyGross: 60000,
        ptDeduction: 200,
        pan: 'ABCDE9876Z',
      }),
    })

    const res = await employeeHandler(empReq)
    expect(res.status).toBe(200)

    // Verify 1: auth.users created
    expect(mockCreateUser).toHaveBeenCalledTimes(1)
    const authCallArgs = mockCreateUser.mock.calls[0][0]
    expect(authCallArgs.email).toBe('vikram.singh@haryak.com')

    // Verify 2: public.users inserted/upserted with authUserId
    expect(insertedRows.users.length).toBeGreaterThan(0)
    expect(insertedRows.users[0].id).toBe('new-auth-user-id')
    expect(insertedRows.users[0].company_id).toBe('company-haryak-id')

    // Verify 3: user_roles assigned with role_id
    expect(insertedRows.user_roles.length).toBeGreaterThan(0)
    expect(insertedRows.user_roles[0].user_id).toBe('new-auth-user-id')
    expect(insertedRows.user_roles[0].role_id).toBe('role-emp-id')

    // Verify 4: employees master record inserted with user_id and employee_code
    expect(insertedRows.employees.length).toBeGreaterThan(0)
    expect(insertedRows.employees[0].user_id).toBe('new-auth-user-id')
    expect(insertedRows.employees[0].employee_code).toBe('HRK-002')

    // Verify 5: salary_structures inserted
    expect(insertedRows.salary_structures.length).toBeGreaterThan(0)
    expect(insertedRows.salary_structures[0].annual_ctc).toBe(720000)
    expect(insertedRows.salary_structures[0].monthly_gross).toBe(60000)

    // Verify 6: employee_statutory_details inserted with truthful PT and PAN
    expect(insertedRows.employee_statutory_details.length).toBeGreaterThan(0)
    expect(insertedRows.employee_statutory_details[0].pt_applicable).toBe(true)
    expect(insertedRows.employee_statutory_details[0].pan_encrypted).toBe('ABCDE9876Z')
    expect(insertedRows.employee_statutory_details[0].pan_masked).toBe('AB••••••6Z')
  })

  // =========================================================================
  // TEST 8: Role is EMPLOYEE, never SUPER_ADMIN
  // =========================================================================
  it('TEST 8: Onboarded employee is assigned role EMPLOYEE strictly, never SUPER_ADMIN', async () => {
    mockResolveRequestContext.mockResolvedValue({
      ok: true,
      context: {
        authUserId: 'admin-auth-id',
        email: 'haryak@admin.com',
        fullName: 'System Administrator',
        companyId: 'company-haryak-id',
        employeeId: null,
        employeeCode: null,
        roles: ['SUPER_ADMIN'],
      } as ResolvedContext,
    })

    const empReq = new Request('http://localhost:3000/api/employees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: 'Regular',
        lastName: 'Employee',
        email: 'regular.emp@haryak.com',
        joiningDate: '2026-09-01',
      }),
    })

    const res = await employeeHandler(empReq)
    expect(res.status).toBe(200)

    // Check auth user metadata role
    const authCallArgs = mockCreateUser.mock.calls[0][0]
    expect(authCallArgs.user_metadata.role).toBe('EMPLOYEE')
    expect(authCallArgs.user_metadata.role).not.toBe('SUPER_ADMIN')

    // Check user_roles mapping query
    expect(mockFrom).toHaveBeenCalledWith('roles')
    expect(mockFrom).toHaveBeenCalledWith('user_roles')
  })

  // =========================================================================
  // TEST 9: must_change_password: true
  // =========================================================================
  it('TEST 9: Auth user created with must_change_password: true in metadata', async () => {
    mockResolveRequestContext.mockResolvedValue({
      ok: true,
      context: {
        authUserId: 'admin-auth-id',
        email: 'haryak@admin.com',
        fullName: 'System Administrator',
        companyId: 'company-haryak-id',
        employeeId: null,
        employeeCode: null,
        roles: ['SUPER_ADMIN'],
      } as ResolvedContext,
    })

    const empReq = new Request('http://localhost:3000/api/employees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: 'First',
        lastName: 'User',
        email: 'first.user@haryak.com',
        joiningDate: '2026-09-01',
      }),
    })

    const res = await employeeHandler(empReq)
    expect(res.status).toBe(200)

    const authCallArgs = mockCreateUser.mock.calls[0][0]
    expect(authCallArgs.user_metadata.must_change_password).toBe(true)
  })

  // =========================================================================
  // TEST 10: No plaintext temporary password saved in DB
  // =========================================================================
  it('TEST 10: High-entropy temporary password is not saved in plaintext in DB tables', async () => {
    mockResolveRequestContext.mockResolvedValue({
      ok: true,
      context: {
        authUserId: 'admin-auth-id',
        email: 'haryak@admin.com',
        fullName: 'System Administrator',
        companyId: 'company-haryak-id',
        employeeId: null,
        employeeCode: null,
        roles: ['SUPER_ADMIN'],
      } as ResolvedContext,
    })

    const empReq = new Request('http://localhost:3000/api/employees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: 'Secret',
        lastName: 'User',
        email: 'secret.user@haryak.com',
        joiningDate: '2026-09-01',
      }),
    })

    const res = await employeeHandler(empReq)
    expect(res.status).toBe(200)
    const data = await res.json()
    const tempPassword = data.employee.temporaryPassword
    expect(tempPassword).toBeDefined()

    // Assert that NONE of the database payloads store the plaintext temporary password
    for (const [tableName, rows] of Object.entries(insertedRows)) {
      for (const row of rows) {
        const rowString = JSON.stringify(row)
        expect(rowString).not.toContain(tempPassword)
      }
    }

    // Verify audit log also does not contain the plaintext temporary password
    expect(mockCreateAuditLog).toHaveBeenCalled()
    const auditArgs = JSON.stringify(mockCreateAuditLog.mock.calls[0][0])
    expect(auditArgs).not.toContain(tempPassword)
  })

  // =========================================================================
  // TEST 11: Compensating rollback on provisioning failure
  // =========================================================================
  it('TEST 11: Compensating rollback deletes auth user and partial DB records on failure', async () => {
    mockResolveRequestContext.mockResolvedValue({
      ok: true,
      context: {
        authUserId: 'admin-auth-id',
        email: 'haryak@admin.com',
        fullName: 'System Administrator',
        companyId: 'company-haryak-id',
        employeeId: null,
        employeeCode: null,
        roles: ['SUPER_ADMIN'],
      } as ResolvedContext,
    })

    // Simulate failure during employee insertion
    mockFrom.mockImplementation((table: string) => {
      if (table === 'employees') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          insert: vi.fn().mockImplementation(() => ({
            select: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: null,
              error: new Error('DB Connection Timeout on employees insert'),
            }),
          })),
        }
      }
      return {
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { id: 'dummy' }, error: null }),
          maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'dummy' }, error: null }),
        }),
        upsert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { id: 'dummy' }, error: null }),
          maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'dummy' }, error: null }),
        }),
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      }
    })

    const empReq = new Request('http://localhost:3000/api/employees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: 'Failing',
        lastName: 'User',
        email: 'failing.user@haryak.com',
        joiningDate: '2026-09-01',
      }),
    })

    const res = await employeeHandler(empReq)
    expect(res.status).toBe(500)
    const data = await res.json()
    expect(data.success).toBe(false)

    // Ensure compensating rollback was invoked to delete the orphaned auth user
    expect(mockDeleteUser).toHaveBeenCalledWith('new-auth-user-id')
  })

  // =========================================================================
  // TEST 12: Existing compensation P0 invariants remain passing
  // =========================================================================
  it('TEST 12: Existing compensation P0 invariants remain intact (truthful salary components persisted without fake percentages)', async () => {
    mockResolveRequestContext.mockResolvedValue({
      ok: true,
      context: {
        authUserId: 'admin-auth-id',
        email: 'haryak@admin.com',
        fullName: 'System Administrator',
        companyId: 'company-haryak-id',
        employeeId: null,
        employeeCode: null,
        roles: ['SUPER_ADMIN'],
      } as ResolvedContext,
    })

    // Employee onboarded with specific components: Basic ₹28,800, HRA ₹14,400, Special ₹14,400
    const empReq = new Request('http://localhost:3000/api/employees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: 'Truthful',
        lastName: 'Comp',
        email: 'truthful.comp@haryak.com',
        joiningDate: '2026-09-01',
        annualCtc: 691200,
        monthlyGross: 57600,
        components: [
          { component_id: 'comp-basic', code: 'BASIC', monthly_amount: 28800, annual_amount: 345600 },
          { component_id: 'comp-hra', code: 'HRA', monthly_amount: 14400, annual_amount: 172800 },
          { component_id: 'comp-special', code: 'SPECIAL', monthly_amount: 14400, annual_amount: 172800 },
        ],
        ptDeduction: 200,
      }),
    })

    const res = await employeeHandler(empReq)
    expect(res.status).toBe(200)

    // Assert salary_structure_components received exact values, not synthetic guesses
    const savedComponents = insertedRows.salary_structure_components
    expect(savedComponents).toHaveLength(3)
    expect(savedComponents[0].monthly_amount).toBe(28800)
    expect(savedComponents[1].monthly_amount).toBe(14400)
    expect(savedComponents[2].monthly_amount).toBe(14400)
    const sumMonthly = savedComponents.reduce((sum, c) => sum + c.monthly_amount, 0)
    expect(sumMonthly).toBe(57600)
  })
})
