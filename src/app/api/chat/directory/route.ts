import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestContext } from '@/lib/services/company-resolver'
import { searchCompanyDirectory } from '@/lib/services/employee-directory-service'

export async function GET(request: NextRequest) {
  const resolved = await resolveRequestContext()
  if (!resolved.ok) {
    return NextResponse.json({ success: false, error: resolved.error.message }, { status: resolved.error.status })
  }
  const { context } = resolved

  const { searchParams } = new URL(request.url)
  const query = searchParams.get('query') || ''
  const excludeSelf = searchParams.get('exclude_self') !== 'false'

  try {
    const results = await searchCompanyDirectory(context.companyId, {
      query,
      excludeEmployeeId: excludeSelf && context.employeeId ? context.employeeId : undefined,
      currentEmployeeId: context.employeeId || undefined,
    })

    return NextResponse.json({
      success: true,
      results: results.map(r => ({
        id: r.employeeId,
        employeeCode: r.employeeCode,
        fullName: r.fullName,
        officialEmail: r.officialEmail,
        department: r.department,
        designation: r.designation,
        avatarUrl: r.avatarUrl,
        isSelf: r.isSelf,
      })),
      count: results.length,
    })
  } catch (error: any) {
    console.error('Error searching chat directory:', error)
    return NextResponse.json({ success: false, error: error.message || 'Error searching directory' }, { status: 500 })
  }
}
