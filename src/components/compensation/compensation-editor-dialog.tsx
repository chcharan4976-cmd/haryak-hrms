'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import {
  AlertCircle,
  CheckCircle2,
  Plus,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'

export interface ComponentRow {
  code: string
  name: string
  type: 'earning' | 'deduction'
  category: string
  applicable: boolean
  monthlyAmount: number
  annualAmount: number
  calculationMethod: 'FLAT' | 'PERCENTAGE'
  percentageValue?: number
  isStatutory: boolean
  isRecurring: boolean
  effectiveFrom?: string
  effectiveTo?: string
  notes?: string
}

const DEFAULT_EARNINGS: ComponentRow[] = [
  {
    code: 'BASIC',
    name: 'Basic Salary',
    type: 'earning',
    category: 'basic',
    applicable: true,
    monthlyAmount: 0,
    annualAmount: 0,
    calculationMethod: 'FLAT',
    isStatutory: false,
    isRecurring: true,
  },
  {
    code: 'HRA',
    name: 'House Rent Allowance (HRA)',
    type: 'earning',
    category: 'hra',
    applicable: true,
    monthlyAmount: 0,
    annualAmount: 0,
    calculationMethod: 'FLAT',
    isStatutory: false,
    isRecurring: true,
  },
  {
    code: 'SPECIAL_ALLOWANCE',
    name: 'Special / Personal Allowance',
    type: 'earning',
    category: 'allowance',
    applicable: true,
    monthlyAmount: 0,
    annualAmount: 0,
    calculationMethod: 'FLAT',
    isStatutory: false,
    isRecurring: true,
  },
  {
    code: 'OTHER_ALLOWANCE',
    name: 'Other Allowance',
    type: 'earning',
    category: 'allowance',
    applicable: false,
    monthlyAmount: 0,
    annualAmount: 0,
    calculationMethod: 'FLAT',
    isStatutory: false,
    isRecurring: true,
  },
  {
    code: 'CITY_ALLOWANCE',
    name: 'City / Location Allowance',
    type: 'earning',
    category: 'allowance',
    applicable: false,
    monthlyAmount: 0,
    annualAmount: 0,
    calculationMethod: 'FLAT',
    isStatutory: false,
    isRecurring: true,
  },
  {
    code: 'CONVEYANCE',
    name: 'Conveyance Allowance',
    type: 'earning',
    category: 'allowance',
    applicable: false,
    monthlyAmount: 0,
    annualAmount: 0,
    calculationMethod: 'FLAT',
    isStatutory: false,
    isRecurring: true,
  },
  {
    code: 'PERFORMANCE_PAY',
    name: 'Performance Pay',
    type: 'earning',
    category: 'bonus',
    applicable: false,
    monthlyAmount: 0,
    annualAmount: 0,
    calculationMethod: 'FLAT',
    isStatutory: false,
    isRecurring: true,
  },
  {
    code: 'BONUS',
    name: 'Bonus',
    type: 'earning',
    category: 'bonus',
    applicable: false,
    monthlyAmount: 0,
    annualAmount: 0,
    calculationMethod: 'FLAT',
    isStatutory: false,
    isRecurring: false,
  },
  {
    code: 'INCENTIVE',
    name: 'Incentive',
    type: 'earning',
    category: 'incentive',
    applicable: false,
    monthlyAmount: 0,
    annualAmount: 0,
    calculationMethod: 'FLAT',
    isStatutory: false,
    isRecurring: false,
  },
  {
    code: 'ARREARS',
    name: 'Arrears',
    type: 'earning',
    category: 'arrears',
    applicable: false,
    monthlyAmount: 0,
    annualAmount: 0,
    calculationMethod: 'FLAT',
    isStatutory: false,
    isRecurring: false,
  },
  {
    code: 'REIMBURSEMENT',
    name: 'Reimbursement',
    type: 'earning',
    category: 'reimbursement',
    applicable: false,
    monthlyAmount: 0,
    annualAmount: 0,
    calculationMethod: 'FLAT',
    isStatutory: false,
    isRecurring: true,
  },
]

const DEFAULT_DEDUCTIONS: ComponentRow[] = [
  {
    code: 'PF',
    name: 'Provident Fund (PF)',
    type: 'deduction',
    category: 'statutory',
    applicable: false,
    monthlyAmount: 0,
    annualAmount: 0,
    calculationMethod: 'FLAT',
    isStatutory: true,
    isRecurring: true,
    notes: 'Employee PF deduction as configured for this employee',
  },
  {
    code: 'PT',
    name: 'Professional Tax (PT)',
    type: 'deduction',
    category: 'statutory',
    applicable: false,
    monthlyAmount: 0,
    annualAmount: 0,
    calculationMethod: 'FLAT',
    isStatutory: true,
    isRecurring: true,
    notes: 'Employee-specific Professional Tax deduction',
  },
  {
    code: 'TDS',
    name: 'Income Tax (TDS)',
    type: 'deduction',
    category: 'statutory',
    applicable: false,
    monthlyAmount: 0,
    annualAmount: 0,
    calculationMethod: 'FLAT',
    isStatutory: true,
    isRecurring: true,
    notes: 'Monthly income tax deduction',
  },
  {
    code: 'ESI',
    name: 'Employee State Insurance (ESI)',
    type: 'deduction',
    category: 'statutory',
    applicable: false,
    monthlyAmount: 0,
    annualAmount: 0,
    calculationMethod: 'FLAT',
    isStatutory: true,
    isRecurring: true,
    notes: 'Employee State Insurance deduction when applicable',
  },
  {
    code: 'LOAN_RECOVERY',
    name: 'Loan Recovery',
    type: 'deduction',
    category: 'custom',
    applicable: false,
    monthlyAmount: 0,
    annualAmount: 0,
    calculationMethod: 'FLAT',
    isStatutory: false,
    isRecurring: true,
  },
  {
    code: 'ADVANCE_RECOVERY',
    name: 'Salary Advance Recovery',
    type: 'deduction',
    category: 'custom',
    applicable: false,
    monthlyAmount: 0,
    annualAmount: 0,
    calculationMethod: 'FLAT',
    isStatutory: false,
    isRecurring: false,
  },
  {
    code: 'OTHER_DEDUCTION',
    name: 'Other Deduction',
    type: 'deduction',
    category: 'custom',
    applicable: false,
    monthlyAmount: 0,
    annualAmount: 0,
    calculationMethod: 'FLAT',
    isStatutory: false,
    isRecurring: true,
  },
]

interface CompensationEditorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  employeeId: string
  employeeCode: string
  employeeName: string
  currentCtc?: number
  currentGross?: number
  existingComponents?: any[]
  onSuccess: () => void
}

function getTodayDateOnly(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function cloneRows(rows: ComponentRow[]): ComponentRow[] {
  return rows.map(row => ({ ...row }))
}

function getComponentCode(component: any): string {
  return String(
    component?.code ??
      component?.component_code ??
      component?.componentCode ??
      ''
  )
    .trim()
    .toUpperCase()
}

function getMonthlyAmount(component: any): number {
  return Number(
    component?.monthly_amount ??
      component?.monthlyAmount ??
      component?.monthly ??
      0
  ) || 0
}

function getAnnualAmount(component: any, monthlyAmount: number): number {
  const annual = Number(
    component?.annual_amount ??
      component?.annualAmount ??
      component?.annual ??
      0
  )

  return annual > 0 ? annual : monthlyAmount * 12
}

function buildRowsFromExisting(
  defaults: ComponentRow[],
  existingComponents: any[],
  type: 'earning' | 'deduction'
): ComponentRow[] {
  const source = Array.isArray(existingComponents)
    ? existingComponents.filter(component => {
        const componentType = String(
          component?.type ??
            component?.component_type ??
            component?.componentType ??
            ''
        ).toLowerCase()

        return !componentType || componentType === type
      })
    : []

  const rows = cloneRows(defaults).map(defaultRow => {
    const match = source.find(
      component => getComponentCode(component) === defaultRow.code
    )

    if (!match) {
      return {
        ...defaultRow,
        monthlyAmount: 0,
        annualAmount: 0,
      }
    }

    const monthlyAmount = getMonthlyAmount(match)

    return {
      ...defaultRow,
      name:
        String(
          match?.name ??
            match?.component_name ??
            match?.componentName ??
            defaultRow.name
        ) || defaultRow.name,
      category:
        String(match?.category ?? defaultRow.category) ||
        defaultRow.category,
      applicable:
        match?.is_active === false ||
        match?.applicable === false
          ? false
          : true,
      monthlyAmount,
      annualAmount: getAnnualAmount(match, monthlyAmount),
      notes:
        match?.notes !== undefined && match?.notes !== null
          ? String(match.notes)
          : defaultRow.notes,
    }
  })

  const knownCodes = new Set(defaults.map(row => row.code))

  const customRows: ComponentRow[] = source
    .filter(component => {
      const code = getComponentCode(component)
      return code && !knownCodes.has(code)
    })
    .map((component, index) => {
      const monthlyAmount = getMonthlyAmount(component)
      const rawCode = getComponentCode(component)

      return {
        code:
          type === 'earning'
            ? rawCode || `CUSTOM_IMPORTED_${index}`
            : rawCode || `CUSTOM_DED_IMPORTED_${index}`,
        name:
          String(
            component?.name ??
              component?.component_name ??
              component?.componentName ??
              (type === 'earning'
                ? 'Custom Allowance'
                : 'Custom Deduction')
          ),
        type,
        category: String(component?.category ?? 'custom'),
        applicable:
          component?.is_active === false ||
          component?.applicable === false
            ? false
            : true,
        monthlyAmount,
        annualAmount: getAnnualAmount(component, monthlyAmount),
        calculationMethod: 'FLAT',
        isStatutory: Boolean(
          component?.is_statutory ??
            component?.isStatutory ??
            false
        ),
        isRecurring:
          component?.is_recurring ??
          component?.isRecurring ??
          true,
        notes:
          component?.notes !== undefined &&
          component?.notes !== null
            ? String(component.notes)
            : undefined,
      }
    })

  return [...rows, ...customRows]
}

function isCustomEarning(row: ComponentRow): boolean {
  return row.code.startsWith('CUSTOM_')
}

function isCustomDeduction(row: ComponentRow): boolean {
  return row.code.startsWith('CUSTOM_DED_')
}

export function CompensationEditorDialog({
  open,
  onOpenChange,
  employeeId,
  employeeCode,
  employeeName,
  currentCtc = 0,
  currentGross = 0,
  existingComponents = [],
  onSuccess,
}: CompensationEditorDialogProps) {
  const [annualCtc, setAnnualCtc] = useState<number>(0)
  const [monthlyGross, setMonthlyGross] = useState<number>(0)
  const [effectiveFrom, setEffectiveFrom] =
    useState<string>(getTodayDateOnly())
  const [revisionReason, setRevisionReason] =
    useState<string>('Compensation structure setup')
  const [earnings, setEarnings] =
    useState<ComponentRow[]>(cloneRows(DEFAULT_EARNINGS))
  const [deductions, setDeductions] =
    useState<ComponentRow[]>(cloneRows(DEFAULT_DEDUCTIONS))
  const [saving, setSaving] = useState(false)

  /*
   * IMPORTANT:
   *
   * We intentionally initialize the editor only once for each dialog-open
   * session.
   *
   * existingComponents may be recreated by the parent on every render.
   * Putting it directly in an initialization effect dependency list caused
   * this dialog to continuously reset while the user was typing, resulting
   * in React's "Maximum update depth exceeded" error.
   */
  const initializedForOpenRef = useRef(false)

  useEffect(() => {
    if (!open) {
      initializedForOpenRef.current = false
      return
    }

    if (initializedForOpenRef.current) {
      return
    }

    initializedForOpenRef.current = true

    const normalizedCtc = Number(currentCtc) || 0
    const normalizedGross = Number(currentGross) || 0
    const components = Array.isArray(existingComponents)
      ? existingComponents
      : []

    setAnnualCtc(normalizedCtc)
    setMonthlyGross(normalizedGross)
    setEffectiveFrom(getTodayDateOnly())
    setRevisionReason(
      normalizedCtc > 0
        ? 'Compensation revision'
        : 'Compensation structure setup'
    )

    setEarnings(
      buildRowsFromExisting(
        DEFAULT_EARNINGS,
        components,
        'earning'
      )
    )

    setDeductions(
      buildRowsFromExisting(
        DEFAULT_DEDUCTIONS,
        components,
        'deduction'
      )
    )

    setSaving(false)
  }, [
    open,
    currentCtc,
    currentGross,
    existingComponents,
  ])

  const totalEarningMonthly = useMemo(() => {
    return earnings
      .filter(row => row.applicable)
      .reduce(
        (sum, row) =>
          sum + (Number(row.monthlyAmount) || 0),
        0
      )
  }, [earnings])

  const totalDeductionsMonthly = useMemo(() => {
    return deductions
      .filter(row => row.applicable)
      .reduce(
        (sum, row) =>
          sum + (Number(row.monthlyAmount) || 0),
        0
      )
  }, [deductions])

  const netPayMonthly = useMemo(() => {
    return Math.max(
      0,
      totalEarningMonthly - totalDeductionsMonthly
    )
  }, [totalEarningMonthly, totalDeductionsMonthly])

  const grossDifference = useMemo(() => {
    return (
      Math.round(
        (totalEarningMonthly - monthlyGross) * 100
      ) / 100
    )
  }, [totalEarningMonthly, monthlyGross])

  const isReconciled = useMemo(() => {
    return (
      monthlyGross > 0 &&
      Math.abs(grossDifference) <= 0.5
    )
  }, [monthlyGross, grossDifference])

  const annualizedGross = useMemo(
    () => monthlyGross * 12,
    [monthlyGross]
  )

  const ctcDifference = useMemo(
    () => annualCtc - annualizedGross,
    [annualCtc, annualizedGross]
  )

  const handleAnnualCtcChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const rawValue = event.target.value

    if (rawValue === '') {
      setAnnualCtc(0)
      return
    }

    const value = Number(rawValue)

    if (Number.isFinite(value)) {
      setAnnualCtc(Math.max(0, value))
    }
  }

  const handleMonthlyGrossChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const rawValue = event.target.value

    if (rawValue === '') {
      setMonthlyGross(0)
      return
    }

    const value = Number(rawValue)

    if (Number.isFinite(value)) {
      setMonthlyGross(Math.max(0, value))
    }
  }

  const handleEarningChange = (
    index: number,
    field: keyof ComponentRow,
    value: unknown
  ) => {
    setEarnings(previous => {
      const next = [...previous]

      if (!next[index]) {
        return previous
      }

      const row: ComponentRow = {
        ...next[index],
        [field]: value,
      } as ComponentRow

      if (field === 'monthlyAmount') {
        const monthlyAmount = Math.max(
          0,
          Number(value) || 0
        )

        row.monthlyAmount = monthlyAmount
        row.annualAmount = monthlyAmount * 12
      }

      next[index] = row
      return next
    })
  }

  const handleDeductionChange = (
    index: number,
    field: keyof ComponentRow,
    value: unknown
  ) => {
    setDeductions(previous => {
      const next = [...previous]

      if (!next[index]) {
        return previous
      }

      const row: ComponentRow = {
        ...next[index],
        [field]: value,
      } as ComponentRow

      if (field === 'monthlyAmount') {
        const monthlyAmount = Math.max(
          0,
          Number(value) || 0
        )

        row.monthlyAmount = monthlyAmount
        row.annualAmount = monthlyAmount * 12
      }

      next[index] = row
      return next
    })
  }

  const addCustomEarning = () => {
    const code = `CUSTOM_${Date.now()}`

    setEarnings(previous => [
      ...previous,
      {
        code,
        name: 'Custom Allowance',
        type: 'earning',
        category: 'custom',
        applicable: true,
        monthlyAmount: 0,
        annualAmount: 0,
        calculationMethod: 'FLAT',
        isStatutory: false,
        isRecurring: true,
      },
    ])
  }

  const addCustomDeduction = () => {
    const code = `CUSTOM_DED_${Date.now()}`

    setDeductions(previous => [
      ...previous,
      {
        code,
        name: 'Custom Deduction',
        type: 'deduction',
        category: 'custom',
        applicable: true,
        monthlyAmount: 0,
        annualAmount: 0,
        calculationMethod: 'FLAT',
        isStatutory: false,
        isRecurring: true,
      },
    ])
  }

  const removeEarning = (index: number) => {
    setEarnings(previous =>
      previous.filter((_, rowIndex) => rowIndex !== index)
    )
  }

  const removeDeduction = (index: number) => {
    setDeductions(previous =>
      previous.filter((_, rowIndex) => rowIndex !== index)
    )
  }

  const handleSave = async (
    saveAsIncomplete = false
  ) => {
    if (saving) {
      return
    }

    if (annualCtc <= 0 || monthlyGross <= 0) {
      toast.error(
        'Annual CTC and Monthly Gross must be greater than zero.'
      )
      return
    }

    if (!effectiveFrom) {
      toast.error('Effective From date is required.')
      return
    }

    if (!revisionReason.trim()) {
      toast.error('Revision Reason is required.')
      return
    }

    if (monthlyGross > annualCtc) {
      toast.error(
        'Monthly Gross cannot exceed Annual CTC.'
      )
      return
    }

    if (!saveAsIncomplete && !isReconciled) {
      toast.error(
        `Component total (₹${totalEarningMonthly.toLocaleString(
          'en-IN'
        )}) does not match Monthly Gross (₹${monthlyGross.toLocaleString(
          'en-IN'
        )}). Reconcile component sum before saving.`
      )
      return
    }

    const activeEarnings = earnings.filter(
      row => row.applicable && row.monthlyAmount > 0
    )

    if (
      !saveAsIncomplete &&
      activeEarnings.length === 0
    ) {
      toast.error(
        'At least one earning component is required.'
      )
      return
    }

    setSaving(true)

    try {
      const componentsToSave: Array<{
        code: string
        name: string
        type: 'earning' | 'deduction'
        category: string
        monthly_amount: number
        annual_amount: number
        is_active: boolean
        is_statutory: boolean
        notes: string | null
      }> = []

      if (!saveAsIncomplete) {
        earnings
          .filter(
            row =>
              row.applicable &&
              Number(row.monthlyAmount) > 0
          )
          .forEach(row => {
            componentsToSave.push({
              code: row.code,
              name: row.name.trim() || row.code,
              type: 'earning',
              category: row.category,
              monthly_amount: Number(row.monthlyAmount),
              annual_amount:
                Number(row.monthlyAmount) * 12,
              is_active: true,
              is_statutory: false,
              notes: row.notes?.trim() || null,
            })
          })

        deductions
          .filter(
            row =>
              row.applicable &&
              Number(row.monthlyAmount) > 0
          )
          .forEach(row => {
            componentsToSave.push({
              code: row.code,
              name: row.name.trim() || row.code,
              type: 'deduction',
              category: row.category,
              monthly_amount: Number(row.monthlyAmount),
              annual_amount:
                Number(row.monthlyAmount) * 12,
              is_active: true,
              is_statutory: row.isStatutory,
              notes: row.notes?.trim() || null,
            })
          })
      }

      const response = await fetch(
        `/api/compensation/${employeeId}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            annual_ctc: Number(annualCtc),
            monthly_gross: Number(monthlyGross),
            effective_from: effectiveFrom,
            reason: revisionReason.trim(),
            components: componentsToSave,
          }),
        }
      )

      let data: any = null

      try {
        data = await response.json()
      } catch {
        data = null
      }

      if (!response.ok || !data?.success) {
        throw new Error(
          data?.error ||
            `Failed to save compensation structure (${response.status}).`
        )
      }

      toast.success(
        saveAsIncomplete
          ? 'Compensation saved as incomplete. Payroll remains blocked until the structure is fully configured.'
          : 'Compensation structure saved and activated successfully.'
      )

      onOpenChange(false)
      onSuccess()
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Error saving compensation structure.'

      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={nextOpen => {
        if (!saving) {
          onOpenChange(nextOpen)
        }
      }}
    >
      <DialogContent className="max-w-4xl w-[calc(100vw-2rem)] max-h-[90vh] flex flex-col p-4 sm:p-6">
        <DialogHeader className="pb-3 border-b">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 sm:gap-4 pr-6">
            <div className="min-w-0">
              <DialogTitle className="text-base font-bold truncate">
                Edit Compensation Structure
              </DialogTitle>

              <DialogDescription className="text-xs break-words">
                {employeeCode} — {employeeName} | Enterprise Canonical Salary Configuration
              </DialogDescription>
            </div>

            {isReconciled ? (
              <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 gap-1 text-[11px] shrink-0 self-start">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Reconciled
              </Badge>
            ) : (
              <Badge
                variant="destructive"
                className="gap-1 text-[11px] shrink-0 self-start"
              >
                <AlertCircle className="w-3.5 h-3.5" />
                Reconciliation Required
              </Badge>
            )}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-3 text-xs pr-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-3 rounded-lg bg-muted/40 border">
            <div>
              <Label className="text-[11px] text-muted-foreground">
                Annual CTC (₹)
              </Label>

              <Input
                type="number"
                min="0"
                step="1"
                value={annualCtc || ''}
                onChange={handleAnnualCtcChange}
                placeholder="691200"
                className="h-8 text-xs font-semibold mt-1"
              />
            </div>

            <div>
              <Label className="text-[11px] text-muted-foreground">
                Monthly Gross (₹)
              </Label>

              <Input
                type="number"
                min="0"
                step="1"
                value={monthlyGross || ''}
                onChange={handleMonthlyGrossChange}
                placeholder="57600"
                className="h-8 text-xs font-semibold mt-1"
              />
            </div>

            <div>
              <Label className="text-[11px] text-muted-foreground">
                Effective From
              </Label>

              <Input
                type="date"
                value={effectiveFrom}
                onChange={event =>
                  setEffectiveFrom(event.target.value)
                }
                className="h-8 text-xs mt-1"
              />
            </div>

            <div>
              <Label className="text-[11px] text-muted-foreground">
                Revision Reason
              </Label>

              <Input
                type="text"
                value={revisionReason}
                onChange={event =>
                  setRevisionReason(event.target.value)
                }
                placeholder="e.g. Annual Appraisal"
                className="h-8 text-xs mt-1"
              />
            </div>
          </div>

          {!isReconciled && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />

              <div className="text-xs space-y-1">
                <p className="font-semibold text-destructive">
                  Component total does not match Monthly Gross
                </p>

                <p className="text-muted-foreground">
                  Active earning components sum to{' '}
                  <span className="font-semibold text-foreground">
                    ₹
                    {totalEarningMonthly.toLocaleString(
                      'en-IN'
                    )}
                  </span>
                  , but Monthly Gross target is{' '}
                  <span className="font-semibold text-foreground">
                    ₹{monthlyGross.toLocaleString('en-IN')}
                  </span>
                  . Difference:{' '}
                  <span className="font-bold text-destructive">
                    ₹
                    {Math.abs(
                      grossDifference
                    ).toLocaleString('en-IN')}{' '}
                    {grossDifference > 0
                      ? '(excess)'
                      : '(short)'}
                  </span>
                  . Adjust components before saving.
                </p>
              </div>
            </div>
          )}

          <Tabs
            defaultValue="earnings"
            className="w-full"
          >
            <TabsList className="grid grid-cols-1 sm:grid-cols-2 w-full h-auto min-h-8 gap-1 p-1">
              <TabsTrigger
                value="earnings"
                className="text-xs"
              >
                Earnings (
                {
                  earnings.filter(
                    row => row.applicable
                  ).length
                }
                ) — Total: ₹
                {totalEarningMonthly.toLocaleString('en-IN')}
              </TabsTrigger>

              <TabsTrigger
                value="deductions"
                className="text-xs"
              >
                Deductions (
                {
                  deductions.filter(
                    row => row.applicable
                  ).length
                }
                ) — Total: ₹
                {totalDeductionsMonthly.toLocaleString(
                  'en-IN'
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent
              value="earnings"
              className="mt-3 space-y-2"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1">
                <span className="text-[11px] text-muted-foreground">
                  Configure monthly earning components. Active
                  earnings must total exactly ₹
                  {monthlyGross.toLocaleString('en-IN')}.
                </span>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addCustomEarning}
                  className="h-7 text-xs gap-1 shrink-0 self-start sm:self-auto"
                >
                  <Plus className="w-3 h-3" />
                  Add Custom Earning
                </Button>
              </div>

              <div className="border rounded-lg overflow-x-auto divide-y max-w-full">
                <div className="min-w-[560px] divide-y">
                <div className="grid grid-cols-12 gap-2 p-2 bg-muted/50 font-semibold text-[11px] text-muted-foreground">
                  <div className="col-span-1 text-center">
                    Active
                  </div>
                  <div className="col-span-4">
                    Component Name
                  </div>
                  <div className="col-span-3 text-right">
                    Monthly (₹)
                  </div>
                  <div className="col-span-3 text-right">
                    Annual (₹)
                  </div>
                  <div className="col-span-1 text-center">
                    Notes
                  </div>
                </div>

                {earnings.map((row, index) => (
                  <div
                    key={row.code}
                    className={`grid grid-cols-12 gap-2 p-2 items-center transition-colors ${
                      row.applicable
                        ? 'bg-background'
                        : 'bg-muted/20 opacity-60'
                    }`}
                  >
                    <div className="col-span-1 flex justify-center">
                      <Switch
                        checked={row.applicable}
                        onCheckedChange={value =>
                          handleEarningChange(
                            index,
                            'applicable',
                            value
                          )
                        }
                      />
                    </div>

                    <div className="col-span-4">
                      {isCustomEarning(row) ? (
                        <Input
                          type="text"
                          value={row.name}
                          onChange={event =>
                            handleEarningChange(
                              index,
                              'name',
                              event.target.value
                            )
                          }
                          className="h-7 text-xs"
                        />
                      ) : (
                        <div>
                          <span className="font-medium block text-foreground">
                            {row.name}
                          </span>

                          <span className="text-[10px] text-muted-foreground font-mono">
                            {row.code}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="col-span-3">
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        disabled={!row.applicable}
                        value={row.monthlyAmount || ''}
                        onChange={event =>
                          handleEarningChange(
                            index,
                            'monthlyAmount',
                            Number(event.target.value) || 0
                          )
                        }
                        className="h-7 text-xs text-right font-medium"
                        placeholder="0"
                      />
                    </div>

                    <div className="col-span-3 text-right pr-2 font-mono text-[11px]">
                      ₹
                      {(
                        Number(row.annualAmount) || 0
                      ).toLocaleString('en-IN')}
                    </div>

                    <div className="col-span-1 flex justify-center">
                      {isCustomEarning(row) ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-destructive"
                          onClick={() =>
                            removeEarning(index)
                          }
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">
                          {row.category}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                </div>
              </div>
            </TabsContent>

            <TabsContent
              value="deductions"
              className="mt-3 space-y-2"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1">
                <span className="text-[11px] text-muted-foreground">
                  Configure only deductions applicable to this
                  employee. Disabled deductions are not included.
                </span>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addCustomDeduction}
                  className="h-7 text-xs gap-1 shrink-0 self-start sm:self-auto"
                >
                  <Plus className="w-3 h-3" />
                  Add Custom Deduction
                </Button>
              </div>

              <div className="border rounded-lg overflow-x-auto divide-y max-w-full">
                <div className="min-w-[560px] divide-y">
                <div className="grid grid-cols-12 gap-2 p-2 bg-muted/50 font-semibold text-[11px] text-muted-foreground">
                  <div className="col-span-1 text-center">
                    Active
                  </div>
                  <div className="col-span-4">
                    Deduction Name
                  </div>
                  <div className="col-span-3 text-right">
                    Monthly (₹)
                  </div>
                  <div className="col-span-3 text-right">
                    Annual (₹)
                  </div>
                  <div className="col-span-1 text-center">
                    Type
                  </div>
                </div>

                {deductions.map((row, index) => (
                  <div
                    key={row.code}
                    className={`grid grid-cols-12 gap-2 p-2 items-center transition-colors ${
                      row.applicable
                        ? 'bg-background'
                        : 'bg-muted/20 opacity-60'
                    }`}
                  >
                    <div className="col-span-1 flex justify-center">
                      <Switch
                        checked={row.applicable}
                        onCheckedChange={value =>
                          handleDeductionChange(
                            index,
                            'applicable',
                            value
                          )
                        }
                      />
                    </div>

                    <div className="col-span-4">
                      {isCustomDeduction(row) ? (
                        <Input
                          type="text"
                          value={row.name}
                          onChange={event =>
                            handleDeductionChange(
                              index,
                              'name',
                              event.target.value
                            )
                          }
                          className="h-7 text-xs"
                        />
                      ) : (
                        <div>
                          <span className="font-medium block text-foreground">
                            {row.name}
                          </span>

                          <span className="text-[10px] text-muted-foreground">
                            {row.notes || row.code}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="col-span-3">
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        disabled={!row.applicable}
                        value={row.monthlyAmount || ''}
                        onChange={event =>
                          handleDeductionChange(
                            index,
                            'monthlyAmount',
                            Number(event.target.value) || 0
                          )
                        }
                        className="h-7 text-xs text-right font-medium text-destructive"
                        placeholder="0"
                      />
                    </div>

                    <div className="col-span-3 text-right pr-2 font-mono text-[11px] text-destructive">
                      ₹
                      {(
                        Number(row.annualAmount) || 0
                      ).toLocaleString('en-IN')}
                    </div>

                    <div className="col-span-1 flex justify-center">
                      {isCustomDeduction(row) ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-destructive"
                          onClick={() =>
                            removeDeduction(index)
                          }
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">
                          {row.isStatutory
                            ? 'Statutory'
                            : 'Custom'}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-3 rounded-lg bg-muted/40 border">
            <div>
              <span className="text-muted-foreground block text-[10px]">
                Monthly Gross Earnings
              </span>

              <span className="text-sm font-bold text-foreground">
                ₹
                {totalEarningMonthly.toLocaleString(
                  'en-IN'
                )}
              </span>

              <span className="text-[10px] text-muted-foreground block mt-0.5">
                Target: ₹
                {monthlyGross.toLocaleString('en-IN')}
              </span>
            </div>

            <div>
              <span className="text-muted-foreground block text-[10px]">
                Monthly Deductions
              </span>

              <span className="text-sm font-bold text-destructive">
                ₹
                {totalDeductionsMonthly.toLocaleString(
                  'en-IN'
                )}
              </span>

              <span className="text-[10px] text-muted-foreground block mt-0.5">
                Active deductions only
              </span>
            </div>

            <div>
              <span className="text-muted-foreground block text-[10px]">
                Estimated Monthly Net
              </span>

              <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                ₹{netPayMonthly.toLocaleString('en-IN')}
              </span>

              <span className="text-[10px] text-muted-foreground block mt-0.5">
                Gross minus deductions
              </span>
            </div>

            <div>
              <span className="text-muted-foreground block text-[10px]">
                CTC vs Annualized Gross
              </span>

              <span className="text-sm font-bold text-foreground">
                ₹
                {Math.abs(ctcDifference).toLocaleString(
                  'en-IN'
                )}
              </span>

              <span className="text-[10px] text-muted-foreground block mt-0.5">
                {ctcDifference > 0
                  ? 'CTC above annualized gross'
                  : ctcDifference < 0
                    ? 'Gross above CTC'
                    : 'No difference'}
              </span>
            </div>
          </div>
        </div>

        <DialogFooter className="pt-3 border-t flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={saving}
            onClick={() => onOpenChange(false)}
            className="text-xs w-full sm:w-auto"
          >
            Cancel
          </Button>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={saving}
              onClick={() => handleSave(true)}
              className="text-xs flex-1 sm:flex-initial"
            >
              {saving
                ? 'Saving...'
                : 'Save as Incomplete (Draft)'}
            </Button>

            <Button
              type="button"
              size="sm"
              disabled={saving || !isReconciled}
              onClick={() => handleSave(false)}
              className="text-xs flex-1 sm:flex-initial"
            >
              {saving
                ? 'Saving...'
                : 'Save & Activate Structure'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}