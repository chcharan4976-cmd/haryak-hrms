import { createClient } from '@supabase/supabase-js'
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// Check HRK-002 and HRK-003 too
async function checkAll() {
  const { data: emps } = await admin.from('employees').select('id, employee_code, full_name, company_id').in('employee_code', ['HRK-001', 'HRK-002', 'HRK-003'])
  for (const emp of emps || []) {
    const { data: structures } = await admin.from('salary_structures').select('id, status, annual_ctc, monthly_gross, effective_from').eq('employee_id', emp.id)
    const structureIds = (structures || []).map(s => s.id)
    let totalComps = 0
    for (const sid of structureIds) {
      const { data: comps } = await admin.from('salary_structure_components').select('id').eq('salary_structure_id', sid)
      totalComps += (comps || []).length
    }
    console.log(${emp.employee_code} ():  structures,  total components)
    for (const s of structures || []) {
      console.log(  Structure : status=, CTC=, monthly=, from=)
    }
  }
}
checkAll()
