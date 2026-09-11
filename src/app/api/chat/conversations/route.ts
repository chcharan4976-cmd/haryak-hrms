import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestContext } from '@/lib/services/company-resolver'
import { getUserConversations, createOrGetConversation } from '@/lib/services/chat-service'

export async function GET(request: NextRequest) {
  const resolved = await resolveRequestContext()
  if (!resolved.ok) {
    return NextResponse.json({ success: false, error: resolved.error.message }, { status: resolved.error.status })
  }
  const { context } = resolved

  try {
    const conversations = await getUserConversations(
      context.companyId,
      context.authUserId,
      context.employeeId || undefined
    )

    return NextResponse.json({
      success: true,
      conversations,
    })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || 'Error fetching conversations' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const resolved = await resolveRequestContext()
  if (!resolved.ok) {
    return NextResponse.json({ success: false, error: resolved.error.message }, { status: resolved.error.status })
  }
  const { context } = resolved

  try {
    const body = await request.json()
    const { recipientEmployeeId, type, title } = body

    if (!recipientEmployeeId && type !== 'channel') {
      return NextResponse.json({ success: false, error: 'recipientEmployeeId is required for direct chat' }, { status: 400 })
    }

    const conversation = await createOrGetConversation(
      context.companyId,
      {
        userId: context.authUserId,
        employeeId: context.employeeId || undefined,
        name: context.fullName,
      },
      recipientEmployeeId,
      { type, title }
    )

    return NextResponse.json({
      success: true,
      conversation,
    })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || 'Error creating conversation' }, { status: 500 })
  }
}
