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
import { Loader2, CheckCircle2, AlertTriangle, Key, Copy, Check, Wrench } from 'lucide-react'
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
        toast.success(data.message || 'Login account repaired successfully!')
        onRepaired?.()
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
      toast.success('Temporary password copied to clipboard')
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[540px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5 text-indigo-600" />
            Repair Employee Login Account
          </DialogTitle>
          <DialogDescription>
            Audit and reconcile authentication identity for {employeeName || 'Employee'}{' '}
            {employeeCode ? `(${employeeCode})` : ''}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-8 space-y-3">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
            <p className="text-sm text-muted-foreground">Auditing identity across Auth and Public tables...</p>
          </div>
        ) : repairResult ? (
          <div className="space-y-4 py-2">
            <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/40 p-4 border border-emerald-200 dark:border-emerald-800">
              <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-semibold mb-1">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                Login Account Repaired Successfully
              </div>
              <p className="text-sm text-emerald-700 dark:text-emerald-400">
                The employee can now log in using their official work email and the temporary password below.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Official Login Email</label>
              <div className="p-2.5 bg-muted rounded-md font-mono text-sm">
                {repairResult.officialEmail}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">New Temporary Password</label>
              <div className="flex items-center gap-2">
                <div className="flex-1 p-2.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-md font-mono text-sm font-semibold text-amber-900 dark:text-amber-200 tracking-wider">
                  {repairResult.temporaryPassword}
                </div>
                <Button variant="outline" size="icon" onClick={copyPassword} title="Copy password">
                  {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-amber-700 dark:text-amber-400">
                This temporary password is only displayed once. The employee will be required to change it upon first login.
              </p>
            </div>

            <div className="border rounded-md p-3 text-xs space-y-1 bg-muted/40">
              <div className="font-semibold text-foreground">Actions Executed ({repairResult.caseApplied}):</div>
              <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground">
                {repairResult.actionsPerformed?.map((act: string, i: number) => (
                  <li key={i}>{act}</li>
                ))}
              </ul>
            </div>
          </div>
        ) : integrity ? (
          <div className="space-y-4 py-2">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="text-sm font-medium">Identity Health Status</div>
              {integrity.isHealthy ? (
                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300">
                  Healthy
                </Badge>
              ) : (
                <Badge variant="destructive">Needs Repair</Badge>
              )}
            </div>

            {!integrity.isHealthy ? (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Issues Detected</AlertTitle>
                <AlertDescription className="text-xs mt-1">
                  <ul className="list-disc pl-4 space-y-0.5">
                    {integrity.issues?.map((iss: string) => (
                      <li key={iss}>{iss.replace(/_/g, ' ')}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            ) : (
              <Alert>
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <AlertTitle>No Issues Found</AlertTitle>
                <AlertDescription className="text-xs text-muted-foreground">
                  The employee's authentication identity is properly synchronized. You can still reset temporary credentials if needed.
                </AlertDescription>
              </Alert>
            )}

            <div className="rounded-md border p-3 text-xs space-y-2 bg-muted/20">
              <div className="font-semibold text-foreground">
                Repair Plan: {integrity.repairRecommendation?.caseType}
              </div>
              <p className="text-muted-foreground">
                {integrity.repairRecommendation?.description}
              </p>
              <div className="space-y-1">
                <div className="font-medium text-foreground">Proposed Remediation Steps:</div>
                <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground">
                  {integrity.repairRecommendation?.actions?.map((act: string, i: number) => (
                    <li key={i}>{act}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        ) : null}

        <DialogFooter>
          {repairResult ? (
            <Button onClick={() => onOpenChange(false)}>Close</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={repairing}>
                Cancel
              </Button>
              <Button
                onClick={handleRepair}
                disabled={loading || repairing}
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                {repairing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Repairing Account...
                  </>
                ) : (
                  <>
                    <Key className="mr-2 h-4 w-4" />
                    Execute Repair & Issue Credentials
                  </>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
