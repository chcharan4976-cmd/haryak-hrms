'use client'

import React, {
  useEffect,
  useMemo,
  useState,
} from 'react'

import Link from 'next/link'

import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Download,
  FileText,
  Info,
  Loader2,
  Lock,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRound,
  Users,
} from 'lucide-react'

import {
  cn,
} from '@/lib/utils'

import {
  formatCurrency,
} from '@/lib/utils/format'

import {
  Button,
} from '@/components/ui/button'

import {
  Badge,
} from '@/components/ui/badge'

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

import {
  Tabs,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'

import {
  Checkbox,
} from '@/components/ui/checkbox'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

import {
  toast,
} from 'sonner'

// ============================================================
// CONSTANTS
// ============================================================

const STEPS = [
  'Select Employees',
  'Automatic Data Aggregation',
  'Exception Review',
  'Approval',
  'Lock & Release',
]

type PayrollCategory =
  | 'NO_CHANGES'
  | 'SALARY_CHANGED'
  | 'LOP'
  | 'BONUS'
  | 'NEW_JOINER'
  | 'EXIT'
  | 'ACTION_REQUIRED'

type PayrollStatus =
  | 'VALID'
  | 'WARNING'
  | 'ERROR'

interface EmployeeOption {
  id: string
  code: string
  name: string
  department: string
  designation: string
}

interface TimesheetReconciliation {
  workedDates: string[]
  workedDays: number
  paidLeaveDates: string[]
  paidLeaveDays: number
  unpaidLeaveDates: string[]
  lopDays: number
  unresolvedDates: string[]
  unresolvedDays: number
}

interface PayrollEmployeeRow {
  recordId: string
  id: string
  code: string
  name: string
  dept: string
  designation: string

  paidDays: number
  workingDays: number
  lop: number

  workedDays: number
  paidLeaveDays: number
  unresolvedDays: number

  perDayRate: number
  lopDeduction: number
  monthlyGrossEntitlement: number
  proratedFixedGross: number

  gross: number
  pf: number
  pt: number
  tds: number
  otherDed: number
  net: number

  category: PayrollCategory
  status: PayrollStatus
  statusMessage?: string

  salaryHikePct?: number
  bonusAmount?: number

  breakdown: {
    basic: number
    hra: number
    specialAllowance: number
    otherAllowance: number
    pfWage: number
    pfRate: number
    ptSlab: string
  }

  lineItems?: any[]
  warnings?: any[]
  errors?: any[]

  reconciliation?: TimesheetReconciliation
}

interface RunSummary {
  selectedEmployees: number
  calculatedEmployees: number
  blockedEmployees: number
  totalEmployeesProcessed: number
  totalGross: number
  totalDeductions: number
  totalNet: number
}

// ============================================================
// SMALL HELPERS
// ============================================================

function firstMessage(
  value: unknown
): string {
  if (
    !value
  ) {
    return ''
  }

  if (
    typeof value === 'string'
  ) {
    return value
  }

  if (
    typeof value === 'object' &&
    value !== null &&
    'message' in value
  ) {
    return String(
      (
        value as {
          message?: unknown
        }
      ).message || ''
    )
  }

  return String(value)
}

function getComponentAmount(
  items: any[],
  codes: string[]
): number {
  const normalized =
    codes.map(
      code =>
        code.toUpperCase()
    )

  const item =
    items.find(
      entry =>
        normalized.includes(
          String(
            entry.component_code || ''
          ).toUpperCase()
        )
    )

  return Number(
    item?.final_amount ||
      item?.amount ||
      0
  )
}

function getPeriodLabel(
  value: string
): string {
  if (
    !value
  ) {
    return ''
  }

  const [
    year,
    month,
  ] =
    value
      .split('-')
      .map(Number)

  if (
    !year ||
    !month
  ) {
    return value
  }

  return new Intl.DateTimeFormat(
    'en-IN',
    {
      month:
        'long',
      year:
        'numeric',
    }
  ).format(
    new Date(
      year,
      month - 1,
      1
    )
  )
}

// ============================================================
// PAGE
// ============================================================

export default function PayrollRunPage() {
  const [
    currentStep,
    setCurrentStep,
  ] =
    useState(0)

  const [
    selectedPeriod,
    setSelectedPeriod,
  ] =
    useState(
      () => {
        const now =
          new Date()

        return `${now.getFullYear()}-${String(
          now.getMonth() +
            1
        ).padStart(
          2,
          '0'
        )}`
      }
    )

  const [
    activeTab,
    setActiveTab,
  ] =
    useState('ALL')

  const [
    expandedRows,
    setExpandedRows,
  ] =
    useState<
      Record<
        string,
        boolean
      >
    >({})

  const [
    searchQuery,
    setSearchQuery,
  ] =
    useState('')

  const [
    employeeSearch,
    setEmployeeSearch,
  ] =
    useState('')

  const [
    isApproved,
    setIsApproved,
  ] =
    useState(false)

  const [
    approvalConfirmed,
    setApprovalConfirmed,
  ] =
    useState(false)

  const [
    isDialogOpen,
    setIsDialogOpen,
  ] =
    useState(false)

  const [
    employees,
    setEmployees,
  ] =
    useState<
      PayrollEmployeeRow[]
    >([])

  const [
    employeeOptions,
    setEmployeeOptions,
  ] =
    useState<
      EmployeeOption[]
    >([])

  const [
    selectedEmployeeIds,
    setSelectedEmployeeIds,
  ] =
    useState<
      Set<string>
    >(
      new Set()
    )

  const [
    loadingEmployees,
    setLoadingEmployees,
  ] =
    useState(true)

  const [
    calculating,
    setCalculating,
  ] =
    useState(false)

  const [
    approving,
    setApproving,
  ] =
    useState(false)

  const [
    runId,
    setRunId,
  ] =
    useState<
      string | null
    >(null)

  const [
    runSummary,
    setRunSummary,
  ] =
    useState<
      RunSummary | null
    >(null)

  // ==========================================================
  // LOAD ACTIVE EMPLOYEES
  // ==========================================================

  useEffect(
    () => {
      const loadEligibleEmployees =
        async () => {
          setLoadingEmployees(
            true
          )

          try {
            const response =
              await fetch(
                '/api/employees',
                {
                  cache:
                    'no-store',
                  credentials:
                    'include',
                }
              )

            const data =
              await response.json()

            if (
              !response.ok
            ) {
              throw new Error(
                data.error ||
                  'Unable to load employees.'
              )
            }

            const source =
              Array.isArray(
                data.employees
              )
                ? data.employees
                : Array.isArray(
                    data.data
                  )
                ? data.data
                : []

            const mapped:
              EmployeeOption[] =
              source
                .filter(
                  (
                    employee: any
                  ) =>
                    employee.is_active !==
                      false &&
                    String(
                      employee.employment_status ||
                        'active'
                    ).toLowerCase() !==
                      'inactive'
                )
                .map(
                  (
                    employee: any
                  ) => ({
                    id:
                      employee.id,

                    code:
                      employee.employee_code ||
                      employee.code ||
                      '',

                    name:
                      employee.full_name ||
                      employee.name ||
                      '',

                    department:
                      employee.departments?.name ||
                      employee.department?.name ||
                      employee.department_name ||
                      'Not assigned',

                    designation:
                      employee.designations?.name ||
                      employee.designation?.name ||
                      employee.designation_name ||
                      'Not assigned',
                  })
                )

            setEmployeeOptions(
              mapped
            )
          } catch (
            error: any
          ) {
            console.error(
              'Error fetching employees:',
              error
            )

            toast.error(
              error?.message ||
                'Unable to load employees.'
            )
          } finally {
            setLoadingEmployees(
              false
            )
          }
        }

      void loadEligibleEmployees()
    },
    []
  )

  // ==========================================================
  // DERIVED DATA
  // ==========================================================

  const selectedCount =
    selectedEmployeeIds.size

  const employeeListFiltered =
    useMemo(
      () => {
        const q =
          employeeSearch
            .trim()
            .toLowerCase()

        if (!q) {
          return employeeOptions
        }

        return employeeOptions.filter(
          employee =>
            employee.name
              .toLowerCase()
              .includes(q) ||
            employee.code
              .toLowerCase()
              .includes(q) ||
            employee.department
              .toLowerCase()
              .includes(q) ||
            employee.designation
              .toLowerCase()
              .includes(q)
        )
      },
      [
        employeeOptions,
        employeeSearch,
      ]
    )

  const filteredEmployees =
    useMemo(
      () =>
        employees.filter(
          employee => {
            const q =
              searchQuery
                .trim()
                .toLowerCase()

            const matchesSearch =
              !q ||
              employee.name
                .toLowerCase()
                .includes(q) ||
              employee.code
                .toLowerCase()
                .includes(q) ||
              employee.dept
                .toLowerCase()
                .includes(q)

            if (
              !matchesSearch
            ) {
              return false
            }

            if (
              activeTab ===
              'ALL'
            ) {
              return true
            }

            if (
              activeTab ===
              'NO_CHANGES'
            ) {
              return (
                employee.category ===
                'NO_CHANGES'
              )
            }

            if (
              activeTab ===
              'LOP'
            ) {
              return (
                employee.lop >
                0
              )
            }

            if (
              activeTab ===
              'WARNINGS'
            ) {
              return (
                employee.status ===
                'WARNING'
              )
            }

            if (
              activeTab ===
              'ERRORS'
            ) {
              return (
                employee.status ===
                'ERROR'
              )
            }

            if (
              activeTab ===
              'ACTION_REQUIRED'
            ) {
              return (
                employee.unresolvedDays >
                  0 ||
                employee.status ===
                  'ERROR'
              )
            }

            return (
              employee.category ===
              activeTab
            )
          }
        ),
      [
        employees,
        searchQuery,
        activeTab,
      ]
    )

  const calculatedEmployees =
    employees.filter(
      employee =>
        employee.status !==
        'ERROR'
    )

  const blockedEmployees =
    employees.filter(
      employee =>
        employee.status ===
        'ERROR'
    )

  const totalGross =
    calculatedEmployees.reduce(
      (
        sum,
        employee
      ) =>
        sum +
        employee.gross,
      0
    )

  const totalDeductions =
    calculatedEmployees.reduce(
      (
        sum,
        employee
      ) =>
        sum +
        employee.pf +
        employee.pt +
        employee.tds +
        employee.otherDed,
      0
    )

  const totalNet =
    calculatedEmployees.reduce(
      (
        sum,
        employee
      ) =>
        sum +
        employee.net,
      0
    )

  const canProceedToApproval =
    employees.length >
      0 &&
    calculatedEmployees.length >
      0 &&
    blockedEmployees.length ===
      0

  // ==========================================================
  // SELECTION
  // ==========================================================

  const toggleEmployeeSelection =
    (
      employeeId: string
    ) => {
      setSelectedEmployeeIds(
        previous => {
          const next =
            new Set(
              previous
            )

          if (
            next.has(
              employeeId
            )
          ) {
            next.delete(
              employeeId
            )
          } else {
            next.add(
              employeeId
            )
          }

          return next
        }
      )
    }

  const selectAllVisible =
    () => {
      setSelectedEmployeeIds(
        previous => {
          const next =
            new Set(
              previous
            )

          for (
            const employee of
              employeeListFiltered
          ) {
            next.add(
              employee.id
            )
          }

          return next
        }
      )
    }

  const clearSelection =
    () => {
      setSelectedEmployeeIds(
        new Set()
      )
    }

  // ==========================================================
  // ROW TOGGLE
  // ==========================================================

  const toggleRow =
    (
      id: string
    ) => {
      setExpandedRows(
        previous => ({
          ...previous,
          [id]:
            !previous[id],
        })
      )
    }

  const prevStep =
    () =>
      setCurrentStep(
        previous =>
          Math.max(
            previous - 1,
            0
          )
      )

  // ==========================================================
  // CREATE/GET PERIOD
  // ==========================================================

  const getOrCreatePayrollPeriod =
    async (): Promise<string> => {
      const [
        yearString,
        monthString,
      ] =
        selectedPeriod.split(
          '-'
        )

      const year =
        Number(
          yearString
        )

      const month =
        Number(
          monthString
        )

      const periodResponse =
        await fetch(
          '/api/payroll/periods',
          {
            method:
              'POST',

            headers: {
              'Content-Type':
                'application/json',
            },

            credentials:
              'include',

            body:
              JSON.stringify({
                period_year:
                  year,

                period_month:
                  month,
              }),
          }
        )

      if (
        periodResponse.status ===
        409
      ) {
        const existingResponse =
          await fetch(
            '/api/payroll/periods',
            {
              cache:
                'no-store',
              credentials:
                'include',
            }
          )

        const existingData =
          await existingResponse.json()

        if (
          !existingResponse.ok
        ) {
          throw new Error(
            existingData.error ||
              'Unable to load existing payroll period.'
          )
        }

        const periods =
          Array.isArray(
            existingData.data
          )
            ? existingData.data
            : Array.isArray(
                existingData.periods
              )
            ? existingData.periods
            : []

        const period =
          periods.find(
            (
              item: any
            ) =>
              Number(
                item.period_year
              ) ===
                year &&
              Number(
                item.period_month
              ) ===
                month
          )

        if (
          !period?.id
        ) {
          throw new Error(
            'Payroll period exists but could not be resolved.'
          )
        }

        return period.id
      }

      const periodData =
        await periodResponse.json()

      if (
        !periodResponse.ok
      ) {
        throw new Error(
          periodData.error ||
            'Unable to create payroll period.'
        )
      }

      if (
        !periodData?.data?.id
      ) {
        throw new Error(
          'Payroll period ID was not returned.'
        )
      }

      return periodData.data.id
    }

  // ==========================================================
  // MAP PAYROLL RESPONSE
  // ==========================================================

  const mapPayrollRecords =
    (
      runData: any
    ): PayrollEmployeeRow[] => {
      const records =
        Array.isArray(
          runData.records
        )
          ? runData.records
          : []

      const earnings =
        Array.isArray(
          runData.earnings
        )
          ? runData.earnings
          : []

      const deductions =
        Array.isArray(
          runData.deductions
        )
          ? runData.deductions
          : []

      return records.map(
        (
          record: any
        ) => {
          const recordEarnings =
            earnings.filter(
              (
                earning: any
              ) =>
                earning.payroll_employee_record_id ===
                record.id
            )

          const recordDeductions =
            deductions.filter(
              (
                deduction: any
              ) =>
                deduction.payroll_employee_record_id ===
                record.id
            )

          const basic =
            getComponentAmount(
              recordEarnings,
              [
                'BASIC',
                'BASIC_SALARY',
              ]
            )

          const hra =
            getComponentAmount(
              recordEarnings,
              [
                'HRA',
              ]
            )

          const specialAllowance =
            getComponentAmount(
              recordEarnings,
              [
                'SPECIAL',
                'SPECIAL_ALLOWANCE',
                'PERSONAL_ALLOWANCE',
              ]
            )

          const pf =
            getComponentAmount(
              recordDeductions,
              [
                'PF',
              ]
            )

          const pt =
            getComponentAmount(
              recordDeductions,
              [
                'PT',
                'PROFESSIONAL_TAX',
              ]
            )

          const tds =
            getComponentAmount(
              recordDeductions,
              [
                'TDS',
              ]
            )

          const otherDed =
            recordDeductions
              .filter(
                (
                  deduction: any
                ) =>
                  ![
                    'PF',
                    'PT',
                    'PROFESSIONAL_TAX',
                    'TDS',
                  ].includes(
                    String(
                      deduction.component_code ||
                        ''
                    ).toUpperCase()
                  )
              )
              .reduce(
                (
                  sum: number,
                  deduction: any
                ) =>
                  sum +
                  Number(
                    deduction.amount ||
                      0
                  ),
                0
              )

          const details =
            record.calculation_details ||
            {}

          const reconciliation =
            details.timesheetReconciliation ||
            {}

          const payrollEvidence =
            details.payrollDayEvidence ||
            {}

          const errors =
            Array.isArray(
              record.errors
            )
              ? record.errors
              : []

          const warnings =
            Array.isArray(
              record.warnings
            )
              ? record.warnings
              : []

          const status:
            PayrollStatus =
            record.status ===
              'error' ||
            errors.length >
              0
              ? 'ERROR'
              : warnings.length >
                0
              ? 'WARNING'
              : 'VALID'

          const unresolvedDays =
            Number(
              reconciliation.unresolvedDays ||
                0
            )

          const lop =
            Number(
              record.lop_days ||
                reconciliation.lopDays ||
                0
            )

          let category:
            PayrollCategory =
            'NO_CHANGES'

          if (
            status ===
              'ERROR' ||
            unresolvedDays >
              0
          ) {
            category =
              'ACTION_REQUIRED'
          } else if (
            lop > 0
          ) {
            category =
              'LOP'
          }

          const firstError =
            firstMessage(
              errors[0]
            )

          const firstWarning =
            firstMessage(
              warnings[0]
            )

          const monthlyGrossEntitlement =
            Number(
              record.monthly_gross_entitlement ||
                details.monthlyGrossEntitlement ||
                0
            )

          const gross =
            Number(
              record.gross_earnings ||
                0
            )

          return {
            recordId:
              record.id,

            id:
              record.employee_id,

            code:
              record.employee_code ||
              '',

            name:
              record.employee_name ||
              '',

            dept:
              record.department_name ||
              'Not assigned',

            designation:
              record.designation_name ||
              'Not assigned',

            paidDays:
              Number(
                record.paid_days ||
                  0
              ),

            workingDays:
              Number(
                record.working_days ||
                  0
              ),

            lop,

            workedDays:
              Number(
                reconciliation.workedDays ||
                  0
              ),

            paidLeaveDays:
              Number(
                reconciliation.paidLeaveDays ||
                  0
              ),

            unresolvedDays,

            perDayRate:
              Number(
                details.perDayGrossRate ||
                  payrollEvidence.perDayGrossRate ||
                  0
              ),

            lopDeduction:
              Number(
                details.lopDeduction ||
                  payrollEvidence.lopDeduction ||
                  0
              ),

            monthlyGrossEntitlement,

            proratedFixedGross:
              Number(
                details.proratedFixedGross ||
                  payrollEvidence.proratedFixedGross ||
                  gross
              ),

            gross,

            pf,

            pt,

            tds,

            otherDed,

            net:
              Number(
                record.net_salary ||
                  0
              ),

            category,

            status,

            statusMessage:
              firstError ||
              firstWarning ||
              '',

            breakdown: {
              basic,

              hra,

              specialAllowance,

              otherAllowance:
                Math.max(
                  0,
                  gross -
                    basic -
                    hra -
                    specialAllowance
                ),

              pfWage:
                basic,

              pfRate:
                12,

              ptSlab:
                'Configured payroll rule',
            },

            lineItems:
              recordDeductions,

            warnings,

            errors,

            reconciliation: {
              workedDates:
                Array.isArray(
                  reconciliation.workedDates
                )
                  ? reconciliation.workedDates
                  : [],

              workedDays:
                Number(
                  reconciliation.workedDays ||
                    0
                ),

              paidLeaveDates:
                Array.isArray(
                  reconciliation.paidLeaveDates
                )
                  ? reconciliation.paidLeaveDates
                  : [],

              paidLeaveDays:
                Number(
                  reconciliation.paidLeaveDays ||
                    0
                ),

              unpaidLeaveDates:
                Array.isArray(
                  reconciliation.unpaidLeaveDates
                )
                  ? reconciliation.unpaidLeaveDates
                  : [],

              lopDays:
                Number(
                  reconciliation.lopDays ||
                    lop
                ),

              unresolvedDates:
                Array.isArray(
                  reconciliation.unresolvedDates
                )
                  ? reconciliation.unresolvedDates
                  : [],

              unresolvedDays,
            },
          }
        }
      )
    }

  // ==========================================================
  // RUN PAYROLL FOR SELECTED EMPLOYEES
  // ==========================================================

  const handleCalculatePayroll =
    async (
      overrideIds?:
        string[]
    ) => {
      const ids =
        overrideIds &&
        overrideIds.length >
          0
          ? overrideIds
          : [
              ...selectedEmployeeIds,
            ]

      if (
        ids.length === 0
      ) {
        toast.error(
          'Select at least one employee before running payroll.'
        )

        return
      }

      setCalculating(
        true
      )

      setCurrentStep(
        1
      )

      setEmployees(
        []
      )

      setRunSummary(
        null
      )

      setRunId(
        null
      )

      setApprovalConfirmed(
        false
      )

      try {
        const periodId =
          await getOrCreatePayrollPeriod()

        const payload:
          Record<
            string,
            unknown
          > = {
          payroll_period_id:
            periodId,
        }

        if (
          ids.length === 1
        ) {
          payload.employee_id =
            ids[0]
        } else {
          payload.employee_ids =
            ids
        }

        const runResponse =
          await fetch(
            '/api/payroll/run',
            {
              method:
                'POST',

              headers: {
                'Content-Type':
                  'application/json',
              },

              credentials:
                'include',

              body:
                JSON.stringify(
                  payload
                ),
            }
          )

        const runData =
          await runResponse.json()

        if (
          !runResponse.ok
        ) {
          throw new Error(
            runData.error ||
              'Failed to run payroll.'
          )
        }

        const nextRunId =
          runData?.data?.id ||
          runData?.run?.id ||
          null

        setRunId(
          nextRunId
        )

        const mapped =
          mapPayrollRecords(
            runData
          )

        setEmployees(
          mapped
        )

        setRunSummary({
          selectedEmployees:
            Number(
              runData.summary
                ?.selectedEmployees ||
                ids.length
            ),

          calculatedEmployees:
            Number(
              runData.summary
                ?.calculatedEmployees ||
                mapped.filter(
                  employee =>
                    employee.status !==
                    'ERROR'
                ).length
            ),

          blockedEmployees:
            Number(
              runData.summary
                ?.blockedEmployees ||
                mapped.filter(
                  employee =>
                    employee.status ===
                    'ERROR'
                ).length
            ),

          totalEmployeesProcessed:
            Number(
              runData.summary
                ?.totalEmployeesProcessed ||
                mapped.length
            ),

          totalGross:
            Number(
              runData.summary
                ?.totalGross ||
                0
            ),

          totalDeductions:
            Number(
              runData.summary
                ?.totalDeductions ||
                0
            ),

          totalNet:
            Number(
              runData.summary
                ?.totalNet ||
                0
            ),
        })

        setCurrentStep(
          2
        )

        if (
          mapped.some(
            employee =>
              employee.status ===
              'ERROR'
          )
        ) {
          toast.warning(
            'Payroll preparation completed with action-required employees.'
          )
        } else {
          toast.success(
            ids.length ===
              1
              ? 'Employee payroll prepared successfully.'
              : `${ids.length} employee payrolls prepared successfully.`
          )
        }
      } catch (
        error: any
      ) {
        console.error(
          error
        )

        toast.error(
          error?.message ||
            'Error calculating payroll.'
        )

        setCurrentStep(
          0
        )
      } finally {
        setCalculating(
          false
        )
      }
    }

  // ==========================================================
  // APPROVAL
  // ==========================================================

  const handleApprovePayroll =
    async () => {
      if (
        !approvalConfirmed
      ) {
        toast.error(
          'Please confirm that you reviewed the payroll.'
        )

        return
      }

      if (!runId) {
        toast.error(
          'Payroll run ID is missing.'
        )

        return
      }

      if (
        blockedEmployees.length >
        0
      ) {
        toast.error(
          'Resolve all blocked employees before approving this payroll run.'
        )

        return
      }

      setApproving(
        true
      )

      try {
        const response =
          await fetch(
            '/api/payroll/approve',
            {
              method:
                'POST',

              headers: {
                'Content-Type':
                  'application/json',
              },

              credentials:
                'include',

              body:
                JSON.stringify({
                  payroll_run_id:
                    runId,
                }),
            }
          )

        const data =
          await response.json()

        if (
          !response.ok
        ) {
          throw new Error(
            data.error ||
              'Failed to approve payroll.'
          )
        }

        setIsApproved(
          true
        )

        setIsDialogOpen(
          false
        )

        setCurrentStep(
          4
        )

        toast.success(
          calculatedEmployees.length ===
            1
            ? 'Employee payroll approved and locked.'
            : `${calculatedEmployees.length} employee payrolls approved and locked.`
        )
      } catch (
        error: any
      ) {
        toast.error(
          error?.message ||
            'Unable to approve payroll.'
        )
      } finally {
        setApproving(
          false
        )
      }
    }

  // ==========================================================
  // RESET
  // ==========================================================

  const startAnotherPayroll =
    () => {
      setCurrentStep(
        0
      )

      setEmployees(
        []
      )

      setRunId(
        null
      )

      setRunSummary(
        null
      )

      setIsApproved(
        false
      )

      setApprovalConfirmed(
        false
      )

      setIsDialogOpen(
        false
      )
    }

  // ==========================================================
  // RENDER
  // ==========================================================

  return (
    <div className="space-y-6">
      {/* =====================================================
          HEADER
          ===================================================== */}
      <div className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <Link
              href="/payroll"
              className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to Payroll
            </Link>
          </div>

          <h1 className="text-xl font-bold text-foreground">
            Monthly Payroll Execution Engine
          </h1>

          <p className="text-xs text-muted-foreground">
            Run payroll individually or for selected employees, validate work-day coverage, review LOP and deductions, then approve the payroll snapshot.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {currentStep >
            0 &&
            currentStep <
              4 && (
              <Button
                variant="outline"
                size="sm"
                onClick={
                  prevStep
                }
                className="text-xs"
              >
                Previous Step
              </Button>
            )}

          {currentStep ===
            2 && (
            <Button
              size="sm"
              className="bg-[#1e2a78] text-xs text-white hover:bg-[#152060]"
              onClick={() =>
                setCurrentStep(
                  3
                )
              }
              disabled={
                !canProceedToApproval
              }
            >
              Proceed to Approval
              <ChevronRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          )}

          {currentStep ===
            3 && (
            <Dialog
              open={
                isDialogOpen
              }
              onOpenChange={
                setIsDialogOpen
              }
            >
              <DialogTrigger
                asChild
              >
                <Button
                  size="sm"
                  className="bg-emerald-700 text-xs font-semibold text-white hover:bg-emerald-800"
                  disabled={
                    !canProceedToApproval ||
                    approving
                  }
                >
                  <ShieldCheck className="mr-1.5 h-4 w-4" />
                  Approve & Lock Selected Payroll
                </Button>
              </DialogTrigger>

              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-base font-bold">
                    <Lock className="h-4 w-4 text-emerald-600" />
                    Confirm Payroll Approval
                  </DialogTitle>

                  <DialogDescription className="text-xs">
                    This will approve and lock only the employees contained in this payroll run for {getPeriodLabel(selectedPeriod)}.
                  </DialogDescription>
                </DialogHeader>

                <div className="my-2 space-y-2 rounded-lg border bg-muted/60 p-3 text-xs">
                  <div className="flex justify-between font-semibold">
                    <span>
                      Employees in Run:
                    </span>

                    <span>
                      {calculatedEmployees.length}
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span>
                      Gross Disbursement:
                    </span>

                    <span className="font-mono">
                      {formatCurrency(
                        totalGross
                      )}
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span>
                      Total Deductions:
                    </span>

                    <span className="font-mono">
                      {formatCurrency(
                        totalDeductions
                      )}
                    </span>
                  </div>

                  <div className="flex justify-between border-t pt-1.5 font-bold text-emerald-700 dark:text-emerald-400">
                    <span>
                      Net Transfer Amount:
                    </span>

                    <span className="font-mono">
                      {formatCurrency(
                        totalNet
                      )}
                    </span>
                  </div>
                </div>

                <div className="flex items-start space-x-2 py-2">
                  <Checkbox
                    id="confirm-payroll"
                    checked={
                      approvalConfirmed
                    }
                    onCheckedChange={
                      checked =>
                        setApprovalConfirmed(
                          Boolean(
                            checked
                          )
                        )
                    }
                  />

                  <label
                    htmlFor="confirm-payroll"
                    className="cursor-pointer text-xs leading-tight text-muted-foreground"
                  >
                    I confirm that I reviewed employee work-day reconciliation, LOP adjustments, salary components and statutory deductions for this run.
                  </label>
                </div>

                <DialogFooter className="gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setIsDialogOpen(
                        false
                      )
                    }
                  >
                    Cancel
                  </Button>

                  <Button
                    size="sm"
                    className="bg-emerald-700 text-white hover:bg-emerald-800"
                    onClick={
                      handleApprovePayroll
                    }
                    disabled={
                      !approvalConfirmed ||
                      approving
                    }
                  >
                    {approving && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}

                    Lock Payroll
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* =====================================================
          STEP TRACKER
          ===================================================== */}
      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex items-center justify-between">
          {STEPS.map(
            (
              step,
              index
            ) => {
              const completed =
                index <
                  currentStep ||
                isApproved

              const current =
                index ===
                  currentStep &&
                !isApproved

              return (
                <div
                  key={
                    step
                  }
                  className="relative flex flex-1 flex-col items-center text-center"
                >
                  <div
                    className={cn(
                      'z-10 flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-all',

                      completed
                        ? 'bg-emerald-600 text-white'
                        : current
                        ? 'bg-[#1e2a78] text-white ring-4 ring-blue-100 dark:ring-blue-950'
                        : 'border bg-muted text-muted-foreground'
                    )}
                  >
                    {completed ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      index +
                      1
                    )}
                  </div>

                  <span
                    className={cn(
                      'mt-1.5 hidden text-[11px] font-medium md:block',

                      current
                        ? 'font-bold text-[#1e2a78] dark:text-blue-400'
                        : completed
                        ? 'text-foreground'
                        : 'text-muted-foreground'
                    )}
                  >
                    {step}
                  </span>

                  {index <
                    STEPS.length -
                      1 && (
                    <div
                      className={cn(
                        'absolute left-1/2 top-3.5 -z-0 h-[2px] w-full',

                        index <
                          currentStep
                          ? 'bg-emerald-500'
                          : 'bg-border'
                      )}
                    />
                  )}
                </div>
              )
            }
          )}
        </div>
      </div>

      {/* =====================================================
          STEP 0 — SELECT EMPLOYEES
          ===================================================== */}
      {currentStep ===
        0 && (
        <div className="mx-auto max-w-5xl space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-bold">
                Select Payroll Period & Employees
              </CardTitle>

              <CardDescription className="text-xs">
                Choose one employee for an individual payroll run, or select multiple employees for a grouped payroll run.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-5">
              <div className="grid gap-4 md:grid-cols-[260px_1fr]">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-foreground">
                    Payroll Month
                  </label>

                  <input
                    type="month"
                    value={
                      selectedPeriod
                    }
                    onChange={
                      event =>
                        setSelectedPeriod(
                          event.target.value
                        )
                    }
                    className="w-full rounded-lg border bg-background p-2.5 text-sm font-medium"
                  />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-xl border bg-muted/40 p-3">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      Active Employees
                    </p>

                    <p className="mt-1 text-xl font-extrabold text-foreground">
                      {employeeOptions.length}
                    </p>
                  </div>

                  <div className="rounded-xl border bg-blue-50/60 p-3 dark:bg-blue-950/20">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      Selected
                    </p>

                    <p className="mt-1 text-xl font-extrabold text-[#1e2a78] dark:text-blue-400">
                      {selectedCount}
                    </p>
                  </div>

                  <div className="rounded-xl border bg-muted/40 p-3">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      Run Mode
                    </p>

                    <p className="mt-1 text-sm font-bold text-foreground">
                      {selectedCount ===
                      1
                        ? 'Individual'
                        : selectedCount >
                          1
                        ? 'Selected Group'
                        : 'Not Selected'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border">
                <div className="flex flex-col gap-3 border-b p-3 md:flex-row md:items-center md:justify-between">
                  <div className="relative w-full md:max-w-sm">
                    <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />

                    <input
                      type="text"
                      placeholder="Search employee by ID, name, department..."
                      value={
                        employeeSearch
                      }
                      onChange={
                        event =>
                          setEmployeeSearch(
                            event.target.value
                          )
                      }
                      className="w-full rounded-lg border bg-background py-2 pl-9 pr-3 text-xs"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={
                        selectAllVisible
                      }
                      disabled={
                        loadingEmployees ||
                        employeeListFiltered.length ===
                          0
                      }
                    >
                      Select Visible
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={
                        clearSelection
                      }
                      disabled={
                        selectedCount ===
                        0
                      }
                    >
                      Clear
                    </Button>
                  </div>
                </div>

                {loadingEmployees ? (
                  <div className="flex items-center justify-center py-12 text-xs text-muted-foreground">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Loading employees...
                  </div>
                ) : employeeListFiltered.length ===
                  0 ? (
                  <div className="py-12 text-center text-xs text-muted-foreground">
                    No active employees match this search.
                  </div>
                ) : (
                  <div className="max-h-[420px] divide-y overflow-y-auto">
                    {employeeListFiltered.map(
                      employee => {
                        const checked =
                          selectedEmployeeIds.has(
                            employee.id
                          )

                        return (
                          <div
                            key={
                              employee.id
                            }
                            className={cn(
                              'flex flex-col gap-3 p-3 transition-colors sm:flex-row sm:items-center sm:justify-between',

                              checked &&
                                'bg-blue-50/50 dark:bg-blue-950/15'
                            )}
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <Checkbox
                                checked={
                                  checked
                                }
                                onCheckedChange={() =>
                                  toggleEmployeeSelection(
                                    employee.id
                                  )
                                }
                              />

                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
                                <UserRound className="h-4 w-4 text-muted-foreground" />
                              </div>

                              <div className="min-w-0">
                                <div className="font-semibold text-foreground">
                                  {employee.name}
                                </div>

                                <div className="flex flex-wrap gap-x-2 text-[10px] text-muted-foreground">
                                  <span className="font-mono">
                                    {employee.code}
                                  </span>

                                  <span>
                                    {employee.department}
                                  </span>

                                  <span>
                                    {employee.designation}
                                  </span>
                                </div>
                              </div>
                            </div>

                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                void handleCalculatePayroll(
                                  [
                                    employee.id,
                                  ]
                                )
                              }
                              disabled={
                                calculating
                              }
                              className="shrink-0 text-xs"
                            >
                              {calculating ? (
                                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <UserRound className="mr-1.5 h-3.5 w-3.5" />
                              )}

                              Run Individually
                            </Button>
                          </div>
                        )
                      }
                    )}
                  </div>
                )}
              </div>
            </CardContent>

            <CardFooter className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button
                variant="outline"
                onClick={() =>
                  setSelectedEmployeeIds(
                    new Set(
                      employeeOptions.map(
                        employee =>
                          employee.id
                      )
                    )
                  )
                }
                disabled={
                  loadingEmployees ||
                  employeeOptions.length ===
                    0
                }
              >
                Select All Active
              </Button>

              <Button
                className="bg-[#1e2a78] text-white hover:bg-[#152060]"
                onClick={() =>
                  void handleCalculatePayroll()
                }
                disabled={
                  selectedCount ===
                    0 ||
                  calculating
                }
              >
                {calculating && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}

                {selectedCount ===
                1
                  ? 'Run Selected Employee'
                  : `Run ${selectedCount} Selected Employees`}
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}

      {/* =====================================================
          STEP 1 — AGGREGATION
          ===================================================== */}
      {currentStep ===
        1 && (
        <Card className="mx-auto max-w-xl">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 w-fit rounded-full bg-blue-100 p-3 text-[#1e2a78] dark:bg-blue-900/40">
              <RefreshCw className="h-6 w-6 animate-spin" />
            </div>

            <CardTitle className="text-lg font-bold">
              Automatic Data Aggregation & Validation
            </CardTitle>

            <CardDescription className="text-xs">
              Resolving salary structures, approved timesheets, working dates, paid leave, LOP, attendance and statutory configuration.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-3 text-xs">
            {[
              'Canonical salary structures',
              'Approved timesheet entries',
              'Attendance & leave reconciliation',
              'Company holidays & weekly offs',
              'LOP and paid-day calculation',
              'Statutory deduction configuration',
            ].map(
              item => (
                <div
                  key={
                    item
                  }
                  className="flex items-center justify-between rounded-lg border bg-muted/50 p-3"
                >
                  <span className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-emerald-600" />
                    {item}
                  </span>

                  <span className="font-semibold text-emerald-600">
                    Processing
                  </span>
                </div>
              )
            )}
          </CardContent>
        </Card>
      )}

      {/* =====================================================
          STEP 2 / 3 — REVIEW
          ===================================================== */}
      {(currentStep ===
        2 ||
        currentStep ===
          3) && (
        <div className="space-y-4">
          {/* SUMMARY */}
          <div className="grid grid-cols-2 gap-3 rounded-xl border bg-card p-4 shadow-sm lg:grid-cols-6">
            <div>
              <p className="text-[11px] font-medium text-muted-foreground">
                Selected
              </p>

              <p className="text-lg font-bold">
                {runSummary?.selectedEmployees ||
                  employees.length}
              </p>
            </div>

            <div>
              <p className="text-[11px] font-medium text-muted-foreground">
                Calculated
              </p>

              <p className="text-lg font-bold text-emerald-700">
                {calculatedEmployees.length}
              </p>
            </div>

            <div>
              <p className="text-[11px] font-medium text-muted-foreground">
                Action Required
              </p>

              <p className={cn(
                'text-lg font-bold',
                blockedEmployees.length >
                  0
                  ? 'text-red-600'
                  : 'text-foreground'
              )}>
                {blockedEmployees.length}
              </p>
            </div>

            <div>
              <p className="text-[11px] font-medium text-muted-foreground">
                Gross Payroll
              </p>

              <p className="text-lg font-bold">
                {formatCurrency(
                  totalGross
                )}
              </p>
            </div>

            <div>
              <p className="text-[11px] font-medium text-muted-foreground">
                Deductions
              </p>

              <p className="text-lg font-bold">
                {formatCurrency(
                  totalDeductions
                )}
              </p>
            </div>

            <div>
              <p className="text-[11px] font-medium text-muted-foreground">
                Net Payroll
              </p>

              <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                {formatCurrency(
                  totalNet
                )}
              </p>
            </div>
          </div>

          {blockedEmployees.length >
            0 && (
            <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-300">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />

              <div>
                <p className="font-semibold">
                  Payroll approval is blocked.
                </p>

                <p className="mt-1">
                  {blockedEmployees.length} employee(s) require resolution. Run only valid employees separately, or fix the listed issues and prepare them again.
                </p>
              </div>
            </div>
          )}

          {/* FILTERS */}
          <div className="flex flex-col justify-between gap-3 rounded-xl border bg-card p-3 md:flex-row md:items-center">
            <Tabs
              value={
                activeTab
              }
              onValueChange={
                setActiveTab
              }
              className="w-full md:w-auto"
            >
              <TabsList className="grid h-auto grid-cols-3 gap-1 bg-muted/60 p-1 sm:flex sm:flex-wrap">
                <TabsTrigger
                  value="ALL"
                  className="py-1.5 text-xs"
                >
                  All ({employees.length})
                </TabsTrigger>

                <TabsTrigger
                  value="NO_CHANGES"
                  className="py-1.5 text-xs"
                >
                  Standard ({employees.filter(
                    employee =>
                      employee.category ===
                      'NO_CHANGES'
                  ).length})
                </TabsTrigger>

                <TabsTrigger
                  value="LOP"
                  className="py-1.5 text-xs text-amber-700"
                >
                  LOP ({employees.filter(
                    employee =>
                      employee.lop >
                      0
                  ).length})
                </TabsTrigger>

                <TabsTrigger
                  value="ACTION_REQUIRED"
                  className="py-1.5 text-xs text-red-700"
                >
                  Action Required ({blockedEmployees.length})
                </TabsTrigger>

                <TabsTrigger
                  value="WARNINGS"
                  className="py-1.5 text-xs"
                >
                  Warnings ({employees.filter(
                    employee =>
                      employee.status ===
                      'WARNING'
                  ).length})
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="relative w-full md:w-64">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />

              <input
                type="text"
                placeholder="Search by ID, name..."
                value={
                  searchQuery
                }
                onChange={
                  event =>
                    setSearchQuery(
                      event.target.value
                    )
                }
                className="w-full rounded-lg border bg-background py-2 pl-9 pr-3 text-xs"
              />
            </div>
          </div>

          {/* TABLE */}
          <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
            {filteredEmployees.length ===
            0 ? (
              <div className="space-y-2 py-12 text-center text-xs text-muted-foreground">
                <Users className="mx-auto h-8 w-8 opacity-30" />

                <p className="font-semibold text-foreground">
                  No employees match this filter
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1250px] text-xs">
                  <thead>
                    <tr className="border-b bg-muted/70 text-left text-muted-foreground">
                      <th className="w-10 p-3"></th>

                      <th className="p-3 font-semibold">
                        Employee
                      </th>

                      <th className="p-3 font-semibold">
                        Department
                      </th>

                      <th className="p-3 text-center font-semibold">
                        Worked
                      </th>

                      <th className="p-3 text-center font-semibold">
                        Paid Leave
                      </th>

                      <th className="p-3 text-center font-semibold">
                        LOP
                      </th>

                      <th className="p-3 text-center font-semibold">
                        Unresolved
                      </th>

                      <th className="p-3 text-right font-semibold">
                        Gross
                      </th>

                      <th className="p-3 text-right font-semibold">
                        PF
                      </th>

                      <th className="p-3 text-right font-semibold">
                        PT
                      </th>

                      <th className="p-3 text-right font-semibold">
                        TDS
                      </th>

                      <th className="p-3 text-right font-semibold">
                        Net Pay
                      </th>

                      <th className="p-3 text-center font-semibold">
                        Status
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-border">
                    {filteredEmployees.map(
                      employee => {
                        const expanded =
                          Boolean(
                            expandedRows[
                              employee.id
                            ]
                          )

                        return (
                          <React.Fragment
                            key={
                              employee.recordId ||
                              employee.id
                            }
                          >
                            <tr className="transition-colors hover:bg-muted/30">
                              <td className="p-3 text-center">
                                <button
                                  onClick={() =>
                                    toggleRow(
                                      employee.id
                                    )
                                  }
                                  className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                                  title="View payroll calculation"
                                >
                                  {expanded ? (
                                    <ChevronUp className="h-4 w-4" />
                                  ) : (
                                    <ChevronDown className="h-4 w-4" />
                                  )}
                                </button>
                              </td>

                              <td className="p-3">
                                <div className="font-semibold text-foreground">
                                  {employee.name}
                                </div>

                                <span className="font-mono text-[10px] text-muted-foreground">
                                  {employee.code}
                                </span>
                              </td>

                              <td className="p-3 text-muted-foreground">
                                {employee.dept}
                              </td>

                              <td className="p-3 text-center font-medium">
                                {employee.workedDays}
                              </td>

                              <td className="p-3 text-center font-medium">
                                {employee.paidLeaveDays}
                              </td>

                              <td className={cn(
                                'p-3 text-center font-medium',
                                employee.lop >
                                  0 &&
                                  'text-amber-700'
                              )}>
                                {employee.lop}
                              </td>

                              <td className={cn(
                                'p-3 text-center font-bold',
                                employee.unresolvedDays >
                                  0
                                  ? 'text-red-600'
                                  : 'text-emerald-600'
                              )}>
                                {employee.unresolvedDays}
                              </td>

                              <td className="p-3 text-right font-medium">
                                {formatCurrency(
                                  employee.gross
                                )}
                              </td>

                              <td className="p-3 text-right text-muted-foreground">
                                {formatCurrency(
                                  employee.pf
                                )}
                              </td>

                              <td className="p-3 text-right text-muted-foreground">
                                {formatCurrency(
                                  employee.pt
                                )}
                              </td>

                              <td className="p-3 text-right text-muted-foreground">
                                {formatCurrency(
                                  employee.tds
                                )}
                              </td>

                              <td className="p-3 text-right font-bold text-foreground">
                                {formatCurrency(
                                  employee.net
                                )}
                              </td>

                              <td className="p-3 text-center">
                                {employee.status ===
                                  'ERROR' ? (
                                  <Badge
                                    variant="outline"
                                    className="border-red-200 bg-red-50 text-[10px] text-red-700"
                                  >
                                    Action Required
                                  </Badge>
                                ) : employee.status ===
                                  'WARNING' ? (
                                  <Badge
                                    variant="outline"
                                    className="border-amber-200 bg-amber-50 text-[10px] text-amber-700"
                                  >
                                    Review Warning
                                  </Badge>
                                ) : employee.lop >
                                  0 ? (
                                  <Badge
                                    variant="outline"
                                    className="border-amber-200 bg-amber-50 text-[10px] text-amber-800"
                                  >
                                    LOP ({employee.lop})
                                  </Badge>
                                ) : (
                                  <Badge
                                    variant="outline"
                                    className="border-emerald-200 bg-emerald-50 text-[10px] text-emerald-700"
                                  >
                                    Ready
                                  </Badge>
                                )}
                              </td>
                            </tr>

                            {expanded && (
                              <tr className="border-b bg-muted/40">
                                <td
                                  colSpan={
                                    13
                                  }
                                  className="p-4"
                                >
                                  <div className="space-y-4 rounded-lg border bg-card p-4 text-xs">
                                    <div className="flex flex-col justify-between gap-1 border-b pb-2 sm:flex-row sm:items-center">
                                      <span className="font-semibold text-foreground">
                                        Payroll Trace — {employee.name} ({employee.code})
                                      </span>

                                      <span className="text-[11px] text-muted-foreground">
                                        {getPeriodLabel(selectedPeriod)}
                                      </span>
                                    </div>

                                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
                                      <div>
                                        <span className="block text-[10px] text-muted-foreground">
                                          Working Days
                                        </span>

                                        <p className="font-semibold">
                                          {employee.workingDays}
                                        </p>
                                      </div>

                                      <div>
                                        <span className="block text-[10px] text-muted-foreground">
                                          Worked
                                        </span>

                                        <p className="font-semibold">
                                          {employee.workedDays}
                                        </p>
                                      </div>

                                      <div>
                                        <span className="block text-[10px] text-muted-foreground">
                                          Paid Leave
                                        </span>

                                        <p className="font-semibold">
                                          {employee.paidLeaveDays}
                                        </p>
                                      </div>

                                      <div>
                                        <span className="block text-[10px] text-muted-foreground">
                                          LOP
                                        </span>

                                        <p className="font-semibold">
                                          {employee.lop}
                                        </p>
                                      </div>

                                      <div>
                                        <span className="block text-[10px] text-muted-foreground">
                                          Unresolved
                                        </span>

                                        <p className={cn(
                                          'font-semibold',
                                          employee.unresolvedDays >
                                            0 &&
                                            'text-red-600'
                                        )}>
                                          {employee.unresolvedDays}
                                        </p>
                                      </div>

                                      <div>
                                        <span className="block text-[10px] text-muted-foreground">
                                          Per-Day Gross
                                        </span>

                                        <p className="font-semibold">
                                          {formatCurrency(
                                            employee.perDayRate
                                          )}
                                        </p>
                                      </div>

                                      <div>
                                        <span className="block text-[10px] text-muted-foreground">
                                          LOP Deduction
                                        </span>

                                        <p className="font-semibold text-amber-700">
                                          {formatCurrency(
                                            employee.lopDeduction
                                          )}
                                        </p>
                                      </div>

                                      <div>
                                        <span className="block text-[10px] text-muted-foreground">
                                          Net Pay
                                        </span>

                                        <p className="font-bold text-emerald-700">
                                          {formatCurrency(
                                            employee.net
                                          )}
                                        </p>
                                      </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4 border-t pt-3 sm:grid-cols-4">
                                      <div>
                                        <span className="block text-[11px] text-muted-foreground">
                                          Basic
                                        </span>

                                        <p className="font-semibold">
                                          {formatCurrency(
                                            employee.breakdown.basic
                                          )}
                                        </p>
                                      </div>

                                      <div>
                                        <span className="block text-[11px] text-muted-foreground">
                                          HRA
                                        </span>

                                        <p className="font-semibold">
                                          {formatCurrency(
                                            employee.breakdown.hra
                                          )}
                                        </p>
                                      </div>

                                      <div>
                                        <span className="block text-[11px] text-muted-foreground">
                                          Special Allowance
                                        </span>

                                        <p className="font-semibold">
                                          {formatCurrency(
                                            employee.breakdown.specialAllowance
                                          )}
                                        </p>
                                      </div>

                                      <div>
                                        <span className="block text-[11px] text-muted-foreground">
                                          Other Earnings
                                        </span>

                                        <p className="font-semibold">
                                          {formatCurrency(
                                            employee.breakdown.otherAllowance
                                          )}
                                        </p>
                                      </div>
                                    </div>

                                    <div className="grid gap-4 border-t pt-3 md:grid-cols-2">
                                      <div>
                                        <span className="mb-2 block font-semibold text-foreground">
                                          Deduction Breakdown
                                        </span>

                                        <div className="space-y-1">
                                          {employee.lineItems &&
                                          employee.lineItems.length >
                                            0 ? (
                                            employee.lineItems.map(
                                              (
                                                lineItem: any,
                                                index: number
                                              ) => (
                                                <div
                                                  key={`${lineItem.component_code || 'deduction'}-${index}`}
                                                  className="flex max-w-xs justify-between"
                                                >
                                                  <span>
                                                    {lineItem.component_name ||
                                                      lineItem.component_code}
                                                  </span>

                                                  <span className="font-medium">
                                                    {formatCurrency(
                                                      Number(
                                                        lineItem.amount ||
                                                          0
                                                      )
                                                    )}
                                                  </span>
                                                </div>
                                              )
                                            )
                                          ) : (
                                            <p className="text-muted-foreground">
                                              No deduction line items.
                                            </p>
                                          )}
                                        </div>
                                      </div>

                                      <div>
                                        <span className="mb-2 block font-semibold text-foreground">
                                          Work-Day Evidence
                                        </span>

                                        <div className="space-y-1 text-muted-foreground">
                                          <p>
                                            Worked dates: {employee.reconciliation?.workedDates.length
                                              ? employee.reconciliation.workedDates.join(', ')
                                              : 'None'}
                                          </p>

                                          <p>
                                            Paid leave dates: {employee.reconciliation?.paidLeaveDates.length
                                              ? employee.reconciliation.paidLeaveDates.join(', ')
                                              : 'None'}
                                          </p>

                                          <p>
                                            LOP dates: {employee.reconciliation?.unpaidLeaveDates.length
                                              ? employee.reconciliation.unpaidLeaveDates.join(', ')
                                              : 'None'}
                                          </p>

                                          <p className={cn(
                                            employee.reconciliation?.unresolvedDates.length
                                              ? 'font-semibold text-red-600'
                                              : ''
                                          )}>
                                            Unresolved dates: {employee.reconciliation?.unresolvedDates.length
                                              ? employee.reconciliation.unresolvedDates.join(', ')
                                              : 'None'}
                                          </p>
                                        </div>
                                      </div>
                                    </div>

                                    {employee.statusMessage && (
                                      <div
                                        className={cn(
                                          'flex items-start gap-1.5 rounded border p-2 text-[11px]',

                                          employee.status ===
                                            'ERROR'
                                            ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/20 dark:text-red-300'
                                            : 'border-amber-200 bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300'
                                        )}
                                      >
                                        {employee.status ===
                                        'ERROR' ? (
                                          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                        ) : (
                                          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                        )}

                                        {employee.statusMessage}
                                      </div>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        )
                      }
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {currentStep ===
            2 && (
            <div className="flex flex-col justify-end gap-2 sm:flex-row">
              <Button
                variant="outline"
                onClick={
                  startAnotherPayroll
                }
              >
                Run Different Employees
              </Button>

              <Button
                className="bg-[#1e2a78] text-white hover:bg-[#152060]"
                onClick={() =>
                  setCurrentStep(
                    3
                  )
                }
                disabled={
                  !canProceedToApproval
                }
              >
                Review Complete — Proceed to Approval
                <ChevronRight className="ml-1.5 h-4 w-4" />
              </Button>
            </div>
          )}

          {currentStep ===
            3 && (
            <Card className="border-emerald-500/30">
              <CardHeader>
                <CardTitle className="text-base">
                  Payroll Approval Ready
                </CardTitle>

                <CardDescription className="text-xs">
                  Only the {calculatedEmployees.length} employee(s) in this run will be approved and become eligible for payslip publication.
                </CardDescription>
              </CardHeader>

              <CardContent className="flex items-start gap-2 text-xs text-muted-foreground">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />

                No unresolved employee records are present in this run.
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* =====================================================
          STEP 4 — LOCKED
          ===================================================== */}
      {currentStep ===
        4 && (
        <Card className="mx-auto max-w-xl border-emerald-500/40 shadow-lg">
          <CardHeader className="space-y-2 text-center">
            <div className="mx-auto w-fit rounded-full bg-emerald-100 p-3 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400">
              <Lock className="h-8 w-8" />
            </div>

            <CardTitle className="text-xl font-bold text-foreground">
              Payroll Approved & Locked
            </CardTitle>

            <CardDescription className="text-xs">
              The selected payroll run for {getPeriodLabel(selectedPeriod)} has been approved.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4 text-xs">
            <div className="space-y-2 rounded-xl border bg-muted/60 p-4">
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  Payroll Status:
                </span>

                <Badge className="bg-emerald-700">
                  APPROVED & LOCKED
                </Badge>
              </div>

              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  Employees Approved:
                </span>

                <span className="font-semibold text-foreground">
                  {calculatedEmployees.length}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  Gross Payroll:
                </span>

                <span className="font-semibold text-foreground">
                  {formatCurrency(
                    totalGross
                  )}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  Net Payroll:
                </span>

                <span className="font-bold text-emerald-700">
                  {formatCurrency(
                    totalNet
                  )}
                </span>
              </div>
            </div>

            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-blue-800 dark:border-blue-900 dark:bg-blue-950/20 dark:text-blue-300">
              <p className="font-semibold">
                Payslip execution follows the payroll selection.
              </p>

              <p className="mt-1">
                If you ran one employee, only that employee is in this payroll run. If you selected multiple employees, only those selected employees are included.
              </p>
            </div>

            <div className="flex flex-col items-center gap-3 pt-2 sm:flex-row">
              <Button
                variant="outline"
                className="w-full"
                asChild
              >
                <Link href="/payslips">
                  <FileText className="mr-2 h-4 w-4" />
                  Open Payslips
                </Link>
              </Button>

              <Button
                className="w-full bg-[#1e2a78] text-white hover:bg-[#152060]"
                asChild
              >
                <Link href="/reports">
                  <Download className="mr-2 h-4 w-4" />
                  Payroll Register
                </Link>
              </Button>
            </div>

            <Button
              variant="ghost"
              className="w-full"
              onClick={
                startAnotherPayroll
              }
            >
              Run Payroll for Another Employee / Selection
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
