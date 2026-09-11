'use client'

import { useState } from 'react'
import { Check, X, Clock, CheckSquare, Plus, FileText, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/shared/empty-state'
import { PageHeader } from '@/components/shared/page-header'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { toast } from 'sonner'
import Link from 'next/link'

interface ApprovalItem {
  id: string
  type: string
  details: string
  requester: string
  date: string
  status: 'Pending' | 'Approved' | 'Rejected'
}

export default function ApprovalsPage() {
  const [approvals, setApprovals] = useState<ApprovalItem[]>([])
  const [activeTab, setActiveTab] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending')

  const handleAction = (id: string, newStatus: 'Approved' | 'Rejected') => {
    setApprovals(prev =>
      prev.map(item => item.id === id ? { ...item, status: newStatus } : item)
    )
    toast.success(`Request ${newStatus.toLowerCase()} successfully.`)
  }

  const filteredApprovals = approvals.filter(
    a => activeTab === 'all' || a.status.toLowerCase() === activeTab
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Authorization & Approvals Queue"
        description="Review and authorize employee leave requests, salary revisions, and payroll snapshots."
      />

      <Card>
        <div className="border-b px-4 bg-muted/20">
          <nav className="flex space-x-6 text-xs" aria-label="Tabs">
            {(['pending', 'approved', 'rejected', 'all'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  activeTab === tab
                    ? 'border-[#1e2a78] text-[#1e2a78] font-bold border-b-2 dark:text-blue-400 dark:border-blue-400'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                  'py-3 px-1 font-medium capitalize transition-colors'
                )}
              >
                {tab} {tab === 'pending' && approvals.filter(a => a.status === 'Pending').length > 0 && (
                  <Badge variant="secondary" className="ml-1.5 text-[10px]">
                    {approvals.filter(a => a.status === 'Pending').length}
                  </Badge>
                )}
              </button>
            ))}
          </nav>
        </div>

        <CardContent className="p-6">
          {filteredApprovals.length === 0 ? (
            <EmptyState
              icon={CheckSquare}
              title={activeTab === 'pending' ? "No approvals are currently pending." : `No ${activeTab} requests found.`}
              description={activeTab === 'pending'
                ? "All team requests and statutory workflows have been cleared."
                : "Requests submitted by team members will appear in this authorization queue."}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-muted/50 border-b text-muted-foreground uppercase font-semibold text-[10px]">
                  <tr>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Request Details</th>
                    <th className="px-4 py-3">Requested By</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredApprovals.map((item) => (
                    <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3.5">
                        <Badge variant="outline">{item.type}</Badge>
                      </td>
                      <td className="px-4 py-3.5 font-medium">{item.details}</td>
                      <td className="px-4 py-3.5 text-muted-foreground">{item.requester}</td>
                      <td className="px-4 py-3.5 text-muted-foreground">{item.date}</td>
                      <td className="px-4 py-3.5">
                        <Badge className={
                          item.status === 'Approved' ? 'bg-emerald-100 text-emerald-800' :
                          item.status === 'Rejected' ? 'bg-red-100 text-red-800' :
                          'bg-amber-100 text-amber-800'
                        }>
                          {item.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        {item.status === 'Pending' && (
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs text-emerald-600 hover:bg-emerald-50"
                              onClick={() => handleAction(item.id, 'Approved')}
                            >
                              <Check className="w-3.5 h-3.5 mr-1" /> Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs text-destructive hover:bg-red-50"
                              onClick={() => handleAction(item.id, 'Rejected')}
                            >
                              <X className="w-3.5 h-3.5 mr-1" /> Reject
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
