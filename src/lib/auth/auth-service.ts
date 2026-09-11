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
 * Main login handler.
 */
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

  if (
    !isSupabaseConfigured()
  ) {
    return {
      success: false,
      error: serverUnavailableError,
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

  try {
    /* ============================================================
       VERIFY SUPABASE AVAILABILITY
       ============================================================ */

    const reachable =
      await isSupabaseReachable()

    if (!reachable) {
      return {
        success: false,
        error:
          serverUnavailableError,
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

    /* ============================================================
       AUTH METADATA
       ============================================================ */

    const userMetadata =
      authUser.user_metadata ??
      {}

    const mustChangeCredentials =
      Boolean(
        userMetadata
          .must_change_credentials
      )

    const mustChangePassword =
      Boolean(
        userMetadata
          .must_change_password
      )

    /* ============================================================
       REDIRECT RESOLUTION
       ============================================================ */

    let redirectUrl:
      string

    if (
      mustChangeCredentials
    ) {
      redirectUrl =
        '/first-login/change-credentials'
    } else if (
      mustChangePassword
    ) {
      redirectUrl =
        '/first-login/change-password'
    } else if (
      mode === 'ADMIN' &&
      isAdmin
    ) {
      redirectUrl =
        '/dashboard'
    } else if (
      mode ===
        'EMPLOYEE' &&
      isEmployee
    ) {
      redirectUrl =
        '/portal/home'
    } else if (
      isAdmin
    ) {
      redirectUrl =
        '/dashboard'
    } else if (
      isEmployee
    ) {
      redirectUrl =
        '/portal/home'
    } else {
      /**
       * Defensive fallback.
       */
      await supabase.auth
        .signOut()

      return {
        success: false,

        error:
          'No valid portal access is configured for this account.',
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

        mustChangeCredentials,

        mustChangePassword,
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

/**
 * Update initial administrator credentials.
 *
 * This is retained only for installations where the
 * first-login administrator credential-change workflow
 * is still enabled.
 *
 * IMPORTANT:
 * There is no must_change_password column in public.users
 * in the schema you showed.
 *
 * The forced-change flag lives in Supabase Auth metadata.
 */
export async function updateInitialAdminCredentials(
  currentPassword: string,
  newEmail: string,
  newPassword: string
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
}> {
  if (newPassword.length < 8) {
    return {
      success: false,
      error:
        'New password must be at least 8 characters long.',
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
    const serverSupabase =
      await createServerSupabase()

    const {
      data: sessionData,
    } = await serverSupabase.auth.getUser()

    if (!sessionData.user) {
      return {
        success: false,
        error:
          'Administrator session not found.',
      }
    }

    /**
     * Verify current user is actually an administrator.
     */
    const context =
      await resolveAuthenticatedUserContext(
        sessionData.user.id
      )

    if (!context) {
      return {
        success: false,
        error:
          'Administrator account configuration could not be resolved.',
      }
    }

    const adminRoles = [
      ROLES.SUPER_ADMIN,
      ROLES.HR_ADMIN,
      ROLES.PAYROLL_ADMIN,
      'ADMINISTRATION',
    ]

    const isAdmin = context.roles.some((role) =>
      adminRoles.includes(role)
    )

    if (!isAdmin) {
      return {
        success: false,
        error:
          'Administrator privileges are required.',
      }
    }

    /**
     * Verify current password.
     */
    const {
      error: signInError,
    } =
      await serverSupabase.auth.signInWithPassword({
        email: context.email,
        password: currentPassword,
      })

    if (signInError) {
      return {
        success: false,
        error:
          'Current password is incorrect.',
      }
    }

    const adminClient = createAdminClient()

    if (!adminClient) {
      return {
        success: false,
        error:
          'Authentication service is temporarily unavailable.',
      }
    }

    /**
     * Update Supabase Auth.
     */
    const {
      error: updateAuthError,
    } =
      await adminClient.auth.admin.updateUserById(
        context.authUserId,
        {
          email: newEmail
            .trim()
            .toLowerCase(),
          password: newPassword,
          email_confirm: true,
          user_metadata: {
            ...(sessionData.user
              .user_metadata ?? {}),
            full_name:
              context.fullName ||
              'Super Administrator',
            must_change_credentials: false,
          },
        }
      )

    if (updateAuthError) {
      return {
        success: false,
        error: updateAuthError.message,
      }
    }

    /**
     * Update public.users.
     *
     * NOTE:
     * No must_change_password column exists here.
     */
    const {
      error: updateUserError,
    } = await adminClient
      .from('users')
      .update({
        email: newEmail
          .trim()
          .toLowerCase(),
        updated_at:
          new Date().toISOString(),
      })
      .eq('id', context.authUserId)

    if (updateUserError) {
      return {
        success: false,
        error:
          'Authentication credentials were updated, but the HRMS profile email could not be synchronized. Please contact the system administrator.',
      }
    }

    await createAuditLog({
      companyId: context.companyId,
      userId: context.authUserId,
      userEmail: newEmail
        .trim()
        .toLowerCase(),
      userName:
        context.fullName ||
        'Super Administrator',
      action: 'updated',
      entityType: 'user',
      description:
        'Administrator credentials successfully changed.',
      reason:
        'ADMIN_CREDENTIALS_CHANGED',
    })

    // Establish a fresh authenticated Supabase session with the new credentials
    // to replace the revoked session and write fresh SSR cookies
    const { error: reAuthError } = await serverSupabase.auth.signInWithPassword({
      email: newEmail.trim().toLowerCase(),
      password: newPassword,
    })

    if (reAuthError) {
      console.error('[AUTH] Re-authentication after credential update failed:', reAuthError.message)
    }

    return {
      success: true,
      user: {
        id: context.authUserId,
        email: newEmail.trim().toLowerCase(),
        fullName: context.fullName || 'Super Administrator',
        roles: context.roles,
        mustChangeCredentials: false,
      },
    }
  } catch (error: any) {
    console.error(
      'updateInitialAdminCredentials error:',
      error
    )

    return {
      success: false,
      error:
        error?.message ||
        'Failed to update administrator credentials.',
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
  arg3?: string
): Promise<{
  success: boolean
  error?: string
}> {
  const newPassword =
    arg3 !== undefined ? arg3 : arg2

  const currentPassword =
    arg3 !== undefined ? arg2 : arg1

  const identifier =
    arg3 !== undefined
      ? arg1
      : 'current-employee'

  if (newPassword.length < 8) {
    return {
      success: false,
      error:
        'New password must be at least 8 characters.',
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

    return {
      success: true,
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