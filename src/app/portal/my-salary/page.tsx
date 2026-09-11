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

      // 2. Fetch employee compensation breakdown
      const compRes = await fetch(`/api/compensation/${employeeId}`, { signal: controller.signal })
      clearTimeout(timeoutId)

      if (!compRes.ok) {
        const compErr = await compRes.json().catch(() => ({}))
        throw new Error(compErr.error || 'Failed to load compensation structure.')
      }

      const compData = await compRes.json()
      setCompensation(compData.compensation)
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
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">My Salary Structure</h1>
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

      {/* Overview Cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="shadow-xs border">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">Annual Fixed CTC</CardDescription>
            <CardTitle className="text-2xl font-bold text-blue-700 dark:text-blue-400">
              {formatINR(ctc)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Cost to Company (Annual Basis)
          </CardContent>
        </Card>

        <Card className="shadow-xs border">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">Monthly Gross Entitlement</CardDescription>
            <CardTitle className="text-2xl font-bold text-foreground">
              {formatINR(monthly_gross)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Monthly gross prior to statutory and tax deductions
          </CardContent>
        </Card>
      </div>

      {/* Detailed Components Table */}
      <Card className="shadow-xs border">
        <CardHeader className="pb-3 border-b bg-muted/20">
          <CardTitle className="text-base font-bold">Standard Compensation Breakdown</CardTitle>
          <CardDescription className="text-xs">Component allocation derived from approved company structure.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/50 text-[10px] uppercase">
                <TableRow>
                  <TableHead className="px-4 py-3">Component</TableHead>
                  <TableHead className="px-4 py-3">Type</TableHead>
                  <TableHead className="px-4 py-3 text-right">Monthly (₹)</TableHead>
                  <TableHead className="px-4 py-3 text-right">Annual (₹)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="text-xs divide-y">
                {components.map((c, i) => (
                  <TableRow key={i} className="hover:bg-muted/30">
                    <TableCell className="px-4 py-3 font-semibold text-foreground">{c.name}</TableCell>
                    <TableCell className="px-4 py-3 text-muted-foreground">{c.type}</TableCell>
                    <TableCell className="px-4 py-3 text-right font-medium">{c.monthly}</TableCell>
                    <TableCell className="px-4 py-3 text-right">{c.annual}</TableCell>
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
