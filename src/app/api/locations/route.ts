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
    .from('locations')
    .select('*')
    .eq('company_id', context.companyId)
    .order('name', { ascending: true })

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

  const formattedLocations = (data || []).map((l: any) => ({
    id: l.id,
    name: l.name,
    address: l.address,
    city: l.city,
    state: l.state,
    pincode: l.pincode,
    is_active: l.is_active,
  }))

  return NextResponse.json({
    success: true,
    locations: formattedLocations,
    data: formattedLocations,
    total: formattedLocations.length,
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
  const { name, address, city, state, pincode, is_active } = body

  if (!name?.trim()) {
    return NextResponse.json({ success: false, error: 'Location name is required' }, { status: 400 })
  }

  const supabase = createAdminClient()
  if (!supabase) return NextResponse.json({ success: false, error: 'DB unavailable' }, { status: 503 })

  const { data, error } = await supabase
    .from('locations')
    .insert({
      company_id: context.companyId,
      name: name.trim(),
      address: address || null,
      city: city || null,
      state: state || null,
      pincode: pincode || null,
      is_active: is_active ?? true,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

  return NextResponse.json({
    success: true,
    location: data,
    data,
  })
}

export async function PUT(request: NextRequest) {
  const resolved = await resolveRequestContext()
  if (!resolved.ok) return NextResponse.json({ success: false, error: resolved.error.message }, { status: resolved.error.status })
  const { context } = resolved

  if (!isAdmin(context)) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const { id, name, address, city, state, pincode, is_active } = body

  const supabase = createAdminClient()
  if (!supabase) return NextResponse.json({ success: false, error: 'DB unavailable' }, { status: 503 })

  const { data, error } = await supabase
    .from('locations')
    .update({
      name,
      address,
      city,
      state,
      pincode,
      is_active,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('company_id', context.companyId)
    .select()
    .single()

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

  return NextResponse.json({
    success: true,
    location: data,
    data,
  })
}
