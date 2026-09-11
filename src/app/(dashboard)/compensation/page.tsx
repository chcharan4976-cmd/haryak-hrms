'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Plus, IndianRupee, Eye, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/lib/utils/format'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/shared/empty-state'
import { PageHeader } from '@/components/shared/page-header'
import { Card, CardContent } from '@/components/ui/card'

export default function CompensationPage() {
  const [activeTab, setActiveTab] = useState<'structures' | 'components'>('structures')
  const [compensations, setCompensations] = useState<any[]>([])
  const [components, setComponents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchCompensations = async () => {
      setLoading(true)
      try {
        const res = await fetch('/api/compensation')
        const data = await res.json()
        if (data.success) {
          setCompensations(data.compensations || [])
          setComponents(data.components || [])
        }
      } catch (err) {
        console.error('Error fetching compensation data:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchCompensations()
  }, [])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Compensation & Salary Structures"
        description="CTC structuring, allowance allocations, and statutory deduction parameters."
      />

      <Card>
        <div className="border-b px-4 bg-muted/20">
          <nav className="flex space-x-6 text-xs" aria-label="Tabs">
            <button
              onClick={() => setActiveTab('structures')}
              className={cn(
                activeTab === 'structures'
                  ? 'border-[#1e2a78] text-[#1e2a78] font-bold border-b-2 dark:text-blue-400 dark:border-blue-400'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
                'py-3 px-1 font-medium transition-colors'
              )}
            >
              Employee CTC Structures ({compensations.length})
            </button>
            <button
              onClick={() => setActiveTab('components')}
              className={cn(
                activeTab === 'components'
                  ? 'border-[#1e2a78] text-[#1e2a78] font-bold border-b-2 dark:text-blue-400 dark:border-blue-400'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
                'py-3 px-1 font-medium transition-colors'
              )}
            >
              Standard Salary Components
            </button>
          </nav>
        </div>

        <CardContent className="p-6">
          {loading ? (
             <div className="flex flex-col items-center justify-center p-12 bg-card">
               <Loader2 className="w-8 h-8 animate-spin text-[#1e2a78] mb-2" />
               <p className="text-xs text-muted-foreground">Loading compensation data...</p>
             </div>
          ) : activeTab === 'structures' ? (
            compensations.length === 0 ? (
              <EmptyState
                icon={IndianRupee}
                title="No employee salary structures found."
                description="Salary structures are assigned automatically during employee onboarding or manual creation."
                action={
                  <Link href="/employees/new">
                    <Button className="bg-[#1e2a78] hover:bg-[#152060] text-white text-xs font-semibold">
                      <Plus className="w-3.5 h-3.5 mr-1.5" /> Add First Employee
                    </Button>
                  </Link>
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-muted/50 border-b text-muted-foreground uppercase font-semibold text-[10px]">
                    <tr>
                      <th className="px-4 py-3">Employee</th>
                      <th className="px-4 py-3">Department</th>
                      <th className="px-4 py-3">Annual CTC</th>
                      <th className="px-4 py-3">Monthly Gross</th>
                      <th className="px-4 py-3">Effective Date</th>
                      <th className="px-4 py-3 text-right">Profile</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {compensations.map((comp) => {
                      if (!comp.employee) return null;
                      return (
                        <tr key={comp.id} className="hover:bg-muted/30">
                          <td className="px-4 py-3.5">
                            <span className="font-semibold text-foreground block">{comp.employee.name}</span>
                            <span className="font-mono text-[11px] text-blue-700 dark:text-blue-400">{comp.employee.code}</span>
                          </td>
                          <td className="px-4 py-3.5 text-muted-foreground">{comp.employee.department || 'Not configured'}</td>
                          <td className="px-4 py-3.5 font-bold">{comp.annual_ctc ? formatCurrency(comp.annual_ctc) : 'Not configured'}</td>
                          <td className="px-4 py-3.5">{comp.monthly_gross ? formatCurrency(comp.monthly_gross) : 'Not configured'}</td>
                          <td className="px-4 py-3.5">{comp.effective_date ? new Date(comp.effective_date).toLocaleDateString() : 'Not configured'}</td>
                          <td className="px-4 py-3.5 text-right">
                            <Link href={`/employees/${comp.employee.id}`}>
                              <Button variant="ghost" size="sm" className="h-7 text-xs text-blue-600">
                                <Eye className="w-3.5 h-3.5 mr-1" /> View
                              </Button>
                            </Link>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )
          ) : (
            components.length === 0 ? (
              <EmptyState
                icon={IndianRupee}
                title="No standard salary components configured."
                description="Create standardized salary components to assign to employee compensation plans."
              />
            ) : (
              <div className="space-y-3">
                {components.map((comp) => (
                  <div key={comp.id} className="p-4 rounded-xl border bg-muted/20 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                    <div>
                      <h4 className="font-bold text-foreground">{comp.name}</h4>
                      <p className="text-muted-foreground text-[11px] mt-0.5">{comp.calculation_type} • {comp.statutory ? 'Statutory' : 'Non-statutory'}</p>
                    </div>
                    <Badge variant="outline" className="text-[10px] w-max">{comp.type}</Badge>
                  </div>
                ))}
              </div>
            )
          )}
        </CardContent>
      </Card>
    </div>
  )
}
