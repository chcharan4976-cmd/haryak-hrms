import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestContext } from '@/lib/services/company-resolver'
import { createAdminClient } from '@/lib/supabase/admin'

async function assertParticipant(
  companyId: string,
  conversationId: string,
  userId: string
) {
  const supabase = createAdminClient()
  if (!supabase) throw new Error('Database unavailable')

  const { data: conversation, error } = await supabase
    .from('chat_conversations')
    .select('id,type,title')
    .eq('company_id', companyId)
    .eq('id', conversationId)
    .maybeSingle()

  if (error || !conversation) {
    const e: any = new Error('Conversation not found')
    e.status = 404
    throw e
  }

  if (conversation.type === 'channel') {
    const e: any = new Error('Company channels cannot be renamed or deleted here.')
    e.status = 403
    throw e
  }

  const { data: participant } = await supabase
    .from('chat_participants')
    .select('id')
    .eq('company_id', companyId)
    .eq('conversation_id', conversationId)
    .eq('user_id', userId)
    .is('left_at', null)
    .maybeSingle()

  if (!participant) {
    const e: any = new Error('You are not a participant in this conversation.')
    e.status = 403
    throw e
  }

  return { supabase, conversation }
}

export async function PATCH(request: NextRequest) {
  const resolved = await resolveRequestContext()
  if (!resolved.ok) {
    return NextResponse.json(
      { success: false, error: resolved.error.message },
      { status: resolved.error.status }
    )
  }

  const { context } = resolved

  try {
    const body = await request.json()
    const action = String(body?.action || '')

    if (action === 'edit-message') {
      const messageId = String(body?.messageId || '')
      const content = String(body?.content || '').trim()

      if (!messageId || !content) {
        return NextResponse.json(
          { success: false, error: 'messageId and content are required' },
          { status: 400 }
        )
      }

      const supabase = createAdminClient()
      if (!supabase) throw new Error('Database unavailable')

      const { data: message } = await supabase
        .from('chat_messages')
        .select('id,conversation_id,sender_user_id,created_at,expires_at,deleted_at')
        .eq('company_id', context.companyId)
        .eq('id', messageId)
        .maybeSingle()

      if (!message || message.deleted_at) {
        return NextResponse.json(
          { success: false, error: 'Message not found' },
          { status: 404 }
        )
      }

      const nowMs = Date.now()
      const isExpired =
        (message.expires_at &&
          new Date(message.expires_at).getTime() <= nowMs) ||
        nowMs - new Date(message.created_at).getTime() >=
          14 * 24 * 60 * 60 * 1000

      if (isExpired) {
        return NextResponse.json(
          {
            success: false,
            error: 'Message has expired and can no longer be edited.',
          },
          { status: 410 }
        )
      }

      if (String(message.sender_user_id) !== context.authUserId) {
        return NextResponse.json(
          { success: false, error: 'You can edit only your own messages.' },
          { status: 403 }
        )
      }

      const editedAt = new Date().toISOString()

      const { error } = await supabase
        .from('chat_messages')
        .update({ content, edited_at: editedAt })
        .eq('company_id', context.companyId)
        .eq('id', messageId)
        .eq('sender_user_id', context.authUserId)

      if (error) throw new Error(error.message)

      return NextResponse.json({
        success: true,
        message: { id: messageId, content, editedAt },
      })
    }

    if (action === 'rename-conversation') {
      const conversationId = String(body?.conversationId || '')
      const title = String(body?.title || '').trim()

      if (!conversationId || !title) {
        return NextResponse.json(
          { success: false, error: 'conversationId and title are required' },
          { status: 400 }
        )
      }

      const { supabase } = await assertParticipant(
        context.companyId,
        conversationId,
        context.authUserId
      )

      const now = new Date().toISOString()

      const { error } = await supabase
        .from('chat_conversations')
        .update({ title, updated_at: now })
        .eq('company_id', context.companyId)
        .eq('id', conversationId)

      if (error) throw new Error(error.message)

      return NextResponse.json({ success: true, title })
    }

    return NextResponse.json(
      { success: false, error: 'Unsupported action' },
      { status: 400 }
    )
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Chat update failed' },
      { status: error.status || 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  const resolved = await resolveRequestContext()
  if (!resolved.ok) {
    return NextResponse.json(
      { success: false, error: resolved.error.message },
      { status: resolved.error.status }
    )
  }

  const { context } = resolved

  try {
    const body = await request.json()
    const action = String(body?.action || '')

    if (action === 'delete-message') {
      const messageId = String(body?.messageId || '')
      if (!messageId) {
        return NextResponse.json(
          { success: false, error: 'messageId is required' },
          { status: 400 }
        )
      }

      const supabase = createAdminClient()
      if (!supabase) throw new Error('Database unavailable')

      const { data: message } = await supabase
        .from('chat_messages')
        .select('id,sender_user_id')
        .eq('company_id', context.companyId)
        .eq('id', messageId)
        .maybeSingle()

      if (!message) {
        return NextResponse.json(
          { success: false, error: 'Message not found' },
          { status: 404 }
        )
      }

      if (String(message.sender_user_id) !== context.authUserId) {
        return NextResponse.json(
          { success: false, error: 'You can delete only your own messages.' },
          { status: 403 }
        )
      }

      const { error } = await supabase
        .from('chat_messages')
        .update({
          deleted_at: new Date().toISOString(),
          content: '',
          attachments: [],
        })
        .eq('company_id', context.companyId)
        .eq('id', messageId)
        .eq('sender_user_id', context.authUserId)

      if (error) throw new Error(error.message)

      return NextResponse.json({ success: true })
    }

    if (action === 'delete-conversation') {
      const conversationId = String(body?.conversationId || '')
      if (!conversationId) {
        return NextResponse.json(
          { success: false, error: 'conversationId is required' },
          { status: 400 }
        )
      }

      const { supabase } = await assertParticipant(
        context.companyId,
        conversationId,
        context.authUserId
      )

      // Explicit "delete for everyone": FK cascade removes participants,
      // messages and receipts. Company announcement channel is protected above.
      const { error } = await supabase
        .from('chat_conversations')
        .delete()
        .eq('company_id', context.companyId)
        .eq('id', conversationId)

      if (error) throw new Error(error.message)

      return NextResponse.json({ success: true })
    }

    return NextResponse.json(
      { success: false, error: 'Unsupported action' },
      { status: 400 }
    )
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Chat delete failed' },
      { status: error.status || 500 }
    )
  }
}
