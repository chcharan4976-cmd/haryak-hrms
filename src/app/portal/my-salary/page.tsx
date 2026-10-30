'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Info, IndianRupee, TrendingUp, History, ShieldCheck, Loader2, AlertCircle, RefreshCw } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { formatINR } from '@/lib/utils/format'
import { Button } from '@/components/ui/button'

export default function MySalaryPage() {
  const [compensation, setCompensation] = useState<any>(null)
  const [compensationLedger, setCompensationLedger] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const fetchCompensation = useCallback(async () => {
    setLoading(true)
    setErrorMessage(null)

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000)

    try {
      // 1. Resolve canonical self-service identity
      const meRes = await fetch('/api/portal/me', { signal: controller.signal })
      if (!meRes.ok) {
        const meErr = await meRes.json().catch(() => ({}))
        throw new Error(meErr.error || 'Failed to resolve employee identity.')
      }

      const meData = await meRes.json()
      const employeeId = meData.profile?.employeeId

      if (!employeeId) {
        throw new Error('Employee profile linkage could not be confirmed.')
      }

      // 2. Fetch employee compensation breakdown and annual compensation ledger in parallel
      const [compRes, ledgerRes] = await Promise.all([
        fetch(`/api/compensation/${employeeId}`, { signal: controller.signal }),
        fetch(`/api/leave/compensation-ledger`, { signal: controller.signal }).catch(() => null),
      ])
      clearTimeout(timeoutId)

      if (!compRes.ok) {
        const compErr = await compRes.json().catch(() => ({}))
        throw new Error(compErr.error || 'Failed to load compensation structure.')
      }

      const compData = await compRes.json()
      setCompensation(compData.compensation)

      if (ledgerRes && ledgerRes.ok) {
        const ledgerData = await ledgerRes.json()
        if (ledgerData.ledger) {
          setCompensationLedger(ledgerData.ledger)
        }
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        setErrorMessage('Request timed out while loading compensation details. Please retry.')
      } else {
        setErrorMessage(error.message || 'Unable to load salary structure.')
      }
      setCompensation(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchCompensation()
  }, [fetchCompensation])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-3">
        <Loader2 className="w-8 h-8 animate-spin text-[#1e2a78]" />
        <p className="text-xs text-muted-foreground">Loading verified compensation details...</p>
      </div>
    )
  }

  if (errorMessage) {
    return (
      <Card className="max-w-2xl mx-auto border-destructive/30 bg-destructive/5 mt-8">
        <CardContent className="p-6 flex flex-col items-center text-center space-y-3">
          <AlertCircle className="w-8 h-8 text-destructive" />
          <h2 className="text-sm font-bold text-destructive">Compensation Unavailable</h2>
          <p className="text-xs text-muted-foreground">{errorMessage}</p>
          <Button size="sm" variant="outline" onClick={fetchCompensation} className="text-xs">
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Retry
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (!compensation) {
    return (
      <div className="space-y-6 max-w-5xl mx-auto">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">My Salary Structure</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Confidential breakdown of your annual CTC, monthly earnings, and statutory contributions.
          </p>
        </div>
        <div className="p-12 text-center text-sm text-muted-foreground border rounded-xl bg-muted/20 border-dashed">
          No active salary structure is assigned to your profile. Contact HR Administration.
        </div>
      </div>
    )
  }

  const { basic_salary, hra, special_allowance, pf_deduction, pt_deduction, monthly_gross, ctc } = compensation

  const components = [
    { name: 'Basic Salary', type: 'Earning (50%)', monthly: formatINR(basic_salary), annual: formatINR(basic_salary * 12) },
    { name: 'House Rent Allowance (HRA)', type: 'Earning (25%)', monthly: formatINR(hra), annual: formatINR(hra * 12) },
    { name: 'Special Allowance', type: 'Earning (25%)', monthly: formatINR(special_allowance), annual: formatINR(special_allowance * 12) },
    { name: 'Employee Provident Fund (EPF)', type: 'Deduction (Statutory)', monthly: formatINR(pf_deduction), annual: formatINR(pf_deduction * 12) },
    { name: 'Professional Tax (PT)', type: 'Deduction (Statutory)', monthly: formatINR(pt_deduction), annual: formatINR(pt_deduction * 12) },
  ]

  return (
    <div className="space-y-6 w-full max-w-5xl mx-auto">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">My Salary Structure</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Confidential breakdown of your annual CTC, monthly earnings, and statutory contributions.
        </p>
      </div>

      {/* Security notice */}
      <div className="bg-blue-50 dark:bg-blue-950/30 p-3.5 rounded-xl flex items-start gap-3 border border-blue-200 dark:border-blue-900 text-xs">
        <ShieldCheck className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
        <p className="text-blue-800 dark:text-blue-300">
          This salary structure is governed by your official employment contract with Haryak Technologies India Private Limited.
        </p>
      </div>

      {/* Annual Paid-Leave Compensation Policy & Ledger Tracker */}
      <Card className="border border-blue-200 bg-blue-50/50 dark:border-blue-900/50 dark:bg-blue-950/20 shadow-xs">
        <CardContent className="p-4 sm:p-5 flex flex-col gap-3">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-[#1e2a78] dark:text-blue-400 shrink-0 mt-0.5" />
            <div className="space-y-1 text-xs">
              <h4 className="font-bold text-foreground">Annual Paid-Leave Compensation Policy (Monthly Deduction + Year-End Audit)</h4>
              <p className="text-muted-foreground">
                Employees receive <strong>11 annual paid-leave compensation days</strong> per calendar year. Under company policy, working-day leaves are initially deducted in the monthly payroll at the canonical daily rate:
                <span className="block mt-1 font-mono text-[11px] text-[#1e2a78] dark:text-blue-300">
                  Daily Salary Rate = Monthly Eligible Salary ÷ Scheduled Monthly Working Days
                </span>
                At the end of the calendar year, all verified working-day leave deductions up to 11 days are audited and reimbursed through a dedicated payroll settlement. Official Company Calendar public holidays are paid non-working days and are never deducted.
              </p>
            </div>
          </div>

          {/* Annual Compensation Ledger Status */}
          <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-3 border-t border-blue-200/60 dark:border-blue-900/60 text-xs">
            <div className="p-2.5 rounded-lg bg-card/80 border">
              <span className="text-[10px] text-muted-foreground block">Annual Entitlement</span>
              <span className="text-sm font-bold text-foreground">11 Days</span>
            </div>
            <div className="p-2.5 rounded-lg bg-card/80 border">
              <span className="text-[10px] text-muted-foreground block">Working Leaves Deducted</span>
              <span className="text-sm font-bold text-amber-700 dark:text-amber-400">
                {compensationLedger?.totalLeavesTaken ?? 0} Days (₹{(compensationLedger?.totalDeductionsAmount ?? 0).toLocaleString('en-IN')})
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-card/80 border">
              <span className="text-[10px] text-muted-foreground block">Eligible Compensation</span>
              <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400">
                {compensationLedger?.eligibleCompensationDays ?? 0} of 11 Days (₹{(compensationLedger?.eligibleCompensationAmount ?? 0).toLocaleString('en-IN')})
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-card/80 border">
              <span className="text-[10px] text-muted-foreground block">Settlement Status</span>
              <span className="text-sm font-bold text-[#1e2a78] dark:text-blue-300">
                {compensationLedger?.auditStatus === 'SETTLED' ? 'Settled in Payroll' :
                 compensationLedger?.auditStatus === 'APPROVED' ? `Approved (₹${(compensationLedger?.approvedCompensationAmount ?? 0).toLocaleString('en-IN')})` :
                 'Pending Year-End Audit'}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Overview Cards */}
      <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2">
        <Card className="shadow-xs border">
          <CardHeader className="p-4 sm:p-5 pb-2">
            <CardDescription className="text-xs">Annual Fixed CTC</CardDescription>
            <CardTitle className="text-xl sm:text-2xl font-bold text-blue-700 dark:text-blue-400">
              {formatINR(ctc)}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 sm:p-5 pt-0 text-xs text-muted-foreground">
            Cost to Company (Annual Basis)
          </CardContent>
        </Card>

        <Card className="shadow-xs border">
          <CardHeader className="p-4 sm:p-5 pb-2">
            <CardDescription className="text-xs">Monthly Gross Entitlement</CardDescription>
            <CardTitle className="text-xl sm:text-2xl font-bold text-foreground">
              {formatINR(monthly_gross)}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 sm:p-5 pt-0 text-xs text-muted-foreground">
            Monthly gross prior to statutory and tax deductions
          </CardContent>
        </Card>
      </div>

      {/* Detailed Components Table */}
      <Card className="shadow-xs border overflow-hidden">
        <CardHeader className="p-3 sm:p-4 pb-3 border-b bg-muted/20">
          <CardTitle className="text-base font-bold">Standard Compensation Breakdown</CardTitle>
          <CardDescription className="text-xs">Component allocation derived from approved company structure.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="relative w-full overflow-x-auto">
            <Table className="min-w-[560px]">
              <TableHeader className="bg-muted/30 text-[10px] uppercase tracking-wider">
                <TableRow>
                  <TableHead className="px-3 sm:px-4 py-3">Component</TableHead>
                  <TableHead className="px-3 sm:px-4 py-3">Type</TableHead>
                  <TableHead className="px-3 sm:px-4 py-3 text-right">Monthly (₹)</TableHead>
                  <TableHead className="px-3 sm:px-4 py-3 text-right">Annual (₹)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="text-xs divide-y">
                {components.map((c, i) => (
                  <TableRow key={i} className="hover:bg-muted/30">
                    <TableCell className="px-3 sm:px-4 py-3 font-semibold text-foreground">{c.name}</TableCell>
                    <TableCell className="px-3 sm:px-4 py-3 text-muted-foreground">{c.type}</TableCell>
                    <TableCell className="px-3 sm:px-4 py-3 text-right font-medium">{c.monthly}</TableCell>
                    <TableCell className="px-3 sm:px-4 py-3 text-right">{c.annual}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
