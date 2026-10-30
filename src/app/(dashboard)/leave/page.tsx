'use client'

import { useState, useEffect } from 'react'
import { Calendar as CalendarIcon, CheckCircle, XCircle, Plus, Clock, CalendarOff, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/shared/empty-state'
import { PageHeader } from '@/components/shared/page-header'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { toast } from 'sonner'

export default function LeavePage() {
  const [requests, setRequests] = useState<any[]>([])
  const [leaveTypes, setLeaveTypes] = useState<any[]>([])
  const [employeeSummaries, setEmployeeSummaries] = useState<any[]>([])
  const [selectedHistory, setSelectedHistory] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'requests' | 'types' | 'balances'>('requests')

  const fetchLeaveData = async () => {
    setLoading(true)
    try {
      const [reqRes, typesRes, balRes] = await Promise.all([
        fetch('/api/leave'),
        fetch('/api/leave/types'),
        fetch('/api/leave/balances')
      ])
      const reqData = await reqRes.json()
      const typesData = await typesRes.json()
      const balData = await balRes.json()
      
      if (reqData.success) setRequests(reqData.requests || [])
      if (typesData.success) setLeaveTypes(typesData.types || [])
      if (balData.success) setEmployeeSummaries(balData.employee_summaries || [])
    } catch (err) {
      console.error('Error fetching leave data:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchLeaveData()
  }, [])

  const handleAction = async (id: string, newStatus: 'Approved' | 'Rejected') => {
    try {
      const res = await fetch(`/api/leave`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: newStatus })
      })
      const data = await res.json()
      if (data.success) {
        setRequests(prev => prev.map(r => r.id === id ? { ...r, status: newStatus } : r))
        toast.success(`Leave request ${newStatus.toLowerCase()} successfully.`)
      } else {
        toast.error(data.error || `Failed to ${newStatus.toLowerCase()} request.`)
      }
    } catch (err) {
      toast.error(`Error updating leave request.`)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leave Governance & Policies"
        description="Statutory leave quotas, balance allocations, and team absence authorization."
      />

      <Card>
        <div className="border-b px-3 sm:px-4 bg-muted/20">
          <nav className="flex space-x-4 sm:space-x-6 text-xs overflow-x-auto no-scrollbar" aria-label="Tabs">
            <button
              onClick={() => setActiveTab('requests')}
              className={cn(
                activeTab === 'requests'
                  ? 'border-[#1e2a78] text-[#1e2a78] font-bold border-b-2 dark:text-blue-400 dark:border-blue-400'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
                'py-3 px-1 font-medium transition-colors shrink-0 whitespace-nowrap'
              )}
            >
              Leave Requests {requests.length > 0 && <Badge variant="secondary" className="ml-1 text-[10px]">{requests.length}</Badge>}
            </button>
            <button
              onClick={() => setActiveTab('types')}
              className={cn(
                activeTab === 'types'
                  ? 'border-[#1e2a78] text-[#1e2a78] font-bold border-b-2 dark:text-blue-400 dark:border-blue-400'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
                'py-3 px-1 font-medium transition-colors shrink-0 whitespace-nowrap'
              )}
            >
              Company Leave Policy Quotas
            </button>
            <button
              onClick={() => setActiveTab('balances')}
              className={cn(
                activeTab === 'balances'
                  ? 'border-[#1e2a78] text-[#1e2a78] font-bold border-b-2 dark:text-blue-400 dark:border-blue-400'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
                'py-3 px-1 font-medium transition-colors shrink-0 whitespace-nowrap'
              )}
            >
              Annual Paid-Leave Compensation & Audit
            </button>
          </nav>
        </div>

        <CardContent className="p-4 sm:p-6">
          {loading ? (
             <div className="flex flex-col items-center justify-center p-12 bg-card">
               <Loader2 className="w-8 h-8 animate-spin text-[#1e2a78] mb-2" />
               <p className="text-xs text-muted-foreground">Loading leave data...</p>
             </div>
          ) : activeTab === 'requests' ? (
            requests.length === 0 ? (
              <EmptyState
                icon={CalendarOff}
                title="No leave requests pending."
                description="When employees submit leave applications through their portal, they will appear here for manager or HR authorization."
              />
            ) : (
              <div className="overflow-x-auto w-full">
                <table className="w-full min-w-[650px] text-xs text-left">
                  <thead className="bg-muted/30 border-b text-muted-foreground uppercase font-semibold text-[10px] tracking-wider">
                    <tr>
                      <th className="px-3 sm:px-4 py-3 min-w-[140px]">Employee</th>
                      <th className="px-3 sm:px-4 py-3">Leave Type</th>
                      <th className="px-3 sm:px-4 py-3">Duration</th>
                      <th className="px-3 sm:px-4 py-3">Days</th>
                      <th className="px-3 sm:px-4 py-3">Reason</th>
                      <th className="px-3 sm:px-4 py-3">Status</th>
                      <th className="px-3 sm:px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {requests.map((req) => (
                      <tr key={req.id} className="hover:bg-muted/30">
                        <td className="px-3 sm:px-4 py-3 sm:py-3.5 font-medium">{req.employee?.name || 'Unknown'}</td>
                        <td className="px-3 sm:px-4 py-3 sm:py-3.5"><Badge variant="outline">{req.leave_type?.name || 'Leave'}</Badge></td>
                        <td className="px-3 sm:px-4 py-3 sm:py-3.5 text-muted-foreground">{new Date(req.start_date).toLocaleDateString()} to {new Date(req.end_date).toLocaleDateString()}</td>
                        <td className="px-3 sm:px-4 py-3 sm:py-3.5 font-bold">{req.days}</td>
                        <td className="px-3 sm:px-4 py-3 sm:py-3.5 text-muted-foreground">{req.reason}</td>
                        <td className="px-3 sm:px-4 py-3 sm:py-3.5">
                          <Badge className={
                            req.status === 'Approved' ? 'bg-emerald-100 text-emerald-800' :
                            req.status === 'Rejected' ? 'bg-red-100 text-red-800' :
                            'bg-amber-100 text-amber-800'
                          }>
                            {req.status}
                          </Badge>
                        </td>
                        <td className="px-3 sm:px-4 py-3 sm:py-3.5 text-right">
                          {req.status === 'Pending' && (
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs text-emerald-600"
                                onClick={() => handleAction(req.id, 'Approved')}
                              >
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs text-destructive"
                                onClick={() => handleAction(req.id, 'Rejected')}
                              >
                                Reject
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : activeTab === 'types' ? (
            <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {leaveTypes.map((lt) => (
                <div key={lt.id} className="p-4 rounded-xl border bg-muted/20 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-foreground">{lt.name}</h4>
                    <Badge variant={lt.is_paid ? 'default' : 'destructive'} className="text-[10px]">
                      {lt.is_paid ? 'Paid' : 'Unpaid'}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground text-[11px]">{lt.description || 'Company leave policy'}</p>
                  <div className="font-mono font-bold text-[#1e2a78] dark:text-blue-400 pt-1 border-t">
                    Annual Quota: {lt.default_quota} Days
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/50 text-xs dark:border-blue-900/50 dark:bg-blue-950/20">
                <h4 className="font-bold text-[#1e2a78] dark:text-blue-300">Company Annual Paid-Leave Compensation Policy</h4>
                <p className="mt-1 text-muted-foreground">
                  The company provides <strong>11 annual paid-leave compensation days</strong> per calendar year. Under this policy, every employee-requested working-day leave is initially deducted in monthly payroll at the daily salary rate. At year-end, the company audits and reimburses eligible deductions (up to 11 days) through a dedicated payroll settlement. Official Company Calendar public holidays are paid non-working days and are never deducted.
                </p>
              </div>

              {employeeSummaries.length === 0 ? (
                <div className="text-center py-8 text-xs text-muted-foreground">
                  No employee annual compensation records found.
                </div>
              ) : (
                <div className="overflow-x-auto w-full">
                  <table className="w-full min-w-[850px] text-xs text-left">
                    <thead className="bg-muted/30 border-b text-muted-foreground uppercase font-semibold text-[10px] tracking-wider">
                      <tr>
                        <th className="px-3 sm:px-4 py-3 min-w-[150px]">Employee</th>
                        <th className="px-3 sm:px-4 py-3">Department</th>
                        <th className="px-3 sm:px-4 py-3 text-center">Annual Entitlement</th>
                        <th className="px-3 sm:px-4 py-3 text-center">Leaves Taken</th>
                        <th className="px-3 sm:px-4 py-3 text-center">Eligible for Compensation</th>
                        <th className="px-3 sm:px-4 py-3 text-center">Ineligible (&gt;11)</th>
                        <th className="px-3 sm:px-4 py-3 text-center">Audit Status</th>
                        <th className="px-3 sm:px-4 py-3 text-right">Audit & Settle</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {employeeSummaries.map((emp) => (
                        <tr key={emp.employee_id} className="hover:bg-muted/30">
                          <td className="px-3 sm:px-4 py-3">
                            <div className="font-semibold text-foreground">{emp.employee_name}</div>
                            <div className="text-[10px] font-mono text-muted-foreground">{emp.employee_code}</div>
                          </td>
                          <td className="px-3 sm:px-4 py-3 text-muted-foreground">{emp.department_name}</td>
                          <td className="px-3 sm:px-4 py-3 text-center font-bold">{emp.annual_entitlement} Days</td>
                          <td className="px-3 sm:px-4 py-3 text-center text-amber-700 dark:text-amber-400 font-medium">
                            {emp.paid_leave_used + (emp.unpaid_leave_lop > emp.annual_entitlement ? emp.unpaid_leave_lop - emp.annual_entitlement : 0)} Days
                          </td>
                          <td className="px-3 sm:px-4 py-3 text-center font-bold text-emerald-600 dark:text-emerald-400">
                            {emp.paid_leave_used} / {emp.annual_entitlement} Days
                          </td>
                          <td className="px-3 sm:px-4 py-3 text-center">
                            {emp.unpaid_leave_lop > emp.annual_entitlement ? (
                              <Badge variant="destructive">{emp.unpaid_leave_lop - emp.annual_entitlement} Days</Badge>
                            ) : (
                              <span className="text-muted-foreground">0</span>
                            )}
                          </td>
                          <td className="px-3 sm:px-4 py-3 text-center">
                            <Badge className="bg-blue-100 text-[#1e2a78] border-blue-200">
                              Ready for Audit
                            </Badge>
                          </td>
                          <td className="px-3 sm:px-4 py-3 text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs border-[#1e2a78] text-[#1e2a78] hover:bg-blue-50"
                              onClick={() => setSelectedHistory(emp)}
                            >
                              Audit Ledger ({emp.leave_history?.length || 0})
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Annual Compensation Audit & History Dialog */}
      {selectedHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-3xl rounded-2xl border bg-card p-5 shadow-xl space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="text-base font-bold text-foreground">Annual Leave Compensation Audit — {selectedHistory.employee_name}</h3>
                <p className="text-xs text-muted-foreground">{selectedHistory.employee_code} • {selectedHistory.department_name}</p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setSelectedHistory(null)}>✕</Button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
              <div className="p-3 rounded-lg border bg-blue-50/50 dark:bg-blue-950/20">
                <span className="text-muted-foreground block text-[10px]">Annual Entitlement</span>
                <span className="text-base font-bold text-[#1e2a78] dark:text-blue-300">11 Days</span>
              </div>
              <div className="p-3 rounded-lg border bg-amber-50/50 dark:bg-amber-950/20">
                <span className="text-muted-foreground block text-[10px]">Eligible Compensation Days</span>
                <span className="text-base font-bold text-amber-700 dark:text-amber-400">{selectedHistory.paid_leave_used} Days</span>
              </div>
              <div className="p-3 rounded-lg border bg-emerald-50/50 dark:bg-emerald-950/20">
                <span className="text-muted-foreground block text-[10px]">Remaining Entitlement</span>
                <span className="text-base font-bold text-emerald-700 dark:text-emerald-400">{selectedHistory.paid_leave_remaining} Days</span>
              </div>
              <div className="p-3 rounded-lg border bg-slate-50 dark:bg-slate-900/50">
                <span className="text-muted-foreground block text-[10px]">Public Holidays (Paid)</span>
                <span className="text-base font-bold text-slate-800 dark:text-slate-200">{selectedHistory.company_holidays_count} Days</span>
              </div>
            </div>

            <div className="p-3 rounded-xl border border-blue-200 bg-blue-50/40 text-xs dark:border-blue-900/40 dark:bg-blue-950/10">
              <span className="font-semibold text-[#1e2a78] dark:text-blue-300">Audit Rule: </span>
              <span className="text-muted-foreground">
                First 11 working-day leaves are reimbursed at verified original deduction rates. Any subsequent leave dates beyond 11 are strictly non-compensable.
              </span>
            </div>

            <div className="border rounded-xl overflow-hidden">
              <table className="w-full text-xs text-left">
                <thead className="bg-muted/50 border-b text-muted-foreground uppercase text-[10px]">
                  <tr>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Classification</th>
                    <th className="px-3 py-2">Source</th>
                    <th className="px-3 py-2">Reason / Description</th>
                    <th className="px-3 py-2 text-right">Compensation Eligibility</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {selectedHistory.leave_history?.map((rec: any, idx: number) => (
                    <tr key={idx} className="hover:bg-muted/30">
                      <td className="px-3 py-2 font-mono">{rec.date}</td>
                      <td className="px-3 py-2">
                        <Badge className={
                          rec.type === 'PUBLIC_HOLIDAY' ? 'bg-blue-100 text-[#1e2a78] border-blue-200' :
                          rec.type === 'PAID_LEAVE' ? 'bg-emerald-100 text-emerald-800 border-emerald-200' :
                          'bg-amber-100 text-amber-800 border-amber-200'
                        }>
                          {rec.type === 'PUBLIC_HOLIDAY' ? 'Company Holiday' : rec.type === 'PAID_LEAVE' ? 'Monthly Deductible Leave' : 'Excess Leave'}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground text-[10px]">{rec.source}</td>
                      <td className="px-3 py-2 text-muted-foreground truncate max-w-[200px]" title={rec.reason}>{rec.reason || rec.categoryName}</td>
                      <td className="px-3 py-2 text-right font-medium">
                        {rec.type === 'PUBLIC_HOLIDAY' ? (
                          <span className="text-blue-600">Company Paid (No Deduct)</span>
                        ) : rec.type === 'PAID_LEAVE' ? (
                          <span className="text-emerald-600 font-bold">Eligible for Compensation</span>
                        ) : (
                          <span className="text-rose-600">Non-Compensable (&gt;11 days)</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between pt-3 border-t">
              <div className="text-xs text-muted-foreground">
                Audit Status: <span className="font-bold text-foreground">Verified & Ready for Settlement</span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  className="bg-[#1e2a78] hover:bg-[#162058] text-white"
                  onClick={async () => {
                    try {
                      const res = await fetch('/api/leave/compensation-ledger', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          action: 'settle',
                          employee_id: selectedHistory.employee_id,
                          year: new Date().getFullYear(),
                        })
                      })
                      const result = await res.json()
                      if (result.success) {
                        toast.success('Annual leave compensation approved & scheduled for year-end settlement.')
                        setSelectedHistory(null)
                        fetchLeaveData()
                      } else {
                        toast.error(result.error || 'Failed to settle compensation.')
                      }
                    } catch (e: any) {
                      toast.error('Settlement request failed.')
                    }
                  }}
                >
                  Approve & Settle into Year-End Payroll
                </Button>
                <Button size="sm" variant="outline" onClick={() => setSelectedHistory(null)}>Close</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
