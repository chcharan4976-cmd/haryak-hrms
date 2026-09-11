import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestContext, isAdmin } from '@/lib/services/company-resolver'
import { checkEmployeeDeleteEligibility } from '@/lib/services/employee-service'

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
      return NextResponse.json({ success: false, error: 'Only administrators can check employee delete eligibility.' }, { status: 403 })
    }

    const { id } = await params
    const result = await checkEmployeeDeleteEligibility(id, context.companyId)

    return NextResponse.json({
      success: true,
      ...result,
    })
  } catch (error: any) {
    console.error('[GET /api/employees/[id]/delete-eligibility] Error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
