'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CheckCircle2, XCircle, Clock, CalendarOff, Briefcase, Loader2, Fingerprint } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/components/providers/auth-provider'

export default function MyAttendancePage() {
  const { user } = useAuth()
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [checkingIn, setCheckingIn] = useState(false)
  const [summary, setSummary] = useState({ present: 0, wfh: 0, paidLeave: 0, lop: 0, absent: 0, pending: 0 })

  const currentMonth = new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })

  const fetchAttendance = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/attendance')
      if (res.ok) {
        const data = await res.json()
        setLogs(data.attendance || [])
        
        // Calculate summary
        const sum = { present: 0, wfh: 0, paidLeave: 0, lop: 0, absent: 0, pending: 0 }
        data.attendance?.forEach((log: any) => {
          const s = String(log.status || '').toUpperCase()
          if (s === 'PRESENT') sum.present++
          else if (s === 'WFH') sum.wfh++
          else if (s === 'PAID_LEAVE' || s === 'PAID LEAVE' || s === 'LEAVE') sum.paidLeave++
          else if (s === 'UNPAID_LEAVE' || s === 'UNPAID LEAVE / LOP' || s === 'LOP') sum.lop++
          else if (s === 'PENDING_TIMESHEET' || s === 'PENDING TIMESHEET') sum.pending++
          else if (s === 'ABSENT' || s === 'MISSING_ATTENDANCE' || s === 'MISSING ATTENDANCE') sum.absent++
        })
        setSummary(sum)
      }
    } catch (error) {
      console.error('Error fetching attendance:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (user) {
      fetchAttendance()
    }
  }, [user])

  const handleWebCheck = async (type: 'in' | 'out') => {
    try {
      setCheckingIn(true)
      const res = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type })
      })
      if (res.ok) {
        fetchAttendance()
      }
    } catch (error) {
      console.error('Check-in error:', error)
    } finally {
      setCheckingIn(false)
    }
  }

  const getStatusBadge = (status: string) => {
    const s = String(status || '').toUpperCase()
    if (s === 'PRESENT') {
      return <Badge className="bg-emerald-100 text-emerald-800 text-[10px]"><CheckCircle2 className="w-3 h-3 mr-1"/> Present</Badge>
    }
    if (s === 'PAID_LEAVE' || s === 'PAID LEAVE' || s === 'LEAVE') {
      return <Badge className="bg-blue-100 text-blue-800 text-[10px]"><CalendarOff className="w-3 h-3 mr-1"/> Paid Leave</Badge>
    }
    if (s === 'UNPAID_LEAVE' || s === 'UNPAID LEAVE / LOP' || s === 'LOP') {
      return <Badge className="bg-orange-100 text-orange-800 text-[10px]"><CalendarOff className="w-3 h-3 mr-1"/> LOP / Unpaid</Badge>
    }
    if (s === 'PUBLIC_HOLIDAY' || s === 'PUBLIC HOLIDAY') {
      return <Badge className="bg-purple-100 text-purple-800 text-[10px]">Public Holiday</Badge>
    }
    if (s === 'WEEKLY_OFF' || s === 'WEEKLY OFF') {
      return <Badge className="bg-slate-100 text-slate-800 text-[10px]">Weekly Off</Badge>
    }
    if (s === 'PENDING_TIMESHEET' || s === 'PENDING TIMESHEET') {
      return <Badge className="bg-amber-100 text-amber-800 text-[10px]"><Clock className="w-3 h-3 mr-1"/> Pending Timesheet</Badge>
    }
    if (s === 'WFH') {
      return <Badge className="bg-purple-100 text-purple-800 text-[10px]"><Briefcase className="w-3 h-3 mr-1"/> WFH</Badge>
    }
    if (s === 'ABSENT' || s === 'MISSING_ATTENDANCE' || s === 'MISSING ATTENDANCE') {
      return <Badge className="bg-red-100 text-red-800 text-[10px]"><XCircle className="w-3 h-3 mr-1"/> Absent / Missing</Badge>
    }
    return <Badge variant="secondary">{status || 'Not Marked'}</Badge>
  }

  // Find if checked in today
  const todayStr = new Date().toISOString().split('T')[0]
  const todayLog = logs.find(log => log.date === todayStr)
  const isCheckedIn = !!todayLog?.check_in_time
  const isCheckedOut = !!todayLog?.check_out_time

  return (
    <div className="space-y-6 w-full max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4 border-b pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">My Attendance & Punch Logs</h1>
          <p className="text-xs text-muted-foreground mt-1">Biometric time log summary for {currentMonth}.</p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          {!isCheckedIn ? (
            <Button 
              size="sm" 
              className="h-9 w-full sm:w-auto bg-[#1e2a78] text-white text-xs" 
              onClick={() => handleWebCheck('in')}
              disabled={checkingIn}
            >
              {checkingIn ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Fingerprint className="w-4 h-4 mr-2" />}
              Web Check-In
            </Button>
          ) : !isCheckedOut ? (
            <Button 
              size="sm" 
              variant="destructive"
              className="h-9 w-full sm:w-auto text-xs" 
              onClick={() => handleWebCheck('out')}
              disabled={checkingIn}
            >
              {checkingIn ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Fingerprint className="w-4 h-4 mr-2" />}
              Web Check-Out
            </Button>
          ) : (
            <Button size="sm" variant="outline" disabled className="h-9 w-full sm:w-auto text-xs">
              <CheckCircle2 className="w-4 h-4 mr-2 text-emerald-600" /> Day Completed
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-2.5 sm:gap-3 grid-cols-2 sm:grid-cols-4">
        <Card className="p-3 sm:p-4 shadow-xs border text-center">
          <span className="text-[11px] text-muted-foreground block truncate">Present Days</span>
          <span className="text-lg sm:text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-1 block">{summary.present}</span>
        </Card>
        <Card className="p-3 sm:p-4 shadow-xs border text-center">
          <span className="text-[11px] text-muted-foreground block truncate">Paid Leave</span>
          <span className="text-lg sm:text-xl font-bold text-blue-600 dark:text-blue-400 mt-1 block">{summary.paidLeave}</span>
        </Card>
        <Card className="p-3 sm:p-4 shadow-xs border text-center">
          <span className="text-[11px] text-muted-foreground block truncate">Loss of Pay (LOP)</span>
          <span className="text-lg sm:text-xl font-bold text-orange-600 dark:text-orange-400 mt-1 block">{summary.lop}</span>
        </Card>
        <Card className="p-3 sm:p-4 shadow-xs border text-center">
          <span className="text-[11px] text-muted-foreground block truncate">Missing / Absent</span>
          <span className="text-lg sm:text-xl font-bold text-destructive mt-1 block">{summary.absent}</span>
        </Card>
      </div>

      <Card className="shadow-xs border overflow-hidden">
        <CardHeader className="p-3 sm:p-4 pb-3 border-b bg-muted/20">
          <CardTitle className="text-sm font-bold">Punch In / Punch Out Activity</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
             <div className="flex justify-center items-center py-12">
               <Loader2 className="w-8 h-8 animate-spin text-[#1e2a78]" />
             </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">
              No attendance logs found.
            </div>
          ) : (
            <Table className="min-w-[580px] text-xs">
              <TableHeader className="bg-muted/30 text-[10px] uppercase tracking-wider">
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Day</TableHead>
                  <TableHead>Punch In</TableHead>
                  <TableHead>Punch Out</TableHead>
                  <TableHead>Total Hours</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => {
                  const dateObj = new Date(log.date)
                  return (
                    <TableRow key={log.id}>
                      <TableCell className="font-mono font-medium">{log.date}</TableCell>
                      <TableCell>{dateObj.toLocaleDateString('en-IN', { weekday: 'long' })}</TableCell>
                      <TableCell className="font-mono">{log.check_in_time || '--:--'}</TableCell>
                      <TableCell className="font-mono">{log.check_out_time || '--:--'}</TableCell>
                      <TableCell className="font-medium">
                        {log.check_in_time && log.check_out_time ? '9h 0m' : '-'}
                      </TableCell>
                      <TableCell className="text-right">{getStatusBadge(log.status)}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
