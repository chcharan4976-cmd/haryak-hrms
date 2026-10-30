/**
 * Haryak HRMS — Safe Compensation Linkage Audit Script (Read-Only)
 * 
 * Inspects all active employees, their salary structures, components, and completeness.
 * Strictly READ-ONLY. No mutations.
 * 
 * Usage:
 *   node --env-file=.env.local scripts/audit-compensation-linkage.mjs
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('ERROR: Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

async function audit() {
  console.log('======================================================================')
  console.log('  HARYAK HRMS — COMPENSATION LINKAGE AUDIT (READ-ONLY)')
  console.log('======================================================================')

  const { data: employees, error: empErr } = await supabase
    .from('employees')
    .select('id, employee_code, full_name, official_email, company_id, employment_status, is_active')
    .eq('is_active', true)
    .order('employee_code', { ascending: true })

  if (empErr || !employees) {
    console.error('Failed to fetch employees:', empErr)
    process.exit(1)
  }

  console.log(`Found ${employees.length} active employees.\n`)

  const results = []

  for (const emp of employees) {
    // Fetch active salary structure
    const { data: structures, error: structErr } = await supabase
      .from('salary_structures')
      .select('*')
      .eq('employee_id', emp.id)
      .order('effective_from', { ascending: false })

    const activeStructure = (structures || []).find(s => s.status === 'active') || null

    let componentCount = 0
    let componentEarningSum = 0
    let componentDeductionSum = 0
    const componentList = []

    if (activeStructure) {
      const { data: components, error: compErr } = await supabase
        .from('salary_structure_components')
        .select('*, component:component_id(*)')
        .eq('salary_structure_id', activeStructure.id)
        .eq('is_active', true)

      if (components) {
        componentCount = components.length
        for (const c of components) {
          const mAmount = Number(c.monthly_amount || 0)
          if (c.component?.type === 'earning') {
            componentEarningSum += mAmount
          } else if (c.component?.type === 'deduction') {
            componentDeductionSum += mAmount
          }
          componentList.push({
            name: c.component?.name || 'Unknown',
            code: c.component?.code || 'UNKNOWN',
            type: c.component?.type || 'unknown',
            monthlyAmount: mAmount,
            annualAmount: Number(c.annual_amount || 0),
          })
        }
      }
    }

    const monthlyGross = activeStructure ? Number(activeStructure.monthly_gross || 0) : 0
    const annualCtc = activeStructure ? Number(activeStructure.annual_ctc || 0) : 0

    // Completeness evaluation
    let isComplete = false
    let incompleteReason = ''

    if (!activeStructure) {
      incompleteReason = 'NO_STRUCTURE: No active salary structure found.'
    } else if (activeStructure.status === 'review_required') {
      incompleteReason = 'DATA_REVIEW_REQUIRED: Salary structure flagged for scaling anomaly review.'
    } else if (componentCount === 0) {
      incompleteReason = 'INCOMPLETE: Structure exists but salary_structure_components has 0 rows.'
    } else if (Math.abs(componentEarningSum - monthlyGross) > 1.0) {
      incompleteReason = `MISMATCH: Earning components sum (₹${componentEarningSum.toLocaleString('en-IN')}) != Monthly Gross (₹${monthlyGross.toLocaleString('en-IN')}).`
    } else {
      isComplete = true
      incompleteReason = 'COMPLETE: Structure and components reconciled.'
    }

    results.push({
      employeeCode: emp.employee_code,
      name: emp.full_name,
      structureExists: !!activeStructure,
      structureId: activeStructure?.id || null,
      structureStatus: activeStructure?.status || 'NONE',
      monthlyGross,
      annualCtc,
      componentCount,
      componentEarningSum,
      componentDeductionSum,
      isComplete,
      incompleteReason,
      components: componentList,
    })
  }

  // Print summary table
  console.log(
    'Employee Code | Employee Name                   | Monthly Gross | Annual CTC    | Comps | Comp Sum      | Complete? | Status / Reason'
  )
  console.log('-'.repeat(125))

  for (const r of results) {
    const code = r.employeeCode.padEnd(13)
    const name = r.name.padEnd(31).slice(0, 31)
    const gross = ('₹' + r.monthlyGross.toLocaleString('en-IN')).padStart(13)
    const ctc = ('₹' + r.annualCtc.toLocaleString('en-IN')).padStart(13)
    const count = String(r.componentCount).padStart(5)
    const sum = ('₹' + r.componentEarningSum.toLocaleString('en-IN')).padStart(13)
    const complete = (r.isComplete ? 'YES' : 'NO').padEnd(9)
    const reason = r.incompleteReason

    console.log(`${code} | ${name} | ${gross} | ${ctc} | ${count} | ${sum} | ${complete} | ${reason}`)
  }

  console.log('-'.repeat(125))
  console.log(`\nTotal Audited: ${results.length}`)
  console.log(`Complete: ${results.filter(r => r.isComplete).length}`)
  console.log(`Incomplete: ${results.filter(r => !r.isComplete).length}`)
}

audit().catch(err => {
  console.error('Audit failed:', err)
  process.exit(1)
})
