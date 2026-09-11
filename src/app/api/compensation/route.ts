import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveRequestContext } from '@/lib/services/company-resolver'

export async function GET(request: NextRequest) {
  const resolved = await resolveRequestContext()
  if (!resolved.ok) {
    return NextResponse.json({ success: false, error: resolved.error.message }, { status: resolved.error.status })
  }
  const { context } = resolved

  const supabase = createAdminClient()
  if (!supabase) return NextResponse.json({ success: false, error: 'Database unavailable' }, { status: 503 })

  // 1. Fetch active salary structures with employee info
  const { data: structures, error: structError } = await supabase
    .from('salary_structures')
    .select(`
      *,
      employees (
        id,
        full_name,
        employee_code,
        departments:department_id(name)
      ),
      salary_structure_components (
        *,
        salary_components (*)
      )
    `)
    .eq('company_id', context.companyId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })

  if (structError) {
    return NextResponse.json({ success: false, error: structError.message }, { status: 500 })
  }

  // 2. Fetch company salary components
  const { data: componentsData, error: compError } = await supabase
    .from('salary_components')
    .select('*')
    .eq('company_id', context.companyId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  const formattedCompensations = (structures || []).map((s: any) => ({
    id: s.id,
    annual_ctc: Number(s.annual_ctc),
    monthly_gross: Number(s.monthly_gross),
    effective_date: s.effective_from,
    status: s.status,
    employee: {
      id: s.employees?.id || s.employee_id,
      name: s.employees?.full_name || 'Employee',
      code: s.employees?.employee_code || '',
      department: s.employees?.departments?.name || '',
    },
    components: s.salary_structure_components || [],
  }))

  const formattedComponents = (componentsData || []).map((c: any) => ({
    id: c.id,
    name: c.name,
    code: c.code,
    type: c.type === 'earning' ? 'Earning' : 'Deduction',
    calculation_type: c.category || 'Standard',
    statutory: Boolean(c.is_statutory),
  }))

  return NextResponse.json({
    success: true,
    compensations: formattedCompensations,
    components: formattedComponents,
    data: formattedCompensations,
  })
}
