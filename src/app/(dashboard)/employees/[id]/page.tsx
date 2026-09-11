'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import {
  ArrowLeft,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  CircleUserRound,
  FileText,
  IndianRupee,
  KeyRound,
  Loader2,
  Mail,
  Phone,
  RefreshCw,
  ShieldCheck,
  UserRoundCog,
} from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmployeeBankDetailsCard } from '@/components/employee/employee-bank-details-card'

type Employee = {
  id: string
  userId?: string | null
  code: string
  name: string
  fullName: string
  email: string
  phone?: string | null
  department?: string | null
  designation?: string | null
  status?: string | null
  employmentType?: string | null
  joinDate?: string | null
  firstName?: string | null
  lastName?: string | null
  gender?: string | null
  dateOfBirth?: string | null
  date_of_birth?: string | null
  official_email?: string | null
  employee_code?: string | null
  full_name?: string | null
  employment_status?: string | null
  employment_type?: string | null
  joining_date?: string | null
  is_active?: boolean
}

type CompensationComponent = {
  id?: string
  name: string
  code: string
  type: string
  monthly?: number
  monthlyAmount?: number
  annual?: number
  annualAmount?: number
  isActive?: boolean
  is_active?: boolean
}

type CompensationData = {
  isComplete?: boolean
  annualCtc?: number
  annual_ctc?: number
  monthlyGross?: number
  monthly_gross?: number
  effectiveFrom?: string | null
  effective_from?: string | null
  incompletenessReasons?: string[]
  components?: CompensationComponent[]
}

function formatDate(value?: string | null): string {
  if (!value) return 'Not provided'

  const date = new Date(`${value.slice(0, 10)}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

function money(value?: number | null): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return 'Not configured'
  }

  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(Number(value))
}

function normalizeEmployee(raw: any): Employee {
  const fullName =
    raw?.fullName ??
    raw?.name ??
    raw?.full_name ??
    `${raw?.first_name || ''} ${raw?.last_name || ''}`.trim()

  return {
    id: String(raw?.id || ''),
    userId: raw?.userId ?? raw?.user_id ?? null,
    code: raw?.code ?? raw?.employee_code ?? '',
    name: fullName || 'Unnamed employee',
    fullName: fullName || 'Unnamed employee',
    email: raw?.email ?? raw?.official_email ?? '',
    phone: raw?.phone ?? null,
    department:
      typeof raw?.department === 'string'
        ? raw.department
        : raw?.departments?.name ?? raw?.department?.name ?? null,
    designation:
      typeof raw?.designation === 'string'
        ? raw.designation
        : raw?.designations?.name ?? raw?.designation?.name ?? null,
    status: raw?.status ?? raw?.employment_status ?? null,
    employmentType: raw?.employmentType ?? raw?.employment_type ?? null,
    joinDate: raw?.joinDate ?? raw?.joining_date ?? null,
    firstName: raw?.firstName ?? raw?.first_name ?? null,
    lastName: raw?.lastName ?? raw?.last_name ?? null,
    gender: raw?.gender ?? null,
    dateOfBirth: raw?.dateOfBirth ?? raw?.date_of_birth ?? null,
    official_email: raw?.official_email ?? null,
    employee_code: raw?.employee_code ?? null,
    full_name: raw?.full_name ?? null,
    employment_status: raw?.employment_status ?? null,
    employment_type: raw?.employment_type ?? null,
    joining_date: raw?.joining_date ?? null,
    is_active: raw?.is_active,
  }
}

export default function EmployeeDetailPage() {
  const params = useParams<{ id: string }>()
  const employeeId = String(params?.id || '')

  const [employee, setEmployee] = useState<Employee | null>(null)
  const [compensation, setCompensation] = useState<CompensationData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadEmployee = useCallback(async () => {
    if (!employeeId) return

    setLoading(true)
    setError(null)

    try {
      const employeeResponse = await fetch('/api/employees', {
        cache: 'no-store',
        credentials: 'include',
      })

      const employeeResult = await employeeResponse.json()

      if (!employeeResponse.ok || employeeResult.success === false) {
        throw new Error(employeeResult.error || 'Unable to load employee.')
      }

      const employees = Array.isArray(employeeResult.employees)
        ? employeeResult.employees
        : Array.isArray(employeeResult.data)
          ? employeeResult.data
          : []

      const rawEmployee = employees.find(
        (item: any) => String(item.id) === employeeId
      )

      if (!rawEmployee) {
        throw new Error('Employee not found.')
      }

      setEmployee(normalizeEmployee(rawEmployee))

      try {
        const compensationResponse = await fetch(
          `/api/compensation/${employeeId}`,
          {
            cache: 'no-store',
            credentials: 'include',
          }
        )

        if (compensationResponse.ok) {
          const compensationResult = await compensationResponse.json()

          setCompensation(
            compensationResult.compensation ??
              compensationResult.effective ??
              null
          )
        } else {
          setCompensation(null)
        }
      } catch {
        setCompensation(null)
      }
    } catch (err: any) {
      console.error('[EmployeeDetailPage]', err)
      setEmployee(null)
      setError(err?.message || 'Unable to load employee.')
    } finally {
      setLoading(false)
    }
  }, [employeeId])

  useEffect(() => {
    void loadEmployee()
  }, [loadEmployee])

  const initials = useMemo(() => {
    const source = employee?.fullName || ''
    const pieces = source.split(/\s+/).filter(Boolean)

    if (pieces.length === 0) return 'E'

    return pieces
      .slice(0, 2)
      .map((piece) => piece[0]?.toUpperCase())
      .join('')
  }, [employee?.fullName])

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto h-7 w-7 animate-spin text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            Loading employee profile...
          </p>
        </div>
      </div>
    )
  }

  if (error || !employee) {
    return (
      <div className="space-y-5">
        <Button asChild variant="ghost" size="sm">
          <Link href="/employees">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Employee Directory
          </Link>
        </Button>

        <Card className="border-red-200">
          <CardContent className="p-8 text-center">
            <p className="font-semibold text-red-700">
              Employee profile could not be loaded.
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {error || 'Employee not found.'}
            </p>

            <Button
              className="mt-4"
              variant="outline"
              onClick={() => void loadEmployee()}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const annualCtc = compensation?.annualCtc ?? compensation?.annual_ctc
  const monthlyGross =
    compensation?.monthlyGross ?? compensation?.monthly_gross
  const compensationComponents = compensation?.components ?? []

  return (
    <div className="space-y-6">
      <div>
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="-ml-2 text-muted-foreground"
        >
          <Link href="/employees">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Employee Directory
          </Link>
        </Button>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-100 text-lg font-bold text-blue-800">
              {initials}
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-xl font-bold">
                  {employee.fullName}
                </h1>

                <Badge
                  className={
                    employee.status === 'active' || employee.is_active === true
                      ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100'
                      : ''
                  }
                  variant={
                    employee.status === 'active' || employee.is_active === true
                      ? 'default'
                      : 'outline'
                  }
                >
                  {employee.status || (employee.is_active ? 'active' : 'inactive')}
                </Badge>
              </div>

              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="font-mono font-semibold text-blue-700">
                  {employee.code || 'No employee code'}
                </span>
                <span>•</span>
                <span>{employee.designation || 'Not assigned'}</span>
                <span>•</span>
                <span>{employee.department || 'Not assigned'}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                toast.info(
                  'Keep your existing Edit Employee dialog wired here if you already use it.'
                )
              }
            >
              <UserRoundCog className="mr-2 h-4 w-4" />
              Edit Profile
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                toast.info(
                  'Keep your existing Reset Temp Password dialog wired here.'
                )
              }
            >
              <KeyRound className="mr-2 h-4 w-4" />
              Reset Temp Password
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="border-red-200 text-red-700 hover:bg-red-50"
              onClick={() =>
                toast.info(
                  'Keep your existing Manage Access / Repair Auth dialog wired here.'
                )
              }
            >
              <ShieldCheck className="mr-2 h-4 w-4" />
              Manage Access
            </Button>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="employment">Employment</TabsTrigger>
          <TabsTrigger value="compensation">Compensation</TabsTrigger>
          <TabsTrigger value="attendance-leave">
            Attendance & Leave
          </TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="actions">Actions</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="border-b">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <CircleUserRound className="h-4 w-4 text-blue-700" />
                  Personal Information
                </CardTitle>
              </CardHeader>

              <CardContent className="space-y-0 p-5">
                <InfoRow
                  icon={<Mail className="h-4 w-4" />}
                  label="Work Email"
                  value={employee.email || 'Not provided'}
                />
                <InfoRow
                  icon={<Phone className="h-4 w-4" />}
                  label="Contact Phone"
                  value={employee.phone || 'Not provided'}
                />
                <InfoRow
                  label="Gender"
                  value={employee.gender || 'Not provided'}
                />
                <InfoRow
                  label="Date of Birth"
                  value={formatDate(
                    employee.dateOfBirth || employee.date_of_birth
                  )}
                  last
                />
              </CardContent>
            </Card>

            <EmployeeBankDetailsCard
              employeeId={employee.id}
              employeeName={employee.fullName}
              onBankAccountChanged={() => {
                toast.success(
                  'Bank details saved. Re-run payroll readiness if required.'
                )
              }}
            />
          </div>
        </TabsContent>

        <TabsContent value="employment">
          <Card>
            <CardHeader className="border-b">
              <CardTitle className="flex items-center gap-2 text-sm">
                <BriefcaseBusiness className="h-4 w-4 text-blue-700" />
                Employment Information
              </CardTitle>
            </CardHeader>

            <CardContent className="grid gap-x-8 p-5 md:grid-cols-2">
              <InfoRow
                label="Employee ID"
                value={employee.code || 'Not provided'}
              />
              <InfoRow
                label="Employment Status"
                value={employee.status || 'Not provided'}
              />
              <InfoRow
                icon={<Building2 className="h-4 w-4" />}
                label="Department"
                value={employee.department || 'Not assigned'}
              />
              <InfoRow
                label="Designation"
                value={employee.designation || 'Not assigned'}
              />
              <InfoRow
                label="Employment Type"
                value={employee.employmentType || 'Not provided'}
              />
              <InfoRow
                icon={<CalendarDays className="h-4 w-4" />}
                label="Joining Date"
                value={formatDate(employee.joinDate)}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="compensation" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <MetricCard
              label="Annual CTC"
              value={money(annualCtc)}
              icon={<IndianRupee className="h-4 w-4" />}
            />
            <MetricCard
              label="Monthly Gross"
              value={money(monthlyGross)}
              icon={<IndianRupee className="h-4 w-4" />}
            />
            <MetricCard
              label="Structure Status"
              value={
                compensation?.isComplete === true
                  ? 'Complete'
                  : compensation?.isComplete === false
                    ? 'Action Required'
                    : 'Not loaded'
              }
              icon={<ShieldCheck className="h-4 w-4" />}
            />
          </div>

          <Card>
            <CardHeader className="border-b">
              <CardTitle className="text-sm">Salary Components</CardTitle>
            </CardHeader>

            <CardContent className="p-0">
              {compensationComponents.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  No configured salary components were returned for this employee.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                        <th className="p-3">Component</th>
                        <th className="p-3">Type</th>
                        <th className="p-3 text-right">Monthly</th>
                        <th className="p-3 text-right">Annual</th>
                      </tr>
                    </thead>

                    <tbody className="divide-y">
                      {compensationComponents.map((component, index) => (
                        <tr key={component.id || `${component.code}-${index}`}>
                          <td className="p-3">
                            <div className="font-medium">{component.name}</div>
                            <div className="font-mono text-[10px] text-muted-foreground">
                              {component.code}
                            </div>
                          </td>
                          <td className="p-3 capitalize text-muted-foreground">
                            {component.type}
                          </td>
                          <td className="p-3 text-right">
                            {money(
                              component.monthlyAmount ?? component.monthly
                            )}
                          </td>
                          <td className="p-3 text-right">
                            {money(component.annualAmount ?? component.annual)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="attendance-leave">
          <Card>
            <CardHeader className="border-b">
              <CardTitle className="text-sm">Attendance & Leave</CardTitle>
            </CardHeader>

            <CardContent className="p-6">
              <p className="text-sm text-muted-foreground">
                Attendance and leave records remain authoritative in their dedicated modules.
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                <Button asChild variant="outline">
                  <Link href="/attendance">View Attendance</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/leave">View Leave</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/timesheets">View Timesheets</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documents">
          <Card>
            <CardHeader className="border-b">
              <CardTitle className="flex items-center gap-2 text-sm">
                <FileText className="h-4 w-4 text-blue-700" />
                Employee Documents
              </CardTitle>
            </CardHeader>

            <CardContent className="p-6">
              <p className="text-sm text-muted-foreground">
                Employee documents are managed through the Document Center.
              </p>

              <Button asChild variant="outline" className="mt-4">
                <Link href="/documents">Open Document Center</Link>
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="actions">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader className="border-b">
                <CardTitle className="text-sm">
                  Authentication & Access
                </CardTitle>
              </CardHeader>

              <CardContent className="space-y-3 p-5">
                <p className="text-sm text-muted-foreground">
                  Keep your existing Edit Employee, Reset Password and Manage Access dialogs connected here.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="border-b">
                <CardTitle className="text-sm">Payroll Readiness</CardTitle>
              </CardHeader>

              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground">
                  Bank details, compensation, timesheet approval, leave/LOP and statutory configuration are validated before payroll approval.
                </p>

                <Button asChild className="mt-4">
                  <Link href="/payroll/run">Open Payroll Run</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function InfoRow({
  icon,
  label,
  value,
  last = false,
}: {
  icon?: React.ReactNode
  label: string
  value: string
  last?: boolean
}) {
  return (
    <div
      className={
        last
          ? 'flex items-center justify-between gap-4 py-3'
          : 'flex items-center justify-between gap-4 border-b py-3'
      }
    >
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>

      <span className="text-right text-sm font-medium">{value}</span>
    </div>
  )
}

function MetricCard({
  label,
  value,
  icon,
}: {
  label: string
  value: string
  icon: React.ReactNode
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <div className="text-blue-700">{icon}</div>
        </div>

        <p className="mt-2 text-xl font-bold">{value}</p>
      </CardContent>
    </Card>
  )
}
