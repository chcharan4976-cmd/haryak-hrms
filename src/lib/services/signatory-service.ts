/**
 * Haryak Technologies India Private Limited
 * Company Signatories Service
 *
 * Configurable authorized signatories for official company letters and documents.
 * Stored securely in company_settings (category: company_signatories).
 */

import { createAdminClient } from '@/lib/supabase/admin'
import type { CompanySignatoryDTO } from '@/lib/types/employee-dto'

const SETTING_KEY_SIGNATORIES = 'company_authorized_signatories'

export async function getCompanySignatories(companyId: string): Promise<CompanySignatoryDTO[]> {
  const supabase = createAdminClient()
  if (!supabase) return []

  const { data } = await supabase
    .from('company_settings')
    .select('setting_value')
    .eq('company_id', companyId)
    .eq('setting_key', SETTING_KEY_SIGNATORIES)
    .maybeSingle()

  if (data?.setting_value && Array.isArray(data.setting_value)) {
    return data.setting_value
  }

  // If not configured yet, seed standard default signatory
  const defaultSignatory: CompanySignatoryDTO = {
    id: 'sig_default_hr',
    companyId,
    name: 'Authorized Signatory',
    designation: 'Head of Human Resources',
    signatureAssetPath: null,
    validFrom: '2026-01-01',
    validTo: null,
    documentTypes: ['offer_letter', 'appointment_letter', 'joining_letter', 'salary_revision', 'relieving_letter', 'experience_letter'],
    isDefault: true,
    isActive: true,
  }

  await supabase.from('company_settings').upsert({
    company_id: companyId,
    category: 'company_signatories',
    setting_key: SETTING_KEY_SIGNATORIES,
    setting_value: [defaultSignatory],
  }, { onConflict: 'company_id,setting_key' })

  return [defaultSignatory]
}

export async function saveCompanySignatories(companyId: string, signatories: CompanySignatoryDTO[]): Promise<void> {
  const supabase = createAdminClient()
  if (!supabase) throw new Error('Database unavailable')

  await supabase.from('company_settings').upsert({
    company_id: companyId,
    category: 'company_signatories',
    setting_key: SETTING_KEY_SIGNATORIES,
    setting_value: signatories,
  }, { onConflict: 'company_id,setting_key' })
}
