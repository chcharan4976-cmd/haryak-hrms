import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestContext } from '@/lib/services/company-resolver'
import { getConversationMessages, sendChatMessage } from '@/lib/services/chat-service'

export async function GET(request: NextRequest) {
  const resolved = await resolveRequestContext()
  if (!resolved.ok) {
    return NextResponse.json({ success: false, error: resolved.error.message }, { status: resolved.error.status })
  }
  const { context } = resolved

  const { searchParams } = new URL(request.url)
  const conversationId = searchParams.get('conversationId')

  if (!conversationId) {
    return NextResponse.json({ success: false, error: 'conversationId is required' }, { status: 400 })
  }

  try {
    const messages = await getConversationMessages(
      context.companyId,
      conversationId,
      context.authUserId,
      context.employeeId || undefined
    )

    return NextResponse.json({
      success: true,
      messages,
    })
  } catch (error: any) {
    const status = error.status || (error.message?.includes('Forbidden') ? 403 : 500)
    return NextResponse.json({ success: false, error: error.message }, { status })
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
    const { conversationId, content, attachments } = body

    if (!conversationId) {
      return NextResponse.json({ success: false, error: 'conversationId is required' }, { status: 400 })
    }

    const message = await sendChatMessage(
      context.companyId,
      conversationId,
      {
        userId: context.authUserId,
        employeeId: context.employeeId || undefined,
        name: context.fullName,
      },
      content || '',
      attachments
    )

    return NextResponse.json({
      success: true,
      message,
    })
  } catch (error: any) {
    const status = error.status || (error.message?.includes('Forbidden') ? 403 : 500)
    return NextResponse.json({ success: false, error: error.message }, { status })
  }
}
