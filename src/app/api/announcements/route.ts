import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveRequestContext, isAdmin } from '@/lib/services/company-resolver'

export async function GET(request: NextRequest) {
  const resolved = await resolveRequestContext()
  if (!resolved.ok) return NextResponse.json({ success: false, error: resolved.error.message }, { status: resolved.error.status })
  const { context } = resolved

  const supabase = createAdminClient()
  if (!supabase) return NextResponse.json({ success: false, error: 'DB unavailable' }, { status: 503 })

  const { data, error } = await supabase
    .from('announcements')
    .select('*, users:created_by(full_name)')
    .eq('company_id', context.companyId)
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

  const formattedAnnouncements = (data || []).map((a: any) => ({
    id: a.id,
    title: a.title,
    content: a.content,
    category: a.category || 'General',
    is_pinned: Boolean(a.is_pinned),
    created_at: a.created_at,
    author: a.users?.full_name ? { name: a.users.full_name } : 'Haryak HR Team',
  }))

  return NextResponse.json({
    success: true,
    announcements: formattedAnnouncements,
    data: formattedAnnouncements,
    total: formattedAnnouncements.length,
  })
}

export async function POST(request: NextRequest) {
  const resolved = await resolveRequestContext()
  if (!resolved.ok) return NextResponse.json({ success: false, error: resolved.error.message }, { status: resolved.error.status })
  const { context } = resolved

  if (!isAdmin(context)) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const { title, content, category, priority, is_pinned, is_published, target_type, target_departments, target_employees } = body

  if (!title?.trim() || !content?.trim()) {
    return NextResponse.json({ success: false, error: 'Title and content are required' }, { status: 400 })
  }

  const supabase = createAdminClient()
  if (!supabase) return NextResponse.json({ success: false, error: 'DB unavailable' }, { status: 503 })

  const { data, error } = await supabase
    .from('announcements')
    .insert({
      company_id: context.companyId,
      title: title.trim(),
      content: content.trim(),
      category: category || 'General',
      priority: priority || 'normal',
      is_pinned: Boolean(is_pinned),
      is_published: is_published ?? true,
      target_type: target_type || 'all',
      target_departments: target_departments || null,
      target_employees: target_employees || null,
      created_by: context.authUserId,
      published_at: new Date().toISOString(),
    })
    .select('*, users:created_by(full_name)')
    .single()

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

  const formatted = {
    id: data.id,
    title: data.title,
    content: data.content,
    category: data.category || 'General',
    is_pinned: Boolean(data.is_pinned),
    created_at: data.created_at,
    author: data.users?.full_name ? { name: data.users.full_name } : context.fullName,
  }

  return NextResponse.json({
    success: true,
    announcement: formatted,
    data: formatted,
  })
}
