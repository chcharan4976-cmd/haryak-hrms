import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestContext, isAdmin } from '@/lib/services/company-resolver'
import { getEmployeeIdentityIntegrity } from '@/lib/services/employee-identity-service'

export async function GET(
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
      return NextResponse.json({ success: false, error: 'Only administrators can inspect employee identity integrity.' }, { status: 403 })
    }

    const { id } = await params
    const integrity = await getEmployeeIdentityIntegrity(id, context.companyId)

    if (!integrity) {
      return NextResponse.json({ success: false, error: 'Employee record not found.' }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      integrity,
    })
  } catch (error: any) {
    console.error('[GET /api/employees/[id]/identity-integrity] Error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
