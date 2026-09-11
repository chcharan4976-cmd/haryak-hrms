import { NextResponse } from 'next/server'
import { createAdminClient, isSupabaseConfigured } from '@/lib/supabase/admin'

export async function GET() {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ success: true, designations: [], total: 0 })
    }

    const supabase = createAdminClient()
    if (!supabase) {
      return NextResponse.json({ success: true, designations: [], total: 0 })
    }

    const { data: designations, error } = await supabase
      .from('designations')
      .select('id, name, level, department_id, departments:department_id(name), is_active')
      .order('name', { ascending: true })

    if (error) {
      console.error('Error fetching designations:', error.message)
      return NextResponse.json({ success: false, designations: [], total: 0 }, { status: 500 })
    }

    const enriched = (designations || []).map((d: any) => ({
      id: d.id,
      name: d.name,
      level: d.level || 1,
      department: d.departments?.name || 'General',
      status: d.is_active !== false ? 'Active' : 'Inactive',
    }))

    return NextResponse.json({ success: true, designations: enriched, total: enriched.length })
  } catch (error: any) {
    console.error('Designations API error:', error)
    return NextResponse.json({ success: false, designations: [], total: 0 }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { name, level, departmentId } = body

    if (!name?.trim()) {
      return NextResponse.json({ success: false, error: 'Designation name is required.' }, { status: 400 })
    }

    if (!isSupabaseConfigured()) {
      return NextResponse.json({ success: false, error: 'Database not configured.' }, { status: 500 })
    }

    const supabase = createAdminClient()
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Database not available.' }, { status: 500 })
    }

    const { data: company } = await supabase.from('companies').select('id').limit(1).maybeSingle()
    if (!company) {
      return NextResponse.json({ success: false, error: 'Company not found.' }, { status: 500 })
    }

    const { data: desig, error } = await supabase
      .from('designations')
      .insert({
        company_id: company.id,
        name: name.trim(),
        level: level || 1,
        department_id: departmentId || null,
        is_active: true,
      })
      .select('id, name, level')
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ success: false, error: 'A designation with this name already exists.' }, { status: 409 })
      }
      console.error('Error creating designation:', error.message)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, designation: desig })
  } catch (error: any) {
    console.error('Designation creation error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
