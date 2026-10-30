'use client'

import { useState, useEffect } from 'react'
import { Search, Filter, Shield, Loader2, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/shared/empty-state'
import { PageHeader } from '@/components/shared/page-header'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface AuditLogItem {
  id: string
  timestamp: string
  user: string
  action: string
  entity: string
  desc: string
  ip: string
}

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [actionFilter, setActionFilter] = useState('all')

  const fetchLogs = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/audit?action=${actionFilter}`)
      const data = await res.json()
      if (data.success && Array.isArray(data.logs)) {
        setLogs(data.logs)
      } else {
        setLogs([])
      }
    } catch (err) {
      console.error('Failed to load audit logs:', err)
      setLogs([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchLogs()
  }, [actionFilter])

  const filteredLogs = logs.filter(log =>
    log.desc.toLowerCase().includes(searchQuery.toLowerCase()) ||
    log.user.toLowerCase().includes(searchQuery.toLowerCase()) ||
    log.entity.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const getActionBadge = (action: string) => {
    const act = action.toUpperCase()
    if (act.includes('CREATE')) return <Badge className="bg-emerald-100 text-emerald-800 text-[10px]">CREATE</Badge>
    if (act.includes('UPDATE')) return <Badge className="bg-blue-100 text-blue-800 text-[10px]">UPDATE</Badge>
    if (act.includes('DELETE')) return <Badge className="bg-red-100 text-red-800 text-[10px]">DELETE</Badge>
    if (act.includes('APPROVE')) return <Badge className="bg-purple-100 text-purple-800 text-[10px]">APPROVE</Badge>
    return <Badge variant="secondary" className="text-[10px]">{action}</Badge>
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Security & Audit Trail"
        description="Immutable chronological trail of all administrative transactions, credential modifications, and governance events."
      />

      <Card>
        <CardContent className="p-3 sm:p-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
              <Input
                placeholder="Search audit trail..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 text-xs h-9 w-full"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Select
                value={actionFilter}
                onValueChange={(val) => setActionFilter(val)}
              >
                <SelectTrigger className="h-9 w-full sm:w-auto min-w-[140px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Actions</SelectItem>
                  <SelectItem value="create">CREATE</SelectItem>
                  <SelectItem value="update">UPDATE</SelectItem>
                  <SelectItem value="approve">APPROVE</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex flex-col items-center justify-center p-8 sm:p-12 bg-card rounded-xl border">
          <Loader2 className="w-8 h-8 animate-spin text-[#1e2a78] mb-2" />
          <p className="text-xs text-muted-foreground">Loading audit records...</p>
        </div>
      ) : filteredLogs.length === 0 ? (
        <Card>
          <CardContent className="p-6 sm:p-8">
            <EmptyState
              icon={Shield}
              title="No audit activity has been recorded yet."
              description="System transactions and security events will be automatically logged here in real-time."
            />
          </CardContent>
        </Card>
      ) : (
        <div className="bg-card rounded-xl border overflow-hidden shadow-xs">
          <div className="relative w-full overflow-x-auto">
            <table className="w-full min-w-[760px] text-xs text-left">
              <thead className="bg-muted/30 border-b text-muted-foreground uppercase font-semibold text-[10px] tracking-wider">
                <tr>
                  <th className="px-3 sm:px-4 py-3">Timestamp</th>
                  <th className="px-3 sm:px-4 py-3">Actor</th>
                  <th className="px-3 sm:px-4 py-3">Action</th>
                  <th className="px-3 sm:px-4 py-3">Entity</th>
                  <th className="px-3 sm:px-4 py-3">Description</th>
                  <th className="px-3 sm:px-4 py-3">Origin IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border font-mono">
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-3 sm:px-4 py-3 text-muted-foreground whitespace-nowrap">{log.timestamp}</td>
                    <td className="px-3 sm:px-4 py-3 font-sans font-medium text-foreground max-w-[160px] truncate">{log.user}</td>
                    <td className="px-3 sm:px-4 py-3">{getActionBadge(log.action)}</td>
                    <td className="px-3 sm:px-4 py-3 font-sans">{log.entity}</td>
                    <td className="px-3 sm:px-4 py-3 font-sans text-muted-foreground break-words min-w-[200px]">{log.desc}</td>
                    <td className="px-3 sm:px-4 py-3 text-muted-foreground whitespace-nowrap">{log.ip}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
