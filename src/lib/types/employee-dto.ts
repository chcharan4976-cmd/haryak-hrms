/**
 * Haryak HRMS — Canonical Employee Application DTOs
 *
 * Strict single-source-of-truth application DTO contract.
 * Uses camelCase naming conventions mapped once at the service layer.
 */

export interface EmployeeProfileDTO {
  employeeId: string
  employeeCode: string
  fullName: string
  firstName: string
  lastName: string
  officialEmail: string
  personalEmail: string | null
  phone: string | null
  gender: string | null
  dateOfBirth: string | null
  department: string | null
  departmentId: string | null
  designation: string | null
  designationId: string | null
  joiningDate: string | null
  employmentType: string | null
  employmentStatus: string
  workLocation: string | null
  locationId: string | null
  reportingManager: string | null
  reportingManagerId: string | null
  reportingManagerCode: string | null
  profileImageUrl: string | null
  bankStatus: 'CONFIGURED' | 'NOT_CONFIGURED'
  statutoryStatus: 'CONFIGURED' | 'PARTIAL' | 'NOT_CONFIGURED'
  bankAccounts: {
    id: string
    bankName: string | null
    accountNumberMasked: string | null
    ifscCode: string | null
    branchName?: string | null
    isPrimary: boolean
  }[]
  statutoryDetails: {
    panMasked: string | null
    uanNumber: string | null
    pfNumber: string | null
    esiNumber: string | null
    pfApplicable: boolean
    esiApplicable: boolean
    ptApplicable: boolean
    ptState: string | null
    taxRegime: string | null
  } | null
  // Internal provenance details for development/admin diagnostics only
  provenance?: Record<string, {
    table: string
    column: string
    value: any
    updatedAt?: string
  }>
}

export interface DirectoryEmployeeCard {
  employeeId: string
  employeeCode: string
  fullName: string
  officialEmail: string
  department: string
  designation: string
  workLocation?: string | null
  avatarUrl?: string | null
  isSelf?: boolean
}

export interface CompanySignatoryDTO {
  id: string
  companyId: string
  name: string
  designation: string
  signatureAssetPath?: string | null
  validFrom: string
  validTo?: string | null
  documentTypes: string[]
  isDefault: boolean
  isActive: boolean
}
