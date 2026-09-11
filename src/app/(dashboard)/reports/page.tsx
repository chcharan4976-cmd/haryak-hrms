'use client'

import { useState, useEffect } from 'react'
import { FileText, Users, Clock, IndianRupee, Download, Calendar, Loader2, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/shared/page-header'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { toast } from 'sonner'

export default function ReportsPage() {
  const [employees, setEmployees] = useState<any[]>([])
  const [payrollRuns, setPayrollRuns] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [generatingReport, setGeneratingReport] = useState<string | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      try {
        const [empRes, prRes] = await Promise.all([
          fetch('/api/employees'),
          fetch('/api/payroll/run')
        ])
        const empData = await empRes.json()
        const prData = await prRes.json()
        
        if (empData.success && Array.isArray(empData.employees)) {
          setEmployees(empData.employees)
        }
        if (prData.success && Array.isArray(prData.runs)) {
          setPayrollRuns(prData.runs)
        }
      } catch (err) {
        console.error('Error loading data for reports:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  const handleGenerateReport = async (reportName: string) => {
    if (employees.length === 0) {
      toast.error('No employee records available for this report.')
      return
    }

    setGeneratingReport(reportName)
    try {
      let csvContent = 'data:text/csv;charset=utf-8,'
      if (reportName.includes('Payroll') || reportName.includes('PF') || reportName.includes('TDS')) {
        csvContent += 'Employee ID,Employee Name,Department,Designation,Monthly Gross,Basic,HRA,PF,PT,Net Pay\\n'
        
        // Use latest payroll run if available, otherwise just use empty data
        const latestRun = payrollRuns[0]
        let payslips = []
        if (latestRun) {
          try {
            const psRes = await fetch(`/api/payslips?month=${latestRun.period}`)
            const psData = await psRes.json()
            if (psData.success) payslips = psData.payslips || []
          } catch (e) {}
        }
        
        employees.forEach((emp) => {
          const payslip = payslips.find((p: any) => p.employee_id === emp.id)
          if (payslip) {
            csvContent += `"${emp.code}","${emp.name}","${emp.department || ''}","${emp.designation || ''}",${payslip.gross_pay || 0},${payslip.basic || 0},${payslip.hra || 0},${payslip.pf || 0},${payslip.pt || 0},${payslip.net_pay || 0}\\n`
          } else {
            csvContent += `"${emp.code}","${emp.name}","${emp.department || ''}","${emp.designation || ''}",,,,,,\\n`
          }
        })
      } else {
        csvContent += 'Employee ID,Employee Name,Email,Department,Designation,Status,Joining Date\\n'
        employees.forEach((emp) => {
          csvContent += `"${emp.code}","${emp.name}","${emp.email}","${emp.department || ''}","${emp.designation || ''}","${emp.status}","${emp.joining_date || ''}"\\n`
        })
      }

      const encodedUri = encodeURI(csvContent)
      const link = document.createElement('a')
      link.setAttribute('href', encodedUri)
      link.setAttribute('download', `Haryak_${reportName.replace(/\\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`)
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      toast.success(`${reportName} generated and downloaded successfully!`)
    } catch (err) {
      toast.error('Failed to generate report')
    } finally {
      setGeneratingReport(null)
    }
  }

  const REPORT_CATEGORIES = [
    {
      title: 'PAYROLL & STATUTORY COMPLIANCE',
      icon: IndianRupee,
      color: 'text-emerald-700 dark:text-emerald-400',
      bgColor: 'bg-emerald-100 dark:bg-emerald-950',
      reports: [
        { name: 'Monthly Payroll Register', desc: 'Detailed breakdown of employee gross earnings, PF, PT, and net disbursement.' },
        { name: 'PF & ESI Statutory Return', desc: 'Employee and employer statutory contribution schedule for EPFO filings.' },
        { name: 'TDS Deduction Summary', desc: 'Section 192 salary income tax withholding register.' },
      ]
    },
    {
      title: 'ATTENDANCE & ABSENCE',
      icon: Clock,
      color: 'text-amber-700 dark:text-amber-400',
      bgColor: 'bg-amber-100 dark:bg-amber-950',
      reports: [
        { name: 'Monthly Attendance Log', desc: 'Comprehensive record of biometric check-in times, shift hours, and working days.' },
        { name: 'Leave & Balance Summary', desc: 'Current available casual, sick, and earned leave balances across workforce.' },
        { name: 'Loss of Pay (LOP) Schedule', desc: 'Unpaid absence days calculated for monthly payroll adjustment.' },
      ]
    },
    {
      title: 'WORKFORCE & HEADCOUNT',
      icon: Users,
      color: 'text-blue-700 dark:text-blue-400',
      bgColor: 'bg-blue-100 dark:bg-blue-950',
      reports: [
        { name: 'Department Headcount Audit', desc: 'Active headcount distribution across corporate business units.' },
        { name: 'New Joiners & Onboarding Report', desc: 'Recently onboarded employees and credential provisioning audit.' },
      ]
    }
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports & Analytics Center"
        description="Generate, audit, and export real-time statutory registers, payroll journals, and workforce summaries."
      />

      <div className="space-y-6">
        {REPORT_CATEGORIES.map((category) => {
          const CategoryIcon = category.icon
          return (
            <div key={category.title} className="space-y-3">
              <div className="flex items-center gap-2">
                <div className={`p-1.5 rounded-lg ${category.bgColor} ${category.color}`}>
                  <CategoryIcon className="w-4 h-4" />
                </div>
                <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{category.title}</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {category.reports.map((report) => (
                  <Card key={report.name} className="shadow-xs hover:shadow-sm transition-shadow flex flex-col justify-between">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-bold text-foreground">{report.name}</CardTitle>
                      <CardDescription className="text-xs mt-1 leading-relaxed">{report.desc}</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-2 border-t mt-3 flex items-center justify-between">
                      <span className="text-[11px] text-muted-foreground">
                        {employees.length} {employees.length === 1 ? 'Record' : 'Records'}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs h-7 text-blue-700 hover:text-blue-900 dark:text-blue-400"
                        onClick={() => handleGenerateReport(report.name)}
                        disabled={generatingReport === report.name || loading}
                      >
                        {generatingReport === report.name ? (
                          <>
                            <Loader2 className="w-3 h-3 mr-1 animate-spin" /> Generating...
                          </>
                        ) : (
                          <>
                            <Download className="w-3 h-3 mr-1" /> Export CSV
                          </>
                        )}
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
