import { createClient } from '@supabase/supabase-js'
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const admin = createClient(supabaseUrl, supabaseServiceKey)

async function trace() {
  const { data: emp } = await admin.from('employees').select('id, employee_code, full_name, is_active, company_id').eq('employee_code', 'HRK-001').single()
  console.log('Employee:', JSON.stringify(emp, null, 2))

  const { data: structures } = await admin.from('salary_structures').select('id, employee_id, company_id, status, annual_ctc, monthly_gross, effective_from').eq('employee_id', emp.id)
  console.log('\nAll salary_structures:', JSON.stringify(structures, null, 2))

  const { data: activeStructure } = await admin.from('salary_structures').select('*').eq('employee_id', emp.id).eq('company_id', emp.company_id).eq('status', 'active').lte('effective_from', '2026-09-30').order('effective_from', { ascending: false }).limit(1).maybeSingle()
  console.log('\nActive structure (payroll query):', activeStructure ? JSON.stringify({ id: activeStructure.id, status: activeStructure.status, annual_ctc: activeStructure.annual_ctc, monthly_gross: activeStructure.monthly_gross, effective_from: activeStructure.effective_from }, null, 2) : 'NULL - NO ACTIVE STRUCTURE!')

  if (activeStructure) {
    const { data: allComps } = await admin.from('salary_structure_components').select('*, component:component_id(*)').eq('salary_structure_id', activeStructure.id)
    console.log('\nAll components (unfiltered):', JSON.stringify((allComps || []).map(c => ({ id: c.id, name: c.component?.name, code: c.component?.code, type: c.component?.type, monthly: c.monthly_amount, annual: c.annual_amount, is_active: c.is_active })), null, 2))

    const { data: activeComps } = await admin.from('salary_structure_components').select('*, component:component_id(*)').eq('salary_structure_id', activeStructure.id).eq('is_active', true)
    console.log('\nActive components (is_active=true):', JSON.stringify((activeComps || []).map(c => ({ name: c.component?.name, code: c.component?.code, type: c.component?.type, monthly: c.monthly_amount, is_active: c.is_active })), null, 2))
  }

  const { data: allDefs } = await admin.from('salary_components').select('id, code, name, type, is_statutory, is_active').eq('company_id', emp.company_id)
  console.log('\nSalary component definitions:', JSON.stringify(allDefs, null, 2))

  const { data: statutory } = await admin.from('employee_statutory_details').select('*').eq('employee_id', emp.id)
  console.log('\nStatutory details:', JSON.stringify(statutory, null, 2))
}
trace()
