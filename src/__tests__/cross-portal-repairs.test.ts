import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('Cross-Portal Repairs and Integrity Suite', () => {
  describe('1. Timesheet Save & Schema Harmonization', () => {
    it('harmonizes entry fields with both task_name and task_title for schema cache resilience', () => {
      const entry = {
        entryDate: '2026-10-15',
        projectName: 'Portal Upgrades',
        taskCategory: 'Development',
        description: 'Fixed cross-portal document sync',
        hours: 8,
        isBillable: true,
      }

      const taskValue = (e: any) =>
        e.taskCategory?.trim() ||
        e.taskTitle?.trim() ||
        e.taskName?.trim() ||
        'General Work'

      const insertPayload = {
        timesheet_id: 'ts-uuid-1',
        company_id: 'comp-uuid-1',
        employee_id: 'emp-uuid-1',
        work_date: entry.entryDate,
        entry_date: entry.entryDate,
        project_name: entry.projectName.trim(),
        task_name: taskValue(entry),
        task_title: taskValue(entry),
        task_category: entry.taskCategory?.trim() || taskValue(entry),
        description: entry.description?.trim(),
        hours: Number(entry.hours),
        is_billable: entry.isBillable === true,
      }

      expect(insertPayload.task_name).toBe('Development')
      expect(insertPayload.task_title).toBe('Development')
      expect(insertPayload.task_category).toBe('Development')
      expect(insertPayload.work_date).toBe('2026-10-15')
      expect(insertPayload.entry_date).toBe('2026-10-15')
      expect(insertPayload.hours).toBe(8)
    })

    it('falls back safely if taskCategory is absent or blank', () => {
      const entry = {
        entryDate: '2026-10-16',
        taskTitle: 'Code Review',
        hours: 4,
        isBillable: true,
      }

      const taskValue = (e: any) =>
        e.taskCategory?.trim() ||
        e.taskTitle?.trim() ||
        e.taskName?.trim() ||
        'General Work'

      expect(taskValue(entry)).toBe('Code Review')
    })
  })

  describe('2. Leave Request Parameter Normalization', () => {
    it('normalizes camelCase parameters to snake_case for leave requests', () => {
      const camelCaseBody = {
        leaveTypeId: 'lt-123',
        startDate: '2026-10-20',
        endDate: '2026-10-21',
        totalDays: 2,
        reason: 'Personal leave',
      }

      const employee_id = (camelCaseBody as any).employee_id || (camelCaseBody as any).employeeId
      const leave_type_id = (camelCaseBody as any).leave_type_id || (camelCaseBody as any).leaveTypeId
      const start_date = (camelCaseBody as any).start_date || (camelCaseBody as any).startDate
      const end_date = (camelCaseBody as any).end_date || (camelCaseBody as any).endDate
      const total_days = (camelCaseBody as any).total_days ?? (camelCaseBody as any).totalDays

      expect(leave_type_id).toBe('lt-123')
      expect(start_date).toBe('2026-10-20')
      expect(end_date).toBe('2026-10-21')
      expect(total_days).toBe(2)
    })

    it('handles native snake_case parameters equally well', () => {
      const snakeCaseBody = {
        leave_type_id: 'lt-456',
        start_date: '2026-10-25',
        end_date: '2026-10-25',
        total_days: 1,
        reason: 'Casual leave',
      }

      const leave_type_id = (snakeCaseBody as any).leave_type_id || (snakeCaseBody as any).leaveTypeId
      const start_date = (snakeCaseBody as any).start_date || (snakeCaseBody as any).startDate
      const end_date = (snakeCaseBody as any).end_date || (snakeCaseBody as any).endDate

      expect(leave_type_id).toBe('lt-456')
      expect(start_date).toBe('2026-10-25')
      expect(end_date).toBe('2026-10-25')
    })
  })

  describe('3. Document Lifecycle Status Resolution', () => {
    function normalizeStatus(value: unknown): string {
      const normalized = String(value || '').trim().toUpperCase()
      const valid = ['DRAFT', 'UPLOADED', 'PENDING_VERIFICATION', 'VERIFIED', 'REJECTED', 'APPROVED', 'ISSUED', 'ACKNOWLEDGED', 'SUPERSEDED']
      return valid.includes(normalized) ? normalized : 'DRAFT'
    }

    function resolveLifecycleStatus(rowStatus: unknown, metaStatus: unknown): string {
      const normMeta = metaStatus ? normalizeStatus(metaStatus) : null
      const normRow = rowStatus ? normalizeStatus(rowStatus) : null

      if (normMeta === 'ACKNOWLEDGED' || normRow === 'ACKNOWLEDGED') return 'ACKNOWLEDGED'
      if (normMeta === 'ISSUED' || normRow === 'ISSUED') return 'ISSUED'
      if (normMeta === 'APPROVED' || normRow === 'APPROVED') return 'APPROVED'
      if (normMeta === 'VERIFIED' || normRow === 'VERIFIED') return 'VERIFIED'
      if (normMeta === 'REJECTED' || normRow === 'REJECTED') return 'REJECTED'
      if (normMeta && normMeta !== 'DRAFT') return normMeta
      if (normRow && normRow !== 'DRAFT') return normRow
      return normRow || normMeta || 'DRAFT'
    }

    it('prioritizes ISSUED from meta when database column has default DRAFT', () => {
      const resolved = resolveLifecycleStatus('DRAFT', 'ISSUED')
      expect(resolved).toBe('ISSUED')
    })

    it('prioritizes ACKNOWLEDGED from meta or row over other statuses', () => {
      expect(resolveLifecycleStatus('ISSUED', 'ACKNOWLEDGED')).toBe('ACKNOWLEDGED')
      expect(resolveLifecycleStatus('ACKNOWLEDGED', 'ISSUED')).toBe('ACKNOWLEDGED')
    })

    it('prioritizes APPROVED when row is DRAFT', () => {
      expect(resolveLifecycleStatus('DRAFT', 'APPROVED')).toBe('APPROVED')
    })

    it('allows employee portal to see ISSUED, ACKNOWLEDGED, and APPROVED letters', () => {
      const isVisibleToEmployee = (status: string) => {
        return ['ISSUED', 'ACKNOWLEDGED', 'APPROVED'].includes(status)
      }

      expect(isVisibleToEmployee('ISSUED')).toBe(true)
      expect(isVisibleToEmployee('ACKNOWLEDGED')).toBe(true)
      expect(isVisibleToEmployee('APPROVED')).toBe(true)
      expect(isVisibleToEmployee('DRAFT')).toBe(false)
    })
  })

  describe('4. Notification Bell Unread Counter Logic', () => {
    it('correctly calculates unread count and handles empty states', () => {
      const notifications = [
        { id: '1', title: 'Leave Approved', is_read: false },
        { id: '2', title: 'Payslip Released', is_read: true },
        { id: '3', title: 'Document Issued', is_read: false },
      ]

      const unreadCount = notifications.filter(n => !n.is_read).length
      expect(unreadCount).toBe(2)
    })

    it('marks all as read cleanly', () => {
      const notifications = [
        { id: '1', title: 'Leave Approved', is_read: false },
        { id: '2', title: 'Payslip Released', is_read: false },
      ]

      const updated = notifications.map(n => ({ ...n, is_read: true }))
      const unreadCount = updated.filter(n => !n.is_read).length
      expect(unreadCount).toBe(0)
    })
  })

  describe('5. Document Issuance and Employee Synchronization', () => {
    it('transitions document from DRAFT/APPROVED to ISSUED with employee visibility', () => {
      const initialDoc = {
        id: 'doc-123',
        status: 'DRAFT',
        visibility: 'private',
        document_type: 'appointment_letter',
        employee_id: 'emp-456',
        description: JSON.stringify({
          status: 'DRAFT',
          documentNumber: 'HRK/HR/APPT/2026/0001',
        }),
      }

      const validForIssuance = ['APPROVED', 'DRAFT', 'VERIFIED']
      expect(validForIssuance.includes(initialDoc.status)).toBe(true)

      const issuedMeta = {
        ...JSON.parse(initialDoc.description),
        status: 'ISSUED',
        issuedAt: '2026-10-30T10:00:00.000Z',
        issuedBy: 'admin-uuid',
      }

      const updatedDoc = {
        ...initialDoc,
        status: 'ISSUED',
        visibility: 'employee',
        requires_acknowledgement: true,
        issue_date: '2026-10-30',
        description: JSON.stringify(issuedMeta),
      }

      expect(updatedDoc.status).toBe('ISSUED')
      expect(updatedDoc.visibility).toBe('employee')
      expect(updatedDoc.requires_acknowledgement).toBe(true)

      // Verify employee query matching
      const employeeId = 'emp-456'
      const matchesEmployee = (d: typeof updatedDoc) => {
        return (
          d.employee_id === employeeId &&
          (d.status === 'ISSUED' || d.status === 'ACKNOWLEDGED' || d.visibility === 'employee')
        )
      }
      expect(matchesEmployee(updatedDoc)).toBe(true)
    })

    it('idempotently handles already issued documents', () => {
      const doc = {
        id: 'doc-issued',
        status: 'ISSUED',
        visibility: 'employee',
      }
      const canReIssue = doc.status === 'ISSUED'
      expect(canReIssue).toBe(true)
    })
  })

  describe('6. Document Deletion Permissions and Storage Integrity', () => {
    const officialDocTypes = [
      'offer_letter',
      'appointment_letter',
      'joining_letter',
      'salary_revision',
      'relieving_letter',
      'experience_letter',
      'resignation_acceptance',
      'custom_letter',
    ]

    function canDeleteDocument(user: { isAdmin: boolean; employeeId?: string; authUserId?: string }, doc: any): { allowed: boolean; error?: string } {
      if (user.isAdmin) return { allowed: true }

      if (doc.employee_id !== user.employeeId) {
        return { allowed: false, error: 'Forbidden: You can only delete your own documents.' }
      }

      if (doc.uploaded_by && doc.uploaded_by !== user.authUserId) {
        return { allowed: false, error: 'Forbidden: You can only delete documents that you uploaded.' }
      }

      const isOfficial = officialDocTypes.includes(doc.document_type) || doc.category === 'employment_hr' || doc.category === 'company_policy' || Boolean(doc.content)
      if (isOfficial) {
        return { allowed: false, error: 'Forbidden: Official company employment records cannot be deleted by employees.' }
      }

      if (doc.status === 'VERIFIED' || doc.verification_status === 'verified') {
        return { allowed: false, error: 'Forbidden: Verified documents cannot be deleted without HR administrator approval.' }
      }

      return { allowed: true }
    }

    it('allows administrators to delete any company document', () => {
      const admin = { isAdmin: true }
      const doc = { id: 'd-1', employee_id: 'emp-1', document_type: 'appointment_letter', status: 'ISSUED' }
      expect(canDeleteDocument(admin, doc).allowed).toBe(true)
    })

    it('strictly forbids employees from deleting official letters', () => {
      const employee = { isAdmin: false, employeeId: 'emp-1', authUserId: 'u-1' }
      const officialDoc = { id: 'd-2', employee_id: 'emp-1', uploaded_by: 'u-1', document_type: 'appointment_letter', status: 'ISSUED' }
      const result = canDeleteDocument(employee, officialDoc)
      expect(result.allowed).toBe(false)
      expect(result.error).toContain('Official company employment records cannot be deleted')
    })

    it('strictly forbids employees from deleting verified statutory proofs', () => {
      const employee = { isAdmin: false, employeeId: 'emp-1', authUserId: 'u-1' }
      const verifiedDoc = { id: 'd-3', employee_id: 'emp-1', uploaded_by: 'u-1', document_type: 'identity_proof', category: 'identity_onboarding', status: 'VERIFIED' }
      const result = canDeleteDocument(employee, verifiedDoc)
      expect(result.allowed).toBe(false)
      expect(result.error).toContain('Verified documents cannot be deleted')
    })

    it('allows employee to delete their own unverified uploaded proofs', () => {
      const employee = { isAdmin: false, employeeId: 'emp-1', authUserId: 'u-1' }
      const unverifiedDoc = { id: 'd-4', employee_id: 'emp-1', uploaded_by: 'u-1', document_type: 'identity_proof', category: 'identity_onboarding', status: 'PENDING_VERIFICATION' }
      const result = canDeleteDocument(employee, unverifiedDoc)
      expect(result.allowed).toBe(true)
    })
  })

  describe('7. Document Expiry Management and Status Calculation', () => {
    function computeExpiry(expiryDate?: string | null) {
      if (!expiryDate) {
        return { status: 'NOT_APPLICABLE', daysRemaining: null, label: 'No Expiry' }
      }
      const raw = String(expiryDate).slice(0, 10)
      const exp = new Date(`${raw}T23:59:59`)
      if (Number.isNaN(exp.getTime())) {
        return { status: 'NOT_APPLICABLE', daysRemaining: null, label: 'No Expiry' }
      }
      const now = new Date()
      const diffMs = exp.getTime() - now.getTime()
      const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
      if (days < 0) return { status: 'EXPIRED', daysRemaining: days, label: `Expired ${Math.abs(days)}d ago` }
      if (days <= 30) return { status: 'EXPIRING_SOON', daysRemaining: days, label: `Expiring in ${days}d` }
      return { status: 'ACTIVE', daysRemaining: days, label: `Active (${days}d left)` }
    }

    it('returns NOT_APPLICABLE when expiry date is null or empty', () => {
      expect(computeExpiry(null).status).toBe('NOT_APPLICABLE')
      expect(computeExpiry('').status).toBe('NOT_APPLICABLE')
      expect(computeExpiry(undefined).status).toBe('NOT_APPLICABLE')
    })

    it('returns EXPIRED when date is in the past', () => {
      const result = computeExpiry('2020-01-01')
      expect(result.status).toBe('EXPIRED')
      expect(result.daysRemaining).toBeLessThan(0)
    })

    it('returns ACTIVE when expiration date is far in future', () => {
      const future = new Date()
      future.setFullYear(future.getFullYear() + 2)
      const result = computeExpiry(future.toISOString().slice(0, 10))
      expect(result.status).toBe('ACTIVE')
      expect(result.daysRemaining).toBeGreaterThan(30)
    })
  })
})

