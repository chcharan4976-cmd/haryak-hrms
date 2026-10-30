import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveRequestContext } from '@/lib/services/company-resolver'

export async function GET() {
  const resolved = await resolveRequestContext()
  if (!resolved.ok) {
    return NextResponse.json(
      { success: false, error: resolved.error.message },
      { status: resolved.error.status }
    )
  }

  const { context } = resolved
  const supabase = createAdminClient()
  if (!supabase) {
    return NextResponse.json({ success: false, error: 'Database unavailable' }, { status: 503 })
  }

  try {
    const { data: notifications, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('company_id', context.companyId)
      .eq('user_id', context.authUserId)
      .order('created_at', { ascending: false })
      .limit(30)

    if (error) {
      console.error('[GET /api/notifications] Query error:', error.message)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    const unreadCount = (notifications || []).filter(n => !n.is_read).length

    return NextResponse.json({
      success: true,
      notifications: notifications || [],
      unreadCount,
    })
  } catch (err: any) {
    console.error('[GET /api/notifications] Unexpected error:', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
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
  const supabase = createAdminClient()
  if (!supabase) {
    return NextResponse.json({ success: false, error: 'Database unavailable' }, { status: 503 })
  }

  try {
    const body = await request.json()
    const { id, all } = body
    const now = new Date().toISOString()

    if (all) {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true, read_at: now })
        .eq('company_id', context.companyId)
        .eq('user_id', context.authUserId)
        .eq('is_read', false)

      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 })
      }

      return NextResponse.json({ success: true, message: 'All notifications marked as read' })
    }

    if (!id) {
      return NextResponse.json({ success: false, error: 'Notification ID is required' }, { status: 400 })
    }

    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true, read_at: now })
      .eq('company_id', context.companyId)
      .eq('user_id', context.authUserId)
      .eq('id', id)

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: 'Notification marked as read' })
  } catch (err: any) {
    console.error('[PATCH /api/notifications] Unexpected error:', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const resolved = await resolveRequestContext()
  if (!resolved.ok) {
    return NextResponse.json(
      { success: false, error: resolved.error.message },
      { status: resolved.error.status }
    )
  }

  const { context } = resolved
  const supabase = createAdminClient()
  if (!supabase) {
    return NextResponse.json({ success: false, error: 'Database unavailable' }, { status: 503 })
  }

  try {
    const body = await request.json()
    const { title, message, type, reference_type, reference_id, user_id } = body

    if (!title || !type) {
      return NextResponse.json({ success: false, error: 'Title and type are required' }, { status: 400 })
    }

    const targetUserId = user_id || context.authUserId

    const { data, error } = await supabase
      .from('notifications')
      .insert({
        company_id: context.companyId,
        user_id: targetUserId,
        title,
        message: message || null,
        type,
        reference_type: reference_type || null,
        reference_id: reference_id || null,
        is_read: false,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, notification: data })
  } catch (err: any) {
    console.error('[POST /api/notifications] Unexpected error:', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
