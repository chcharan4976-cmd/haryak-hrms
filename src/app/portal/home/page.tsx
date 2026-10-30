'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { CheckCircle2, CalendarOff, FileText, Clock, ArrowRight, User, XCircle, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { useAuth } from '@/components/providers/auth-provider'

export default function EmployeeHomePage() {
  const { user, profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [attendance, setAttendance] = useState<any>(null)
  const [leaveBalances, setLeaveBalances] = useState<any>(null)
  const [latestPayslip, setLatestPayslip] = useState<any>(null)

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good Morning' : hour < 18 ? 'Good Afternoon' : 'Good Evening'
  const currentDate = new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  
  const empName = profile?.first_name 
    ? `${profile.first_name} ${profile.last_name || ''}` 
    : user?.email?.split('@')[0] || 'Employee'

  const fetchDashboardData = async () => {
    if (!user) return
    
    try {
      setLoading(true)
      setError(null)
      const [attRes, leavesRes, payslipsRes] = await Promise.all([
        fetch('/api/attendance?date=today'),
        fetch('/api/leave/balances'),
        fetch('/api/payslips?limit=1')
      ])

      if (attRes.ok) {
        const data = await attRes.json()
        setAttendance(data.attendance?.[0] || null)
      }
      
      if (leavesRes.ok) {
        const data = await leavesRes.json()
        setLeaveBalances(data.balances || [])
      }
      
      if (payslipsRes.ok) {
        const data = await payslipsRes.json()
        setLatestPayslip(data.payslips?.[0] || null)
      }
    } catch (err: any) {
      console.error('Error fetching dashboard data:', err)
      setError(err?.message || 'Network error while loading dashboard')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDashboardData()
  }, [user])

  // Calculate total available leaves
  const totalAvailableLeaves = leaveBalances 
    ? leaveBalances.reduce((sum: number, bal: any) => sum + (bal.remaining_balance || 0), 0)
    : 0

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-[#1e2a78] to-[#121c52] p-4 sm:p-6 rounded-xl text-white shadow-xs">
        <div className="text-[11px] sm:text-xs font-semibold text-blue-200 uppercase tracking-wider mb-1">
          Haryak Technologies • Employee Self-Service
        </div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">{greeting}, {empName}!</h1>
        <p className="text-xs text-blue-100/80 mt-1">{currentDate} • Employee Portal</p>
      </div>

      {error && (
        <div className="p-3 sm:p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg flex items-center justify-between gap-3">
          <div className="text-xs text-red-700 dark:text-red-400 break-words min-w-0">
            {error}
          </div>
          <button 
            onClick={fetchDashboardData}
            className="px-3 py-1 bg-background text-xs border rounded-md font-medium hover:bg-muted shrink-0"
          >
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center items-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      ) : (
        <>
          {/* Quick Stats Row */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="shadow-xs border">
              <CardContent className="p-4 sm:p-5 flex items-center gap-3.5">
                <div className="p-2.5 bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 rounded-xl shrink-0">
                  {attendance?.status === 'PRESENT' ? <CheckCircle2 className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted-foreground truncate">Attendance Status</p>
                  <h3 className={`text-base font-bold truncate ${attendance?.status === 'PRESENT' ? 'text-emerald-700 dark:text-emerald-400' : 'text-foreground'}`}>
                    {attendance ? attendance.status : 'Not Marked'}
                  </h3>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-xs border">
              <CardContent className="p-4 sm:p-5 flex items-center gap-3.5">
                <div className="p-2.5 bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 rounded-xl shrink-0">
                  <CalendarOff className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted-foreground truncate">Available Leaves</p>
                  <h3 className="text-base font-bold text-foreground truncate">
                    {leaveBalances && leaveBalances.length > 0 ? `${totalAvailableLeaves} Days` : 'No Balance'}
                  </h3>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-xs border">
              <CardContent className="p-4 sm:p-5 flex items-center gap-3.5">
                <div className="p-2.5 bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 rounded-xl shrink-0">
                  <FileText className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted-foreground truncate">Latest Payslip</p>
                  <h3 className="text-base font-bold text-foreground truncate" title={latestPayslip?.period || 'None'}>
                    {latestPayslip ? latestPayslip.period : 'Not Available'}
                  </h3>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-xs border">
              <CardContent className="p-4 sm:p-5 flex items-center gap-3.5">
                <div className="p-2.5 bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 rounded-xl shrink-0">
                  <Clock className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted-foreground truncate">Shift Hours</p>
                  <h3 className="text-base font-bold text-foreground truncate">
                    {attendance?.shift?.start_time ? `${attendance.shift.start_time} - ${attendance.shift.end_time}` : 'Standard'}
                  </h3>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Quick Launchpad Navigation */}
          <div className="grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Link href="/portal/my-payslips">
              <Card className="hover:shadow-sm hover:border-blue-300 transition-all cursor-pointer h-full">
                <CardContent className="p-4 sm:p-5 space-y-2">
                  <div className="flex items-center justify-between">
                    <FileText className="w-5 h-5 text-blue-600" />
                    <ArrowRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <h3 className="font-bold text-sm text-foreground">My Payslips & Salary</h3>
                  <p className="text-xs text-muted-foreground">View and download your monthly statutory payslip statements.</p>
                </CardContent>
              </Card>
            </Link>

            <Link href="/portal/my-leaves">
              <Card className="hover:shadow-sm hover:border-blue-300 transition-all cursor-pointer h-full">
                <CardContent className="p-4 sm:p-5 space-y-2">
                  <div className="flex items-center justify-between">
                    <CalendarOff className="w-5 h-5 text-emerald-600" />
                    <ArrowRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <h3 className="font-bold text-sm text-foreground">Apply for Leave</h3>
                  <p className="text-xs text-muted-foreground">Submit leave applications, track approvals, and view balances.</p>
                </CardContent>
              </Card>
            </Link>

            <Link href="/portal/my-profile">
              <Card className="hover:shadow-sm hover:border-blue-300 transition-all cursor-pointer h-full">
                <CardContent className="p-4 sm:p-5 space-y-2">
                  <div className="flex items-center justify-between">
                    <User className="w-5 h-5 text-purple-600" />
                    <ArrowRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <h3 className="font-bold text-sm text-foreground">My Official Profile</h3>
                  <p className="text-xs text-muted-foreground">Inspect your employee ID, bank account details, and statutory info.</p>
                </CardContent>
              </Card>
            </Link>
          </div>
        </>
      )}
    </div>
  )
}
