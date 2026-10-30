'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Plus, CheckCircle2, Clock, XCircle, BriefcaseMedical, Umbrella, Plane, Loader2 } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { useAuth } from '@/components/providers/auth-provider'

export default function MyLeavesPage() {
  const { user } = useAuth()
  const [applyOpen, setApplyOpen] = useState(false)
  const [leaveType, setLeaveType] = useState('CASUAL')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [reason, setReason] = useState('')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [history, setHistory] = useState<any[]>([])
  const [balances, setBalances] = useState<any[]>([])
  const [summary, setSummary] = useState<any>(null)

  const fetchLeaveData = async () => {
    try {
      setLoading(true)
      setError(null)
      const [balRes, reqRes] = await Promise.all([
        fetch('/api/leave/balances'),
        fetch('/api/leave')
      ])

      if (balRes.ok) {
        const balData = await balRes.json()
        setBalances(balData.balances || [])
        if (balData.summary) {
          setSummary(balData.summary)
        }
      }

      if (reqRes.ok) {
        const reqData = await reqRes.json()
        setHistory(reqData.requests || [])
      }

      if (!balRes.ok && !reqRes.ok) {
        setError('Failed to load leave balances or requests. Please try again.')
      }
    } catch (err: any) {
      console.error('Error fetching leave data:', err)
      setError(err?.message || 'Network error while loading leave information')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (user) {
      fetchLeaveData()
    }
  }, [user])

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!fromDate || !toDate || !reason.trim()) {
      toast.error('Please enter dates and reason for leave.')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leave_type: leaveType,
          start_date: fromDate,
          end_date: toDate,
          reason: reason.trim()
        })
      })

      if (res.ok) {
        toast.success('Leave request submitted successfully for approval!')
        setApplyOpen(false)
        setReason('')
        setFromDate('')
        setToDate('')
        fetchLeaveData()
      } else {
        const errorData = await res.json()
        toast.error(errorData.error || 'Failed to submit leave request')
      }
    } catch (error) {
      console.error('Submit error:', error)
      toast.error('An error occurred while submitting the request')
    } finally {
      setSubmitting(false)
    }
  }

  const getLeaveIcon = (type: string) => {
    if (type.includes('SICK')) return BriefcaseMedical
    if (type.includes('EARNED')) return Plane
    return Umbrella
  }
  
  const getLeaveColor = (type: string) => {
    if (type.includes('SICK')) return { color: 'text-red-600', bg: 'bg-red-100 dark:bg-red-950' }
    if (type.includes('EARNED')) return { color: 'text-blue-600', bg: 'bg-blue-100 dark:bg-blue-950' }
    return { color: 'text-orange-600', bg: 'bg-orange-100 dark:bg-orange-950' }
  }

  return (
    <div className="space-y-6 w-full max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4 border-b pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">My Leave Balances & Requests</h1>
          <p className="text-xs text-muted-foreground mt-1">Apply for leave and track authorization status.</p>
        </div>
        
        <Dialog open={applyOpen} onOpenChange={setApplyOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="h-9 w-full sm:w-auto bg-[#1e2a78] hover:bg-[#152060] text-white text-xs font-semibold shadow-sm">
              <Plus className="w-3.5 h-3.5 mr-1.5" /> Apply for Leave
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md w-full">
            <DialogHeader>
              <DialogTitle className="text-base font-bold">Apply for Leave</DialogTitle>
              <DialogDescription className="text-xs">
                Submit an official leave application for manager approval.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleApply} className="space-y-3.5 py-2 text-xs">
              <div className="space-y-1">
                <Label htmlFor="ltype">Leave Category</Label>
                <Select
                  value={leaveType}
                  onValueChange={(val) => setLeaveType(val)}
                >
                  <SelectTrigger id="ltype" className="w-full text-xs h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CASUAL">Casual Leave (CL)</SelectItem>
                    <SelectItem value="SICK">Sick Leave (SL)</SelectItem>
                    <SelectItem value="EARNED">Earned Leave (EL)</SelectItem>
                    <SelectItem value="LOP">Loss of Pay (LOP)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="from">From Date</Label>
                  <Input id="from" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="text-xs h-9" required />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="to">To Date</Label>
                  <Input id="to" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="text-xs h-9" required />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="reason">Reason for Absence</Label>
                <Textarea
                  id="reason"
                  placeholder="Describe reason for leave..."
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="text-xs"
                  required
                />
              </div>

              <DialogFooter className="flex-col-reverse sm:flex-row gap-2 sm:gap-0 pt-2">
                <Button type="button" variant="outline" size="sm" className="w-full sm:w-auto" onClick={() => setApplyOpen(false)} disabled={submitting}>Cancel</Button>
                <Button type="submit" size="sm" className="w-full sm:w-auto bg-[#1e2a78] text-white" disabled={submitting}>
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Submit Request
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {error && (
        <div className="p-3 sm:p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg flex items-center justify-between gap-3">
          <div className="text-xs text-red-700 dark:text-red-400 break-words min-w-0">
            {error}
          </div>
          <Button size="sm" variant="outline" onClick={fetchLeaveData} className="h-7 text-xs shrink-0">
            Retry
          </Button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center items-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      ) : (
        <>
          {/* Annual Paid-Leave Compensation Policy Overview */}
          <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-3">
            <Card className="border border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/50 dark:bg-emerald-950/20">
              <CardContent className="p-4 sm:p-5 flex items-center gap-3.5">
                <div className="p-2.5 rounded-xl bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300">
                  <Umbrella className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-semibold text-emerald-900 dark:text-emerald-200 block">Annual Compensation Policy</span>
                  <span className="text-xl font-bold text-foreground mt-0.5 block">{summary?.annualEntitlement ?? 11} Days Max / Year</span>
                  <span className="text-[10px] text-muted-foreground mt-1 block">Monthly deducted • Reimbursed after year-end audit</span>
                </div>
              </CardContent>
            </Card>

            <Card className="border border-blue-200 bg-blue-50/60 dark:border-blue-900/50 dark:bg-blue-950/20">
              <CardContent className="p-4 sm:p-5 flex items-center gap-3.5">
                <div className="p-2.5 rounded-xl bg-blue-100 text-[#1e2a78] dark:bg-blue-900/50 dark:text-blue-300">
                  <Clock className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-semibold text-[#1e2a78] dark:text-blue-200 block">Company Public Holidays</span>
                  <span className="text-xl font-bold text-foreground mt-0.5 block">{summary?.companyHolidaysCount ?? 0} Paid Holidays</span>
                  <span className="text-[10px] text-muted-foreground mt-1 block">Paid non-working days • Never deducted from salary</span>
                </div>
              </CardContent>
            </Card>

            <Card className="border border-amber-200 bg-amber-50/60 dark:border-amber-900/50 dark:bg-amber-950/20">
              <CardContent className="p-4 sm:p-5 flex items-center gap-3.5">
                <div className="p-2.5 rounded-xl bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">
                  <XCircle className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-semibold text-amber-900 dark:text-amber-200 block">Deductions & Reimbursement</span>
                  <span className="text-xl font-bold text-foreground mt-0.5 block">{summary?.paidLeaveUsed ?? 0} / {summary?.annualEntitlement ?? 11} Days Eligible</span>
                  <span className="text-[10px] text-muted-foreground mt-1 block">Initial monthly LOP deduction • Audited at year-end</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Leave Balances */}
          <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {balances.length > 0 ? balances.map((b) => {
              const Icon = getLeaveIcon(b.leave_type)
              const { color, bg } = getLeaveColor(b.leave_type)
              return (
                <Card key={b.id} className="shadow-xs border">
                  <CardContent className="p-4 sm:p-5 flex items-center gap-3.5 sm:gap-4">
                    <div className={`p-2.5 sm:p-3 rounded-xl shrink-0 ${bg} ${color}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-semibold text-muted-foreground block truncate">{b.leave_type}</span>
                      <span className="text-lg sm:text-xl font-bold text-foreground mt-0.5 block truncate">{b.remaining_balance || 0} Days</span>
                      <div className="text-[10px] text-muted-foreground mt-1 flex justify-between">
                        <span>Total: {b.total_accrued || 0}</span>
                        <span>Used: {b.used_balance || 0}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            }) : (
              <div className="col-span-full text-center py-8 text-sm text-muted-foreground bg-muted/20 rounded-xl border border-dashed">
                No leave balances configured.
              </div>
            )}
          </div>

          {/* Leave Application History */}
          <Card className="shadow-xs border overflow-hidden">
            <CardHeader className="p-3 sm:p-4 pb-3 border-b bg-muted/20">
              <CardTitle className="text-sm font-bold">Leave Application History</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {history.length === 0 ? (
                <div className="p-6 sm:p-8 text-center text-xs text-muted-foreground">
                  No leave requests submitted yet. Click &quot;Apply for Leave&quot; above to submit an application.
                </div>
              ) : (
                <Table className="min-w-[620px] text-xs">
                  <TableHeader className="bg-muted/50 text-[10px]">
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Days</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Applied On</TableHead>
                      <TableHead className="text-right">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.map((h) => (
                      <TableRow key={h.id}>
                        <TableCell className="font-semibold">{h.leave_type}</TableCell>
                        <TableCell>{new Date(h.start_date).toLocaleDateString()} to {new Date(h.end_date).toLocaleDateString()}</TableCell>
                        <TableCell className="font-bold">{h.total_days}</TableCell>
                        <TableCell className="text-muted-foreground truncate max-w-[200px]" title={h.reason}>{h.reason}</TableCell>
                        <TableCell className="font-mono text-muted-foreground">{new Date(h.created_at).toLocaleDateString()}</TableCell>
                        <TableCell className="text-right">
                          <Badge className={
                            h.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-800' :
                            h.status === 'REJECTED' ? 'bg-red-100 text-red-800' :
                            'bg-amber-100 text-amber-800'
                          }>
                            {h.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
