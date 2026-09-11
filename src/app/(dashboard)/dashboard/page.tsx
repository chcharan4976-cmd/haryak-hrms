'use client'

import { useState, useEffect } from 'react'
import { PageHeader } from '@/components/shared/page-header'
import { StatCard } from '@/components/shared/stat-card'
import {
  Users, Clock, CalendarOff, CheckSquare, Activity, Wallet,
  Download, ArrowRight, ShieldCheck, AlertCircle, TrendingUp,
  UserPlus, Award, Cake, Calendar, FileText, CheckCircle2, ChevronRight,
  Loader2
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { useAuth } from '@/components/providers/auth-provider'
import Link from 'next/link'
import { formatCurrency } from '@/lib/utils/format'

export default function DashboardPage() {
  const { user, profile } = useAuth()
  const now = new Date()
  const hour = now.getHours()
  const greeting = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening'
  const adminName = profile?.first_name ? `${profile.first_name} ${profile.last_name || ''}` : 'Administrator'

  const currentDate = now.toLocaleDateString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })

  const currentPayrollMonth = now.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })

  const [stats, setStats] = useState<{
    totalEmployees: number
    activeEmployees: number
    onLeaveToday: number
    pendingApprovals: number
    estimatedGross: number
    estimatedDeductions: number
    estimatedNet: number
    status: string
    departments: Array<{ name: string; count: number; percentage: number; color: string }>
    recentActivity: Array<{ id: string; actor: string; action: string; target: string; time: string }>
  }>({
    totalEmployees: 0,
    activeEmployees: 0,
    onLeaveToday: 0,
    pendingApprovals: 0,
    estimatedGross: 0,
    estimatedDeductions: 0,
    estimatedNet: 0,
    status: 'NOT_STARTED',
    departments: [],
    recentActivity: [],
  })

  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch('/api/dashboard/stats')
        const data = await res.json()
        if (data.success && data.stats) {
          setStats(data.stats)
        }
      } catch (err) {
        console.error('Error loading dashboard stats:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchStats()
  }, [])

  return (
    <div className="space-y-6">
      {/* Executive Welcome & Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-[#1e2a78] to-[#121c52] p-6 rounded-xl text-white shadow-sm">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-white/10 text-xs font-semibold backdrop-blur-sm mb-2 text-blue-200">
            <ShieldCheck className="w-3.5 h-3.5" />
            Executive Administration Hub
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{greeting}, {adminName}</h1>
          <p className="text-xs sm:text-sm text-blue-100/80 mt-1">
            {currentDate} • Current Payroll Cycle: <span className="font-semibold text-white">{currentPayrollMonth}</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" className="bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white" asChild>
            <Link href="/reports">
              <Download className="mr-2 h-4 w-4" />
              Download Reports
            </Link>
          </Button>
          <Button size="sm" className="bg-white text-[#1e2a78] hover:bg-blue-50 font-semibold shadow-sm" asChild>
            <Link href="/payroll">
              <Wallet className="mr-2 h-4 w-4" />
              Payroll Control
            </Link>
          </Button>
        </div>
      </div>

      {/* Metric Cards - Connected to Real Data */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Workforce"
          value={loading ? '...' : stats.totalEmployees}
          description={`${stats.activeEmployees} active employees in directory`}
          icon={Users}
        />
        <StatCard
          title="Attendance Today"
          value={loading ? '...' : `${stats.activeEmployees - stats.onLeaveToday}/${stats.activeEmployees}`}
          description={`${stats.onLeaveToday} on leave today`}
          icon={Clock}
        />
        <StatCard
          title="Current Payroll Gross"
          value={loading ? '...' : formatCurrency(stats.estimatedGross)}
          description={stats.totalEmployees > 0 ? `${stats.totalEmployees} eligible for this cycle` : 'No employees added yet'}
          icon={Wallet}
        />
        <StatCard
          title="Pending Approvals"
          value={loading ? '...' : stats.pendingApprovals}
          description={stats.pendingApprovals === 0 ? 'All requests cleared' : 'Action required in queue'}
          icon={CheckSquare}
        />
      </div>

      {/* Main Two-Column Hub */}
      <div className="grid gap-6 md:grid-cols-7">
        {/* Left Column: Payroll Operation Window */}
        <Card className="md:col-span-4 shadow-sm border">
          <CardHeader className="pb-3 border-b bg-muted/20">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <Wallet className="w-4 h-4 text-[#1e2a78] dark:text-blue-400" />
                  Payroll Operations Status
                </CardTitle>
                <CardDescription className="text-xs">
                  Cycle for {currentPayrollMonth}
                </CardDescription>
              </div>
              <Badge className={
                stats.totalEmployees === 0
                  ? "bg-muted text-muted-foreground border"
                  : "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border-blue-200"
              }>
                {stats.totalEmployees === 0 ? 'NOT STARTED' : 'ACTIVE / OPEN'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-6 space-y-5 text-xs">
            <div className="grid grid-cols-3 gap-3 p-3.5 bg-muted/40 rounded-xl border text-center">
              <div>
                <span className="text-[11px] text-muted-foreground block">Estimated Gross</span>
                <span className="text-sm font-bold text-foreground">{formatCurrency(stats.estimatedGross)}</span>
              </div>
              <div>
                <span className="text-[11px] text-muted-foreground block">Statutory Deductions</span>
                <span className="text-sm font-bold text-destructive">{formatCurrency(stats.estimatedDeductions)}</span>
              </div>
              <div>
                <span className="text-[11px] text-muted-foreground block">Estimated Net Payout</span>
                <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(stats.estimatedNet)}</span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between font-medium">
                <span>Eligible Workforce Prepared</span>
                <span className="text-muted-foreground">{stats.totalEmployees} Employees</span>
              </div>
              <Progress value={stats.totalEmployees > 0 ? 100 : 0} className="h-2" />
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-muted-foreground text-[11px]">
                {stats.totalEmployees === 0 ? 'Add employees to enable payroll preparation' : 'Ready for review & execution'}
              </span>
              <Button size="sm" className="bg-[#1e2a78] hover:bg-[#152060] text-white text-xs font-semibold" asChild>
                <Link href="/payroll">
                  Open Payroll Center <ChevronRight className="w-3.5 h-3.5 ml-1" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Right Column: Department Breakdown & System Activity */}
        <Card className="md:col-span-3 shadow-sm border">
          <CardHeader className="pb-3 border-b bg-muted/20">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Users className="w-4 h-4 text-[#1e2a78] dark:text-blue-400" />
              Department Distribution
            </CardTitle>
            <CardDescription className="text-xs">
              Live workforce division
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-4 text-xs">
            {stats.departments.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                <Users className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />
                <p className="font-semibold text-foreground">No departments recorded</p>
                <p className="text-[11px] mt-1">Department statistics will populate automatically when employees are onboarded.</p>
              </div>
            ) : (
              stats.departments.map((dept) => (
                <div key={dept.name} className="space-y-1.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-medium">{dept.name}</span>
                    <span className="text-muted-foreground font-mono">{dept.count} ({dept.percentage}%)</span>
                  </div>
                  <Progress value={dept.percentage} className="h-1.5" />
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent System & Audit Activity */}
      <Card className="shadow-sm border">
        <CardHeader className="pb-3 border-b">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <Activity className="w-4 h-4 text-[#1e2a78] dark:text-blue-400" />
                Recent System Activity & Audit Trail
              </CardTitle>
              <CardDescription className="text-xs">
                Real-time governance and administrative actions
              </CardDescription>
            </div>
            <Link href="/audit">
              <Button variant="ghost" size="sm" className="text-xs text-blue-700 hover:text-blue-800">
                View Full Audit Logs <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          {stats.recentActivity.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              <Activity className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />
              <p className="font-semibold text-foreground">No recent audit activity recorded</p>
              <p className="text-[11px] mt-1">Administrative actions such as employee creation, credential changes, and payroll approvals will appear here.</p>
            </div>
          ) : (
            <div className="space-y-3 text-xs">
              {stats.recentActivity.map((act) => (
                <div key={act.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/40 border">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-blue-600" />
                    <div>
                      <span className="font-semibold text-foreground">{act.action}</span>
                      <span className="text-muted-foreground ml-2">by {act.actor} ({act.target})</span>
                    </div>
                  </div>
                  <span className="text-muted-foreground font-mono text-[11px]">{act.time}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
