'use client'

import { useState, useMemo } from 'react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import {
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  Clock,
  Search,
  Upload,
  User,
  Filter,
} from 'lucide-react'
import { EnterpriseDocumentItem, DOCUMENT_CATEGORIES } from '@/lib/types/document'

interface EmployeeOption {
  id: string
  employee_code: string
  full_name: string
  department?: { name: string }
  designation?: { name: string }
}

interface DocumentComplianceMatrixProps {
  employees: EmployeeOption[]
  documents: EnterpriseDocumentItem[]
  onUploadForEmployee: (employeeId: string, categoryCode: string) => void
}

const MANDATORY_CODES = [
  'pan_card',
  'identity_proof',
  'address_proof',
  'education_certificate',
  'joining_form',
  'offer_letter',
  'appointment_letter',
]

export function DocumentComplianceMatrix({
  employees,
  documents,
  onUploadForEmployee,
}: DocumentComplianceMatrixProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [departmentFilter, setDepartmentFilter] = useState('ALL')

  // Extract unique departments from real employee data
  const departments = useMemo(() => {
    const set = new Set<string>()
    employees.forEach(emp => {
      if (emp.department?.name) set.add(emp.department.name)
    })
    return Array.from(set).sort()
  }, [employees])

  // Calculate real compliance metrics per employee
  const employeeCompliance = useMemo(() => {
    return employees.map(emp => {
      // Find all active documents for this employee
      const empDocs = documents.filter(
        d => d.employeeId === emp.id && !d.isArchived
      )

      const mandatoryStatus = MANDATORY_CODES.map(code => {
        const catDef = DOCUMENT_CATEGORIES.find(c => c.code === code)
        const doc = empDocs.find(
          d => d.category === code || d.documentType === code
        )

        let status: 'verified' | 'pending' | 'missing' | 'rejected' = 'missing'
        if (doc) {
          if (doc.status === 'VERIFIED' || doc.status === 'ISSUED' || doc.status === 'ACKNOWLEDGED') {
            status = 'verified'
          } else if (doc.status === 'REJECTED' || doc.status === 'REPLACEMENT_REQUESTED') {
            status = 'rejected'
          } else {
            status = 'pending'
          }
        }

        return {
          code,
          name: catDef?.name || code,
          status,
          doc,
        }
      })

      const verifiedCount = mandatoryStatus.filter(m => m.status === 'verified').length
      const pendingCount = mandatoryStatus.filter(m => m.status === 'pending').length
      const missingCount = mandatoryStatus.filter(m => m.status === 'missing' || m.status === 'rejected').length
      const percentage = Math.round((verifiedCount / MANDATORY_CODES.length) * 100)

      return {
        employee: emp,
        mandatoryStatus,
        verifiedCount,
        pendingCount,
        missingCount,
        percentage,
      }
    })
  }, [employees, documents])

  // Filtered employees
  const filteredData = useMemo(() => {
    return employeeCompliance.filter(item => {
      const q = searchQuery.toLowerCase().trim()
      const matchesSearch =
        !q ||
        item.employee.full_name.toLowerCase().includes(q) ||
        item.employee.employee_code.toLowerCase().includes(q)

      const matchesDept =
        departmentFilter === 'ALL' ||
        item.employee.department?.name === departmentFilter

      return matchesSearch && matchesDept
    })
  }, [employeeCompliance, searchQuery, departmentFilter])

  // Aggregate organizational metrics
  const totalEmployees = employees.length
  const totalVerified = employeeCompliance.reduce((acc, curr) => acc + curr.verifiedCount, 0)
  const totalRequired = totalEmployees * MANDATORY_CODES.length
  const overallComplianceRate = totalRequired > 0 ? Math.round((totalVerified / totalRequired) * 100) : 0

  return (
    <div className="space-y-4">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border shadow-none">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium text-muted-foreground">Compliance Target</p>
              <h3 className="text-xl font-bold text-foreground mt-0.5">{overallComplianceRate}%</h3>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {totalVerified} of {totalRequired} mandatory records verified
              </p>
            </div>
            <div className="p-2.5 rounded-full bg-blue-50 text-[#1e2a78] dark:bg-blue-950">
              <ShieldCheck className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border shadow-none">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium text-muted-foreground">Fully Compliant Staff</p>
              <h3 className="text-xl font-bold text-emerald-600 mt-0.5">
                {employeeCompliance.filter(e => e.percentage === 100).length} / {totalEmployees}
              </h3>
              <p className="text-[10px] text-muted-foreground mt-0.5">100% mandatory documents verified</p>
            </div>
            <div className="p-2.5 rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border shadow-none">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium text-muted-foreground">Action Required</p>
              <h3 className="text-xl font-bold text-amber-600 mt-0.5">
                {employeeCompliance.filter(e => e.percentage < 100).length}
              </h3>
              <p className="text-[10px] text-muted-foreground mt-0.5">Employees with missing or unverified docs</p>
            </div>
            <div className="p-2.5 rounded-full bg-amber-50 text-amber-600 dark:bg-amber-950">
              <AlertCircle className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter and Table Card */}
      <Card>
        <CardHeader className="border-b bg-muted/20 pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-sm font-bold">Employee Document Completeness</CardTitle>
              <CardDescription className="text-xs">
                Real-time tracking of statutory identity, onboarding, and appointment documentation per employee.
              </CardDescription>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full sm:w-56">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search code or name..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="h-8 pl-8 text-xs"
                />
              </div>

              {departments.length > 0 && (
                <select
                  value={departmentFilter}
                  onChange={e => setDepartmentFilter(e.target.value)}
                  className="h-8 rounded-md border bg-background px-2.5 text-xs"
                >
                  <option value="ALL">All Departments</option>
                  {departments.map(d => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b bg-muted/40 font-semibold text-muted-foreground">
                <tr>
                  <th className="p-3 pl-5">Employee</th>
                  <th className="p-3">Department</th>
                  <th className="p-3 w-40">Completeness</th>
                  <th className="p-3">Mandatory Document Checklist</th>
                  <th className="p-3 pr-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredData.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-muted-foreground text-xs">
                      No matching employee records found.
                    </td>
                  </tr>
                ) : (
                  filteredData.map(item => (
                    <tr key={item.employee.id} className="hover:bg-muted/15 transition-colors">
                      <td className="p-3 pl-5">
                        <div className="font-semibold text-foreground">{item.employee.full_name}</div>
                        <div className="font-mono text-[11px] text-muted-foreground">{item.employee.employee_code}</div>
                      </td>
                      <td className="p-3">
                        <span className="text-foreground">{item.employee.department?.name || 'General'}</span>
                        <div className="text-[11px] text-muted-foreground">{item.employee.designation?.name || 'Staff'}</div>
                      </td>
                      <td className="p-3">
                        <div className="space-y-1">
                          <div className="flex justify-between text-[11px]">
                            <span className="font-semibold">{item.percentage}%</span>
                            <span className="text-muted-foreground">
                              {item.verifiedCount}/{MANDATORY_CODES.length}
                            </span>
                          </div>
                          <Progress
                            value={item.percentage}
                            className={`h-1.5 ${
                              item.percentage === 100
                                ? '[&>div]:bg-emerald-600'
                                : item.percentage >= 60
                                ? '[&>div]:bg-blue-600'
                                : '[&>div]:bg-amber-500'
                            }`}
                          />
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-1">
                          {item.mandatoryStatus.map(docStat => {
                            if (docStat.status === 'verified') {
                              return (
                                <Badge
                                  key={docStat.code}
                                  variant="outline"
                                  className="text-[10px] border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                  title={`${docStat.name}: Verified`}
                                >
                                  ✓ {docStat.name.split(' ')[0]}
                                </Badge>
                              )
                            }
                            if (docStat.status === 'pending') {
                              return (
                                <Badge
                                  key={docStat.code}
                                  variant="outline"
                                  className="text-[10px] border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                                  title={`${docStat.name}: Pending Review`}
                                >
                                  ⏳ {docStat.name.split(' ')[0]}
                                </Badge>
                              )
                            }
                            if (docStat.status === 'rejected') {
                              return (
                                <Badge
                                  key={docStat.code}
                                  variant="destructive"
                                  className="text-[10px]"
                                  title={`${docStat.name}: Rejected`}
                                >
                                  ✗ {docStat.name.split(' ')[0]}
                                </Badge>
                              )
                            }
                            return (
                              <button
                                key={docStat.code}
                                type="button"
                                onClick={() => onUploadForEmployee(item.employee.id, docStat.code)}
                                className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded border border-dashed border-red-300 text-red-700 bg-red-50/50 hover:bg-red-100 hover:border-red-400 dark:bg-red-950/20"
                                title={`Missing ${docStat.name} — Click to upload`}
                              >
                                + {docStat.name.split(' ')[0]}
                              </button>
                            )
                          })}
                        </div>
                      </td>
                      <td className="p-3 pr-5 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => onUploadForEmployee(item.employee.id, 'identity_proof')}
                        >
                          <Upload className="mr-1 h-3 w-3" />
                          Upload Doc
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
