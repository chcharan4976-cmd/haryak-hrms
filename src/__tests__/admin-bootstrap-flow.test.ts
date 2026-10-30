import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  checkSuperAdminExists,
  bootstrapInitialSuperAdmin,
  authenticateUser,
  updateInitialAdminCredentials,
  resolveBootstrapAdminContext,
} from '@/lib/auth/auth-service'
import { updateSession } from '@/lib/supabase/middleware'
import { resolveRequestContext } from '@/lib/services/company-resolver'
import { adminFirstLoginSchema, passwordComplexityRegex } from '@/lib/validations/auth'
import { NextRequest } from 'next/server'
import { ROLES } from '@/lib/constants'

// Hoist mocks for Supabase SSR and Admin
const { mockGetUser, mockAdminFrom, mockAdminAuthListUsers, mockAdminAuthCreateUser, mockAdminAuthUpdateUserById } = vi.hoisted(() => {
  return {
    mockGetUser: vi.fn(),
    mockAdminFrom: vi.fn(),
    mockAdminAuthListUsers: vi.fn(),
    mockAdminAuthCreateUser: vi.fn(),
    mockAdminAuthUpdateUserById: vi.fn(),
  }
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: mockGetUser,
    },
  })),
}))

vi.mock('@/lib/supabase/admin', () => ({
  isSupabaseConfigured: () => false,
  isSupabaseReachable: async () => false,
  createAdminClient: () => ({
    from: vi.fn((table: string) => {
      if (mockAdminFrom.getMockImplementation()) {
        const res = mockAdminFrom(table)
        if (res && Object.keys(res).length > 0) return res
      }
      return {
        insert: vi.fn().mockResolvedValue({ data: null, error: null }),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      }
    }),
    auth: {
      admin: {
        listUsers: mockAdminAuthListUsers,
        createUser: mockAdminAuthCreateUser,
        updateUserById: mockAdminAuthUpdateUserById,
      },
    },
  }),
}))

describe('Admin Bootstrap & Forced Credential Reset Security Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.BOOTSTRAP_ADMIN_EMAIL
    delete process.env.BOOTSTRAP_ADMIN_PASSWORD
  })

  describe('Password Strength & First Login Schema Validation', () => {
    it('rejects passwords shorter than 8 characters', () => {
      expect(passwordComplexityRegex.test('Ab1!')).toBe(false)
      const res = adminFirstLoginSchema.safeParse({
        currentPassword: 'Haryak@123',
        newEmail: 'admin@haryak.com',
        confirmNewEmail: 'admin@haryak.com',
        newPassword: 'Ab1!',
        confirmNewPassword: 'Ab1!',
      })
      expect(res.success).toBe(false)
      if (!res.success) {
        expect(res.error.issues.some((i) => i.message.includes('at least 8 characters'))).toBe(true)
      }
    })

    it('rejects passwords lacking uppercase, numbers, or special characters', () => {
      expect(passwordComplexityRegex.test('alllowercaseonly')).toBe(false)
      expect(passwordComplexityRegex.test('ALLUPPERCASE123')).toBe(false)
      expect(passwordComplexityRegex.test('NoSpecialChar123')).toBe(false)

      const res = adminFirstLoginSchema.safeParse({
        currentPassword: 'Haryak@123',
        newEmail: 'admin@haryak.com',
        confirmNewEmail: 'admin@haryak.com',
        newPassword: 'alllowercaseonly',
        confirmNewPassword: 'alllowercaseonly',
      })
      expect(res.success).toBe(false)
    })

    it('rejects new password if it is identical to temporary password', () => {
      const res = adminFirstLoginSchema.safeParse({
        currentPassword: 'SecureAdmin2026!#',
        newEmail: 'admin@haryak.com',
        confirmNewEmail: 'admin@haryak.com',
        newPassword: 'SecureAdmin2026!#',
        confirmNewPassword: 'SecureAdmin2026!#',
      })
      expect(res.success).toBe(false)
      if (!res.success) {
        expect(res.error.issues.some((i) => i.message.includes('must be different'))).toBe(true)
      }
    })

    it('accepts strong passwords meeting all complexity criteria and valid email confirmation', () => {
      expect(passwordComplexityRegex.test('SecureAdmin2026!#')).toBe(true)
      const res = adminFirstLoginSchema.safeParse({
        currentPassword: 'Haryak@123',
        newEmail: 'newadmin@haryak.com',
        confirmNewEmail: 'newadmin@haryak.com',
        newPassword: 'SecureAdmin2026!#',
        confirmNewPassword: 'SecureAdmin2026!#',
      })
      expect(res.success).toBe(true)
    })
  })

  describe('checkSuperAdminExists', () => {
    it('returns false when no active super admin exists in user_roles', async () => {
      const mockClient: any = {
        rpc: vi.fn().mockResolvedValue({ data: false, error: null }),
        from: vi.fn((table: string) => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                limit: vi.fn().mockResolvedValue({ data: [], error: null }),
              })),
            })),
          })),
        })),
      }

      const exists = await checkSuperAdminExists(mockClient)
      expect(exists).toBe(false)
    })

    it('returns true when active super admin exists in user_roles', async () => {
      const mockClient: any = {
        rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
        from: vi.fn(),
      }

      const exists = await checkSuperAdminExists(mockClient)
      expect(exists).toBe(true)
    })

    it('falls back to query when rpc is unavailable and detects existing super admin', async () => {
      const mockClient: any = {
        from: vi.fn((table: string) => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                limit: vi.fn().mockResolvedValue({
                  data: [{ user_id: 'user-admin-1', users: { is_active: true } }],
                  error: null,
                }),
              })),
            })),
          })),
        })),
      }

      const exists = await checkSuperAdminExists(mockClient)
      expect(exists).toBe(true)
    })
  })

  describe('bootstrapInitialSuperAdmin', () => {
    it('creates company, role, auth user, public user, and user_role on empty DB', async () => {
      const insertedRows: Record<string, any[]> = {
        companies: [],
        roles: [],
        users: [],
        user_roles: [],
        audit_logs: [],
      }

      const mockAdminClient: any = {
        rpc: vi.fn().mockResolvedValue({ data: false, error: null }),
        from: vi.fn((table: string) => {
          return {
            select: vi.fn((cols?: string) => ({
              order: vi.fn(() => ({
                limit: vi.fn(() => ({
                  maybeSingle: vi.fn().mockImplementation(async () => {
                    return { data: insertedRows[table]?.[0] || null, error: null }
                  }),
                })),
              })),
              eq: vi.fn((col1: string, val1: any) => ({
                eq: vi.fn((col2: string, val2: any) => ({
                  single: vi.fn().mockImplementation(async () => {
                    const row = insertedRows[table]?.find(
                      (r) => r[col1] === val1 && r[col2] === val2
                    ) || { id: 'role-super-admin-id', name: ROLES.SUPER_ADMIN, company_id: val1 }
                    return { data: row, error: null }
                  }),
                  limit: vi.fn().mockResolvedValue({ data: [], error: null }),
                })),
              })),
            })),
            insert: vi.fn((data: any) => {
              const rows = Array.isArray(data) ? data : [data]
              if (!insertedRows[table]) insertedRows[table] = []
              const rowsWithId = rows.map((r) => ({ id: r.id || `mock-${table}-${Date.now()}`, ...r }))
              insertedRows[table].push(...rowsWithId)
              return {
                select: vi.fn(() => ({
                  single: vi.fn().mockResolvedValue({ data: rowsWithId[0], error: null }),
                })),
              }
            }),
            upsert: vi.fn((data: any) => {
              const row = { id: data.id || `mock-${table}-upsert`, ...data }
              if (!insertedRows[table]) insertedRows[table] = []
              insertedRows[table].push(row)
              return {
                select: vi.fn(() => ({
                  single: vi.fn().mockResolvedValue({ data: row, error: null }),
                })),
              }
            }),
          }
        }),
        auth: {
          admin: {
            listUsers: vi.fn().mockResolvedValue({ data: { users: [] }, error: null }),
            createUser: vi.fn().mockResolvedValue({
              data: {
                user: {
                  id: 'auth-user-super-admin',
                  email: 'haryak@admin.com',
                  user_metadata: { must_change_credentials: true },
                },
              },
              error: null,
            }),
          },
        },
      }

      const result = await bootstrapInitialSuperAdmin(
        mockAdminClient,
        'haryak@admin.com',
        'Haryak@123'
      )

      expect(result.authUserId).toBe('auth-user-super-admin')
      expect(result.companyId).toBeDefined()
      expect(mockAdminClient.auth.admin.createUser).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'haryak@admin.com',
          user_metadata: expect.objectContaining({
            must_change_credentials: true,
          }),
        })
      )
      // Check that company was created
      expect(insertedRows.companies.length).toBeGreaterThan(0)
      // Check that user was upserted with must_change_password: true
      const createdUser = insertedRows.users.find((u) => u.email === 'haryak@admin.com')
      expect(createdUser).toBeDefined()
      expect(createdUser.must_change_password).toBe(true)
      // Check that user_role was assigned
      expect(insertedRows.user_roles.length).toBeGreaterThan(0)
    })

    it('recovers existing leftover Supabase Auth user when database is reset', async () => {
      const insertedRows: Record<string, any[]> = {
        companies: [],
        roles: [],
        users: [],
        user_roles: [],
        audit_logs: [],
      }

      const mockAdminClient: any = {
        rpc: vi.fn().mockResolvedValue({ data: false, error: null }),
        from: vi.fn((table: string) => {
          return {
            select: vi.fn(() => ({
              order: vi.fn(() => ({
                limit: vi.fn(() => ({
                  maybeSingle: vi.fn().mockImplementation(async () => {
                    return { data: insertedRows[table]?.[0] || null, error: null }
                  }),
                })),
              })),
              eq: vi.fn((col1: string, val1: any) => ({
                eq: vi.fn((col2: string, val2: any) => ({
                  single: vi.fn().mockImplementation(async () => {
                    const row = { id: 'role-super-admin-id', name: ROLES.SUPER_ADMIN, company_id: val1 }
                    return { data: row, error: null }
                  }),
                  limit: vi.fn().mockResolvedValue({ data: [], error: null }),
                })),
              })),
            })),
            insert: vi.fn((data: any) => {
              const rows = Array.isArray(data) ? data : [data]
              if (!insertedRows[table]) insertedRows[table] = []
              const rowsWithId = rows.map((r) => ({ id: r.id || `mock-${table}-${Date.now()}`, ...r }))
              insertedRows[table].push(...rowsWithId)
              return {
                select: vi.fn(() => ({
                  single: vi.fn().mockResolvedValue({ data: rowsWithId[0], error: null }),
                })),
              }
            }),
            upsert: vi.fn((data: any) => {
              const row = { id: data.id || `mock-${table}-upsert`, ...data }
              if (!insertedRows[table]) insertedRows[table] = []
              insertedRows[table].push(row)
              return {
                select: vi.fn(() => ({
                  single: vi.fn().mockResolvedValue({ data: row, error: null }),
                })),
              }
            }),
          }
        }),
        auth: {
          admin: {
            listUsers: vi.fn().mockResolvedValue({
              data: {
                users: [
                  {
                    id: 'existing-leftover-auth-id',
                    email: 'haryak@admin.com',
                  },
                ],
              },
              error: null,
            }),
            updateUserById: vi.fn().mockResolvedValue({
              data: {
                user: {
                  id: 'existing-leftover-auth-id',
                  email: 'haryak@admin.com',
                },
              },
              error: null,
            }),
            createUser: vi.fn(),
          },
        },
      }

      const result = await bootstrapInitialSuperAdmin(
        mockAdminClient,
        'haryak@admin.com',
        'Haryak@123'
      )

      expect(result.authUserId).toBe('existing-leftover-auth-id')
      expect(mockAdminClient.auth.admin.updateUserById).toHaveBeenCalledWith(
        'existing-leftover-auth-id',
        expect.objectContaining({
          password: 'Haryak@123',
          user_metadata: expect.objectContaining({
            must_change_credentials: true,
          }),
        })
      )
    })

    it('aborts idempotently if an active Super Admin already exists', async () => {
      const mockAdminClient: any = {
        rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
        from: vi.fn(),
      }

      await expect(
        bootstrapInitialSuperAdmin(mockAdminClient, 'haryak@admin.com', 'Haryak@123')
      ).rejects.toThrow('System bootstrap is not permitted: active Super Administrator already exists.')
    })
  })

  describe('authenticateUser Bootstrap Flow', () => {
    it('authenticates valid bootstrap credentials and returns redirect to /first-login/change-credentials', async () => {
      const result = await authenticateUser('haryak@admin.com', 'Haryak@123', 'ADMIN')
      expect(result.success).toBe(true)
      expect(result.user?.mustChangeCredentials).toBe(true)
      expect(result.redirectUrl).toBe('/first-login/change-credentials')
    })

    it('rejects invalid bootstrap password with generic anti-enumeration message', async () => {
      const result = await authenticateUser('haryak@admin.com', 'WrongPassword!234', 'ADMIN')
      expect(result.success).toBe(false)
      expect(result.error).toBe('Invalid Employee ID/email or password.')
    })

    it('rejects unauthorized email even in ADMIN mode', async () => {
      const result = await authenticateUser('attacker@evil.com', 'Haryak@123', 'ADMIN')
      expect(result.success).toBe(false)
      expect(result.error).toBe('Invalid Employee ID/email or password.')
    })

    it('respects custom environment configuration for BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD', async () => {
      process.env.BOOTSTRAP_ADMIN_EMAIL = 'custom-admin@enterprise.internal'
      process.env.BOOTSTRAP_ADMIN_PASSWORD = 'CustomStrongSecret2026!'

      // Default should no longer authenticate as bootstrap
      const defaultRes = await authenticateUser('haryak@admin.com', 'Haryak@123', 'ADMIN')
      expect(defaultRes.success).toBe(false)

      // Configured credentials authenticate
      const customRes = await authenticateUser(
        'custom-admin@enterprise.internal',
        'CustomStrongSecret2026!',
        'ADMIN'
      )
      expect(customRes.success).toBe(true)
      expect(customRes.user?.mustChangeCredentials).toBe(true)
      expect(customRes.redirectUrl).toBe('/first-login/change-credentials')
    })
  })

  describe('Forced Reset Access Lockdown (Middleware & Company Resolver)', () => {
    it('middleware redirects users with must_change_credentials: true away from /dashboard', async () => {
      const request = new NextRequest('http://localhost:3000/dashboard', {
        headers: {
          cookie: `haryak_session=${encodeURIComponent(JSON.stringify({
            user: { id: 'admin-1', email: 'haryak@admin.com', role: 'SUPER_ADMIN' },
            mustChangeCredentials: true,
          }))}`,
        },
      })

      const response = await updateSession(request)
      expect(response.status).toBe(307)
      expect(response.headers.get('location')).toBe('http://localhost:3000/first-login/change-credentials')
    })

    it('middleware permits un-reset users to access /first-login/change-credentials', async () => {
      const request = new NextRequest('http://localhost:3000/first-login/change-credentials', {
        headers: {
          cookie: `haryak_session=${encodeURIComponent(JSON.stringify({
            user: { id: 'admin-1', email: 'haryak@admin.com', role: 'SUPER_ADMIN' },
            mustChangeCredentials: true,
          }))}`,
        },
      })

      const response = await updateSession(request)
      expect(response.status).not.toBe(307)
    })

    it('middleware permits un-reset users to access /api/auth/first-login/admin', async () => {
      const request = new NextRequest('http://localhost:3000/api/auth/first-login/admin', {
        headers: {
          cookie: `haryak_session=${encodeURIComponent(JSON.stringify({
            user: { id: 'admin-1', email: 'haryak@admin.com', role: 'SUPER_ADMIN' },
            mustChangeCredentials: true,
          }))}`,
        },
      })

      const response = await updateSession(request)
      expect(response.status).not.toBe(307)
    })

    it('resolveRequestContext locks down protected APIs with HTTP 403 CREDENTIALS_CHANGE_REQUIRED when mustChangeCredentials is true', async () => {
      mockGetUser.mockResolvedValue({
        data: {
          user: {
            id: 'admin-auth-id-1',
            email: 'haryak@admin.com',
            user_metadata: { must_change_credentials: true },
          },
        },
        error: null,
      })

      mockAdminFrom.mockImplementation((table: string) => {
        if (table === 'users') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: 'admin-auth-id-1',
                    company_id: 'comp-1',
                    email: 'haryak@admin.com',
                    is_active: true,
                    must_change_password: true,
                  },
                  error: null,
                }),
              })),
            })),
          }
        }
        return {}
      })

      const result = await resolveRequestContext()
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.status).toBe(403)
        expect(result.error.code).toBe('CREDENTIALS_CHANGE_REQUIRED')
      }
    })
  })

  describe('updateInitialAdminCredentials Flow', () => {
    it('rejects password shorter than 8 characters', async () => {
      const res = await updateInitialAdminCredentials('Haryak@123', 'newadmin@haryak.com', 'Ab1!')
      expect(res.success).toBe(false)
      expect(res.error).toBe('New password must be at least 8 characters long.')
    })

    it('rejects password that does not meet complexity criteria', async () => {
      const res = await updateInitialAdminCredentials('Haryak@123', 'newadmin@haryak.com', 'simplelowercase123')
      expect(res.success).toBe(false)
      expect(res.error).toBe('Password must include uppercase, lowercase, number, and special character.')
    })

    it('rejects new password identical to current password', async () => {
      const res = await updateInitialAdminCredentials('Haryak@123', 'newadmin@haryak.com', 'Haryak@123')
      expect(res.success).toBe(false)
      expect(res.error).toBe('New password must be different from current password.')
    })

    it('rejects incorrect temporary password with actionable message', async () => {
      const res = await updateInitialAdminCredentials('WrongTempPass1!', 'newadmin@haryak.com', 'NewSecureAdmin2026!#')
      expect(res.success).toBe(false)
      expect(res.error).toBe('Current temporary password is incorrect.')
    })

    it('successfully processes valid credential change in offline/fallback mode', async () => {
      const res = await updateInitialAdminCredentials('Haryak@123', 'newadmin@haryak.com', 'NewSecureAdmin2026!#')
      expect(res.success).toBe(true)
      expect(res.user?.email).toBe('newadmin@haryak.com')
      expect(res.user?.mustChangeCredentials).toBe(false)
      expect(res.user?.roles).toContain(ROLES.SUPER_ADMIN)
    })
  })

  describe('resolveBootstrapAdminContext Authorization & Isolation', () => {
    it('rejects employee account from bootstrap admin flow with privileges required error', async () => {
      const employeeUser = {
        id: 'employee-auth-id-123',
        email: 'employee@haryak.com',
        user_metadata: {
          role: ROLES.EMPLOYEE,
          employee_id: 'emp-123',
          employee_code: 'HRK-002',
        },
      }

      mockAdminFrom.mockImplementation((table: string) => {
        if (table === 'users') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: 'employee-auth-id-123',
                    company_id: 'comp-1',
                    employee_id: 'emp-123',
                    email: 'employee@haryak.com',
                    is_active: true,
                  },
                  error: null,
                }),
              })),
            })),
          }
        }
        if (table === 'user_roles') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn().mockResolvedValue({
                data: [{ role_id: 'role-emp', roles: { id: 'role-emp', name: ROLES.EMPLOYEE } }],
                error: null,
              }),
            })),
          }
        }
        return {}
      })

      const res = await resolveBootstrapAdminContext(employeeUser)
      expect(res.context).toBeUndefined()
      expect(res.error).toContain('Administrator privileges are required')
    })

    it('authorizes bootstrap admin whose email matches BOOTSTRAP_ADMIN_EMAIL', async () => {
      process.env.BOOTSTRAP_ADMIN_EMAIL = 'admin@haryak.com'

      const adminUser = {
        id: 'bootstrap-admin-id-456',
        email: 'admin@haryak.com',
        user_metadata: {
          must_change_credentials: true,
        },
      }

      mockAdminFrom.mockImplementation((table: string) => {
        if (table === 'users') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: 'bootstrap-admin-id-456',
                    company_id: 'comp-1',
                    employee_id: null,
                    email: 'admin@haryak.com',
                    is_active: true,
                    must_change_password: true,
                  },
                  error: null,
                }),
              })),
            })),
            upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
          }
        }
        if (table === 'user_roles') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn().mockResolvedValue({
                data: [],
                error: null,
              }),
            })),
            upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
          }
        }
        if (table === 'roles') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: 'role-super-admin-id', name: ROLES.SUPER_ADMIN },
                    error: null,
                  }),
                })),
              })),
            })),
          }
        }
        return {}
      })

      const res = await resolveBootstrapAdminContext(adminUser)
      expect(res.error).toBeUndefined()
      expect(res.context).toBeDefined()
      expect(res.context?.roles).toContain(ROLES.SUPER_ADMIN)
      expect(res.context?.currentEmail).toBe('admin@haryak.com')
    })
  })
})
