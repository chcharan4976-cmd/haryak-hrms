import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { ROLES } from '@/lib/constants'

// Hoist mocks
const mockGetUser = vi.fn()
const mockSignInWithPassword = vi.fn()
const mockUpdateUserById = vi.fn()
const mockListUsers = vi.fn()
const mockAdminFrom = vi.fn()

vi.mock('@/lib/supabase/admin', () => ({
  isSupabaseConfigured: vi.fn(() => true),
  isSupabaseReachable: vi.fn(async () => true),
  createAdminClient: vi.fn(() => ({
    auth: {
      admin: {
        getUserById: vi.fn(),
        updateUserById: mockUpdateUserById,
        listUsers: mockListUsers,
      },
    },
    from: mockAdminFrom,
    rpc: vi.fn(),
  })),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async ({ onSetCookies }: any = {}) => ({
    auth: {
      getUser: mockGetUser,
      signInWithPassword: mockSignInWithPassword,
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
  })),
}))

vi.mock('@/lib/services/audit-service', () => ({
  createAuditLog: vi.fn(async () => {}),
}))

import {
  authenticateUser,
  updateEmployeeFirstPassword,
} from '@/lib/auth/auth-service'
import { updateSession } from '@/lib/supabase/middleware'

function createQueryChain(data: any) {
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    neq: vi.fn(() => chain),
    or: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    single: vi.fn().mockResolvedValue({ data, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data, error: null }),
    update: vi.fn(() => chain),
    then: (resolve: any) => Promise.resolve({ data, error: null }).then(resolve),
  }
  return chain
}

describe('Employee First-Login and Role-Aware Routing Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('1. authenticateUser Role-Aware Redirect Resolution', () => {
    it('routes a new employee with temporary password (must_change_password: true) to /first-login/change-password', async () => {
      mockSignInWithPassword.mockResolvedValue({
        data: {
          user: {
            id: 'emp-auth-1',
            email: 'emp1@haryak.com',
            user_metadata: {
              must_change_password: true,
              employee_id: 'emp-profile-1',
              employee_code: 'HRK-001',
              full_name: 'Employee One',
              role: 'EMPLOYEE',
            },
          },
          session: { access_token: 'valid-token' },
        },
        error: null,
      })

      mockAdminFrom.mockImplementation((table: string) => {
        if (table === 'employees') {
          return createQueryChain({
            id: 'emp-profile-1',
            official_email: 'emp1@haryak.com',
            employee_code: 'HRK-001',
            is_active: true,
            employment_status: 'active',
          })
        }
        if (table === 'users') {
          return createQueryChain({
            id: 'emp-auth-1',
            company_id: 'comp-1',
            employee_id: 'emp-profile-1',
            email: 'emp1@haryak.com',
            full_name: 'Employee One',
            is_active: true,
          })
        }
        if (table === 'user_roles') {
          return createQueryChain([
            { role_id: 'role-emp', roles: { name: ROLES.EMPLOYEE } },
          ])
        }
        return createQueryChain(null)
      })

      const result = await authenticateUser('HRK-001', 'TempPass@123', 'EMPLOYEE')

      expect(result.success).toBe(true)
      expect(result.redirectUrl).toBe('/first-login/change-password')
      expect(result.user?.mustChangeCredentials).toBe(false)
      expect(result.user?.mustChangePassword).toBe(true)
    })

    it('NEVER routes an employee with legacy must_change_credentials: true to /first-login/change-credentials', async () => {
      mockSignInWithPassword.mockResolvedValue({
        data: {
          user: {
            id: 'emp-auth-2',
            email: 'emp2@haryak.com',
            user_metadata: {
              must_change_credentials: true, // Accidental admin flag on employee
              must_change_password: true,
              employee_id: 'emp-profile-2',
              employee_code: 'HRK-002',
              full_name: 'Employee Two',
              role: 'EMPLOYEE',
            },
          },
          session: { access_token: 'valid-token' },
        },
        error: null,
      })

      mockAdminFrom.mockImplementation((table: string) => {
        if (table === 'employees') {
          return createQueryChain({
            id: 'emp-profile-2',
            official_email: 'emp2@haryak.com',
            employee_code: 'HRK-002',
            is_active: true,
            employment_status: 'active',
          })
        }
        if (table === 'users') {
          return createQueryChain({
            id: 'emp-auth-2',
            company_id: 'comp-1',
            employee_id: 'emp-profile-2',
            email: 'emp2@haryak.com',
            full_name: 'Employee Two',
            is_active: true,
          })
        }
        if (table === 'user_roles') {
          return createQueryChain([
            { role_id: 'role-emp', roles: { name: ROLES.EMPLOYEE } },
          ])
        }
        return createQueryChain(null)
      })

      const result = await authenticateUser('HRK-002', 'TempPass@123', 'EMPLOYEE')

      expect(result.success).toBe(true)
      // Must strictly be change-password, NOT change-credentials
      expect(result.redirectUrl).toBe('/first-login/change-password')
      expect(result.user?.mustChangeCredentials).toBe(false)
      expect(result.user?.mustChangePassword).toBe(true)
    })

    it('routes an existing employee with valid credentials to /portal/home', async () => {
      mockSignInWithPassword.mockResolvedValue({
        data: {
          user: {
            id: 'emp-auth-3',
            email: 'emp3@haryak.com',
            user_metadata: {
              must_change_password: false,
              must_change_credentials: false,
              employee_id: 'emp-profile-3',
              employee_code: 'HRK-003',
              full_name: 'Employee Three',
              role: 'EMPLOYEE',
            },
          },
          session: { access_token: 'valid-token' },
        },
        error: null,
      })

      mockAdminFrom.mockImplementation((table: string) => {
        if (table === 'employees') {
          return createQueryChain({
            id: 'emp-profile-3',
            official_email: 'emp3@haryak.com',
            employee_code: 'HRK-003',
            is_active: true,
            employment_status: 'active',
          })
        }
        if (table === 'users') {
          return createQueryChain({
            id: 'emp-auth-3',
            company_id: 'comp-1',
            employee_id: 'emp-profile-3',
            email: 'emp3@haryak.com',
            full_name: 'Employee Three',
            is_active: true,
          })
        }
        if (table === 'user_roles') {
          return createQueryChain([
            { role_id: 'role-emp', roles: { name: ROLES.EMPLOYEE } },
          ])
        }
        return createQueryChain(null)
      })

      const result = await authenticateUser('HRK-003', 'SecurePass@123', 'EMPLOYEE')

      expect(result.success).toBe(true)
      expect(result.redirectUrl).toBe('/portal/home')
      expect(result.user?.mustChangeCredentials).toBe(false)
      expect(result.user?.mustChangePassword).toBe(false)
    })

    it('routes initial bootstrap Super Admin with must_change_credentials: true to /first-login/change-credentials', async () => {
      mockSignInWithPassword.mockResolvedValue({
        data: {
          user: {
            id: 'admin-auth-1',
            email: 'admin@haryak.com',
            user_metadata: {
              must_change_credentials: true,
              role: ROLES.SUPER_ADMIN,
              full_name: 'Super Administrator',
            },
          },
          session: { access_token: 'admin-token' },
        },
        error: null,
      })

      mockAdminFrom.mockImplementation((table: string) => {
        if (table === 'users') {
          return createQueryChain({
            id: 'admin-auth-1',
            company_id: 'comp-1',
            employee_id: null,
            email: 'admin@haryak.com',
            full_name: 'Super Administrator',
            is_active: true,
          })
        }
        if (table === 'user_roles') {
          return createQueryChain([
            { role_id: 'role-sa', roles: { name: ROLES.SUPER_ADMIN } },
          ])
        }
        return createQueryChain(null)
      })

      const result = await authenticateUser('admin@haryak.com', 'Haryak@123', 'ADMIN')

      expect(result.success).toBe(true)
      expect(result.redirectUrl).toBe('/first-login/change-credentials')
      expect(result.user?.mustChangeCredentials).toBe(true)
    })
  })

  describe('2. Middleware Role-Aware Route Protection', () => {
    it('redirects an employee with temporary password away from /first-login/change-credentials to /first-login/change-password', async () => {
      const request = new NextRequest('http://localhost:3000/first-login/change-credentials', {
        headers: {
          cookie: `haryak_session=${encodeURIComponent(JSON.stringify({
            id: 'emp-1',
            email: 'thiru@haryak.com',
            fullName: 'Thiru M',
            employeeCode: 'HRK-001',
            roles: ['EMPLOYEE'],
            mustChangePassword: true,
          }))}`,
        },
      })

      const response = await updateSession(request)
      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toBe('http://localhost:3000/first-login/change-password')
    })

    it('redirects an employee with completed password away from /first-login/change-credentials to /portal/home', async () => {
      const request = new NextRequest('http://localhost:3000/first-login/change-credentials', {
        headers: {
          cookie: `haryak_session=${encodeURIComponent(JSON.stringify({
            id: 'emp-1',
            email: 'thiru@haryak.com',
            fullName: 'Thiru M',
            employeeCode: 'HRK-001',
            roles: ['EMPLOYEE'],
            mustChangePassword: false,
            mustChangeCredentials: false,
          }))}`,
        },
      })

      const response = await updateSession(request)
      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toBe('http://localhost:3000/portal/home')
    })

    it('redirects an unauthenticated user attempting to access /first-login/change-credentials to /login', async () => {
      const request = new NextRequest('http://localhost:3000/first-login/change-credentials')

      const response = await updateSession(request)
      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toContain('/login?redirect=%2Ffirst-login%2Fchange-credentials')
    })

    it('allows an un-reset Super Admin with mustChangeCredentials: true to access /first-login/change-credentials', async () => {
      const request = new NextRequest('http://localhost:3000/first-login/change-credentials', {
        headers: {
          cookie: `haryak_session=${encodeURIComponent(JSON.stringify({
            id: 'admin-1',
            email: 'admin@haryak.com',
            roles: ['SUPER_ADMIN'],
            mustChangeCredentials: true,
          }))}`,
        },
      })

      const response = await updateSession(request)
      expect(response.status).not.toBe(307)
    })
  })

  describe('3. updateEmployeeFirstPassword Execution', () => {
    it('validates password complexity and rejects simple passwords', async () => {
      const result = await updateEmployeeFirstPassword('thiru@haryak.com', 'OldPass@123', 'simple')
      expect(result.success).toBe(false)
      expect(result.error).toContain('at least 8 characters')
    })

    it('rejects new password identical to current temporary password', async () => {
      const result = await updateEmployeeFirstPassword('thiru@haryak.com', 'SamePass@123', 'SamePass@123')
      expect(result.success).toBe(false)
      expect(result.error).toContain('must be different')
    })

    it('updates Supabase Auth and public.users, clearing must_change_password', async () => {
      const mockUpdateUsersTable = vi.fn(() => ({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }))

      mockAdminFrom.mockImplementation((table: string) => {
        if (table === 'users') {
          const chain = createQueryChain({
            id: 'emp-auth-1',
            company_id: 'comp-1',
            employee_id: 'emp-profile-1',
            email: 'thiru@haryak.com',
            full_name: 'Thiru M',
            is_active: true,
          })
          chain.update = mockUpdateUsersTable
          return chain
        }
        if (table === 'user_roles') {
          return createQueryChain([
            { role_id: 'role-emp', roles: { name: ROLES.EMPLOYEE } },
          ])
        }
        return createQueryChain(null)
      })

      mockListUsers.mockResolvedValue({
        data: {
          users: [
            {
              id: 'emp-auth-1',
              email: 'thiru@haryak.com',
              user_metadata: { employee_code: 'HRK-001', full_name: 'Thiru M' },
            },
          ],
        },
        error: null,
      })

      mockSignInWithPassword.mockResolvedValue({
        data: { session: { access_token: 'fresh-token' } },
        error: null,
      })

      mockUpdateUserById.mockResolvedValue({
        data: { user: { id: 'emp-auth-1' } },
        error: null,
      })

      const cookiesCaptured: any[] = []
      const result = await updateEmployeeFirstPassword(
        'thiru@haryak.com',
        'OldPass@123',
        'NewSecurePass@2026',
        (c) => cookiesCaptured.push(...c)
      )

      expect(result.success).toBe(true)
      expect(mockUpdateUserById).toHaveBeenCalledWith(
        'emp-auth-1',
        expect.objectContaining({
          password: 'NewSecurePass@2026',
          user_metadata: expect.objectContaining({
            must_change_password: false,
            must_change_credentials: false,
          }),
        })
      )
      expect(mockUpdateUsersTable).toHaveBeenCalledWith(
        expect.objectContaining({
          must_change_password: false,
        })
      )
      expect(result.user?.mustChangePassword).toBe(false)
      expect(result.user?.mustChangeCredentials).toBe(false)
    })
  })
})
