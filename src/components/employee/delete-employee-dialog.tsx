'use client'

import React, { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  AlertTriangle,
  Loader2,
  ShieldAlert,
  Trash2,
  UserX,
} from 'lucide-react'
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
  const [actionType, setActionType] =
    useState<'deactivate' | 'delete'>('deactivate')

  const [reason, setReason] = useState('')
  const [confirmationCode, setConfirmationCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [checking, setChecking] = useState(false)
  const [eligibility, setEligibility] = useState<any>(null)

  const employeeCode =
    employee?.code ||
    employee?.employee_code ||
    ''

  const employeeName =
    employee?.fullName ||
    employee?.name ||
    ''

  const requiredCode = `DELETE ${employeeCode}`

  useEffect(() => {
    if (open && employee?.id) {
      setReason('')
      setConfirmationCode('')
      setActionType('deactivate')
      setEligibility(null)
      void fetchEligibility()
    }
  }, [open, employee?.id])

  const fetchEligibility = async () => {
    if (!employee?.id) return

    setChecking(true)

    try {
      const res = await fetch(
        `/api/employees/${employee.id}/delete-eligibility`,
      )

      const data = await res.json()

      if (data.success) {
        setEligibility(data)
      }
    } catch {
      // Keep dialog usable even if eligibility check fails.
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
      const res = await fetch(
        `/api/employees/${employee.id}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'deactivate',
            reason: reason.trim(),
          }),
        },
      )

      const data = await res.json()

      if (data.success) {
        toast.success(
          `Employee ${employeeCode} deactivated successfully.`,
        )

        onSuccess?.()
        onOpenChange(false)
      } else {
        toast.error(
          data.error ||
            'Failed to deactivate employee',
        )
      }
    } catch {
      toast.error('Network error during deactivation')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (confirmationCode.trim() !== requiredCode) {
      toast.error(
        `Please type "${requiredCode}" exactly to confirm deletion.`,
      )
      return
    }

    if (!reason.trim()) {
      toast.error(
        'Please enter a reason for deletion.',
      )
      return
    }

    setSubmitting(true)

    try {
      const res = await fetch(
        `/api/employees/${employee.id}`,
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            confirmationCode:
              confirmationCode.trim(),
            reason: reason.trim(),
          }),
        },
      )

      const data = await res.json()

      if (data.success) {
        toast.success(
          `Employee ${employeeCode} permanently deleted.`,
        )

        onSuccess?.()
        onOpenChange(false)
      } else {
        toast.error(
          data.error ||
            'Failed to delete employee',
        )
      }
    } catch {
      toast.error('Network error during deletion')
    } finally {
      setSubmitting(false)
    }
  }

  const permanentDeleteBlocked =
    Boolean(
      eligibility &&
        !eligibility.canDeletePermanently,
    )

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent
        className="
          w-[calc(100vw-2rem)]
          max-w-[640px]
          max-h-[90vh]
          overflow-y-auto
          overflow-x-hidden
          sm:max-w-[640px]
        "
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-rose-600">
            <ShieldAlert className="h-5 w-5 shrink-0" />

            <span className="min-w-0">
              Manage Employee Lifecycle & Access
            </span>
          </DialogTitle>

          <DialogDescription className="break-normal">
            Choose how to handle the record for{' '}
            <span className="font-medium text-foreground">
              {employeeName}
            </span>{' '}
            ({employeeCode})
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <RadioGroup
            value={actionType}
            onValueChange={(value) =>
              setActionType(
                value as 'deactivate' | 'delete',
              )
            }
            className="space-y-3"
          >
            {/* DEACTIVATE */}
            <div
              className={`
                flex w-full items-start gap-3
                rounded-xl border p-4
                transition-colors
                ${
                  actionType === 'deactivate'
                    ? 'border-amber-300 bg-amber-50/70 dark:border-amber-800 dark:bg-amber-950/30'
                    : 'hover:bg-muted/50'
                }
              `}
            >
              <RadioGroupItem
                value="deactivate"
                id="action-deactivate"
                className="mt-1 shrink-0"
              />

              <div className="min-w-0 flex-1">
                <Label
                  htmlFor="action-deactivate"
                  className="
                    flex cursor-pointer
                    items-center gap-1.5
                    font-semibold
                    text-foreground
                  "
                >
                  <UserX className="h-4 w-4 shrink-0 text-amber-600" />

                  <span>
                    Deactivate Employee
                    (Recommended)
                  </span>
                </Label>

                <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                  Terminates active employment,
                  disables portal and authentication
                  login immediately, while preserving
                  historical payroll records,
                  payslips, timesheets and issued
                  documents for statutory compliance.
                </p>
              </div>
            </div>

            {/* PERMANENT DELETE */}
            <div
              className={`
                flex w-full items-start gap-3
                rounded-xl border p-4
                transition-colors
                ${
                  actionType === 'delete'
                    ? 'border-rose-300 bg-rose-50/70 dark:border-rose-800 dark:bg-rose-950/30'
                    : 'hover:bg-muted/50'
                }
              `}
            >
              <RadioGroupItem
                value="delete"
                id="action-delete"
                className="mt-1 shrink-0"
              />

              <div className="min-w-0 flex-1">
                <Label
                  htmlFor="action-delete"
                  className="
                    flex cursor-pointer
                    items-center gap-1.5
                    font-semibold
                    text-rose-600
                  "
                >
                  <Trash2 className="h-4 w-4 shrink-0" />

                  <span>
                    Permanent Delete
                    (Strictly Restricted)
                  </span>
                </Label>

                <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                  Only permitted for accidental or
                  test employee creations with no
                  protected payroll, statutory or
                  issued-document history. The
                  employee ID counter will not be
                  decremented.
                </p>
              </div>
            </div>
          </RadioGroup>

          {/* DEACTIVATE DETAILS */}
          {actionType === 'deactivate' && (
            <div className="space-y-3 pt-2">
              <div className="space-y-1.5">
                <Label htmlFor="deactivate-reason">
                  Reason for Deactivation *
                </Label>

                <Textarea
                  id="deactivate-reason"
                  placeholder="e.g. Resignation, end of contract, termination..."
                  rows={3}
                  value={reason}
                  onChange={(event) =>
                    setReason(event.target.value)
                  }
                />
              </div>
            </div>
          )}

          {/* PERMANENT DELETE DETAILS */}
          {actionType === 'delete' && (
            <div className="w-full space-y-3 pt-2">
              {checking ? (
                <div className="flex min-h-20 w-full items-center justify-center gap-2 rounded-xl border bg-muted/30 p-4">
                  <Loader2 className="h-5 w-5 shrink-0 animate-spin text-muted-foreground" />

                  <span className="text-sm text-muted-foreground">
                    Checking statutory
                    dependencies...
                  </span>
                </div>
              ) : permanentDeleteBlocked ? (
                /*
                 * Deliberately NOT using the
                 * destructive shadcn Alert here.
                 *
                 * A normal flex container prevents
                 * the description from collapsing
                 * into a narrow text column.
                 */
                <div
                  className="
                    w-full min-w-0
                    rounded-xl
                    border border-rose-300
                    bg-rose-50
                    p-4
                    text-rose-950
                    dark:border-rose-800
                    dark:bg-rose-950/30
                    dark:text-rose-100
                  "
                >
                  <div className="flex w-full min-w-0 items-start gap-3">
                    <div
                      className="
                        flex h-9 w-9 shrink-0
                        items-center justify-center
                        rounded-lg
                        bg-rose-100
                        dark:bg-rose-900/50
                      "
                    >
                      <AlertTriangle className="h-5 w-5 text-rose-600 dark:text-rose-400" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-semibold leading-5 text-rose-700 dark:text-rose-300">
                        Permanent Delete Prohibited
                      </h3>

                      <p className="mt-1.5 text-sm leading-6 text-rose-800 dark:text-rose-200">
                        This employee cannot be
                        permanently deleted because
                        protected statutory or
                        historical records exist.
                      </p>
                    </div>
                  </div>

                  {Array.isArray(
                    eligibility?.blockers,
                  ) &&
                    eligibility.blockers.length >
                      0 && (
                      <div
                        className="
                          mt-4 w-full
                          rounded-lg
                          border border-rose-200
                          bg-white/70
                          p-3.5
                          dark:border-rose-900
                          dark:bg-black/10
                        "
                      >
                        <p className="text-xs font-semibold uppercase tracking-wide text-rose-700 dark:text-rose-300">
                          Deletion blocked because
                        </p>

                        <ul className="mt-2.5 space-y-2">
                          {eligibility.blockers.map(
                            (
                              blocker: string,
                              index: number,
                            ) => (
                              <li
                                key={index}
                                className="
                                  flex min-w-0
                                  items-start gap-2
                                  text-sm leading-5
                                  text-foreground
                                "
                              >
                                <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" />

                                <span className="min-w-0 flex-1 break-normal">
                                  {blocker}
                                </span>
                              </li>
                            ),
                          )}
                        </ul>
                      </div>
                    )}

                  <div
                    className="
                      mt-4 flex w-full
                      items-start gap-2.5
                      rounded-lg
                      bg-amber-50
                      p-3
                      text-amber-950
                      dark:bg-amber-950/30
                      dark:text-amber-100
                    "
                  >
                    <UserX className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />

                    <p className="min-w-0 flex-1 text-sm leading-5">
                      Use{' '}
                      <strong>
                        Deactivate Employee
                      </strong>{' '}
                      instead. Deactivation preserves
                      the employee&apos;s statutory
                      and historical records while
                      disabling active employment and
                      portal access.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <Alert className="w-full border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
                    <AlertTriangle className="h-4 w-4 text-rose-600" />

                    <AlertDescription className="text-xs leading-5">
                      This will permanently remove
                      the employee record, bank
                      accounts, statutory details
                      and authentication login. This
                      action cannot be undone.
                    </AlertDescription>
                  </Alert>

                  <div className="space-y-1.5">
                    <Label htmlFor="delete-reason">
                      Reason for Permanent Deletion *
                    </Label>

                    <Input
                      id="delete-reason"
                      placeholder="e.g. Accidental duplicate test employee"
                      value={reason}
                      onChange={(event) =>
                        setReason(event.target.value)
                      }
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label
                      htmlFor="confirm-code"
                      className="text-xs"
                    >
                      Type{' '}
                      <span className="font-mono font-bold text-rose-600">
                        {requiredCode}
                      </span>{' '}
                      to confirm:
                    </Label>

                    <Input
                      id="confirm-code"
                      value={confirmationCode}
                      onChange={(event) =>
                        setConfirmationCode(
                          event.target.value,
                        )
                      }
                      placeholder={requiredCode}
                      className="font-mono"
                    />
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 border-t pt-4 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>

          {actionType === 'deactivate' ? (
            <Button
              onClick={handleDeactivate}
              disabled={
                submitting || !reason.trim()
              }
              className="bg-amber-600 text-white hover:bg-amber-700"
            >
              {submitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <UserX className="mr-2 h-4 w-4" />
              )}

              Confirm Deactivation
            </Button>
          ) : (
            <Button
              onClick={handleDelete}
              disabled={
                submitting ||
                checking ||
                permanentDeleteBlocked ||
                confirmationCode.trim() !==
                  requiredCode ||
                !reason.trim()
              }
              variant="destructive"
            >
              {submitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}

              Permanently Delete Employee
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}