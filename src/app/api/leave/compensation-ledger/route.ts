import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestContext, resolveEmployeeAccess, isAdmin } from '@/lib/services/company-resolver'
import {
  getEmployeeAnnualCompensationLedger,
  getCompanyAnnualCompensationAuditList,
  saveAnnualLeaveAudit,
  settleAnnualLeaveCompensation,
} from '@/lib/services/leave-compensation-ledger-service'

export async function GET(request: NextRequest) {
  const resolved = await resolveRequestContext()
  if (!resolved.ok) {
    return NextResponse.json({ success: false, error: resolved.error.message }, { status: resolved.error.status })
  }
  const { context } = resolved

  const { searchParams } = new URL(request.url)
  const currentYear = new Date().getFullYear()
  const yearParam = searchParams.get('year')
  const year = yearParam ? parseInt(yearParam, 10) : currentYear
  const queryEmployeeId = searchParams.get('employee_id')
  const isAuditMode = searchParams.get('mode') === 'audit' || searchParams.get('audit') === 'true'

  // If audit mode is requested and user is an administrator, return all employee ledgers for company
  if (isAuditMode && isAdmin(context)) {
    const list = await getCompanyAnnualCompensationAuditList(context.companyId, year)
    return NextResponse.json({
      success: true,
      year,
      audit_list: list,
    })
  }

  // Otherwise resolve access for specific employee
  const access = resolveEmployeeAccess(context, queryEmployeeId)
  if (access.denied) {
    return NextResponse.json({ success: false, error: access.message }, { status: 403 })
  }

  const targetEmployeeId = access.employeeId || context.employeeId
  if (!targetEmployeeId) {
    return NextResponse.json({ success: false, error: 'Employee ID is required.' }, { status: 400 })
  }

  const ledger = await getEmployeeAnnualCompensationLedger(context.companyId, targetEmployeeId, year)
  return NextResponse.json({
    success: true,
    year,
    ledger,
  })
}

export async function POST(request: NextRequest) {
  const resolved = await resolveRequestContext()
  if (!resolved.ok) {
    return NextResponse.json({ success: false, error: resolved.error.message }, { status: resolved.error.status })
  }
  const { context } = resolved

  // Audit and settlement require administrator permissions
  if (!isAdmin(context)) {
    return NextResponse.json({ success: false, error: 'Administrator privileges are required for annual leave audit and settlement.' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const { action, employee_id, year, approved_days, approved_amount, audit_notes, status, payroll_period_id } = body

    if (!employee_id) {
      return NextResponse.json({ success: false, error: 'Employee ID is required.' }, { status: 400 })
    }

    const currentYear = new Date().getFullYear()
    const targetYear = year ? parseInt(year, 10) : currentYear

    if (action === 'settle') {
      const res = await settleAnnualLeaveCompensation({
        companyId: context.companyId,
        employeeId: employee_id,
        year: targetYear,
        payrollPeriodId: payroll_period_id,
        settledBy: context.authUserId,
      })
      return NextResponse.json({
        success: true,
        message: 'Annual leave compensation settled successfully.',
        settlement: res,
      })
    }

    // Default action: audit review / approval
    const updatedLedger = await saveAnnualLeaveAudit({
      companyId: context.companyId,
      employeeId: employee_id,
      year: targetYear,
      approvedDays: Number(approved_days || 0),
      approvedAmount: Number(approved_amount || 0),
      auditNotes: audit_notes,
      auditedBy: context.authUserId,
      status: status === 'REJECTED' ? 'REJECTED' : 'APPROVED',
    })

    return NextResponse.json({
      success: true,
      message: `Annual leave audit ${status === 'REJECTED' ? 'rejected' : 'approved'} successfully.`,
      ledger: updatedLedger,
    })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || 'Audit action failed' }, { status: 500 })
  }
}
