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
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  KeyRound,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Check,
  ShieldAlert,
  Wrench,
  Eye,
  EyeOff,
  ShieldCheck,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

export interface ResetPasswordEmployee {
  id: string
  code?: string | null
  name?: string | null
  fullName?: string | null
  email?: string | null
  officialEmail?: string | null
}

interface ResetPasswordDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  employee: ResetPasswordEmployee | null
  onSuccess?: () => void
  onOpenRepair?: () => void
}

export function ResetPasswordDialog({
  open,
  onOpenChange,
  employee,
  onSuccess,
  onOpenRepair,
}: ResetPasswordDialogProps) {
  const [loading, setLoading] = useState(false)
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(true)
  const [officialEmail, setOfficialEmail] = useState<string | null>(null)
  const [employeeName, setEmployeeName] = useState<string | null>(null)
  const [employeeCode, setEmployeeCode] = useState<string | null>(null)
  const [canRepair, setCanRepair] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [resetCompleted, setResetCompleted] = useState(false)

  // Reset state when dialog opens or employee changes; cleanly wipe credentials on unmount/close
  useEffect(() => {
    if (open) {
      setTemporaryPassword(null)
      setShowPassword(true)
      setOfficialEmail(null)
      setEmployeeName(null)
      setEmployeeCode(null)
      setCanRepair(false)
      setErrorMessage(null)
      setCopied(false)
      setResetCompleted(false)
    }
    return () => {
      // Memory hygiene: Never retain temporary credentials when dialog closes or unmounts
      setTemporaryPassword(null)
      setShowPassword(false)
      setCopied(false)
    }
  }, [open, employee?.id])

  if (!employee) return null

  const displayName = employeeName || employee.fullName || employee.name || 'Employee'
  const displayCode = employeeCode || employee.code || ''
  const displayEmail = officialEmail || employee.officialEmail || employee.email || 'No email on record'

  const handleReset = async () => {
    if (loading) return
    setLoading(true)
    setErrorMessage(null)
    setCanRepair(false)

    try {
      const res = await fetch(`/api/employees/${employee.id}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      const data = await res.json()

      if (res.ok && data.success && data.temporaryPassword) {
        setTemporaryPassword(data.temporaryPassword)
        setOfficialEmail(data.officialEmail || displayEmail)
        setEmployeeName(data.employeeName || displayName)
        setEmployeeCode(data.employeeCode || displayCode)
        setResetCompleted(true)
        setShowPassword(true)
        toast.success(`Temporary password generated for ${displayName}`)
        // DO NOT call onSuccess here — keep dialog open so the administrator can view and copy the credential!
      } else if (res.ok && data.success && !data.temporaryPassword) {
        setErrorMessage('Server confirmed password reset but failed to return temporary credentials. Please try again or repair the account.')
        toast.error('Temporary password was not returned by the server.')
      } else if (data.canRepair) {
        setCanRepair(true)
        setErrorMessage(
          data.error ||
            'Employee authentication account is not properly linked or requires repair.'
        )
      } else {
        setErrorMessage(data.error || 'Failed to reset temporary password.')
        toast.error(data.error || 'Failed to reset temporary password.')
      }
    } catch {
      const err = 'Network error while resetting password. Please check your connection.'
      setErrorMessage(err)
      toast.error(err)
    } finally {
      setLoading(false)
    }
  }

  const copyToClipboard = () => {
    if (temporaryPassword) {
      navigator.clipboard.writeText(temporaryPassword)
      setCopied(true)
      toast.success('Temporary password copied to clipboard!')
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleClose = () => {
    const wasReset = resetCompleted || Boolean(temporaryPassword)
    // Cleanly wipe credentials from state
    setTemporaryPassword(null)
    setShowPassword(false)
    setCopied(false)
    setResetCompleted(false)
    onOpenChange(false)
    // Trigger background refresh only after administrator has finished with the dialog
    if (wasReset) {
      onSuccess?.()
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          handleClose()
        } else {
          onOpenChange(true)
        }
      }}
    >
      <DialogContent className="w-full max-w-[min(680px,calc(100vw-32px))] sm:max-w-2xl max-h-[min(90dvh,800px)] p-4 sm:p-6 box-border overflow-y-auto overflow-x-hidden flex flex-col gap-4">
        <DialogHeader className="pr-8 text-left space-y-1">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg font-semibold leading-tight text-foreground">
            <KeyRound className="h-5 w-5 text-amber-600 shrink-0" />
            <span>Reset Temporary Password</span>
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm text-muted-foreground break-words leading-relaxed">
            Generate server-side temporary credentials for {displayName} {displayCode ? `(${displayCode})` : ''}.
          </DialogDescription>
        </DialogHeader>

        {temporaryPassword ? (
          <div className="space-y-4 py-1 w-full box-border">
            {/* Success Alert Banner */}
            <div className="w-full box-border rounded-lg bg-emerald-50 dark:bg-emerald-950/40 p-4 border border-emerald-200 dark:border-emerald-800">
              <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-semibold mb-1 text-sm sm:text-base">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                <span>Temporary Password Generated</span>
              </div>
              <p className="text-xs sm:text-sm text-emerald-700 dark:text-emerald-400 leading-relaxed break-words">
                The employee&apos;s authentication account has been updated with the temporary credentials below. Any existing active sessions have been terminated.
              </p>
            </div>

            {/* Employee Details Panel */}
            <div className="w-full box-border rounded-lg border p-3.5 sm:p-4 bg-muted/40 text-xs sm:text-sm space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-4 py-1 border-b">
                <span className="text-muted-foreground shrink-0">Employee Name:</span>
                <span className="font-semibold text-foreground break-words text-left sm:text-right">{displayName}</span>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-4 py-1 border-b">
                <span className="text-muted-foreground shrink-0">Employee ID:</span>
                <span className="font-mono font-semibold text-foreground text-left sm:text-right">{displayCode || 'N/A'}</span>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-4 py-1">
                <span className="text-muted-foreground shrink-0">Login Email:</span>
                <span className="font-mono text-foreground [overflow-wrap:anywhere] break-all text-left sm:text-right">{displayEmail}</span>
              </div>
            </div>

            {/* Temporary Password Display Box */}
            <div className="space-y-1.5 w-full box-border">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-foreground">
                  New Temporary Password
                </label>
                <span className="text-[11px] text-amber-700 dark:text-amber-400 font-medium">
                  Single-use credential
                </span>
              </div>

              <div className="flex items-center gap-2 w-full">
                <div className="relative flex-1 min-w-0">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    readOnly
                    value={temporaryPassword}
                    className="w-full p-2.5 sm:p-3 pr-10 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-md font-mono text-sm sm:text-base font-semibold text-amber-900 dark:text-amber-200 tracking-wider select-all focus:outline-none focus:ring-1 focus:ring-amber-500"
                    aria-label="Generated temporary password"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                    title={showPassword ? 'Hide password' : 'Show password'}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  onClick={copyToClipboard}
                  className="shrink-0 h-10 sm:h-11 px-3 sm:px-4 flex items-center gap-1.5 text-xs sm:text-sm font-medium border-amber-300 hover:bg-amber-100/50 dark:border-amber-800 dark:hover:bg-amber-950/60"
                  title="Copy temporary password to clipboard"
                >
                  {copied ? (
                    <>
                      <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                      <span className="text-emerald-700 dark:text-emerald-400 font-semibold">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4 shrink-0" />
                      <span>Copy</span>
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Instruction Warning Box */}
            <div className="w-full box-border rounded-lg bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 p-3.5 text-xs text-amber-900 dark:text-amber-200 space-y-1.5">
              <p className="font-semibold flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                <span>Important Administrator Instructions:</span>
              </p>
              <ul className="list-disc pl-5 space-y-1 text-amber-800 dark:text-amber-300 leading-relaxed break-words">
                <li>Share this temporary password securely with <strong>{displayName}</strong>.</li>
                <li>For security, this credential will <strong>not</strong> be displayed again after closing this dialog.</li>
                <li>The employee is required to set a permanent, private password upon logging in.</li>
              </ul>
            </div>

            <DialogFooter className="pt-3 w-full flex justify-end">
              <Button
                type="button"
                onClick={handleClose}
                className="w-full sm:w-auto h-9 sm:h-10 text-xs sm:text-sm font-medium bg-[#1e2a78] hover:bg-[#152060] text-white"
              >
                Done
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4 py-1 w-full box-border">
            <div className="w-full box-border rounded-lg border p-3.5 sm:p-4 bg-muted/40 text-xs sm:text-sm space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-4 py-1 border-b">
                <span className="text-muted-foreground shrink-0">Employee Name:</span>
                <span className="font-semibold text-foreground break-words text-left sm:text-right">{displayName}</span>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-4 py-1 border-b">
                <span className="text-muted-foreground shrink-0">Employee ID:</span>
                <span className="font-mono font-semibold text-foreground text-left sm:text-right">{displayCode || 'N/A'}</span>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-4 py-1">
                <span className="text-muted-foreground shrink-0">Login Email:</span>
                <span className="font-mono text-foreground [overflow-wrap:anywhere] break-all text-left sm:text-right">{displayEmail}</span>
              </div>
            </div>

            {errorMessage && (
              <Alert
                variant={canRepair ? 'default' : 'destructive'}
                className={cn(
                  'w-full box-border border rounded-lg p-3.5 sm:p-4 text-xs sm:text-sm',
                  canRepair
                    ? 'border-amber-300 bg-amber-50/90 text-amber-900 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-200'
                    : 'border-red-300 bg-red-50/90 text-red-900 dark:bg-red-950/40 dark:border-red-800 dark:text-red-200'
                )}
              >
                <div className="flex items-start gap-2.5">
                  {canRepair ? (
                    <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  ) : (
                    <ShieldAlert className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1 min-w-0">
                    <AlertTitle className="text-sm font-semibold mb-1">
                      {canRepair ? 'Account Requires Repair' : 'Password Reset Failed'}
                    </AlertTitle>
                    <AlertDescription className="text-xs sm:text-sm leading-relaxed break-words">
                      {errorMessage}
                    </AlertDescription>
                  </div>
                </div>
              </Alert>
            )}

            <div className="w-full box-border rounded-lg bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 p-3.5 sm:p-4 text-xs sm:text-sm text-blue-900 dark:text-blue-300 space-y-1.5">
              <p className="font-semibold flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
                <span>Security Notice:</span>
              </p>
              <ul className="list-disc pl-5 space-y-1 text-xs text-blue-800 dark:text-blue-400 leading-relaxed break-words">
                <li>A cryptographically secure temporary password will be generated server-side.</li>
                <li>The employee will be forced to change this password on next login.</li>
                <li>Any existing active sessions for this employee will be immediately revoked.</li>
              </ul>
            </div>

            <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-2.5 pt-3 w-full">
              {canRepair && onOpenRepair && (
                <Button
                  type="button"
                  variant="outline"
                  className="border-indigo-300 text-indigo-700 hover:bg-indigo-50 dark:border-indigo-800 dark:text-indigo-300 w-full sm:w-auto h-9 sm:h-10 text-xs sm:text-sm font-medium"
                  onClick={() => {
                    handleClose()
                    onOpenRepair()
                  }}
                >
                  <Wrench className="mr-1.5 h-4 w-4 shrink-0" />
                  Repair Login Account
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={loading}
                className="w-full sm:w-auto h-9 sm:h-10 text-xs sm:text-sm font-medium"
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="bg-amber-600 hover:bg-amber-700 text-white w-full sm:w-auto h-9 sm:h-10 text-xs sm:text-sm font-medium shadow-sm"
                onClick={handleReset}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin shrink-0" />
                    Resetting...
                  </>
                ) : (
                  <>
                    <KeyRound className="mr-2 h-4 w-4 shrink-0" />
                    Reset Temporary Password
                  </>
                )}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
