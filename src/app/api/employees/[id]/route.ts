import { NextResponse } from 'next/server'
import { createAdminClient, isSupabaseConfigured } from '@/lib/supabase/admin'
import { resolveRequestContext, isEmployeeOnly, resolveAuthenticatedEmployee, isAdmin } from '@/lib/services/company-resolver'
import { getEffectiveCompensation } from '@/lib/services/compensation-service'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    if (!isSupabaseConfigured()) {
      return NextResponse.json({ success: false, error: 'Database not configured.' }, { status: 500 })
    }

    const supabase = createAdminClient()
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Database not available.' }, { status: 500 })
    }

    // Resolve authenticated context
    const resolution = await resolveRequestContext()
    if (!resolution.ok) {
      return NextResponse.json(
        { success: false, error: resolution.error.message },
        { status: resolution.error.status }
      )
    }
    const { companyId, employeeId: callerEmployeeId } = resolution.context

    let targetId = id
    // Handle special alias 'me'
    if (targetId.toLowerCase() === 'me') {
      const empRes = await resolveAuthenticatedEmployee()
      if (!empRes.ok) {
        return NextResponse.json({ success: false, error: empRes.error.message }, { status: empRes.error.status })
      }
      targetId = empRes.employee.employeeId
    }

    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetId)

    let query = supabase
      .from('employees')
      .select(`
        *,
        departments:department_id(id, name),
        designations:designation_id(id, name),
        locations:location_id(id, name),
        reporting_manager:reporting_manager_id(id, full_name, employee_code),
        salary_structures(*),
        employee_bank_accounts(*),
        employee_statutory_details(*)
      `)
      .eq('company_id', companyId)

    if (isUUID) {
      query = query.or(`id.eq.${targetId},user_id.eq.${targetId}`)
    } else {
      query = query.eq('employee_code', targetId.toUpperCase())
    }

    const { data: emp, error } = await query.maybeSingle()

    if (error) {
      console.error('Error fetching employee:', error.message)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    if (!emp) {
      return NextResponse.json({ success: false, error: 'Employee record not found.' }, { status: 404 })
    }

    // Enforce employee self-service access control
    if (isEmployeeOnly(resolution.context) && emp.id !== callerEmployeeId) {
      return NextResponse.json(
        { success: false, error: 'Access denied. You can only view your own profile.' },
        { status: 403 }
      )
    }

    // Canonical compensation resolution
    const effectiveCompensation = await getEffectiveCompensation(emp.id, companyId)

    const bankAccounts = (emp.employee_bank_accounts || []).map((ba: any) => ({
      id: ba.id,
      bankName: ba.bank_name || null,
      accountNumberMasked: ba.account_number_masked || null,
      ifscCode: ba.ifsc_code || null,
      accountHolderName: ba.account_holder_name || null,
      branchName: ba.branch_name || null,
      isPrimary: ba.is_primary,
      isActive: ba.is_active,
    }))

    const departmentName = emp.departments?.name || null
    const designationName = emp.designations?.name || null
    const locationName = emp.locations?.name || null
    const managerName = emp.reporting_manager?.full_name || null

    const employeeObj = {
      id: emp.id,
      employeeId: emp.id,
      userId: emp.user_id,
      code: emp.employee_code,
      employee_code: emp.employee_code,
      firstName: emp.first_name,
      lastName: emp.last_name || '',
      fullName: emp.full_name || `${emp.first_name} ${emp.last_name || ''}`.trim(),
      name: emp.full_name || `${emp.first_name} ${emp.last_name || ''}`.trim(),
      email: emp.official_email,
      officialEmail: emp.official_email,
      personalEmail: emp.personal_email || null,
      phone: emp.phone || null,
      gender: emp.gender || null,
      dob: emp.date_of_birth || null,
      date_of_birth: emp.date_of_birth || null,
      dateOfBirth: emp.date_of_birth || null,
      profileImageUrl: emp.profile_image_url || null,
      department: departmentName,
      departmentId: emp.department_id || null,
      designation: designationName,
      designationId: emp.designation_id || null,
      location: locationName,
      locationId: emp.location_id || null,
      manager: managerName,
      reportingManager: managerName,
      reportingManagerId: emp.reporting_manager_id || null,
      status: emp.employment_status || 'active',
      employmentStatus: emp.employment_status || 'active',
      employmentType: emp.employment_type || null,
      employment_type: emp.employment_type || null,
      joinDate: emp.joining_date || null,
      joining_date: emp.joining_date || null,
      joiningDate: emp.joining_date || null,
      probationEndDate: emp.probation_end_date || null,
      confirmationDate: emp.confirmation_date || null,
      noticePeriodDays: emp.notice_period_days || null,
      lastWorkingDate: emp.last_working_date || null,
      emergencyContactName: emp.emergency_contact_name || null,
      emergencyContactPhone: emp.emergency_contact_phone || null,
      emergencyContactRelationship: emp.emergency_contact_relationship || null,
      currentAddress: emp.current_address || null,
      currentCity: emp.current_city || null,
      currentState: emp.current_state || null,
      currentPincode: emp.current_pincode || null,
      permanentAddress: emp.permanent_address || null,
      permanentCity: emp.permanent_city || null,
      permanentState: emp.permanent_state || null,
      permanentPincode: emp.permanent_pincode || null,
      salaryStructure: effectiveCompensation.structureId ? {
        id: effectiveCompensation.structureId,
        annualCtc: effectiveCompensation.annualCtc,
        monthlyGross: effectiveCompensation.monthlyGross,
        effectiveFrom: effectiveCompensation.effectiveFrom,
        effectiveUntil: effectiveCompensation.effectiveUntil,
        status: effectiveCompensation.status,
      } : null,
      salaryComponents: effectiveCompensation.components.map((sc: any) => ({
        id: sc.id,
        componentId: sc.componentId,
        componentName: sc.name,
        componentCode: sc.code,
        type: sc.type,
        category: sc.category,
        annualAmount: sc.annualAmount,
        monthlyAmount: sc.monthlyAmount,
        isTaxable: sc.isTaxable,
        isStatutory: sc.isStatutory,
        sortOrder: sc.sortOrder,
        isActive: sc.isActive,
      })),
      compensationComplete: effectiveCompensation.isComplete,
      compensationIncompletenessReasons: effectiveCompensation.incompletenessReasons,
      bankAccounts,
      statutoryDetails: emp.employee_statutory_details?.[0] ? {
        pfApplicable: emp.employee_statutory_details[0].pf_applicable,
        uanNumber: emp.employee_statutory_details[0].uan_number || null,
        pfNumber: emp.employee_statutory_details[0].pf_number || null,
        esiApplicable: emp.employee_statutory_details[0].esi_applicable,
        esiNumber: emp.employee_statutory_details[0].esi_number || null,
        ptApplicable: emp.employee_statutory_details[0].pt_applicable,
        ptState: emp.employee_statutory_details[0].pt_state || null,
        ptAmount: emp.employee_statutory_details[0].pt_amount !== undefined && emp.employee_statutory_details[0].pt_amount !== null ? Number(emp.employee_statutory_details[0].pt_amount) : null,
        taxRegime: emp.employee_statutory_details[0].tax_regime || 'new',
      } : null,
    }

    return NextResponse.json({
      success: true,
      employee: employeeObj,
      data: employeeObj,
    })
  } catch (error: any) {
    console.error('Error fetching employee detail:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const resolution = await resolveRequestContext()
    if (!resolution.ok) {
      return NextResponse.json({ success: false, error: resolution.error.message }, { status: resolution.error.status })
    }
    const { context } = resolution

    if (!isAdmin(context)) {
      return NextResponse.json(
        { success: false, error: 'Only administrators can modify employee master records.' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const {
      updateEmployee,
      deactivateEmployee,
      reactivateEmployee,
    } = await import('@/lib/services/employee-service')

    const adminContext = {
      userId: context.authUserId,
      userEmail: context.email,
      userName: context.fullName,
    }

    if (body.action === 'deactivate') {
      const result = await deactivateEmployee(
        id,
        body.reason || 'Deactivated by administrator',
        context.companyId,
        adminContext
      )

      return NextResponse.json({
        success: true,
        message: `Employee ${result.employeeCode || ''} deactivated successfully. Employee ID remains reserved.`,
        employeeCode: result.employeeCode,
        employeeCodeReserved: true,
      })
    }

    if (body.action === 'reactivate') {
      const result = await reactivateEmployee(
        id,
        body.reason || 'Reactivated by administrator',
        context.companyId,
        adminContext
      )

      return NextResponse.json({
        success: true,
        message: `Employee ${result.employeeCode || ''} reactivated successfully.`,
        employeeCode: result.employeeCode,
      })
    }

    // Regular employee master update.
    await updateEmployee(id, body, context.companyId, adminContext)

    return NextResponse.json({
      success: true,
      message: 'Employee updated successfully.',
    })
  } catch (error: any) {
    console.error('Error updating employee:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const resolution = await resolveRequestContext()
    if (!resolution.ok) {
      return NextResponse.json({ success: false, error: resolution.error.message }, { status: resolution.error.status })
    }
    const { context } = resolution

    if (!isAdmin(context)) {
      return NextResponse.json(
        { success: false, error: 'Only administrators can permanently delete employees.' },
        { status: 403 }
      )
    }

    let body: any = {}
    try {
      body = await request.json()
    } catch {
      // Empty body
    }

    const { deleteEmployeePermanently } = await import('@/lib/services/employee-service')

    const adminContext = {
      userId: context.authUserId,
      userEmail: context.email,
      userName: context.fullName,
    }

    const result = await deleteEmployeePermanently(
      id,
      body.confirmationCode || '',
      body.reason || 'Deleted by administrator',
      context.companyId,
      adminContext
    )

    return NextResponse.json({
      success: true,
      message:
        `Employee deleted permanently. ${result.employeeCode || 'Employee ID'} is now available for future allocation.`,
      employeeCode: result.employeeCode,
      employeeCodeReleased: result.employeeCodeReleased === true,
    })
  } catch (error: any) {
    console.error('Error deleting employee:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 400 })
  }
}

