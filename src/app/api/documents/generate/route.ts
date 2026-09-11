import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveRequestContext, isAdmin } from '@/lib/services/company-resolver'
import { generateDocumentNumber, buildTemplateContent } from '@/lib/services/document-service'
import { getActiveLetterhead } from '@/lib/services/letterhead-service'
import { createAuditLog } from '@/lib/services/audit-service'

export async function POST(request: NextRequest) {
  const resolved = await resolveRequestContext()
  if (!resolved.ok) {
    return NextResponse.json({ success: false, error: resolved.error.message }, { status: resolved.error.status })
  }
  const { context } = resolved

  if (!isAdmin(context)) {
    return NextResponse.json({ success: false, error: 'Unauthorized: Only HR Administrators can generate official letters.' }, { status: 403 })
  }

  const body = await request.json()
  const {
    employeeId,
    docType,
    issueDate,
    effectiveDate,
    customClauses,
    customSubject,
    customBody,
    signatoryName,
    signatoryTitle,
  } = body

  if (!employeeId || !docType) {
    return NextResponse.json({ success: false, error: 'Missing employeeId or docType.' }, { status: 400 })
  }

  const supabase = createAdminClient()
  if (!supabase) return NextResponse.json({ success: false, error: 'Database unavailable' }, { status: 503 })

  // 1. Fetch exact employee record
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(employeeId)
  let empQuery = supabase
    .from('employees')
    .select('*, departments:department_id(name), designations:designation_id(name)')
    .eq('company_id', context.companyId)

  if (isUUID) {
    empQuery = empQuery.eq('id', employeeId)
  } else {
    empQuery = empQuery.eq('employee_code', employeeId.toUpperCase())
  }

  const { data: employee, error: empErr } = await empQuery.maybeSingle()
  if (empErr || !employee) {
    return NextResponse.json({ success: false, error: 'Employee not found.' }, { status: 404 })
  }

  // 2. Resolve active letterhead version
  const activeLetterhead = await getActiveLetterhead(context.companyId)

  // 3. Generate sequential reference number
  const documentNumber = await generateDocumentNumber(context.companyId, docType)

  // 4. Build template content
  const content = buildTemplateContent({
    employee,
    docType,
    documentNumber,
    issueDate,
    effectiveDate,
    customClauses,
    signatoryName,
    signatoryTitle,
  })

  if (customSubject) content.subject = customSubject
  if (customBody && Array.isArray(customBody)) content.bodyParagraphs = customBody

  const now = new Date().toISOString()
  const meta = {
    status: 'DRAFT',
    documentNumber,
    issueDate: content.dates.issueDate,
    effectiveDate: content.dates.effectiveDate,
    generatedAt: now,
    generatedBy: context.fullName,
    letterheadVersion: activeLetterhead.version,
    templateVersion: 1,
    content,
  }

  const fileName = `Haryak_${docType}_${employee.employee_code || employee.id}.pdf`

  // 5. Persist document draft
  const { data: newDoc, error: insertErr } = await supabase
    .from('documents')
    .insert({
      company_id: context.companyId,
      employee_id: employee.id,
      document_type: docType,
      title: content.subject,
      description: JSON.stringify(meta),
      file_url: `/documents/${employee.id}/${fileName}`,
      file_name: fileName,
      version: 1,
      visibility: 'private',
      uploaded_by: context.authUserId,
    })
    .select()
    .single()

  if (insertErr) {
    return NextResponse.json({ success: false, error: insertErr.message }, { status: 500 })
  }

  // 6. Audit log
  await createAuditLog({
    companyId: context.companyId,
    userId: context.authUserId,
    userEmail: context.email,
    userName: context.fullName,
    action: 'created',
    entityType: 'document',
    entityId: newDoc.id,
    entityName: content.subject,
    description: `Generated draft ${documentNumber} (${docType}) for ${employee.full_name} (${employee.employee_code})`,
    reason: 'DOCUMENT_GENERATION',
  })

  return NextResponse.json({
    success: true,
    document: {
      id: newDoc.id,
      documentNumber,
      documentType: docType,
      title: content.subject,
      status: 'DRAFT',
      issueDate: content.dates.issueDate,
      effectiveDate: content.dates.effectiveDate,
      generatedAt: now,
      content,
      letterheadVersion: activeLetterhead.version,
      employeeId: employee.id,
      employeeCode: employee.employee_code,
      employeeName: employee.full_name,
    },
    message: `Draft ${documentNumber} generated successfully.`,
  })
}
