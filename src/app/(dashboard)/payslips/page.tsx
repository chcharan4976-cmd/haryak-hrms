'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { FileText, Search, Printer, Loader2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/shared/empty-state'
import { PageHeader } from '@/components/shared/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils/format'

export default function PayslipsPage() {
  const [payslips, setPayslips] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7))

  useEffect(() => {
    const fetchPayslips = async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/payslips?month=${selectedMonth}`)
        const data = await res.json()
        if (data.success && Array.isArray(data.payslips)) {
          setPayslips(data.payslips)
        } else {
          setPayslips([])
        }
      } catch (err) {
        console.error('Error fetching payslip list:', err)
        setPayslips([])
      } finally {
        setLoading(false)
      }
    }
    fetchPayslips()
  }, [selectedMonth])

  const monthName = new Date(`${selectedMonth}-01`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })

  const filteredPayslips = payslips.filter(p =>
    p.employee.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.employee.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.employee.department?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payslips & Compensation Vault"
        description="View, distribute, and manage statutory employee pay statements."
      >
        <Link href="/payroll">
          <Button className="bg-[#1e2a78] hover:bg-[#152060] text-white text-xs font-semibold shadow-sm">
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Prepare Payroll Run
          </Button>
        </Link>
      </PageHeader>

      {/* Filter Bar */}
      <Card>
        <CardContent className="p-3 sm:p-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative w-full sm:w-72 md:w-80">
              <Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
              <Input
                placeholder="Search employees or ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 text-xs h-9"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="p-1.5 border rounded-md text-xs bg-background h-9 text-foreground w-full sm:w-auto"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Payslips Table */}
      {loading ? (
        <div className="flex flex-col items-center justify-center p-12 bg-card rounded-xl border">
          <Loader2 className="w-8 h-8 animate-spin text-[#1e2a78] mb-2" />
          <p className="text-xs text-muted-foreground">Loading payslip records...</p>
        </div>
      ) : filteredPayslips.length === 0 ? (
        <Card>
          <CardContent className="p-6 sm:p-8">
            <EmptyState
              icon={FileText}
              title="No finalized payslips available."
              description="Payslips are generated when payroll cycles are prepared and approved for your active employees."
              action={
                <Link href="/payroll">
                  <Button className="bg-[#1e2a78] hover:bg-[#152060] text-white text-xs font-semibold">
                    <Plus className="w-3.5 h-3.5 mr-1.5" /> Prepare Payroll
                  </Button>
                </Link>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="bg-card rounded-xl border overflow-hidden shadow-xs">
          <div className="overflow-x-auto w-full">
            <table className="w-full min-w-[760px] text-xs text-left">
              <thead className="bg-muted/30 border-b text-muted-foreground uppercase font-semibold text-[10px] tracking-wider">
                <tr>
                  <th className="px-3 sm:px-4 py-3 min-w-[180px]">Employee</th>
                  <th className="px-3 sm:px-4 py-3">Employee ID</th>
                  <th className="px-3 sm:px-4 py-3">Pay Period</th>
                  <th className="px-3 sm:px-4 py-3">Gross</th>
                  <th className="px-3 sm:px-4 py-3">Deductions</th>
                  <th className="px-3 sm:px-4 py-3">Net</th>
                  <th className="px-3 sm:px-4 py-3">Status</th>
                  <th className="px-3 sm:px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredPayslips.map((p) => (
                  <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-3 sm:px-4 py-3 sm:py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 flex items-center justify-center font-bold text-xs shrink-0">
                          {p.employee.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <span className="font-semibold text-foreground block truncate">{p.employee.name}</span>
                          <span className="text-[11px] text-muted-foreground truncate block">{p.employee.email}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 sm:px-4 py-3 sm:py-3.5 font-mono font-medium text-blue-700 dark:text-blue-400">
                      {p.employee.code}
                    </td>
                    <td className="px-3 sm:px-4 py-3 sm:py-3.5 font-medium">{monthName}</td>
                    <td className="px-3 sm:px-4 py-3 sm:py-3.5">{formatCurrency(p.gross_pay)}</td>
                    <td className="px-3 sm:px-4 py-3 sm:py-3.5 text-destructive">{formatCurrency(p.total_deductions)}</td>
                    <td className="px-3 sm:px-4 py-3 sm:py-3.5 font-bold text-emerald-600">{formatCurrency(p.net_pay)}</td>
                    <td className="px-3 sm:px-4 py-3 sm:py-3.5">
                      <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200 text-[10px]">
                        {p.status || 'Published'}
                      </Badge>
                    </td>
                    <td className="px-3 sm:px-4 py-3 sm:py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Link href={`/payslips/${p.employee.code || p.employee.id}/print`}>
                          <Button variant="ghost" size="sm" className="h-7 text-xs text-blue-700 hover:text-blue-900">
                            <Printer className="w-3.5 h-3.5 mr-1" /> Print / PDF
                          </Button>
                        </Link>
                      </div>
                    </td>
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
