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
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'requests' | 'types'>('requests')

  const fetchLeaveData = async () => {
    setLoading(true)
    try {
      const [reqRes, typesRes] = await Promise.all([
        fetch('/api/leave'),
        fetch('/api/leave/types')
      ])
      const reqData = await reqRes.json()
      const typesData = await typesRes.json()
      
      if (reqData.success) setRequests(reqData.requests || [])
      if (typesData.success) setLeaveTypes(typesData.types || [])
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
        <div className="border-b px-4 bg-muted/20">
          <nav className="flex space-x-6 text-xs" aria-label="Tabs">
            <button
              onClick={() => setActiveTab('requests')}
              className={cn(
                activeTab === 'requests'
                  ? 'border-[#1e2a78] text-[#1e2a78] font-bold border-b-2 dark:text-blue-400 dark:border-blue-400'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
                'py-3 px-1 font-medium transition-colors'
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
                'py-3 px-1 font-medium transition-colors'
              )}
            >
              Company Leave Policy Quotas
            </button>
          </nav>
        </div>

        <CardContent className="p-6">
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
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-muted/50 border-b text-muted-foreground uppercase font-semibold text-[10px]">
                    <tr>
                      <th className="px-4 py-3">Employee</th>
                      <th className="px-4 py-3">Leave Type</th>
                      <th className="px-4 py-3">Duration</th>
                      <th className="px-4 py-3">Days</th>
                      <th className="px-4 py-3">Reason</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {requests.map((req) => (
                      <tr key={req.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3.5 font-medium">{req.employee?.name || 'Unknown'}</td>
                        <td className="px-4 py-3.5"><Badge variant="outline">{req.leave_type?.name || 'Leave'}</Badge></td>
                        <td className="px-4 py-3.5 text-muted-foreground">{new Date(req.start_date).toLocaleDateString()} to {new Date(req.end_date).toLocaleDateString()}</td>
                        <td className="px-4 py-3.5 font-bold">{req.days}</td>
                        <td className="px-4 py-3.5 text-muted-foreground">{req.reason}</td>
                        <td className="px-4 py-3.5">
                          <Badge className={
                            req.status === 'Approved' ? 'bg-emerald-100 text-emerald-800' :
                            req.status === 'Rejected' ? 'bg-red-100 text-red-800' :
                            'bg-amber-100 text-amber-800'
                          }>
                            {req.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3.5 text-right">
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
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
          )}
        </CardContent>
      </Card>
    </div>
  )
}
