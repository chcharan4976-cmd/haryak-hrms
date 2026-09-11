import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveRequestContext, resolveEmployeeAccess, isAdmin } from '@/lib/services/company-resolver'

export async function GET(request: NextRequest) {
  const resolved = await resolveRequestContext()
  if (!resolved.ok) return NextResponse.json({ success: false, error: resolved.error.message }, { status: resolved.error.status })
  const { context } = resolved

  const { searchParams } = new URL(request.url)
  const queryEmployeeId = searchParams.get('employee_id')
  const status = searchParams.get('status')

  const access = resolveEmployeeAccess(context, queryEmployeeId)
  if (access.denied) return NextResponse.json({ success: false, error: access.message }, { status: 403 })

  const supabase = createAdminClient()
  if (!supabase) return NextResponse.json({ success: false, error: 'DB unavailable' }, { status: 503 })

  let query = supabase
    .from('leave_requests')
    .select('*, leave_types(*), employees(id, full_name, employee_code, departments:department_id(name))')
    .eq('company_id', context.companyId)
    .order('applied_at', { ascending: false })

  if (access.employeeId) {
    query = query.eq('employee_id', access.employeeId)
  }
  if (status) {
    query = query.eq('status', status.toLowerCase())
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

  const formattedRequests = (data || []).map((r: any) => ({
    id: r.id,
    employee_id: r.employee_id,
    leave_type_id: r.leave_type_id,
    leave_type: r.leave_types?.name || 'Leave',
    leave_type_code: r.leave_types?.code || '',
    start_date: r.start_date,
    end_date: r.end_date,
    total_days: Number(r.total_days),
    days: Number(r.total_days),
    reason: r.reason || '',
    status: r.status === 'approved' ? 'Approved' : r.status === 'rejected' ? 'Rejected' : r.status === 'cancelled' ? 'Cancelled' : 'Pending',
    applied_at: r.applied_at || r.created_at,
    created_at: r.created_at,
    employee_name: r.employees?.full_name || 'Employee',
    employee_code: r.employees?.employee_code || '',
    department: r.employees?.departments?.name || '',
    employee: r.employees ? {
      id: r.employees.id,
      name: r.employees.full_name,
      code: r.employees.employee_code,
      department: r.employees.departments?.name || '',
    } : null,
  }))

  return NextResponse.json({
    success: true,
    requests: formattedRequests,
    data: formattedRequests,
    total: formattedRequests.length,
  })
}

export async function POST(request: NextRequest) {
  const resolved = await resolveRequestContext()
  if (!resolved.ok) return NextResponse.json({ success: false, error: resolved.error.message }, { status: resolved.error.status })
  const { context } = resolved

  const body = await request.json()
  const { employee_id, leave_type_id, start_date, end_date, total_days, reason } = body

  const targetEmployeeId = employee_id || (context.roles.every(r => r === 'EMPLOYEE') ? context.employeeId : null)

  const access = resolveEmployeeAccess(context, targetEmployeeId)
  if (access.denied || (access.employeeId && access.employeeId !== targetEmployeeId)) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  }

  const supabase = createAdminClient()
  if (!supabase) return NextResponse.json({ success: false, error: 'DB unavailable' }, { status: 503 })

  // Resolve leave_type_id if a code or string was provided instead of UUID
  let resolvedLeaveTypeId = leave_type_id
  if (leave_type_id && !leave_type_id.includes('-')) {
    const { data: lt } = await supabase
      .from('leave_types')
      .select('id')
      .eq('company_id', context.companyId)
      .ilike('code', leave_type_id)
      .maybeSingle()
    if (lt) resolvedLeaveTypeId = lt.id
  }

  if (!resolvedLeaveTypeId) {
    // Pick first available leave type for this company
    const { data: defaultLt } = await supabase
      .from('leave_types')
      .select('id')
      .eq('company_id', context.companyId)
      .limit(1)
      .maybeSingle()
    resolvedLeaveTypeId = defaultLt?.id
  }

  const days = Number(total_days) || (start_date && end_date
    ? Math.max(1, Math.round((new Date(end_date).getTime() - new Date(start_date).getTime()) / 86400000) + 1)
    : 1)

  const { data, error } = await supabase
    .from('leave_requests')
    .insert({
      company_id: context.companyId,
      employee_id: targetEmployeeId,
      leave_type_id: resolvedLeaveTypeId,
      start_date,
      end_date,
      total_days: days,
      reason: reason || '',
      status: 'pending',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

  return NextResponse.json({
    success: true,
    request: data,
    data,
  })
}

export async function PUT(request: NextRequest) {
  const resolved = await resolveRequestContext()
  if (!resolved.ok) return NextResponse.json({ success: false, error: resolved.error.message }, { status: resolved.error.status })
  const { context } = resolved

  if (!isAdmin(context) && !context.roles.includes('MANAGER')) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const { id, status, rejection_reason } = body

  if (!id || !status) {
    return NextResponse.json({ success: false, error: 'Missing id or status' }, { status: 400 })
  }

  const supabase = createAdminClient()
  if (!supabase) return NextResponse.json({ success: false, error: 'DB unavailable' }, { status: 503 })

  const normalizedStatus = status.toLowerCase()

  const { data: updatedRequest, error } = await supabase
    .from('leave_requests')
    .update({
      status: normalizedStatus,
      approved_by: context.authUserId,
      approved_at: new Date().toISOString(),
      rejection_reason: rejection_reason || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('company_id', context.companyId)
    .select('*, leave_types(*)')
    .single()

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

  // If approved, deduct from employee leave_balance
  if (normalizedStatus === 'approved' && updatedRequest) {
    const currentFy = new Date().getFullYear()
    const { data: balance } = await supabase
      .from('leave_balances')
      .select('*')
      .eq('employee_id', updatedRequest.employee_id)
      .eq('leave_type_id', updatedRequest.leave_type_id)
      .eq('fiscal_year', currentFy)
      .maybeSingle()

    if (balance) {
      const days = Number(updatedRequest.total_days)
      const newUsed = Number(balance.used || 0) + days
      const newClosing = Math.max(0, Number(balance.closing_balance || 0) - days)

      await supabase
        .from('leave_balances')
        .update({
          used: newUsed,
          closing_balance: newClosing,
          updated_at: new Date().toISOString(),
        })
        .eq('id', balance.id)
    }
  }

  return NextResponse.json({
    success: true,
    request: updatedRequest,
    data: updatedRequest,
  })
}
