/**
 * Haryak Technologies India Private Limited
 * Canonical Employee Directory Service
 *
 * Single shared directory lookup service across:
 * - Organization Chat
 * - AI Employee Lookup
 * - Global Directory
 * - Document Employee Picker
 * - Manager Team Picker
 *
 * SECURITY INVARIANT:
 * Strictly safe field projection. NEVER queries or leaks salary, CTC,
 * bank details, PAN, UAN, or personal home addresses.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import type { DirectoryEmployeeCard } from '@/lib/types/employee-dto'

export interface DirectorySearchOptions {
  query?: string
  departmentId?: string
  excludeEmployeeId?: string
  currentEmployeeId?: string
  limit?: number
  includeInactive?: boolean
}

export async function searchCompanyDirectory(
  companyId: string,
  options: DirectorySearchOptions = {}
): Promise<DirectoryEmployeeCard[]> {
  const supabase = createAdminClient()
  if (!supabase) return []

  const cleanQuery = (options.query || '').trim().toLowerCase()
  const limit = options.limit || 100

  let query = supabase
    .from('employees')
    .select(`
      id,
      employee_code,
      full_name,
      first_name,
      last_name,
      official_email,
      departments:department_id(id, name),
      designations:designation_id(id, name),
      locations:location_id(id, name),
      is_active,
      employment_status
    `)
    .eq('company_id', companyId)

  // Enforce active status by default
  if (!options.includeInactive) {
    query = query
      .eq('is_active', true)
      .eq('employment_status', 'active')
  }

  if (options.departmentId) {
    query = query.eq('department_id', options.departmentId)
  }

  query = query.order('employee_code', { ascending: true }).limit(limit)

  const { data: employees, error } = await query

  if (error) {
    console.error('[EmployeeDirectoryService] Error fetching employees:', error.message)
    return []
  }

  if (!employees) return []

  let filtered = employees

  // Filter in memory for multi-field search (code, name, email)
  if (cleanQuery) {
    filtered = employees.filter((emp: any) => {
      const codeMatch = (emp.employee_code || '').toLowerCase().includes(cleanQuery)
      const nameMatch = (emp.full_name || `${emp.first_name || ''} ${emp.last_name || ''}`).toLowerCase().includes(cleanQuery)
      const emailMatch = (emp.official_email || '').toLowerCase().includes(cleanQuery)
      return codeMatch || nameMatch || emailMatch
    })
  }

  // Self-exclusion if requested
  if (options.excludeEmployeeId) {
    filtered = filtered.filter((emp: any) => emp.id !== options.excludeEmployeeId)
  }

  return filtered.map((emp: any) => {
    const departmentName = emp.departments?.name || 'Unassigned'
    const designationName = emp.designations?.name || 'Unassigned'
    const locationName = emp.locations?.name || null
    const fullName = emp.full_name || `${emp.first_name || ''} ${emp.last_name || ''}`.trim()
    const isSelf = Boolean(options.currentEmployeeId && emp.id === options.currentEmployeeId)

    return {
      employeeId: emp.id,
      employeeCode: emp.employee_code,
      fullName,
      officialEmail: emp.official_email,
      department: departmentName,
      designation: designationName,
      workLocation: locationName,
      avatarUrl: null,
      isSelf,
    }
  })
}
