import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestContext, isAdmin } from '@/lib/services/company-resolver'
import { getCompanySignatories, saveCompanySignatories } from '@/lib/services/signatory-service'

export async function GET() {
  const resolved = await resolveRequestContext()
  if (!resolved.ok) {
    return NextResponse.json({ success: false, error: resolved.error.message }, { status: resolved.error.status })
  }
  const { context } = resolved

  try {
    const signatories = await getCompanySignatories(context.companyId)
    return NextResponse.json({
      success: true,
      signatories,
      defaultSignatory: signatories.find(s => s.isDefault && s.isActive) || signatories[0] || null,
    })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const resolved = await resolveRequestContext()
  if (!resolved.ok) {
    return NextResponse.json({ success: false, error: resolved.error.message }, { status: resolved.error.status })
  }
  const { context } = resolved

  if (!isAdmin(context)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const { signatories } = body
    if (!Array.isArray(signatories)) {
      return NextResponse.json({ success: false, error: 'signatories array is required' }, { status: 400 })
    }

    await saveCompanySignatories(context.companyId, signatories)
    return NextResponse.json({ success: true, message: 'Signatories saved successfully' })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
