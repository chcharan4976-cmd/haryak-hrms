import { NextResponse } from 'next/server'
import { resolveRequestContext } from '@/lib/services/company-resolver'

export async function GET() {
  const resolution = await resolveRequestContext()
  if (!resolution.ok) {
    if (resolution.error.code === 'CREDENTIALS_CHANGE_REQUIRED') {
      return NextResponse.json({
        authenticated: true,
        mustChangeCredentials: true,
      })
    }
    return NextResponse.json(
      { authenticated: false, error: resolution.error.message },
      { status: resolution.error.status }
    )
  }
  return NextResponse.json({
    authenticated: true,
    user: {
      id: resolution.context.authUserId,
      email: resolution.context.email,
      fullName: resolution.context.fullName,
      roles: resolution.context.roles,
    },
  })
}
