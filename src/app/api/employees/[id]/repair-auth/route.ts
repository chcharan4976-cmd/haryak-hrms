import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestContext, isAdmin } from '@/lib/services/company-resolver'
import { repairEmployeeAuthIdentity } from '@/lib/services/employee-identity-service'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolved = await resolveRequestContext()
    if (!resolved.ok) {
      return NextResponse.json({ success: false, error: resolved.error.message }, { status: resolved.error.status })
    }
    const { context } = resolved

    if (!isAdmin(context)) {
      return NextResponse.json({ success: false, error: 'Only administrators can repair employee authentication accounts.' }, { status: 403 })
    }

    const { id } = await params
    let body: any = {}
    try {
      body = await request.json()
    } catch {
      // Empty body allowed
    }

    const result = await repairEmployeeAuthIdentity(id, {
      tempPassword: body.tempPassword,
      companyId: context.companyId,
      adminContext: {
        userId: context.authUserId,
        userEmail: context.email,
        userName: context.fullName,
      },
    })

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error || 'Failed to repair auth identity' }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      data: result,
      temporaryPassword: result.temporaryPassword,
      message: `Employee login account repaired successfully for ${result.employeeCode} (${result.officialEmail}).`,
    })
  } catch (error: any) {
    console.error('[POST /api/employees/[id]/repair-auth] Error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
