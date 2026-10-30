import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { updateInitialAdminCredentials } from '@/lib/auth/auth-service'
import { adminFirstLoginSchema } from '@/lib/validations/auth'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const validation = adminFirstLoginSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error.issues?.[0]?.message || 'Invalid input data.' },
        { status: 400 }
      )
    }

    const cookiesToSet: { name: string; value: string; options?: any }[] = []
    const result = await updateInitialAdminCredentials(
      validation.data.currentPassword,
      validation.data.newEmail,
      validation.data.newPassword,
      (c) => cookiesToSet.push(...c)
    )

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || 'Failed to update admin credentials.' },
        { status: 400 }
      )
    }

    const cookieStore = await cookies()
    const response = NextResponse.json({
      success: true,
      message: 'Admin credentials updated successfully.',
      redirectUrl: '/dashboard',
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

    if (result.user) {
      const sessionData = JSON.stringify({
        id: result.user.id,
        email: result.user.email,
        fullName: result.user.fullName,
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
    console.error('Admin first login error:', error)
    return NextResponse.json(
      { success: false, error: 'An unexpected error occurred while updating credentials.' },
      { status: 500 }
    )
  }
}
