/**
 * HARYAK TECHNOLOGIES INDIA PRIVATE LIMITED
 * Enterprise Authentication & Identity Service
 *
 * Supports:
 * - Direct Administrator email login
 * - Employee ID login (e.g. HRK-001)
 * - Official company email login
 * - Real Supabase Auth as the identity provider
 * - HRMS role resolution from public.users -> user_roles -> roles
 * - Unique temporary employee passwords
 * - Forced first-login password change
 * - Secure admin password reset compatibility
 * - Generic authentication failures where appropriate
 *
 * IMPORTANT:
 * - Supabase Auth establishes identity.
 * - public.user_roles / public.roles establish HRMS authorization.
 * - Never default failed authorization to EMPLOYEE.
 * - Super Admin is allowed to have public.users.employee_id = NULL.
 */

import crypto from 'node:crypto'

import {
  createClient as createServerSupabase,
  type SupabaseCookieToSet,
} from '@/lib/supabase/server'
import {
  createAdminClient,
  isSupabaseConfigured,
  isSupabaseReachable,
} from '@/lib/supabase/admin'
import { createAuditLog } from '@/lib/services/audit-service'
import { ROLES } from '@/lib/constants'
import { passwordComplexityRegex } from '@/lib/validations/auth'

export interface AuthResult {
  success: boolean
  error?: string
  user?: {
    id: string
    email: string
    fullName: string
    employeeCode?: string
    roles: string[]
    mustChangeCredentials?: boolean
    mustChangePassword?: boolean
  }
  redirectUrl?: string
}

export interface AuthenticatedUserContext {
  authUserId: string
  applicationUserId: string
  companyId: string
  email: string
  fullName: string
  roles: string[]
  employeeId: string | null
  isActive: boolean
}

export interface AccountSecurityState {
  email: string
  employeeCode?: string
  roles: string[]
  fullName: string
  mustChangeCredentials?: boolean
  mustChangePassword?: boolean
  isActive: boolean
}

/**
 * Normalizes login identifier into:
 * - employee_id
 * - email
 */
export function normalizeIdentifier(rawIdentifier: string): {
  type: 'employee_id' | 'email'
  normalized: string
} {
  const trimmed = rawIdentifier.trim()

  if (trimmed.includes('@')) {
    return {
      type: 'email',
      normalized: trimmed.toLowerCase(),
    }
  }

  let code = trimmed.toUpperCase()

  if (/^\d+$/.test(code)) {
    code = `HRK-${code.padStart(3, '0')}`
  } else if (!code.startsWith('HRK-') && code.startsWith('HRK')) {
    const numericPart = code.replace('HRK', '').replace('-', '').trim()

    if (/^\d+$/.test(numericPart)) {
      code = `HRK-${numericPart.padStart(3, '0')}`
    } else {
      code = `HRK-${numericPart}`
    }
  }

  return {
    type: 'employee_id',
    normalized: code,
  }
}

/**
 * Cryptographically secure temporary password.
 *
 * Does not use:
 * - Math.random()
 * - employee ID
 * - DOB
 * - phone number
 * - static company password
 */
export function generateTemporaryPassword(): string {
  const uppercase = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const lowercase = 'abcdefghjkmnpqrstuvwxyz'
  const numbers = '23456789'
  const symbols = '@#$%&*!'

  const randomChar = (chars: string): string => {
    const byte = crypto.randomBytes(1)[0]
    return chars[byte % chars.length]
  }

  const chars: string[] = [
    randomChar(uppercase),
    randomChar(uppercase),
    randomChar(uppercase),

    randomChar(lowercase),
    randomChar(lowercase),
    randomChar(lowercase),
    randomChar(lowercase),
    randomChar(lowercase),

    randomChar(numbers),
    randomChar(numbers),
    randomChar(numbers),

    randomChar(symbols),
    randomChar(symbols),
  ]

  // Crypto-safe Fisher-Yates shuffle
  for (let i = chars.length - 1; i > 0; i--) {
    const byte = crypto.randomBytes(1)[0]
    const j = byte % (i + 1)

    const temp = chars[i]
    chars[i] = chars[j]
    chars[j] = temp
  }

  return `Hrk@${chars.join('')}`
}

/**
 * Resolve the application authorization context for a Supabase Auth user.
 *
 * IMPORTANT:
 * public.users.id is the Supabase Auth UID in the current Haryak schema.
 *
 * Authorization:
 * auth.users.id
 *   -> public.users.id
 *   -> public.user_roles.user_id
 *   -> public.roles.id
 */
export async function resolveAuthenticatedUserContext(
  authUserId: string
): Promise<AuthenticatedUserContext | null> {
  const adminClient = createAdminClient()

  if (!adminClient) {
    return null
  }

  const { data: appUser, error: appUserError } = await adminClient
    .from('users')
    .select(`
      id,
      company_id,
      employee_id,
      email,
      full_name,
      is_active
    `)
    .eq('id', authUserId)
    .maybeSingle()

  if (appUserError) {
    console.error(
      '[AUTH] Failed to resolve public.users:',
      appUserError.message
    )
    return null
  }

  if (!appUser) {
    return null
  }

  const { data: userRoles, error: rolesError } = await adminClient
    .from('user_roles')
    .select(`
      role_id,
      roles (
        id,
        name,
        display_name,
        company_id
      )
    `)
    .eq('user_id', authUserId)

  if (rolesError) {
    console.error(
      '[AUTH] Failed to resolve user roles:',
      rolesError.message
    )
    return null
  }

  const roles =
    userRoles
      ?.map((row: any) => row.roles?.name)
      .filter(
        (role: unknown): role is string =>
          typeof role === 'string' && role.length > 0
      ) ?? []

  return {
    authUserId,
    applicationUserId: appUser.id,
    companyId: appUser.company_id,
    email: appUser.email,
    fullName: appUser.full_name,
    roles,
    employeeId: appUser.employee_id ?? null,
    isActive: Boolean(appUser.is_active),
  }
}

/**
 * Resolve Employee ID to official company email.
 *
 * Employee login must not silently use a random personal email.
 */
async function resolveEmployeeOfficialEmail(
  employeeCode: string
): Promise<{
  email: string | null
  employeeCode: string
}> {
  const adminClient = createAdminClient()

  if (!adminClient) {
    return {
      email: null,
      employeeCode,
    }
  }

  const { data: employee, error } = await adminClient
    .from('employees')
    .select(`
      id,
      employee_code,
      official_email,
      is_active,
      employment_status
    `)
    .eq('employee_code', employeeCode)
    .maybeSingle()

  if (error) {
    console.error(
      '[AUTH] Employee lookup failed:',
      error.message
    )

    return {
      email: null,
      employeeCode,
    }
  }

  if (!employee) {
    return {
      email: null,
      employeeCode,
    }
  }

  const active =
    Boolean(employee.is_active) &&
    employee.employment_status === 'active'

  if (!active) {
    return {
      email: null,
      employeeCode,
    }
  }

  return {
    email: employee.official_email ?? null,
    employeeCode: employee.employee_code,
  }
}

/**
 * Check if at least one active Super Admin exists in the database.
 */
export async function checkSuperAdminExists(adminClient: any): Promise<boolean> {
  if (!adminClient) return true

  try {
    if (typeof adminClient.rpc === 'function') {
      const { data: rpcExists, error: rpcError } = await adminClient.rpc('has_active_super_admin')
      if (!rpcError && typeof rpcExists === 'boolean') {
        return rpcExists
      }
    }

    const { data: userRoles, error } = await adminClient
      .from('user_roles')
      .select(`
        user_id,
        users!inner(id, is_active),
        roles!inner(name)
      `)
      .eq('roles.name', ROLES.SUPER_ADMIN)
      .eq('users.is_active', true)
      .limit(1)

    if (!error && userRoles && userRoles.length > 0) {
      return true
    }
    return false
  } catch (err) {
    console.error('[AUTH] Super Admin existence check error:', err)
    return true
  }
}

/**
 * Bootstrap the initial Super Administrator account when database is empty / reset.
 * Idempotent, concurrency-safe, and restores missing auth or database links.
 */
export async function bootstrapInitialSuperAdmin(
  adminClient: any,
  bootstrapEmail: string,
  bootstrapPassword: string
): Promise<{ authUserId: string; companyId: string }> {
  if (!adminClient) {
    throw new Error('Database service unavailable for initial administrator bootstrap.')
  }

  // Concurrency check: double-check that no active Super Admin exists
  const alreadyExists = await checkSuperAdminExists(adminClient)
  if (alreadyExists) {
    throw new Error('System bootstrap is not permitted: active Super Administrator already exists.')
  }

  // 1. Resolve or create default company
  let { data: company } = await adminClient
    .from('companies')
    .select('id, name')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!company) {
    const { data: newCompany, error: compErr } = await adminClient
      .from('companies')
      .insert({
        name: 'Haryak Technologies India Private Limited',
        legal_name: 'Haryak Technologies India Private Limited',
        email: 'info@haryak.com',
        country: 'India',
        currency: 'INR',
        timezone: 'Asia/Kolkata',
        employee_id_prefix: 'HRK',
      })
      .select('id, name')
      .single()

    if (compErr || !newCompany) {
      throw new Error(`Failed to initialize company record: ${compErr?.message}`)
    }
    company = newCompany
  }

  const companyId = company.id

  // 2. Resolve or create system roles
  const standardRoles = [
    { name: ROLES.SUPER_ADMIN, display_name: 'Super Administrator', is_system: true, description: 'Full system and company control' },
    { name: ROLES.HR_ADMIN, display_name: 'HR Administrator', is_system: true, description: 'Human resources and employee operations' },
    { name: ROLES.PAYROLL_ADMIN, display_name: 'Payroll Administrator', is_system: true, description: 'Payroll runs and compensation structures' },
    { name: ROLES.EMPLOYEE, display_name: 'Employee', is_system: true, description: 'Standard employee portal access' },
    { name: ROLES.MANAGER, display_name: 'Manager', is_system: true, description: 'Department and team management' },
  ]

  for (const roleDef of standardRoles) {
    await adminClient
      .from('roles')
      .upsert(
        {
          company_id: companyId,
          name: roleDef.name,
          display_name: roleDef.display_name,
          is_system: roleDef.is_system,
          description: roleDef.description,
        },
        { onConflict: 'company_id,name' }
      )
  }

  const { data: superAdminRole, error: roleErr } = await adminClient
    .from('roles')
    .select('id')
    .eq('company_id', companyId)
    .eq('name', ROLES.SUPER_ADMIN)
    .single()

  if (roleErr || !superAdminRole) {
    throw new Error(`Failed to resolve SUPER_ADMIN role: ${roleErr?.message}`)
  }

  // 3. Supabase Auth user management (with recovery for leftover Auth users)
  let authUserId: string | null = null

  const { data: existingUserList } = await adminClient.auth.admin.listUsers()
  const existingAuthUser = existingUserList?.users?.find(
    (u: any) => u.email?.trim().toLowerCase() === bootstrapEmail.trim().toLowerCase()
  )

  if (existingAuthUser) {
    // Leftover Auth user exists from prior run before database reset
    authUserId = existingAuthUser.id
    const { error: syncErr } = await adminClient.auth.admin.updateUserById(authUserId, {
      password: bootstrapPassword,
      email_confirm: true,
      user_metadata: {
        full_name: 'Super Administrator',
        role: ROLES.SUPER_ADMIN,
        must_change_credentials: true,
      },
    })
    if (syncErr) {
      throw new Error(`Failed to synchronize leftover Auth user: ${syncErr.message}`)
    }
  } else {
    // Create new Supabase Auth user
    const { data: newAuthData, error: createAuthErr } = await adminClient.auth.admin.createUser({
      email: bootstrapEmail,
      password: bootstrapPassword,
      email_confirm: true,
      user_metadata: {
        full_name: 'Super Administrator',
        role: ROLES.SUPER_ADMIN,
        must_change_credentials: true,
      },
    })
    if (createAuthErr || !newAuthData?.user) {
      throw new Error(`Failed to create initial Auth user: ${createAuthErr?.message}`)
    }
    authUserId = newAuthData.user.id
  }

  if (!authUserId) {
    throw new Error('Failed to resolve or create auth user ID for initial administrator.')
  }

  // 4. Configure application user in public.users
  const { error: userUpsertErr } = await adminClient
    .from('users')
    .upsert(
      {
        id: authUserId,
        company_id: companyId,
        email: bootstrapEmail.trim().toLowerCase(),
        full_name: 'Super Administrator',
        is_active: true,
        employee_id: null,
        must_change_password: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    )

  if (userUpsertErr) {
    throw new Error(`Failed to create application user record: ${userUpsertErr.message}`)
  }

  // 5. Assign SUPER_ADMIN role in public.user_roles
  const { error: roleAssignErr } = await adminClient
    .from('user_roles')
    .upsert(
      {
        user_id: authUserId,
        role_id: superAdminRole.id,
        assigned_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,role_id' }
    )

  if (roleAssignErr) {
    throw new Error(`Failed to assign SUPER_ADMIN role: ${roleAssignErr.message}`)
  }

  // 6. Record auditable bootstrap completion
  try {
    await createAuditLog({
      companyId,
      userId: authUserId,
      userEmail: bootstrapEmail.trim().toLowerCase(),
      userName: 'Super Administrator',
      action: 'created',
      entityType: 'user',
      description: 'Initial Super Admin account successfully bootstrapped with forced credentials update.',
      reason: 'INITIAL_SYSTEM_BOOTSTRAP',
    })
  } catch {
    // Audit logging is non-fatal for bootstrap completion
  }

  return { authUserId, companyId }
}

/**
 * Main login handler.
 *
 * Supabase Auth establishes the authenticated identity.
 * public.users + user_roles + roles establish HRMS authorization.
 *
 * The onSetCookies callback allows the login Route Handler to capture
 * the exact Supabase SSR cookies produced during signInWithPassword()
 * and attach them to the final browser response.
 */
export async function authenticateUser(
  identifier: string,
  password: string,
  mode?: 'ADMIN' | 'EMPLOYEE',
  onSetCookies?: (
    cookies: SupabaseCookieToSet[]
  ) => void
): Promise<AuthResult> {
  const genericError =
    'Invalid Employee ID/email or password.'

  const serverUnavailableError =
    'Authentication service is temporarily unavailable.'

  /* ============================================================
     BASIC VALIDATION
     ============================================================ */

  if (
    !identifier ||
    !password
  ) {
    return {
      success: false,
      error: genericError,
    }
  }

  /* ============================================================
     NORMALIZE LOGIN IDENTIFIER
     ============================================================ */

  const normalized =
    normalizeIdentifier(
      identifier
    )

  /**
   * Administrator login must use email.
   */
  if (
    mode === 'ADMIN' &&
    normalized.type ===
      'employee_id'
  ) {
    return {
      success: false,
      error:
        'Employee ID is not accepted in Administrator Login. Please enter your administrator email or switch to Employee Login.',
    }
  }

  let targetEmail =
    normalized.normalized

  let employeeCode:
    string | undefined

  /* ============================================================
     EMPLOYEE ID -> OFFICIAL COMPANY EMAIL
     ============================================================ */

  if (
    normalized.type ===
    'employee_id'
  ) {
    const employeeIdentity =
      await resolveEmployeeOfficialEmail(
        normalized.normalized
      )

    employeeCode =
      employeeIdentity.employeeCode

    if (
      !employeeIdentity.email
    ) {
      return {
        success: false,
        error:
          'Employee account has no registered official company email or is not active. Please contact HR Administrator.',
      }
    }

    targetEmail =
      employeeIdentity.email
        .trim()
        .toLowerCase()
  }

  const configuredBootstrapEmail = (process.env.BOOTSTRAP_ADMIN_EMAIL || 'haryak@admin.com').trim().toLowerCase()
  const configuredBootstrapPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD || 'Haryak@123'
  const isBootstrapCandidate = (mode === 'ADMIN' || !mode) && targetEmail.toLowerCase() === configuredBootstrapEmail

  const isConfigured = isSupabaseConfigured()
  const isReachable = isConfigured ? await isSupabaseReachable() : false

  // Fallback for offline / headless test environment
  if (!isConfigured || !isReachable) {
    if (isBootstrapCandidate) {
      if (password === configuredBootstrapPassword) {
        return {
          success: true,
          user: {
            id: 'bootstrap-super-admin-mock-id',
            email: configuredBootstrapEmail,
            fullName: 'Super Administrator',
            roles: [ROLES.SUPER_ADMIN],
            mustChangeCredentials: true,
          },
          redirectUrl: '/first-login/change-credentials',
        }
      }
      return {
        success: false,
        error: genericError,
      }
    }

    return {
      success: false,
      error: genericError,
    }
  }

  try {
    const adminClient = createAdminClient()

    /* ============================================================
       INITIAL SUPER ADMIN BOOTSTRAP (ONLY IF NO SUPER ADMIN EXISTS)
       ============================================================ */
    if (isBootstrapCandidate && adminClient) {
      const superAdminExists = await checkSuperAdminExists(adminClient)

      if (!superAdminExists) {
        if (password !== configuredBootstrapPassword) {
          return {
            success: false,
            error: genericError,
          }
        }

        try {
          const bootstrapResult = await bootstrapInitialSuperAdmin(
            adminClient,
            configuredBootstrapEmail,
            configuredBootstrapPassword
          )

          const supabase = await createServerSupabase({ onSetCookies })
          await supabase.auth.signInWithPassword({
            email: configuredBootstrapEmail,
            password: configuredBootstrapPassword,
          })

          return {
            success: true,
            user: {
              id: bootstrapResult.authUserId,
              email: configuredBootstrapEmail,
              fullName: 'Super Administrator',
              roles: [ROLES.SUPER_ADMIN],
              mustChangeCredentials: true,
            },
            redirectUrl: '/first-login/change-credentials',
          }
        } catch (bootErr: any) {
          console.error('[AUTH] Initial admin bootstrap failure:', bootErr)
          return {
            success: false,
            error: 'Initial administration setup failed. Please contact support.',
          }
        }
      }
    }

    /* ============================================================
       CREATE COOKIE-AWARE SUPABASE SERVER CLIENT
       ============================================================ */

    /**
     * CRITICAL:
     *
     * onSetCookies receives the exact authentication cookies generated
     * by @supabase/ssr.
     *
     * The login API will attach these cookies to its NextResponse.
     */
    const supabase =
      await createServerSupabase({
        onSetCookies,
      })

    /* ============================================================
       SUPABASE AUTHENTICATION
       ============================================================ */

    const {
      data:
        authData,

      error:
        authError,
    } =
      await supabase.auth
        .signInWithPassword({
          email:
            targetEmail,

          password,
        })

    if (
      authError ||
      !authData.user
    ) {
      if (
        process.env.NODE_ENV !==
        'production'
      ) {
        console.warn(
          '[AUTH] Supabase sign-in failed:',
          authError?.message ||
            'No auth user returned'
        )
      }

      return {
        success: false,
        error: genericError,
      }
    }

    const authUser =
      authData.user

    /* ============================================================
       APPLICATION AUTHORIZATION CONTEXT
       ============================================================ */

    const context =
      await resolveAuthenticatedUserContext(
        authUser.id
      )

    if (!context) {
      /**
       * Authentication succeeded, but this identity has no valid
       * HRMS application profile.
       *
       * Remove the Supabase session to prevent partial access.
       */
      await supabase.auth
        .signOut()

      return {
        success: false,

        error:
          'Account is authenticated but is not configured in the HRMS.',
      }
    }

    /* ============================================================
       ACTIVE ACCOUNT CHECK
       ============================================================ */

    if (
      !context.isActive
    ) {
      await supabase.auth
        .signOut()

      return {
        success: false,

        error:
          'This account is inactive. Please contact the administrator.',
      }
    }

    /* ============================================================
       ROLE CHECK
       ============================================================ */

    /**
     * Never silently default a user with no role to EMPLOYEE.
     */
    if (
      context.roles.length ===
      0
    ) {
      await supabase.auth
        .signOut()

      return {
        success: false,

        error:
          'No HRMS role is assigned to this account.',
      }
    }

    const adminRoles = [
      ROLES.SUPER_ADMIN,
      ROLES.HR_ADMIN,
      ROLES.PAYROLL_ADMIN,
      'ADMINISTRATION',
    ]

    const isAdmin =
      context.roles.some(
        role =>
          adminRoles.includes(
            role
          )
      )

    const isEmployee =
      context.roles.includes(
        ROLES.EMPLOYEE
      )

    /* ============================================================
       ADMIN PORTAL AUTHORIZATION
       ============================================================ */

    if (
      mode === 'ADMIN' &&
      !isAdmin
    ) {
      await supabase.auth
        .signOut()

      return {
        success: false,

        error:
          'Access denied. This account does not have Administrator privileges. Please use the Employee Login tab.',
      }
    }

    /* ============================================================
       EMPLOYEE PORTAL AUTHORIZATION
       ============================================================ */

    if (
      mode ===
        'EMPLOYEE' &&
      !isEmployee
    ) {
      await supabase.auth
        .signOut()

      return {
        success: false,

        error:
          'This account does not have Employee Portal access. Please use the Administrator Login tab.',
      }
    }

    /**
     * Employee portal users must have an actual canonical employee
     * relationship.
     *
     * This prevents a user with only an EMPLOYEE role but no employee
     * master link from entering employee self-service.
     */
    if (
      mode ===
        'EMPLOYEE' &&
      !context.employeeId
    ) {
      await supabase.auth
        .signOut()

      return {
        success: false,

        error:
          'Your Employee Portal account is not linked to an employee profile. Please contact HR Administrator.',
      }
    }

    const userMetadata = authUser.user_metadata ?? {}

    // Determine Identity & Role Context
    const isEmployeeUser = isEmployee || Boolean(context.employeeId) || userMetadata.role === ROLES.EMPLOYEE
    const isBootstrapAdminCandidate = 
      isBootstrapCandidate ||
      authUser.email?.toLowerCase() === configuredBootstrapEmail ||
      authUser.email?.toLowerCase() === 'admin@haryak.com' ||
      authUser.email?.toLowerCase() === 'haryak@admin.com' ||
      userMetadata.role === ROLES.SUPER_ADMIN ||
      context.roles.includes(ROLES.SUPER_ADMIN)

    const rawMustChangeCredentials = Boolean(userMetadata.must_change_credentials)
    const rawMustChangePassword = Boolean(userMetadata.must_change_password)

    // For pure employee accounts, mustChangeCredentials is ALWAYS false (admin security setup is never for employees)
    // Any legacy or accidental must_change_credentials on an employee translates to mustChangePassword
    const resolvedMustChangeCredentials = (isEmployeeUser && !isAdmin)
      ? false
      : (isAdmin && isBootstrapAdminCandidate && rawMustChangeCredentials)

    const resolvedMustChangePassword = (isEmployeeUser && !isAdmin)
      ? Boolean(rawMustChangePassword || rawMustChangeCredentials)
      : (rawMustChangePassword && !resolvedMustChangeCredentials)

    /* ============================================================
       REDIRECT RESOLUTION
       ============================================================ */

    let redirectUrl: string

    if (isEmployeeUser && !isAdmin) {
      // Pure employee accounts: NEVER route to admin credentials change
      if (resolvedMustChangePassword) {
        redirectUrl = '/first-login/change-password'
      } else {
        redirectUrl = '/portal/home'
      }
    } else if (isAdmin) {
      // Administrator accounts
      if (resolvedMustChangeCredentials) {
        redirectUrl = '/first-login/change-credentials'
      } else if (resolvedMustChangePassword) {
        redirectUrl = '/first-login/change-password'
      } else {
        redirectUrl = '/dashboard'
      }
    } else if (isEmployee) {
      if (resolvedMustChangePassword) {
        redirectUrl = '/first-login/change-password'
      } else {
        redirectUrl = '/portal/home'
      }
    } else {
      /**
       * Defensive fallback.
       */
      await supabase.auth.signOut()

      return {
        success: false,
        error: 'No valid portal access is configured for this account.',
      }
    }

    /* ============================================================
       DEVELOPMENT DIAGNOSTICS
       ============================================================ */

    if (
      process.env.NODE_ENV !==
      'production'
    ) {
      console.log(
        '[AUTH ROLE RESOLUTION]',
        {
          authUserId:
            authUser.id,

          email:
            authUser.email,

          applicationUserId:
            context.applicationUserId,

          companyId:
            context.companyId,

          employeeId:
            context.employeeId,

          employeeLinked:
            Boolean(
              context.employeeId
            ),

          roles:
            context.roles,

          loginMode:
            mode,

          redirectUrl,

          sessionCreated:
            Boolean(
              authData.session
            ),
        }
      )
    }

    /* ============================================================
       SUCCESS
       ============================================================ */

    return {
      success: true,

      user: {
        id:
          authUser.id,

        email:
          authUser.email ??
          context.email ??
          targetEmail,

        fullName:
          context.fullName ||
          userMetadata.full_name ||
          'User',

        /**
         * If login used employee code, use resolved employee code.
         * Otherwise this may remain undefined.
         */
        employeeCode,

        roles:
          context.roles,

        mustChangeCredentials:
          resolvedMustChangeCredentials,

        mustChangePassword:
          resolvedMustChangePassword,
      },

      redirectUrl,
    }
  } catch (
    error
  ) {
    console.error(
      '[AUTH] Unexpected authentication error:',
      error
    )

    return {
      success: false,
      error:
        serverUnavailableError,
    }
  }
}

export interface BootstrapAdminContext {
  authUserId: string
  companyId: string
  currentEmail: string
  fullName: string
  roles: string[]
  isBootstrapAdmin: boolean
}

/**
 * Resolves and validates the authenticated administrator context for the initial bootstrap
 * credential change workflow.
 *
 * Verifies the caller's actual authenticated identity and bootstrap eligibility:
 * - Rejects unauthenticated callers with an actionable session expiration message.
 * - Rejects non-administrator accounts (e.g. employees) with an explicit privileges error.
 * - Validates administrator status across public.user_roles, user_metadata, and system bootstrap definitions.
 * - Self-heals company linkage and SUPER_ADMIN role assignment if database records were missing or desynchronized.
 */
export async function resolveBootstrapAdminContext(
  sessionUser: { id: string; email?: string; user_metadata?: any; app_metadata?: any }
): Promise<{
  context?: BootstrapAdminContext
  error?: string
}> {
  const adminClient = createAdminClient()
  if (!adminClient) {
    return { error: 'Authentication service is temporarily unavailable.' }
  }

  const authUserId = sessionUser.id
  const authEmail = (sessionUser.email || '').trim().toLowerCase()
  const userMetadata = sessionUser.user_metadata || {}
  const appMetadata = sessionUser.app_metadata || {}

  // 1. Guard against non-admin / employee accounts attempting bootstrap admin flow
  const isEmployeeClaim =
    userMetadata.role === ROLES.EMPLOYEE ||
    appMetadata.role === ROLES.EMPLOYEE ||
    Boolean(userMetadata.employee_id) ||
    Boolean(userMetadata.employee_code)

  // 2. Query application user and assigned roles
  const { data: appUser } = await adminClient
    .from('users')
    .select('id, company_id, employee_id, email, full_name, is_active, must_change_password')
    .eq('id', authUserId)
    .maybeSingle()

  const { data: userRoles } = await adminClient
    .from('user_roles')
    .select('role_id, roles ( id, name, display_name, company_id )')
    .eq('user_id', authUserId)

  const dbRoles = (userRoles ?? [])
    .map((row: any) => row.roles?.name)
    .filter((r: unknown): r is string => typeof r === 'string' && r.length > 0)

  // If user is clearly an employee with employee link and no admin roles in DB:
  if (
    isEmployeeClaim &&
    (appUser?.employee_id || dbRoles.includes(ROLES.EMPLOYEE)) &&
    !dbRoles.some((r) => [ROLES.SUPER_ADMIN, ROLES.HR_ADMIN, ROLES.PAYROLL_ADMIN, 'ADMINISTRATION'].includes(r)) &&
    userMetadata.role !== ROLES.SUPER_ADMIN
  ) {
    return {
      error: 'Administrator privileges are required. This security setup is only for system administrators.',
    }
  }

  // 3. Check Administrator / Bootstrap Eligibility
  const configuredBootstrapEmail = (process.env.BOOTSTRAP_ADMIN_EMAIL || 'admin@haryak.com').trim().toLowerCase()
  const fallbackBootstrapEmail = 'haryak@admin.com'
  const isBootstrapEmail = authEmail === configuredBootstrapEmail || authEmail === fallbackBootstrapEmail

  const metadataAdminRole =
    [ROLES.SUPER_ADMIN, ROLES.HR_ADMIN, ROLES.PAYROLL_ADMIN, 'ADMINISTRATION'].includes(userMetadata.role) ||
    [ROLES.SUPER_ADMIN, ROLES.HR_ADMIN, ROLES.PAYROLL_ADMIN, 'ADMINISTRATION'].includes(appMetadata.role)

  const dbAdminRole = dbRoles.some((r) =>
    [ROLES.SUPER_ADMIN, ROLES.HR_ADMIN, ROLES.PAYROLL_ADMIN, 'ADMINISTRATION'].includes(r)
  )

  const isBootstrapEligible =
    dbAdminRole ||
    metadataAdminRole ||
    isBootstrapEmail ||
    Boolean(userMetadata.must_change_credentials) ||
    Boolean(appUser?.must_change_password && !appUser?.employee_id)

  if (!isBootstrapEligible) {
    return {
      error: 'Administrator privileges are required.',
    }
  }

  // 4. Resolve or self-heal company association
  let companyId = appUser?.company_id
  if (!companyId) {
    const { data: defaultCompany } = await adminClient
      .from('companies')
      .select('id')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (defaultCompany) {
      companyId = defaultCompany.id
    } else {
      const { data: newCompany } = await adminClient
        .from('companies')
        .insert({
          name: 'Haryak Technologies India Private Limited',
          legal_name: 'Haryak Technologies India Private Limited',
          email: 'info@haryak.com',
          country: 'India',
          currency: 'INR',
          timezone: 'Asia/Kolkata',
          employee_id_prefix: 'HRK',
        })
        .select('id')
        .single()
      companyId = newCompany?.id
    }
  }

  if (!companyId) {
    return { error: 'Company association could not be established.' }
  }

  // 5. Ensure SUPER_ADMIN role exists and is assigned
  let superAdminRoleId: string | null = null
  const { data: existingRole } = await adminClient
    .from('roles')
    .select('id')
    .eq('company_id', companyId)
    .eq('name', ROLES.SUPER_ADMIN)
    .maybeSingle()

  if (existingRole) {
    superAdminRoleId = existingRole.id
  } else {
    const { data: createdRole } = await adminClient
      .from('roles')
      .insert({
        company_id: companyId,
        name: ROLES.SUPER_ADMIN,
        display_name: 'Super Administrator',
        is_system: true,
        description: 'Full system and company control',
      })
      .select('id')
      .single()
    superAdminRoleId = createdRole?.id
  }

  if (superAdminRoleId) {
    await adminClient
      .from('user_roles')
      .upsert(
        {
          user_id: authUserId,
          role_id: superAdminRoleId,
          assigned_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,role_id' }
      )
  }

  // 6. Ensure public.users record exists and is synchronized
  if (!appUser) {
    await adminClient
      .from('users')
      .upsert(
        {
          id: authUserId,
          company_id: companyId,
          email: authEmail,
          full_name: userMetadata.full_name || 'Super Administrator',
          is_active: true,
          employee_id: null,
          must_change_password: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      )
  }

  const effectiveRoles = Array.from(new Set([ROLES.SUPER_ADMIN, ...dbRoles]))

  return {
    context: {
      authUserId,
      companyId,
      currentEmail: authEmail,
      fullName: appUser?.full_name || userMetadata.full_name || 'Super Administrator',
      roles: effectiveRoles,
      isBootstrapAdmin: true,
    },
  }
}

/**
 * Update initial administrator credentials.
 *
 * Verifies current temporary bootstrap password, updates Supabase Auth email and password,
 * synchronizes public.users, preserves the administrator role in user_roles, logs audit event,
 * and re-authenticates to issue fresh SSR cookies.
 */
export async function updateInitialAdminCredentials(
  currentPassword: string,
  newEmail: string,
  newPassword: string,
  onSetCookies?: (cookies: SupabaseCookieToSet[]) => void
): Promise<{
  success: boolean
  error?: string
  user?: {
    id: string
    email: string
    fullName: string
    roles: string[]
    mustChangeCredentials?: boolean
  }
  cookiesToSet?: SupabaseCookieToSet[]
}> {
  if (newPassword.length < 8) {
    return {
      success: false,
      error: 'New password must be at least 8 characters long.',
    }
  }

  if (!passwordComplexityRegex.test(newPassword)) {
    return {
      success: false,
      error: 'Password must include uppercase, lowercase, number, and special character.',
    }
  }

  if (currentPassword === newPassword) {
    return {
      success: false,
      error: 'New password must be different from current password.',
    }
  }

  const normalizedNewEmail = newEmail.trim().toLowerCase()
  if (!normalizedNewEmail.includes('@') || !normalizedNewEmail.includes('.')) {
    return {
      success: false,
      error: 'Please enter a valid official email address.',
    }
  }

  const isConfigured = isSupabaseConfigured()
  const isReachable = isConfigured ? await isSupabaseReachable() : false

  // Fallback for offline / headless test environment
  if (!isConfigured || !isReachable) {
    const configuredBootstrapPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD || 'Haryak@123'
    if (currentPassword !== configuredBootstrapPassword) {
      return {
        success: false,
        error: 'Current temporary password is incorrect.',
      }
    }
    return {
      success: true,
      user: {
        id: 'bootstrap-super-admin-mock-id',
        email: normalizedNewEmail,
        fullName: 'Super Administrator',
        roles: [ROLES.SUPER_ADMIN],
        mustChangeCredentials: false,
      },
    }
  }

  try {
    const serverSupabase = await createServerSupabase({ onSetCookies })

    const {
      data: sessionData,
      error: sessionError,
    } = await serverSupabase.auth.getUser()

    if (sessionError || !sessionData?.user) {
      return {
        success: false,
        error: 'Your session has expired. Please sign in again with your temporary administrator credentials to continue.',
      }
    }

    const authUser = sessionData.user

    // Authorize administrator / bootstrap eligibility
    const { context, error: authzError } = await resolveBootstrapAdminContext(authUser)
    if (authzError || !context) {
      return {
        success: false,
        error: authzError || 'Administrator privileges are required.',
      }
    }

    const adminClient = createAdminClient()
    if (!adminClient) {
      return {
        success: false,
        error: 'Authentication service is temporarily unavailable.',
      }
    }

    // Check if new email is already taken by another account
    if (normalizedNewEmail !== context.currentEmail) {
      const { data: existingUser } = await adminClient
        .from('users')
        .select('id')
        .eq('email', normalizedNewEmail)
        .neq('id', context.authUserId)
        .maybeSingle()

      if (existingUser) {
        return {
          success: false,
          error: 'The new email address is already in use by another account.',
        }
      }
    }

    // Verify current temporary password
    const { error: signInError } = await serverSupabase.auth.signInWithPassword({
      email: context.currentEmail,
      password: currentPassword,
    })

    if (signInError) {
      return {
        success: false,
        error: 'Current temporary password is incorrect.',
      }
    }

    // Update Supabase Auth credentials and clear must_change flags
    const { error: updateAuthError } = await adminClient.auth.admin.updateUserById(
      context.authUserId,
      {
        email: normalizedNewEmail,
        password: newPassword,
        email_confirm: true,
        user_metadata: {
          ...(authUser.user_metadata ?? {}),
          full_name: context.fullName || 'Super Administrator',
          role: ROLES.SUPER_ADMIN,
          must_change_credentials: false,
          must_change_password: false,
        },
      }
    )

    if (updateAuthError) {
      const msg = updateAuthError.message.toLowerCase()
      if ((msg.includes('already') && msg.includes('registered')) || msg.includes('taken') || msg.includes('exists')) {
        return {
          success: false,
          error: 'The new email address is already in use by another account.',
        }
      }
      return {
        success: false,
        error: `Failed to update administrator credentials: ${updateAuthError.message}`,
      }
    }

    // Synchronize public.users
    const nowIso = new Date().toISOString()
    const { error: updateUserError } = await adminClient
      .from('users')
      .upsert(
        {
          id: context.authUserId,
          company_id: context.companyId,
          email: normalizedNewEmail,
          full_name: context.fullName || 'Super Administrator',
          is_active: true,
          employee_id: null,
          must_change_password: false,
          password_changed_at: nowIso,
          updated_at: nowIso,
        },
        { onConflict: 'id' }
      )

    if (updateUserError) {
      console.error('[AUTH] Failed to synchronize public.users:', updateUserError.message)
      return {
        success: false,
        error: 'Authentication credentials were updated, but the HRMS profile email could not be synchronized. Please contact the system administrator.',
      }
    }

    // Ensure the administrator account retains its required system/company administrator role
    let superAdminRoleId: string | null = null
    const { data: roleRow } = await adminClient
      .from('roles')
      .select('id')
      .eq('company_id', context.companyId)
      .eq('name', ROLES.SUPER_ADMIN)
      .maybeSingle()

    if (roleRow) {
      superAdminRoleId = roleRow.id
    }

    if (superAdminRoleId) {
      await adminClient
        .from('user_roles')
        .upsert(
          {
            user_id: context.authUserId,
            role_id: superAdminRoleId,
            assigned_at: nowIso,
          },
          { onConflict: 'user_id,role_id' }
        )
    }

    // Create an auditable record of the credential change
    try {
      await createAuditLog({
        companyId: context.companyId,
        userId: context.authUserId,
        userEmail: normalizedNewEmail,
        userName: context.fullName || 'Super Administrator',
        action: 'updated',
        entityType: 'user',
        description: 'Administrator credentials successfully changed and initial bootstrap security completed.',
        reason: 'ADMIN_CREDENTIALS_CHANGED',
      })
    } catch (auditErr) {
      console.warn('[AUTH] Audit logging failed non-fatally:', auditErr)
    }

    // Establish fresh session and capture SSR cookies
    const reAuthCookies: SupabaseCookieToSet[] = []
    const freshSupabase = await createServerSupabase({
      onSetCookies: (c) => {
        reAuthCookies.push(...c)
        onSetCookies?.(c)
      },
    })

    const { error: reAuthError } = await freshSupabase.auth.signInWithPassword({
      email: normalizedNewEmail,
      password: newPassword,
    })

    if (reAuthError) {
      console.error('[AUTH] Re-authentication after credential update failed:', reAuthError.message)
    }

    return {
      success: true,
      user: {
        id: context.authUserId,
        email: normalizedNewEmail,
        fullName: context.fullName || 'Super Administrator',
        roles: [ROLES.SUPER_ADMIN],
        mustChangeCredentials: false,
      },
      cookiesToSet: reAuthCookies,
    }
  } catch (error: any) {
    console.error('updateInitialAdminCredentials error:', error)
    return {
      success: false,
      error: error?.message || 'Failed to update administrator credentials.',
    }
  }
}

/**
 * Employee first-login password change.
 *
 * For security, when called for the currently authenticated
 * employee, their Supabase Auth session identity is used.
 */
export async function updateEmployeeFirstPassword(
  arg1: string,
  arg2: string,
  arg3?: string | ((cookies: { name: string; value: string; options?: any }[]) => void),
  arg4?: (cookies: { name: string; value: string; options?: any }[]) => void
): Promise<{
  success: boolean
  error?: string
  user?: {
    id: string
    email: string
    fullName: string
    employeeCode?: string
    roles: string[]
    mustChangeCredentials: boolean
    mustChangePassword: boolean
  }
  cookiesToSet?: { name: string; value: string; options?: any }[]
}> {
  let identifier = 'current-employee'
  let currentPassword = ''
  let newPassword = ''
  let onSetCookies: ((cookies: { name: string; value: string; options?: any }[]) => void) | undefined

  if (typeof arg3 === 'string') {
    identifier = arg1
    currentPassword = arg2
    newPassword = arg3
    onSetCookies = arg4
  } else {
    currentPassword = arg1
    newPassword = arg2
    onSetCookies = typeof arg3 === 'function' ? arg3 : undefined
  }

  if (!newPassword || newPassword.length < 8) {
    return {
      success: false,
      error: 'New password must be at least 8 characters.',
    }
  }

  if (!passwordComplexityRegex.test(newPassword)) {
    return {
      success: false,
      error: 'Password must include uppercase, lowercase, number, and special character.',
    }
  }

  if (currentPassword && currentPassword === newPassword) {
    return {
      success: false,
      error: 'New password must be different from temporary password.',
    }
  }

  if (!isSupabaseConfigured()) {
    return {
      success: false,
      error:
        'Authentication service is temporarily unavailable.',
    }
  }

  try {
    const adminClient =
      createAdminClient()

    if (!adminClient) {
      return {
        success: false,
        error:
          'Authentication service is temporarily unavailable.',
      }
    }

    let targetUserId: string | null =
      null

    let targetEmail: string | null =
      null

    /**
     * Explicit identifier supplied.
     */
    if (identifier.includes('@')) {
      targetEmail = identifier
        .trim()
        .toLowerCase()
    } else if (
      identifier !== 'current-employee'
    ) {
      const normalized =
        normalizeIdentifier(identifier)

      if (
        normalized.type === 'email'
      ) {
        targetEmail =
          normalized.normalized
      } else {
        const {
          data: employee,
          error: employeeError,
        } = await adminClient
          .from('employees')
          .select(`
            user_id,
            official_email,
            employee_code
          `)
          .eq(
            'employee_code',
            normalized.normalized
          )
          .maybeSingle()

        if (employeeError) {
          return {
            success: false,
            error:
              'Employee account could not be resolved.',
          }
        }

        if (employee) {
          targetUserId =
            employee.user_id ?? null

          targetEmail =
            employee.official_email ??
            null
        }
      }
    }

    /**
     * Otherwise use the currently authenticated user.
     */
    if (
      !targetUserId &&
      !targetEmail
    ) {
      const serverSupabase =
        await createServerSupabase()

      const {
        data: currentUserData,
      } =
        await serverSupabase.auth.getUser()

      if (currentUserData.user) {
        targetUserId =
          currentUserData.user.id

        targetEmail =
          currentUserData.user.email ??
          null
      }
    }

    let authUser: any = null

    if (targetUserId) {
      const {
        data: authUserData,
      } =
        await adminClient.auth.admin.getUserById(
          targetUserId
        )

      authUser =
        authUserData?.user ?? null
    }

    /**
     * Email lookup only as a fallback.
     */
    if (!authUser && targetEmail) {
      const {
        data: usersData,
      } =
        await adminClient.auth.admin.listUsers()

      authUser =
        usersData?.users?.find(
          (user) =>
            user.email?.toLowerCase() ===
            targetEmail!.toLowerCase()
        ) ?? null
    }

    if (!authUser) {
      return {
        success: false,
        error:
          'Employee authentication account not found.',
      }
    }

    /**
     * Verify current password before changing it.
     */
    if (targetEmail && currentPassword) {
      const verificationClient =
        await createServerSupabase()

      const {
        error: passwordCheckError,
      } =
        await verificationClient.auth.signInWithPassword({
          email: targetEmail,
          password: currentPassword,
        })

      if (passwordCheckError) {
        return {
          success: false,
          error:
            'Current password is incorrect.',
        }
      }
    }

    const {
      error: updateError,
    } =
      await adminClient.auth.admin.updateUserById(
        authUser.id,
        {
          password: newPassword,
          user_metadata: {
            ...(authUser.user_metadata ??
              {}),
            must_change_password: false,
            must_change_credentials: false,
          },
        }
      )

    if (updateError) {
      return {
        success: false,
        error: `Failed to update password: ${updateError.message}`,
      }
    }

    // 1. Synchronize public.users record
    try {
      await adminClient
        .from('users')
        .update({
          must_change_password: false,
          password_changed_at: new Date().toISOString(),
        })
        .eq('id', authUser.id)
    } catch (usersErr) {
      console.warn('[AUTH] Non-fatal: failed to update public.users password flags:', usersErr)
    }

    const context =
      await resolveAuthenticatedUserContext(
        authUser.id
      )

    await createAuditLog({
      companyId:
        context?.companyId ?? '',
      userId: authUser.id,
      userEmail:
        authUser.email ??
        targetEmail ??
        'employee@haryak.com',
      userName:
        context?.fullName ??
        authUser.user_metadata
          ?.full_name ??
        'Employee',
      action: 'updated',
      entityType: 'user',
      description:
        'Employee password changed successfully. Temporary password invalidated.',
      reason:
        'EMPLOYEE_FIRST_PASSWORD_CHANGED',
    })

    // 2. Capture fresh SSR session cookies with the updated password
    const capturedCookies: { name: string; value: string; options?: any }[] = []
    const effectiveEmail = authUser.email || targetEmail
    if (effectiveEmail) {
      try {
        const freshSupabase = await createServerSupabase({
          onSetCookies: (c) => {
            capturedCookies.push(...c)
            if (onSetCookies) onSetCookies(c)
          },
        })
        await freshSupabase.auth.signInWithPassword({
          email: effectiveEmail,
          password: newPassword,
        })
      } catch (reAuthErr) {
        console.warn('[AUTH] Could not capture fresh employee session cookies:', reAuthErr)
      }
    }

    return {
      success: true,
      user: {
        id: authUser.id,
        email: effectiveEmail || '',
        fullName: context?.fullName || authUser.user_metadata?.full_name || 'Employee',
        employeeCode: authUser.user_metadata?.employee_code,
        roles: context?.roles || [ROLES.EMPLOYEE],
        mustChangeCredentials: false,
        mustChangePassword: false,
      },
      cookiesToSet: capturedCookies,
    }
  } catch (error) {
    console.error(
      'updateEmployeeFirstPassword error:',
      error
    )

    return {
      success: false,
      error:
        'Authentication service is temporarily unavailable.',
    }
  }
}

/**
 * Employee/Admin forgot password.
 *
 * Employee ID is resolved to employees.official_email.
 *
 * IMPORTANT:
 * The schema uses official_email, not work_email.
 */
export async function handleForgotPasswordRequest(
  identifier: string
): Promise<{
  success: boolean
  message: string
  error?: string
}> {
  const normalized =
    normalizeIdentifier(identifier)

  let targetEmail =
    normalized.normalized

  if (!isSupabaseConfigured()) {
    return {
      success: true,
      message:
        'Password reset request received. Please contact the HR Administrator if you require assistance.',
    }
  }

  try {
    const reachable =
      await isSupabaseReachable()

    if (!reachable) {
      return {
        success: true,
        message:
          'Password reset request received. Please contact the HR Administrator if you require assistance.',
      }
    }

    /**
     * Employee ID -> official email.
     */
    if (
      normalized.type ===
      'employee_id'
    ) {
      const adminClient =
        createAdminClient()

      if (!adminClient) {
        return {
          success: true,
          message:
            'Password reset request received. Please contact the HR Administrator if you require assistance.',
        }
      }

      const {
        data: employee,
      } = await adminClient
        .from('employees')
        .select('official_email')
        .eq(
          'employee_code',
          normalized.normalized
        )
        .maybeSingle()

      if (
        !employee?.official_email
      ) {
        /**
         * Generic response avoids employee enumeration.
         */
        return {
          success: true,
          message:
            'If an eligible account exists, password recovery instructions will be sent to the registered email address.',
        }
      }

      targetEmail =
        employee.official_email
    }

    const supabase =
      await createServerSupabase()

    const appUrl =
      process.env
        .NEXT_PUBLIC_APP_URL ||
      'http://localhost:3000'

    await supabase.auth.resetPasswordForEmail(
      targetEmail,
      {
        redirectTo:
          `${appUrl}/auth/callback?next=/reset-password`,
      }
    )

    /**
     * Generic response even if email delivery fails.
     * Avoids account enumeration.
     */
    return {
      success: true,
      message:
        'If an eligible account exists, password recovery instructions will be sent to the registered email address.',
    }
  } catch (error) {
    console.error(
      'handleForgotPasswordRequest error:',
      error
    )

    return {
      success: true,
      message:
        'Password reset request received. Please contact the HR Administrator if you require assistance.',
    }
  }
}