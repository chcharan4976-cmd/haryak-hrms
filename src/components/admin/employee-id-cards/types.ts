export interface IDCardData {
  employeeName: string
  employeeCode: string
  designation?: string
  department?: string
  phone?: string
  email?: string
  location?: string
  photoUrl?: string | null
  companyName?: string
  companyTagline?: string
  companyWebsite?: string
}

export type IDCardDesignType = 'CORPORATE_ELITE' | 'MODERN_EXECUTIVE'
