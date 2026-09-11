import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveRequestContext, isAdmin } from '@/lib/services/company-resolver'

export async function GET(request: NextRequest) {
  const resolved = await resolveRequestContext()
  if (!resolved.ok) {
    return NextResponse.json({ success: false, error: resolved.error.message }, { status: resolved.error.status })
  }
  const { context } = resolved
  const isUserAdmin = isAdmin(context)

  const { searchParams } = new URL(request.url)
  const employeeIdParam = searchParams.get('employee_id')

  const supabase = createAdminClient()
  if (!supabase) return NextResponse.json({ success: false, error: 'Database unavailable' }, { status: 503 })

  let query = supabase
    .from('employees')
    .select(`
      id,
      employee_code,
      full_name,
      first_name,
      last_name,
      official_email,
      gender,
      date_of_birth,
      joining_date,
      department_id,
      designation_id,
      employment_type,
      status,
      employee_bank_accounts(*),
      employee_statutory_details(*)
    `)
    .eq('company_id', context.companyId)

  if (isUserAdmin) {
    if (employeeIdParam) {
      query = query.eq('id', employeeIdParam)
    }
  } else {
    // Normal employee sees only own data quality
    if (!context.employeeId) {
      return NextResponse.json({ success: false, error: 'Employee context not found' }, { status: 404 })
    }
    query = query.eq('id', context.employeeId)
  }

  const { data: employees, error } = await query

  if (error || !employees) {
    return NextResponse.json({ success: false, error: error?.message || 'Error fetching employees' }, { status: 500 })
  }

  const results = employees.map((emp: any) => {
    const missing: string[] = []
    let score = 0

    // 1. Basic Info (25%)
    let basicScore = 0
    if (emp.full_name || (emp.first_name && emp.last_name)) basicScore += 10
    else missing.push('Full Name')

    if (emp.official_email) basicScore += 5
    else missing.push('Official Email')

    if (emp.joining_date) basicScore += 5
    else missing.push('Joining Date')

    if (emp.gender) basicScore += 2.5
    else missing.push('Gender')

    if (emp.date_of_birth) basicScore += 2.5
    else missing.push('Date of Birth')

    score += basicScore

    // 2. Job Assignment (25%)
    let jobScore = 0
    if (emp.department_id) jobScore += 10
    else missing.push('Department')

    if (emp.designation_id) jobScore += 10
    else missing.push('Designation')

    if (emp.employment_type) jobScore += 5
    else missing.push('Employment Type')

    score += jobScore

    // 3. Statutory Details (25%)
    let statScore = 0
    const statutory = emp.employee_statutory_details?.[0]
    if (statutory?.pan_number) statScore += 15
    else missing.push('PAN Number')

    if (statutory?.uan_number || statutory?.pf_number) statScore += 10
    else missing.push('UAN / PF Number')

    score += statScore

    // 4. Bank Account (25%)
    let bankScore = 0
    const bank = emp.employee_bank_accounts?.[0]
    if (bank?.account_number) bankScore += 10
    else missing.push('Bank Account Number')

    if (bank?.ifsc_code) bankScore += 10
    else missing.push('IFSC Code')

    if (bank?.bank_name) bankScore += 5
    else missing.push('Bank Name')

    score += bankScore

    const finalScore = Math.round(score)
    let status = 'NEEDS_ATTENTION'
    if (finalScore === 100) status = 'COMPLETE'
    else if (finalScore >= 75) status = 'SATISFACTORY'

    return {
      employeeId: emp.id,
      employeeCode: emp.employee_code,
      fullName: emp.full_name || `${emp.first_name || ''} ${emp.last_name || ''}`.trim(),
      score: finalScore,
      status,
      missingFields: missing,
      breakdown: {
        basicInfo: basicScore,
        jobAssignment: jobScore,
        statutory: statScore,
        bankDetails: bankScore,
      },
    }
  })

  return NextResponse.json({
    success: true,
    dataQuality: employeeIdParam ? results[0] : results,
  })
}
