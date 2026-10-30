'use client'

import { useState, useEffect } from 'react'
import { Check, Clock, Plus, Search, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/shared/empty-state'
import { PageHeader } from '@/components/shared/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { toast } from 'sonner'
import Link from 'next/link'

interface AttendanceRecord {
  employee_id: string
  employee: { id: string, name: string, code: string, department: string, email: string }
  status:
    | 'Present'
    | 'Absent'
    | 'Half Day'
    | 'Leave'
    | 'Paid Leave'
    | 'Unpaid Leave / LOP'
    | 'Public Holiday'
    | 'Weekly Off'
    | 'Pending Timesheet'
    | 'Missing Attendance'
    | 'NOT_MARKED'
  check_in?: string
  check_out?: string
}

function getAttendanceBadgeClass(status: string) {
  switch (status) {
    case 'Present':
      return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200 text-[10px]'
    case 'Paid Leave':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border-blue-200 text-[10px]'
    case 'Unpaid Leave / LOP':
      return 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300 border-orange-200 text-[10px]'
    case 'Public Holiday':
      return 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 border-purple-200 text-[10px]'
    case 'Weekly Off':
      return 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300 border-slate-200 text-[10px]'
    case 'Pending Timesheet':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-200 text-[10px]'
    case 'Missing Attendance':
    case 'Absent':
      return 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300 border-red-200 text-[10px]'
    case 'Half Day':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300 border-yellow-200 text-[10px]'
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300 border-gray-200 text-[10px]'
  }
}

export default function AttendancePage() {
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  const [searchQuery, setSearchQuery] = useState('')

  const fetchAttendance = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/attendance?date=${selectedDate}`)
      const data = await res.json()
      if (data.success) {
        setRecords(data.records)
      } else {
        setRecords([])
      }
    } catch (err) {
      console.error('Error loading attendance logs:', err)
      setRecords([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAttendance()
  }, [selectedDate])

  const handleStatusChange = async (employeeId: string, status: 'Present' | 'Absent' | 'Half Day' | 'Leave') => {
    const previousRecords = [...records];
    setRecords(prev => prev.map(r => r.employee_id === employeeId ? { ...r, status } : r))
    
    try {
      const res = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_id: employeeId, date: selectedDate, status })
      })
      const data = await res.json()
      if (data.success) {
        toast.success(`Attendance updated for employee.`)
      } else {
        throw new Error(data.error || 'Failed to update')
      }
    } catch (err) {
      setRecords(previousRecords)
      toast.error('Failed to update attendance.')
    }
  }

  const handleMarkAllPresent = async () => {
    const unmarked = records.filter(r => r.status === 'NOT_MARKED' || r.status === 'Absent')
    if (unmarked.length === 0) return toast.info('No employees to mark present.')
    
    setLoading(true)
    try {
      const res = await fetch('/api/attendance/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: selectedDate, status: 'Present' })
      })
      if (res.ok) {
        toast.success('All active employees marked Present.')
        fetchAttendance()
      } else {
        toast.error('Failed to update bulk attendance.')
        setLoading(false)
      }
    } catch (err) {
      toast.error('Error in bulk attendance update.')
      setLoading(false)
    }
  }

  const filteredRecords = records.filter(r =>
    r.employee.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.employee.code.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const presentCount = records.filter(r => r.status === 'Present').length
  const paidLeaveCount = records.filter(r => r.status === 'Paid Leave').length
  const lopCount = records.filter(r => r.status === 'Unpaid Leave / LOP').length
  const pendingCount = records.filter(r => r.status === 'Pending Timesheet').length
  const absentCount = records.filter(r => r.status === 'Absent' || r.status === 'Missing Attendance').length
  const halfDayCount = records.filter(r => r.status === 'Half Day').length

  return (
    <div className="space-y-6">
      <PageHeader
        title="Attendance & Time Operations"
        description="Daily biometric logs, shift attendance, and working hour reconciliation."
      >
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="text-xs"
            onClick={handleMarkAllPresent}
            disabled={records.length === 0}
          >
            <Check className="w-3.5 h-3.5 mr-1 text-emerald-600" /> Mark All Present
          </Button>
        </div>
      </PageHeader>

      <Card>
        <CardContent className="p-3 sm:p-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 w-full sm:w-auto">
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="p-1.5 border rounded-md text-xs bg-background h-9 text-foreground w-full sm:w-auto"
              />
              <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-1.5 sm:gap-2">
                <span>Summary:</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">{presentCount} Present</span>
                <span>•</span>
                <span className="font-semibold text-blue-600 dark:text-blue-400">{paidLeaveCount} Paid Leave</span>
                <span>•</span>
                <span className="font-semibold text-orange-600 dark:text-orange-400">{lopCount} LOP</span>
                <span>•</span>
                <span className="font-semibold text-amber-600 dark:text-amber-400">{pendingCount} Pending</span>
                <span>•</span>
                <span className="font-semibold text-destructive">{absentCount} Missing/Absent</span>
              </div>
            </div>

            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
              <Input
                placeholder="Search employees..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 text-xs h-9"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex flex-col items-center justify-center p-12 bg-card rounded-xl border">
          <Loader2 className="w-8 h-8 animate-spin text-[#1e2a78] mb-2" />
          <p className="text-xs text-muted-foreground">Loading attendance logs...</p>
        </div>
      ) : records.length === 0 ? (
        <Card>
          <CardContent className="p-6 sm:p-8">
            <EmptyState
              icon={Clock}
              title="No attendance records available for this period."
              description="Onboard employees to track and record daily check-in times and work hours."
              action={
                <Link href="/employees/new">
                  <Button className="bg-[#1e2a78] hover:bg-[#152060] text-white text-xs font-semibold">
                    <Plus className="w-3.5 h-3.5 mr-1.5" /> Add First Employee
                  </Button>
                </Link>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="bg-card rounded-xl border overflow-hidden shadow-xs">
          <div className="overflow-x-auto w-full">
            <table className="w-full min-w-[700px] text-xs text-left">
              <thead className="bg-muted/30 border-b text-muted-foreground uppercase font-semibold text-[10px] tracking-wider">
                <tr>
                  <th className="px-3 sm:px-4 py-3 min-w-[180px]">Employee</th>
                  <th className="px-3 sm:px-4 py-3">Employee ID</th>
                  <th className="px-3 sm:px-4 py-3">Department</th>
                  <th className="px-3 sm:px-4 py-3">Punch In</th>
                  <th className="px-3 sm:px-4 py-3">Punch Out</th>
                  <th className="px-3 sm:px-4 py-3">Status</th>
                  <th className="px-3 sm:px-4 py-3 text-right">Quick Mark</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredRecords.map((r) => {
                  const emp = r.employee
                  const currentStatus = r.status
                  return (
                    <tr key={emp.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-3 sm:px-4 py-3 sm:py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 flex items-center justify-center font-bold text-xs">
                            {emp.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <span className="font-semibold text-foreground block">{emp.name}</span>
                            <span className="text-[11px] text-muted-foreground">{emp.email}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 font-mono font-medium text-blue-700 dark:text-blue-400">
                        {emp.code}
                      </td>
                      <td className="px-4 py-3.5 text-muted-foreground">{emp.department}</td>
                      <td className="px-4 py-3.5 font-mono">{r.check_in || '—'}</td>
                      <td className="px-4 py-3.5 font-mono">{r.check_out || '—'}</td>
                      <td className="px-4 py-3.5">
                        <Badge className={getAttendanceBadgeClass(currentStatus)}>
                          {currentStatus}
                        </Badge>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => handleStatusChange(emp.id, 'Present')}
                            className={cn(
                              "px-2 py-1 rounded text-[10px] font-semibold border",
                              currentStatus === 'Present' ? "bg-emerald-600 text-white border-emerald-600" : "hover:bg-muted text-muted-foreground"
                            )}
                          >
                            P
                          </button>
                          <button
                            type="button"
                            onClick={() => handleStatusChange(emp.id, 'Half Day')}
                            className={cn(
                              "px-2 py-1 rounded text-[10px] font-semibold border",
                              currentStatus === 'Half Day' ? "bg-amber-600 text-white border-amber-600" : "hover:bg-muted text-muted-foreground"
                            )}
                          >
                            HD
                          </button>
                          <button
                            type="button"
                            onClick={() => handleStatusChange(emp.id, 'Absent')}
                            className={cn(
                              "px-2 py-1 rounded text-[10px] font-semibold border",
                              currentStatus === 'Absent' ? "bg-red-600 text-white border-red-600" : "hover:bg-muted text-muted-foreground"
                            )}
                          >
                            A
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
