import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveRequestContext, resolveEmployeeAccess, isAdmin } from '@/lib/services/company-resolver'

export async function GET(request: Request) {
  try {
    const resolution = await resolveRequestContext()
    if (!resolution.ok) {
      return NextResponse.json(
        { success: false, error: resolution.error.message },
        { status: resolution.error.status }
      )
    }
    const { companyId } = resolution.context

    const { searchParams } = new URL(request.url)
    const requestedEmployeeId = searchParams.get('employee_id')
    const access = resolveEmployeeAccess(resolution.context, requestedEmployeeId)
    if (access.denied) {
      return NextResponse.json({ success: false, error: access.message }, { status: 403 })
    }

    const supabase = createAdminClient()
    if (!supabase) {
      return NextResponse.json({ success: true, requests: [] })
    }

    let query = supabase
      .from('hr_requests')
      .select('*, employees:employee_id(full_name, employee_code)')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })

    if (access.employeeId) {
      query = query.eq('employee_id', access.employeeId)
    }

    const { data, error } = await query
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      requests: (data || []).map((r: any) => ({
        id: r.id,
        ticketNumber: r.ticket_number,
        category: r.category,
        subject: r.subject,
        description: r.description,
        status: r.status,
        employeeName: r.employees?.full_name || 'Unknown',
        employeeCode: r.employees?.employee_code || '',
        resolutionNotes: r.resolution_notes,
        resolvedAt: r.resolved_at,
        createdAt: r.created_at,
      })),
    })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const resolution = await resolveRequestContext()
    if (!resolution.ok) {
      return NextResponse.json(
        { success: false, error: resolution.error.message },
        { status: resolution.error.status }
      )
    }
    const { companyId, employeeId } = resolution.context

    if (!employeeId) {
      return NextResponse.json(
        { success: false, error: 'No employee profile linked.' },
        { status: 403 }
      )
    }

    const body = await request.json()
    if (!body.category || !body.subject || !body.description) {
      return NextResponse.json(
        { success: false, error: 'Category, subject, and description are required.' },
        { status: 400 }
      )
    }

    const supabase = createAdminClient()
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Database unavailable.' }, { status: 500 })
    }

    // Generate ticket number
    const ticketNumber = `HRQ-${Date.now().toString().slice(-8)}`

    const { data, error } = await supabase
      .from('hr_requests')
      .insert({
        company_id: companyId,
        employee_id: employeeId,
        ticket_number: ticketNumber,
        category: body.category,
        subject: body.subject,
        description: body.description,
        status: 'OPEN',
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, request: data })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
