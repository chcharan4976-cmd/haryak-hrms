import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveRequestContext, resolveEmployeeAccess } from '@/lib/services/company-resolver'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolved = await resolveRequestContext()
  if (!resolved.ok) {
    return NextResponse.json({ success: false, error: resolved.error.message }, { status: resolved.error.status })
  }
  const { context } = resolved
  const { id } = await params

  const supabase = createAdminClient()
  if (!supabase) return NextResponse.json({ success: false, error: 'Database unavailable' }, { status: 503 })

  const { data, error } = await supabase
    .from('payslips')
    .select('*, employees(employee_code, full_name)')
    .eq('company_id', context.companyId)
    .eq('id', id)
    .single()

  if (error || !data) {
    return NextResponse.json({ success: false, error: 'Payslip not found' }, { status: 404 })
  }

  const access = resolveEmployeeAccess(context, data.employee_id)
  if (access.denied || (access.employeeId && access.employeeId !== data.employee_id)) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  }

  return NextResponse.json({
    success: true,
    payslip: data,
    data,
  })
}
