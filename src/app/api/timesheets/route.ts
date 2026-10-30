import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestContext, isAdmin, resolveAuthenticatedEmployee } from '@/lib/services/company-resolver'
import {
  getEmployeeMonthlyTimesheet,
  saveTimesheetDraft,
  submitTimesheet,
  listAdminTimesheets,
} from '@/lib/services/timesheet-service'

export async function GET(request: NextRequest) {
  try {
    const resolved = await resolveRequestContext()
    if (!resolved.ok) {
      return NextResponse.json({ success: false, error: resolved.error.message }, { status: resolved.error.status })
    }
    const { context } = resolved

    const { searchParams } = new URL(request.url)
    const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()))
    const month = parseInt(searchParams.get('month') || String(new Date().getMonth() + 1))
    const status = searchParams.get('status') || 'all'
    const targetEmployeeId = searchParams.get('employeeId')

    // If an administrator is querying a list of all timesheets
    if (isAdmin(context) && searchParams.get('view') === 'admin') {
      const timesheets = await listAdminTimesheets(context.companyId, {
        status,
        year,
        month,
        employeeId: targetEmployeeId || undefined,
      })
      return NextResponse.json({ success: true, data: timesheets, timesheets })
    }

    // Otherwise, resolve for a specific employee
    let employeeId = targetEmployeeId
    if (!employeeId) {
      const empRes = await resolveAuthenticatedEmployee()
      if (!empRes.ok) {
        return NextResponse.json({ success: false, error: empRes.error.message }, { status: empRes.error.status })
      }
      employeeId = empRes.employee.employeeId
    } else if (!isAdmin(context)) {
      // Employees can only view their own
      const empRes = await resolveAuthenticatedEmployee()
      if (!empRes.ok || empRes.employee.employeeId !== employeeId) {
        return NextResponse.json({ success: false, error: 'Access denied: You can only view your own timesheet.' }, { status: 403 })
      }
    }

    const timesheet = await getEmployeeMonthlyTimesheet(context.companyId, employeeId, year, month)

    return NextResponse.json({
      success: true,
      data: timesheet,
      timesheet,
    })
  } catch (error: any) {
    console.error('[GET /api/timesheets] Error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const resolved = await resolveRequestContext()
    if (!resolved.ok) {
      return NextResponse.json({ success: false, error: resolved.error.message }, { status: resolved.error.status })
    }
    const { context } = resolved

    const body = await request.json()
    const { action = 'draft', year, month, entries = [], employeeId: requestedEmpId } = body

    let targetEmployeeId = requestedEmpId
    if (!targetEmployeeId || !isAdmin(context)) {
      const empRes = await resolveAuthenticatedEmployee()
      if (!empRes.ok) {
        return NextResponse.json({ success: false, error: empRes.error.message }, { status: empRes.error.status })
      }
      targetEmployeeId = empRes.employee.employeeId
    }

    const userContext = {
      userId: context.authUserId,
      userEmail: context.email,
      userName: context.fullName,
    }

    const currentYear = year || new Date().getFullYear()
    const currentMonth = month || new Date().getMonth() + 1

    const normalizedAction = String(action || 'draft').trim().toLowerCase()

    if (normalizedAction === 'submit') {
      // First save draft if entries provided
      if (Array.isArray(entries) && entries.length > 0) {
        await saveTimesheetDraft(context.companyId, targetEmployeeId, currentYear, currentMonth, entries, userContext)
      }
      const submitted = await submitTimesheet(context.companyId, targetEmployeeId, currentYear, currentMonth, userContext)
      return NextResponse.json({
        success: true,
        message: 'Timesheet submitted successfully for administrator review.',
        data: submitted,
      })
    }

    // Default: Save Draft
    const saved = await saveTimesheetDraft(context.companyId, targetEmployeeId, currentYear, currentMonth, entries, userContext)
    return NextResponse.json({
      success: true,
      message: 'Timesheet draft saved successfully.',
      data: saved,
    })
  } catch (error: any) {
    console.error('[POST /api/timesheets] Error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 400 })
  }
}
