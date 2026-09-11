import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { authenticateUser } from '@/lib/auth/auth-service'
import { loginSchema } from '@/lib/validations/auth'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const validation = loginSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: 'Please provide valid credentials.' },
        { status: 400 }
      )
    }

    const result = await authenticateUser(
      validation.data.identifier,
      validation.data.password,
      validation.data.mode || 'ADMIN'
    )

    if (!result.success || !result.user) {
      return NextResponse.json(
        { success: false, error: result.error || 'Invalid Employee ID/email or password.' },
        { status: 401 }
      )
    }

    // Set secure session cookie and propagate all Supabase SSR cookies
    const cookieStore = await cookies()
    const response = NextResponse.json(result)

    // Ensure all Supabase SSR cookies set during authentication are propagated
    for (const cookie of cookieStore.getAll()) {
      response.cookies.set(cookie.name, cookie.value)
    }

    const sessionData = JSON.stringify({
      id: result.user.id,
      email: result.user.email,
      fullName: result.user.fullName,
      employeeCode: result.user.employeeCode,
      roles: result.user.roles,
    })

    const maxAge = validation.data.rememberMe 
      ? 30 * 24 * 60 * 60 // 30 days
      : 24 * 60 * 60      // 24 hours

    response.cookies.set('haryak_session', encodeURIComponent(sessionData), {
      httpOnly: false, // accessible to client auth provider
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge,
    })

    return response
  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json(
      { success: false, error: 'An unexpected authentication error occurred.' },
      { status: 500 }
    )
  }
}
