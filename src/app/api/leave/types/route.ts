import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveRequestContext } from '@/lib/services/company-resolver'

export async function GET(request: NextRequest) {
  const resolved = await resolveRequestContext()
  if (!resolved.ok) return NextResponse.json({ success: false, error: resolved.error.message }, { status: resolved.error.status })
  const { context } = resolved

  const supabase = createAdminClient()
  if (!supabase) return NextResponse.json({ success: false, error: 'DB unavailable' }, { status: 503 })

  const { data, error } = await supabase
    .from('leave_types')
    .select('*')
    .eq('company_id', context.companyId)
    .eq('is_active', true)
    .order('name', { ascending: true })

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

  const formatted = (data || []).map((t: any) => ({
    id: t.id,
    name: t.name,
    code: t.code,
    description: t.description,
    annual_quota: Number(t.annual_quota),
    quota: Number(t.annual_quota),
    is_paid: t.is_paid,
    color: t.color || '#3B82F6',
  }))

  return NextResponse.json({
    success: true,
    types: formatted,
    data: formatted,
  })
}
