import { createAdminClient } from '@/lib/supabase/admin'
import { createAuditLog } from '@/lib/services/audit-service'
import { searchSafeDirectory } from '@/lib/services/chat-service'
import { generateDocumentNumber, buildTemplateContent } from '@/lib/services/document-service'
import { getActiveLetterhead } from '@/lib/services/letterhead-service'

export interface AiRequestContext {
  companyId: string
  authUserId: string
  employeeId?: string | null
  employeeCode?: string | null
  fullName: string
  email: string
  role: string
  isAdmin: boolean
}

export interface AiChatResponse {
  message: string
  toolUsed?: string
  data?: any
  isDenied?: boolean
}

/**
 * Enterprise AI Assistant with strict RBAC server-side tools
 */
export async function processAiQuery(
  context: AiRequestContext,
  prompt: string
): Promise<AiChatResponse> {
  const cleanPrompt = prompt.trim().toLowerCase()
  const supabase = createAdminClient()

  // 1. CRITICAL SECURITY GUARDRAIL: Cross-Employee Financial / Statutory Queries
  // Check if user is asking about salary, compensation, payslip, bank account, PAN, or UAN of another employee
  const isSalaryInquiry =
    /\b(salary|salaries|compensation|ctc|payslip|payslips|pay\s*slip|bank|pan|uan|earnings?|earns?|deductions?)\b/i.test(prompt)

  const isSelfReference =
    /\b(my\s+salary|my\s+payslip|my\s+pay|my\s+compensation|my\s+ctc|my\s+bank|my\s+earnings|my\s+details)\b/i.test(prompt)

  // Check if prompt mentions specific names or codes other than self
  const mentionsOtherEmployee =
    /\b(hrk-\d{3,4})\b/i.test(prompt) ||
    /\b(priya|rajesh|vikram|sneha|ananya|amit|suresh|ramesh|someone|someone's|colleague|peer|others?)\b/i.test(prompt)

  // DENIAL TRIGGER: If asking for someone else's financial info
  if (isSalaryInquiry && (mentionsOtherEmployee || !isSelfReference)) {
    // If not self reference, check if looking at another employee
    const targetCodeMatch = prompt.match(/\b(HRK-\d{3,4})\b/i)
    const targetCode = targetCodeMatch ? targetCodeMatch[1].toUpperCase() : null

    // Even if it matches self, if self code is known and different, block it
    if (targetCode && context.employeeCode && targetCode === context.employeeCode.toUpperCase()) {
      // Allowed: asking about self by code
    } else if (!context.isAdmin || mentionsOtherEmployee) {
      try {
        // Log security denial event in audit logs
        await createAuditLog({
          companyId: context.companyId,
          userId: context.authUserId,
          userEmail: context.email,
          userName: context.fullName,
          action: 'rejected',
          entityType: 'ai_assistant',
          entityName: 'Salary Query Security Policy',
          description: `Blocked unauthorized AI salary query: "${prompt}"`,
          reason: 'CROSS_EMPLOYEE_DATA_ISOLATION_VIOLATION',
        })
      } catch {}

      return {
        message: 'I cannot fulfill this request. Access to other employees\' compensation, payslip, bank account, or statutory records is strictly restricted under Haryak Enterprise Security Policy.',
        isDenied: true,
        toolUsed: 'security_guardrail',
      }
    }
  }

  // 2. Tool: getMyPayslip
  if (isSalaryInquiry && isSelfReference) {
    if (!context.employeeId || !supabase) {
      return {
        message: 'Your employee record is not linked or database is unavailable. Please check with HR.',
      }
    }

    const { data: payslip } = await supabase
      .from('payslips')
      .select('*, payroll_runs:payroll_run_id(period_start, period_end)')
      .eq('company_id', context.companyId)
      .eq('employee_id', context.employeeId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!payslip) {
      return {
        message: 'You currently have no published payslips in the system. When monthly payroll is approved and released, your itemized payslip breakdown will appear here.',
        toolUsed: 'getMyPayslip',
      }
    }

    const snap = payslip.snapshot_data || {}
    const gross = snap.grossEarnings || snap.gross_earnings || payslip.gross_salary || payslip.gross_earnings || 0
    const deductions = snap.totalDeductions || snap.total_deductions || payslip.total_deductions || 0
    const net = snap.netSalary || snap.net_pay || payslip.net_salary || 0
    const month = payslip.period_month || payslip.month || (new Date().getMonth() + 1)
    const year = payslip.period_year || payslip.year || new Date().getFullYear()

    await createAuditLog({
      companyId: context.companyId,
      userId: context.authUserId,
      userEmail: context.email,
      userName: context.fullName,
      action: 'viewed',
      entityType: 'ai_assistant',
      entityId: payslip.id,
      entityName: `Payslip ${month}/${year}`,
      description: `AI retrieved own payslip breakdown for ${context.fullName}`,
      reason: 'AI_ASSISTANT_QUERY',
    })

    return {
      message: `Here is your latest payslip summary for ${month}/${year}:\n\n` +
        `• Gross Earnings: ₹${Number(gross).toLocaleString('en-IN')}\n` +
        `• Total Deductions: ₹${Number(deductions).toLocaleString('en-IN')}\n` +
        `• Net Pay: ₹${Number(net).toLocaleString('en-IN')}\n\n` +
        `You can view the full official payslip with all allowances and statutory deductions under "My Payslips".`,
      toolUsed: 'getMyPayslip',
      data: { gross, deductions, net, month, year },
    }
  }

  // 3. Tool: getMyLeaveBalance
  if (cleanPrompt.includes('leave') || cleanPrompt.includes('vacation') || cleanPrompt.includes('pto') || cleanPrompt.includes('time off')) {
    if (!context.employeeId || !supabase) {
      return {
        message: 'Employee record not found. Please log in with your employee account to view leave balances.',
      }
    }

    const { data: balances } = await supabase
      .from('leave_balances')
      .select('*, leave_types:leave_type_id(name, code)')
      .eq('employee_id', context.employeeId)

    if (!balances || balances.length === 0) {
      return {
        message: 'You have standard annual leave allocations: Casual Leave (CL): 12 days, Sick Leave (SL): 12 days, Paid Leave (PL): 18 days. Submit requests via "My Leaves".',
        toolUsed: 'getMyLeaveBalance',
      }
    }

    const lines = balances.map((b: any) =>
      `• ${b.leave_types?.name || 'Leave'}: ${b.balance_days ?? b.total_days} days available (Used: ${b.used_days || 0})`
    )

    await createAuditLog({
      companyId: context.companyId,
      userId: context.authUserId,
      userEmail: context.email,
      userName: context.fullName,
      action: 'viewed',
      entityType: 'ai_assistant',
      entityName: 'Leave Balances',
      description: `AI retrieved leave balance for ${context.fullName}`,
      reason: 'AI_ASSISTANT_QUERY',
    })

    return {
      message: `Your current leave balances for the fiscal year:\n\n${lines.join('\n')}\n\nYou can apply for new leave directly under "My Leaves".`,
      toolUsed: 'getMyLeaveBalance',
      data: balances,
    }
  }

  // 4. Tool: findEmployeeDirectory
  if (
    cleanPrompt.includes('who is') ||
    cleanPrompt.includes('find') ||
    cleanPrompt.includes('search') ||
    cleanPrompt.includes('directory') ||
    cleanPrompt.includes('contact') ||
    cleanPrompt.includes('email of') ||
    cleanPrompt.includes('department of') ||
    /\b(hrk-\d{3,4})\b/i.test(prompt)
  ) {
    const queryParts = prompt.replace(/(who is|find|search|employee|directory|contact|email of|department of)/gi, '').trim()
    const results = await searchSafeDirectory(context.companyId, queryParts)

    if (results.length === 0) {
      return {
        message: `No employee matching "${queryParts}" was found in the active company directory.`,
        toolUsed: 'findEmployeeDirectory',
      }
    }

    const empCards = results.slice(0, 3).map(emp =>
      `• **${emp.fullName}** (${emp.employeeCode})\n  Designation: ${emp.designation}\n  Department: ${emp.department}\n  Official Email: ${emp.officialEmail}`
    ).join('\n\n')

    await createAuditLog({
      companyId: context.companyId,
      userId: context.authUserId,
      userEmail: context.email,
      userName: context.fullName,
      action: 'viewed',
      entityType: 'ai_assistant',
      entityName: 'Directory Search',
      description: `AI searched employee directory for "${queryParts}"`,
      reason: 'AI_ASSISTANT_QUERY',
    })

    return {
      message: `Here are the matching directory records (Safe Public Card):\n\n${empCards}\n\n*Note: In accordance with enterprise privacy regulations, financial and personal identity details are excluded.*`,
      toolUsed: 'findEmployeeDirectory',
      data: results,
    }
  }

  // 5. Tool: getMyTimesheet
  if (cleanPrompt.includes('timesheet') || cleanPrompt.includes('hours') || cleanPrompt.includes('work log')) {
    const { getEmployeeMonthlyTimesheet, listAdminTimesheets } = await import('@/lib/services/timesheet-service')
    const now = new Date()
    const currentYear = now.getFullYear()
    const currentMonth = now.getMonth() + 1

    if (context.isAdmin && (cleanPrompt.includes('pending') || cleanPrompt.includes('approve') || cleanPrompt.includes('all'))) {
      const allTs = await listAdminTimesheets(context.companyId, { year: currentYear, month: currentMonth })
      const pending = allTs.filter(t => t.status === 'SUBMITTED' || t.status === 'UNDER_REVIEW')
      return {
        message: `Admin Timesheet Summary (${currentMonth}/${currentYear}):\n\n` +
          `• Total Submitted: ${allTs.length}\n` +
          `• Pending Review: ${pending.length}\n` +
          `• Approved: ${allTs.filter(t => t.status === 'APPROVED' || t.status === 'LOCKED').length}\n\n` +
          `You can inspect and approve them in the Timesheet Approvals queue under Operations.`,
        toolUsed: 'getAdminTimesheets',
        data: { total: allTs.length, pending: pending.length },
      }
    }

    if (!context.employeeId) {
      return {
        message: 'Employee record not found. Please ensure you are logged into your employee self-service account.',
      }
    }

    const myTs = await getEmployeeMonthlyTimesheet(context.companyId, context.employeeId, currentYear, currentMonth)
    return {
      message: `Your Timesheet for ${currentMonth}/${currentYear}:\n\n` +
        `• Status: ${myTs.status}\n` +
        `• Total Hours Logged: ${myTs.totalHours} hrs\n` +
        `• Billable Hours: ${myTs.billableHours} hrs\n` +
        `• Total Entries: ${myTs.entries.length}\n\n` +
        (myTs.status === 'DRAFT' ? 'Remember to submit your timesheet before the end of the payroll period!' : 'Your timesheet is currently undergoing administrator review for payroll verification.'),
      toolUsed: 'getMyTimesheet',
      data: myTs,
    }
  }

  // 6. Tool: getCompanyPolicy & Holidays
  if (cleanPrompt.includes('policy') || cleanPrompt.includes('holiday') || cleanPrompt.includes('working hour') || cleanPrompt.includes('office') || cleanPrompt.includes('timing')) {
    if (cleanPrompt.includes('holiday')) {
      const { data: holidays } = await supabase
        ?.from('holidays')
        .select('*')
        .eq('company_id', context.companyId)
        .order('holiday_date', { ascending: true }) || { data: [] }

      if (holidays && holidays.length > 0) {
        const holidayList = holidays.map((h: any) =>
          `• ${h.name}: ${new Date(h.holiday_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`
        ).join('\n')

        return {
          message: `Official Company Holidays for Haryak Technologies India Private Limited:\n\n${holidayList}`,
          toolUsed: 'getCompanyPolicy',
        }
      }

      return {
        message: 'Haryak Technologies India Private Limited observes standard statutory national and festival holidays (Republic Day, Independence Day, Gandhi Jayanti, Diwali, Dussehra, Pongal/Sankranti, New Year). Check the Company Calendar for the full annual schedule.',
        toolUsed: 'getCompanyPolicy',
      }
    }

    return {
      message: 'Haryak Technologies India Private Limited Corporate Policies:\n\n' +
        '• Working Hours: 09:30 AM to 06:30 PM (Monday to Friday)\n' +
        '• Work Location: Hyderabad HQ (Santhi Nagar, Chilakaluripet, AP)\n' +
        '• Code of Conduct: Mutual respect, zero tolerance for harassment, data confidentiality\n' +
        '• Probation Policy: Standard 3 months probation subject to formal confirmation review\n' +
        '• Notice Period: 15 days during probation, 60 days post-confirmation',
      toolUsed: 'getCompanyPolicy',
    }
  }

  // 6. Tool: createHrDocumentDraft (Admin only)
  if (cleanPrompt.includes('draft') || cleanPrompt.includes('generate letter') || cleanPrompt.includes('create letter') || cleanPrompt.includes('offer letter')) {
    if (!context.isAdmin) {
      return {
        message: 'Unauthorized: Only HR Administrators can initiate and generate official employment letters.',
        isDenied: true,
        toolUsed: 'createHrDocumentDraft',
      }
    }

    return {
      message: 'To draft an official letter on authoritative company letterhead:\n\n' +
        '1. Navigate to the **Official Document Center** under Management.\n' +
        '2. Click **"+ Generate Official Letter"**.\n' +
        '3. Select the employee, document type (Offer, Appointment, Joining, Salary Revision, Relieving, Experience), and effective dates.\n' +
        '4. The system will automatically allocate a sequential reference number (e.g. `HRK/HR/OFFER/2026/0001`) and render it on official stationery.',
      toolUsed: 'createHrDocumentDraft',
    }
  }

  // Default helpful response
  return {
    message: `Hello ${context.fullName}! I am the Haryak Enterprise AI Assistant. I operate strictly under role-based access control.\n\n` +
      'Here are things I can assist you with:\n' +
      '• **"What is my leave balance?"** — View your available leave quotas\n' +
      '• **"Show my latest payslip"** — View your latest salary summary\n' +
      '• **"Find Rajesh in directory"** — Look up a colleague\'s designation and email\n' +
      '• **"What are the company holidays?"** — Check official paid holidays and office timings\n' +
      (context.isAdmin ? '• **"How do I draft an Offer Letter?"** — Guide through Document Center generation\n' : ''),
  }
}
