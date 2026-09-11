import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveRequestContext } from '@/lib/services/company-resolver'
import { createAuditLog } from '@/lib/services/audit-service'
import { amountToWords } from '@/lib/utils/amount-to-words'
import { formatHumanDate, formatPeriodRange } from '@/lib/utils/format'

function maskBankAccount(accountStr: string | null) {
  if (!accountStr || accountStr.length < 4) return 'Not provided'
  return '*'.repeat(Math.max(0, accountStr.length - 4)) + accountStr.slice(-4)
}

export async function POST(request: Request) {
  const auth = await resolveRequestContext()
  if (!auth.ok) return NextResponse.json({ success: false, error: auth.error.message }, { status: auth.error.status })

  const { companyId, roles, authUserId, email, fullName } = auth.context
  if (!roles.some(r => ['SUPER_ADMIN', 'HR_ADMIN', 'PAYROLL_ADMIN'].includes(r))) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 })
  }

  const body = await request.json()
  const { payroll_run_id } = body
  if (!payroll_run_id) return NextResponse.json({ success: false, error: 'Missing payroll_run_id' }, { status: 400 })

  const admin = createAdminClient()
  if (!admin) return NextResponse.json({ success: false, error: 'Database error' }, { status: 500 })

  const { data: run, error: runErr } = await admin
    .from('payroll_runs')
    .select('*, payroll_period:payroll_periods(*)')
    .eq('id', payroll_run_id)
    .eq('company_id', companyId)
    .single()
    
  if (runErr || !run) return NextResponse.json({ success: false, error: 'Payroll run not found' }, { status: 404 })

  if (run.status === 'approved' || run.status === 'locked') {
    return NextResponse.json({ success: false, error: 'Payroll run is already approved/locked' }, { status: 400 })
  }

  // 1. Fetch all records and validate deduction reconciliation invariant & bank accounts
  const { data: records, error: recErr } = await admin
    .from('payroll_employee_records')
    .select(`
      *,
      payroll_earnings(*),
      payroll_deductions(*),
      employee:employees(
        *,
        employee_bank_accounts(*),
        employee_statutory_details(*)
      )
    `)
    .eq('payroll_run_id', payroll_run_id)

  if (recErr) return NextResponse.json({ success: false, error: recErr.message }, { status: 500 })

  for (const record of records || []) {
    // Check if record has unaddressed errors
    if (record.status === 'error' || (record.errors && record.errors.length > 0)) {
      return NextResponse.json({
        success: false,
        error: `Cannot approve payroll run: Employee ${record.employee_code} has errors: ${(record.errors || []).map((e: any) => e.message || e.code).join(', ')}`,
        employee: record.employee_code,
      }, { status: 400 })
    }

    // Check bank account blocker for Direct Bank Transfer
    const primaryBank = record.employee?.employee_bank_accounts?.find((b: any) => b.is_primary) || record.employee?.employee_bank_accounts?.[0]
    const hasBank = primaryBank && (primaryBank.account_number_masked || primaryBank.account_number_encrypted || primaryBank.account_number)
    const paymentMode = record.payment_mode || 'Direct Bank Transfer'
    if (paymentMode.toLowerCase().includes('bank') && !hasBank) {
      return NextResponse.json({
        success: false,
        error: `Bank account missing for ${record.employee_name} (${record.employee_code}): Direct Bank Transfer payout requires an active bank account. Approval blocked.`,
        employee: record.employee_code,
      }, { status: 400 })
    }

    const sumDeductions = (record.payroll_deductions || []).reduce((sum: number, d: any) => sum + Number(d.amount), 0)
    const expectedDeductions = Number(record.total_deductions)
    if (Math.abs(sumDeductions - expectedDeductions) > 0.01) {
      return NextResponse.json({
        success: false,
        error: `Deduction reconciliation mismatch for ${record.employee_name} (${record.employee_code}): Total deductions (₹${expectedDeductions}) does not match sum of deduction lines (₹${sumDeductions}). Approval blocked.`,
        employee: record.employee_code,
        expectedDeductions,
        sumDeductions,
        deductionLines: record.payroll_deductions,
      }, { status: 400 })
    }
  }

  // 2. Lock and approve
  const { error: updateErr } = await admin
    .from('payroll_runs')
    .update({
      status: 'approved',
      approved_at: new Date().toISOString(),
      approved_by: authUserId,
      locked_at: new Date().toISOString(),
      locked_by: authUserId,
    })
    .eq('id', payroll_run_id)

  if (updateErr) return NextResponse.json({ success: false, error: updateErr.message }, { status: 500 })

  const payslips = []
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  const monthName = monthNames[run.payroll_period.period_month - 1]

  for (const record of records || []) {
    const primaryBank = record.employee?.employee_bank_accounts?.find((b: any) => b.is_primary) || record.employee?.employee_bank_accounts?.[0]
    const statutory = record.employee?.employee_statutory_details?.[0]
    
    // Construct immutable snapshot
    const earningsList = (record.payroll_earnings || []).map((e: any) => ({
      name: e.component_name,
      amount: Number(e.final_amount),
    }))

    const deductionsList = (record.payroll_deductions || []).map((d: any) => ({
      name: d.component_name,
      amount: Number(d.amount),
    }))

    const snapshot_data = {
      employeeId: record.employee_code,
      employeeName: record.employee_name,
      department: record.department_name || '',
      designation: record.designation_name || '',
      dateOfJoining: formatHumanDate(record.joining_date),
      joiningDate: record.joining_date || '',
      bankName: primaryBank?.bank_name || 'Not provided',
      bankAccountNo: primaryBank?.account_number_masked || (primaryBank?.account_number_encrypted ? maskBankAccount(primaryBank.account_number_encrypted) : 'Not provided'),
      bankAccountMasked: primaryBank?.account_number_masked || (primaryBank?.account_number_encrypted ? maskBankAccount(primaryBank.account_number_encrypted) : 'Not provided'),
      ifscCode: primaryBank?.ifsc_code || 'Not provided',
      pan: statutory?.pan_masked || statutory?.pan_number || 'Not provided',
      uanOrPFNo: statutory?.uan_number || statutory?.pf_number || 'Not provided',
      paidDays: Number(record.paid_days),
      lopDays: Number(record.lop_days),
      paymentMode: 'Direct Bank Transfer',
      payPeriod: formatPeriodRange(run.payroll_period.start_date, run.payroll_period.end_date),
      payMonth: `${monthName} ${run.payroll_period.period_year}`,
      earnings: earningsList,
      deductions: deductionsList,
      grossEarnings: Number(record.gross_earnings),
      totalDeductions: Number(record.total_deductions),
      netSalary: Number(record.net_salary),
      annualCTC: Number(record.annual_ctc || 0),
      ytdGrossEarnings: Number(record.gross_earnings),
      ytdPFContribution: Number(deductionsList.find((d: any) => d.name.toLowerCase().includes('pf') || d.name.toLowerCase().includes('provident'))?.amount || 0),
      ytdProfessionalTax: Number(deductionsList.find((d: any) => d.name.toLowerCase().includes('pt') || d.name.toLowerCase().includes('professional'))?.amount || 0),
      ytdIncomeTax: Number(deductionsList.find((d: any) => d.name.toLowerCase().includes('tds') || d.name.toLowerCase().includes('income tax'))?.amount || 0),
      ytdNetPay: Number(record.net_salary),
    }

    const filename = `Haryak_Payslip_${record.employee_code}_${monthName}_${run.payroll_period.period_year}.pdf`

    payslips.push({
      company_id: companyId,
      employee_id: record.employee_id,
      payroll_run_id: payroll_run_id,
      payroll_employee_record_id: record.id,
      period_month: run.payroll_period.period_month,
      period_year: run.payroll_period.period_year,
      pay_period_start: run.payroll_period.start_date,
      pay_period_end: run.payroll_period.end_date,
      snapshot_data,
      net_salary: record.net_salary,
      amount_in_words: amountToWords(Number(record.net_salary)),
      filename,
      status: 'generated',
    })
  }

  if (payslips.length > 0) {
    const { error: psErr } = await admin
      .from('payslips')
      .upsert(payslips, { onConflict: 'company_id,employee_id,period_month,period_year' })
    if (psErr) {
      console.error('Error upserting payslips:', psErr)
    }
  }

  await createAuditLog({
    companyId,
    userId: authUserId,
    userEmail: email,
    userName: fullName,
    action: 'approved',
    entityType: 'payroll_run',
    entityId: payroll_run_id,
    description: `Approved and locked payroll run for ${run.payroll_period.period_month}/${run.payroll_period.period_year}`,
  })

  return NextResponse.json({
    success: true,
    message: 'Payroll approved and locked successfully',
    payslipsGenerated: payslips.length,
  }, { status: 200 })
}
