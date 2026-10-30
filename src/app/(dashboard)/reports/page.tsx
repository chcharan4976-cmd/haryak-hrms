'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'

import {
  Users,
  Clock,
  IndianRupee,
  Download,
  Loader2,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/shared/page-header'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { toast } from 'sonner'

type ReportKey =
  | 'payroll'
  | 'pf_esi'
  | 'tds'
  | 'attendance'
  | 'leave'
  | 'lop'
  | 'headcount'
  | 'joiners'

interface ReportDefinition {
  key: ReportKey
  name: string
  desc: string
}

interface ReportCategory {
  title: string
  icon: typeof Users
  color: string
  bgColor: string
  reports: ReportDefinition[]
}

interface PayrollReportRow {
  employeeId: string
  employeeCode: string
  employeeName: string
  department: string
  designation: string
  monthlyGross: number
  paidDays: number
  lopDays: number
  gross: number
  deductions: number
  net: number
  deductionLines: any[]
}

interface StatutoryReportRow
  extends PayrollReportRow {
  pf: number
  esi: number
}

interface TdsReportRow
  extends PayrollReportRow {
  tds: number
}

const REPORT_CATEGORIES: ReportCategory[] = [
  {
    title:
      'PAYROLL & STATUTORY COMPLIANCE',
    icon: IndianRupee,
    color:
      'text-emerald-700 dark:text-emerald-400',
    bgColor:
      'bg-emerald-100 dark:bg-emerald-950',
    reports: [
      {
        key: 'payroll',
        name:
          'Monthly Payroll Register',
        desc:
          'Actual payroll records including gross earnings, deductions, LOP and net salary.',
      },
      {
        key: 'pf_esi',
        name:
          'PF & ESI Statutory Return',
        desc:
          'Statutory PF and ESI deductions available from processed payroll records.',
      },
      {
        key: 'tds',
        name:
          'TDS Deduction Summary',
        desc:
          'Salary TDS or income-tax deductions available from processed payroll records.',
      },
    ],
  },
  {
    title:
      'ATTENDANCE & ABSENCE',
    icon: Clock,
    color:
      'text-amber-700 dark:text-amber-400',
    bgColor:
      'bg-amber-100 dark:bg-amber-950',
    reports: [
      {
        key: 'attendance',
        name:
          'Monthly Attendance Log',
        desc:
          'Recorded employee attendance, check-in, check-out, status and working hours.',
      },
      {
        key: 'leave',
        name:
          'Leave & Request Summary',
        desc:
          'Employee leave requests with leave type, duration and approval status.',
      },
      {
        key: 'lop',
        name:
          'Loss of Pay (LOP) Schedule',
        desc:
          'Actual LOP days recorded during payroll calculation.',
      },
    ],
  },
  {
    title:
      'WORKFORCE & HEADCOUNT',
    icon: Users,
    color:
      'text-blue-700 dark:text-blue-400',
    bgColor:
      'bg-blue-100 dark:bg-blue-950',
    reports: [
      {
        key: 'headcount',
        name:
          'Department Headcount Audit',
        desc:
          'Current active workforce distribution across corporate business units.',
      },
      {
        key: 'joiners',
        name:
          'New Joiners & Onboarding Report',
        desc:
          'Current employee records with joining and organizational information.',
      },
    ],
  },
]

function getCurrentMonthRange() {
  const now = new Date()

  const year =
    now.getFullYear()

  const month =
    now.getMonth()

  const start =
    new Date(
      year,
      month,
      1,
    )

  const end =
    new Date(
      year,
      month + 1,
      0,
    )

  const formatDate = (
    date: Date,
  ) => {
    const y =
      date.getFullYear()

    const m =
      String(
        date.getMonth() + 1,
      ).padStart(2, '0')

    const d =
      String(
        date.getDate(),
      ).padStart(2, '0')

    return `${y}-${m}-${d}`
  }

  return {
    start:
      formatDate(start),
    end:
      formatDate(end),
    month:
      month + 1,
    year,
  }
}

function escapeCsv(
  value: unknown,
) {
  if (
    value === null ||
    value === undefined
  ) {
    return ''
  }

  const text =
    typeof value === 'object'
      ? JSON.stringify(value)
      : String(value)

  return `"${text.replace(
    /"/g,
    '""',
  )}"`
}

function downloadCsv(
  filename: string,
  headers: string[],
  rows: unknown[][],
) {
  const csv = [
    headers
      .map(escapeCsv)
      .join(','),
    ...rows.map(
      row =>
        row
          .map(escapeCsv)
          .join(','),
    ),
  ].join('\r\n')

  const blob =
    new Blob(
      ['\uFEFF', csv],
      {
        type:
          'text/csv;charset=utf-8;',
      },
    )

  const url =
    URL.createObjectURL(blob)

  const link =
    document.createElement('a')

  link.href = url
  link.download = filename

  document.body.appendChild(
    link,
  )

  link.click()

  document.body.removeChild(
    link,
  )

  URL.revokeObjectURL(url)
}

function normalizeArray(
  payload: any,
  keys: string[],
): any[] {
  for (
    const key of keys
  ) {
    if (
      Array.isArray(
        payload?.[key],
      )
    ) {
      return payload[key]
    }
  }

  if (
    Array.isArray(
      payload?.data,
    )
  ) {
    return payload.data
  }

  if (
    Array.isArray(payload)
  ) {
    return payload
  }

  return []
}

function getEmployeeId(
  employee: any,
) {
  return (
    employee?.id ||
    employee?.employee_id ||
    ''
  )
}

function getEmployeeCode(
  employee: any,
) {
  return (
    employee?.employee_code ||
    employee?.code ||
    employee?.employeeCode ||
    ''
  )
}

function getEmployeeName(
  employee: any,
) {
  return (
    employee?.full_name ||
    employee?.name ||
    employee?.fullName ||
    ''
  )
}

function getEmployeeEmail(
  employee: any,
) {
  return (
    employee?.official_email ||
    employee?.email ||
    ''
  )
}

function getEmployeeDepartment(
  employee: any,
) {
  if (
    typeof employee?.department ===
    'string'
  ) {
    return employee.department
  }

  return (
    employee?.department?.name ||
    employee?.departments?.name ||
    employee?.department_name ||
    ''
  )
}

function getEmployeeDesignation(
  employee: any,
) {
  if (
    typeof employee?.designation ===
    'string'
  ) {
    return employee.designation
  }

  return (
    employee?.designation?.name ||
    employee?.designations?.name ||
    employee?.designation_name ||
    ''
  )
}

function getEmployeeJoiningDate(
  employee: any,
) {
  return (
    employee?.joining_date ||
    employee?.date_of_joining ||
    employee?.joiningDate ||
    ''
  )
}

function getEmployeeStatus(
  employee: any,
) {
  if (
    employee?.is_active ===
    false
  ) {
    return 'Inactive'
  }

  const status =
    employee?.employment_status ||
    employee?.status ||
    ''

  return (
    status || 'Active'
  )
}

function isCurrentEmployee(
  employee: any,
) {
  if (
    employee?.is_active ===
    false
  ) {
    return false
  }

  const status =
    String(
      employee
        ?.employment_status ||
        employee?.status ||
        '',
    ).toLowerCase()

  if (
    status === 'inactive' ||
    status === 'terminated' ||
    status === 'resigned' ||
    status === 'separated' ||
    status === 'deleted'
  ) {
    return false
  }

  return true
}

function getPayrollPeriod(
  run: any,
) {
  return (
    run?.payroll_period ||
    run?.period ||
    null
  )
}

function getPayrollRunId(
  run: any,
) {
  return (
    run?.id ||
    run?.payroll_run_id ||
    ''
  )
}

function findDeduction(
  deductions: any[],
  terms: string[],
) {
  return (
    deductions || []
  ).filter(
    (deduction: any) => {
      const text = [
        deduction
          ?.component_name,
        deduction
          ?.component_code,
        deduction?.name,
        deduction?.code,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return terms.some(
        term =>
          text.includes(
            term,
          ),
      )
    },
  )
}

function sumDeduction(
  deductions: any[],
  terms: string[],
) {
  return findDeduction(
    deductions,
    terms,
  ).reduce(
    (
      sum: number,
      deduction: any,
    ) =>
      sum +
      Number(
        deduction?.amount ??
          deduction?.final_amount ??
          0,
      ),
    0,
  )
}

export default function ReportsPage() {
  const [
    employees,
    setEmployees,
  ] = useState<any[]>([])

  const [
    payrollRuns,
    setPayrollRuns,
  ] = useState<any[]>([])

  const [
    attendance,
    setAttendance,
  ] = useState<any[]>([])

  const [
    leaveRequests,
    setLeaveRequests,
  ] = useState<any[]>([])

  const [
    loading,
    setLoading,
  ] = useState(true)

  const [
    generatingReport,
    setGeneratingReport,
  ] =
    useState<ReportKey | null>(
      null,
    )

  const [
    loadError,
    setLoadError,
  ] =
    useState<string | null>(
      null,
    )

  const currentMonth =
    useMemo(
      () =>
        getCurrentMonthRange(),
      [],
    )

  const loadReportData =
    useCallback(
      async () => {
        setLoading(true)
        setLoadError(null)

        try {
          const [
            employeeResponse,
            payrollResponse,
            attendanceResponse,
            leaveResponse,
          ] =
            await Promise.all([
              fetch(
                '/api/employees?status=all',
                {
                  cache:
                    'no-store',
                },
              ),

              fetch(
                '/api/payroll/run',
                {
                  cache:
                    'no-store',
                },
              ),

              fetch(
                `/api/attendance?start_date=${currentMonth.start}&end_date=${currentMonth.end}`,
                {
                  cache:
                    'no-store',
                },
              ),

              fetch(
                '/api/leave',
                {
                  cache:
                    'no-store',
                },
              ),
            ])

          const [
            employeeData,
            payrollData,
            attendanceData,
            leaveData,
          ] =
            await Promise.all([
              employeeResponse.json(),
              payrollResponse.json(),
              attendanceResponse.json(),
              leaveResponse.json(),
            ])

          if (
            !employeeResponse.ok
          ) {
            throw new Error(
              employeeData?.error ||
                'Unable to load employees.',
            )
          }

          if (
            !payrollResponse.ok
          ) {
            throw new Error(
              payrollData?.error ||
                'Unable to load payroll runs.',
            )
          }

          if (
            !attendanceResponse.ok
          ) {
            throw new Error(
              attendanceData?.error ||
                'Unable to load attendance.',
            )
          }

          if (
            !leaveResponse.ok
          ) {
            throw new Error(
              leaveData?.error ||
                'Unable to load leave requests.',
            )
          }

          setEmployees(
            normalizeArray(
              employeeData,
              ['employees'],
            ),
          )

          setPayrollRuns(
            normalizeArray(
              payrollData,
              [
                'runs',
                'payrollRuns',
              ],
            ),
          )

          setAttendance(
            normalizeArray(
              attendanceData,
              [
                'records',
                'attendance',
              ],
            ),
          )

          setLeaveRequests(
            normalizeArray(
              leaveData,
              ['requests'],
            ),
          )
        } catch (
          error: any
        ) {
          console.error(
            'Reports data loading error:',
            error,
          )

          setLoadError(
            error?.message ||
              'Unable to load report data.',
          )
        } finally {
          setLoading(
            false,
          )
        }
      },
      [
        currentMonth.start,
        currentMonth.end,
      ],
    )

  useEffect(() => {
    void loadReportData()
  }, [loadReportData])

  const currentEmployees =
    useMemo(
      () =>
        employees.filter(
          (
            employee: any,
          ) =>
            isCurrentEmployee(
              employee,
            ),
        ),
      [employees],
    )

  const currentEmployeeIds =
    useMemo(
      () =>
        new Set(
          currentEmployees
            .map(
              (
                employee: any,
              ) =>
                getEmployeeId(
                  employee,
                ),
            )
            .filter(Boolean),
        ),
      [currentEmployees],
    )

  const currentAttendance =
    useMemo(
      () =>
        attendance.filter(
          (
            record: any,
          ) => {
            const employeeId =
              record
                ?.employee_id ||
              record?.employee
                ?.id

            return (
              !employeeId ||
              currentEmployeeIds.has(
                employeeId,
              )
            )
          },
        ),
      [
        attendance,
        currentEmployeeIds,
      ],
    )

  const currentLeaveRequests =
    useMemo(
      () =>
        leaveRequests.filter(
          (
            request: any,
          ) => {
            const employeeId =
              request
                ?.employee_id ||
              request?.employee
                ?.id

            return (
              !employeeId ||
              currentEmployeeIds.has(
                employeeId,
              )
            )
          },
        ),
      [
        leaveRequests,
        currentEmployeeIds,
      ],
    )

  const latestPayrollRun =
    useMemo(() => {
      if (
        payrollRuns.length ===
        0
      ) {
        return null
      }

      return [
        ...payrollRuns,
      ].sort(
        (
          a: any,
          b: any,
        ) => {
          const aTime =
            new Date(
              a?.created_at ||
                a?.updated_at ||
                0,
            ).getTime()

          const bTime =
            new Date(
              b?.created_at ||
                b?.updated_at ||
                0,
            ).getTime()

          return (
            bTime -
            aTime
          )
        },
      )[0]
    }, [payrollRuns])

  const fetchLatestPayrollRecords =
    async (): Promise<any[]> => {
      if (
        !latestPayrollRun
      ) {
        return []
      }

      const runId =
        getPayrollRunId(
          latestPayrollRun,
        )

      if (!runId) {
        return []
      }

      const possibleUrls = [
        `/api/payroll/run?id=${encodeURIComponent(
          runId,
        )}`,
        `/api/payroll/run?payroll_run_id=${encodeURIComponent(
          runId,
        )}`,
      ]

      for (
        const url of
        possibleUrls
      ) {
        try {
          const response =
            await fetch(
              url,
              {
                cache:
                  'no-store',
              },
            )

          if (
            !response.ok
          ) {
            continue
          }

          const data =
            await response.json()

          const records =
            normalizeArray(
              data,
              [
                'records',
                'employeeRecords',
                'payrollRecords',
              ],
            )

          if (
            records.length >
            0
          ) {
            return records
          }

          if (
            Array.isArray(
              data?.run
                ?.records,
            )
          ) {
            return data.run
              .records
          }

          if (
            Array.isArray(
              data
                ?.payrollRun
                ?.records,
            )
          ) {
            return data
              .payrollRun
              .records
          }
        } catch (
          error
        ) {
          console.warn(
            'Unable to load payroll records from:',
            url,
            error,
          )
        }
      }

      return []
    }

  const fetchPayslips =
    async (): Promise<any[]> => {
      const run =
        latestPayrollRun

      if (!run) {
        return []
      }

      const period =
        getPayrollPeriod(
          run,
        )

      const month =
        period?.period_month ||
        run?.period_month ||
        currentMonth.month

      const year =
        period?.period_year ||
        run?.period_year ||
        currentMonth.year

      try {
        const response =
          await fetch(
            `/api/payslips?month=${month}&year=${year}`,
            {
              cache:
                'no-store',
            },
          )

        if (
          !response.ok
        ) {
          return []
        }

        const data =
          await response.json()

        return normalizeArray(
          data,
          ['payslips'],
        )
      } catch (
        error
      ) {
        console.warn(
          'Unable to load payslips:',
          error,
        )

        return []
      }
    }

  const getPayrollRows =
    async (): Promise<
      PayrollReportRow[]
    > => {
      const records =
        await fetchLatestPayrollRecords()

      if (
        records.length > 0
      ) {
        return records.map(
          (
            record: any,
          ): PayrollReportRow => ({
            employeeId:
              record.employee_id ||
              '',

            employeeCode:
              record.employee_code ||
              '',

            employeeName:
              record.employee_name ||
              '',

            department:
              record.department_name ||
              '',

            designation:
              record.designation_name ||
              '',

            monthlyGross:
              Number(
                record.monthly_gross_entitlement ||
                  0,
              ),

            paidDays:
              Number(
                record.paid_days ||
                  0,
              ),

            lopDays:
              Number(
                record.lop_days ||
                  0,
              ),

            gross:
              Number(
                record.gross_earnings ||
                  0,
              ),

            deductions:
              Number(
                record.total_deductions ||
                  0,
              ),

            net:
              Number(
                record.net_salary ||
                  0,
              ),

            deductionLines:
              Array.isArray(
                record.payroll_deductions,
              )
                ? record.payroll_deductions
                : Array.isArray(
                      record.deductions,
                    )
                  ? record.deductions
                  : [],
          }),
        )
      }

      const payslips =
        await fetchPayslips()

      return payslips.map(
        (
          payslip: any,
        ): PayrollReportRow => {
          const snapshot =
            payslip.snapshot_data ||
            payslip.snapshot ||
            {}

          return {
            employeeId:
              payslip.employee_id ||
              '',

            employeeCode:
              snapshot.employeeId ||
              snapshot.employeeCode ||
              '',

            employeeName:
              snapshot.employeeName ||
              '',

            department:
              snapshot.department ||
              '',

            designation:
              snapshot.designation ||
              '',

            monthlyGross:
              Number(
                snapshot.monthlyGross ||
                  snapshot.grossEarnings ||
                  0,
              ),

            paidDays:
              Number(
                snapshot.paidDays ||
                  0,
              ),

            lopDays:
              Number(
                snapshot.lopDays ||
                  0,
              ),

            gross:
              Number(
                snapshot.grossEarnings ||
                  0,
              ),

            deductions:
              Number(
                snapshot.totalDeductions ||
                  0,
              ),

            net:
              Number(
                snapshot.netSalary ||
                  payslip.net_salary ||
                  0,
              ),

            deductionLines:
              Array.isArray(
                snapshot.deductions,
              )
                ? snapshot.deductions
                : [],
          }
        },
      )
    }

  const getReportCount = (
    key: ReportKey,
  ): number => {
    switch (key) {
      case 'attendance':
        return currentAttendance.length

      case 'leave':
        return currentLeaveRequests.length

      case 'headcount':
      case 'joiners':
        return currentEmployees.length

      case 'payroll':
      case 'pf_esi':
      case 'tds':
      case 'lop':
        return latestPayrollRun
          ? Number(
              latestPayrollRun
                .total_employees ||
                0,
            )
          : 0

      default:
        return 0
    }
  }

  const handleGenerateReport =
    async (
      report: ReportDefinition,
    ) => {
      setGeneratingReport(
        report.key,
      )

      try {
        const today =
          new Date()
            .toISOString()
            .split('T')[0]

        const safeName =
          report.name
            .replace(
              /[^a-zA-Z0-9]+/g,
              '_',
            )
            .replace(
              /^_|_$/g,
              '',
            )

        const fileName =
          `Haryak_${safeName}_${today}.csv`

        // =====================================================
        // DEPARTMENT HEADCOUNT
        // =====================================================

        if (
          report.key ===
          'headcount'
        ) {
          if (
            currentEmployees.length ===
            0
          ) {
            toast.error(
              'No active employees are available for this report.',
            )

            return
          }

          const departmentMap =
            new Map<
              string,
              number
            >()

          currentEmployees.forEach(
            (
              employee: any,
            ) => {
              const department =
                getEmployeeDepartment(
                  employee,
                ) ||
                'Unassigned'

              departmentMap.set(
                department,
                (departmentMap.get(
                  department,
                ) || 0) + 1,
              )
            },
          )

          const rows:
            unknown[][] =
            Array.from(
              departmentMap.entries(),
            )
              .sort(
                (a, b) =>
                  a[0].localeCompare(
                    b[0],
                  ),
              )
              .map(
                ([
                  department,
                  count,
                ]) => [
                  department,
                  count,
                ],
              )

          downloadCsv(
            fileName,
            [
              'Department',
              'Active Headcount',
            ],
            rows,
          )

          toast.success(
            `${report.name} generated successfully.`,
          )

          return
        }

        // =====================================================
        // NEW JOINERS / CURRENT WORKFORCE
        // =====================================================

        if (
          report.key ===
          'joiners'
        ) {
          if (
            currentEmployees.length ===
            0
          ) {
            toast.error(
              'No current employee records are available.',
            )

            return
          }

          downloadCsv(
            fileName,
            [
              'Employee ID',
              'Employee Name',
              'Official Email',
              'Department',
              'Designation',
              'Employment Status',
              'Joining Date',
            ],
            currentEmployees.map(
              (
                employee: any,
              ) => [
                getEmployeeCode(
                  employee,
                ),
                getEmployeeName(
                  employee,
                ),
                getEmployeeEmail(
                  employee,
                ),
                getEmployeeDepartment(
                  employee,
                ),
                getEmployeeDesignation(
                  employee,
                ),
                getEmployeeStatus(
                  employee,
                ),
                getEmployeeJoiningDate(
                  employee,
                ),
              ],
            ),
          )

          toast.success(
            `${report.name} generated successfully.`,
          )

          return
        }

        // =====================================================
        // ATTENDANCE
        // =====================================================

        if (
          report.key ===
          'attendance'
        ) {
          if (
            currentAttendance.length ===
            0
          ) {
            toast.error(
              'No attendance records exist for the current month.',
            )

            return
          }

          downloadCsv(
            fileName,
            [
              'Employee ID',
              'Employee Name',
              'Department',
              'Attendance Date',
              'Status',
              'Check In',
              'Check Out',
              'Working Hours',
            ],
            currentAttendance.map(
              (
                record: any,
              ) => [
                record?.employee
                  ?.code ||
                  record?.employee_code ||
                  '',

                record?.employee
                  ?.name ||
                  record?.employee_name ||
                  '',

                record?.employee
                  ?.department ||
                  record?.department ||
                  '',

                record?.attendance_date ||
                  record?.date ||
                  '',

                record?.status ||
                  '',

                record?.check_in ||
                  '',

                record?.check_out ||
                  '',

                record?.working_hours ??
                  '',
              ],
            ),
          )

          toast.success(
            `${report.name} generated successfully.`,
          )

          return
        }

        // =====================================================
        // LEAVE
        // =====================================================

        if (
          report.key ===
          'leave'
        ) {
          if (
            currentLeaveRequests.length ===
            0
          ) {
            toast.error(
              'No leave requests are available.',
            )

            return
          }

          downloadCsv(
            fileName,
            [
              'Employee ID',
              'Employee Name',
              'Department',
              'Leave Type',
              'Start Date',
              'End Date',
              'Total Days',
              'Status',
              'Reason',
              'Applied At',
            ],
            currentLeaveRequests.map(
              (
                request: any,
              ) => [
                request.employee_code ||
                  request
                    ?.employee
                    ?.code ||
                  '',

                request.employee_name ||
                  request
                    ?.employee
                    ?.name ||
                  '',

                request.department ||
                  request
                    ?.employee
                    ?.department ||
                  '',

                request.leave_type ||
                  '',

                request.start_date ||
                  '',

                request.end_date ||
                  '',

                request.total_days ??
                  request.days ??
                  '',

                request.status ||
                  '',

                request.reason ||
                  '',

                request.applied_at ||
                  request.created_at ||
                  '',
              ],
            ),
          )

          toast.success(
            `${report.name} generated successfully.`,
          )

          return
        }

        // =====================================================
        // PAYROLL DATA
        // =====================================================

        const payrollRows:
          PayrollReportRow[] =
          await getPayrollRows()

        if (
          payrollRows.length ===
          0
        ) {
          toast.error(
            'No processed payroll records or generated payslips are available for this report.',
          )

          return
        }

        // =====================================================
        // MONTHLY PAYROLL REGISTER
        // =====================================================

        if (
          report.key ===
          'payroll'
        ) {
          downloadCsv(
            fileName,
            [
              'Employee ID',
              'Employee Name',
              'Department',
              'Designation',
              'Monthly Gross Entitlement',
              'Paid Days',
              'LOP Days',
              'Gross Earnings',
              'Total Deductions',
              'Net Salary',
            ],
            payrollRows.map(
              (
                row: PayrollReportRow,
              ) => [
                row.employeeCode,
                row.employeeName,
                row.department,
                row.designation,
                row.monthlyGross,
                row.paidDays,
                row.lopDays,
                row.gross,
                row.deductions,
                row.net,
              ],
            ),
          )

          toast.success(
            `${report.name} generated successfully.`,
          )

          return
        }

        // =====================================================
        // LOSS OF PAY
        // =====================================================

        if (
          report.key ===
          'lop'
        ) {
          const lopRows:
            PayrollReportRow[] =
            payrollRows.filter(
              (
                row: PayrollReportRow,
              ) =>
                Number(
                  row.lopDays,
                ) > 0,
            )

          if (
            lopRows.length ===
            0
          ) {
            toast.info(
              'No Loss of Pay records exist in the latest processed payroll.',
            )

            return
          }

          downloadCsv(
            fileName,
            [
              'Employee ID',
              'Employee Name',
              'Department',
              'Paid Days',
              'LOP Days',
              'Monthly Gross Entitlement',
              'Actual Gross Earnings',
              'Net Salary',
            ],
            lopRows.map(
              (
                row: PayrollReportRow,
              ) => [
                row.employeeCode,
                row.employeeName,
                row.department,
                row.paidDays,
                row.lopDays,
                row.monthlyGross,
                row.gross,
                row.net,
              ],
            ),
          )

          toast.success(
            `${report.name} generated successfully.`,
          )

          return
        }

        // =====================================================
        // PF / ESI
        // =====================================================

        if (
          report.key ===
          'pf_esi'
        ) {
          const statutoryRows:
            StatutoryReportRow[] =
            payrollRows
              .map(
                (
                  row: PayrollReportRow,
                ): StatutoryReportRow => {
                  const pf =
                    sumDeduction(
                      row.deductionLines,
                      [
                        'provident',
                        'pf',
                      ],
                    )

                  const esi =
                    sumDeduction(
                      row.deductionLines,
                      [
                        'esi',
                        'esic',
                      ],
                    )

                  return {
                    ...row,
                    pf,
                    esi,
                  }
                },
              )
              .filter(
                (
                  row: StatutoryReportRow,
                ) =>
                  row.pf > 0 ||
                  row.esi > 0,
              )

          if (
            statutoryRows.length ===
            0
          ) {
            toast.info(
              'No PF or ESI deduction lines exist in the available processed payroll.',
            )

            return
          }

          downloadCsv(
            fileName,
            [
              'Employee ID',
              'Employee Name',
              'Gross Earnings',
              'PF Deduction',
              'ESI Deduction',
            ],
            statutoryRows.map(
              (
                row: StatutoryReportRow,
              ) => [
                row.employeeCode,
                row.employeeName,
                row.gross,
                row.pf,
                row.esi,
              ],
            ),
          )

          toast.success(
            `${report.name} generated successfully.`,
          )

          return
        }

        // =====================================================
        // TDS
        // =====================================================

        if (
          report.key ===
          'tds'
        ) {
          const tdsRows:
            TdsReportRow[] =
            payrollRows
              .map(
                (
                  row: PayrollReportRow,
                ): TdsReportRow => {
                  const tds =
                    sumDeduction(
                      row.deductionLines,
                      [
                        'tds',
                        'income tax',
                        'income_tax',
                      ],
                    )

                  return {
                    ...row,
                    tds,
                  }
                },
              )
              .filter(
                (
                  row: TdsReportRow,
                ) =>
                  row.tds > 0,
              )

          if (
            tdsRows.length ===
            0
          ) {
            toast.info(
              'No TDS or income-tax deduction lines exist in the available processed payroll.',
            )

            return
          }

          downloadCsv(
            fileName,
            [
              'Employee ID',
              'Employee Name',
              'Gross Earnings',
              'TDS Deducted',
              'Net Salary',
            ],
            tdsRows.map(
              (
                row: TdsReportRow,
              ) => [
                row.employeeCode,
                row.employeeName,
                row.gross,
                row.tds,
                row.net,
              ],
            ),
          )

          toast.success(
            `${report.name} generated successfully.`,
          )
        }
      } catch (
        error: any
      ) {
        console.error(
          `Error generating ${report.name}:`,
          error,
        )

        toast.error(
          error?.message ||
            `Failed to generate ${report.name}.`,
        )
      } finally {
        setGeneratingReport(
          null,
        )
      }
    }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports & Analytics Center"
        description="Generate and export reports from actual Haryak HRMS payroll, attendance, leave, and workforce records."
      />

      <Card className="border-border/70">
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                ) : loadError ? (
                  <AlertCircle className="h-4 w-4 text-red-600" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                )}

                <p className="text-sm font-semibold">
                  {loading
                    ? 'Loading report data...'
                    : loadError
                      ? 'Report data requires attention'
                      : 'Report data synchronized'}
                </p>
              </div>

              <p className="mt-1 text-xs text-muted-foreground">
                Current reporting
                period:{' '}
                {
                  currentMonth.start
                }{' '}
                to{' '}
                {
                  currentMonth.end
                }
              </p>

              {loadError && (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                  {loadError}
                </p>
              )}
            </div>

            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              disabled={loading}
              onClick={() =>
                void loadReportData()
              }
            >
              {loading ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              )}

              Refresh Data
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-7">
        {REPORT_CATEGORIES.map(
          (
            category: ReportCategory,
          ) => {
            const CategoryIcon =
              category.icon

            return (
              <div
                key={
                  category.title
                }
                className="space-y-3"
              >
                <div className="flex items-center gap-2">
                  <div
                    className={`rounded-lg p-1.5 ${category.bgColor} ${category.color}`}
                  >
                    <CategoryIcon className="h-4 w-4" />
                  </div>

                  <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    {
                      category.title
                    }
                  </h2>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {category.reports.map(
                    (
                      report: ReportDefinition,
                    ) => {
                      const count =
                        getReportCount(
                          report.key,
                        )

                      const generating =
                        generatingReport ===
                        report.key

                      return (
                        <Card
                          key={
                            report.key
                          }
                          className="flex flex-col justify-between shadow-xs transition-all hover:-translate-y-0.5 hover:shadow-md"
                        >
                          <CardHeader className="pb-3">
                            <div className="mb-2 flex items-start justify-between gap-3">
                              <CardTitle className="text-sm font-bold leading-5 text-foreground">
                                {
                                  report.name
                                }
                              </CardTitle>

                              <Badge
                                variant="outline"
                                className="shrink-0 text-[10px]"
                              >
                                CSV
                              </Badge>
                            </div>

                            <CardDescription className="text-xs leading-relaxed">
                              {
                                report.desc
                              }
                            </CardDescription>
                          </CardHeader>

                          <CardContent className="mt-3 flex items-center justify-between border-t pt-3">
                            <div>
                              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                Available
                                Records
                              </p>

                              <p className="mt-0.5 text-sm font-bold">
                                {loading
                                  ? '...'
                                  : count}
                              </p>
                            </div>

                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 text-xs text-blue-700 hover:text-blue-900 dark:text-blue-400"
                              onClick={() =>
                                void handleGenerateReport(
                                  report,
                                )
                              }
                              disabled={
                                generating ||
                                loading
                              }
                            >
                              {generating ? (
                                <>
                                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                  Generating
                                </>
                              ) : (
                                <>
                                  <Download className="mr-1.5 h-3.5 w-3.5" />
                                  Export CSV
                                </>
                              )}
                            </Button>
                          </CardContent>
                        </Card>
                      )
                    },
                  )}
                </div>
              </div>
            )
          },
        )}
      </div>
    </div>
  )
}