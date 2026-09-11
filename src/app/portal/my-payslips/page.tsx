'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Eye, FileText, Loader2, AlertCircle, RefreshCw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/components/providers/auth-provider'
import { formatINR } from '@/lib/utils/format'
import Link from 'next/link'

export default function MyPayslipsPage() {
  const { user, profile } = useAuth()
  const [payslips, setPayslips] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const empName = profile?.first_name 
    ? `${profile.first_name} ${profile.last_name || ''}`
    : user?.email?.split('@')[0] || 'Employee'
  
  const empCode = profile?.employee_code || 'Employee'

  const fetchPayslips = async () => {
    if (!user) return
    try {
      setLoading(true)
      setError(null)
      const res = await fetch('/api/payslips')
      if (res.ok) {
        const data = await res.json()
        setPayslips(data.payslips || [])
      } else {
        const errData = await res.json().catch(() => ({}))
        setError(errData.error || `Failed to load payslips (${res.status})`)
      }
    } catch (err: any) {
      console.error('Error fetching payslips:', err)
      setError(err?.message || 'Network error while loading payslips')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPayslips()
  }, [user])

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">My Payslips & Tax Statements</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Access, inspect, and download your official monthly pay statements for {empName} ({empCode}).
          </p>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-red-700 dark:text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <Button size="sm" variant="outline" onClick={fetchPayslips} className="h-7 text-xs">
            <RefreshCw className="w-3 h-3 mr-1" /> Retry
          </Button>
        </div>
      )}

      {/* Statement Archive Table */}
      <Card className="shadow-xs border">
        <CardHeader className="pb-3 border-b bg-muted/20">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-bold">Issued Pay Statements</CardTitle>
            </div>
            <Button size="sm" variant="ghost" onClick={fetchPayslips} disabled={loading} className="h-7 text-xs text-muted-foreground">
              <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center items-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
          ) : payslips.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              No finalized payslips available.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-muted/50 border-b text-muted-foreground uppercase font-semibold text-[10px]">
                  <tr>
                    <th className="px-4 py-3">Pay Period</th>
                    <th className="px-4 py-3">Gross Salary</th>
                    <th className="px-4 py-3">Deductions</th>
                    <th className="px-4 py-3">Net Take Home</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {payslips.map((ps) => {
                    const gross = ps.gross_salary ?? ps.gross_earnings ?? 0
                    const deductions = ps.total_deductions ?? 0
                    const net = ps.net_salary ?? 0
                    const isSuperseded = (ps.status || '').toLowerCase() === 'superseded' || (ps.status || '').toLowerCase() === 'void'

                    return (
                      <tr key={ps.id} className={`hover:bg-muted/30 ${isSuperseded ? 'opacity-60 bg-muted/10' : ''}`}>
                        <td className="px-4 py-3.5 font-semibold text-foreground">
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-blue-600" />
                            <span>{ps.period || (ps.period_month ? `Month ${ps.period_month}/${ps.period_year}` : 'Pay Period')}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5">{formatINR(gross)}</td>
                        <td className="px-4 py-3.5 text-destructive">{formatINR(deductions)}</td>
                        <td className={`px-4 py-3.5 font-bold ${isSuperseded ? 'text-muted-foreground line-through' : 'text-emerald-600 dark:text-emerald-400'}`}>
                          {formatINR(net)}
                        </td>
                        <td className="px-4 py-3.5">
                          {isSuperseded ? (
                            <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-300 text-[10px]">
                              {ps.status.toUpperCase()}
                            </Badge>
                          ) : (
                            <Badge className="bg-emerald-100 text-emerald-800 text-[10px]">{ps.status || 'FINALIZED'}</Badge>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Link href={`/payslips/${ps.id}/print`}>
                              <Button size="sm" variant="outline" className="h-7 text-xs">
                                <Eye className="w-3 h-3 mr-1" /> View & Print
                              </Button>
                            </Link>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
