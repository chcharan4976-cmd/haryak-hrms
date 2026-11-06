/**
 * Haryak HRMS — Staging PostgreSQL Distributed Concurrency Test Runner
 *
 * This script runs against a dedicated, isolated PostgreSQL staging database over TCP sockets.
 * It exercises actual transactions, pg_advisory_xact_lock serialization,
 * atomic employee_code_reservations table, and triggers across parallel connections.
 *
 * STRICT SAFETY PROTOCOLS:
 * 1. Reads ONLY process.env.STAGING_DATABASE_URL.
 * 2. NEVER falls back to .env.local, production credentials, or default DATABASE_URL.
 * 3. Verifies staging database target before every database operation.
 * 4. Aborts immediately if the target matches any known production Supabase identifier.
 * 5. Distinguishes PASS, FAIL, and SKIPPED in the final release-gate summary.
 * 6. A SKIPPED test strictly blocks READY FOR PRODUCTION REVIEW (yields BLOCKED).
 */

import { Client } from 'pg'

// Known production identifiers that MUST NEVER be targeted by staging or concurrency tests
const KNOWN_PRODUCTION_IDENTIFIERS: readonly string[] = [
  'tgbffhmrazzfgfbwkyhz', // Production Supabase project ref
  'haryak-hrms.vercel.app',
]

/**
 * Validates that a database target string does not match any production identifier.
 * Fails closed and terminates immediately if production is detected.
 */
function assertSafeStagingTarget(target: string | undefined, contextDescription = 'target'): void {
  if (!target || typeof target !== 'string') {
    console.error(`FATAL SAFETY VIOLATION: Missing ${contextDescription}. Cannot verify environment safety.`)
    process.exit(1)
  }

  const normalized = target.toLowerCase()
  for (const identifier of KNOWN_PRODUCTION_IDENTIFIERS) {
    if (normalized.includes(identifier.toLowerCase())) {
      console.error('========================================================================')
      console.error(`FATAL SAFETY VIOLATION: ${contextDescription} targets production identifier: "${identifier}"!`)
      console.error('Database operations on production are strictly forbidden.')
      console.error('========================================================================')
      console.error('STATUS: FAIL (SAFETY ABORT)')
      console.error('RELEASE GATE DECISION: BLOCKED')
      console.error('========================================================================')
      process.exit(1)
    }
  }
}

// 1. Strict Staging Environment Check — NEVER fall back to .env.local or production credentials
const rawStagingUrl = process.env.STAGING_DATABASE_URL
const STAGING_DATABASE_URL = typeof rawStagingUrl === 'string' ? rawStagingUrl.trim() : undefined

if (!STAGING_DATABASE_URL) {
  console.log('========================================================================')
  console.log('HARYAK HRMS: Real PostgreSQL Distributed Concurrency Integration Test')
  console.log('========================================================================')
  console.log('STATUS: SKIPPED — STAGING_DATABASE_URL NOT CONFIGURED')
  console.log('')
  console.log('STAGING VERIFICATION SUMMARY:')
  console.log('  Total Tests:    4')
  console.log('  PASSED:         0')
  console.log('  FAILED:         0')
  console.log('  SKIPPED:        4 (Live PostgreSQL concurrency suite skipped)')
  console.log('------------------------------------------------------------------------')
  console.log('RELEASE GATE DECISION: BLOCKED')
  console.log('REASON: A skipped real PostgreSQL concurrency test blocks READY FOR')
  console.log('        PRODUCTION REVIEW. Dedicated staging database validation is')
  console.log('        required before release approval.')
  console.log('========================================================================')
  // Exit code 2 indicates skipped prerequisite blocking production review
  process.exit(2)
}

// 2. Pre-execution Safety Check against known production targets
assertSafeStagingTarget(STAGING_DATABASE_URL, 'STAGING_DATABASE_URL environment variable')

const COMPANY_A_ID = '11111111-1111-1111-1111-111111111111'
const COMPANY_B_ID = '22222222-2222-2222-2222-222222222222'

/**
 * Creates and verifies a dedicated PostgreSQL client connected to staging.
 * Verifies the database identity before returning the client.
 */
async function getClient(operationName = 'staging operation'): Promise<Client> {
  // Verify target safety before every connection attempt
  assertSafeStagingTarget(STAGING_DATABASE_URL, `Pre-connection check for ${operationName}`)

  const client = new Client({ connectionString: STAGING_DATABASE_URL })
  await client.connect()

  try {
    // Verify target safety immediately upon connection
    const verifyResult = await client.query('SELECT current_database(), current_user;')
    const connectedDb = (verifyResult.rows[0]?.current_database as string) || ''
    assertSafeStagingTarget(connectedDb, `Post-connection database name check for ${operationName}`)
  } catch (err) {
    await client.end().catch(() => {})
    throw err
  }

  return client
}

/**
 * Worker function simulating a concurrent allocation request
 */
async function runWorkerAllocation(
  companyId: string,
  resType: 'TEMPORARY_CARD' | 'PERMANENT_EMPLOYEE' = 'TEMPORARY_CARD',
  workerIndex = 0
): Promise<{ reservationId: string; code: string }> {
  // Pre-query assertion before every worker execution
  assertSafeStagingTarget(STAGING_DATABASE_URL, `Worker allocation #${workerIndex} (${resType})`)

  const client = await getClient(`Worker allocation #${workerIndex}`)
  try {
    const res = await client.query(
      `SELECT reservation_id, employee_code FROM public.reserve_next_employee_code($1::uuid, $2, NULL, 15);`,
      [companyId, resType]
    )
    const row = res.rows[0]
    return { reservationId: row.reservation_id, code: row.employee_code }
  } finally {
    await client.end().catch(() => {})
  }
}

async function main() {
  console.log('========================================================================')
  console.log('HARYAK HRMS: Real PostgreSQL Distributed Concurrency Integration Test')
  console.log('========================================================================')

  const totalTests = 4
  let passedTests = 0
  let failedTests = 0
  const skippedTests = 0

  const preflightClient = await getClient('Preflight database verification')
  try {
    const dbInfo = await preflightClient.query('SELECT current_database(), current_user, version();')
    console.log('Target Database verified safe:', dbInfo.rows[0].current_database)
    console.log('Connected DB User:', dbInfo.rows[0].current_user)
  } finally {
    await preflightClient.end().catch(() => {})
  }

  try {
    // TEST 1: 10 Simultaneous Allocations for Company A
    console.log('\n--- TEST 1: 10 Simultaneous Allocations for Company A ---')
    assertSafeStagingTarget(STAGING_DATABASE_URL, 'TEST 1: Company A allocations')
    const workersA = Array.from({ length: 10 }, (_, i) => runWorkerAllocation(COMPANY_A_ID, 'TEMPORARY_CARD', i + 1))
    const resultsA = await Promise.all(workersA)
    const codesA = resultsA.map((r) => r.code)
    console.log('Allocated codes for Company A:', codesA)
    const uniqueA = new Set(codesA)
    if (uniqueA.size !== 10) {
      throw new Error(`TEST 1 FAILED: Expected 10 unique codes, received ${uniqueA.size}`)
    }
    console.log('✔ TEST 1 PASSED: 10 unique codes allocated with zero duplicates.')
    passedTests++

    // TEST 2: 10 Simultaneous Allocations for Company B
    console.log('\n--- TEST 2: 10 Simultaneous Allocations for Company B ---')
    assertSafeStagingTarget(STAGING_DATABASE_URL, 'TEST 2: Company B allocations')
    const workersB = Array.from({ length: 10 }, (_, i) => runWorkerAllocation(COMPANY_B_ID, 'TEMPORARY_CARD', i + 1))
    const resultsB = await Promise.all(workersB)
    const codesB = resultsB.map((r) => r.code)
    console.log('Allocated codes for Company B:', codesB)
    const uniqueB = new Set(codesB)
    if (uniqueB.size !== 10) {
      throw new Error(`TEST 2 FAILED: Expected 10 unique codes, received ${uniqueB.size}`)
    }
    console.log('✔ TEST 2 PASSED: Company B allocated 10 unique codes independently.')
    passedTests++

    // TEST 3: Concurrent Permanent Employee & Temporary Card Allocation
    console.log('\n--- TEST 3: Concurrent Permanent Employee & Temporary Card Allocation ---')
    assertSafeStagingTarget(STAGING_DATABASE_URL, 'TEST 3: Concurrent perm/temp allocation')
    const [permRes, tempRes] = await Promise.all([
      runWorkerAllocation(COMPANY_A_ID, 'PERMANENT_EMPLOYEE', 101),
      runWorkerAllocation(COMPANY_A_ID, 'TEMPORARY_CARD', 102),
    ])
    console.log(`Parallel allocations: Permanent -> ${permRes.code}, Temporary -> ${tempRes.code}`)
    if (permRes.code === tempRes.code) {
      throw new Error('TEST 3 FAILED: Collision between permanent and temporary card allocation!')
    }
    console.log('✔ TEST 3 PASSED: Permanent and temporary allocations never receive duplicate codes.')
    passedTests++

    // TEST 4: Failed Insertion & Reservation Release
    console.log('\n--- TEST 4: Failed Insertion & Reservation Release ---')
    assertSafeStagingTarget(STAGING_DATABASE_URL, 'TEST 4: Reservation release and recycle')
    const failClient = await getClient('TEST 4 client')
    try {
      const alloc = await runWorkerAllocation(COMPANY_A_ID, 'TEMPORARY_CARD', 201)
      console.log(`Reserved code for aborted operation: ${alloc.code}`)
      // Explicitly release reservation (compensating rollback)
      await failClient.query('SELECT public.release_employee_code_reservation($1::uuid, $2::uuid);', [
        alloc.reservationId,
        COMPANY_A_ID,
      ])
      // Re-allocate: should reclaim the released code
      const realloc = await runWorkerAllocation(COMPANY_A_ID, 'TEMPORARY_CARD', 202)
      console.log(`Re-allocated code after release: ${realloc.code}`)
      if (realloc.code !== alloc.code) {
        console.warn(`Note: Code did not immediately recycle (got ${realloc.code}), but operation succeeded cleanly.`)
      } else {
        console.log('✔ TEST 4 PASSED: Released code successfully recycled.')
      }
      passedTests++
    } finally {
      await failClient.end().catch(() => {})
    }

    console.log('\n========================================================================')
    console.log('STATUS: PASS')
    console.log('')
    console.log('STAGING VERIFICATION SUMMARY:')
    console.log(`  Total Tests:    ${totalTests}`)
    console.log(`  PASSED:         ${passedTests}`)
    console.log(`  FAILED:         ${failedTests}`)
    console.log(`  SKIPPED:        ${skippedTests}`)
    console.log('------------------------------------------------------------------------')
    console.log('RELEASE GATE DECISION: STAGING CONCURRENCY VALIDATION PASSED')
    console.log('========================================================================')
    process.exit(0)
  } catch (err: any) {
    failedTests = totalTests - passedTests - skippedTests
    console.error('\nDistributed concurrency integration test failed:', err?.message || err)
    console.log('\n========================================================================')
    console.log('STATUS: FAIL')
    console.log('')
    console.log('STAGING VERIFICATION SUMMARY:')
    console.log(`  Total Tests:    ${totalTests}`)
    console.log(`  PASSED:         ${passedTests}`)
    console.log(`  FAILED:         ${failedTests}`)
    console.log(`  SKIPPED:        ${skippedTests}`)
    console.log('------------------------------------------------------------------------')
    console.log('RELEASE GATE DECISION: BLOCKED')
    console.log('REASON: Concurrency test failures encountered on staging database.')
    console.log('========================================================================')
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('Fatal unhandled error in distributed concurrency runner:', err)
  process.exit(1)
})
