import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestContext } from '@/lib/services/company-resolver'
import { getConversationMessages, sendChatMessage } from '@/lib/services/chat-service'
import { createAdminClient } from '@/lib/supabase/admin'

type ReceiptMode = 'delivered' | 'read'

function statusOf(error: any) {
  return error?.status || (error?.message?.includes('Forbidden') ? 403 : 500)
}

async function attachReceiptState(companyId: string, userId: string, messages: any[]) {
  const supabase = createAdminClient()
  if (!supabase) return messages

  const ids = messages
    .filter(message => String(message.senderUserId) === String(userId))
    .map(message => String(message.id))

  if (!ids.length) return messages

  const { data: receipts, error } = await supabase
    .from('chat_message_receipts')
    .select('message_id,user_id,delivered_at,read_at')
    .eq('company_id', companyId)
    .in('message_id', ids)

  if (error) {
    console.error('[ChatReceipts] read failed:', error.message)
    return messages
  }

  const grouped = new Map<string, any[]>()
  for (const receipt of receipts || []) {
    const key = String(receipt.message_id)
    grouped.set(key, [...(grouped.get(key) || []), receipt])
  }

  return messages.map(message => {
    if (String(message.senderUserId) !== String(userId)) return message

    const rows = grouped.get(String(message.id)) || []
    if (!rows.length) {
      return { ...message, receiptStatus: 'sent', deliveredAt: null, readAt: null }
    }

    const allRead = rows.every(row => Boolean(row.read_at))
    const allDelivered = rows.every(row => Boolean(row.delivered_at || row.read_at))

    return {
      ...message,
      receiptStatus: allRead ? 'read' : allDelivered ? 'delivered' : 'sent',
      deliveredAt: rows.map(row => row.delivered_at).filter(Boolean).sort().at(-1) || null,
      readAt: rows.map(row => row.read_at).filter(Boolean).sort().at(-1) || null,
    }
  })
}

export async function GET(request: NextRequest) {
  const resolved = await resolveRequestContext()
  if (!resolved.ok) {
    return NextResponse.json({ success: false, error: resolved.error.message }, { status: resolved.error.status })
  }

  const { context } = resolved
  const conversationId = new URL(request.url).searchParams.get('conversationId')

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
      messages: await attachReceiptState(
        context.companyId,
        context.authUserId,
        Array.isArray(messages) ? messages : []
      ),
    })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: statusOf(error) })
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
    if (!body?.conversationId) {
      return NextResponse.json({ success: false, error: 'conversationId is required' }, { status: 400 })
    }

    const message = await sendChatMessage(
      context.companyId,
      body.conversationId,
      {
        userId: context.authUserId,
        employeeId: context.employeeId || undefined,
        name: context.fullName,
      },
      body.content || '',
      body.attachments
    )

    return NextResponse.json({
      success: true,
      message: { ...message, receiptStatus: 'sent', deliveredAt: null, readAt: null },
    })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: statusOf(error) })
  }
}

export async function PATCH(request: NextRequest) {
  const resolved = await resolveRequestContext()
  if (!resolved.ok) {
    return NextResponse.json({ success: false, error: resolved.error.message }, { status: resolved.error.status })
  }

  const { context } = resolved

  try {
    const body = await request.json()
    const conversationId = String(body?.conversationId || '')
    const mode = String(body?.mode || '') as ReceiptMode

    if (!conversationId || !['delivered', 'read'].includes(mode)) {
      return NextResponse.json(
        { success: false, error: 'conversationId and valid mode are required' },
        { status: 400 }
      )
    }

    // Reuse existing participant authorization before acknowledging anything.
    await getConversationMessages(
      context.companyId,
      conversationId,
      context.authUserId,
      context.employeeId || undefined
    )

    const supabase = createAdminClient()
    if (!supabase) throw new Error('Database unavailable')

    const { data: incoming, error: incomingError } = await supabase
      .from('chat_messages')
      .select('id')
      .eq('company_id', context.companyId)
      .eq('conversation_id', conversationId)
      .neq('sender_user_id', context.authUserId)

    if (incomingError) throw new Error(incomingError.message)

    const now = new Date().toISOString()
    const rows = (incoming || []).map(message => ({
      message_id: String(message.id),
      conversation_id: conversationId,
      company_id: context.companyId,
      user_id: context.authUserId,
      delivered_at: now,
      ...(mode === 'read' ? { read_at: now } : {}),
      updated_at: now,
    }))

    if (rows.length) {
      const { error } = await supabase
        .from('chat_message_receipts')
        .upsert(rows, { onConflict: 'message_id,user_id' })

      if (error) throw new Error(error.message)
    }

    return NextResponse.json({
      success: true,
      mode,
      acknowledged: rows.length,
      acknowledgedAt: now,
    })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Unable to update message receipts' },
      { status: statusOf(error) }
    )
  }
}
