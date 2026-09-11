'use client'

import React, { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Loader2, AlertTriangle, ShieldAlert, UserX, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

interface DeleteEmployeeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  employee: any
  onSuccess?: () => void
}

export function DeleteEmployeeDialog({
  open,
  onOpenChange,
  employee,
  onSuccess,
}: DeleteEmployeeDialogProps) {
  const [actionType, setActionType] = useState<'deactivate' | 'delete'>('deactivate')
  const [reason, setReason] = useState('')
  const [confirmationCode, setConfirmationCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [checking, setChecking] = useState(false)
  const [eligibility, setEligibility] = useState<any>(null)

  const employeeCode = employee?.code || employee?.employee_code || ''
  const employeeName = employee?.fullName || employee?.name || ''
  const requiredCode = `DELETE ${employeeCode}`

  useEffect(() => {
    if (open && employee?.id) {
      setReason('')
      setConfirmationCode('')
      setActionType('deactivate')
      fetchEligibility()
    }
  }, [open, employee?.id])

  const fetchEligibility = async () => {
    setChecking(true)
    try {
      const res = await fetch(`/api/employees/${employee.id}/delete-eligibility`)
      const data = await res.json()
      if (data.success) {
        setEligibility(data)
      }
    } catch {
      // Ignore
    } finally {
      setChecking(false)
    }
  }

  const handleDeactivate = async () => {
    if (!reason.trim()) {
      toast.error('Please provide a reason for deactivation.')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch(`/api/employees/${employee.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'deactivate',
          reason: reason.trim(),
        }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success(`Employee ${employeeCode} deactivated successfully.`)
        onSuccess?.()
        onOpenChange(false)
      } else {
        toast.error(data.error || 'Failed to deactivate employee')
      }
    } catch {
      toast.error('Network error during deactivation')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (confirmationCode.trim() !== requiredCode) {
      toast.error(`Please type "${requiredCode}" exactly to confirm deletion.`)
      return
    }

    if (!reason.trim()) {
      toast.error('Please enter a reason for deletion.')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch(`/api/employees/${employee.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          confirmationCode: confirmationCode.trim(),
          reason: reason.trim(),
        }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success(`Employee ${employeeCode} permanently deleted.`)
        onSuccess?.()
        onOpenChange(false)
      } else {
        toast.error(data.error || 'Failed to delete employee')
      }
    } catch {
      toast.error('Network error during deletion')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-rose-600">
            <ShieldAlert className="h-5 w-5" />
            Manage Employee Lifecycle & Access
          </DialogTitle>
          <DialogDescription>
            Choose how to handle the record for {employeeName} ({employeeCode})
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <RadioGroup
            value={actionType}
            onValueChange={(v: any) => setActionType(v)}
            className="space-y-3"
          >
            {/* OPTION 1: DEACTIVATE */}
            <div className={`flex items-start space-x-3 p-3.5 rounded-lg border cursor-pointer transition-colors ${actionType === 'deactivate' ? 'bg-amber-50/70 border-amber-300 dark:bg-amber-950/30' : 'hover:bg-muted/50'}`}>
              <RadioGroupItem value="deactivate" id="action-deactivate" className="mt-1" />
              <div className="space-y-1">
                <Label htmlFor="action-deactivate" className="font-semibold cursor-pointer flex items-center gap-1.5 text-foreground">
                  <UserX className="h-4 w-4 text-amber-600" />
                  Deactivate Employee (Recommended)
                </Label>
                <p className="text-xs text-muted-foreground">
                  Terminates active employment, disables portal and auth login immediately, but preserves all historical payroll records, payslips, timesheets, and signed documents for statutory compliance.
                </p>
              </div>
            </div>

            {/* OPTION 2: PERMANENT DELETE */}
            <div className={`flex items-start space-x-3 p-3.5 rounded-lg border cursor-pointer transition-colors ${actionType === 'delete' ? 'bg-rose-50/70 border-rose-300 dark:bg-rose-950/30' : 'hover:bg-muted/50'}`}>
              <RadioGroupItem value="delete" id="action-delete" className="mt-1" />
              <div className="space-y-1">
                <Label htmlFor="action-delete" className="font-semibold cursor-pointer flex items-center gap-1.5 text-rose-600">
                  <Trash2 className="h-4 w-4" />
                  Permanent Delete (Strictly Restricted)
                </Label>
                <p className="text-xs text-muted-foreground">
                  Only permitted for accidental or test employee creations with NO finalized payroll or issued documents. Company employee ID counter will NOT be decremented.
                </p>
              </div>
            </div>
          </RadioGroup>

          {/* DEACTIVATE DETAILS */}
          {actionType === 'deactivate' && (
            <div className="space-y-3 pt-2">
              <div className="space-y-1.5">
                <Label htmlFor="deactivate-reason">Reason for Deactivation *</Label>
                <Textarea
                  id="deactivate-reason"
                  placeholder="e.g. Resignation, end of contract, termination..."
                  rows={3}
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* PERMANENT DELETE DETAILS */}
          {actionType === 'delete' && (
            <div className="space-y-3 pt-2">
              {checking ? (
                <div className="flex items-center justify-center py-4 space-y-2">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  <span className="text-xs text-muted-foreground ml-2">Checking statutory dependencies...</span>
                </div>
              ) : eligibility && !eligibility.canDeletePermanently ? (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Permanent Delete Prohibited</AlertTitle>
                  <AlertDescription className="text-xs mt-1 space-y-1">
                    <p>This employee cannot be deleted because statutory and historical records exist:</p>
                    <ul className="list-disc pl-4 space-y-0.5">
                      {eligibility.blockers?.map((b: string, i: number) => (
                        <li key={i}>{b}</li>
                      ))}
                    </ul>
                    <p className="font-semibold pt-1">
                      Please use &quot;Deactivate Employee&quot; instead to preserve statutory compliance.
                    </p>
                  </AlertDescription>
                </Alert>
              ) : (
                <>
                  <Alert className="bg-rose-50 border-rose-200 text-rose-900 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-200">
                    <AlertTriangle className="h-4 w-4 text-rose-600" />
                    <AlertDescription className="text-xs">
                      This will permanently remove the employee record, bank accounts, statutory details, and authentication login. This action cannot be undone.
                    </AlertDescription>
                  </Alert>

                  <div className="space-y-1.5">
                    <Label htmlFor="delete-reason">Reason for Permanent Deletion *</Label>
                    <Input
                      id="delete-reason"
                      placeholder="e.g. Accidental duplicate test employee"
                      value={reason}
                      onChange={e => setReason(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="confirm-code" className="text-xs">
                      Type <span className="font-mono font-bold text-rose-600">{requiredCode}</span> to confirm:
                    </Label>
                    <Input
                      id="confirm-code"
                      value={confirmationCode}
                      onChange={e => setConfirmationCode(e.target.value)}
                      placeholder={requiredCode}
                      className="font-mono"
                    />
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="border-t pt-3">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>

          {actionType === 'deactivate' ? (
            <Button
              onClick={handleDeactivate}
              disabled={submitting || !reason.trim()}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserX className="mr-2 h-4 w-4" />}
              Confirm Deactivation
            </Button>
          ) : (
            <Button
              onClick={handleDelete}
              disabled={
                submitting ||
                checking ||
                (eligibility && !eligibility.canDeletePermanently) ||
                confirmationCode.trim() !== requiredCode ||
                !reason.trim()
              }
              variant="destructive"
            >
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              Permanently Delete Employee
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
