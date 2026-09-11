import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveRequestContext, resolveEmployeeAccess } from '@/lib/services/company-resolver'

export async function GET(request: NextRequest) {
  const resolved = await resolveRequestContext()
  if (!resolved.ok) {
    return NextResponse.json({ success: false, error: resolved.error.message }, { status: resolved.error.status })
  }
  const { context } = resolved

  const { searchParams } = new URL(request.url)
  const queryEmployeeId = searchParams.get('employee_id')
  const monthParam = searchParams.get('month')
  let periodMonth = searchParams.get('period_month')
  let periodYear = searchParams.get('period_year')

  const limitParam = searchParams.get('limit')

  if (monthParam && monthParam.includes('-')) {
    const [y, m] = monthParam.split('-')
    if (y && m) {
      periodYear = parseInt(y, 10).toString()
      periodMonth = parseInt(m, 10).toString()
    }
  }

  const access = resolveEmployeeAccess(context, queryEmployeeId)
  if (access.denied) {
    return NextResponse.json({ success: false, error: access.message }, { status: 403 })
  }

  const supabase = createAdminClient()
  if (!supabase) return NextResponse.json({ success: false, error: 'Database unavailable' }, { status: 503 })

  let query = supabase
    .from('payslips')
    .select(`
      *,
      employees (
        id,
        employee_code,
        full_name,
        departments:department_id(name),
        designations:designation_id(name)
      )
    `)
    .eq('company_id', context.companyId)
    .order('period_year', { ascending: false })
    .order('period_month', { ascending: false })

  if (access.employeeId) {
    query = query.eq('employee_id', access.employeeId)
  }
  if (periodMonth) {
    query = query.eq('period_month', parseInt(periodMonth, 10))
  }
  if (periodYear) {
    query = query.eq('period_year', parseInt(periodYear, 10))
  }
  if (limitParam) {
    const lim = parseInt(limitParam, 10)
    if (!isNaN(lim) && lim > 0) {
      query = query.limit(lim)
    }
  }

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ]

  const formattedPayslips = (data || []).map((p: any) => {
    const periodName = p.period_month && p.period_year ? `${MONTH_NAMES[p.period_month - 1]} ${p.period_year}` : ''
    const grossEarnings = Number(p.snapshot_data?.grossEarnings ?? p.gross_salary ?? 0)
    const totalDeductions = Number(p.snapshot_data?.totalDeductions ?? p.total_deductions ?? 0)

    return {
      id: p.id,
      employee_id: p.employee_id,
      period_month: p.period_month,
      period_year: p.period_year,
      period: periodName,
      net_salary: Number(p.net_salary),
      gross_earnings: grossEarnings,
      gross_salary: grossEarnings,
      total_deductions: totalDeductions,
      status: p.status || 'generated',
      pdf_url: p.pdf_url,
      created_at: p.created_at,
      snapshot_data: p.snapshot_data,
      employee: {
        id: p.employees?.id || p.employee_id,
        code: p.employees?.employee_code || p.snapshot_data?.employeeId || '',
        employee_code: p.employees?.employee_code || p.snapshot_data?.employeeId || '',
        name: p.employees?.full_name || p.snapshot_data?.employeeName || 'Employee',
        full_name: p.employees?.full_name || p.snapshot_data?.employeeName || 'Employee',
        department: p.employees?.departments?.name || p.snapshot_data?.department || '',
        designation: p.employees?.designations?.name || p.snapshot_data?.designation || '',
      },
    }
  })

  return NextResponse.json({
    success: true,
    payslips: formattedPayslips,
    data: formattedPayslips,
    total: formattedPayslips.length,
  })
}
