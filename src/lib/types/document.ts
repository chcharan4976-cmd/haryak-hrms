/**
 * HARYAK ONE — Enterprise Document Management System (EDMS) Types
 * Haryak Technologies India Private Limited
 * Company tagline: Empowering Tomorrow’s Solutions, Today.
 */

export type DocumentCategoryGroup =
  | 'identity_onboarding'
  | 'employment_hr'
  | 'payroll_statutory'
  | 'company_policy'

export type DocumentLifecycleStatus =
  | 'DRAFT'
  | 'UPLOADED'
  | 'PENDING_VERIFICATION'
  | 'VERIFIED'
  | 'REJECTED'
  | 'REPLACEMENT_REQUESTED'
  | 'EXPIRED'
  | 'ARCHIVED'
  | 'APPROVED'
  | 'ISSUED'
  | 'ACKNOWLEDGED'
  | 'SUPERSEDED'

export type DocumentExpiryStatus =
  | 'ACTIVE'
  | 'EXPIRING_SOON'
  | 'EXPIRED'
  | 'NOT_APPLICABLE'

export interface DocumentCategoryDefinition {
  code: string
  name: string
  group: DocumentCategoryGroup
  groupName: string
  description: string
  isMandatoryForEmployee?: boolean
  hasExpiry?: boolean
  defaultRetentionMonths?: number
}

export const DOCUMENT_CATEGORIES: DocumentCategoryDefinition[] = [
  // 1. Employee identity and onboarding
  {
    code: 'identity_proof',
    name: 'Government Identity Proof',
    group: 'identity_onboarding',
    groupName: 'Identity & Onboarding',
    description: 'Voter ID, Driving License, or valid government ID proof',
    isMandatoryForEmployee: true,
    hasExpiry: true,
  },
  {
    code: 'address_proof',
    name: 'Address Proof',
    group: 'identity_onboarding',
    groupName: 'Identity & Onboarding',
    description: 'Electricity bill, Rent agreement, or official residential proof',
    isMandatoryForEmployee: true,
    hasExpiry: true,
  },
  {
    code: 'pan_card',
    name: 'PAN Documentation',
    group: 'identity_onboarding',
    groupName: 'Identity & Onboarding',
    description: 'Permanent Account Number card copy as required by Indian Income Tax regulations',
    isMandatoryForEmployee: true,
    hasExpiry: false,
  },
  {
    code: 'aadhaar_card',
    name: 'Aadhaar Documentation',
    group: 'identity_onboarding',
    groupName: 'Identity & Onboarding',
    description: 'Lawfully collected UIDAI Aadhaar document (first 8 digits masked)',
    isMandatoryForEmployee: false,
    hasExpiry: false,
  },
  {
    code: 'passport',
    name: 'Passport',
    group: 'identity_onboarding',
    groupName: 'Identity & Onboarding',
    description: 'Valid Republic of India or international passport copy',
    isMandatoryForEmployee: false,
    hasExpiry: true,
  },
  {
    code: 'education_certificate',
    name: 'Educational Certificates',
    group: 'identity_onboarding',
    groupName: 'Identity & Onboarding',
    description: 'Degree certificates, marksheets, and academic credentials',
    isMandatoryForEmployee: true,
    hasExpiry: false,
  },
  {
    code: 'experience_letter',
    name: 'Prior Experience Letter',
    group: 'identity_onboarding',
    groupName: 'Identity & Onboarding',
    description: 'Service and experience certificates from previous employers',
    isMandatoryForEmployee: false,
    hasExpiry: false,
  },
  {
    code: 'relieving_letter',
    name: 'Prior Relieving Letter',
    group: 'identity_onboarding',
    groupName: 'Identity & Onboarding',
    description: 'Official relieving and discharge letter from immediate past employer',
    isMandatoryForEmployee: false,
    hasExpiry: false,
  },
  {
    code: 'bgv_report',
    name: 'Background Verification Report',
    group: 'identity_onboarding',
    groupName: 'Identity & Onboarding',
    description: 'Third-party criminal, tenure, and credential verification dossier',
    isMandatoryForEmployee: false,
    hasExpiry: false,
  },
  {
    code: 'joining_form',
    name: 'Employee Joining & Declaration Form',
    group: 'identity_onboarding',
    groupName: 'Identity & Onboarding',
    description: 'Signed HR onboarding enrollment and emergency contact form',
    isMandatoryForEmployee: true,
    hasExpiry: false,
  },
  {
    code: 'employment_agreement',
    name: 'Employment Agreement',
    group: 'identity_onboarding',
    groupName: 'Identity & Onboarding',
    description: 'Standard terms of employment contract signed upon commencement',
    isMandatoryForEmployee: true,
    hasExpiry: false,
  },
  {
    code: 'offer_letter',
    name: 'Offer Letter',
    group: 'identity_onboarding',
    groupName: 'Identity & Onboarding',
    description: 'Formal corporate job offer issued to candidate',
    isMandatoryForEmployee: true,
    hasExpiry: false,
  },
  {
    code: 'appointment_letter',
    name: 'Appointment Letter',
    group: 'identity_onboarding',
    groupName: 'Identity & Onboarding',
    description: 'Executive appointment letter specifying role, reporting, and terms',
    isMandatoryForEmployee: true,
    hasExpiry: false,
  },

  // 2. Employment and HR
  {
    code: 'confirmation_letter',
    name: 'Probation Confirmation Letter',
    group: 'employment_hr',
    groupName: 'Employment & HR',
    description: 'Official letter confirming completion of probationary period',
    isMandatoryForEmployee: false,
    hasExpiry: false,
  },
  {
    code: 'probation_document',
    name: 'Probation Review Document',
    group: 'employment_hr',
    groupName: 'Employment & HR',
    description: 'Mid-probation and final review assessment scores and remarks',
    isMandatoryForEmployee: false,
    hasExpiry: false,
  },
  {
    code: 'promotion_letter',
    name: 'Promotion Letter',
    group: 'employment_hr',
    groupName: 'Employment & HR',
    description: 'Official letter announcing grade progression and title upgrade',
    isMandatoryForEmployee: false,
    hasExpiry: false,
  },
  {
    code: 'transfer_letter',
    name: 'Transfer & Relocation Letter',
    group: 'employment_hr',
    groupName: 'Employment & HR',
    description: 'Inter-branch, client location, or department transfer memo',
    isMandatoryForEmployee: false,
    hasExpiry: false,
  },
  {
    code: 'compensation_revision',
    name: 'Compensation Revision Letter',
    group: 'employment_hr',
    groupName: 'Employment & HR',
    description: 'Revised compensation structure annexure and CTC enhancement letter',
    isMandatoryForEmployee: false,
    hasExpiry: false,
  },
  {
    code: 'increment_letter',
    name: 'Annual Increment Letter',
    group: 'employment_hr',
    groupName: 'Employment & HR',
    description: 'Annual appraisal increment and reward letter',
    isMandatoryForEmployee: false,
    hasExpiry: false,
  },
  {
    code: 'warning_letter',
    name: 'HR Advisory / Warning Letter',
    group: 'employment_hr',
    groupName: 'Employment & HR',
    description: 'Formal disciplinary notice or policy compliance notification',
    isMandatoryForEmployee: false,
    hasExpiry: false,
  },
  {
    code: 'performance_review',
    name: 'Performance Review Document',
    group: 'employment_hr',
    groupName: 'Employment & HR',
    description: 'Bi-annual and annual appraisal scorecards and manager feedback',
    isMandatoryForEmployee: false,
    hasExpiry: false,
  },
  {
    code: 'resignation_letter',
    name: 'Resignation & Acceptance Document',
    group: 'employment_hr',
    groupName: 'Employment & HR',
    description: 'Voluntary resignation notice and management acceptance letter',
    isMandatoryForEmployee: false,
    hasExpiry: false,
  },
  {
    code: 'exit_clearance',
    name: 'Exit Clearance & Asset Handover',
    group: 'employment_hr',
    groupName: 'Employment & HR',
    description: 'Departmental sign-offs (IT, Admin, Finance, Library) before release',
    isMandatoryForEmployee: false,
    hasExpiry: false,
  },
  {
    code: 'fnf_settlement',
    name: 'Full & Final (F&F) Settlement Statement',
    group: 'employment_hr',
    groupName: 'Employment & HR',
    description: 'Final dues, gratuity calculation, leave encashment, and release statement',
    isMandatoryForEmployee: false,
    hasExpiry: false,
  },
  {
    code: 'service_certificate',
    name: 'Service & Conduct Certificate',
    group: 'employment_hr',
    groupName: 'Employment & HR',
    description: 'Certified statement of overall tenure, conduct, and designations held',
    isMandatoryForEmployee: false,
    hasExpiry: false,
  },

  // 3. Payroll and statutory
  {
    code: 'payslip',
    name: 'Official Payslip',
    group: 'payroll_statutory',
    groupName: 'Payroll & Statutory',
    description: 'Monthly payroll statement of earnings, statutory deductions, and net pay',
    isMandatoryForEmployee: false,
    hasExpiry: false,
  },
  {
    code: 'form_16',
    name: 'Form 16 (TDS Certificate)',
    group: 'payroll_statutory',
    groupName: 'Payroll & Statutory',
    description: 'Annual Indian Income Tax Section 203 TDS certificate (Part A & B)',
    isMandatoryForEmployee: false,
    hasExpiry: false,
  },
  {
    code: 'tax_declaration',
    name: 'Income Tax Declaration Form',
    group: 'payroll_statutory',
    groupName: 'Payroll & Statutory',
    description: 'Regime selection (Old vs New) and planned Chapter VI-A investment declaration',
    isMandatoryForEmployee: true,
    hasExpiry: true,
  },
  {
    code: 'pf_document',
    name: 'Provident Fund (PF) Form 11 / Transfer',
    group: 'payroll_statutory',
    groupName: 'Payroll & Statutory',
    description: 'EPFO Form 11 declaration and UAN member profile transfer document',
    isMandatoryForEmployee: false,
    hasExpiry: false,
  },
  {
    code: 'esi_document',
    name: 'ESI Documentation / Pehchan Card',
    group: 'payroll_statutory',
    groupName: 'Payroll & Statutory',
    description: 'Employees State Insurance registration card for eligible staff',
    isMandatoryForEmployee: false,
    hasExpiry: false,
  },
  {
    code: 'reimbursement_statement',
    name: 'Reimbursement Claim & Bills',
    group: 'payroll_statutory',
    groupName: 'Payroll & Statutory',
    description: 'Travel, medical, or communication expense claim supporting bills',
    isMandatoryForEmployee: false,
    hasExpiry: false,
  },
  {
    code: 'bonus_letter',
    name: 'Annual / Performance Bonus Letter',
    group: 'payroll_statutory',
    groupName: 'Payroll & Statutory',
    description: 'Notification of statutory or ex-gratia bonus calculation',
    isMandatoryForEmployee: false,
    hasExpiry: false,
  },
  {
    code: 'salary_certificate',
    name: 'Salary & Compensation Certificate',
    group: 'payroll_statutory',
    groupName: 'Payroll & Statutory',
    description: 'Official certificate for bank loan, visa, or financial verification',
    isMandatoryForEmployee: false,
    hasExpiry: false,
  },
  {
    code: 'investment_proof',
    name: 'Investment Proof Submission',
    group: 'payroll_statutory',
    groupName: 'Payroll & Statutory',
    description: 'Actual receipts for 80C (PPF/LIC), 80D (Health Insurance), HRA rent receipts',
    isMandatoryForEmployee: false,
    hasExpiry: true,
  },

  // 4. Company documents
  {
    code: 'employee_handbook',
    name: 'Employee Handbook',
    group: 'company_policy',
    groupName: 'Company Policies',
    description: 'Corporate overview, culture, working principles, and core operating guidelines',
    isMandatoryForEmployee: false,
    hasExpiry: false,
  },
  {
    code: 'hr_policy',
    name: 'Human Resources Policy Manual',
    group: 'company_policy',
    groupName: 'Company Policies',
    description: 'Leave guidelines, working hours, benefits, anti-harassment POSH rules',
    isMandatoryForEmployee: false,
    hasExpiry: false,
  },
  {
    code: 'code_of_conduct',
    name: 'Code of Business Conduct & Ethics',
    group: 'company_policy',
    groupName: 'Company Policies',
    description: 'Standards of ethical integrity, anti-bribery, and professional demeanor',
    isMandatoryForEmployee: false,
    hasExpiry: false,
  },
  {
    code: 'it_security_policy',
    name: 'IT & Information Security Policy (ISMS)',
    group: 'company_policy',
    groupName: 'Company Policies',
    description: 'Data classification, acceptable device usage, password and encryption standards',
    isMandatoryForEmployee: false,
    hasExpiry: false,
  },
  {
    code: 'holiday_policy',
    name: 'Official Holiday Calendar',
    group: 'company_policy',
    groupName: 'Company Policies',
    description: 'Annual mandatory and restricted/optional holidays list',
    isMandatoryForEmployee: false,
    hasExpiry: true,
  },
  {
    code: 'leave_policy',
    name: 'Leave & Attendance Policy',
    group: 'company_policy',
    groupName: 'Company Policies',
    description: 'Earned leave, sick leave, casual leave, and compensatory off regulations',
    isMandatoryForEmployee: false,
    hasExpiry: false,
  },
  {
    code: 'wfh_policy',
    name: 'Hybrid & Remote Work Policy',
    group: 'company_policy',
    groupName: 'Company Policies',
    description: 'Eligibility, core overlapping hours, ergonomic expectations, and security',
    isMandatoryForEmployee: false,
    hasExpiry: false,
  },
  {
    code: 'nda_confidentiality',
    name: 'Non-Disclosure & Confidentiality Agreement',
    group: 'company_policy',
    groupName: 'Company Policies',
    description: 'Proprietary IP protection, client confidentiality, and non-solicitation deed',
    isMandatoryForEmployee: true,
    hasExpiry: false,
  },
  {
    code: 'training_certificate',
    name: 'Training & Skill Certification',
    group: 'company_policy',
    groupName: 'Company Policies',
    description: 'Internal compliance training completion or external certifications',
    isMandatoryForEmployee: false,
    hasExpiry: false,
  },
]

export interface DocumentVersionItem {
  id: string
  documentId: string
  versionNumber: number
  fileUrl: string
  fileName?: string
  fileSize?: number
  mimeType?: string
  checksumSha256?: string
  changeSummary?: string
  uploadedBy?: string
  uploadedByName?: string
  createdAt: string
}

export interface EnterpriseDocumentItem {
  id: string
  companyId: string
  employeeId?: string | null
  employeeCode?: string
  employeeName?: string
  employeeEmail?: string
  departmentId?: string
  departmentName?: string
  designationName?: string

  title: string
  category: string
  categoryName?: string
  subcategory?: string
  documentType: string
  documentNumber: string
  referenceNumber?: string
  issuingAuthority?: string
  description?: string

  fileName: string
  fileUrl: string
  fileSize?: number
  mimeType?: string
  checksumSha256?: string

  version: number
  visibility: 'private' | 'employee' | 'department' | 'company' | 'company_wide'

  status: DocumentLifecycleStatus
  verificationStatus?: 'unverified' | 'verified' | 'rejected' | 'replacement_requested'
  verifiedBy?: string
  verifiedByName?: string
  verifiedAt?: string | null
  verificationNotes?: string | null
  rejectionReason?: string | null
  replacementRequestedAt?: string | null
  replacementReason?: string | null

  issueDate?: string
  effectiveDate?: string
  expiryDate?: string | null
  expiryStatus: DocumentExpiryStatus
  daysUntilExpiry?: number | null

  isArchived: boolean
  archivedAt?: string | null
  archivedBy?: string | null
  retentionPeriodMonths?: number

  requiresAcknowledgement?: boolean
  acknowledgedAt?: string | null
  acknowledgedBy?: string | null
  acknowledgedByName?: string | null

  uploadedBy?: string
  uploadedByName?: string
  createdAt: string
  updatedAt: string

  content?: any
  letterheadVersion?: number
  versions?: DocumentVersionItem[]
}

export function computeExpiryStatus(expiryDate?: string | null): {
  status: DocumentExpiryStatus
  daysRemaining: number | null
  label: string
} {
  if (!expiryDate) {
    return { status: 'NOT_APPLICABLE', daysRemaining: null, label: 'No Expiry' }
  }

  const raw = String(expiryDate).slice(0, 10)
  const exp = new Date(`${raw}T23:59:59`)
  if (Number.isNaN(exp.getTime())) {
    return { status: 'NOT_APPLICABLE', daysRemaining: null, label: 'No Expiry' }
  }

  const now = new Date()
  const diffMs = exp.getTime() - now.getTime()
  const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

  if (days < 0) {
    return { status: 'EXPIRED', daysRemaining: days, label: `Expired ${Math.abs(days)}d ago` }
  }
  if (days <= 30) {
    return { status: 'EXPIRING_SOON', daysRemaining: days, label: `Expiring in ${days}d` }
  }
  return { status: 'ACTIVE', daysRemaining: days, label: `Active (${days}d left)` }
}

export function formatFileSize(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`
}

export function getCategoryDefinition(code?: string): DocumentCategoryDefinition | undefined {
  if (!code) return undefined
  return DOCUMENT_CATEGORIES.find(c => c.code === code)
}

export function getCategoryLabel(code?: string): string {
  const def = getCategoryDefinition(code)
  if (def) return def.name
  if (!code) return 'General Document'
  return code
    .replace(/_/g, ' ')
    .replace(/\b\w/g, l => l.toUpperCase())
}

export function isFilePreviewable(mimeType?: string, fileName?: string): 'pdf' | 'image' | 'unsupported' {
  const mime = String(mimeType || '').toLowerCase()
  const ext = String(fileName || '').toLowerCase().split('.').pop() || ''

  if (mime.includes('pdf') || ext === 'pdf') return 'pdf'
  if (
    mime.includes('image') ||
    ['jpg', 'jpeg', 'png', 'webp', 'svg', 'gif'].includes(ext)
  ) {
    return 'image'
  }
  return 'unsupported'
}
