import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient as createServerSupabase } from '@/lib/supabase/server'
import { updateEmployeeFirstPassword } from '@/lib/auth/auth-service'
import { employeeFirstLoginSchema } from '@/lib/validations/auth'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { identifier, ...formData } = body

    const validation = employeeFirstLoginSchema.safeParse(formData)

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.issues?.[0]?.message || 'Invalid input data.' },
        { status: 400 }
      )
    }

    const cookieStore = await cookies()
    let targetIdentifier = identifier
    if (!targetIdentifier) {
      const sessionCookie = cookieStore.get('haryak_session')?.value
      if (sessionCookie) {
        try {
          const parsed = JSON.parse(decodeURIComponent(sessionCookie))
          targetIdentifier = parsed.email || parsed.employeeCode || parsed.id
        } catch {}
      }
      if (!targetIdentifier) {
        const supabase = await createServerSupabase()
        const { data: authData } = await supabase.auth.getUser()
        if (authData?.user?.email) {
          targetIdentifier = authData.user.email
        }
      }
    }

    const cookiesToSet: { name: string; value: string; options?: any }[] = []
    // Updates password and atomically clears must_change_password on Supabase Auth user
    const result = await updateEmployeeFirstPassword(
      targetIdentifier || 'current-employee',
      validation.data.currentPassword,
      validation.data.newPassword,
      (c) => cookiesToSet.push(...c)
    )

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || 'Failed to update password.' },
        { status: 400 }
      )
    }

    const response = NextResponse.json({
      success: true,
      message: 'Password updated successfully.',
      redirectUrl: '/portal/home',
    })

    // 1. Explicitly attach all Supabase SSR cookies produced during re-authentication
    const allCookiesToSet = [...cookiesToSet, ...(result.cookiesToSet || [])]
    allCookiesToSet.forEach(({ name, value, options }) => {
      response.cookies.set(name, value, {
        ...options,
        path: '/',
        sameSite: options?.sameSite || 'lax',
        secure: process.env.NODE_ENV === 'production',
      })
    })

    // 2. Propagate all remaining cookies from cookieStore with path: '/'
    for (const cookie of cookieStore.getAll()) {
      if (!response.cookies.has(cookie.name)) {
        response.cookies.set(cookie.name, cookie.value, {
          path: '/',
          sameSite: 'lax',
          secure: process.env.NODE_ENV === 'production',
        })
      }
    }

    // 3. Update haryak_session cookie with mustChangePassword: false, mustChangeCredentials: false
    if (result.user) {
      const sessionData = JSON.stringify({
        id: result.user.id,
        email: result.user.email,
        fullName: result.user.fullName,
        employeeCode: result.user.employeeCode,
        roles: result.user.roles,
        mustChangeCredentials: false,
        mustChangePassword: false,
      })

      response.cookies.set('haryak_session', encodeURIComponent(sessionData), {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 24 * 60 * 60,
      })
    }

    return response
  } catch (error) {
    console.error('Employee first login error:', error)
    return NextResponse.json(
      { success: false, error: 'An unexpected error occurred while updating password.' },
      { status: 500 }
    )
  }
}
