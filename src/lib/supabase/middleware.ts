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
    pathname.startsWith('/first-login') ||
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
  let localUser: { id: string; email: string; roles: string[] } | null = null

  if (localSessionCookie?.value) {
    try {
      localUser = JSON.parse(decodeURIComponent(localSessionCookie.value))
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

  // 5. RBAC Protection
  // If user is employee only and tries to access executive/admin routes
  if (localUser && localUser.roles?.length === 1 && localUser.roles[0] === 'EMPLOYEE') {
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
      portalUrl.pathname = '/portal/home'
      return NextResponse.redirect(portalUrl)
    }
  }

  return supabaseResponse
}
