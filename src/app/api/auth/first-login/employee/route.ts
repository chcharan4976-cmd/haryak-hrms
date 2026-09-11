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

    // Updates password and atomically clears must_change_password on Supabase Auth user
    const result = await updateEmployeeFirstPassword(
      targetIdentifier || 'current-employee',
      validation.data.currentPassword,
      validation.data.newPassword
    )

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || 'Failed to update password.' },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Password updated successfully.',
      redirectUrl: '/portal/home',
    })
  } catch (error) {
    console.error('Employee first login error:', error)
    return NextResponse.json(
      { success: false, error: 'An unexpected error occurred while updating password.' },
      { status: 500 }
    )
  }
}
