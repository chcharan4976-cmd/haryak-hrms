import { NextResponse } from 'next/server'
import { resolveAuthenticatedEmployee, getCanonicalEmployeeProfile } from '@/lib/services/company-resolver'

export async function GET() {
  try {
    const resolution = await resolveAuthenticatedEmployee()

    if (!resolution.ok) {
      return NextResponse.json(
        {
          success: false,
          code: resolution.error.code,
          error: resolution.error.message,
        },
        { status: resolution.error.status }
      )
    }

    const { employee, context } = resolution

    const profile = await getCanonicalEmployeeProfile(employee.employeeId, employee.companyId)

    if (!profile) {
      return NextResponse.json(
        {
          success: false,
          code: 'EMPLOYEE_RECORD_NOT_FOUND',
          error: 'Employee record exists in auth linkage but could not be loaded from database.',
        },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      profile,
      // Canonical employee identity
      employee: {
        id: profile.employeeId,
        code: profile.employeeCode,
        fullName: profile.fullName,
        email: profile.officialEmail,
        department: profile.department,
        designation: profile.designation,
        status: profile.employmentStatus,
      },
      // Development safe diagnostic
      diagnostic: {
        authUserId: context.authUserId,
        resolvedEmployeeId: employee.employeeId,
        employeeCode: employee.employeeCode,
        companyId: employee.companyId,
      },
    })
  } catch (error: any) {
    console.error('Portal me resolution error:', error)
    return NextResponse.json(
      { success: false, code: 'INTERNAL_ERROR', error: 'Internal server error resolving portal profile.' },
      { status: 500 }
    )
  }
}
