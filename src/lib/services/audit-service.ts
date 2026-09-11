import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Haryak Technologies India Private Limited — Audit Service
 * 
 * Append-only audit trail for all sensitive operations.
 * Tracks who, what, when, previous/new values.
 */

export interface AuditEntry {
  companyId: string
  userId: string
  userEmail: string
  userName: string
  action: AuditAction
  entityType: AuditEntityType
  entityId?: string
  entityName?: string
  previousValue?: Record<string, unknown>
  newValue?: Record<string, unknown>
  description: string
  reason?: string
  ipAddress?: string
  userAgent?: string
}

export type AuditAction =
  | 'created'
  | 'updated'
  | 'deleted'
  | 'viewed'
  | 'downloaded'
  | 'approved'
  | 'rejected'
  | 'locked'
  | 'unlocked'
  | 'generated'
  | 'revealed'
  | 'login'
  | 'logout'
  | 'exported'
  | 'imported'
  | 'activated'
  | 'deactivated'
  | 'recalculated'

export type AuditEntityType =
  | 'employee'
  | 'salary_structure'
  | 'salary_revision'
  | 'payroll_run'
  | 'payslip'
  | 'leave_request'
  | 'attendance'
  | 'document'
  | 'bank_account'
  | 'statutory_details'
  | 'user'
  | 'role'
  | 'settings'
  | 'timesheet'
  | 'announcement'
  | 'department'
  | 'designation'
  | 'ai_assistant'

/**
 * Create an audit log entry. In production, this writes to the audit_logs table.
 * For now, provides the structure and console logging for development.
 */
export async function createAuditLog(entry: AuditEntry): Promise<void> {
  const auditRecord = {
    ...entry,
    created_at: new Date().toISOString(),
    id: crypto.randomUUID(),
  }

  // In development, log to console
  if (process.env.NODE_ENV === 'development') {
    console.log('[AUDIT]', {
      action: auditRecord.action,
      entity: `${auditRecord.entityType}:${auditRecord.entityId}`,
      user: auditRecord.userEmail,
      description: auditRecord.description,
      timestamp: auditRecord.created_at,
    })
  }

  try {
    const supabase = createAdminClient()
    if (supabase) {
      const isUUID = entry.entityId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(entry.entityId)
      await supabase.from('audit_logs').insert({
        company_id: entry.companyId,
        user_id: entry.userId,
        user_email: entry.userEmail,
        user_name: entry.userName,
        action: entry.action,
        entity_type: entry.entityType,
        entity_id: isUUID ? entry.entityId : null,
        entity_name: entry.entityName || (isUUID ? null : entry.entityId) || null,
        previous_value: entry.previousValue || null,
        new_value: entry.newValue || null,
        description: entry.description,
        reason: entry.reason || null,
        ip_address: entry.ipAddress || null,
        user_agent: entry.userAgent || null,
      })
    }
  } catch (error: any) {
    console.error('[AUDIT] Error creating audit log:', error)
  }
}

/**
 * Build a diff of changed fields between old and new objects.
 * Useful for audit logging updates.
 */
export function buildAuditDiff(
  oldObj: Record<string, unknown>,
  newObj: Record<string, unknown>,
  sensitiveFields: string[] = ['pan', 'account_number', 'password']
): { previousValue: Record<string, unknown>; newValue: Record<string, unknown> } {
  const previousValue: Record<string, unknown> = {}
  const newValue: Record<string, unknown> = {}

  for (const key of Object.keys(newObj)) {
    if (oldObj[key] !== newObj[key]) {
      if (sensitiveFields.includes(key)) {
        previousValue[key] = '[REDACTED]'
        newValue[key] = '[REDACTED]'
      } else {
        previousValue[key] = oldObj[key]
        newValue[key] = newObj[key]
      }
    }
  }

  return { previousValue, newValue }
}

/**
 * Generate human-readable audit description.
 */
export function generateAuditDescription(
  action: AuditAction,
  entityType: AuditEntityType,
  entityName?: string
): string {
  const actionLabels: Record<AuditAction, string> = {
    created: 'Created',
    updated: 'Updated',
    deleted: 'Deleted',
    viewed: 'Viewed',
    downloaded: 'Downloaded',
    approved: 'Approved',
    rejected: 'Rejected',
    locked: 'Locked',
    unlocked: 'Unlocked',
    generated: 'Generated',
    revealed: 'Revealed sensitive data for',
    login: 'Logged in',
    logout: 'Logged out',
    exported: 'Exported',
    imported: 'Imported',
    activated: 'Activated',
    deactivated: 'Deactivated',
    recalculated: 'Recalculated',
  }

  const entityLabels: Record<AuditEntityType, string> = {
    employee: 'employee',
    salary_structure: 'salary structure',
    salary_revision: 'salary revision',
    payroll_run: 'payroll run',
    payslip: 'payslip',
    leave_request: 'leave request',
    attendance: 'attendance record',
    document: 'document',
    bank_account: 'bank account',
    statutory_details: 'statutory details',
    user: 'user',
    role: 'role',
    settings: 'settings',
    timesheet: 'timesheet',
    announcement: 'announcement',
    department: 'department',
    designation: 'designation',
    ai_assistant: 'AI Assistant',
  }

  const actionLabel = actionLabels[action] || action
  const entityLabel = entityLabels[entityType] || entityType

  if (entityName) {
    return `${actionLabel} ${entityLabel}: ${entityName}`
  }
  return `${actionLabel} ${entityLabel}`
}
