import { NextResponse } from 'next/server'
import { handleForgotPasswordRequest } from '@/lib/auth/auth-service'
import { forgotPasswordSchema } from '@/lib/validations/auth'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const validation = forgotPasswordSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: 'Please enter a valid Employee ID or Company Email.' },
        { status: 400 }
      )
    }

    const result = await handleForgotPasswordRequest(validation.data.identifier)

    return NextResponse.json(result, { status: result.success ? 200 : 400 })
  } catch (error) {
    console.error('Forgot password error:', error)
    return NextResponse.json(
      { success: false, error: 'An unexpected error occurred processing your request.' },
      { status: 500 }
    )
  }
}
