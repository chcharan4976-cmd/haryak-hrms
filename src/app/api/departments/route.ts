import { NextResponse } from 'next/server'
import { createAdminClient, isSupabaseConfigured } from '@/lib/supabase/admin'

export async function GET() {
  try {
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ success: true, departments: [], total: 0 })
    }

    const supabase = createAdminClient()
    if (!supabase) {
      return NextResponse.json({ success: true, departments: [], total: 0 })
    }

    const { data: departments, error } = await supabase
      .from('departments')
      .select('id, name, code, description, is_active, created_at')
      .order('name', { ascending: true })

    if (error) {
      console.error('Error fetching departments:', error.message)
      return NextResponse.json({ success: false, departments: [], total: 0 }, { status: 500 })
    }

    // Get employee counts per department
    const { data: employees } = await supabase
      .from('employees')
      .select('department_id')
      .eq('employment_status', 'active')
      .eq('is_active', true)

    const deptCounts: Record<string, number> = {}
    employees?.forEach((e: any) => {
      if (e.department_id) {
        deptCounts[e.department_id] = (deptCounts[e.department_id] || 0) + 1
      }
    })

    const enriched = (departments || []).map((d: any) => ({
      id: d.id,
      name: d.name,
      code: d.code || '',
      description: d.description || '',
      employeeCount: deptCounts[d.id] || 0,
      status: d.is_active !== false ? 'Active' : 'Inactive',
    }))

    return NextResponse.json({ success: true, departments: enriched, total: enriched.length })
  } catch (error: any) {
    console.error('Departments API error:', error)
    return NextResponse.json({ success: false, departments: [], total: 0 }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { name, code, description } = body

    if (!name?.trim()) {
      return NextResponse.json({ success: false, error: 'Department name is required.' }, { status: 400 })
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

    const { data: dept, error } = await supabase
      .from('departments')
      .insert({
        company_id: company.id,
        name: name.trim(),
        code: code?.trim() || null,
        description: description?.trim() || null,
        is_active: true,
      })
      .select('id, name, code')
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ success: false, error: 'A department with this name already exists.' }, { status: 409 })
      }
      console.error('Error creating department:', error.message)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, department: dept })
  } catch (error: any) {
    console.error('Department creation error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
