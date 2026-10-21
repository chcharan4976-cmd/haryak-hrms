'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  Search, Plus, Grid3X3, List, MoreHorizontal, Eye,
  Users, Loader2, Mail, Building2,
  Edit, KeyRound, Wrench, IndianRupee, Clock, UserX
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/shared/empty-state'
import { PageHeader } from '@/components/shared/page-header'
import { Card, CardContent } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from 'sonner'
import { EditEmployeeDialog } from '@/components/employee/edit-employee-dialog'
import { RepairAuthDialog } from '@/components/employee/repair-auth-dialog'
import { DeleteEmployeeDialog } from '@/components/employee/delete-employee-dialog'
import { CompensationEditorDialog } from '@/components/compensation/compensation-editor-dialog'

interface EmployeeRow {
  id: string
  code: string
  name: string
  fullName?: string
  firstName?: string
  lastName?: string
  email: string
  officialEmail?: string
  phone?: string
  department: string
  designation: string
  status: string
  employmentType: string
  joinDate?: string
  annualCtc?: number
  monthlyGross?: number
}

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<EmployeeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table')
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [deptFilter, setDeptFilter] = useState('all')

  // Modals state
  const [selectedEmployee, setSelectedEmployee] = useState<any>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [repairOpen, setRepairOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [compensationOpen, setCompensationOpen] = useState(false)

  const fetchEmployees = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/employees?status=all', {
        cache: 'no-store',
        credentials: 'include',
      })
      const data = await res.json()
      if (data.success && Array.isArray(data.employees)) {
        setEmployees(data.employees)
      } else {
        setEmployees([])
      }
    } catch (err) {
      console.error('Failed to load employees:', err)
      setEmployees([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchEmployees()
  }, [])

  const handleResetPassword = async (emp: EmployeeRow) => {
    try {
      toast.info(`Resetting password for ${emp.name}...`)
      const res = await fetch(`/api/employees/${emp.id}/reset-password`, { method: 'POST' })
      const data = await res.json()
      if (res.ok && data.temporaryPassword) {
        toast.success(`New temporary password: ${data.temporaryPassword}`, { duration: 10000 })
      } else if (data.canRepair) {
        toast.error('Login account needs repair.')
        setSelectedEmployee(emp)
        setRepairOpen(true)
      } else {
        toast.error(data.error || 'Failed to reset password')
      }
    } catch {
      toast.error('Network error resetting password')
    }
  }

  const openAction = (emp: EmployeeRow, action: 'edit' | 'repair' | 'delete' | 'comp') => {
    setSelectedEmployee(emp)
    if (action === 'edit') setEditOpen(true)
    if (action === 'repair') setRepairOpen(true)
    if (action === 'delete') setDeleteOpen(true)
    if (action === 'comp') setCompensationOpen(true)
  }

  const filteredEmployees = employees.filter(emp => {
    const matchesSearch =
      emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      emp.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      emp.email.toLowerCase().includes(searchQuery.toLowerCase())

    const matchesStatus = statusFilter === 'all' || emp.status.toLowerCase() === statusFilter.toLowerCase()
    const matchesDept = deptFilter === 'all' || emp.department.toLowerCase() === deptFilter.toLowerCase()

    return matchesSearch && matchesStatus && matchesDept
  })

  const getStatusBadge = (status: string) => {
    const st = status.toLowerCase()
    if (st === 'active') return <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200">Active</Badge>
    if (st === 'probation') return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-200">Probation</Badge>
    if (st === 'notice') return <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300border-orange-200">Notice</Badge>
    if (st === 'inactive') return <Badge variant="secondary">Inactive</Badge>
    if (st === 'terminated') return <Badge variant="destructive">Terminated</Badge>
    return <Badge variant="secondary">{status}</Badge>
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Employee Directory"
        description="Comprehensive directory and lifecycle management of your workforce."
      >
        <Link href="/employees/new">
          <Button className="bg-[#1e2a78] hover:bg-[#152060] text-white text-xs shadow-sm font-semibold">
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Employee
          </Button>
        </Link>
      </PageHeader>

      {/* Filter and Search Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
              <Input
                placeholder="Search by name, ID or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 text-xs h-9"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="p-1.5 border rounded-md text-xs bg-background h-9 text-foreground"
              >
                <option value="all">All Statuses</option>
                <option value="active">Active</option>
                <option value="probation">Probation</option>
                <option value="notice">Notice</option>
                <option value="inactive">Inactive</option>
                <option value="terminated">Terminated</option>
              </select>

              <div className="flex items-center border rounded-md p-0.5 bg-muted">
                <button
                  type="button"
                  onClick={() => setViewMode('table')}
                  className={cn("p-1.5 rounded text-xs", viewMode === 'table' ? "bg-background shadow-xs text-foreground" : "text-muted-foreground")}
                >
                  <List className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('card')}
                  className={cn("p-1.5 rounded text-xs", viewMode === 'card' ? "bg-background shadow-xs text-foreground" : "text-muted-foreground")}
                >
                  <Grid3X3 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Directory Content */}
      {loading ? (
        <div className="flex flex-col items-center justify-center p-12 bg-card rounded-xl border">
          <Loader2 className="w-8 h-8 animate-spin text-[#1e2a78] mb-2" />
          <p className="text-xs text-muted-foreground">Loading employee directory...</p>
        </div>
      ) : filteredEmployees.length === 0 ? (
        <Card>
          <CardContent className="p-8">
            <EmptyState
              icon={Users}
              title={employees.length === 0 ? "No employees have been added yet." : "No matching employees found."}
              description={employees.length === 0 
                ? "Start building your workforce by creating your first employee profile with automated credentials." 
                : "Try adjusting your search query or filters to find the employee record."}
              action={
                <Link href="/employees/new">
                  <Button className="bg-[#1e2a78] hover:bg-[#152060] text-white text-xs font-semibold">
                    <Plus className="w-3.5 h-3.5 mr-1.5" /> Add First Employee
                  </Button>
                </Link>
              }
            />
          </CardContent>
        </Card>
      ) : viewMode === 'table' ? (
        <div className="bg-card rounded-xl border overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted/50 border-b text-muted-foreground uppercase font-semibold text-[10px] tracking-wider">
                <tr>
                  <th className="px-4 py-3">Employee</th>
                  <th className="px-4 py-3">Employee ID</th>
                  <th className="px-4 py-3">Department</th>
                  <th className="px-4 py-3">Designation</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredEmployees.map((emp) => (
                  <tr key={emp.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 flex items-center justify-center font-bold text-xs">
                          {emp.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <Link href={`/employees/${emp.id}`} className="font-semibold text-foreground hover:text-blue-600">
                            {emp.name}
                          </Link>
                          <span className="block text-[11px] text-muted-foreground">{emp.email}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 font-mono font-medium text-blue-700 dark:text-blue-400">
                      {emp.code}
                    </td>
                    <td className="px-4 py-3.5 text-muted-foreground">{emp.department}</td>
                    <td className="px-4 py-3.5 text-muted-foreground">{emp.designation}</td>
                    <td className="px-4 py-3.5">{getStatusBadge(emp.status)}</td>
                    <td className="px-4 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Link href={`/employees/${emp.id}`}>
                          <Button variant="ghost" size="sm" className="h-7 text-xs text-blue-600 hover:text-blue-800">
                            <Eye className="w-3.5 h-3.5 mr-1" /> View
                          </Button>
                        </Link>

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48 text-xs">
                            <DropdownMenuItem onClick={() => openAction(emp, 'edit')}>
                              <Edit className="w-3.5 h-3.5 mr-2 text-blue-600" /> Edit Employee
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleResetPassword(emp)}>
                              <KeyRound className="w-3.5 h-3.5 mr-2 text-amber-600" /> Reset Temp Password
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openAction(emp, 'repair')}>
                              <Wrench className="w-3.5 h-3.5 mr-2 text-indigo-600" /> Repair Login Account
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openAction(emp, 'comp')}>
                              <IndianRupee className="w-3.5 h-3.5 mr-2 text-emerald-600" /> Compensation
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link href={`/timesheets?employeeId=${emp.id}`}>
                                <Clock className="w-3.5 h-3.5 mr-2 text-cyan-600" /> Timesheets
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-rose-600 focus:text-rose-600"
                              onClick={() => openAction(emp, 'delete')}
                            >
                              <UserX className="w-3.5 h-3.5 mr-2" /> Deactivate / Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredEmployees.map((emp) => (
            <Card key={emp.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="p-5 space-y-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 flex items-center justify-center font-bold text-xs">
                      {emp.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <Link href={`/employees/${emp.id}`} className="font-semibold text-xs text-foreground hover:text-blue-600 block">
                        {emp.name}
                      </Link>
                      <span className="font-mono text-[10px] text-blue-600 dark:text-blue-400 font-bold">{emp.code}</span>
                    </div>
                  </div>
                  {getStatusBadge(emp.status)}
                </div>

                <div className="space-y-1 text-xs text-muted-foreground border-t pt-3">
                  <div className="flex items-center gap-1.5 truncate">
                    <Mail className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{emp.email}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 shrink-0" />
                    <span>{emp.department} • {emp.designation}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <Link href={`/employees/${emp.id}`} className="flex-1">
                    <Button variant="outline" size="sm" className="w-full text-xs h-8">
                      <Eye className="w-3.5 h-3.5 mr-1" /> View Profile
                    </Button>
                  </Link>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48 text-xs">
                      <DropdownMenuItem onClick={() => openAction(emp, 'edit')}>
                        <Edit className="w-3.5 h-3.5 mr-2 text-blue-600" /> Edit Employee
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleResetPassword(emp)}>
                        <KeyRound className="w-3.5 h-3.5 mr-2 text-amber-600" /> Reset Temp Password
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => openAction(emp, 'repair')}>
                        <Wrench className="w-3.5 h-3.5 mr-2 text-indigo-600" /> Repair Login Account
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => openAction(emp, 'comp')}>
                        <IndianRupee className="w-3.5 h-3.5 mr-2 text-emerald-600" /> Compensation
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href={`/timesheets?employeeId=${emp.id}`}>
                          <Clock className="w-3.5 h-3.5 mr-2 text-cyan-600" /> Timesheets
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-rose-600 focus:text-rose-600"
                        onClick={() => openAction(emp, 'delete')}
                      >
                        <UserX className="w-3.5 h-3.5 mr-2" /> Deactivate / Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Global Modals for Directory Actions */}
      {selectedEmployee && (
        <>
          <EditEmployeeDialog
            open={editOpen}
            onOpenChange={setEditOpen}
            employee={selectedEmployee}
            onSaved={fetchEmployees}
          />

          <RepairAuthDialog
            open={repairOpen}
            onOpenChange={setRepairOpen}
            employeeId={selectedEmployee.id}
            employeeCode={selectedEmployee.code}
            employeeName={selectedEmployee.name}
            onRepaired={fetchEmployees}
          />

          <DeleteEmployeeDialog
            open={deleteOpen}
            onOpenChange={setDeleteOpen}
            employee={selectedEmployee}
            onSuccess={fetchEmployees}
          />

          <CompensationEditorDialog
            open={compensationOpen}
            onOpenChange={setCompensationOpen}
            employeeId={selectedEmployee.id}
            employeeCode={selectedEmployee.code}
            employeeName={selectedEmployee.name}
            currentCtc={selectedEmployee.annualCtc}
            currentGross={selectedEmployee.monthlyGross}
            onSuccess={fetchEmployees}
          />
        </>
      )}
    </div>
  )
}
