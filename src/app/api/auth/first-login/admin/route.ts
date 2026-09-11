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

    const result = await updateInitialAdminCredentials(
      validation.data.currentPassword,
      validation.data.newEmail,
      validation.data.newPassword
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

    // Propagate all cookies (including newly issued sb-*-auth-token from re-authentication)
    for (const cookie of cookieStore.getAll()) {
      response.cookies.set(cookie.name, cookie.value)
    }

    if (result.user) {
      const sessionData = JSON.stringify({
        id: result.user.id,
        email: result.user.email,
        fullName: result.user.fullName,
        roles: result.user.roles,
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
