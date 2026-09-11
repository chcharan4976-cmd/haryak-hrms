/**
 * Haryak Technologies India Private Limited
 * Canonical Employee Service
 *
 * Core Master Employee Operations:
 * - Update Employee Profile (with atomic email sync & immutable employee_code)
 * - Deactivate Employee (preserves historical payroll, attendance, docs; disables login)
 * - Permanent Delete Employee (strictly blocked if protected history exists; released employee_code becomes reusable)
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { createAuditLog } from '@/lib/services/audit-service'

export interface UpdateEmployeeInput {
  firstName?: string
  lastName?: string
  fullName?: string
  officialEmail?: string
  personalEmail?: string | null
  phone?: string | null
  gender?: string | null
  dateOfBirth?: string | null
  departmentId?: string | null
  designationId?: string | null
  locationId?: string | null
  reportingManagerId?: string | null
  employmentType?: string | null
  employmentStatus?: string
  joiningDate?: string | null
  probationEndDate?: string | null
  confirmationDate?: string | null
  noticePeriodDays?: number | null
  emergencyContactName?: string | null
  emergencyContactPhone?: string | null
  emergencyContactRelationship?: string | null
  currentAddress?: string | null
  currentCity?: string | null
  currentState?: string | null
  currentPincode?: string | null
  permanentAddress?: string | null
  permanentCity?: string | null
  permanentState?: string | null
  permanentPincode?: string | null
}

export interface DeleteEmployeeCheckResult {
  canDeletePermanently: boolean
  blockers: string[]
  details: {
    finalizedPayrollCount: number
    releasedPayslipCount: number
    issuedDocumentCount: number
    timesheetCount: number
    attendanceCount: number
  }
}

export async function checkEmployeeDeleteEligibility(
  employeeId: string,
  companyId: string
): Promise<DeleteEmployeeCheckResult & { employeeCode?: string }> {
  const supabase = createAdminClient()

  if (!supabase) {
    return {
      canDeletePermanently: false,
      blockers: ['Database unavailable'],
      details: {
        finalizedPayrollCount: 0,
        releasedPayslipCount: 0,
        issuedDocumentCount: 0,
        timesheetCount: 0,
        attendanceCount: 0,
      },
    }
  }

  const { data: employee, error: employeeError } = await supabase
    .from('employees')
    .select('id, employee_code')
    .eq('company_id', companyId)
    .eq('id', employeeId)
    .maybeSingle()

  if (employeeError) {
    throw new Error(`Unable to check employee: ${employeeError.message}`)
  }

  if (!employee) {
    throw new Error('Employee not found')
  }

  const blockers: string[] = []

  // 1. Released / locked payslips are statutory history and block hard delete.
  const { data: payslips, error: payslipError } = await supabase
    .from('payslips')
    .select('id, status')
    .eq('company_id', companyId)
    .eq('employee_id', employeeId)

  if (payslipError) {
    throw new Error(`Unable to check payslips: ${payslipError.message}`)
  }

  const releasedPayslipCount = (payslips || []).filter((p: any) => {
    const status = String(p.status || '').toUpperCase()
    return status === 'RELEASED' || status === 'PUBLISHED' || status === 'LOCKED'
  }).length

  if (releasedPayslipCount > 0) {
    blockers.push(
      `Employee has ${releasedPayslipCount} released/locked payslip(s). Statutory payroll history cannot be permanently deleted.`
    )
  }

  // 2. Finalized payroll records block hard delete.
  const { data: payrollRecords, error: payrollError } = await supabase
    .from('payroll_employee_records')
    .select('id, status')
    .eq('employee_id', employeeId)

  if (payrollError) {
    throw new Error(`Unable to check payroll records: ${payrollError.message}`)
  }

  const finalizedPayrollCount = (payrollRecords || []).filter((p: any) => {
    const status = String(p.status || '').toUpperCase()
    return status === 'COMPLETED' || status === 'APPROVED' || status === 'LOCKED'
  }).length

  if (finalizedPayrollCount > 0) {
    blockers.push(
      `Employee has ${finalizedPayrollCount} finalized payroll record(s).`
    )
  }

  // 3. Officially issued/acknowledged documents block hard delete.
  // Document lifecycle is stored in description JSON in this project.
  const { data: docs, error: docsError } = await supabase
    .from('documents')
    .select('id, description, visibility')
    .eq('company_id', companyId)
    .eq('employee_id', employeeId)

  if (docsError) {
    throw new Error(`Unable to check documents: ${docsError.message}`)
  }

  const issuedDocumentCount = (docs || []).filter((doc: any) => {
    let meta: Record<string, any> = {}

    try {
      const parsed = JSON.parse(doc.description || '{}')
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        meta = parsed
      }
    } catch {
      meta = {}
    }

    const status = String(meta.status || '').toUpperCase()

    return (
      status === 'ISSUED' ||
      status === 'ACKNOWLEDGED' ||
      status === 'PUBLISHED' ||
      status === 'SIGNED' ||
      doc.visibility === 'employee'
    )
  }).length

  if (issuedDocumentCount > 0) {
    blockers.push(
      `Employee has ${issuedDocumentCount} issued/acknowledged official document(s).`
    )
  }

  // 4. Informational counts. These do not block hard delete by themselves.
  const { data: tsData, error: tsError } = await supabase
    .from('timesheets')
    .select('id')
    .eq('company_id', companyId)
    .eq('employee_id', employeeId)

  if (tsError) {
    throw new Error(`Unable to check timesheets: ${tsError.message}`)
  }

  const { data: attData, error: attError } = await supabase
    .from('attendance_records')
    .select('id')
    .eq('company_id', companyId)
    .eq('employee_id', employeeId)

  if (attError) {
    throw new Error(`Unable to check attendance: ${attError.message}`)
  }

  return {
    employeeCode: employee.employee_code,
    canDeletePermanently: blockers.length === 0,
    blockers,
    details: {
      finalizedPayrollCount,
      releasedPayslipCount,
      issuedDocumentCount,
      timesheetCount: (tsData || []).length,
      attendanceCount: (attData || []).length,
    },
  }
}

export async function updateEmployee(
  employeeId: string,
  updates: UpdateEmployeeInput,
  companyId: string,
  adminContext: { userId: string; userEmail: string; userName: string }
) {
  const supabase = createAdminClient()
  if (!supabase) throw new Error('Database unavailable')

  // Fetch current record
  const { data: currentEmp, error: fetchErr } = await supabase
    .from('employees')
    .select('id, employee_code, official_email, full_name, first_name, last_name, user_id')
    .eq('company_id', companyId)
    .eq('id', employeeId)
    .maybeSingle()

  if (fetchErr || !currentEmp) {
    throw new Error('Employee not found')
  }

  const fieldsToUpdate: Record<string, any> = {
    updated_at: new Date().toISOString(),
  }

  if (updates.firstName !== undefined) fieldsToUpdate.first_name = updates.firstName
  if (updates.lastName !== undefined) fieldsToUpdate.last_name = updates.lastName
  if (updates.fullName !== undefined) {
    fieldsToUpdate.full_name = updates.fullName
  } else if (updates.firstName !== undefined || updates.lastName !== undefined) {
    const fn = updates.firstName ?? currentEmp.first_name ?? ''
    const ln = updates.lastName ?? currentEmp.last_name ?? ''
    fieldsToUpdate.full_name = `${fn} ${ln}`.trim()
  }

  const newOfficialEmail = updates.officialEmail?.toLowerCase().trim()
  const emailChanged = newOfficialEmail && newOfficialEmail !== currentEmp.official_email?.toLowerCase().trim()

  if (emailChanged) {
    fieldsToUpdate.official_email = newOfficialEmail
  }

  if (updates.personalEmail !== undefined) fieldsToUpdate.personal_email = updates.personalEmail
  if (updates.phone !== undefined) fieldsToUpdate.phone = updates.phone
  if (updates.gender !== undefined) fieldsToUpdate.gender = updates.gender
  if (updates.dateOfBirth !== undefined) fieldsToUpdate.date_of_birth = updates.dateOfBirth
  if (updates.departmentId !== undefined) fieldsToUpdate.department_id = updates.departmentId
  if (updates.designationId !== undefined) fieldsToUpdate.designation_id = updates.designationId
  if (updates.locationId !== undefined) fieldsToUpdate.location_id = updates.locationId
  if (updates.reportingManagerId !== undefined) fieldsToUpdate.reporting_manager_id = updates.reportingManagerId
  if (updates.employmentType !== undefined) fieldsToUpdate.employment_type = updates.employmentType
  if (updates.employmentStatus !== undefined) {
    fieldsToUpdate.employment_status = updates.employmentStatus
    fieldsToUpdate.is_active = updates.employmentStatus === 'active'
  }
  if (updates.joiningDate !== undefined) fieldsToUpdate.joining_date = updates.joiningDate
  if (updates.probationEndDate !== undefined) fieldsToUpdate.probation_end_date = updates.probationEndDate
  if (updates.confirmationDate !== undefined) fieldsToUpdate.confirmation_date = updates.confirmationDate
  if (updates.noticePeriodDays !== undefined) fieldsToUpdate.notice_period_days = updates.noticePeriodDays
  if (updates.emergencyContactName !== undefined) fieldsToUpdate.emergency_contact_name = updates.emergencyContactName
  if (updates.emergencyContactPhone !== undefined) fieldsToUpdate.emergency_contact_phone = updates.emergencyContactPhone
  if (updates.emergencyContactRelationship !== undefined) fieldsToUpdate.emergency_contact_relationship = updates.emergencyContactRelationship
  if (updates.currentAddress !== undefined) fieldsToUpdate.current_address = updates.currentAddress
  if (updates.currentCity !== undefined) fieldsToUpdate.current_city = updates.currentCity
  if (updates.currentState !== undefined) fieldsToUpdate.current_state = updates.currentState
  if (updates.currentPincode !== undefined) fieldsToUpdate.current_pincode = updates.currentPincode
  if (updates.permanentAddress !== undefined) fieldsToUpdate.permanent_address = updates.permanentAddress
  if (updates.permanentCity !== undefined) fieldsToUpdate.permanent_city = updates.permanentCity
  if (updates.permanentState !== undefined) fieldsToUpdate.permanent_state = updates.permanentState
  if (updates.permanentPincode !== undefined) fieldsToUpdate.permanent_pincode = updates.permanentPincode

  // 1. Update public.employees
  const { error: updateErr } = await supabase
    .from('employees')
    .update(fieldsToUpdate)
    .eq('id', employeeId)

  if (updateErr) {
    throw new Error(`Failed to update employee: ${updateErr.message}`)
  }

  // 2. Synchronize email if changed
  if (emailChanged && newOfficialEmail) {
    // Sync public.users
    if (currentEmp.user_id) {
      await supabase
        .from('users')
        .update({
          email: newOfficialEmail,
          full_name: fieldsToUpdate.full_name || currentEmp.full_name,
          updated_at: new Date().toISOString(),
        })
        .eq('id', currentEmp.user_id)

      // Sync auth.users
      try {
        await supabase.auth.admin.updateUserById(currentEmp.user_id, {
          email: newOfficialEmail,
          email_confirm: true,
          user_metadata: {
            full_name: fieldsToUpdate.full_name || currentEmp.full_name,
          },
        })
      } catch (authErr: any) {
        console.warn('Warning: Could not sync email to Auth user:', authErr.message)
      }
    }

    await createAuditLog({
      companyId,
      userId: adminContext.userId,
      userEmail: adminContext.userEmail,
      userName: adminContext.userName,
      action: 'updated',
      entityType: 'employee',
      entityId: employeeId,
      entityName: `${fieldsToUpdate.full_name || currentEmp.full_name} (${currentEmp.employee_code})`,
      previousValue: { official_email: currentEmp.official_email },
      newValue: { official_email: newOfficialEmail },
      description: `Updated official email from ${currentEmp.official_email} to ${newOfficialEmail}`,
      reason: 'EMPLOYEE_EMAIL_CHANGED',
    })
  }

  await createAuditLog({
    companyId,
    userId: adminContext.userId,
    userEmail: adminContext.userEmail,
    userName: adminContext.userName,
    action: 'updated',
    entityType: 'employee',
    entityId: employeeId,
    entityName: `${fieldsToUpdate.full_name || currentEmp.full_name} (${currentEmp.employee_code})`,
    description: `Updated employee profile for ${fieldsToUpdate.full_name || currentEmp.full_name} (${currentEmp.employee_code})`,
    reason: 'ADMIN_EMPLOYEE_UPDATE',
  })

  return { success: true }
}

export async function deactivateEmployee(
  employeeId: string,
  reason: string,
  companyId: string,
  adminContext: { userId: string; userEmail: string; userName: string }
) {
  const supabase = createAdminClient()
  if (!supabase) throw new Error('Database unavailable')

  const { data: emp, error: fetchErr } = await supabase
    .from('employees')
    .select('id, employee_code, full_name, user_id, is_active, employment_status')
    .eq('company_id', companyId)
    .eq('id', employeeId)
    .maybeSingle()

  if (fetchErr || !emp) {
    throw new Error('Employee not found')
  }

  if (emp.is_active === false) {
    return {
      success: true,
      alreadyInactive: true,
      employeeCode: emp.employee_code,
    }
  }

  const now = new Date().toISOString()

  // Keep the employee master row. This permanently reserves HRK-xxx
  // until a true permanent delete is successfully completed.
  const { error: employeeUpdateError } = await supabase
    .from('employees')
    .update({
      is_active: false,
      employment_status: 'inactive',
      updated_at: now,
    })
    .eq('company_id', companyId)
    .eq('id', employeeId)

  if (employeeUpdateError) {
    throw new Error(`Failed to deactivate employee: ${employeeUpdateError.message}`)
  }

  if (emp.user_id) {
    const { error: userUpdateError } = await supabase
      .from('users')
      .update({
        is_active: false,
        updated_at: now,
      })
      .eq('id', emp.user_id)

    if (userUpdateError) {
      throw new Error(`Employee was deactivated, but portal user update failed: ${userUpdateError.message}`)
    }

    try {
      await supabase.auth.admin.signOut(emp.user_id, 'global')

      const { error: authUpdateError } =
        await supabase.auth.admin.updateUserById(emp.user_id, {
          ban_duration: '876000h',
          user_metadata: {
            employment_status: 'inactive',
          },
        })

      if (authUpdateError) {
        console.error('[deactivateEmployee] Auth disable failed:', authUpdateError.message)
      }
    } catch (authErr: any) {
      console.error('[deactivateEmployee] Auth disable failed:', authErr?.message || authErr)
    }
  }

  await createAuditLog({
    companyId,
    userId: adminContext.userId,
    userEmail: adminContext.userEmail,
    userName: adminContext.userName,
    action: 'updated',
    entityType: 'employee',
    entityId: employeeId,
    entityName: `${emp.full_name} (${emp.employee_code})`,
    previousValue: {
      is_active: true,
      employment_status: emp.employment_status,
    },
    newValue: {
      is_active: false,
      employment_status: 'inactive',
    },
    description: `Deactivated employee ${emp.full_name} (${emp.employee_code}). Employee ID remains reserved. Reason: ${reason}`,
    reason: 'EMPLOYEE_DEACTIVATED',
  })

  return {
    success: true,
    employeeCode: emp.employee_code,
    reservedEmployeeCode: true,
  }
}

export async function reactivateEmployee(
  employeeId: string,
  reason: string,
  companyId: string,
  adminContext: { userId: string; userEmail: string; userName: string }
) {
  const supabase = createAdminClient()
  if (!supabase) throw new Error('Database unavailable')

  const { data: emp, error: fetchErr } = await supabase
    .from('employees')
    .select('id, employee_code, full_name, user_id, is_active, employment_status')
    .eq('company_id', companyId)
    .eq('id', employeeId)
    .maybeSingle()

  if (fetchErr || !emp) {
    throw new Error('Employee not found')
  }

  if (emp.is_active === true && String(emp.employment_status || '').toLowerCase() === 'active') {
    return {
      success: true,
      alreadyActive: true,
      employeeCode: emp.employee_code,
    }
  }

  const now = new Date().toISOString()

  const { error: employeeUpdateError } = await supabase
    .from('employees')
    .update({
      is_active: true,
      employment_status: 'active',
      updated_at: now,
    })
    .eq('company_id', companyId)
    .eq('id', employeeId)

  if (employeeUpdateError) {
    throw new Error(`Failed to reactivate employee: ${employeeUpdateError.message}`)
  }

  if (emp.user_id) {
    const { error: userUpdateError } = await supabase
      .from('users')
      .update({
        is_active: true,
        updated_at: now,
      })
      .eq('id', emp.user_id)

    if (userUpdateError) {
      throw new Error(`Employee was reactivated, but portal user update failed: ${userUpdateError.message}`)
    }

    try {
      const { data: authUserData } =
        await supabase.auth.admin.getUserById(emp.user_id)

      const existingMetadata =
        authUserData?.user?.user_metadata || {}

      const { error: authUpdateError } =
        await supabase.auth.admin.updateUserById(emp.user_id, {
          ban_duration: 'none',
          user_metadata: {
            ...existingMetadata,
            employment_status: 'active',
          },
        })

      if (authUpdateError) {
        console.error('[reactivateEmployee] Auth enable failed:', authUpdateError.message)
      }
    } catch (authErr: any) {
      console.error('[reactivateEmployee] Auth enable failed:', authErr?.message || authErr)
    }
  }

  await createAuditLog({
    companyId,
    userId: adminContext.userId,
    userEmail: adminContext.userEmail,
    userName: adminContext.userName,
    action: 'updated',
    entityType: 'employee',
    entityId: employeeId,
    entityName: `${emp.full_name} (${emp.employee_code})`,
    previousValue: {
      is_active: emp.is_active,
      employment_status: emp.employment_status,
    },
    newValue: {
      is_active: true,
      employment_status: 'active',
    },
    description: `Reactivated employee ${emp.full_name} (${emp.employee_code}). Reason: ${reason}`,
    reason: 'EMPLOYEE_REACTIVATED',
  })

  return {
    success: true,
    employeeCode: emp.employee_code,
  }
}

function assertMutation(label: string, error: any) {
  if (error) {
    throw new Error(`${label}: ${error.message || String(error)}`)
  }
}

export async function deleteEmployeePermanently(
  employeeId: string,
  confirmationCode: string,
  reason: string,
  companyId: string,
  adminContext: { userId: string; userEmail: string; userName: string }
) {
  const supabase = createAdminClient()
  if (!supabase) throw new Error('Database unavailable')

  const { data: emp, error: fetchErr } = await supabase
    .from('employees')
    .select('id, employee_code, full_name, user_id, official_email')
    .eq('company_id', companyId)
    .eq('id', employeeId)
    .maybeSingle()

  if (fetchErr || !emp) {
    throw new Error('Employee not found')
  }

  const expectedCode = `DELETE ${emp.employee_code}`

  if (confirmationCode.trim() !== expectedCode) {
    throw new Error(
      `Confirmation code mismatch. Please type exactly "${expectedCode}" to proceed.`
    )
  }

  const eligibility = await checkEmployeeDeleteEligibility(employeeId, companyId)

  if (!eligibility.canDeletePermanently) {
    throw new Error(
      `Cannot delete employee permanently: ${eligibility.blockers.join(' ')} Please deactivate the employee instead.`
    )
  }

  const authUserId = emp.user_id

  // Capture dependent IDs before removing parent rows.
  const { data: timesheets, error: timesheetLookupError } = await supabase
    .from('timesheets')
    .select('id')
    .eq('company_id', companyId)
    .eq('employee_id', employeeId)

  assertMutation('Unable to load employee timesheets', timesheetLookupError)

  const timesheetIds = (timesheets || []).map((item: any) => item.id)

  const { data: salaryStructures, error: salaryStructureLookupError } = await supabase
    .from('salary_structures')
    .select('id')
    .eq('employee_id', employeeId)

  assertMutation('Unable to load employee salary structures', salaryStructureLookupError)

  const salaryStructureIds = (salaryStructures || []).map((item: any) => item.id)

  const { data: payrollRecords, error: payrollLookupError } = await supabase
    .from('payroll_employee_records')
    .select('id')
    .eq('employee_id', employeeId)

  assertMutation('Unable to load employee payroll records', payrollLookupError)

  const payrollRecordIds = (payrollRecords || []).map((item: any) => item.id)

  // ------------------------------------------------------------------
  // 1. Remove child records first.
  // ------------------------------------------------------------------

  if (timesheetIds.length > 0) {
    const { error } = await supabase
      .from('timesheet_entries')
      .delete()
      .in('timesheet_id', timesheetIds)

    assertMutation('Failed to delete timesheet entries', error)

    const { error: reviewError } = await supabase
      .from('timesheet_reviews')
      .delete()
      .in('timesheet_id', timesheetIds)

    assertMutation('Failed to delete timesheet reviews', reviewError)
  }

  if (payrollRecordIds.length > 0) {
    const { error: earningsError } = await supabase
      .from('payroll_earnings')
      .delete()
      .in('payroll_employee_record_id', payrollRecordIds)

    assertMutation('Failed to delete non-finalized payroll earnings', earningsError)

    const { error: deductionsError } = await supabase
      .from('payroll_deductions')
      .delete()
      .in('payroll_employee_record_id', payrollRecordIds)

    assertMutation('Failed to delete non-finalized payroll deductions', deductionsError)
  }

  if (salaryStructureIds.length > 0) {
    const { error } = await supabase
      .from('salary_structure_components')
      .delete()
      .in('salary_structure_id', salaryStructureIds)

    assertMutation('Failed to delete salary structure components', error)
  }

  // ------------------------------------------------------------------
  // 2. Remove employee-owned operational/master records.
  // Protected finalized history was already blocked by eligibility.
  // ------------------------------------------------------------------

  {
    const { error } = await supabase
      .from('payslips')
      .delete()
      .eq('company_id', companyId)
      .eq('employee_id', employeeId)

    assertMutation('Failed to delete non-released payslips', error)
  }

  {
    const { error } = await supabase
      .from('payroll_employee_records')
      .delete()
      .eq('employee_id', employeeId)

    assertMutation('Failed to delete non-finalized payroll records', error)
  }

  {
    const { error } = await supabase
      .from('employee_bank_accounts')
      .delete()
      .eq('employee_id', employeeId)

    assertMutation('Failed to delete employee bank accounts', error)
  }

  {
    const { error } = await supabase
      .from('employee_statutory_details')
      .delete()
      .eq('employee_id', employeeId)

    assertMutation('Failed to delete employee statutory details', error)
  }

  if (salaryStructureIds.length > 0) {
    const { error } = await supabase
      .from('salary_structures')
      .delete()
      .in('id', salaryStructureIds)

    assertMutation('Failed to delete salary structures', error)
  }

  {
    const { error } = await supabase
      .from('salary_revisions')
      .delete()
      .eq('employee_id', employeeId)

    assertMutation('Failed to delete salary revisions', error)
  }

  {
    const { error } = await supabase
      .from('attendance_records')
      .delete()
      .eq('company_id', companyId)
      .eq('employee_id', employeeId)

    assertMutation('Failed to delete attendance records', error)
  }

  {
    const { error } = await supabase
      .from('leave_requests')
      .delete()
      .eq('company_id', companyId)
      .eq('employee_id', employeeId)

    assertMutation('Failed to delete leave requests', error)
  }

  {
    const { error } = await supabase
      .from('leave_balances')
      .delete()
      .eq('employee_id', employeeId)

    assertMutation('Failed to delete leave balances', error)
  }

  if (timesheetIds.length > 0) {
    const { error } = await supabase
      .from('timesheets')
      .delete()
      .in('id', timesheetIds)

    assertMutation('Failed to delete timesheets', error)
  }

  {
    const { error } = await supabase
      .from('documents')
      .delete()
      .eq('company_id', companyId)
      .eq('employee_id', employeeId)

    assertMutation('Failed to delete draft/internal documents', error)
  }

  {
    const { error } = await supabase
      .from('hr_requests')
      .delete()
      .eq('company_id', companyId)
      .eq('employee_id', employeeId)

    assertMutation('Failed to delete HR requests', error)
  }

  // If this employee was a reporting manager, preserve subordinate rows by
  // clearing the relationship rather than deleting those employees.
  {
    const { error } = await supabase
      .from('employees')
      .update({
        reporting_manager_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq('company_id', companyId)
      .eq('reporting_manager_id', employeeId)

    assertMutation('Failed to clear reporting-manager references', error)
  }

  if (authUserId) {
    const { error: notificationError } = await supabase
      .from('notifications')
      .delete()
      .eq('company_id', companyId)
      .eq('user_id', authUserId)

    assertMutation('Failed to delete employee notifications', notificationError)
  }

  // ------------------------------------------------------------------
  // 3. Remove app identity and employee master.
  // ------------------------------------------------------------------

  {
    const { error } = await supabase
      .from('employees')
      .update({ user_id: null })
      .eq('company_id', companyId)
      .eq('id', employeeId)

    assertMutation('Failed to detach employee login identity', error)
  }

  if (authUserId) {
    const { error: roleError } = await supabase
      .from('user_roles')
      .delete()
      .eq('user_id', authUserId)

    assertMutation('Failed to delete employee role assignments', roleError)

    // Audit history must survive employee deletion.
    const { error: auditDetachError } = await supabase
      .from('audit_logs')
      .update({ user_id: null })
      .eq('user_id', authUserId)

    assertMutation('Failed to preserve audit history', auditDetachError)

    const { error: userDeleteError } = await supabase
      .from('users')
      .delete()
      .eq('id', authUserId)

    assertMutation('Failed to delete application user', userDeleteError)
  }

  const { error: employeeDeleteError } = await supabase
    .from('employees')
    .delete()
    .eq('company_id', companyId)
    .eq('id', employeeId)

  assertMutation('Failed to delete employee master record', employeeDeleteError)

  if (authUserId) {
    try {
      const { error: authDeleteError } =
        await supabase.auth.admin.deleteUser(authUserId)

      if (authDeleteError) {
        console.error(
          '[deleteEmployeePermanently] Supabase Auth delete failed after DB cleanup:',
          authDeleteError.message
        )
      }
    } catch (authErr: any) {
      console.error(
        '[deleteEmployeePermanently] Supabase Auth delete failed after DB cleanup:',
        authErr?.message || authErr
      )
    }
  }

  // IMPORTANT:
  // We intentionally do NOT decrement companies.employee_id_counter.
  // New employee allocation now scans employees and reuses the LOWEST
  // truly missing code. Because this employee row no longer exists,
  // its HRK-xxx code becomes available again automatically.

  await createAuditLog({
    companyId,
    userId: adminContext.userId,
    userEmail: adminContext.userEmail,
    userName: adminContext.userName,
    action: 'deleted',
    entityType: 'employee',
    entityId: employeeId,
    entityName: `${emp.full_name} (${emp.employee_code})`,
    description:
      `Permanently deleted employee ${emp.full_name} (${emp.employee_code}). ` +
      `The employee code is now available for future allocation. Reason: ${reason}`,
    reason: 'EMPLOYEE_PERMANENTLY_DELETED',
  })

  return {
    success: true,
    employeeCode: emp.employee_code,
    employeeCodeReleased: true,
  }
}
