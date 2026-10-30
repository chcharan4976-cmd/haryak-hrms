import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { isSupabaseConfigured } from '@/lib/supabase/admin'

export async function updateSession(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  // 1. Unconditionally allow public static assets and public auth endpoints
  const isPublicRoute = 
    pathname.startsWith('/_next') ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/forgot-password') ||
    pathname.startsWith('/auth') ||
    pathname === '/api/auth/login' ||
    pathname === '/api/auth/forgot-password' ||
    pathname === '/api/auth/signout' ||
    pathname === '/' ||
    pathname === '/favicon.ico' ||
    pathname.endsWith('.jpg') ||
    pathname.endsWith('.png') ||
    pathname.endsWith('.svg') ||
    pathname.endsWith('.ico')

  if (isPublicRoute) {
    return NextResponse.next({ request })
  }

  let supabaseResponse = NextResponse.next({ request })

  // 2. Check for local auth session cookie (UI/session hint)
  const localSessionCookie = request.cookies.get('haryak_session')
  let localUser: any = null

  if (localSessionCookie?.value) {
    try {
      const parsed = JSON.parse(decodeURIComponent(localSessionCookie.value))
      localUser = parsed
      // Normalize roles if structured under user object or single role
      if (!localUser.roles && localUser.user?.role) {
        localUser.roles = [localUser.user.role]
      } else if (!localUser.roles && localUser.role) {
        localUser.roles = [localUser.role]
      }
    } catch {
      localUser = null
    }
  }

  // 3. If real Supabase is configured, check and refresh Supabase Auth SSR session
  let supabaseUser = null
  if (isSupabaseConfigured()) {
    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      
      const supabase = createServerClient(url, key, {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
            supabaseResponse = NextResponse.next({ request })
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, options)
            )
          },
        },
      })

      const { data: { user } } = await supabase.auth.getUser()
      supabaseUser = user
    } catch {
      // Supabase connection issue
    }
  }

  // 4. API routes perform their own independent authentication/authorization responses (401/403)
  // We return supabaseResponse with refreshed cookies attached
  if (pathname.startsWith('/api')) {
    return supabaseResponse
  }

  const authenticatedUser = supabaseUser || localUser

  // 5. If user is unauthenticated and attempting to access protected pages -> redirect to /login
  if (!authenticatedUser) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // 6. ROLE & IDENTITY DETERMINATION
  const roles: string[] = 
    localUser?.roles || 
    (supabaseUser?.user_metadata?.role ? [supabaseUser.user_metadata.role] : []) ||
    (localUser?.user?.role ? [localUser.user.role] : [])

  const hasEmployeeProfile = Boolean(
    localUser?.employeeCode || 
    supabaseUser?.user_metadata?.employee_code || 
    supabaseUser?.user_metadata?.employee_id
  )

  const isEmployeeClaim = 
    roles.includes('EMPLOYEE') || 
    supabaseUser?.user_metadata?.role === 'EMPLOYEE' ||
    hasEmployeeProfile

  const isAdminClaim = 
    roles.some((r: string) => ['SUPER_ADMIN', 'HR_ADMIN', 'PAYROLL_ADMIN', 'ADMINISTRATION'].includes(r)) ||
    ['SUPER_ADMIN', 'HR_ADMIN', 'PAYROLL_ADMIN', 'ADMINISTRATION'].includes(supabaseUser?.user_metadata?.role)

  const isEmployeeOnly = isEmployeeClaim && !isAdminClaim

  // 7. FORCED CREDENTIALS / PASSWORD RESET PROTECTION
  const mustChangeCredentials = Boolean(
    supabaseUser?.user_metadata?.must_change_credentials ||
    (localUser as any)?.mustChangeCredentials
  )
  const mustChangePassword = Boolean(
    supabaseUser?.user_metadata?.must_change_password ||
    (localUser as any)?.mustChangePassword
  )

  if (isEmployeeOnly) {
    // Employees NEVER access admin bootstrap credentials; route to employee change-password if reset required
    if (pathname === '/first-login/change-credentials' || pathname === '/first-login/admin-security') {
      const redirectUrl = request.nextUrl.clone()
      redirectUrl.pathname = (mustChangePassword || mustChangeCredentials)
        ? '/first-login/change-password'
        : '/portal/home'
      return NextResponse.redirect(redirectUrl)
    }

    if ((mustChangeCredentials || mustChangePassword) && pathname !== '/first-login/change-password') {
      const redirectUrl = request.nextUrl.clone()
      redirectUrl.pathname = '/first-login/change-password'
      return NextResponse.redirect(redirectUrl)
    }

    if (!mustChangePassword && !mustChangeCredentials && pathname === '/first-login/change-password') {
      const redirectUrl = request.nextUrl.clone()
      redirectUrl.pathname = '/portal/home'
      return NextResponse.redirect(redirectUrl)
    }

    // RBAC: Block employee access to executive/admin routes
    const isAdminRoute = 
      pathname.startsWith('/dashboard') ||
      pathname.startsWith('/admin') ||
      pathname.startsWith('/employees') ||
      pathname.startsWith('/organization') ||
      pathname.startsWith('/compensation') ||
      pathname.startsWith('/settings') ||
      pathname.startsWith('/audit')

    if (isAdminRoute) {
      const portalUrl = request.nextUrl.clone()
      portalUrl.pathname = (mustChangePassword || mustChangeCredentials)
        ? '/first-login/change-password'
        : '/portal/home'
      return NextResponse.redirect(portalUrl)
    }
  } else if (isAdminClaim) {
    // Initial bootstrap Super Admin: must complete initial credentials setup
    if (mustChangeCredentials && pathname !== '/first-login/change-credentials' && pathname !== '/first-login/admin-security') {
      const redirectUrl = request.nextUrl.clone()
      redirectUrl.pathname = '/first-login/change-credentials'
      return NextResponse.redirect(redirectUrl)
    }

    // Standard administrator password reset requirement
    if (!mustChangeCredentials && mustChangePassword && pathname !== '/first-login/change-password') {
      const redirectUrl = request.nextUrl.clone()
      redirectUrl.pathname = '/first-login/change-password'
      return NextResponse.redirect(redirectUrl)
    }

    // Completed administrators visiting first-login routes
    if (!mustChangeCredentials && !mustChangePassword && (pathname === '/first-login/change-credentials' || pathname === '/first-login/change-password' || pathname === '/first-login/admin-security')) {
      const redirectUrl = request.nextUrl.clone()
      redirectUrl.pathname = '/dashboard'
      return NextResponse.redirect(redirectUrl)
    }
  }

  return supabaseResponse
}
