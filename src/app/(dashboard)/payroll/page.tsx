'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Plus, IndianRupee, Users, FileText, CheckCircle, Clock, Wallet, ArrowRight, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/lib/utils/format'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/shared/empty-state'
import { PageHeader } from '@/components/shared/page-header'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'

export default function PayrollDashboard() {
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const currentMonth = new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch('/api/dashboard/stats')
        const data = await res.json()
        if (data.success && data.stats) {
          setStats(data.stats)
        }
      } catch (err) {
        console.error('Error fetching payroll stats:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchStats()
  }, [])

  const totalEmployees = stats?.totalEmployees || 0
  const totalGross = stats?.estimatedGross || 0
  const totalDeductions = stats?.estimatedDeductions || 0
  const totalNet = stats?.estimatedNet || 0

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payroll Control Center"
        description="Comprehensive payroll processing, salary calculations, and statutory compliance."
      >
        <Link href="/payroll/run">
          <Button className="bg-[#1e2a78] hover:bg-[#152060] text-white text-xs font-semibold shadow-sm">
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Execute Payroll Run
          </Button>
        </Link>
      </PageHeader>

      {/* Current Cycle Card */}
      <Card className="shadow-xs border overflow-hidden">
        <CardHeader className="p-4 sm:p-6 border-b bg-muted/20">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-base font-bold">Current Payroll Period</CardTitle>
                <Badge className={
                  totalEmployees === 0
                    ? "bg-muted text-muted-foreground border"
                    : "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border-blue-200"
                }>
                  {totalEmployees === 0 ? 'NOT STARTED' : 'ACTIVE / OPEN'}
                </Badge>
              </div>
              <CardDescription className="text-xs mt-1">
                Processing cycle for {currentMonth}
              </CardDescription>
            </div>

            <Link href="/payroll/run">
              <Button size="sm" className="bg-[#1e2a78] hover:bg-[#152060] text-white text-xs font-semibold w-full sm:w-auto h-9">
                Open Calculation Worksheet <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-border">
            <div className="p-4 sm:p-5">
              <span className="text-xs text-muted-foreground block">Eligible Workforce</span>
              <span className="text-xl sm:text-2xl font-bold text-foreground mt-1 block truncate">
                {loading ? '...' : totalEmployees}
              </span>
              <span className="text-[11px] text-muted-foreground mt-0.5 block">Active company employees</span>
            </div>

            <div className="p-4 sm:p-5">
              <span className="text-xs text-muted-foreground block">Gross Pay</span>
              <span className="text-xl sm:text-2xl font-bold text-foreground mt-1 block truncate">
                {loading ? '...' : formatCurrency(totalGross)}
              </span>
              <span className="text-[11px] text-muted-foreground mt-0.5 block">Total salary commitments</span>
            </div>

            <div className="p-4 sm:p-5">
              <span className="text-xs text-muted-foreground block">Statutory Deductions</span>
              <span className="text-xl sm:text-2xl font-bold text-destructive mt-1 block truncate">
                {loading ? '...' : formatCurrency(totalDeductions)}
              </span>
              <span className="text-[11px] text-muted-foreground mt-0.5 block">PF, Professional Tax & TDS</span>
            </div>

            <div className="p-4 sm:p-5">
              <span className="text-xs text-muted-foreground block">Net Payout</span>
              <span className="text-xl sm:text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1 block truncate">
                {loading ? '...' : formatCurrency(totalNet)}
              </span>
              <span className="text-[11px] text-muted-foreground mt-0.5 block">Net disbursement to bank</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Historical Payroll Runs */}
      <Card>
        <CardHeader className="p-4 sm:p-6 pb-3 sm:pb-3 border-b">
          <CardTitle className="text-base font-bold">Historical Payroll Records</CardTitle>
          <CardDescription className="text-xs">Archive of closed and approved payroll runs</CardDescription>
        </CardHeader>
        <CardContent className="p-4 sm:p-6">
          {totalEmployees === 0 ? (
            <EmptyState
              icon={Wallet}
              title="No payroll has been processed yet."
              description="When you complete and approve a monthly payroll run, the locked records and compliance summaries will appear here."
              action={
                <Link href="/payroll/run">
                  <Button className="bg-[#1e2a78] hover:bg-[#152060] text-white text-xs font-semibold">
                    <Plus className="w-3.5 h-3.5 mr-1.5" /> Prepare Payroll
                  </Button>
                </Link>
              }
            />
          ) : (
            <div className="p-4 rounded-xl border bg-muted/20 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <span className="font-semibold text-foreground block">{currentMonth} — Preparation Open</span>
                <span className="text-muted-foreground">{totalEmployees} employees ready for final review and approval.</span>
              </div>
              <Link href="/payroll/run" className="shrink-0">
                <Button size="sm" variant="outline" className="text-xs w-full sm:w-auto h-9">
                  Review Worksheet
                </Button>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
