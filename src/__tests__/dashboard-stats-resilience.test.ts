import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Hoist mocks
const {
  mockResolveRequestContext,
  mockCreateAdminClient,
  mockIsSupabaseConfigured,
} = vi.hoisted(() => {
  return {
    mockResolveRequestContext: vi.fn(),
    mockCreateAdminClient: vi.fn(),
    mockIsSupabaseConfigured: vi.fn(),
  }
})

vi.mock('@/lib/services/company-resolver', () => ({
  resolveRequestContext: mockResolveRequestContext,
}))

vi.mock('@/lib/supabase/admin', () => ({
  isSupabaseConfigured: mockIsSupabaseConfigured,
  createAdminClient: mockCreateAdminClient,
}))

// Import route handler after mocks
import { GET as getDashboardStats } from '@/app/api/dashboard/stats/route'

describe('Dashboard Statistics API Resilience & Security Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsSupabaseConfigured.mockReturnValue(true)
  })

  it('1. Unauthenticated request: returns HTTP 401', async () => {
    mockResolveRequestContext.mockResolvedValue({
      ok: false,
      error: {
        status: 401,
        code: 'UNAUTHENTICATED',
        message: 'Authentication required. Please log in.',
      },
    })

    const response = await getDashboardStats()
    expect(response.status).toBe(401)
    const json = await response.json()
    expect(json.success).toBe(false)
    expect(json.error).toBe('Authentication required. Please log in.')
  })

  it('2. Authenticated employee without admin permission: returns HTTP 403', async () => {
    mockResolveRequestContext.mockResolvedValue({
      ok: true,
      context: {
        companyId: 'comp-123',
        authUserId: 'emp-user-1',
        email: 'employee@haryak.com',
        fullName: 'Employee One',
        roles: ['EMPLOYEE'],
      },
    })

    const response = await getDashboardStats()
    expect(response.status).toBe(403)
    const json = await response.json()
    expect(json.success).toBe(false)
    expect(json.error).toContain('Administrator privileges required')
  })

  it('3. Forced reset restriction: returns HTTP 403 CREDENTIALS_CHANGE_REQUIRED', async () => {
    mockResolveRequestContext.mockResolvedValue({
      ok: false,
      error: {
        status: 403,
        code: 'CREDENTIALS_CHANGE_REQUIRED',
        message: 'You must update your administrator credentials before accessing system resources.',
      },
    })

    const response = await getDashboardStats()
    expect(response.status).toBe(403)
    const json = await response.json()
    expect(json.success).toBe(false)
    expect(json.error).toContain('update your administrator credentials')
  })

  it('4. Missing profile or company relationship: returns HTTP 403 with appropriate error', async () => {
    mockResolveRequestContext.mockResolvedValue({
      ok: false,
      error: {
        status: 403,
        code: 'NO_COMPANY',
        message: 'No company association found. Contact HR administrator.',
      },
    })

    const response = await getDashboardStats()
    expect(response.status).toBe(403)
    const json = await response.json()
    expect(json.success).toBe(false)
    expect(json.error).toBe('No company association found. Contact HR administrator.')
  })

  it('5. Valid Super Admin with empty database (0 employees, 0 records): returns safe zero baseline', async () => {
    mockResolveRequestContext.mockResolvedValue({
      ok: true,
      context: {
        companyId: 'comp-fresh-db',
        authUserId: 'admin-super-1',
        email: 'admin@haryak.com',
        fullName: 'Super Administrator',
        roles: ['SUPER_ADMIN'],
      },
    })

    const mockAdmin = {
      from: vi.fn((table: string) => {
        if (table === 'employees') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn().mockResolvedValue({ data: [], error: null }),
              })),
            })),
          }
        }
        if (table === 'leave_requests') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn().mockResolvedValue({ count: 0, error: null }),
              })),
            })),
          }
        }
        if (table === 'timesheets') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                in: vi.fn().mockResolvedValue({ count: 0, error: null }),
              })),
            })),
          }
        }
        if (table === 'payroll_periods') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    order: vi.fn(() => ({
                      limit: vi.fn(() => ({
                        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                      })),
                    })),
                  })),
                })),
              })),
            })),
          }
        }
        if (table === 'audit_logs') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => ({
                  limit: vi.fn().mockResolvedValue({ data: [], error: null }),
                })),
              })),
            })),
          }
        }
        return {}
      }),
    }

    mockCreateAdminClient.mockReturnValue(mockAdmin)

    const response = await getDashboardStats()
    expect(response.status).toBe(200)
    const json = await response.json()
    expect(json.success).toBe(true)
    expect(json.stats).toEqual({
      totalEmployees: 0,
      activeEmployees: 0,
      onLeaveToday: 0,
      pendingApprovals: 0,
      estimatedGross: 0,
      monthlyPayrollCost: 0,
      estimatedDeductions: 0,
      estimatedNet: 0,
      status: 'NOT_STARTED',
      departments: [],
      recentActivity: [],
    })
  })

  it('6. Database query failure resilience: individual query errors do not crash route with 500', async () => {
    mockResolveRequestContext.mockResolvedValue({
      ok: true,
      context: {
        companyId: 'comp-partial-db',
        authUserId: 'admin-super-1',
        email: 'admin@haryak.com',
        fullName: 'Super Administrator',
        roles: ['SUPER_ADMIN'],
      },
    })

    const mockAdmin = {
      from: vi.fn((table: string) => {
        if (table === 'employees') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn().mockResolvedValue({
                  data: [
                    {
                      id: 'emp-1',
                      department_id: 'dept-1',
                      employment_status: 'active',
                      is_active: true,
                      departments: { name: 'Engineering' },
                    },
                  ],
                  error: null,
                }),
              })),
            })),
          }
        }
        if (table === 'leave_requests') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  lte: vi.fn(() => ({
                    gte: vi.fn().mockResolvedValue({
                      data: null,
                      error: { message: 'Database connection timeout' },
                    }),
                  })),
                })),
              })),
            })),
          }
        }
        if (table === 'timesheets') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                in: vi.fn().mockResolvedValue({
                  count: null,
                  error: { message: 'Table lock timeout' },
                }),
              })),
            })),
          }
        }
        if (table === 'payroll_periods') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    order: vi.fn(() => ({
                      limit: vi.fn(() => ({
                        maybeSingle: vi.fn().mockResolvedValue({
                          data: null,
                          error: { message: 'Transient query failure' },
                        }),
                      })),
                    })),
                  })),
                })),
              })),
            })),
          }
        }
        if (table === 'salary_structures') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn().mockResolvedValue({
                  data: [{ monthly_gross: '75000', employee_id: 'emp-1' }],
                  error: null,
                }),
              })),
            })),
          }
        }
        if (table === 'audit_logs') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => ({
                  limit: vi.fn().mockResolvedValue({
                    data: null,
                    error: { message: 'Audit table transient error' },
                  }),
                })),
              })),
            })),
          }
        }
        return {}
      }),
    }

    mockCreateAdminClient.mockReturnValue(mockAdmin)

    const response = await getDashboardStats()
    expect(response.status).toBe(200)
    const json = await response.json()
    expect(json.success).toBe(true)
    expect(json.stats.totalEmployees).toBe(1)
    expect(json.stats.estimatedGross).toBe(75000)
    expect(json.stats.departments).toEqual([
      { name: 'Engineering', count: 1, percentage: 100, color: 'bg-[#1e2a78]' },
    ])
    // Handled gracefully without 500
    expect(json.stats.onLeaveToday).toBe(0)
    expect(json.stats.pendingApprovals).toBe(0)
    expect(json.stats.recentActivity).toEqual([])
  })

  it('7. Unexpected server crash: returns sanitized structured HTTP 500 without leaking stack or secrets', async () => {
    mockResolveRequestContext.mockImplementation(() => {
      throw new Error('FATAL: Database connection pool exhausted with secret_service_key_xyz')
    })

    const response = await getDashboardStats()
    expect(response.status).toBe(500)
    const json = await response.json()
    expect(json.success).toBe(false)
    // Never leak raw internal errors or keys to client
    expect(json.error).toBe('Unable to load dashboard statistics. Please try again later.')
    expect(json.error).not.toContain('secret_service_key_xyz')
    expect(json.stats).toBeDefined()
    expect(json.stats.totalEmployees).toBe(0)
  })
})
