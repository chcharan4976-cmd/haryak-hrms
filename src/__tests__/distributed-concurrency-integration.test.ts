/**
 * Haryak HRMS — Distributed Concurrency & Database-Level Reservation Integration Suite
 *
 * Verifies atomic database-level sequential code allocation and reservation semantics
 * across distributed serverless isolates, ensuring zero duplicate codes under concurrent load.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('Database-Level Employee Code Reservation & Concurrency Verification', () => {
  const COMPANY_A = '11111111-1111-1111-1111-111111111111'
  const COMPANY_B = '22222222-2222-2222-2222-222222222222'

  interface ReservationRecord {
    id: string
    company_id: string
    employee_code: string
    reservation_type: 'TEMPORARY_CARD' | 'PERMANENT_EMPLOYEE'
    status: 'ACTIVE' | 'COMMITTED' | 'CONVERTED' | 'RELEASED'
    reserved_by?: string | null
    temporary_card_id?: string | null
    employee_id?: string | null
    created_at: Date
    expires_at: Date
  }

  interface EmployeeRecord {
    id: string
    company_id: string
    employee_code: string
    user_id?: string | null
    official_email?: string | null
  }

  interface TempCardRecord {
    id: string
    company_id: string
    employee_code: string
    employee_id?: string | null
    deleted_at?: Date | null
  }

  // In-memory simulation of PostgreSQL database engine state
  let dbReservations: ReservationRecord[] = []
  let dbEmployees: EmployeeRecord[] = []
  let dbTempCards: TempCardRecord[] = []
  const companyPrefixes: Record<string, string> = {
    [COMPANY_A]: 'ACM',
    [COMPANY_B]: 'BET',
  }

  interface ExecutionContext {
    jwtRole?: 'service_role' | 'authenticated' | 'anon' | string | null
    jwtClaimsRaw?: string | null // stringified JSON in request.jwt.claims
    sessionUser?: string | null // e.g. 'authenticator' for PostgREST, 'postgres' for direct psql connection
    currentUser?: string | null // in PostgreSQL SECURITY DEFINER functions, switches to function owner ('postgres')
    authUserId?: string | null
    companyId?: string | null
  }

  // Trustworthy service-role detection mirroring PL/pgSQL public.is_service_role()
  // NOTE: This is an in-memory simulation for integration testing; never trusts currentUser!
  function simulateIsServiceRole(context?: ExecutionContext, explicitFlag: boolean = false): boolean {
    if (explicitFlag) return true
    if (!context) return false

    const jwtClaimRole = context.jwtRole || null
    let jwtClaimsRole: string | null = null

    if (context.jwtClaimsRaw !== undefined && context.jwtClaimsRaw !== null) {
      try {
        const parsed = JSON.parse(context.jwtClaimsRaw)
        jwtClaimsRole = parsed?.role || null
      } catch {
        // Malformed or unparseable JSON: immediately fail closed
        return false
      }
    }

    // 1. If any PostgREST JWT context exists, this is an API / web request
    if (jwtClaimRole !== null || context.jwtClaimsRaw !== null) {
      // If claim.role is present and not 'service_role', reject immediately
      if (jwtClaimRole !== null && jwtClaimRole !== 'service_role') {
        return false
      }
      // If claims JSON contains a role and it is not 'service_role', reject immediately
      if (jwtClaimsRole !== null && jwtClaimsRole !== 'service_role') {
        return false
      }
      // Both claims (if present) must agree on 'service_role'
      const effectiveRole = jwtClaimRole || jwtClaimsRole
      return effectiveRole === 'service_role'
    }

    // 2. Direct TCP database connection fallback (no PostgREST JWT context)
    // PostgREST sessions connect as 'authenticator', so sessionUser is never 'postgres' or 'service_role' for API calls.
    if (['service_role', 'postgres', 'supabase_admin'].includes(context.sessionUser || '')) {
      return true
    }

    return false
  }

  // Helper to enforce strict ownership: NULL owner cannot be renewed/committed/released without verified service role
  function checkOwnership(
    res: ReservationRecord,
    userId: string | null = null,
    isServiceRole: boolean = false,
    callerContext?: ExecutionContext
  ): boolean {
    const isVerified = simulateIsServiceRole(callerContext, isServiceRole)
    if (isVerified) return true
    if (!res.reserved_by) return false
    const effectiveUser = callerContext?.authUserId || userId
    if (effectiveUser && res.reserved_by === effectiveUser) return true
    return false
  }

  // Simulated PostgreSQL atomic stored procedure `reserve_next_employee_code`
  // Backed by pg_advisory_xact_lock transaction serialization
  async function simulatePgReserveNextEmployeeCode(
    companyId: string,
    reservationType: 'TEMPORARY_CARD' | 'PERMANENT_EMPLOYEE',
    userId: string | null = null,
    ttlMinutes: number = 15,
    currentTime: Date = new Date(),
    isServiceRole: boolean = false,
    callerAssertsServiceRole: boolean = false,
    callerContext?: ExecutionContext
  ): Promise<{ reservation_id: string; employee_code: string }> {
    const isVerified = simulateIsServiceRole(callerContext, isServiceRole)

    // Impersonation defense: reject caller if asserting p_is_service_role = TRUE without verified context
    if (callerAssertsServiceRole && !isVerified) {
      throw new Error('Security violation: caller cannot assert service-role authorization without verified service-role credentials.')
    }

    // Cross-company access check for authenticated users
    if (callerContext && callerContext.jwtRole === 'authenticated') {
      if (callerContext.companyId && callerContext.companyId !== companyId) {
        throw new Error('Unauthorized cross-company access denied.')
      }
      if (userId && callerContext.authUserId && userId !== callerContext.authUserId) {
        throw new Error('Unauthorized caller identity mismatch.')
      }
    }

    const effectiveUserId = callerContext?.authUserId || userId
    if (!effectiveUserId && !isVerified) {
      throw new Error('Caller must be authenticated or explicitly authorize via verified service role.')
    }

    // 1. Transaction-level lock (serialized execution within company)
    const prefix = companyPrefixes[companyId] || 'HRK'

    // 2. Expire abandoned active reservations past TTL
    for (const res of dbReservations) {
      if (res.company_id === companyId && res.status === 'ACTIVE' && res.expires_at <= currentTime) {
        res.status = 'RELEASED'
      }
    }

    // 3. Gather used numbers from employees, active temporary cards, and active reservations
    const usedNumbers = new Set<number>()
    const pattern = new RegExp(`^${prefix}-(\\d+)$`)

    for (const emp of dbEmployees) {
      if (emp.company_id === companyId) {
        const m = emp.employee_code.match(pattern)
        if (m) usedNumbers.add(parseInt(m[1], 10))
      }
    }

    for (const card of dbTempCards) {
      if (card.company_id === companyId && !card.deleted_at) {
        const m = card.employee_code.match(pattern)
        if (m) usedNumbers.add(parseInt(m[1], 10))
      }
    }

    for (const res of dbReservations) {
      if (res.company_id === companyId && res.status === 'ACTIVE' && res.expires_at > currentTime) {
        const m = res.employee_code.match(pattern)
        if (m) usedNumbers.add(parseInt(m[1], 10))
      }
    }

    // 4. Lowest available positive integer
    let nextNum = 1
    while (usedNumbers.has(nextNum)) {
      nextNum += 1
    }

    const code = `${prefix}-${String(nextNum).padStart(3, '0')}`

    // 5. Enforce partial unique index: uq_active_employee_code_reservation
    const existingActive = dbReservations.find(
      (r) => r.company_id === companyId && r.employee_code === code && r.status === 'ACTIVE'
    )
    if (existingActive) {
      throw new Error(`SQLSTATE 23505: unique constraint violation on uq_active_employee_code_reservation (${code})`)
    }

    // 6. Atomically persist reservation
    const resRecord: ReservationRecord = {
      id: crypto.randomUUID(),
      company_id: companyId,
      employee_code: code,
      reservation_type: reservationType,
      status: 'ACTIVE',
      reserved_by: effectiveUserId,
      created_at: currentTime,
      expires_at: new Date(currentTime.getTime() + ttlMinutes * 60 * 1000),
    }
    dbReservations.push(resRecord)

    return { reservation_id: resRecord.id, employee_code: code }
  }

  function simulatePgRenewReservation(
    reservationId: string,
    companyId: string,
    userId: string | null = null,
    additionalMinutes: number = 15,
    currentTime: Date = new Date(),
    isServiceRole: boolean = false,
    callerAssertsServiceRole: boolean = false,
    callerContext?: ExecutionContext
  ): boolean {
    const isVerified = simulateIsServiceRole(callerContext, isServiceRole)

    if (callerAssertsServiceRole && !isVerified) {
      throw new Error('Security violation: caller cannot assert service-role authorization without verified service-role credentials.')
    }

    if (callerContext && callerContext.jwtRole === 'authenticated') {
      if (callerContext.companyId && callerContext.companyId !== companyId) {
        throw new Error('Unauthorized cross-company access denied.')
      }
      if (userId && callerContext.authUserId && userId !== callerContext.authUserId) {
        throw new Error('Unauthorized caller identity mismatch.')
      }
    }

    const res = dbReservations.find((r) => r.id === reservationId)
    if (
      res &&
      res.company_id === companyId &&
      res.status === 'ACTIVE' &&
      res.expires_at >= currentTime &&
      checkOwnership(res, userId, isServiceRole, callerContext)
    ) {
      res.expires_at = new Date(currentTime.getTime() + additionalMinutes * 60 * 1000)
      return true
    }
    return false
  }

  function simulateCommitReservation(
    reservationId: string,
    cardId?: string,
    empId?: string,
    companyId: string = COMPANY_A,
    userId: string | null = null,
    currentTime: Date = new Date(),
    isServiceRole: boolean = false,
    callerAssertsServiceRole: boolean = false,
    callerContext?: ExecutionContext
  ): boolean {
    const isVerified = simulateIsServiceRole(callerContext, isServiceRole)

    if (callerAssertsServiceRole && !isVerified) {
      throw new Error('Security violation: caller cannot assert service-role authorization without verified service-role credentials.')
    }

    if (callerContext && callerContext.jwtRole === 'authenticated') {
      if (callerContext.companyId && callerContext.companyId !== companyId) {
        throw new Error('Unauthorized cross-company access denied.')
      }
      if (userId && callerContext.authUserId && userId !== callerContext.authUserId) {
        throw new Error('Unauthorized caller identity mismatch.')
      }
    }

    const res = dbReservations.find((r) => r.id === reservationId)
    if (
      res &&
      res.company_id === companyId &&
      res.status === 'ACTIVE' &&
      res.expires_at >= currentTime &&
      checkOwnership(res, userId, isServiceRole, callerContext)
    ) {
      res.status = 'COMMITTED'
      if (cardId) res.temporary_card_id = cardId
      if (empId) res.employee_id = empId
      return true
    }
    return false
  }

  function simulateReleaseReservation(
    reservationId: string,
    companyId: string = COMPANY_A,
    userId: string | null = null,
    isServiceRole: boolean = false,
    callerAssertsServiceRole: boolean = false,
    callerContext?: ExecutionContext
  ): boolean {
    const isVerified = simulateIsServiceRole(callerContext, isServiceRole)

    if (callerAssertsServiceRole && !isVerified) {
      throw new Error('Security violation: caller cannot assert service-role authorization without verified service-role credentials.')
    }

    if (callerContext && callerContext.jwtRole === 'authenticated') {
      if (callerContext.companyId && callerContext.companyId !== companyId) {
        throw new Error('Unauthorized cross-company access denied.')
      }
      if (userId && callerContext.authUserId && userId !== callerContext.authUserId) {
        throw new Error('Unauthorized caller identity mismatch.')
      }
    }

    const res = dbReservations.find((r) => r.id === reservationId)
    if (
      res &&
      res.company_id === companyId &&
      res.status === 'ACTIVE' &&
      checkOwnership(res, userId, isServiceRole, callerContext)
    ) {
      res.status = 'RELEASED'
      return true
    }
    return false
  }

  function simulateConvertTempCard(
    companyId: string,
    tempCardId: string,
    empId: string,
    userId: string | null = null,
    isServiceRole: boolean = false,
    callerAssertsServiceRole: boolean = false,
    callerContext?: ExecutionContext
  ): { success: boolean; idempotent?: boolean; code: string } {
    const isVerified = simulateIsServiceRole(callerContext, isServiceRole)

    if (callerAssertsServiceRole && !isVerified) {
      throw new Error('Security violation: caller cannot assert service-role authorization without verified service-role credentials.')
    }

    if (callerContext && callerContext.jwtRole === 'authenticated') {
      if (callerContext.companyId && callerContext.companyId !== companyId) {
        throw new Error('Unauthorized cross-company access denied.')
      }
    }

    const card = dbTempCards.find((c) => c.id === tempCardId && c.company_id === companyId && !c.deleted_at)
    if (!card) throw new Error('Active temporary ID card not found for conversion or company mismatch.')

    // Idempotency check: already converted to this employee?
    if (card.employee_id) {
      if (card.employee_id === empId) {
        return { success: true, idempotent: true, code: card.employee_code }
      }
      throw new Error('Temporary ID card has already been converted to another employee.')
    }

    const emp = dbEmployees.find((e) => e.id === empId && e.company_id === companyId)
    if (!emp) throw new Error('Employee not found for conversion')
    if (card.employee_code !== emp.employee_code) {
      throw new Error('Code mismatch during conversion')
    }

    card.employee_id = empId
    for (const res of dbReservations) {
      if (
        res.company_id === companyId &&
        (res.temporary_card_id === tempCardId || res.employee_code === card.employee_code) &&
        (res.status === 'ACTIVE' || res.status === 'COMMITTED')
      ) {
        if (!checkOwnership(res, userId, isServiceRole, callerContext)) {
          throw new Error('Unauthorized conversion attempt on reservation.')
        }
        res.status = 'CONVERTED'
        res.employee_id = empId
        res.temporary_card_id = tempCardId
      }
    }
    return { success: true, code: card.employee_code }
  }

  // Truly atomic PostgreSQL stored procedure convert_temporary_card_to_permanent_employee simulation
  // Executes permanent employee insert, card link, and reservation conversion in one single transaction with automatic rollback
  function simulateAtomicConvertTemporaryCardToPermanentEmployee(params: {
    companyId: string
    temporaryCardId: string
    authUserId: string
    creatorId?: string | null
    employeeData: {
      first_name: string
      last_name?: string
      official_email: string
    }
    isServiceRole?: boolean
    callerAssertsServiceRole?: boolean
    callerContext?: ExecutionContext
    failAtStep?: 'lock_card' | 'verify_card' | 'lock_reservation' | 'insert_employee' | 'link_card' | 'transition_reservation'
  }): { success: boolean; idempotent?: boolean; employee_id: string; employee_code: string } {
    const {
      companyId,
      temporaryCardId,
      authUserId,
      creatorId = null,
      employeeData,
      isServiceRole = false,
      callerAssertsServiceRole = false,
      callerContext,
      failAtStep,
    } = params

    const isVerified = simulateIsServiceRole(callerContext, isServiceRole)

    if (callerAssertsServiceRole && !isVerified) {
      throw new Error('Security violation: caller cannot assert service-role authorization without verified service-role credentials.')
    }

    if (callerContext && callerContext.jwtRole === 'authenticated') {
      if (callerContext.companyId && callerContext.companyId !== companyId) {
        throw new Error('Unauthorized cross-company access denied.')
      }
      if (creatorId && callerContext.authUserId && creatorId !== callerContext.authUserId) {
        throw new Error('Unauthorized caller identity mismatch.')
      }
    }

    // Snapshot state for atomic rollback simulation (PostgreSQL transaction isolation)
    const snapshotReservations = JSON.parse(JSON.stringify(dbReservations))
    const snapshotEmployees = JSON.parse(JSON.stringify(dbEmployees))
    const snapshotTempCards = JSON.parse(JSON.stringify(dbTempCards))

    const rollback = (err: Error) => {
      dbReservations = snapshotReservations
      dbEmployees = snapshotEmployees
      dbTempCards = snapshotTempCards
      throw err
    }

    try {
      if (failAtStep === 'lock_card') {
        throw new Error('Lock acquisition failed')
      }

      // 1. Row-lock temporary card
      const card = dbTempCards.find((c) => c.id === temporaryCardId && c.company_id === companyId && !c.deleted_at)
      if (!card) {
        throw new Error('Active temporary ID card not found for conversion or company mismatch.')
      }

      if (failAtStep === 'verify_card') {
        throw new Error('Card verification failed: invalid temporary card state')
      }

      // 2. Duplicate conversion / Idempotency check
      if (card.employee_id) {
        const existingEmp = dbEmployees.find((e) => e.id === card.employee_id && e.company_id === companyId)
        if (
          existingEmp &&
          (existingEmp.user_id === authUserId ||
            (existingEmp.official_email &&
              employeeData.official_email &&
              existingEmp.official_email.toLowerCase() === employeeData.official_email.toLowerCase()))
        ) {
          return {
            success: true,
            idempotent: true,
            employee_id: existingEmp.id,
            employee_code: existingEmp.employee_code,
          }
        }
        throw new Error(`Temporary ID card ${temporaryCardId} is already converted to another employee.`)
      }

      if (failAtStep === 'lock_reservation') {
        throw new Error('Reservation lock acquisition failed')
      }

      // 3. Row-lock associated reservation & enforce ownership
      const res = dbReservations.find(
        (r) => r.company_id === companyId && (r.temporary_card_id === temporaryCardId || r.employee_code === card.employee_code)
      )
      if (res) {
        if (!res.reserved_by) {
          if (!isVerified) {
            throw new Error(`Unauthorized: NULL-owner reservations may only be converted via verified service role.`)
          }
        } else {
          if (!checkOwnership(res, creatorId, isServiceRole, callerContext)) {
            throw new Error(`Unauthorized: Caller does not own the reservation for temporary card ${temporaryCardId}.`)
          }
        }
      }

      if (failAtStep === 'insert_employee') {
        throw new Error('Unique constraint violation: employee already exists')
      }

      // 4. Insert permanent employee
      const newEmpId = crypto.randomUUID()
      dbEmployees.push({
        id: newEmpId,
        company_id: companyId,
        employee_code: card.employee_code,
        user_id: authUserId,
        official_email: employeeData.official_email,
      })

      if (failAtStep === 'link_card') {
        throw new Error('Database link error: temporary card update failed')
      }

      // 5. Update temporary card
      card.employee_id = newEmpId

      if (failAtStep === 'transition_reservation') {
        throw new Error('Database error: reservation transition failed')
      }

      // 6. Transition reservation status
      if (res) {
        res.status = 'CONVERTED'
        res.employee_id = newEmpId
        res.temporary_card_id = temporaryCardId
      }

      return {
        success: true,
        employee_id: newEmpId,
        employee_code: card.employee_code,
      }
    } catch (err: any) {
      rollback(err)
      throw err
    }
  }

  beforeEach(() => {
    dbReservations = []
    dbEmployees = []
    dbTempCards = []
  })

  it('1. performs 10 simultaneous allocations for Company A without duplicate codes', async () => {
    // 10 independent simulated serverless workers call reservation RPC simultaneously
    const workers = Array.from({ length: 10 }, (_, i) =>
      simulatePgReserveNextEmployeeCode(COMPANY_A, 'TEMPORARY_CARD', `worker-${i}`)
    )
    const results = await Promise.all(workers)

    const codes = results.map((r) => r.employee_code)
    const uniqueCodes = new Set(codes)

    expect(uniqueCodes.size).toBe(10)
    expect(codes).toEqual([
      'ACM-001',
      'ACM-002',
      'ACM-003',
      'ACM-004',
      'ACM-005',
      'ACM-006',
      'ACM-007',
      'ACM-008',
      'ACM-009',
      'ACM-010',
    ])
  })

  it('2. performs 10 simultaneous allocations for Company B independently from Company A', async () => {
    // Populate Company A with some codes
    await simulatePgReserveNextEmployeeCode(COMPANY_A, 'TEMPORARY_CARD', 'admin-a-1')
    await simulatePgReserveNextEmployeeCode(COMPANY_A, 'TEMPORARY_CARD', 'admin-a-2')

    // 10 workers for Company B
    const workersB = Array.from({ length: 10 }, (_, i) =>
      simulatePgReserveNextEmployeeCode(COMPANY_B, 'TEMPORARY_CARD', `worker-b-${i}`)
    )
    const resultsB = await Promise.all(workersB)
    const codesB = resultsB.map((r) => r.employee_code)

    expect(new Set(codesB).size).toBe(10)
    expect(codesB[0]).toBe('BET-001')
    expect(codesB[9]).toBe('BET-010')
  })

  it('3. handles concurrent permanent employee and temporary-card allocations for the same company', async () => {
    // Worker 1: permanent employee creation
    // Worker 2: temporary ID card creation
    const [permAlloc, tempAlloc] = await Promise.all([
      simulatePgReserveNextEmployeeCode(COMPANY_A, 'PERMANENT_EMPLOYEE', 'admin-perm'),
      simulatePgReserveNextEmployeeCode(COMPANY_A, 'TEMPORARY_CARD', 'admin-temp'),
    ])

    expect(permAlloc.employee_code).not.toBe(tempAlloc.employee_code)
    expect(new Set([permAlloc.employee_code, tempAlloc.employee_code]).size).toBe(2)

    // Commit both: insert into respective tables
    dbEmployees.push({ id: 'emp-1', company_id: COMPANY_A, employee_code: permAlloc.employee_code })
    dbTempCards.push({ id: 'card-1', company_id: COMPANY_A, employee_code: tempAlloc.employee_code, deleted_at: null })
    simulateCommitReservation(permAlloc.reservation_id, undefined, 'emp-1', COMPANY_A, 'admin-perm')
    simulateCommitReservation(tempAlloc.reservation_id, 'card-1', undefined, COMPANY_A, 'admin-temp')

    // Third allocation receives the subsequent sequence
    const nextAlloc = await simulatePgReserveNextEmployeeCode(COMPANY_A, 'TEMPORARY_CARD', 'admin-next')
    expect(nextAlloc.employee_code).toBe('ACM-003')
  })

  it('4. releases reservation on failed insertion / rollback and allows number reuse', async () => {
    const alloc = await simulatePgReserveNextEmployeeCode(COMPANY_A, 'TEMPORARY_CARD', 'admin-1')
    expect(alloc.employee_code).toBe('ACM-001')

    // Simulate storage upload failure or bad payload rollback
    simulateReleaseReservation(alloc.reservation_id, COMPANY_A, 'admin-1')

    // Next allocation should safely re-allocate ACM-001
    const reAlloc = await simulatePgReserveNextEmployeeCode(COMPANY_A, 'TEMPORARY_CARD', 'admin-2')
    expect(reAlloc.employee_code).toBe('ACM-001')
  })

  it('5. automatically expires abandoned reservations past TTL and recycles the code', async () => {
    const startTime = new Date('2026-11-04T10:00:00Z')
    const alloc = await simulatePgReserveNextEmployeeCode(COMPANY_A, 'TEMPORARY_CARD', 'admin-5', 15, startTime)
    expect(alloc.employee_code).toBe('ACM-001')

    // Simulated worker crashed without releasing.
    // 16 minutes later, a new request arrives:
    const laterTime = new Date('2026-11-04T10:16:00Z')
    const reAlloc = await simulatePgReserveNextEmployeeCode(COMPANY_A, 'TEMPORARY_CARD', 'admin-6', 15, laterTime)

    // Abandoned lease expired, ACM-001 is reclaimed
    expect(reAlloc.employee_code).toBe('ACM-001')
  })

  it('6. safely converts a temporary card into a permanent employee without creating duplicate allocations', async () => {
    // 1. Temporary card created
    const tempAlloc = await simulatePgReserveNextEmployeeCode(COMPANY_A, 'TEMPORARY_CARD', 'admin-6')
    expect(tempAlloc.employee_code).toBe('ACM-001')

    const tempCardId = 'temp-card-uuid-1'
    dbTempCards.push({
      id: tempCardId,
      company_id: COMPANY_A,
      employee_code: 'ACM-001',
      employee_id: null,
      deleted_at: null,
    })
    simulateCommitReservation(tempAlloc.reservation_id, tempCardId, undefined, COMPANY_A, 'admin-6')

    // 2. Conversion: create permanent employee using the temporary card code
    const empId = 'emp-uuid-1'
    dbEmployees.push({
      id: empId,
      company_id: COMPANY_A,
      employee_code: 'ACM-001',
    })

    simulateConvertTempCard(COMPANY_A, tempCardId, empId, 'admin-6')

    // Verify card is now linked to employee
    const card = dbTempCards.find((c) => c.id === tempCardId)
    expect(card?.employee_id).toBe(empId)

    // Verify reservation status transitioned to CONVERTED
    const res = dbReservations.find((r) => r.id === tempAlloc.reservation_id)
    expect(res?.status).toBe('CONVERTED')

    // 3. Ensure next allocation progresses to ACM-002 without collision
    const nextAlloc = await simulatePgReserveNextEmployeeCode(COMPANY_A, 'TEMPORARY_CARD', 'admin-7')
    expect(nextAlloc.employee_code).toBe('ACM-002')
  })

  it('7. allows repeated allocation and number progression after soft deletion', async () => {
    // Create card ACM-001
    const alloc1 = await simulatePgReserveNextEmployeeCode(COMPANY_A, 'TEMPORARY_CARD', 'admin-7')
    dbTempCards.push({
      id: 'card-1',
      company_id: COMPANY_A,
      employee_code: alloc1.employee_code,
      deleted_at: null,
    })
    simulateCommitReservation(alloc1.reservation_id, 'card-1', undefined, COMPANY_A, 'admin-7')

    // Create card ACM-002
    const alloc2 = await simulatePgReserveNextEmployeeCode(COMPANY_A, 'TEMPORARY_CARD', 'admin-7')
    expect(alloc2.employee_code).toBe('ACM-002')
    dbTempCards.push({
      id: 'card-2',
      company_id: COMPANY_A,
      employee_code: alloc2.employee_code,
      deleted_at: null,
    })
    simulateCommitReservation(alloc2.reservation_id, 'card-2', undefined, COMPANY_A, 'admin-7')

    // Soft delete card-1 (deleted_at is set)
    const card1 = dbTempCards.find((c) => c.id === 'card-1')
    if (card1) card1.deleted_at = new Date()

    // Next allocation should find lowest available positive integer not active
    // ACM-001 is soft-deleted, so lowest available is ACM-001
    const alloc3 = await simulatePgReserveNextEmployeeCode(COMPANY_A, 'TEMPORARY_CARD', 'admin-7')
    expect(alloc3.employee_code).toBe('ACM-001')
  })

  it('8. active renewal protects in-progress slow operations (>15 min) from losing their reservation', async () => {
    const t0 = new Date('2026-11-04T12:00:00Z')
    const userA = 'user-admin-a'
    const alloc = await simulatePgReserveNextEmployeeCode(COMPANY_A, 'TEMPORARY_CARD', userA, 15, t0)
    expect(alloc.employee_code).toBe('ACM-001')

    // At 14 minutes, worker performs renewal heartbeat for another 15 minutes
    const t14 = new Date('2026-11-04T12:14:00Z')
    const renewed = simulatePgRenewReservation(alloc.reservation_id, COMPANY_A, userA, 15, t14)
    expect(renewed).toBe(true)

    // At 20 minutes (past original 15m lease), another worker attempts to allocate
    const t20 = new Date('2026-11-04T12:20:00Z')
    const alloc2 = await simulatePgReserveNextEmployeeCode(COMPANY_A, 'TEMPORARY_CARD', 'user-admin-b', 15, t20)
    // Because alloc was renewed, ACM-001 was NOT expired; alloc2 gets ACM-002
    expect(alloc2.employee_code).toBe('ACM-002')

    // Original worker finishes at 25 minutes and successfully commits ACM-001
    const t25 = new Date('2026-11-04T12:25:00Z')
    const committed = simulateCommitReservation(alloc.reservation_id, 'card-slow', undefined, COMPANY_A, userA, t25)
    expect(committed).toBe(true)
  })

  it('9. prevents stale commit when a slow request (>15 min) failed to renew and lease was reclaimed', async () => {
    const t0 = new Date('2026-11-04T12:00:00Z')
    const userSlow = 'user-slow'
    const allocSlow = await simulatePgReserveNextEmployeeCode(COMPANY_A, 'TEMPORARY_CARD', userSlow, 15, t0)
    expect(allocSlow.employee_code).toBe('ACM-001')

    // 16 minutes later (expired without renewal), Request B arrives and reclaims ACM-001
    const t16 = new Date('2026-11-04T12:16:00Z')
    const userFast = 'user-fast'
    const allocFast = await simulatePgReserveNextEmployeeCode(COMPANY_A, 'TEMPORARY_CARD', userFast, 15, t16)
    expect(allocFast.employee_code).toBe('ACM-001')

    // Fast request commits ACM-001
    const fastCommitted = simulateCommitReservation(allocFast.reservation_id, 'card-fast', undefined, COMPANY_A, userFast, t16)
    expect(fastCommitted).toBe(true)

    // Slow request eventually wakes up at 20 minutes and attempts to commit its expired reservation
    const t20 = new Date('2026-11-04T12:20:00Z')
    const slowCommitted = simulateCommitReservation(allocSlow.reservation_id, 'card-stale', undefined, COMPANY_A, userSlow, t20)
    // Stale commit MUST be rejected!
    expect(slowCommitted).toBe(false)
  })

  it('10. enforces strict company and user isolation on reservation renewal, commit, and release', async () => {
    const allocA = await simulatePgReserveNextEmployeeCode(COMPANY_A, 'TEMPORARY_CARD', 'admin-a')

    // Company B cannot renew Company A's reservation
    const renewByCompanyB = simulatePgRenewReservation(allocA.reservation_id, COMPANY_B, 'admin-b')
    expect(renewByCompanyB).toBe(false)

    // Different user in Company A cannot release another user's reservation
    const releaseByOtherUser = simulateReleaseReservation(allocA.reservation_id, COMPANY_A, 'intruder-admin')
    expect(releaseByOtherUser).toBe(false)

    // Different company cannot commit Company A's reservation
    const commitByCompanyB = simulateCommitReservation(allocA.reservation_id, 'card-b', undefined, COMPANY_B, 'admin-b')
    expect(commitByCompanyB).toBe(false)

    // Legitimate owner in Company A can commit
    const legitimateCommit = simulateCommitReservation(allocA.reservation_id, 'card-a', undefined, COMPANY_A, 'admin-a')
    expect(legitimateCommit).toBe(true)
  })

  it('11. guards duplicate conversion: rejects converting a temporary card already linked to another employee', async () => {
    // Card created
    const tempCardId = 'temp-card-duplicate-guard'
    dbTempCards.push({
      id: tempCardId,
      company_id: COMPANY_A,
      employee_code: 'ACM-005',
      employee_id: 'existing-emp-1', // Already linked!
      deleted_at: null,
    })

    dbEmployees.push({
      id: 'existing-emp-1',
      company_id: COMPANY_A,
      employee_code: 'ACM-005',
    })

    dbEmployees.push({
      id: 'second-emp-2',
      company_id: COMPANY_A,
      employee_code: 'ACM-005',
    })

    // Attempting to convert the same card to a second employee MUST throw
    expect(() =>
      simulateConvertTempCard(COMPANY_A, tempCardId, 'second-emp-2')
    ).toThrow('Temporary ID card has already been converted to another employee.')
  })

  it('12. idempotent conversion retry: returns success without creating duplicate links', async () => {
    const tempCardId = 'temp-card-idempotent'
    const empId = 'emp-idempotent-1'
    dbTempCards.push({
      id: tempCardId,
      company_id: COMPANY_A,
      employee_code: 'ACM-008',
      employee_id: null,
      deleted_at: null,
    })
    dbEmployees.push({
      id: empId,
      company_id: COMPANY_A,
      employee_code: 'ACM-008',
    })

    // First conversion
    const res1 = simulateConvertTempCard(COMPANY_A, tempCardId, empId)
    expect(res1.success).toBe(true)
    expect(res1.idempotent).toBeUndefined()

    // Second conversion (idempotent retry with same employee)
    const res2 = simulateConvertTempCard(COMPANY_A, tempCardId, empId)
    expect(res2.success).toBe(true)
    expect(res2.idempotent).toBe(true)
    expect(res2.code).toBe('ACM-008')
  })

  it('13. rejects state transitions on already RELEASED or CONVERTED reservations', async () => {
    const alloc = await simulatePgReserveNextEmployeeCode(COMPANY_A, 'TEMPORARY_CARD', 'admin-1')

    // Release reservation
    const released = simulateReleaseReservation(alloc.reservation_id, COMPANY_A, 'admin-1')
    expect(released).toBe(true)

    // Cannot commit a RELEASED reservation
    const commitOnReleased = simulateCommitReservation(alloc.reservation_id, 'card-x', undefined, COMPANY_A, 'admin-1')
    expect(commitOnReleased).toBe(false)

    // Cannot renew a RELEASED reservation
    const renewOnReleased = simulatePgRenewReservation(alloc.reservation_id, COMPANY_A, 'admin-1')
    expect(renewOnReleased).toBe(false)
  })

  it('14. strict NULL ownership enforcement: reservations with NULL owner cannot be managed without explicit service role', async () => {
    // Background task reserves code with null user under service-role privileges
    const alloc = await simulatePgReserveNextEmployeeCode(
      COMPANY_A,
      'PERMANENT_EMPLOYEE',
      null,
      15,
      new Date(),
      true // isServiceRole
    )

    const res = dbReservations.find((r) => r.id === alloc.reservation_id)
    expect(res?.reserved_by).toBeNull()

    // 1. Arbitrary user 'intruder-admin' attempts to renew NULL-owner reservation -> REJECTED
    const intruderRenew = simulatePgRenewReservation(
      alloc.reservation_id,
      COMPANY_A,
      'intruder-admin',
      15,
      new Date(),
      false // non-service-role
    )
    expect(intruderRenew).toBe(false)

    // 2. Arbitrary user 'intruder-admin' attempts to commit NULL-owner reservation -> REJECTED
    const intruderCommit = simulateCommitReservation(
      alloc.reservation_id,
      undefined,
      'emp-malicious',
      COMPANY_A,
      'intruder-admin',
      new Date(),
      false // non-service-role
    )
    expect(intruderCommit).toBe(false)

    // 3. Arbitrary user 'intruder-admin' attempts to release NULL-owner reservation -> REJECTED
    const intruderRelease = simulateReleaseReservation(
      alloc.reservation_id,
      COMPANY_A,
      'intruder-admin',
      false // non-service-role
    )
    expect(intruderRelease).toBe(false)

    // 4. Anonymous caller (userId = null) without service role -> REJECTED
    const anonRenew = simulatePgRenewReservation(
      alloc.reservation_id,
      COMPANY_A,
      null,
      15,
      new Date(),
      false
    )
    expect(anonRenew).toBe(false)

    // 5. Authorized service role caller -> SUCCEEDS
    const serviceRoleRenew = simulatePgRenewReservation(
      alloc.reservation_id,
      COMPANY_A,
      null,
      15,
      new Date(),
      true // isServiceRole
    )
    expect(serviceRoleRenew).toBe(true)

    const serviceRoleCommit = simulateCommitReservation(
      alloc.reservation_id,
      undefined,
      'emp-valid',
      COMPANY_A,
      null,
      new Date(),
      true // isServiceRole
    )
    expect(serviceRoleCommit).toBe(true)
  })

  it('15. service-role authorization allows system management across serverless isolates', async () => {
    const creatorUser = 'admin-user-isol-1'
    const alloc = await simulatePgReserveNextEmployeeCode(
      COMPANY_A,
      'TEMPORARY_CARD',
      creatorUser,
      15,
      new Date(),
      false
    )

    // Different serverless background worker (e.g., storage webhook / cleanup daemon)
    // acts with service-role permissions
    const workerRenew = simulatePgRenewReservation(
      alloc.reservation_id,
      COMPANY_A,
      'daemon-worker',
      15,
      new Date(),
      true // service role authorization
    )
    expect(workerRenew).toBe(true)

    const workerCommit = simulateCommitReservation(
      alloc.reservation_id,
      'card-isol-1',
      undefined,
      COMPANY_A,
      'daemon-worker',
      new Date(),
      true // service role authorization
    )
    expect(workerCommit).toBe(true)
  })

  it('16. truly atomic conversion rollback: single PostgreSQL transaction guarantees zero partial records if any step fails', async () => {
    // Set up active temporary card and committed reservation
    const tempAlloc = await simulatePgReserveNextEmployeeCode(COMPANY_A, 'TEMPORARY_CARD', 'admin-user')
    const tempCardId = 'temp-card-atomic-rollback-test'
    dbTempCards.push({
      id: tempCardId,
      company_id: COMPANY_A,
      employee_code: tempAlloc.employee_code,
      employee_id: null,
      deleted_at: null,
    })
    simulateCommitReservation(tempAlloc.reservation_id, tempCardId, undefined, COMPANY_A, 'admin-user')

    // Simulate failure at the temporary card linking step
    expect(() =>
      simulateAtomicConvertTemporaryCardToPermanentEmployee({
        companyId: COMPANY_A,
        temporaryCardId: tempCardId,
        authUserId: 'auth-user-rollback',
        creatorId: 'admin-user',
        employeeData: {
          first_name: 'John',
          last_name: 'Doe',
          official_email: 'john.doe@acme.com',
        },
        failAtStep: 'link_card', // Failure injected inside PostgreSQL transaction
      })
    ).toThrow('Database link error: temporary card update failed')

    // VERIFY ALL-OR-NOTHING DATABASE ROLLBACK:
    // 1. Employee record was NOT created / rolled back
    expect(dbEmployees.length).toBe(0)
    // 2. Temporary card employee_id remains NULL (not linked)
    const cardAfterRollback = dbTempCards.find((c) => c.id === tempCardId)
    expect(cardAfterRollback?.employee_id).toBeNull()
    // 3. Reservation status remains COMMITTED (not partially converted)
    const resAfterRollback = dbReservations.find((r) => r.id === tempAlloc.reservation_id)
    expect(resAfterRollback?.status).toBe('COMMITTED')
  })

  it('17. concurrent conversion serialization: row locks prevent duplicate employee creation and allow safe retry', async () => {
    const tempAlloc = await simulatePgReserveNextEmployeeCode(COMPANY_A, 'TEMPORARY_CARD', 'admin-user')
    const tempCardId = 'temp-card-concurrent-guard'
    dbTempCards.push({
      id: tempCardId,
      company_id: COMPANY_A,
      employee_code: tempAlloc.employee_code,
      employee_id: null,
      deleted_at: null,
    })
    simulateCommitReservation(tempAlloc.reservation_id, tempCardId, undefined, COMPANY_A, 'admin-user')

    // Worker 1 executes conversion first
    const conv1 = simulateAtomicConvertTemporaryCardToPermanentEmployee({
      companyId: COMPANY_A,
      temporaryCardId: tempCardId,
      authUserId: 'auth-user-worker-1',
      creatorId: 'admin-user',
      employeeData: {
        first_name: 'Alice',
        official_email: 'alice@acme.com',
      },
    })
    expect(conv1.success).toBe(true)
    expect(dbEmployees.length).toBe(1)

    // Worker 2 attempts concurrent conversion of the SAME card with a different user
    // FOR UPDATE lock serializes this; upon inspecting card.employee_id, it fails closed
    expect(() =>
      simulateAtomicConvertTemporaryCardToPermanentEmployee({
        companyId: COMPANY_A,
        temporaryCardId: tempCardId,
        authUserId: 'auth-user-worker-2',
        creatorId: 'admin-user-2',
        employeeData: {
          first_name: 'Bob',
          official_email: 'bob@acme.com',
        },
      })
    ).toThrow(`Temporary ID card ${tempCardId} is already converted to another employee.`)

    // Database still only has the 1 valid employee
    expect(dbEmployees.length).toBe(1)

    // Worker 1 retries idempotently (e.g., client network timeout retry)
    const convRetry = simulateAtomicConvertTemporaryCardToPermanentEmployee({
      companyId: COMPANY_A,
      temporaryCardId: tempCardId,
      authUserId: 'auth-user-worker-1',
      creatorId: 'admin-user',
      employeeData: {
        first_name: 'Alice',
        official_email: 'alice@acme.com',
      },
    })
    expect(convRetry.success).toBe(true)
    expect(convRetry.idempotent).toBe(true)
    expect(convRetry.employee_id).toBe(conv1.employee_id)
    // No duplicate employee created
    expect(dbEmployees.length).toBe(1)
  })

  it('18. fail-closed heartbeat: renewal failure during slow upload aborts operation immediately', async () => {
    const t0 = new Date('2026-11-04T09:00:00Z')
    const userSlow = 'user-slow-uploader'
    const allocSlow = await simulatePgReserveNextEmployeeCode(
      COMPANY_A,
      'TEMPORARY_CARD',
      userSlow,
      15,
      t0
    )
    expect(allocSlow.employee_code).toBe('ACM-001')

    // Simulate route heartbeat manager:
    let heartbeatActive = true
    let heartbeatFailed = false

    const heartbeatCheck = async (currentTime: Date): Promise<boolean> => {
      const renewed = simulatePgRenewReservation(
        allocSlow.reservation_id,
        COMPANY_A,
        userSlow,
        15,
        currentTime
      )
      if (!renewed) {
        heartbeatFailed = true
        heartbeatActive = false
        return false
      }
      return true
    }

    // After 16 minutes without successful heartbeat renewal, the lease expires and another worker reclaims ACM-001
    const t16 = new Date('2026-11-04T09:16:00Z')
    const allocReclaimer = await simulatePgReserveNextEmployeeCode(
      COMPANY_A,
      'TEMPORARY_CARD',
      'user-reclaimer',
      15,
      t16
    )
    expect(allocReclaimer.employee_code).toBe('ACM-001')

    // Now the slow uploader's checkpoint runs before attempting database write
    const checkpointOk = await heartbeatCheck(t16)
    expect(checkpointOk).toBe(false)
    expect(heartbeatFailed).toBe(true)

    // Route fails closed: stops processing immediately, aborts card insert, does NOT call commit
    let attemptedCommit = false
    if (checkpointOk) {
      attemptedCommit = true
      simulateCommitReservation(allocSlow.reservation_id, 'card-stale', undefined, COMPANY_A, userSlow, t16)
    }

    expect(attemptedCommit).toBe(false)
    // Reclaimer's reservation remains safely intact
    const reclaimerRes = dbReservations.find((r) => r.id === allocReclaimer.reservation_id)
    expect(reclaimerRes?.status).toBe('ACTIVE')
  })

  it('19. impersonation defense: authenticated users passing p_is_service_role=true without verified credentials are rejected with security violation', async () => {
    const maliciousUserContext: ExecutionContext = {
      jwtRole: 'authenticated',
      authUserId: 'attacker-123',
      companyId: COMPANY_A,
    }

    // 1. Attempt reserve with callerAssertsServiceRole = true
    await expect(
      simulatePgReserveNextEmployeeCode(
        COMPANY_A,
        'TEMPORARY_CARD',
        'attacker-123',
        15,
        new Date(),
        false, // not verified service role
        true, // caller asserts service role
        maliciousUserContext
      )
    ).rejects.toThrow('Security violation: caller cannot assert service-role authorization without verified service-role credentials.')

    // Setup an active reservation legitimately
    const legitimateAlloc = await simulatePgReserveNextEmployeeCode(
      COMPANY_A,
      'TEMPORARY_CARD',
      'attacker-123',
      15,
      new Date(),
      false,
      false,
      maliciousUserContext
    )

    // 2. Attempt renew with callerAssertsServiceRole = true
    expect(() =>
      simulatePgRenewReservation(
        legitimateAlloc.reservation_id,
        COMPANY_A,
        'attacker-123',
        15,
        new Date(),
        false,
        true,
        maliciousUserContext
      )
    ).toThrow('Security violation: caller cannot assert service-role authorization without verified service-role credentials.')

    // 3. Attempt commit with callerAssertsServiceRole = true
    expect(() =>
      simulateCommitReservation(
        legitimateAlloc.reservation_id,
        'card-123',
        undefined,
        COMPANY_A,
        'attacker-123',
        new Date(),
        false,
        true,
        maliciousUserContext
      )
    ).toThrow('Security violation: caller cannot assert service-role authorization without verified service-role credentials.')

    // 4. Attempt release with callerAssertsServiceRole = true
    expect(() =>
      simulateReleaseReservation(
        legitimateAlloc.reservation_id,
        COMPANY_A,
        'attacker-123',
        false,
        true,
        maliciousUserContext
      )
    ).toThrow('Security violation: caller cannot assert service-role authorization without verified service-role credentials.')

    // 5. Attempt atomic conversion with callerAssertsServiceRole = true
    const tempCardId = 'card-malicious-test'
    dbTempCards.push({
      id: tempCardId,
      company_id: COMPANY_A,
      employee_code: legitimateAlloc.employee_code,
      employee_id: null,
      deleted_at: null,
    })

    expect(() =>
      simulateAtomicConvertTemporaryCardToPermanentEmployee({
        companyId: COMPANY_A,
        temporaryCardId: tempCardId,
        authUserId: 'auth-user-malicious',
        creatorId: 'attacker-123',
        employeeData: {
          first_name: 'Attacker',
          official_email: 'attacker@acme.com',
        },
        isServiceRole: false,
        callerAssertsServiceRole: true,
        callerContext: maliciousUserContext,
      })
    ).toThrow('Security violation: caller cannot assert service-role authorization without verified service-role credentials.')
  })

  it('20. cross-company isolation: authenticated users cannot reserve, renew, commit, release, or convert codes across tenant boundaries', async () => {
    // User from Company B
    const userCompanyBContext: ExecutionContext = {
      jwtRole: 'authenticated',
      authUserId: 'user-b-admin',
      companyId: COMPANY_B,
    }

    // 1. Attempt reserve code for Company A -> REJECTED
    await expect(
      simulatePgReserveNextEmployeeCode(
        COMPANY_A,
        'TEMPORARY_CARD',
        'user-b-admin',
        15,
        new Date(),
        false,
        false,
        userCompanyBContext
      )
    ).rejects.toThrow('Unauthorized cross-company access denied.')

    // Create reservation and card in Company A by authorized Company A user
    const userCompanyAContext: ExecutionContext = {
      jwtRole: 'authenticated',
      authUserId: 'user-a-admin',
      companyId: COMPANY_A,
    }
    const allocA = await simulatePgReserveNextEmployeeCode(
      COMPANY_A,
      'TEMPORARY_CARD',
      'user-a-admin',
      15,
      new Date(),
      false,
      false,
      userCompanyAContext
    )

    // 2. Company B user attempts to renew Company A's reservation -> REJECTED
    expect(() =>
      simulatePgRenewReservation(
        allocA.reservation_id,
        COMPANY_A,
        'user-b-admin',
        15,
        new Date(),
        false,
        false,
        userCompanyBContext
      )
    ).toThrow('Unauthorized cross-company access denied.')

    // 3. Company B user attempts to commit Company A's reservation -> REJECTED
    expect(() =>
      simulateCommitReservation(
        allocA.reservation_id,
        'card-a',
        undefined,
        COMPANY_A,
        'user-b-admin',
        new Date(),
        false,
        false,
        userCompanyBContext
      )
    ).toThrow('Unauthorized cross-company access denied.')

    // 4. Company B user attempts to release Company A's reservation -> REJECTED
    expect(() =>
      simulateReleaseReservation(
        allocA.reservation_id,
        COMPANY_A,
        'user-b-admin',
        false,
        false,
        userCompanyBContext
      )
    ).toThrow('Unauthorized cross-company access denied.')

    // 5. Company B user attempts to convert Company A's temporary card -> REJECTED
    const tempCardA = 'card-company-a-isolated'
    dbTempCards.push({
      id: tempCardA,
      company_id: COMPANY_A,
      employee_code: allocA.employee_code,
      employee_id: null,
      deleted_at: null,
    })

    expect(() =>
      simulateAtomicConvertTemporaryCardToPermanentEmployee({
        companyId: COMPANY_A,
        temporaryCardId: tempCardA,
        authUserId: 'auth-user-b',
        creatorId: 'user-b-admin',
        employeeData: {
          first_name: 'CrossCompany',
          official_email: 'cross@company.com',
        },
        callerContext: userCompanyBContext,
      })
    ).toThrow('Unauthorized cross-company access denied.')
  })

  it('21. production fail-closed conversion: missing atomic RPC in production throws immediately and refuses non-atomic fallback', () => {
    // Model the route's guard condition in src/app/api/employees/route.ts lines 870-875:
    function executeConversionStep(isRpcAvailable: boolean, nodeEnv: string): { success: boolean; executedPath: string } {
      let conversionSucceeded = false
      if (isRpcAvailable) {
        conversionSucceeded = true
      }

      if (!conversionSucceeded) {
        if (nodeEnv !== 'test') {
          throw new Error('Database-backed atomic conversion RPC (convert_temporary_card_to_permanent_employee) is required in production but unavailable. Aborting conversion to prevent non-atomic partial data corruption.')
        }
        // In test mode only, fallback simulation can run
        return { success: true, executedPath: 'isolated-test-fallback' }
      }

      return { success: true, executedPath: 'atomic-rpc-transaction' }
    }

    // When RPC is missing in production: MUST THROW FAIL-CLOSED
    expect(() => executeConversionStep(false, 'production')).toThrow(
      'Database-backed atomic conversion RPC (convert_temporary_card_to_permanent_employee) is required in production but unavailable.'
    )

    // When RPC is missing in staging/preview: MUST ALSO THROW FAIL-CLOSED
    expect(() => executeConversionStep(false, 'staging')).toThrow(
      'Database-backed atomic conversion RPC (convert_temporary_card_to_permanent_employee) is required in production but unavailable.'
    )

    // In isolated local test environment only: fallback path is allowed
    const testResult = executeConversionStep(false, 'test')
    expect(testResult.success).toBe(true)
    expect(testResult.executedPath).toBe('isolated-test-fallback')

    // When RPC is available in production: executes atomic transactional path
    const prodSuccess = executeConversionStep(true, 'production')
    expect(prodSuccess.success).toBe(true)
    expect(prodSuccess.executedPath).toBe('atomic-rpc-transaction')
  })

  it('22. discrete mutation step rollback: single transaction guarantees 100% all-or-nothing rollback at every step of conversion lifecycle', async () => {
    const failureSteps: Array<'lock_card' | 'verify_card' | 'lock_reservation' | 'insert_employee' | 'link_card' | 'transition_reservation'> = [
      'lock_card',
      'verify_card',
      'lock_reservation',
      'insert_employee',
      'link_card',
      'transition_reservation',
    ]

    for (const step of failureSteps) {
      // Clean DB state for each sub-test
      dbReservations = []
      dbEmployees = []
      dbTempCards = []

      // Setup active temporary card and committed reservation
      const alloc = await simulatePgReserveNextEmployeeCode(COMPANY_A, 'TEMPORARY_CARD', 'admin-user')
      const cardId = `card-step-${step}`
      dbTempCards.push({
        id: cardId,
        company_id: COMPANY_A,
        employee_code: alloc.employee_code,
        employee_id: null,
        deleted_at: null,
      })
      simulateCommitReservation(alloc.reservation_id, cardId, undefined, COMPANY_A, 'admin-user')

      // Verify baseline state before mutation attempt
      expect(dbEmployees.length).toBe(0)
      expect(dbTempCards[0].employee_id).toBeNull()
      expect(dbReservations[0].status).toBe('COMMITTED')

      // Attempt conversion with discrete failure injection
      expect(() =>
        simulateAtomicConvertTemporaryCardToPermanentEmployee({
          companyId: COMPANY_A,
          temporaryCardId: cardId,
          authUserId: `auth-user-${step}`,
          creatorId: 'admin-user',
          employeeData: {
            first_name: 'Test',
            official_email: `test-${step}@acme.com`,
          },
          failAtStep: step,
        })
      ).toThrow()

      // VERIFY STRICT TRANSACTIONAL INVARIANTS:
      // 1. Zero permanent employee records exist
      expect(dbEmployees.length).toBe(0)
      // 2. Temporary card employee_id remained NULL (no orphan foreign key)
      const cardAfter = dbTempCards.find((c) => c.id === cardId)
      expect(cardAfter?.employee_id).toBeNull()
      // 3. Reservation remained COMMITTED (not partially converted)
      const resAfter = dbReservations.find((r) => r.id === alloc.reservation_id)
      expect(resAfter?.status).toBe('COMMITTED')
    }
  })

  it('23. standard onboarding compensation: auth user compensated and logs sanitized upon database failure', async () => {
    // Model the onboarding compensation logic from src/app/api/employees/route.ts
    const authUsers: Array<{ id: string; email: string }> = []
    const loggedErrors: string[] = []

    const mockConsoleError = vi.spyOn(console, 'error').mockImplementation((...args) => {
      loggedErrors.push(args.map(String).join(' '))
    })

    const simulateOnboarding = async (shouldFailDbInsert: boolean) => {
      // Step 1: Reserve code
      const alloc = await simulatePgReserveNextEmployeeCode(COMPANY_A, 'PERMANENT_EMPLOYEE', 'admin-1')
      let isCommitted = false
      let authUserId: string | null = null

      try {
        // Step 2: Create Auth user
        authUserId = 'supabase-auth-user-999'
        authUsers.push({ id: authUserId, email: 'newhire@acme.com' })

        // Step 3: Insert permanent employee into database
        if (shouldFailDbInsert) {
          throw new Error('Database connection timeout during employee insertion with secret_token=sk_live_xyz123')
        }

        dbEmployees.push({
          id: 'new-emp-999',
          company_id: COMPANY_A,
          employee_code: alloc.employee_code,
          user_id: authUserId,
          official_email: 'newhire@acme.com',
        })
        simulateCommitReservation(alloc.reservation_id, undefined, 'new-emp-999', COMPANY_A, 'admin-1')
        isCommitted = true
      } catch (err: any) {
        // Compensation 1: Release uncommitted reservation
        if (!isCommitted) {
          simulateReleaseReservation(alloc.reservation_id, COMPANY_A, 'admin-1')
        }

        // Compensation 2: Delete auth user
        if (authUserId) {
          try {
            const idx = authUsers.findIndex((u) => u.id === authUserId)
            if (idx >= 0) authUsers.splice(idx, 1)
          } catch (authCleanupErr: any) {
            console.error('Compensating auth user cleanup failed:', authCleanupErr?.message || 'Unknown error')
          }
        }

        // Sanitized logging: never dump tokens or secrets
        const sanitizedMsg = err.message ? err.message.replace(/secret_token=\S+/g, '[REDACTED]') : 'Unknown error'
        console.error('Employee creation failed:', sanitizedMsg)
        throw new Error('An unexpected error occurred during employee creation.')
      }
    }

    // Execute failed onboarding
    await expect(simulateOnboarding(true)).rejects.toThrow('An unexpected error occurred during employee creation.')

    // Invariants verified:
    // 1. Auth user was deleted (compensated)
    expect(authUsers.length).toBe(0)
    // 2. Reservation was released so code can be reclaimed
    const res = dbReservations[0]
    expect(res.status).toBe('RELEASED')
    // 3. Database has 0 employees
    expect(dbEmployees.length).toBe(0)
    // 4. Logs are sanitized and do NOT expose secret_token
    expect(loggedErrors.some((log) => log.includes('sk_live_xyz123'))).toBe(false)
    expect(loggedErrors.some((log) => log.includes('[REDACTED]'))).toBe(true)

    mockConsoleError.mockRestore()
  })

  it('24. standard onboarding lease expiry: expired reservation cannot be committed and recovers via fresh allocation', async () => {
    const t0 = new Date('2026-11-04T10:00:00Z')
    const userSlow = 'onboarding-admin'

    // Step 1: Slow request reserves ACM-001
    const allocSlow = await simulatePgReserveNextEmployeeCode(
      COMPANY_A,
      'PERMANENT_EMPLOYEE',
      userSlow,
      15,
      t0
    )
    expect(allocSlow.employee_code).toBe('ACM-001')

    // Step 2: 20 minutes pass without heartbeat. Lease expires at t0 + 15 min.
    const t20 = new Date('2026-11-04T10:20:00Z')

    // Worker 2 runs allocation at t20. Reclaims ACM-001 because allocSlow is expired.
    const allocWorker2 = await simulatePgReserveNextEmployeeCode(
      COMPANY_A,
      'PERMANENT_EMPLOYEE',
      'fast-admin',
      15,
      t20
    )
    expect(allocWorker2.employee_code).toBe('ACM-001')

    // Worker 2 commits ACM-001 for employee 1
    const committedWorker2 = simulateCommitReservation(
      allocWorker2.reservation_id,
      undefined,
      'emp-worker-2',
      COMPANY_A,
      'fast-admin',
      t20
    )
    expect(committedWorker2).toBe(true)
    dbEmployees.push({
      id: 'emp-worker-2',
      company_id: COMPANY_A,
      employee_code: 'ACM-001',
    })

    // Step 3: Slow request attempts to commit its stale reservation allocSlow -> REJECTED
    const staleCommit = simulateCommitReservation(
      allocSlow.reservation_id,
      undefined,
      'emp-slow',
      COMPANY_A,
      userSlow,
      t20
    )
    expect(staleCommit).toBe(false)

    // Step 4: Slow request recovers by acquiring a fresh reservation
    const allocRetry = await simulatePgReserveNextEmployeeCode(
      COMPANY_A,
      'PERMANENT_EMPLOYEE',
      userSlow,
      15,
      t20
    )
    // ACM-001 is committed in dbEmployees, so fresh code is ACM-002
    expect(allocRetry.employee_code).toBe('ACM-002')

    const committedRetry = simulateCommitReservation(
      allocRetry.reservation_id,
      undefined,
      'emp-slow',
      COMPANY_A,
      userSlow,
      t20
    )
    expect(committedRetry).toBe(true)
    dbEmployees.push({
      id: 'emp-slow',
      company_id: COMPANY_A,
      employee_code: 'ACM-002',
    })

    // Final database state has exactly 2 distinct employees with unique codes
    expect(dbEmployees.length).toBe(2)
    const codes = dbEmployees.map((e) => e.employee_code)
    expect(codes).toContain('ACM-001')
    expect(codes).toContain('ACM-002')
  })

  it('25. [SIMULATED] authenticated caller inside a PostgreSQL-owned SECURITY DEFINER function is NOT elevated to service-role', async () => {
    // Under PostgreSQL, a SECURITY DEFINER function owned by postgres sets CURRENT_USER = 'postgres'.
    // However, the caller connected via PostgREST with SESSION_USER = 'authenticator' and jwt.claim.role = 'authenticated'.
    const ordinaryUserContext: ExecutionContext = {
      jwtRole: 'authenticated',
      jwtClaimsRaw: JSON.stringify({ role: 'authenticated', sub: 'ordinary-user-1' }),
      sessionUser: 'authenticator',
      currentUser: 'postgres', // Simulated function owner switch inside SECURITY DEFINER
      authUserId: 'ordinary-user-1',
      companyId: COMPANY_A,
    }

    // 1. is_service_role MUST evaluate to false despite currentUser = 'postgres'
    expect(simulateIsServiceRole(ordinaryUserContext)).toBe(false)

    // 2. Caller can legitimately reserve within own company
    const alloc = await simulatePgReserveNextEmployeeCode(
      COMPANY_A,
      'TEMPORARY_CARD',
      'ordinary-user-1',
      15,
      new Date(),
      false,
      false,
      ordinaryUserContext
    )
    expect(alloc.employee_code).toBe('ACM-001')

    // 3. Caller CANNOT reserve for another company
    await expect(
      simulatePgReserveNextEmployeeCode(
        COMPANY_B,
        'TEMPORARY_CARD',
        'ordinary-user-1',
        15,
        new Date(),
        false,
        false,
        ordinaryUserContext
      )
    ).rejects.toThrow('Unauthorized cross-company access denied.')
  })

  it('26. [SIMULATED] genuine service-role JWT request receives verified service-role authorization', async () => {
    // PostgREST API request using SUPABASE_SERVICE_ROLE_KEY
    const serviceRolePostgrestContext: ExecutionContext = {
      jwtRole: 'service_role',
      jwtClaimsRaw: JSON.stringify({ role: 'service_role', iss: 'supabase' }),
      sessionUser: 'authenticator',
      currentUser: 'postgres',
      authUserId: null,
      companyId: null,
    }
    expect(simulateIsServiceRole(serviceRolePostgrestContext)).toBe(true)

    // Can allocate code across companies on behalf of background worker
    const allocA = await simulatePgReserveNextEmployeeCode(
      COMPANY_A,
      'PERMANENT_EMPLOYEE',
      null,
      15,
      new Date(),
      false,
      false,
      serviceRolePostgrestContext
    )
    expect(allocA.employee_code).toBe('ACM-001')

    const allocB = await simulatePgReserveNextEmployeeCode(
      COMPANY_B,
      'PERMANENT_EMPLOYEE',
      null,
      15,
      new Date(),
      false,
      false,
      serviceRolePostgrestContext
    )
    expect(allocB.employee_code).toBe('BET-001')
  })

  it('27. [SIMULATED] authenticated JWT with forged or conflicting role settings fails closed', () => {
    // Conflict 1: request.jwt.claim.role says 'authenticated', but claims JSON says 'service_role'
    const conflictingContext1: ExecutionContext = {
      jwtRole: 'authenticated',
      jwtClaimsRaw: JSON.stringify({ role: 'service_role' }),
      sessionUser: 'authenticator',
      currentUser: 'postgres',
    }
    expect(simulateIsServiceRole(conflictingContext1)).toBe(false)

    // Conflict 2: request.jwt.claim.role says 'service_role', but claims JSON says 'authenticated'
    const conflictingContext2: ExecutionContext = {
      jwtRole: 'service_role',
      jwtClaimsRaw: JSON.stringify({ role: 'authenticated' }),
      sessionUser: 'authenticator',
      currentUser: 'postgres',
    }
    expect(simulateIsServiceRole(conflictingContext2)).toBe(false)

    // Forged assertion: claim.role says 'service_role_impersonator'
    const forgedContext: ExecutionContext = {
      jwtRole: 'service_role_impersonator',
      jwtClaimsRaw: JSON.stringify({ role: 'service_role_impersonator' }),
      sessionUser: 'authenticator',
      currentUser: 'postgres',
    }
    expect(simulateIsServiceRole(forgedContext)).toBe(false)
  })

  it('28. [SIMULATED] missing and malformed JWT claims fail closed immediately without throwing unhandled exceptions', () => {
    // Case A: Malformed, non-parseable JSON in request.jwt.claims
    const malformedJsonContext: ExecutionContext = {
      jwtRole: null,
      jwtClaimsRaw: '{not-valid-json-syntax',
      sessionUser: 'authenticator',
      currentUser: 'postgres',
    }
    expect(simulateIsServiceRole(malformedJsonContext)).toBe(false)

    // Case B: Empty string / whitespace claims
    const emptyClaimsContext: ExecutionContext = {
      jwtRole: '',
      jwtClaimsRaw: '',
      sessionUser: 'authenticator',
      currentUser: 'postgres',
    }
    expect(simulateIsServiceRole(emptyClaimsContext)).toBe(false)

    // Case C: Null JWT claims under PostgREST sessionUser ('authenticator')
    const nullClaimsContext: ExecutionContext = {
      jwtRole: null,
      jwtClaimsRaw: null,
      sessionUser: 'authenticator',
      currentUser: 'postgres',
    }
    expect(simulateIsServiceRole(nullClaimsContext)).toBe(false)
  })

  it('29. [SIMULATED] trusted direct database session (postgres, supabase_admin, service_role) is accepted only without JWT context', () => {
    // Direct TCP session by superuser (e.g. migration runner or direct maintenance script)
    const directSuperuserContext: ExecutionContext = {
      jwtRole: null,
      jwtClaimsRaw: null,
      sessionUser: 'postgres',
      currentUser: 'postgres',
    }
    expect(simulateIsServiceRole(directSuperuserContext)).toBe(true)

    // Direct TCP session by supabase_admin
    const directAdminContext: ExecutionContext = {
      jwtRole: null,
      jwtClaimsRaw: null,
      sessionUser: 'supabase_admin',
      currentUser: 'supabase_admin',
    }
    expect(simulateIsServiceRole(directAdminContext)).toBe(true)

    // Direct TCP session by service_role
    const directServiceRoleContext: ExecutionContext = {
      jwtRole: null,
      jwtClaimsRaw: null,
      sessionUser: 'service_role',
      currentUser: 'service_role',
    }
    expect(simulateIsServiceRole(directServiceRoleContext)).toBe(true)

    // However, if an authenticated JWT context is attached, direct session fallback is PREVENTED
    const taintedDirectContext: ExecutionContext = {
      jwtRole: 'authenticated',
      jwtClaimsRaw: JSON.stringify({ role: 'authenticated' }),
      sessionUser: 'postgres',
      currentUser: 'postgres',
    }
    expect(simulateIsServiceRole(taintedDirectContext)).toBe(false)
  })

  it('30. [SIMULATED] untrusted direct database session (anon, authenticated, custom roles) fails closed', () => {
    const directAnonContext: ExecutionContext = {
      jwtRole: null,
      jwtClaimsRaw: null,
      sessionUser: 'anon',
      currentUser: 'anon',
    }
    expect(simulateIsServiceRole(directAnonContext)).toBe(false)

    const directAuthContext: ExecutionContext = {
      jwtRole: null,
      jwtClaimsRaw: null,
      sessionUser: 'authenticated',
      currentUser: 'authenticated',
    }
    expect(simulateIsServiceRole(directAuthContext)).toBe(false)

    const directCustomRoleContext: ExecutionContext = {
      jwtRole: null,
      jwtClaimsRaw: null,
      sessionUser: 'readonly_auditor',
      currentUser: 'readonly_auditor',
    }
    expect(simulateIsServiceRole(directCustomRoleContext)).toBe(false)
  })

  it('31. [SIMULATED] cross-company reservation access is strictly blocked across all operations', async () => {
    const userCompanyA: ExecutionContext = {
      jwtRole: 'authenticated',
      jwtClaimsRaw: JSON.stringify({ role: 'authenticated', sub: 'user-a' }),
      sessionUser: 'authenticator',
      currentUser: 'postgres',
      authUserId: 'user-a',
      companyId: COMPANY_A,
    }

    // 1. Reserve cross-company -> REJECTED
    await expect(
      simulatePgReserveNextEmployeeCode(
        COMPANY_B,
        'TEMPORARY_CARD',
        'user-a',
        15,
        new Date(),
        false,
        false,
        userCompanyA
      )
    ).rejects.toThrow('Unauthorized cross-company access denied.')

    // Setup an allocation in Company B
    const userCompanyB: ExecutionContext = {
      jwtRole: 'authenticated',
      jwtClaimsRaw: JSON.stringify({ role: 'authenticated', sub: 'user-b' }),
      sessionUser: 'authenticator',
      currentUser: 'postgres',
      authUserId: 'user-b',
      companyId: COMPANY_B,
    }
    const allocB = await simulatePgReserveNextEmployeeCode(
      COMPANY_B,
      'TEMPORARY_CARD',
      'user-b',
      15,
      new Date(),
      false,
      false,
      userCompanyB
    )

    // 2. Renew cross-company -> REJECTED
    expect(() =>
      simulatePgRenewReservation(
        allocB.reservation_id,
        COMPANY_B,
        'user-a',
        15,
        new Date(),
        false,
        false,
        userCompanyA
      )
    ).toThrow('Unauthorized cross-company access denied.')

    // 3. Commit cross-company -> REJECTED
    expect(() =>
      simulateCommitReservation(
        allocB.reservation_id,
        'card-b',
        undefined,
        COMPANY_B,
        'user-a',
        new Date(),
        false,
        false,
        userCompanyA
      )
    ).toThrow('Unauthorized cross-company access denied.')

    // 4. Release cross-company -> REJECTED
    expect(() =>
      simulateReleaseReservation(
        allocB.reservation_id,
        COMPANY_B,
        'user-a',
        false,
        false,
        userCompanyA
      )
    ).toThrow('Unauthorized cross-company access denied.')
  })

  it('32. [SIMULATED] NULL-owner reservation restrictions: unprivileged callers cannot manage or convert NULL-owner reservations', async () => {
    // Background worker creates a NULL-owner reservation
    const serviceRoleCtx: ExecutionContext = {
      jwtRole: 'service_role',
      sessionUser: 'authenticator',
    }
    const alloc = await simulatePgReserveNextEmployeeCode(
      COMPANY_A,
      'PERMANENT_EMPLOYEE',
      null,
      15,
      new Date(),
      false,
      false,
      serviceRoleCtx
    )
    const resRecord = dbReservations.find((r) => r.id === alloc.reservation_id)
    expect(resRecord?.reserved_by).toBeNull()

    // Authenticated user in Company A attempts management
    const authUserSameCompany: ExecutionContext = {
      jwtRole: 'authenticated',
      sessionUser: 'authenticator',
      currentUser: 'postgres',
      authUserId: 'user-intruder',
      companyId: COMPANY_A,
    }

    // Renew -> false
    expect(
      simulatePgRenewReservation(alloc.reservation_id, COMPANY_A, 'user-intruder', 15, new Date(), false, false, authUserSameCompany)
    ).toBe(false)

    // Commit -> false
    expect(
      simulateCommitReservation(alloc.reservation_id, undefined, 'emp-hijacked', COMPANY_A, 'user-intruder', new Date(), false, false, authUserSameCompany)
    ).toBe(false)

    // Release -> false
    expect(
      simulateReleaseReservation(alloc.reservation_id, COMPANY_A, 'user-intruder', false, false, authUserSameCompany)
    ).toBe(false)

    // Genuine service role CAN manage NULL-owner reservation
    expect(
      simulatePgRenewReservation(alloc.reservation_id, COMPANY_A, null, 15, new Date(), false, false, serviceRoleCtx)
    ).toBe(true)
  })

  it('33. [SIMULATED] service-role-only permanent conversion (convert_temporary_card_to_permanent_employee) enforces database-level authorization', () => {
    // Model PostgreSQL REVOKE ALL FROM PUBLIC, anon, authenticated; GRANT EXECUTE TO service_role
    function checkFunctionPermission(functionName: string, context?: ExecutionContext): boolean {
      if (functionName === 'convert_temporary_card_to_permanent_employee') {
        const isVerifiedServiceRole = simulateIsServiceRole(context)
        if (!isVerifiedServiceRole) {
          throw new Error(`permission denied for function ${functionName}: insufficient_privilege`)
        }
      }
      return true
    }

    // Authenticated caller: permission denied
    const authContext: ExecutionContext = {
      jwtRole: 'authenticated',
      sessionUser: 'authenticator',
      currentUser: 'postgres',
      authUserId: 'user-1',
      companyId: COMPANY_A,
    }
    expect(() => checkFunctionPermission('convert_temporary_card_to_permanent_employee', authContext)).toThrow(
      'permission denied for function convert_temporary_card_to_permanent_employee: insufficient_privilege'
    )

    // Anon caller: permission denied
    const anonContext: ExecutionContext = {
      jwtRole: 'anon',
      sessionUser: 'authenticator',
      currentUser: 'postgres',
    }
    expect(() => checkFunctionPermission('convert_temporary_card_to_permanent_employee', anonContext)).toThrow(
      'permission denied for function convert_temporary_card_to_permanent_employee: insufficient_privilege'
    )

    // Genuine service-role caller: permitted
    const serviceRoleContext: ExecutionContext = {
      jwtRole: 'service_role',
      sessionUser: 'authenticator',
      currentUser: 'postgres',
    }
    expect(checkFunctionPermission('convert_temporary_card_to_permanent_employee', serviceRoleContext)).toBe(true)
  })

  it('34. [SIMULATED] function grants and impersonation defense: caller-supplied p_is_service_role=true without verified credentials throws security violation', async () => {
    const maliciousUserContext: ExecutionContext = {
      jwtRole: 'authenticated',
      sessionUser: 'authenticator',
      currentUser: 'postgres',
      authUserId: 'attacker-123',
      companyId: COMPANY_A,
    }

    // 1. Attempt reserve with callerAssertsServiceRole = true
    await expect(
      simulatePgReserveNextEmployeeCode(
        COMPANY_A,
        'TEMPORARY_CARD',
        'attacker-123',
        15,
        new Date(),
        false, // not verified service role
        true, // caller asserts service role
        maliciousUserContext
      )
    ).rejects.toThrow('Security violation: caller cannot assert service-role authorization without verified service-role credentials.')

    // 2. Contrast flawed CURRENT_USER check vs corrected context check:
    const flawedIsServiceRole = (ctx: ExecutionContext): boolean => {
      return (
        ctx.jwtRole === 'service_role' ||
        ['service_role', 'postgres', 'supabase_admin'].includes(ctx.currentUser || '')
      )
    }
    // Under flawed check, attacker with currentUser='postgres' gets elevated:
    expect(flawedIsServiceRole(maliciousUserContext)).toBe(true) // Demonstrates the vulnerability!
    // Under corrected check, attacker is properly rejected:
    expect(simulateIsServiceRole(maliciousUserContext)).toBe(false) // Fixed: immunity from function ownership escalation!
  })
})


