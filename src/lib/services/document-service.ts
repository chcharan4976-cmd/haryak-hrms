import { createAdminClient } from '@/lib/supabase/admin'
import { getActiveLetterhead } from './letterhead-service'

export interface OfficialDocumentContent {
  documentType: string
  documentNumber: string
  subject: string
  salutation: string
  bodyParagraphs: string[]
  clauses?: { title: string; content: string }[]
  compensationDetails?: {
    annualCtc?: number
    monthlyGross?: number
    components?: { name: string; amount: number }[]
  }
  dates: {
    issueDate: string
    effectiveDate: string
    joiningDate?: string
    lastWorkingDate?: string
  }
  signatory: {
    name: string
    title: string
    organization: string
  }
}

export interface OfficialDocumentMeta {
  status: 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'ISSUED' | 'ACKNOWLEDGED' | 'SUPERSEDED' | 'REVOKED'
  documentNumber: string
  issueDate: string
  effectiveDate: string
  generatedAt: string
  generatedBy: string
  approvedAt?: string | null
  approvedBy?: string | null
  issuedAt?: string | null
  issuedBy?: string | null
  acknowledgedAt?: string | null
  letterheadVersion: number
  templateVersion: number
  supersedesDocumentId?: string | null
  fileHash?: string | null
  content: OfficialDocumentContent
}

/**
 * Generate a database-safe sequential document reference number
 */
export async function generateDocumentNumber(companyId: string, docType: string): Promise<string> {
  const supabase = createAdminClient()
  const year = new Date().getFullYear()
  const prefixMap: Record<string, string> = {
    offer_letter: 'OFFER',
    appointment_letter: 'APPT',
    joining_letter: 'JOIN',
    salary_revision: 'REV',
    resignation_acceptance: 'RES',
    relieving_letter: 'REL',
    experience_letter: 'EXP',
    custom_letter: 'GEN',
  }
  const typeCode = prefixMap[docType] || 'DOC'

  if (!supabase) {
    const randSeq = Math.floor(Math.random() * 9000 + 1000)
    return `HRK/HR/${typeCode}/${year}/${randSeq}`
  }

  // Count existing documents of this type in this year for the company
  const { count } = await supabase
    .from('documents')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('document_type', docType)

  const seq = String((count || 0) + 1).padStart(4, '0')
  return `HRK/HR/${typeCode}/${year}/${seq}`
}

/**
 * Construct default template content for an employee
 */
export function buildTemplateContent(params: {
  employee: any
  docType: string
  documentNumber: string
  issueDate?: string
  effectiveDate?: string
  customClauses?: { title: string; content: string }[]
  signatoryName?: string
  signatoryTitle?: string
}): OfficialDocumentContent {
  const { employee, docType, documentNumber, issueDate, effectiveDate, customClauses, signatoryName, signatoryTitle } = params
  const nowStr = new Date().toISOString().split('T')[0]
  const docIssueDate = issueDate || nowStr
  const docEffectiveDate = effectiveDate || employee.joining_date || docIssueDate

  const empName = employee.full_name || `${employee.first_name || ''} ${employee.last_name || ''}`.trim()
  const empCode = employee.employee_code || ''
  const designation = employee.designations?.name || employee.designation || 'Not assigned'
  const department = employee.departments?.name || employee.department || 'Not assigned'
  const joiningDate = employee.joining_date || docEffectiveDate

  const baseSignatory = {
    name: signatoryName || 'Authorized Signatory',
    title: signatoryTitle || 'Head of Human Resources',
    organization: 'Haryak Technologies India Private Limited',
  }

  switch (docType) {
    case 'offer_letter':
      return {
        documentType: 'offer_letter',
        documentNumber,
        subject: `Offer of Employment — ${designation}`,
        salutation: `Dear ${empName},`,
        bodyParagraphs: [
          `We are pleased to offer you the position of ${designation} in the ${department} department at Haryak Technologies India Private Limited.`,
          `Your official joining date is scheduled for ${joiningDate}. We were impressed with your qualifications, technical competence, and personal values, and we believe you will make a valuable contribution to our mission.`,
          `This offer is contingent upon satisfactory completion of reference checks, background verification, and formal documentation. Please sign and return a copy of this letter within five business days as your formal acceptance.`,
        ],
        clauses: customClauses || [
          { title: 'Probation Period', content: 'You will be on probation for a period of 3 months from the date of joining, which may be extended based on performance.' },
          { title: 'Work Location', content: 'Your initial place of posting will be Hyderabad HQ, with standard operating hours from Monday to Friday.' },
        ],
        dates: { issueDate: docIssueDate, effectiveDate: docEffectiveDate, joiningDate },
        signatory: baseSignatory,
      }

    case 'appointment_letter':
      return {
        documentType: 'appointment_letter',
        documentNumber,
        subject: `Appointment as ${designation}`,
        salutation: `Dear ${empName} (${empCode}),`,
        bodyParagraphs: [
          `Pursuant to your acceptance of our offer, we are pleased to confirm your appointment as ${designation} in the ${department} department at Haryak Technologies India Private Limited, effective ${docEffectiveDate}.`,
          `Your employment is governed by the standard policies, code of conduct, and employment agreements of Haryak Technologies India Private Limited as in force from time to time.`,
        ],
        clauses: customClauses || [
          { title: 'Notice Period', content: 'During probation, either party may terminate employment with 15 days notice. Post-confirmation, the notice period shall be 60 days.' },
          { title: 'Confidentiality & IP', content: 'All intellectual property, proprietary software, and trade secrets developed during your employment shall remain the sole property of the Company.' },
        ],
        dates: { issueDate: docIssueDate, effectiveDate: docEffectiveDate, joiningDate },
        signatory: baseSignatory,
      }

    case 'joining_letter':
      return {
        documentType: 'joining_letter',
        documentNumber,
        subject: 'Joining Confirmation & Employment Commencement',
        salutation: `Dear ${empName},`,
        bodyParagraphs: [
          `This letter formally confirms that you have reported for duty and commenced your active employment with Haryak Technologies India Private Limited on ${joiningDate} as ${designation} (Employee ID: ${empCode}).`,
          `Your onboarding formalities and orientation have been successfully completed. We welcome you to the Haryak family and wish you an inspiring and fulfilling journey with us.`,
        ],
        dates: { issueDate: docIssueDate, effectiveDate: docEffectiveDate, joiningDate },
        signatory: baseSignatory,
      }

    case 'salary_revision':
      return {
        documentType: 'salary_revision',
        documentNumber,
        subject: 'Annual Compensation Revision & Performance Appreciation',
        salutation: `Dear ${empName},`,
        bodyParagraphs: [
          `In recognition of your performance and valuable contributions to Haryak Technologies India Private Limited, the management is pleased to revise your compensation structure with effect from ${docEffectiveDate}.`,
          `Please find the enclosed detailed salary breakdown outlining your revised gross entitlement and applicable statutory allowances. All other terms and conditions of your employment remain unchanged.`,
        ],
        dates: { issueDate: docIssueDate, effectiveDate: docEffectiveDate },
        signatory: baseSignatory,
      }

    case 'resignation_acceptance':
      return {
        documentType: 'resignation_acceptance',
        documentNumber,
        subject: 'Acceptance of Resignation',
        salutation: `Dear ${empName},`,
        bodyParagraphs: [
          `We acknowledge receipt of your formal resignation letter. Management has accepted your resignation from the position of ${designation} at Haryak Technologies India Private Limited.`,
          `Your last working day has been confirmed as ${employee.last_working_date || docEffectiveDate}. You are requested to complete all pending handover responsibilities and departmental clearances prior to your final release.`,
        ],
        dates: { issueDate: docIssueDate, effectiveDate: docEffectiveDate, lastWorkingDate: employee.last_working_date || docEffectiveDate },
        signatory: baseSignatory,
      }

    case 'relieving_letter':
      return {
        documentType: 'relieving_letter',
        documentNumber,
        subject: 'Relieving Letter & Release of Service',
        salutation: 'To Whom It May Concern,',
        bodyParagraphs: [
          `This is to certify that ${empName} (Employee ID: ${empCode}) was employed with Haryak Technologies India Private Limited as ${designation} in the ${department} department from ${joiningDate} to ${employee.last_working_date || docEffectiveDate}.`,
          `They have been formally relieved from their duties at the close of business hours on ${employee.last_working_date || docEffectiveDate}. All organizational clearances, asset returns, and Full & Final financial settlements have been duly concluded.`,
          `We appreciate their contributions to Haryak Technologies and wish them continued success in their future endeavors.`,
        ],
        dates: { issueDate: docIssueDate, effectiveDate: docEffectiveDate, joiningDate, lastWorkingDate: employee.last_working_date || docEffectiveDate },
        signatory: baseSignatory,
      }

    case 'experience_letter':
      return {
        documentType: 'experience_letter',
        documentNumber,
        subject: 'Experience & Service Certificate',
        salutation: 'To Whom It May Concern,',
        bodyParagraphs: [
          `This certifies that ${empName} (Employee ID: ${empCode}) served as a full-time employee with Haryak Technologies India Private Limited from ${joiningDate} to ${employee.last_working_date || docEffectiveDate}.`,
          `During their tenure, they held the designation of ${designation} in the ${department} team. Their conduct was professional and their work output met the standards expected of their role.`,
        ],
        dates: { issueDate: docIssueDate, effectiveDate: docEffectiveDate, joiningDate, lastWorkingDate: employee.last_working_date || docEffectiveDate },
        signatory: baseSignatory,
      }

    default:
      return {
        documentType: 'custom_letter',
        documentNumber,
        subject: 'Official Communication',
        salutation: `Dear ${empName},`,
        bodyParagraphs: [
          `This official letter is issued to ${empName} (${empCode}), ${designation} in the ${department} department at Haryak Technologies India Private Limited.`,
        ],
        dates: { issueDate: docIssueDate, effectiveDate: docEffectiveDate },
        signatory: baseSignatory,
      }
  }
}
