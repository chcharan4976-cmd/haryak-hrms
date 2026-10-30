import { describe, it, expect } from 'vitest'
import {
  getEmployeeIdentityIntegrity,
  repairEmployeeAuthIdentity,
} from '@/lib/services/employee-identity-service'
import {
  updateEmployee,
  checkEmployeeDeleteEligibility,
} from '@/lib/services/employee-service'
import {
  getEmployeeMonthlyTimesheet,
  saveTimesheetDraft,
  submitTimesheet,
  reviewTimesheet,
  isTimesheetApprovedForPayroll,
} from '@/lib/services/timesheet-service'

import { createAdminClient } from '@/lib/supabase/admin'

async function getAdminContext() {
  const supabase = createAdminClient()
  if (supabase) {
    const { data: adminUser } = await supabase
      .from('users')
      .select('id, email, full_name')
      .eq('email', 'haryak@admin.com')
      .maybeSingle()
    if (adminUser) {
      return {
        userId: adminUser.id,
        userEmail: adminUser.email,
        userName: adminUser.full_name || 'Super Administrator',
      }
    }
  }
  return {
    userId: '4a413477-4017-4714-8c10-e4ef3ba1e74c',
    userEmail: 'haryak@admin.com',
    userName: 'Super Administrator',
  }
}

describe('Haryak HRMS Master Rebuild Suite', () => {

  // -------------------------------------------------------------
  // 1. Identity Integrity & Safe Repair
  // -------------------------------------------------------------
  it('HRK-001 identity integrity is verified healthy after repair', async () => {
    const integrity = await getEmployeeIdentityIntegrity('HRK-001')
    expect(integrity).not.toBeNull()
    if (!integrity) return

    expect(integrity.employeeCode).toBe('HRK-001')
    expect(integrity.officialEmail).toBe('thiru@haryak.com')
    expect(integrity.isHealthy).toBe(true)
    expect(integrity.issues).toEqual([])
    expect(integrity.details.authUserId).toBeDefined()
    expect(integrity.details.assignedRoles).toContain('EMPLOYEE')
  })

  // -------------------------------------------------------------
  // 2. Employee Profile Update & Immutability
  // -------------------------------------------------------------
  it('should update employee profile phone and address while preserving HRK-001 code', async () => {
    const integrity = await getEmployeeIdentityIntegrity('HRK-001')
    expect(integrity).not.toBeNull()
    if (!integrity) return
    const companyId = integrity.companyId!
    const adminContext = await getAdminContext()

    const updateRes = await updateEmployee(
      integrity.employeeId,
      {
        phone: '+91 98765 43210',
        currentCity: 'Hyderabad',
        currentState: 'Telangana',
      },
      companyId,
      adminContext
    )
    expect(updateRes.success).toBe(true)

    // Code remains HRK-001
    const verifyIntegrity = await getEmployeeIdentityIntegrity('HRK-001')
    expect(verifyIntegrity?.employeeCode).toBe('HRK-001')
  })

  // -------------------------------------------------------------
  // 3. Permanent Delete Safety Guards
  // -------------------------------------------------------------
  it('should correctly evaluate permanent delete eligibility', async () => {
    const integrity = await getEmployeeIdentityIntegrity('HRK-001')
    expect(integrity).not.toBeNull()
    if (!integrity) return
    const companyId = integrity.companyId!

    const eligibility = await checkEmployeeDeleteEligibility(integrity.employeeId, companyId)
    // Eligibility returns boolean and structured details
    expect(typeof eligibility.canDeletePermanently).toBe('boolean')
    expect(Array.isArray(eligibility.blockers)).toBe(true)
    expect(eligibility.details).toBeDefined()
  })

  // -------------------------------------------------------------
  // 4. Monthly Timesheet Lifecycle & Payroll Approval Gate
  // -------------------------------------------------------------
  it('timesheet lifecycle: Draft -> Submit -> Return for Correction -> Resubmit -> Approve', async () => {
    const integrity = await getEmployeeIdentityIntegrity('HRK-001')
    expect(integrity).not.toBeNull()
    if (!integrity) return
    const companyId = integrity.companyId!

    const testYear = 2026
    const testMonth = 9
    const adminContext = await getAdminContext()
    const userContext = {
      userId: integrity.details.authUserId || integrity.employeeId,
      userEmail: integrity.officialEmail,
      userName: integrity.fullName,
    }

    // Cleanup any existing timesheet for this test month to ensure idempotency
    const supabase = createAdminClient()
    if (supabase) {
      const { data: existingTs } = await supabase
        .from('timesheets')
        .select('id')
        .eq('company_id', companyId)
        .eq('employee_id', integrity.employeeId)
        .eq('year', testYear)
        .eq('month', testMonth)
        .maybeSingle()

      if (existingTs) {
        await supabase.from('timesheet_reviews').delete().eq('timesheet_id', existingTs.id)
        await supabase.from('timesheet_entries').delete().eq('timesheet_id', existingTs.id)
        await supabase.from('timesheets').delete().eq('id', existingTs.id)
      }
    }

    // Step 1: Save Draft
    const draft = await saveTimesheetDraft(
      companyId,
      integrity.employeeId,
      testYear,
      testMonth,
      [
        {
          entryDate: '2026-09-01',
          projectName: 'Haryak HRMS Rebuild',
          taskCategory: 'Development',
          description: 'Auth repair & timesheet architecture implementation',
          hours: 8,
          isBillable: true,
        },
        {
          entryDate: '2026-09-02',
          projectName: 'Haryak HRMS Rebuild',
          taskCategory: 'Architecture',
          description: 'Payroll readiness gate integration',
          hours: 8,
          isBillable: true,
        },
      ],
      userContext
    )
    expect(draft.status).toBe('DRAFT')
    expect(draft.totalHours).toBe(16)
    expect(draft.billableHours).toBe(16)

    // Gate check before submit: unapproved
    const gateBeforeSubmit = await isTimesheetApprovedForPayroll(companyId, integrity.employeeId, testYear, testMonth)
    expect(gateBeforeSubmit.approved).toBe(false)
    expect(gateBeforeSubmit.status).toBe('DRAFT')

    // Step 2: Submit Timesheet
    const submitted = await submitTimesheet(companyId, integrity.employeeId, testYear, testMonth, userContext)
    expect(submitted.status).toBe('SUBMITTED')

    // Gate check while submitted: still unapproved
    const gateWhileSubmitted = await isTimesheetApprovedForPayroll(companyId, integrity.employeeId, testYear, testMonth)
    expect(gateWhileSubmitted.approved).toBe(false)
    expect(gateWhileSubmitted.status).toBe('SUBMITTED')

    // Step 3: Admin Returns for Correction
    const returned = await reviewTimesheet(
      companyId,
      submitted.id,
      'RETURN_FOR_CORRECTION',
      'Please specify project deliverables in entry description.',
      adminContext
    )
    expect(returned.status).toBe('RETURNED_FOR_CORRECTION')
    expect(returned.comments).toBe('Please specify project deliverables in entry description.')

    // Step 4: Employee Resubmits
    const resubmitted = await submitTimesheet(companyId, integrity.employeeId, testYear, testMonth, userContext)
    expect(resubmitted.status).toBe('SUBMITTED')

    // Step 5: Admin Approves Timesheet
    const approved = await reviewTimesheet(
      companyId,
      resubmitted.id,
      'APPROVE',
      'Timesheet reviewed and approved for September 2026 payroll.',
      adminContext
    )
    expect(approved.status).toBe('APPROVED')

    // Gate check after approval: APPROVED!
    const gateAfterApproval = await isTimesheetApprovedForPayroll(companyId, integrity.employeeId, testYear, testMonth)
    expect(gateAfterApproval.approved).toBe(true)
    expect(gateAfterApproval.status).toBe('APPROVED')
  }, 60000)
})
