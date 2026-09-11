import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveRequestContext, resolveEmployeeAccess } from '@/lib/services/company-resolver'

export async function GET(request: NextRequest) {
  const resolved = await resolveRequestContext()
  if (!resolved.ok) return NextResponse.json({ success: false, error: resolved.error.message }, { status: resolved.error.status })
  const { context } = resolved

  const { searchParams } = new URL(request.url)
  const queryEmployeeId = searchParams.get('employee_id')

  const today = new Date()
  let currentFy = today.getFullYear()
  if (today.getMonth() < 3) currentFy -= 1

  const fiscalYear = parseInt(searchParams.get('fiscal_year') || currentFy.toString(), 10)

  const access = resolveEmployeeAccess(context, queryEmployeeId)
  if (access.denied) return NextResponse.json({ success: false, error: access.message }, { status: 403 })

  const supabase = createAdminClient()
  if (!supabase) return NextResponse.json({ success: false, error: 'DB unavailable' }, { status: 503 })

  let query = supabase
    .from('leave_balances')
    .select('*, leave_types(*), employees!inner(id, company_id, full_name, employee_code)')
    .eq('employees.company_id', context.companyId)
    .eq('fiscal_year', fiscalYear)

  if (access.employeeId) {
    query = query.eq('employee_id', access.employeeId)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

  const formattedBalances = (data || []).map((b: any) => ({
    id: b.id,
    employee_id: b.employee_id,
    leave_type_id: b.leave_type_id,
    type: b.leave_types?.name || 'Leave',
    code: b.leave_types?.code || '',
    leave_type: b.leave_types?.name || 'Leave',
    color: b.leave_types?.color || '#3B82F6',
    opening_balance: Number(b.opening_balance || 0),
    accrued: Number(b.accrued || 0),
    used: Number(b.used || 0),
    allocated: Number(b.opening_balance || 0) + Number(b.accrued || 0),
    remaining: Number(b.closing_balance || 0),
    closing_balance: Number(b.closing_balance || 0),
    fiscal_year: b.fiscal_year,
  }))

  return NextResponse.json({
    success: true,
    balances: formattedBalances,
    data: formattedBalances,
  })
}
