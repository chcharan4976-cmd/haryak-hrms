/**
 * Haryak HRMS — Data Consistency Reconciliation Script
 * 
 * Safe, idempotent reconciliation for live database state:
 * 1. Safe 1:1 user-employee linkage reconciliation (users.employee_id <-> employees.user_id)
 * 2. HRK-003 corrupted salary handling (flags scaling corruption as DATA_REVIEW_REQUIRED without guessing)
 * 3. HRK-003 corrupted payslip supersession (marks SUPERSEDED with PAYROLL_CALCULATION_ERROR audit)
 * 4. Revocation of legacy invalid draft documents
 * 
 * Usage:
 *   node --env-file=.env.local scripts/reconcile-data-consistency.mjs           (Dry-Run Mode)
 *   node --env-file=.env.local scripts/reconcile-data-consistency.mjs --apply   (Apply Changes)
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('ERROR: Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.')
  process.exit(1)
}

const isApply = process.argv.includes('--apply')

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

async function reconcile() {
  console.log('======================================================================')
  console.log(`  HARYAK HRMS DATA RECONCILIATION [MODE: ${isApply ? 'APPLY (LIVE WRITES)' : 'DRY-RUN (READ-ONLY)'}]`)
  console.log('======================================================================')
  console.log(`Target URL: ${SUPABASE_URL}\n`)

  const summary = {
    linkagesChecked: 0,
    linkagesNeeded: 0,
    linkagesApplied: 0,
    salariesChecked: 0,
    salariesFlagged: 0,
    payslipsChecked: 0,
    payslipsSuperseded: 0,
    docsChecked: 0,
    docsRevoked: 0,
  }

  // -------------------------------------------------------------------
  // 1. RECONCILE USER-EMPLOYEE TWO-WAY LINKAGES
  // -------------------------------------------------------------------
  console.log('[STEP 1] Inspecting User <-> Employee Two-Way Linkages...')
  const { data: employees, error: empErr } = await supabase
    .from('employees')
    .select('id, user_id, company_id, employee_code, full_name, official_email')

  const { data: users, error: userErr } = await supabase
    .from('users')
    .select('id, email, full_name, company_id, employee_id')

  if (empErr || userErr) {
    console.error('Failed to fetch employees or users:', empErr || userErr)
    return
  }

  for (const emp of employees || []) {
    summary.linkagesChecked++
    const email = emp.official_email?.toLowerCase().trim()
    if (!email) continue

    const matchingUser = users?.find(u => 
      u.company_id === emp.company_id && u.email?.toLowerCase().trim() === email
    )

    if (matchingUser) {
      const needsUserUpdate = matchingUser.employee_id !== emp.id
      const needsEmpUpdate = emp.user_id !== matchingUser.id

      if (needsUserUpdate || needsEmpUpdate) {
        summary.linkagesNeeded++
        console.log(`  -> Linkage Discrepancy Found:`)
        console.log(`     Employee: ${emp.employee_code} (${emp.full_name}) [ID: ${emp.id}]`)
        console.log(`     User:     ${matchingUser.email} [ID: ${matchingUser.id}]`)
        console.log(`     Current:  users.employee_id=${matchingUser.employee_id || 'NULL'}, employees.user_id=${emp.user_id || 'NULL'}`)

        if (isApply) {
          if (needsUserUpdate) {
            const { error: uErr } = await supabase
              .from('users')
              .update({ employee_id: emp.id })
              .eq('id', matchingUser.id)
            if (uErr) console.error(`     FAILED to update user ${matchingUser.id}:`, uErr.message)
            else console.log(`     ✓ Updated users.employee_id = ${emp.id}`)
          }
          if (needsEmpUpdate) {
            const { error: eErr } = await supabase
              .from('employees')
              .update({ user_id: matchingUser.id })
              .eq('id', emp.id)
            if (eErr) console.error(`     FAILED to update employee ${emp.id}:`, eErr.message)
            else console.log(`     ✓ Updated employees.user_id = ${matchingUser.id}`)
          }
          summary.linkagesApplied++
        } else {
          console.log(`     [DRY-RUN] Would synchronize users.employee_id = ${emp.id} and employees.user_id = ${matchingUser.id}`)
        }
      } else {
        console.log(`  ✓ Linked: ${emp.employee_code} (${emp.full_name}) <-> ${matchingUser.email}`)
      }
    }
  }

  // -------------------------------------------------------------------
  // 2. HRK-003 SALARY SCALING CORRUPTION CHECK
  // -------------------------------------------------------------------
  console.log('\n[STEP 2] Inspecting Compensation & Salary Structures...')
  const { data: structures, error: structErr } = await supabase
    .from('salary_structures')
    .select(`
      id, employee_id, annual_ctc, monthly_gross, status, notes,
      employees:employee_id(id, employee_code, full_name)
    `)

  if (structErr) {
    console.error('Failed to query salary_structures:', structErr)
  } else {
    for (const st of structures || []) {
      summary.salariesChecked++
      const empCode = (st.employees)?.employee_code || 'UNKNOWN'
      const empName = (st.employees)?.full_name || 'UNKNOWN'
      const ctc = Number(st.annual_ctc || 0)
      const gross = Number(st.monthly_gross || 0)

      // Detect 100x scaling anomaly: monthly gross exceeds annual CTC, or gross > 1,000,000 for regular employees
      const isCorrupted = gross > ctc || (ctc > 10000000 && gross > 1000000)

      if (isCorrupted) {
        summary.salariesFlagged++
        console.log(`  -> Scaling Anomaly Detected:`)
        console.log(`     Employee: ${empCode} (${empName})`)
        console.log(`     Current Structure: CTC = ₹${ctc.toLocaleString('en-IN')}, Monthly Gross = ₹${gross.toLocaleString('en-IN')}`)
        console.log(`     Rule: Per instructions, DO NOT guess ₹6,00,000. Mark status 'review_required' with DATA_REVIEW_REQUIRED note.`)

        if (isApply) {
          const { error: updErr } = await supabase
            .from('salary_structures')
            .update({
              status: 'review_required',
              notes: 'DATA_REVIEW_REQUIRED: Scaling anomaly detected (monthly gross > CTC). Requires HR confirmation before payroll.',
            })
            .eq('id', st.id)

          if (updErr) console.error(`     FAILED to flag salary structure ${st.id}:`, updErr.message)
          else console.log(`     ✓ Flagged salary structure ${st.id} as status='review_required', DATA_REVIEW_REQUIRED`)
        } else {
          console.log(`     [DRY-RUN] Would update salary structure ${st.id} status='review_required', notes='DATA_REVIEW_REQUIRED'`)
        }
      } else {
        console.log(`  ✓ Valid Structure: ${empCode} (${empName}) — CTC ₹${ctc.toLocaleString('en-IN')}, Gross ₹${gross.toLocaleString('en-IN')} [${st.status}]`)
      }
    }
  }

  // -------------------------------------------------------------------
  // 3. HRK-003 CORRUPTED PAYSLIP SUPERSESSION
  // -------------------------------------------------------------------
  console.log('\n[STEP 3] Inspecting Payslips for Corrupted 100x Scaling...')
  const { data: payslips, error: psErr } = await supabase
    .from('payslips')
    .select(`
      id, employee_id, net_salary, period_month, period_year, status, snapshot_data,
      employees:employee_id(employee_code, full_name)
    `)

  if (psErr) {
    console.error('Failed to query payslips:', psErr)
  } else {
    for (const ps of payslips || []) {
      summary.payslipsChecked++
      const empCode = (ps.employees)?.employee_code || 'UNKNOWN'
      const net = Number(ps.net_salary || 0)
      const isCorrupted = net > 1000000 || ps.snapshot_data?.grossEarnings > 1000000

      if (isCorrupted && ps.status !== 'superseded' && ps.status !== 'void') {
        summary.payslipsSuperseded++
        console.log(`  -> Corrupted Payslip Found:`)
        console.log(`     Payslip ID: ${ps.id} (${empCode}, Period: ${ps.period_month}/${ps.period_year})`)
        console.log(`     Corrupted Net: ₹${net.toLocaleString('en-IN')}`)
        console.log(`     Rule: Must mark SUPERSEDED with reason PAYROLL_CALCULATION_ERROR (do not silently delete).`)

        if (isApply) {
          const updatedSnapshot = {
            ...(ps.snapshot_data || {}),
            supersededReason: 'PAYROLL_CALCULATION_ERROR',
            supersededAt: new Date().toISOString(),
            supersededNote: 'Superseded due to 100x scaling error in salary structure.',
          }

          const { error: supErr } = await supabase
            .from('payslips')
            .update({
              status: 'superseded',
              snapshot_data: updatedSnapshot,
            })
            .eq('id', ps.id)

          if (supErr) console.error(`     FAILED to supersede payslip ${ps.id}:`, supErr.message)
          else console.log(`     ✓ Payslip ${ps.id} marked as status='superseded' with PAYROLL_CALCULATION_ERROR audit.`)
        } else {
          console.log(`     [DRY-RUN] Would mark payslip ${ps.id} status='superseded' with PAYROLL_CALCULATION_ERROR`)
        }
      } else {
        console.log(`  ✓ Payslip ${ps.id} (${empCode}): Net ₹${net.toLocaleString('en-IN')} [Status: ${ps.status}]`)
      }
    }
  }

  // -------------------------------------------------------------------
  // 4. LEGACY INVALID DRAFT DOCUMENT REVOCATION
  // -------------------------------------------------------------------
  console.log('\n[STEP 4] Inspecting Legacy Draft Documents...')
  const { data: legacyDocs, error: docErr } = await supabase
    .from('documents')
    .select('id, employee_id, document_type, title, description')
    .ilike('description', '%draft%')

  if (docErr) {
    console.error('Failed to query documents:', docErr)
  } else if (legacyDocs) {
    for (const doc of legacyDocs) {
      summary.docsChecked++
      console.log(`  -> Legacy Draft Document Found: ${doc.id} ("${doc.title}")`)
      if (isApply) {
        const { error: dUpdErr } = await supabase
          .from('documents')
          .update({ description: 'REVOKED: Legacy draft revoked during data consistency rebuild' })
          .eq('id', doc.id)
        if (dUpdErr) console.error(`     FAILED to update document ${doc.id}:`, dUpdErr.message)
        else console.log(`     ✓ Document ${doc.id} marked REVOKED in description`)
        summary.docsRevoked++
      } else {
        console.log(`     [DRY-RUN] Would mark document ${doc.id} as REVOKED`)
      }
    }
  }

  // -------------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------------
  console.log('\n======================================================================')
  console.log('  RECONCILIATION SUMMARY')
  console.log('======================================================================')
  console.log(`  Linkages Checked:     ${summary.linkagesChecked}`)
  console.log(`  Linkages Needed:      ${summary.linkagesNeeded}`)
  console.log(`  Linkages Applied:     ${summary.linkagesApplied}`)
  console.log(`  Salaries Checked:     ${summary.salariesChecked}`)
  console.log(`  Salaries Flagged:     ${summary.salariesFlagged}`)
  console.log(`  Payslips Checked:     ${summary.payslipsChecked}`)
  console.log(`  Payslips Superseded:  ${summary.payslipsSuperseded}`)
  console.log(`  Mode:                 ${isApply ? 'APPLIED TO LIVE DB' : 'DRY RUN ONLY (Pass --apply to execute)'}`)
  console.log('======================================================================\n')
}

reconcile().catch(err => {
  console.error('FATAL Reconciliation Error:', err)
  process.exit(1)
})
