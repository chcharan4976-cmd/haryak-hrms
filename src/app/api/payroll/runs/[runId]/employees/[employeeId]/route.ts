import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveRequestContext, resolveEmployeeAccess } from '@/lib/services/company-resolver'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string; employeeId: string }> }
) {
  const resolved = await resolveRequestContext()
  if (!resolved.ok) {
    return NextResponse.json({ success: false, error: resolved.error.message }, { status: resolved.error.status })
  }
  const { context } = resolved
  const { runId, employeeId } = await params

  const supabase = createAdminClient()
  if (!supabase) return NextResponse.json({ success: false, error: 'Database unavailable' }, { status: 503 })

  // Resolve employee ID if given code
  let targetEmployeeId = employeeId
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(employeeId)
  if (!isUUID) {
    const { data: emp } = await supabase
      .from('employees')
      .select('id')
      .eq('company_id', context.companyId)
      .eq('employee_code', employeeId.toUpperCase())
      .maybeSingle()
    if (!emp) {
      return NextResponse.json({ success: false, error: 'Employee not found' }, { status: 404 })
    }
    targetEmployeeId = emp.id
  }

  // Authorization check
  const access = resolveEmployeeAccess(context, targetEmployeeId)
  if (access.denied || (access.employeeId && access.employeeId !== targetEmployeeId)) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  }

  // Query payroll employee record
  const { data: record, error: recErr } = await supabase
    .from('payroll_employee_records')
    .select(`
      *,
      payroll_earnings(*),
      payroll_deductions(*)
    `)
    .eq('payroll_run_id', runId)
    .eq('employee_id', targetEmployeeId)
    .maybeSingle()

  if (recErr || !record) {
    return NextResponse.json({ success: false, error: 'Payroll record not found for this employee and run.' }, { status: 404 })
  }

  return NextResponse.json({
    success: true,
    record,
    earnings: record.payroll_earnings || [],
    deductions: record.payroll_deductions || [],
  })
}
