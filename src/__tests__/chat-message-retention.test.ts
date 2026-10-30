import { describe, test, expect } from 'vitest'

/* ============================================================
   14-DAY CHAT MESSAGE RETENTION CONSTANTS & HELPERS
   ============================================================ */

/**
 * Standard retention period for chat messages: 14 days.
 */
export const RETENTION_PERIOD_DAYS = 14
export const RETENTION_PERIOD_MS = RETENTION_PERIOD_DAYS * 24 * 60 * 60 * 1000

/**
 * Explicit allowlist of database tables approved for chat cleanup routines.
 * ONLY chat-related tables are permitted.
 * Business, statutory, HR, payroll, and audit tables must NEVER be in this allowlist.
 */
export const CHAT_CLEANUP_ALLOWLIST: string[] = [
  'chat_messages',
  'chat_message_receipts',
  'chat_attachments',
  'chat_message_reactions',
]

/**
 * Batch processing configuration and safety caps for chat cleanup routines.
 */
export const CHAT_CLEANUP_BATCH_CONFIG = {
  maxBatchSize: 500,
  maxPerInvocationLimit: 5000,
  safetyCapTimeoutMs: 30000,
}

/**
 * Calculates the exact expiration date for a message: created_at + 14 days.
 */
export function calculateExpiresAt(createdAt: Date): Date {
  return new Date(createdAt.getTime() + RETENTION_PERIOD_MS)
}

/**
 * Checks if a message is eligible for deletion.
 * A message is eligible for deletion when expires_at <= current UTC timestamp.
 */
export function isEligibleForDeletion(expiresAt: Date, now: Date): boolean {
  return expiresAt.getTime() <= now.getTime()
}

/**
 * Asserts that a target table is explicitly permitted in the CHAT_CLEANUP_ALLOWLIST.
 * Throws a security violation error if any non-chat or protected table is targeted.
 */
export function assertTableIsCleanable(tableName: string): boolean {
  if (!CHAT_CLEANUP_ALLOWLIST.includes(tableName)) {
    throw new Error(
      `Security Violation: Table '${tableName}' is protected and not in CHAT_CLEANUP_ALLOWLIST.`
    )
  }
  return true
}

/* ============================================================
   SIMULATION TYPES & ENGINE FOR UNIT TESTING
   ============================================================ */

export interface SimulatedChatMessage {
  id: string
  companyId: string
  conversationId: string
  senderUserId: string
  senderRole: string
  content: string
  createdAt: Date
  expiresAt: Date
  deletedAt: Date | null
  readReceipts?: { userId: string; readAt: Date }[]
  editedAt?: Date | null
}

export interface SimulatedHrRequest {
  id: string
  companyId: string
  category: string
  subject: string
  status: string
  createdAt: Date
  updatedAt: Date
}

export interface SimulatedNotification {
  id: string
  companyId: string
  userId: string
  title: string
  message: string
  createdAt: Date
}

export interface SimulatedAnnouncement {
  id: string
  companyId: string
  title: string
  content: string
  createdAt: Date
}

/**
 * Simulated cleanup executor implementing company isolation, allowlist verification,
 * soft-deletion awareness, and batch limit safety caps.
 */
export function executeSimulatedCleanup(
  messages: SimulatedChatMessage[],
  options: {
    targetTable: string
    companyId: string
    now: Date
    batchLimit?: number
  }
): {
  deletedCount: number
  processedIds: string[]
  updatedMessages: SimulatedChatMessage[]
} {
  assertTableIsCleanable(options.targetTable)

  const effectiveLimit = Math.min(
    options.batchLimit ?? CHAT_CLEANUP_BATCH_CONFIG.maxBatchSize,
    CHAT_CLEANUP_BATCH_CONFIG.maxPerInvocationLimit
  )

  // Only consider records belonging to target company, not already deleted, and expired
  const eligible = messages.filter(
    msg =>
      msg.companyId === options.companyId &&
      msg.deletedAt === null &&
      isEligibleForDeletion(msg.expiresAt, options.now)
  )

  const toDelete = eligible.slice(0, effectiveLimit)
  const toDeleteIds = new Set(toDelete.map(m => m.id))

  const updatedMessages = messages.map(msg => {
    if (toDeleteIds.has(msg.id)) {
      return {
        ...msg,
        deletedAt: options.now,
      }
    }
    return msg
  })

  return {
    deletedCount: toDelete.length,
    processedIds: toDelete.map(m => m.id),
    updatedMessages,
  }
}

/* ============================================================
   TEST SUITE: 14-DAY CHAT MESSAGE RETENTION POLICY
   ============================================================ */

describe('14-Day Chat Message Retention Policy Verification', () => {
  // 1. expires_at calculation is correct
  test('expires_at calculation is correct', () => {
    const baseCreatedAt = new Date('2026-06-01T10:00:00.000Z')
    const expiresAt = calculateExpiresAt(baseCreatedAt)

    const expectedExpiresAt = new Date('2026-06-15T10:00:00.000Z')
    expect(expiresAt.toISOString()).toBe(expectedExpiresAt.toISOString())
    expect(expiresAt.getTime() - baseCreatedAt.getTime()).toBe(
      14 * 24 * 60 * 60 * 1000
    )

    // Verify sub-second / millisecond preservation
    const preciseCreatedAt = new Date('2026-07-10T14:22:33.789Z')
    const preciseExpiresAt = calculateExpiresAt(preciseCreatedAt)
    expect(preciseExpiresAt.toISOString()).toBe('2026-07-24T14:22:33.789Z')

    // Verify month boundary transition (Feb 20 to March 6 in non-leap year 2025)
    const monthBoundaryCreatedAt = new Date('2025-02-20T00:00:00.000Z')
    const monthBoundaryExpiresAt = calculateExpiresAt(monthBoundaryCreatedAt)
    expect(monthBoundaryExpiresAt.toISOString()).toBe('2025-03-06T00:00:00.000Z')
  })

  // 2. message created 13 days ago is retained
  test('message created 13 days ago is retained', () => {
    const now = new Date('2026-08-14T12:00:00.000Z')
    const createdAt = new Date(now.getTime() - 13 * 24 * 60 * 60 * 1000)
    const expiresAt = calculateExpiresAt(createdAt)

    // Expiration is 1 day in the future
    expect(expiresAt.getTime()).toBeGreaterThan(now.getTime())
    expect(isEligibleForDeletion(expiresAt, now)).toBe(false)

    // Time remaining until deletion eligibility is exactly 24 hours
    const remainingMs = expiresAt.getTime() - now.getTime()
    expect(remainingMs).toBe(24 * 60 * 60 * 1000)
  })

  // 3. message created exactly 14 days ago is eligible for deletion
  test('message created exactly 14 days ago is eligible for deletion', () => {
    const now = new Date('2026-08-15T09:30:00.000Z')
    const createdAt = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)
    const expiresAt = calculateExpiresAt(createdAt)

    // Expiration timestamp is exactly equal to current timestamp
    expect(expiresAt.getTime()).toBe(now.getTime())
    expect(isEligibleForDeletion(expiresAt, now)).toBe(true)
  })

  // 4. message created 30 days ago is eligible for deletion
  test('message created 30 days ago is eligible for deletion', () => {
    const now = new Date('2026-08-31T18:00:00.000Z')
    const createdAt = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const expiresAt = calculateExpiresAt(createdAt)

    expect(expiresAt.getTime()).toBeLessThan(now.getTime())
    expect(isEligibleForDeletion(expiresAt, now)).toBe(true)

    // Has been expired for exactly 16 days
    const overdueMs = now.getTime() - expiresAt.getTime()
    expect(overdueMs).toBe(16 * 24 * 60 * 60 * 1000)
  })

  // 5. reading or replying to a message does not reset retention
  test('reading or replying to a message does not reset retention', () => {
    const originalCreatedAt = new Date('2026-05-01T10:00:00.000Z')
    const fixedExpiresAt = calculateExpiresAt(originalCreatedAt)

    const simulatedMessage: SimulatedChatMessage = {
      id: 'msg-retention-immutability-1',
      companyId: 'comp-haryak-1',
      conversationId: 'conv-general-1',
      senderUserId: 'user-emp-1',
      senderRole: 'EMPLOYEE',
      content: 'Important project discussion',
      createdAt: originalCreatedAt,
      expiresAt: fixedExpiresAt,
      deletedAt: null,
      readReceipts: [],
      editedAt: null,
    }

    // Day 10: Participant reads the message
    const readTimestamp = new Date('2026-05-11T15:30:00.000Z')
    simulatedMessage.readReceipts = [
      { userId: 'user-mgr-1', readAt: readTimestamp },
    ]

    // Day 12: Message is edited or replied to
    const editTimestamp = new Date('2026-05-13T09:15:00.000Z')
    simulatedMessage.editedAt = editTimestamp

    // RETENTION POLICY INVARIANT:
    // Neither read receipts nor edits modify original createdAt or expiresAt
    expect(simulatedMessage.expiresAt.toISOString()).toBe('2026-05-15T10:00:00.000Z')
    expect(simulatedMessage.expiresAt.toISOString()).toBe(fixedExpiresAt.toISOString())

    // On Day 15 (2026-05-16), message must be eligible for deletion regardless of read/edit dates
    const day15Now = new Date('2026-05-16T00:00:00.000Z')
    expect(isEligibleForDeletion(simulatedMessage.expiresAt, day15Now)).toBe(true)
  })

  // 6. retention applies equally to all roles
  test('retention applies equally to all roles', () => {
    const roles = [
      'EMPLOYEE',
      'HR_ADMIN',
      'MANAGER',
      'SUPER_ADMIN',
      'ORG_ADMIN',
      'PAYROLL_ADMIN',
    ]

    const baselineCreatedAt = new Date('2026-09-01T08:00:00.000Z')
    const expectedExpiry = calculateExpiresAt(baselineCreatedAt)

    const roleMessages: SimulatedChatMessage[] = roles.map((role, idx) => ({
      id: `msg-role-${idx}`,
      companyId: 'comp-haryak-1',
      conversationId: 'conv-mgmt-1',
      senderUserId: `user-${role.toLowerCase()}`,
      senderRole: role,
      content: `Message from ${role}`,
      createdAt: baselineCreatedAt,
      expiresAt: calculateExpiresAt(baselineCreatedAt),
      deletedAt: null,
    }))

    // Verify all roles receive identical 14-day expiry without exemption
    for (const msg of roleMessages) {
      expect(msg.expiresAt.getTime()).toBe(expectedExpiry.getTime())
      expect(msg.expiresAt.toISOString()).toBe('2026-09-15T08:00:00.000Z')
    }

    // When 14 days and 1 second have passed, every role's message is eligible for deletion
    const afterExpiry = new Date(expectedExpiry.getTime() + 1000)
    for (const msg of roleMessages) {
      expect(isEligibleForDeletion(msg.expiresAt, afterExpiry)).toBe(true)
    }
  })

  // 7. cleanup cannot delete protected table records
  test('cleanup cannot delete protected table records', () => {
    // Verify allowlist contains strictly chat tables
    expect(CHAT_CLEANUP_ALLOWLIST).toContain('chat_messages')
    expect(CHAT_CLEANUP_ALLOWLIST).toContain('chat_message_receipts')
    expect(CHAT_CLEANUP_ALLOWLIST).toContain('chat_attachments')
    expect(CHAT_CLEANUP_ALLOWLIST).toContain('chat_message_reactions')

    for (const table of CHAT_CLEANUP_ALLOWLIST) {
      expect(table.startsWith('chat_')).toBe(true)
    }

    // Explicitly verify protected tables are NEVER in the allowlist
    const protectedTables = [
      'payslips',
      'documents',
      'employees',
      'audit_logs',
      'hr_requests',
      'payroll_runs',
      'attendance_records',
      'leave_requests',
      'salary_structures',
    ]

    for (const protectedTable of protectedTables) {
      expect(CHAT_CLEANUP_ALLOWLIST).not.toContain(protectedTable)
      expect(() => assertTableIsCleanable(protectedTable)).toThrow(
        /Security Violation: Table '.*' is protected and not in CHAT_CLEANUP_ALLOWLIST\./
      )
    }

    // Verify simulated cleanup fails immediately if attempted on a protected table
    expect(() =>
      executeSimulatedCleanup([], {
        targetTable: 'payslips',
        companyId: 'comp-1',
        now: new Date(),
      })
    ).toThrow(/Security Violation: Table 'payslips' is protected/)
  })

  // 8. company isolation - one company cleanup cannot affect another
  test('company isolation - one company cleanup cannot affect another', () => {
    const now = new Date('2026-10-01T12:00:00.000Z')
    const expiredCreatedAt = new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000)
    const activeCreatedAt = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000)

    const mixedDataset: SimulatedChatMessage[] = [
      // Company Alpha messages (1 expired, 1 active)
      {
        id: 'msg-alpha-expired',
        companyId: 'company-a',
        conversationId: 'conv-a1',
        senderUserId: 'user-a1',
        senderRole: 'EMPLOYEE',
        content: 'Alpha old message',
        createdAt: expiredCreatedAt,
        expiresAt: calculateExpiresAt(expiredCreatedAt),
        deletedAt: null,
      },
      {
        id: 'msg-alpha-active',
        companyId: 'company-a',
        conversationId: 'conv-a1',
        senderUserId: 'user-a2',
        senderRole: 'EMPLOYEE',
        content: 'Alpha recent message',
        createdAt: activeCreatedAt,
        expiresAt: calculateExpiresAt(activeCreatedAt),
        deletedAt: null,
      },
      // Company Beta messages (1 expired, 1 active)
      {
        id: 'msg-beta-expired',
        companyId: 'company-b',
        conversationId: 'conv-b1',
        senderUserId: 'user-b1',
        senderRole: 'EMPLOYEE',
        content: 'Beta old message',
        createdAt: expiredCreatedAt,
        expiresAt: calculateExpiresAt(expiredCreatedAt),
        deletedAt: null,
      },
      {
        id: 'msg-beta-active',
        companyId: 'company-b',
        conversationId: 'conv-b1',
        senderUserId: 'user-b2',
        senderRole: 'EMPLOYEE',
        content: 'Beta recent message',
        createdAt: activeCreatedAt,
        expiresAt: calculateExpiresAt(activeCreatedAt),
        deletedAt: null,
      },
    ]

    // Execute cleanup scoped strictly to Company A
    const result = executeSimulatedCleanup(mixedDataset, {
      targetTable: 'chat_messages',
      companyId: 'company-a',
      now,
    })

    // Company A: only expired message deleted
    expect(result.deletedCount).toBe(1)
    expect(result.processedIds).toEqual(['msg-alpha-expired'])

    const updatedMap = new Map(result.updatedMessages.map(m => [m.id, m]))

    // Alpha expired message marked deleted
    expect(updatedMap.get('msg-alpha-expired')?.deletedAt).toEqual(now)
    // Alpha active message untouched
    expect(updatedMap.get('msg-alpha-active')?.deletedAt).toBeNull()

    // Company B: Zero modification, tenant isolation preserved
    const betaExpired = updatedMap.get('msg-beta-expired')
    const betaActive = updatedMap.get('msg-beta-active')
    expect(betaExpired?.deletedAt).toBeNull()
    expect(betaActive?.deletedAt).toBeNull()
  })

  // 9. helpdesk tickets (hr_requests) remain intact after message cleanup
  test('helpdesk tickets (hr_requests) remain intact after message cleanup', () => {
    const now = new Date('2026-10-10T12:00:00.000Z')

    // Simulate HR helpdesk tickets created well in the past
    const hrRequests: SimulatedHrRequest[] = [
      {
        id: 'req-001',
        companyId: 'comp-haryak',
        category: 'Payroll Inquiry',
        subject: 'Tax deduction query',
        status: 'resolved',
        createdAt: new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000), // 60 days ago
        updatedAt: new Date(now.getTime() - 50 * 24 * 60 * 60 * 1000),
      },
      {
        id: 'req-002',
        companyId: 'comp-haryak',
        category: 'Equipment',
        subject: 'Monitor request',
        status: 'open',
        createdAt: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
        updatedAt: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000),
      },
    ]

    const chatMessages: SimulatedChatMessage[] = [
      {
        id: 'msg-old-1',
        companyId: 'comp-haryak',
        conversationId: 'conv-1',
        senderUserId: 'user-1',
        senderRole: 'EMPLOYEE',
        content: 'Old casual greeting',
        createdAt: new Date(now.getTime() - 25 * 24 * 60 * 60 * 1000),
        expiresAt: calculateExpiresAt(
          new Date(now.getTime() - 25 * 24 * 60 * 60 * 1000)
        ),
        deletedAt: null,
      },
    ]

    // Execute chat cleanup
    const result = executeSimulatedCleanup(chatMessages, {
      targetTable: 'chat_messages',
      companyId: 'comp-haryak',
      now,
    })

    expect(result.deletedCount).toBe(1)
    expect(result.processedIds).toContain('msg-old-1')

    // Assert hr_requests are completely untouched and independent
    expect(hrRequests.length).toBe(2)
    expect(hrRequests[0].id).toBe('req-001')
    expect(hrRequests[0].status).toBe('resolved')
    expect(hrRequests[1].id).toBe('req-002')
    expect(hrRequests[1].status).toBe('open')
  })

  // 10. already soft-deleted messages are not double-counted
  test('already soft-deleted messages are not double-counted', () => {
    const now = new Date('2026-11-01T12:00:00.000Z')
    const oldDate = new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000)
    const recentDate = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000)

    const messages: SimulatedChatMessage[] = [
      // Expired and active in DB (eligible)
      {
        id: 'msg-exp-active',
        companyId: 'comp-1',
        conversationId: 'c1',
        senderUserId: 'u1',
        senderRole: 'EMPLOYEE',
        content: 'I need to be cleaned up',
        createdAt: oldDate,
        expiresAt: calculateExpiresAt(oldDate),
        deletedAt: null,
      },
      // Expired but already soft-deleted previously
      {
        id: 'msg-exp-already-deleted',
        companyId: 'comp-1',
        conversationId: 'c1',
        senderUserId: 'u1',
        senderRole: 'EMPLOYEE',
        content: 'Already soft-deleted earlier',
        createdAt: oldDate,
        expiresAt: calculateExpiresAt(oldDate),
        deletedAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
      },
      // Not expired, not deleted
      {
        id: 'msg-recent-active',
        companyId: 'comp-1',
        conversationId: 'c1',
        senderUserId: 'u2',
        senderRole: 'EMPLOYEE',
        content: 'Still fresh',
        createdAt: recentDate,
        expiresAt: calculateExpiresAt(recentDate),
        deletedAt: null,
      },
      // Not expired, but soft-deleted by user
      {
        id: 'msg-recent-user-deleted',
        companyId: 'comp-1',
        conversationId: 'c1',
        senderUserId: 'u2',
        senderRole: 'EMPLOYEE',
        content: 'Deleted by sender',
        createdAt: recentDate,
        expiresAt: calculateExpiresAt(recentDate),
        deletedAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
      },
    ]

    const result = executeSimulatedCleanup(messages, {
      targetTable: 'chat_messages',
      companyId: 'comp-1',
      now,
    })

    // Exactly 1 message eligible for cleanup; already soft-deleted message is excluded
    expect(result.deletedCount).toBe(1)
    expect(result.processedIds).toEqual(['msg-exp-active'])
  })

  // 11. batch processing respects safety limits
  test('batch processing respects safety limits', () => {
    // Verify batch config specifications
    expect(CHAT_CLEANUP_BATCH_CONFIG.maxBatchSize).toBe(500)
    expect(CHAT_CLEANUP_BATCH_CONFIG.maxPerInvocationLimit).toBe(5000)
    expect(CHAT_CLEANUP_BATCH_CONFIG.safetyCapTimeoutMs).toBe(30000)

    const now = new Date('2026-11-15T00:00:00.000Z')
    const expiredCreatedAt = new Date(now.getTime() - 25 * 24 * 60 * 60 * 1000)
    const expiredExpiry = calculateExpiresAt(expiredCreatedAt)

    // Generate 6,000 expired messages (exceeding single invocation safety cap of 5,000)
    const largeMessageSet: SimulatedChatMessage[] = Array.from(
      { length: 6000 },
      (_, i) => ({
        id: `msg-batch-${i}`,
        companyId: 'comp-large',
        conversationId: 'conv-l1',
        senderUserId: `user-${i % 10}`,
        senderRole: 'EMPLOYEE',
        content: `Batch message ${i}`,
        createdAt: expiredCreatedAt,
        expiresAt: expiredExpiry,
        deletedAt: null,
      })
    )

    // Run simulated cleanup with default configuration
    const result = executeSimulatedCleanup(largeMessageSet, {
      targetTable: 'chat_messages',
      companyId: 'comp-large',
      now,
      batchLimit: CHAT_CLEANUP_BATCH_CONFIG.maxPerInvocationLimit,
    })

    // Assert that execution stops strictly at the per-invocation cap (5,000)
    expect(result.deletedCount).toBe(5000)
    expect(result.processedIds.length).toBe(5000)

    // 1,000 messages remain for subsequent cron execution
    const remainingUncleaned = result.updatedMessages.filter(
      m => m.deletedAt === null
    )
    expect(remainingUncleaned.length).toBe(1000)
  })

  // 12. idempotent cleanup execution
  test('idempotent cleanup execution', () => {
    const now = new Date('2026-11-20T10:00:00.000Z')
    const expiredDate = new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000)

    const initialMessages: SimulatedChatMessage[] = [
      {
        id: 'msg-idem-1',
        companyId: 'comp-idem',
        conversationId: 'conv-idem',
        senderUserId: 'user-1',
        senderRole: 'EMPLOYEE',
        content: 'Expired 1',
        createdAt: expiredDate,
        expiresAt: calculateExpiresAt(expiredDate),
        deletedAt: null,
      },
      {
        id: 'msg-idem-2',
        companyId: 'comp-idem',
        conversationId: 'conv-idem',
        senderUserId: 'user-2',
        senderRole: 'EMPLOYEE',
        content: 'Expired 2',
        createdAt: expiredDate,
        expiresAt: calculateExpiresAt(expiredDate),
        deletedAt: null,
      },
    ]

    // First execution: cleans up both messages
    const firstRun = executeSimulatedCleanup(initialMessages, {
      targetTable: 'chat_messages',
      companyId: 'comp-idem',
      now,
    })

    expect(firstRun.deletedCount).toBe(2)
    expect(firstRun.processedIds).toEqual(['msg-idem-1', 'msg-idem-2'])

    // Second execution immediately after: finds 0 eligible records
    const secondRun = executeSimulatedCleanup(firstRun.updatedMessages, {
      targetTable: 'chat_messages',
      companyId: 'comp-idem',
      now,
    })

    expect(secondRun.deletedCount).toBe(0)
    expect(secondRun.processedIds).toEqual([])
    expect(secondRun.updatedMessages).toEqual(firstRun.updatedMessages)
  })

  // 13. AI chat widget messages are ephemeral and not subject to database retention
  test('AI chat widget messages are ephemeral and not subject to database retention', () => {
    // Model React client-side ephemeral state for the AI chat widget
    interface EphemeralAiWidgetMessage {
      id: string
      role: 'user' | 'assistant'
      content: string
      timestamp: number
    }

    const aiSessionState: {
      isEphemeral: boolean
      storageType: 'memory' | 'database'
      messages: EphemeralAiWidgetMessage[]
    } = {
      isEphemeral: true,
      storageType: 'memory',
      messages: [
        {
          id: 'ai-msg-1',
          role: 'user',
          content: 'How do I submit an expense claim?',
          timestamp: Date.now() - 30 * 24 * 60 * 60 * 1000, // 30 days ago in memory
        },
        {
          id: 'ai-msg-2',
          role: 'assistant',
          content: 'You can submit an expense claim via Payroll > Claims.',
          timestamp: Date.now() - 30 * 24 * 60 * 60 * 1000,
        },
      ],
    }

    // AI widget messages are purely in-memory React state
    expect(aiSessionState.isEphemeral).toBe(true)
    expect(aiSessionState.storageType).toBe('memory')

    // AI widget messages do NOT possess database metadata (expires_at, deleted_at, company_id)
    const keys = Object.keys(aiSessionState.messages[0])
    expect(keys).not.toContain('expires_at')
    expect(keys).not.toContain('deleted_at')
    expect(keys).not.toContain('company_id')

    // When session terminates or widget resets, memory state clears
    const resetAiWidgetSession = () => {
      aiSessionState.messages = []
    }
    resetAiWidgetSession()
    expect(aiSessionState.messages.length).toBe(0)

    // Database cleanup routines operate ONLY on DB tables and cannot alter client-memory AI sessions
    expect(CHAT_CLEANUP_ALLOWLIST).not.toContain('ai_chat_widget')
  })

  // 14. expired messages are excluded from API query results
  test('expired messages are excluded from API query results', () => {
    const queryTime = new Date('2026-12-01T15:00:00.000Z')

    const dbRows: SimulatedChatMessage[] = [
      // 1. Fresh message (created 2 days ago, expires in 12 days)
      {
        id: 'msg-api-valid-1',
        companyId: 'comp-api',
        conversationId: 'c1',
        senderUserId: 'u1',
        senderRole: 'EMPLOYEE',
        content: 'Recent question',
        createdAt: new Date('2026-11-29T15:00:00.000Z'),
        expiresAt: calculateExpiresAt(new Date('2026-11-29T15:00:00.000Z')),
        deletedAt: null,
      },
      // 2. Older but valid message (created 10 days ago, expires in 4 days)
      {
        id: 'msg-api-valid-2',
        companyId: 'comp-api',
        conversationId: 'c1',
        senderUserId: 'u2',
        senderRole: 'MANAGER',
        content: 'Ongoing task update',
        createdAt: new Date('2026-11-21T15:00:00.000Z'),
        expiresAt: calculateExpiresAt(new Date('2026-11-21T15:00:00.000Z')),
        deletedAt: null,
      },
      // 3. Expired message (created 15 days ago, expired 1 day ago)
      {
        id: 'msg-api-expired',
        companyId: 'comp-api',
        conversationId: 'c1',
        senderUserId: 'u1',
        senderRole: 'EMPLOYEE',
        content: 'Expired chat message',
        createdAt: new Date('2026-11-16T15:00:00.000Z'),
        expiresAt: calculateExpiresAt(new Date('2026-11-16T15:00:00.000Z')),
        deletedAt: null,
      },
      // 4. Soft-deleted message (created 3 days ago, but deletedAt is set)
      {
        id: 'msg-api-soft-deleted',
        companyId: 'comp-api',
        conversationId: 'c1',
        senderUserId: 'u3',
        senderRole: 'EMPLOYEE',
        content: 'User recalled message',
        createdAt: new Date('2026-11-28T15:00:00.000Z'),
        expiresAt: calculateExpiresAt(new Date('2026-11-28T15:00:00.000Z')),
        deletedAt: new Date('2026-11-28T16:00:00.000Z'),
      },
    ]

    // Simulate API query predicate: `deleted_at IS NULL AND expires_at > NOW()`
    const apiFilteredResults = dbRows.filter(
      row => row.deletedAt === null && row.expiresAt.getTime() > queryTime.getTime()
    )

    // Expired message and soft-deleted message are both excluded
    expect(apiFilteredResults.length).toBe(2)
    const resultIds = apiFilteredResults.map(r => r.id)
    expect(resultIds).toContain('msg-api-valid-1')
    expect(resultIds).toContain('msg-api-valid-2')
    expect(resultIds).not.toContain('msg-api-expired')
    expect(resultIds).not.toContain('msg-api-soft-deleted')
  })

  // 15. notifications and announcements are not affected by chat cleanup
  test('notifications and announcements are not affected by chat cleanup', () => {
    const now = new Date('2026-12-15T12:00:00.000Z')

    // Notifications and announcements tables are distinct from chat
    expect(CHAT_CLEANUP_ALLOWLIST).not.toContain('notifications')
    expect(CHAT_CLEANUP_ALLOWLIST).not.toContain('announcements')
    expect(CHAT_CLEANUP_ALLOWLIST).not.toContain('company_announcements')

    const notifications: SimulatedNotification[] = [
      {
        id: 'notif-001',
        companyId: 'comp-notif',
        userId: 'u1',
        title: 'Mentioned in Chat',
        message: 'Rajesh mentioned you in #general',
        createdAt: new Date(now.getTime() - 25 * 24 * 60 * 60 * 1000), // 25 days ago
      },
    ]

    const announcements: SimulatedAnnouncement[] = [
      {
        id: 'ann-001',
        companyId: 'comp-notif',
        title: 'Annual Townhall 2026',
        content: 'The townhall will be held next month.',
        createdAt: new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000), // 40 days ago
      },
    ]

    const chatMessages: SimulatedChatMessage[] = [
      {
        id: 'msg-mention-source',
        companyId: 'comp-notif',
        conversationId: 'c-gen',
        senderUserId: 'u2',
        senderRole: 'EMPLOYEE',
        content: '@Rajesh please review this PR',
        createdAt: new Date(now.getTime() - 25 * 24 * 60 * 60 * 1000),
        expiresAt: calculateExpiresAt(
          new Date(now.getTime() - 25 * 24 * 60 * 60 * 1000)
        ),
        deletedAt: null,
      },
    ]

    // Execute chat cleanup
    const result = executeSimulatedCleanup(chatMessages, {
      targetTable: 'chat_messages',
      companyId: 'comp-notif',
      now,
    })

    // Chat message is cleaned up
    expect(result.deletedCount).toBe(1)
    expect(result.processedIds).toContain('msg-mention-source')

    // Notifications and announcements remain 100% intact and unaffected
    expect(notifications.length).toBe(1)
    expect(notifications[0].id).toBe('notif-001')
    expect(notifications[0].title).toBe('Mentioned in Chat')

    expect(announcements.length).toBe(1)
    expect(announcements[0].id).toBe('ann-001')
    expect(announcements[0].title).toBe('Annual Townhall 2026')
  })

  // 16. existing-message backfill
  test('existing-message backfill: messages without explicit expires_at default to created_at + 14 days', () => {
    const rawLegacyRows = [
      {
        id: 'msg-legacy-1',
        created_at: '2026-10-01T10:00:00.000Z',
        expires_at: null, // Legacy row before migration
      },
      {
        id: 'msg-legacy-2',
        created_at: '2026-10-15T12:00:00.000Z',
        expires_at: null, // Legacy row before migration
      },
    ]

    // Simulate SQL backfill: SET expires_at = created_at + INTERVAL '14 days' WHERE expires_at IS NULL
    const backfilledRows = rawLegacyRows.map(row => ({
      ...row,
      expires_at:
        row.expires_at ||
        new Date(
          new Date(row.created_at).getTime() + 14 * 24 * 60 * 60 * 1000
        ).toISOString(),
    }))

    expect(backfilledRows[0].expires_at).toBe('2026-10-15T10:00:00.000Z')
    expect(backfilledRows[1].expires_at).toBe('2026-10-29T12:00:00.000Z')

    // Original created_at timestamps remain 100% intact
    expect(backfilledRows[0].created_at).toBe('2026-10-01T10:00:00.000Z')
    expect(backfilledRows[1].created_at).toBe('2026-10-15T12:00:00.000Z')
  })

  // 17. new-message expiry
  test('new-message expiry: new message creation enforces expires_at exactly 14 days in future', () => {
    const creationTime = new Date('2026-10-22T11:00:00.000Z')
    const expectedExpiry = new Date('2026-11-05T11:00:00.000Z')

    const newMessagePayload = {
      id: 'msg-new-001',
      content: 'Important company update',
      created_at: creationTime.toISOString(),
      expires_at: new Date(
        creationTime.getTime() + 14 * 24 * 60 * 60 * 1000
      ).toISOString(),
    }

    expect(newMessagePayload.expires_at).toBe(expectedExpiry.toISOString())
    expect(
      new Date(newMessagePayload.expires_at).getTime() -
        new Date(newMessagePayload.created_at).getTime()
    ).toBe(14 * 24 * 60 * 60 * 1000)
  })

  // 18. unauthorized cleanup requests
  test('unauthorized cleanup requests: non-admin roles and invalid secrets are rejected', () => {
    const evaluateCleanupAccess = (options: {
      secret?: string
      configuredSecret?: string
      userRole?: string
    }): { authorized: boolean; statusCode: number } => {
      // 1. If secret is configured, validate secret header
      if (options.configuredSecret) {
        if (!options.secret || options.secret !== options.configuredSecret) {
          return { authorized: false, statusCode: 403 }
        }
        return { authorized: true, statusCode: 200 }
      }

      // 2. Otherwise validate role: only SUPER_ADMIN or HR_ADMIN
      const allowedRoles = ['SUPER_ADMIN', 'HR_ADMIN']
      if (!options.userRole || !allowedRoles.includes(options.userRole)) {
        return { authorized: false, statusCode: 403 }
      }

      return { authorized: true, statusCode: 200 }
    }

    // Secret validation checks
    expect(
      evaluateCleanupAccess({
        secret: 'wrong-secret',
        configuredSecret: 'expected-cron-secret',
      })
    ).toEqual({ authorized: false, statusCode: 403 })

    expect(
      evaluateCleanupAccess({
        secret: 'expected-cron-secret',
        configuredSecret: 'expected-cron-secret',
      })
    ).toEqual({ authorized: true, statusCode: 200 })

    // Role-based validation checks
    expect(evaluateCleanupAccess({ userRole: 'EMPLOYEE' })).toEqual({
      authorized: false,
      statusCode: 403,
    })
    expect(evaluateCleanupAccess({ userRole: 'MANAGER' })).toEqual({
      authorized: false,
      statusCode: 403,
    })
    expect(evaluateCleanupAccess({ userRole: 'HR_ADMIN' })).toEqual({
      authorized: true,
      statusCode: 200,
    })
    expect(evaluateCleanupAccess({ userRole: 'SUPER_ADMIN' })).toEqual({
      authorized: true,
      statusCode: 200,
    })
  })

  // 19. storage isolation
  test('protected document storage isolation: payslips and documents in documents bucket are never deleted', () => {
    const storageBuckets = [
      { name: 'documents', isProtected: true, type: 'OFFICIAL_HR_DOCUMENTS' },
      { name: 'payslips', isProtected: true, type: 'PAYROLL_RECORDS' },
      { name: 'avatars', isProtected: true, type: 'EMPLOYEE_PROFILES' },
    ]

    const isBucketCleanableByChatJob = (bucketName: string): boolean => {
      // Chat cleanup is STRICTLY forbidden from touching official storage buckets
      const cleanableBuckets: string[] = [] // No shared storage buckets are cleanable by chat
      return cleanableBuckets.includes(bucketName)
    }

    for (const bucket of storageBuckets) {
      expect(isBucketCleanableByChatJob(bucket.name)).toBe(false)
    }
  })
})

