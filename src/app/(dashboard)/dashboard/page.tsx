'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Activity,
  ArrowRight,
  CheckSquare,
  ChevronRight,
  Download,
  ShieldCheck,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react'

import { useAuth } from '@/components/providers/auth-provider'
import { StatCard } from '@/components/shared/stat-card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { formatCurrency } from '@/lib/utils/format'

type DepartmentStat = {
  name: string
  count: number
  percentage: number
  color: string
}

type RecentActivity = {
  id: string
  actor: string
  action: string
  target: string
  time: string
}

type DashboardStats = {
  totalEmployees: number
  activeEmployees: number
  onLeaveToday: number
  pendingApprovals: number
  estimatedGross: number
  estimatedDeductions: number
  estimatedNet: number
  status: string
  departments: DepartmentStat[]
  recentActivity: RecentActivity[]
}

const initialStats: DashboardStats = {
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
}

export default function DashboardPage() {
  const { profile } = useAuth()

  const now = new Date()
  const hour = now.getHours()

  const greeting =
    hour < 12
      ? 'Good Morning'
      : hour < 17
        ? 'Good Afternoon'
        : 'Good Evening'

  const adminName = profile?.first_name
    ? `${profile.first_name} ${profile.last_name || ''}`.trim()
    : 'Administrator'

  const currentDate = now.toLocaleDateString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const currentPayrollMonth = now.toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
  })

  const [stats, setStats] = useState<DashboardStats>(initialStats)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchStats = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/dashboard/stats')

      if (!response.ok) {
        if (response.status === 401) {
          setError('Your session has expired. Please log in again to refresh statistics.')
        } else if (response.status === 403) {
          setError('Access denied: Administrator privileges are required to view statistics.')
        } else {
          setError('Unable to load latest dashboard statistics. Displaying baseline numbers.')
        }
        return
      }

      const data = await response.json()

      if (data.success && data.stats) {
        setStats((previous) => ({
          ...previous,
          ...data.stats,
          departments: Array.isArray(data.stats.departments)
            ? data.stats.departments
            : [],
          recentActivity: Array.isArray(data.stats.recentActivity)
            ? data.stats.recentActivity
            : [],
        }))
        setError(null)
      } else {
        setError(data.error || 'Failed to load dashboard statistics.')
      }
    } catch (err) {
      console.error('Error loading dashboard stats:', err)
      setError('Network communication error while loading dashboard statistics.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchStats()
  }, [])

  return (
    <div className="space-y-6">
      {/* User-friendly Error Alert with Retry Action */}
      {error && (
        <div className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 shadow-sm sm:flex-row sm:items-center sm:justify-between dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <span>{error}</span>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void fetchStats()}
            className="h-8 shrink-0 border-amber-300 bg-white text-amber-900 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200 dark:hover:bg-amber-900/50"
          >
            Retry
          </Button>
        </div>
      )}

      {/* Executive Welcome Header */}
      <div className="flex flex-col gap-4 rounded-xl bg-gradient-to-r from-[#1e2a78] to-[#121c52] p-4 sm:p-6 text-white shadow-sm md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-semibold text-blue-200 backdrop-blur-sm">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
            <span>Executive Administration Hub</span>
          </div>

          <h1 className="text-xl sm:text-2xl font-bold tracking-tight break-words">
            {greeting}, {adminName}
          </h1>

          <p className="mt-1 text-xs text-blue-100/80 sm:text-sm break-words">
            {currentDate} • Current Payroll Cycle:{' '}
            <span className="font-semibold text-white">
              {currentPayrollMonth}
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3 shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white h-9 px-3 text-xs sm:text-sm"
            asChild
          >
            <Link href="/reports">
              <Download className="mr-2 h-4 w-4 shrink-0" />
              Download Reports
            </Link>
          </Button>

          <Button
            size="sm"
            className="bg-white font-semibold text-[#1e2a78] shadow-sm hover:bg-blue-50 h-9 px-3 text-xs sm:text-sm"
            asChild
          >
            <Link href="/payroll">
              <Wallet className="mr-2 h-4 w-4 shrink-0" />
              Payroll Control
            </Link>
          </Button>
        </div>
      </div>

      {/* Executive Metric Cards */}
      <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Workforce"
          value={loading ? '...' : stats.totalEmployees}
          description={
            loading
              ? 'Loading workforce data...'
              : `${stats.activeEmployees} active ${
                  stats.activeEmployees === 1 ? 'employee' : 'employees'
                } in directory`
          }
          icon={Users}
        />

        <StatCard
          title="Estimated Net Payout"
          value={loading ? '...' : formatCurrency(stats.estimatedNet)}
          description={
            loading
              ? 'Loading payroll projection...'
              : stats.totalEmployees > 0
                ? `${currentPayrollMonth} projected payout`
                : 'No payroll projection available'
          }
          icon={TrendingUp}
        />

        <StatCard
          title="Current Payroll Gross"
          value={loading ? '...' : formatCurrency(stats.estimatedGross)}
          description={
            loading
              ? 'Loading payroll data...'
              : stats.totalEmployees > 0
                ? `${stats.totalEmployees} ${
                    stats.totalEmployees === 1 ? 'employee' : 'employees'
                  } eligible for this cycle`
                : 'No employees added yet'
          }
          icon={Wallet}
        />

        <StatCard
          title="Pending Approvals"
          value={loading ? '...' : stats.pendingApprovals}
          description={
            loading
              ? 'Checking approval queue...'
              : stats.pendingApprovals === 0
                ? 'All requests cleared'
                : 'Action required in queue'
          }
          icon={CheckSquare}
        />
      </div>

      {/* Main Dashboard Hub */}
      <div className="grid gap-4 sm:gap-6 grid-cols-1 lg:grid-cols-7">
        {/* Payroll Operations */}
        <Card className="border shadow-sm lg:col-span-4">
          <CardHeader className="border-b bg-muted/20 pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-4">
              <div>
                <CardTitle className="flex items-center gap-2 text-base font-bold">
                  <Wallet className="h-4 w-4 text-[#1e2a78] dark:text-blue-400 shrink-0" />
                  Payroll Operations Status
                </CardTitle>

                <CardDescription className="text-xs">
                  Cycle for {currentPayrollMonth}
                </CardDescription>
              </div>

              <Badge
                className={
                  stats.totalEmployees === 0
                    ? 'border bg-muted text-muted-foreground'
                    : 'border-blue-200 bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                }
              >
                {stats.totalEmployees === 0
                  ? 'NOT STARTED'
                  : 'ACTIVE / OPEN'}
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="space-y-5 p-6 text-xs">
            <div className="grid grid-cols-1 gap-3 rounded-xl border bg-muted/40 p-3.5 text-center sm:grid-cols-3">
              <div>
                <span className="block text-[11px] text-muted-foreground">
                  Estimated Gross
                </span>

                <span className="text-sm font-bold text-foreground">
                  {loading
                    ? '...'
                    : formatCurrency(stats.estimatedGross)}
                </span>
              </div>

              <div>
                <span className="block text-[11px] text-muted-foreground">
                  Statutory Deductions
                </span>

                <span className="text-sm font-bold text-destructive">
                  {loading
                    ? '...'
                    : formatCurrency(stats.estimatedDeductions)}
                </span>
              </div>

              <div>
                <span className="block text-[11px] text-muted-foreground">
                  Estimated Net Payout
                </span>

                <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                  {loading
                    ? '...'
                    : formatCurrency(stats.estimatedNet)}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3 font-medium">
                <span>Eligible Workforce Prepared</span>

                <span className="text-muted-foreground">
                  {loading
                    ? '...'
                    : `${stats.totalEmployees} ${
                        stats.totalEmployees === 1
                          ? 'Employee'
                          : 'Employees'
                      }`}
                </span>
              </div>

              <Progress
                value={
                  !loading && stats.totalEmployees > 0
                    ? 100
                    : 0
                }
                className="h-2"
              />
            </div>

            <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-[11px] text-muted-foreground">
                {loading
                  ? 'Loading payroll readiness...'
                  : stats.totalEmployees === 0
                    ? 'Add employees to enable payroll preparation'
                    : 'Ready for review & execution'}
              </span>

              <Button
                size="sm"
                className="bg-[#1e2a78] text-xs font-semibold text-white hover:bg-[#152060]"
                asChild
              >
                <Link href="/payroll">
                  Open Payroll Center
                  <ChevronRight className="ml-1 h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Department Distribution */}
        <Card className="border shadow-sm lg:col-span-3">
          <CardHeader className="border-b bg-muted/20 pb-3">
            <CardTitle className="flex items-center gap-2 text-base font-bold">
              <Users className="h-4 w-4 text-[#1e2a78] dark:text-blue-400 shrink-0" />
              Department Distribution
            </CardTitle>

            <CardDescription className="text-xs">
              Live workforce division
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4 p-4 sm:p-6 text-xs">
            {loading ? (
              <div className="py-8 text-center text-muted-foreground">
                <Activity className="mx-auto mb-2 h-8 w-8 animate-pulse text-muted-foreground/50" />
                <p className="font-semibold text-foreground">
                  Loading department statistics
                </p>
                <p className="mt-1 text-[11px]">
                  Retrieving current workforce distribution.
                </p>
              </div>
            ) : stats.departments.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                <Users className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />

                <p className="font-semibold text-foreground">
                  No departments recorded
                </p>

                <p className="mt-1 text-[11px]">
                  Department statistics will populate automatically when
                  employees are onboarded.
                </p>
              </div>
            ) : (
              stats.departments.map((department) => (
                <div key={department.name} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="font-medium">
                      {department.name}
                    </span>

                    <span className="font-mono text-muted-foreground">
                      {department.count} ({department.percentage}%)
                    </span>
                  </div>

                  <Progress
                    value={department.percentage}
                    className="h-1.5"
                  />
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent System & Audit Activity */}
      <Card className="border shadow-sm">
        <CardHeader className="border-b pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base font-bold">
                <Activity className="h-4 w-4 text-[#1e2a78] dark:text-blue-400" />
                Recent System Activity & Audit Trail
              </CardTitle>

              <CardDescription className="text-xs">
                Real-time governance and administrative actions
              </CardDescription>
            </div>

            <Button
              variant="ghost"
              size="sm"
              className="self-start text-xs text-blue-700 hover:text-blue-800 sm:self-auto"
              asChild
            >
              <Link href="/audit">
                View Full Audit Logs
                <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-4 sm:p-6">
          {loading ? (
            <div className="py-8 text-center text-muted-foreground">
              <Activity className="mx-auto mb-2 h-8 w-8 animate-pulse text-muted-foreground/50" />

              <p className="font-semibold text-foreground">
                Loading recent activity
              </p>

              <p className="mt-1 text-[11px]">
                Retrieving the latest administrative actions.
              </p>
            </div>
          ) : stats.recentActivity.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              <Activity className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />

              <p className="font-semibold text-foreground">
                No recent audit activity recorded
              </p>

              <p className="mt-1 text-[11px]">
                Administrative actions such as employee creation,
                credential changes, and payroll approvals will appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-3 text-xs">
              {stats.recentActivity.map((activity) => (
                <div
                  key={activity.id}
                  className="flex flex-col gap-2 rounded-lg border bg-muted/40 p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="h-2 w-2 shrink-0 rounded-full bg-blue-600" />

                    <div className="min-w-0 break-words">
                      <span className="font-semibold text-foreground">
                        {activity.action}
                      </span>

                      <span className="ml-2 text-muted-foreground break-words">
                        by {activity.actor} ({activity.target})
                      </span>
                    </div>
                  </div>

                  <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                    {activity.time}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}