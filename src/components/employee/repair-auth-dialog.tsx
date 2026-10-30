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
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Loader2, CheckCircle2, AlertTriangle, Key, Copy, Check, Wrench, Eye, EyeOff } from 'lucide-react'
import { toast } from 'sonner'

interface RepairAuthDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  employeeId: string
  employeeCode?: string
  employeeName?: string
  onRepaired?: () => void
}

export function RepairAuthDialog({
  open,
  onOpenChange,
  employeeId,
  employeeCode,
  employeeName,
  onRepaired,
}: RepairAuthDialogProps) {
  const [loading, setLoading] = useState(false)
  const [repairing, setRepairing] = useState(false)
  const [integrity, setIntegrity] = useState<any>(null)
  const [repairResult, setRepairResult] = useState<any>(null)
  const [copied, setCopied] = useState(false)
  const [showPassword, setShowPassword] = useState(true)

  useEffect(() => {
    if (open && employeeId) {
      fetchIntegrity()
      setRepairResult(null)
      setCopied(false)
    }
  }, [open, employeeId])

  const fetchIntegrity = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/employees/${employeeId}/identity-integrity`)
      const data = await res.json()
      if (data.success) {
        setIntegrity(data.integrity)
      } else {
        toast.error(data.error || 'Failed to inspect employee identity')
      }
    } catch {
      toast.error('Network error checking identity')
    } finally {
      setLoading(false)
    }
  }

  const handleRepair = async () => {
    setRepairing(true)
    try {
      const res = await fetch(`/api/employees/${employeeId}/repair-auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await res.json()
      if (data.success) {
        setRepairResult(data.data)
        setShowPassword(true)
        toast.success(data.message || 'Login account repaired successfully!')
        // Keep dialog open until administrator clicks Close
      } else {
        toast.error(data.error || 'Repair failed')
      }
    } catch {
      toast.error('Network error repairing login account')
    } finally {
      setRepairing(false)
    }
  }

  const copyPassword = () => {
    if (repairResult?.temporaryPassword) {
      navigator.clipboard.writeText(repairResult.temporaryPassword)
      setCopied(true)
      toast.success('Temporary password copied to clipboard!')
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleClose = () => {
    const wasRepaired = Boolean(repairResult)
    setRepairResult(null)
    setShowPassword(false)
    setCopied(false)
    onOpenChange(false)
    if (wasRepaired) {
      onRepaired?.()
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
            <Wrench className="h-5 w-5 text-indigo-600 shrink-0" />
            <span>Repair Employee Login Account</span>
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm text-muted-foreground break-words leading-relaxed">
            Audit and reconcile authentication identity for {employeeName || 'Employee'}{' '}
            {employeeCode ? `(${employeeCode})` : ''}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-8 space-y-3 w-full">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
            <p className="text-xs sm:text-sm text-muted-foreground text-center">Auditing identity across Auth and Public tables...</p>
          </div>
        ) : repairResult ? (
          <div className="space-y-4 py-1 w-full box-border">
            <div className="w-full box-border rounded-lg bg-emerald-50 dark:bg-emerald-950/40 p-4 border border-emerald-200 dark:border-emerald-800">
              <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-semibold mb-1 text-sm sm:text-base">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                <span>Login Account Repaired Successfully</span>
              </div>
              <p className="text-xs sm:text-sm text-emerald-700 dark:text-emerald-400 leading-relaxed break-words">
                The employee can now log in using their official work email and the temporary password below.
              </p>
            </div>

            <div className="space-y-1.5 w-full box-border">
              <label className="text-xs font-medium text-muted-foreground">Official Login Email</label>
              <div className="p-2.5 sm:p-3 bg-muted rounded-md font-mono text-xs sm:text-sm [overflow-wrap:anywhere] break-all border">
                {repairResult.officialEmail}
              </div>
            </div>

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
                    value={repairResult.temporaryPassword || ''}
                    className="w-full p-2.5 sm:p-3 pr-10 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-md font-mono text-sm sm:text-base font-semibold text-amber-900 dark:text-amber-200 tracking-wider select-all focus:outline-none focus:ring-1 focus:ring-amber-500"
                    aria-label="Repaired temporary password"
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
                  onClick={copyPassword}
                  className="shrink-0 h-10 sm:h-11 px-3 sm:px-4 flex items-center gap-1.5 text-xs sm:text-sm font-medium border-amber-300 hover:bg-amber-100/50 dark:border-amber-800 dark:hover:bg-amber-950/60"
                  title="Copy password to clipboard"
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
              <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed break-words">
                This temporary password is only displayed once. The employee will be required to change it upon first login.
              </p>
            </div>

            <div className="border rounded-lg p-3.5 sm:p-4 text-xs sm:text-sm space-y-1.5 bg-muted/40 w-full box-border">
              <div className="font-semibold text-foreground">Actions Executed ({repairResult.caseApplied}):</div>
              <ul className="list-disc pl-4 space-y-1 text-muted-foreground leading-relaxed break-words">
                {repairResult.actionsPerformed?.map((act: string, i: number) => (
                  <li key={i}>{act}</li>
                ))}
              </ul>
            </div>

            <DialogFooter className="pt-3 w-full flex justify-end">
              <Button onClick={handleClose} className="w-full sm:w-auto h-9 sm:h-10 text-xs sm:text-sm font-medium bg-[#1e2a78] hover:bg-[#152060] text-white">
                Close
              </Button>
            </DialogFooter>
          </div>
        ) : integrity ? (
          <div className="space-y-4 py-1 w-full box-border">
            <div className="flex items-center justify-between border-b pb-3 w-full">
              <div className="text-xs sm:text-sm font-medium">Identity Health Status</div>
              {integrity.isHealthy ? (
                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300">
                  Healthy
                </Badge>
              ) : (
                <Badge variant="destructive">Needs Repair</Badge>
              )}
            </div>

            {!integrity.isHealthy ? (
              <Alert variant="destructive" className="w-full box-border p-3.5 sm:p-4">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <AlertTitle className="text-sm font-semibold">Issues Detected</AlertTitle>
                <AlertDescription className="text-xs sm:text-sm mt-1 leading-relaxed break-words">
                  <ul className="list-disc pl-4 space-y-1">
                    {integrity.issues?.map((iss: string) => (
                      <li key={iss}>{iss.replace(/_/g, ' ')}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            ) : (
              <Alert className="w-full box-border p-3.5 sm:p-4 border-emerald-200 bg-emerald-50/70 text-emerald-900 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-300">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <AlertTitle className="text-sm font-semibold">No Issues Found</AlertTitle>
                <AlertDescription className="text-xs sm:text-sm text-emerald-700 dark:text-emerald-400 mt-1 leading-relaxed break-words">
                  The employee's authentication identity is properly synchronized. You can still reset temporary credentials if needed.
                </AlertDescription>
              </Alert>
            )}

            <div className="rounded-lg border p-3.5 sm:p-4 text-xs sm:text-sm space-y-2 bg-muted/20 w-full box-border">
              <div className="font-semibold text-foreground">
                Repair Plan: {integrity.repairRecommendation?.caseType}
              </div>
              <p className="text-muted-foreground leading-relaxed break-words">
                {integrity.repairRecommendation?.description}
              </p>
              <div className="space-y-1 pt-1">
                <div className="font-medium text-foreground">Proposed Remediation Steps:</div>
                <ul className="list-disc pl-4 space-y-1 text-muted-foreground leading-relaxed break-words">
                  {integrity.repairRecommendation?.actions?.map((act: string, i: number) => (
                    <li key={i}>{act}</li>
                  ))}
                </ul>
              </div>
            </div>

            <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-2.5 pt-3 w-full">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={repairing}
                className="w-full sm:w-auto h-9 sm:h-10 text-xs sm:text-sm font-medium"
              >
                Cancel
              </Button>
              <Button
                onClick={handleRepair}
                disabled={loading || repairing}
                className="bg-indigo-600 hover:bg-indigo-700 text-white w-full sm:w-auto h-9 sm:h-10 text-xs sm:text-sm font-medium shadow-sm"
              >
                {repairing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin shrink-0" />
                    Repairing Account...
                  </>
                ) : (
                  <>
                    <Key className="mr-2 h-4 w-4 shrink-0" />
                    Execute Repair & Issue Credentials
                  </>
                )}
              </Button>
            </DialogFooter>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
