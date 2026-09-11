import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestContext, isAdmin } from '@/lib/services/company-resolver'
import { processAiQuery } from '@/lib/ai/ai-service'

export async function POST(request: NextRequest) {
  const resolved = await resolveRequestContext()
  if (!resolved.ok) {
    return NextResponse.json({ success: false, error: resolved.error.message }, { status: resolved.error.status })
  }
  const { context } = resolved

  try {
    const body = await request.json()
    const { prompt } = body

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return NextResponse.json({ success: false, error: 'Prompt is required.' }, { status: 400 })
    }

    const aiResponse = await processAiQuery(
      {
        companyId: context.companyId,
        authUserId: context.authUserId,
        employeeId: context.employeeId,
        employeeCode: context.employeeCode,
        fullName: context.fullName,
        email: context.email,
        role: context.roles[0] || 'employee',
        isAdmin: isAdmin(context),
      },
      prompt
    )

    return NextResponse.json({
      success: true,
      ...aiResponse,
    })
  } catch (error: any) {
    console.error('AI chat endpoint error:', error)
    return NextResponse.json({ success: false, error: error.message || 'Internal AI service error' }, { status: 500 })
  }
}
