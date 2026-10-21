'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

import {
  AlertCircle,
  ArrowLeft,
  Check,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  ShieldCheck,
  UserCheck,
} from 'lucide-react'

import { toast } from 'sonner'

import { cn } from '@/lib/utils'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'

import { useAuth } from '@/components/providers/auth-provider'

const STEPS = [
  'Personal Information',
  'Organizational Placement',
  'Compensation & Statutory',
  'Review & Confirm',
]

type FormData = {
  firstName: string
  lastName: string
  email: string
  phone: string
  gender: string
  dob: string

  departmentName: string
  designationName: string
  employmentType: string
  joiningDate: string

  annualCtc: string
  monthlyGross: string

  configureComponentsNow: boolean

  basicSalary: string
  hraSalary: string
  specialAllowance: string
  conveyanceAllowance: string

  pfApplicable: boolean

  ptApplicable: boolean
  ptDeduction: string
  ptState: string

  esiApplicable: boolean

  pan: string
  uanNumber: string
  pfNumber: string
  pfJoiningDate: string
  esiNumber: string

  bankName: string
  bankAccountNumber: string
  ifscCode: string
  accountHolderName: string

  taxRegime: string
}

const INITIAL_FORM: FormData = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  gender: '',
  dob: '',

  departmentName: '',
  designationName: '',
  employmentType: 'full_time',
  joiningDate: '',

  annualCtc: '',
  monthlyGross: '',

  configureComponentsNow: true,

  basicSalary: '',
  hraSalary: '',
  specialAllowance: '',
  conveyanceAllowance: '',

  pfApplicable: false,

  ptApplicable: false,
  ptDeduction: '',
  ptState: '',

  esiApplicable: false,

  pan: '',
  uanNumber: '',
  pfNumber: '',
  pfJoiningDate: '',
  esiNumber: '',

  bankName: '',
  bankAccountNumber: '',
  ifscCode: '',
  accountHolderName: '',

  taxRegime: 'new',
}

export default function NewEmployeePage() {
  const router = useRouter()

  const {
    user,
    refreshSession,
  } = useAuth()

  const [
    currentStep,
    setCurrentStep,
  ] = useState(0)

  const [
    formData,
    setFormData,
  ] = useState<FormData>(INITIAL_FORM)

  const [
    isSubmitting,
    setIsSubmitting,
  ] = useState(false)

  const [
    showCreatedModal,
    setShowCreatedModal,
  ] = useState(false)

  const [
    showPassword,
    setShowPassword,
  ] = useState(false)

  const [
    copied,
    setCopied,
  ] = useState(false)

  const [
    showReauthModal,
    setShowReauthModal,
  ] = useState(false)

  const [
    reauthPassword,
    setReauthPassword,
  ] = useState('')

  const [
    isReauthenticating,
    setIsReauthenticating,
  ] = useState(false)

  const [
    showReauthPassword,
    setShowReauthPassword,
  ] = useState(false)

  const [
    createdCredentials,
    setCreatedCredentials,
  ] = useState<{
    name: string
    code: string
    email: string
    temporaryPassword: string
  } | null>(null)

  /* =========================================================
     RESTORE DRAFT
     ========================================================= */

  useEffect(() => {
    try {
      const saved =
        sessionStorage.getItem(
          'haryak_onboarding_draft'
        )

      if (!saved) return

      const parsed =
        JSON.parse(saved)

      if (
        parsed &&
        typeof parsed === 'object'
      ) {
        setFormData((previous) => ({
          ...previous,
          ...parsed,
        }))
      }
    } catch {
      // Ignore malformed/blocked storage.
    }
  }, [])

  /* =========================================================
     COMPUTED COMPENSATION
     ========================================================= */

  const earningTotal =
    useMemo(() => {
      return (
        Number(
          formData.basicSalary || 0
        ) +
        Number(
          formData.hraSalary || 0
        ) +
        Number(
          formData.specialAllowance || 0
        ) +
        Number(
          formData.conveyanceAllowance || 0
        )
      )
    }, [
      formData.basicSalary,
      formData.hraSalary,
      formData.specialAllowance,
      formData.conveyanceAllowance,
    ])

  const monthlyGross =
    Number(
      formData.monthlyGross || 0
    )

  const componentDifference =
    monthlyGross -
    earningTotal

  const componentsMatch =
    monthlyGross > 0 &&
    Math.abs(
      componentDifference
    ) <= 0.01

  /* =========================================================
     FIELD UPDATE
     ========================================================= */

  const handleChange = <
    K extends keyof FormData
  >(
    field: K,
    value: FormData[K]
  ) => {
    setFormData(
      (previous) => {
        const next = {
          ...previous,
          [field]: value,
        }

        try {
          sessionStorage.setItem(
            'haryak_onboarding_draft',
            JSON.stringify(next)
          )
        } catch {
          // Ignore storage errors.
        }

        return next
      }
    )
  }

  const handleAnnualCtcChange = (
    rawValue: string
  ) => {
    const annual =
      rawValue === ''
        ? ''
        : String(
            Number(rawValue)
          )

    const gross =
      rawValue === ''
        ? ''
        : String(
            Math.round(
              Number(rawValue) /
                12
            )
          )

    setFormData(
      (previous) => {
        const next = {
          ...previous,
          annualCtc: annual,
          monthlyGross: gross,
        }

        try {
          sessionStorage.setItem(
            'haryak_onboarding_draft',
            JSON.stringify(next)
          )
        } catch {
          // Ignore.
        }

        return next
      }
    )
  }

  /* =========================================================
     VALIDATION
     ========================================================= */

  const validateStep = (
    step: number
  ) => {
    if (step === 0) {
      if (
        !formData.firstName.trim()
      ) {
        toast.error(
          'First Name is required.'
        )
        return false
      }

      if (
        !formData.email.trim() ||
        !formData.email.includes(
          '@'
        )
      ) {
        toast.error(
          'A valid official email is required.'
        )
        return false
      }
    }

    if (step === 1) {
      if (
        !formData.joiningDate
      ) {
        toast.error(
          'Date of Joining is required.'
        )
        return false
      }

      if (
        !formData.departmentName
      ) {
        toast.error(
          'Department is required.'
        )
        return false
      }

      if (
        !formData.designationName.trim()
      ) {
        toast.error(
          'Designation is required.'
        )
        return false
      }

      if (
        !formData.employmentType
      ) {
        toast.error(
          'Employment Type is required.'
        )
        return false
      }
    }

    if (step === 2) {
      const annual =
        Number(
          formData.annualCtc ||
            0
        )

      const gross =
        Number(
          formData.monthlyGross ||
            0
        )

      if (annual <= 0) {
        toast.error(
          'Annual CTC must be greater than zero.'
        )
        return false
      }

      if (gross <= 0) {
        toast.error(
          'Monthly Gross must be greater than zero.'
        )
        return false
      }

      if (
        gross >
        annual
      ) {
        toast.error(
          'Monthly Gross cannot exceed Annual CTC.'
        )
        return false
      }

      if (
        formData.configureComponentsNow
      ) {
        if (
          earningTotal <= 0
        ) {
          toast.error(
            'Enter at least one earning component.'
          )
          return false
        }

        if (
          !componentsMatch
        ) {
          toast.error(
            `Earning components total ₹${earningTotal.toLocaleString(
              'en-IN'
            )}, but Monthly Gross is ₹${gross.toLocaleString(
              'en-IN'
            )}. Reconcile the amounts before continuing.`
          )

          return false
        }
      }

      if (
        formData.ptApplicable
      ) {
        if (
          formData.ptDeduction ===
          ''
        ) {
          toast.error(
            'Enter the Professional Tax amount, or disable PT Applicable.'
          )
          return false
        }

        const pt =
          Number(
            formData.ptDeduction
          )

        if (
          !Number.isFinite(pt) ||
          pt < 0
        ) {
          toast.error(
            'Professional Tax must be zero or a positive amount.'
          )
          return false
        }

        if (!formData.ptState.trim()) {
          toast.error(
            'PT State is required when Professional Tax is applicable.'
          )
          return false
        }
      }

      const hasAnyBankValue =
        Boolean(
          formData.bankName.trim() ||
            formData.bankAccountNumber.trim() ||
            formData.ifscCode.trim()
        )

      const hasCompleteBank =
        Boolean(
          formData.bankName.trim() &&
            formData.bankAccountNumber.trim() &&
            formData.ifscCode.trim()
        )

      if (
        hasAnyBankValue &&
        !hasCompleteBank
      ) {
        toast.error(
          'Complete Bank Name, Account Number and IFSC Code, or leave all bank fields blank.'
        )
        return false
      }
    }

    return true
  }

  /* =========================================================
     NEXT / PREVIOUS
     ========================================================= */

  const nextStep =
    async () => {
      if (
        !validateStep(
          currentStep
        )
      ) {
        return
      }

      if (
        currentStep === 2
      ) {
        try {
          const response =
            await fetch(
              '/api/auth/session',
              {
                cache:
                  'no-store',
              }
            )

          if (!response.ok) {
            toast.error(
              'Your session expired. Please sign in again to continue.'
            )

            setShowReauthModal(
              true
            )

            return
          }
        } catch {
          toast.error(
            'Unable to verify your session. Please try again.'
          )

          return
        }
      }

      setCurrentStep(
        (previous) =>
          Math.min(
            previous + 1,
            STEPS.length - 1
          )
      )
    }

  const prevStep = () => {
    setCurrentStep(
      (previous) =>
        Math.max(
          previous - 1,
          0
        )
    )
  }

  /* =========================================================
     REAUTHENTICATION
     ========================================================= */

  const handleReauthenticate =
    async (
      event:
        React.FormEvent
    ) => {
      event.preventDefault()

      if (!reauthPassword) {
        toast.error(
          'Please enter your administrator password.'
        )
        return
      }

      const identifier =
        (user as any)
          ?.email

      if (!identifier) {
        toast.error(
          'Administrator identity could not be resolved.'
        )
        return
      }

      setIsReauthenticating(
        true
      )

      try {
        const response =
          await fetch(
            '/api/auth/login',
            {
              method: 'POST',
              headers: {
                'Content-Type':
                  'application/json',
              },
              body:
                JSON.stringify({
                  identifier,
                  password:
                    reauthPassword,
                  mode: 'ADMIN',
                }),
            }
          )

        const result =
          await response.json()

        if (
          !response.ok ||
          !result.success
        ) {
          toast.error(
            result.error ||
              'Re-authentication failed.'
          )

          return
        }

        await refreshSession()

        setShowReauthModal(
          false
        )

        setReauthPassword(
          ''
        )

        toast.success(
          'Session re-authenticated successfully.'
        )

        setCurrentStep(3)
      } catch {
        toast.error(
          'Failed to connect to authentication server.'
        )
      } finally {
        setIsReauthenticating(
          false
        )
      }
    }

  /* =========================================================
     CREATE EMPLOYEE
     ========================================================= */

  const handleCreateEmployee =
    async () => {
      if (
        !validateStep(2)
      ) {
        setCurrentStep(2)
        return
      }

      setIsSubmitting(true)

      try {
        const components =
          formData.configureComponentsNow
            ? [
                {
                  code: 'BASIC',
                  name:
                    'Basic Salary',
                  type:
                    'earning',
                  monthly_amount:
                    Number(
                      formData.basicSalary ||
                        0
                    ),
                },
                {
                  code: 'HRA',
                  name: 'HRA',
                  type:
                    'earning',
                  monthly_amount:
                    Number(
                      formData.hraSalary ||
                        0
                    ),
                },
                {
                  code:
                    'SPECIAL_ALLOWANCE',
                  name:
                    'Special Allowance',
                  type:
                    'earning',
                  monthly_amount:
                    Number(
                      formData.specialAllowance ||
                        0
                    ),
                },
                {
                  code:
                    'CONVEYANCE',
                  name:
                    'Conveyance Allowance',
                  type:
                    'earning',
                  monthly_amount:
                    Number(
                      formData.conveyanceAllowance ||
                        0
                    ),
                },
              ].filter(
                (component) =>
                  component.monthly_amount >
                  0
              )
            : []

        /**
         * IMPORTANT:
         * PT is deliberately NOT included in components.
         *
         * It belongs to employee_statutory_details.pt_amount.
         */
        const payload = {
          firstName:
            formData.firstName.trim(),

          lastName:
            formData.lastName.trim(),

          email:
            formData.email
              .trim()
              .toLowerCase(),

          phone:
            formData.phone.trim(),

          gender:
            formData.gender,

          dob:
            formData.dob ||
            null,

          departmentName:
            formData.departmentName,

          designationName:
            formData.designationName.trim(),

          employmentType:
            formData.employmentType,

          joiningDate:
            formData.joiningDate,

          annualCtc:
            Number(
              formData.annualCtc
            ),

          monthlyGross:
            Number(
              formData.monthlyGross
            ),

          components,

          allowIncompleteCompensation:
            !formData.configureComponentsNow,

          pfApplicable:
            formData.pfApplicable,

          ptApplicable:
            formData.ptApplicable,

          ptDeduction:
            formData.ptApplicable
              ? Number(
                  formData.ptDeduction
                )
              : null,

          ptState:
            formData.ptApplicable
              ? formData.ptState.trim()
              : null,

          esiApplicable:
            formData.esiApplicable,

          pan:
            formData.pan
              .trim()
              .toUpperCase(),

          uanNumber:
            formData.uanNumber.trim(),

          pfNumber:
            formData.pfNumber.trim(),

          pfJoiningDate:
            formData.pfJoiningDate ||
            null,

          esiNumber:
            formData.esiNumber.trim(),

          taxRegime:
            formData.taxRegime,

          bankName:
            formData.bankName.trim(),

          accountNumber:
            formData.bankAccountNumber.trim(),

          ifscCode:
            formData.ifscCode
              .trim()
              .toUpperCase(),

          accountHolderName:
            formData.accountHolderName.trim(),
        }

        const response =
          await fetch(
            '/api/employees',
            {
              method: 'POST',
              headers: {
                'Content-Type':
                  'application/json',
              },
              body:
                JSON.stringify(
                  payload
                ),
            }
          )

        const result =
          await response.json()

        if (
          !response.ok ||
          !result.success
        ) {
          const message =
            result.error ||
            'Failed to create employee.'

          if (
            response.status ===
              401 ||
            message
              .toLowerCase()
              .includes(
                'authentication required'
              ) ||
            message
              .toLowerCase()
              .includes(
                'unauthenticated'
              )
          ) {
            toast.error(
              'Your session expired. Please sign in again to continue.'
            )

            setShowReauthModal(
              true
            )

            return
          }

          toast.error(
            message
          )

          return
        }

        try {
          sessionStorage.removeItem(
            'haryak_onboarding_draft'
          )
        } catch {
          // Ignore.
        }

        setCreatedCredentials({
          name:
            result.employee.name,

          code:
            result.employee.code,

          email:
            result.employee.email,

          temporaryPassword:
            result.employee.temporaryPassword,
        })

        setShowCreatedModal(
          true
        )

        toast.success(
          `Employee ${result.employee.name} (${result.employee.code}) created successfully.`
        )
      } catch (error) {
        console.error(
          'Employee creation failed:',
          error
        )

        toast.error(
          'Unable to connect to the server. Please try again.'
        )
      } finally {
        setIsSubmitting(
          false
        )
      }
    }

  /* =========================================================
     COPY CREDENTIALS
     ========================================================= */

  const handleCopyCredentials =
    async () => {
      if (
        !createdCredentials
      ) {
        return
      }

      const text =
        [
          'HARYAK TECHNOLOGIES INDIA PRIVATE LIMITED',
          'EMPLOYEE ACCOUNT CREDENTIALS',
          '',
          `Employee: ${createdCredentials.name}`,
          `Employee ID: ${createdCredentials.code}`,
          `Official Email: ${createdCredentials.email}`,
          `Temporary Password: ${createdCredentials.temporaryPassword}`,
          'Login Portal: https://haryak.com/login',
          '',
          'The employee must change the temporary password on first login.',
        ].join('\n')

      try {
        await navigator.clipboard.writeText(
          text
        )

        setCopied(true)

        toast.success(
          'Credentials copied.'
        )

        window.setTimeout(
          () =>
            setCopied(
              false
            ),
          3000
        )
      } catch {
        toast.error(
          'Unable to copy credentials.'
        )
      }
    }

  /* =========================================================
     RENDER
     ========================================================= */

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      {/* Header */}

      <div className="border-b pb-4">
        <Link
          href="/employees"
          className="mb-1.5 inline-flex items-center text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-1 h-3.5 w-3.5" />
          Back to Employee Directory
        </Link>

        <h1 className="text-2xl font-bold tracking-tight">
          Onboard New Employee
        </h1>

        <p className="text-xs text-muted-foreground">
          Create the employee identity, compensation, statutory profile and login credentials.
        </p>
      </div>

      {/* Stepper */}

      <nav
        aria-label="Progress"
        className="py-2"
      >
        <ol className="flex items-center justify-between">
          {STEPS.map(
            (
              step,
              index
            ) => (
              <li
                key={step}
                className="relative flex flex-1 flex-col items-center"
              >
                <div
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-full border-2 text-xs font-bold transition-all',

                    index <
                      currentStep
                      ? 'border-[#1e2a78] bg-[#1e2a78] text-white'
                      : index ===
                          currentStep
                        ? 'border-[#1e2a78] bg-background text-[#1e2a78] ring-4 ring-blue-100 dark:ring-blue-950'
                        : 'border-muted bg-muted text-muted-foreground'
                  )}
                >
                  {index <
                  currentStep ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    index + 1
                  )}
                </div>

                <span
                  className={cn(
                    'mt-2 text-center text-[11px] font-medium',

                    index ===
                      currentStep
                      ? 'font-bold text-[#1e2a78] dark:text-blue-400'
                      : 'text-muted-foreground'
                  )}
                >
                  {step}
                </span>
              </li>
            )
          )}
        </ol>
      </nav>

      <Card>
        <CardContent className="p-6 sm:p-8">
          {/* ============================================
              STEP 1
             ============================================ */}

          {currentStep ===
            0 && (
            <div className="space-y-4">
              <SectionHeader
                title="Personal Information"
                description="Enter the employee's official identity and contact information."
              />

              <div className="grid grid-cols-1 gap-4 text-xs sm:grid-cols-2">
                <Field
                  label="First Name *"
                  value={
                    formData.firstName
                  }
                  onChange={(
                    value
                  ) =>
                    handleChange(
                      'firstName',
                      value
                    )
                  }
                />

                <Field
                  label="Last Name"
                  value={
                    formData.lastName
                  }
                  onChange={(
                    value
                  ) =>
                    handleChange(
                      'lastName',
                      value
                    )
                  }
                />

                <Field
                  label="Official Company Email *"
                  type="email"
                  value={
                    formData.email
                  }
                  onChange={(
                    value
                  ) =>
                    handleChange(
                      'email',
                      value
                    )
                  }
                />

                <Field
                  label="Phone Number"
                  value={
                    formData.phone
                  }
                  onChange={(
                    value
                  ) =>
                    handleChange(
                      'phone',
                      value
                    )
                  }
                />

                <SelectField
                  label="Gender"
                  value={
                    formData.gender
                  }
                  onChange={(
                    value
                  ) =>
                    handleChange(
                      'gender',
                      value
                    )
                  }
                  options={[
                    [
                      '',
                      'Select Gender',
                    ],
                    [
                      'Male',
                      'Male',
                    ],
                    [
                      'Female',
                      'Female',
                    ],
                    [
                      'Other',
                      'Other',
                    ],
                  ]}
                />

                <Field
                  label="Date of Birth"
                  type="date"
                  value={
                    formData.dob
                  }
                  onChange={(
                    value
                  ) =>
                    handleChange(
                      'dob',
                      value
                    )
                  }
                />
              </div>
            </div>
          )}

          {/* ============================================
              STEP 2
             ============================================ */}

          {currentStep ===
            1 && (
            <div className="space-y-4">
              <SectionHeader
                title="Organizational Placement"
                description="Assign department, designation and employment terms."
              />

              <div className="grid grid-cols-1 gap-4 text-xs sm:grid-cols-2">
                <SelectField
                  label="Department *"
                  value={
                    formData.departmentName
                  }
                  onChange={(
                    value
                  ) =>
                    handleChange(
                      'departmentName',
                      value
                    )
                  }
                  options={[
                    [
                      '',
                      'Select Department',
                    ],
                    [
                      'Software Development',
                      'Software Development',
                    ],
                    [
                      'Human Resources',
                      'Human Resources',
                    ],
                    [
                      'Finance & Accounts',
                      'Finance & Accounts',
                    ],
                    [
                      'Quality Assurance',
                      'Quality Assurance',
                    ],
                    [
                      'Operations',
                      'Operations',
                    ],
                  ]}
                />

                <Field
                  label="Designation *"
                  value={
                    formData.designationName
                  }
                  onChange={(
                    value
                  ) =>
                    handleChange(
                      'designationName',
                      value
                    )
                  }
                />

                <SelectField
                  label="Employment Type *"
                  value={
                    formData.employmentType
                  }
                  onChange={(
                    value
                  ) =>
                    handleChange(
                      'employmentType',
                      value
                    )
                  }
                  options={[
                    [
                      'full_time',
                      'Full Time Regular',
                    ],
                    [
                      'contract',
                      'Contractor / Consultant',
                    ],
                    [
                      'intern',
                      'Intern',
                    ],
                  ]}
                />

                <Field
                  label="Date of Joining *"
                  type="date"
                  value={
                    formData.joiningDate
                  }
                  onChange={(
                    value
                  ) =>
                    handleChange(
                      'joiningDate',
                      value
                    )
                  }
                />
              </div>
            </div>
          )}

          {/* ============================================
              STEP 3
             ============================================ */}

          {currentStep ===
            2 && (
            <div className="space-y-6">
              <SectionHeader
                title="Compensation & Statutory Setup"
                description="Enter the employee-specific compensation values. No salary values are fabricated automatically."
              />

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field
                  label="Annual Fixed CTC (₹) *"
                  type="number"
                  value={
                    formData.annualCtc
                  }
                  onChange={
                    handleAnnualCtcChange
                  }
                />

                <Field
                  label="Monthly Gross (₹) *"
                  type="number"
                  value={
                    formData.monthlyGross
                  }
                  onChange={(
                    value
                  ) =>
                    handleChange(
                      'monthlyGross',
                      value
                    )
                  }
                />
              </div>

              {/* Salary Components */}

              <div className="space-y-4 rounded-xl border p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold">
                      Configure Salary Components
                    </p>

                    <p className="text-[11px] text-muted-foreground">
                      Payroll can calculate only when the employee has actual earning components.
                    </p>
                  </div>

                  <Switch
                    checked={
                      formData.configureComponentsNow
                    }
                    onCheckedChange={(
                      value
                    ) =>
                      handleChange(
                        'configureComponentsNow',
                        value
                      )
                    }
                  />
                </div>

                {formData.configureComponentsNow ? (
                  <>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <Field
                        label="Basic Salary (₹)"
                        type="number"
                        value={
                          formData.basicSalary
                        }
                        onChange={(
                          value
                        ) =>
                          handleChange(
                            'basicSalary',
                            value
                          )
                        }
                      />

                      <Field
                        label="HRA (₹)"
                        type="number"
                        value={
                          formData.hraSalary
                        }
                        onChange={(
                          value
                        ) =>
                          handleChange(
                            'hraSalary',
                            value
                          )
                        }
                      />

                      <Field
                        label="Special Allowance (₹)"
                        type="number"
                        value={
                          formData.specialAllowance
                        }
                        onChange={(
                          value
                        ) =>
                          handleChange(
                            'specialAllowance',
                            value
                          )
                        }
                      />

                      <Field
                        label="Conveyance (₹)"
                        type="number"
                        value={
                          formData.conveyanceAllowance
                        }
                        onChange={(
                          value
                        ) =>
                          handleChange(
                            'conveyanceAllowance',
                            value
                          )
                        }
                      />
                    </div>

                    <div
                      className={cn(
                        'rounded-lg border p-3 text-xs',

                        componentsMatch
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300'
                          : 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300'
                      )}
                    >
                      <div className="flex flex-wrap justify-between gap-2">
                        <span>
                          Earning Components Total
                        </span>

                        <strong>
                          ₹
                          {earningTotal.toLocaleString(
                            'en-IN'
                          )}
                        </strong>
                      </div>

                      <div className="mt-1 flex flex-wrap justify-between gap-2">
                        <span>
                          Monthly Gross
                        </span>

                        <strong>
                          ₹
                          {monthlyGross.toLocaleString(
                            'en-IN'
                          )}
                        </strong>
                      </div>

                      {!componentsMatch &&
                        monthlyGross >
                          0 && (
                          <div className="mt-2 font-medium">
                            Difference: ₹
                            {componentDifference.toLocaleString(
                              'en-IN'
                            )}
                          </div>
                        )}
                    </div>
                  </>
                ) : (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
                    This employee will be created with an incomplete salary structure. Payroll must remain blocked until salary components are configured.
                  </div>
                )}
              </div>

              {/* Statutory */}

              <div className="space-y-4 rounded-xl border p-4">
                <div>
                  <p className="text-sm font-semibold">
                    Statutory Configuration
                  </p>

                  <p className="text-[11px] text-muted-foreground">
                    Choose statutory applicability explicitly for this employee. No PF, PT or ESI setting is assumed automatically.
                  </p>
                </div>

                <ToggleRow
                  label="PF Applicable"
                  checked={
                    formData.pfApplicable
                  }
                  onChange={(
                    value
                  ) =>
                    handleChange(
                      'pfApplicable',
                      value
                    )
                  }
                />

                <ToggleRow
                  label="Professional Tax Applicable"
                  checked={
                    formData.ptApplicable
                  }
                  onChange={(
                    value
                  ) => {
                    handleChange(
                      'ptApplicable',
                      value
                    )

                    if (!value) {
                      handleChange(
                        'ptDeduction',
                        ''
                      )
                      handleChange(
                        'ptState',
                        ''
                      )
                    }
                  }}
                />

                {formData.ptApplicable && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field
                      label="Professional Tax Amount / Month (₹)"
                      type="number"
                      value={
                        formData.ptDeduction
                      }
                      onChange={(
                        value
                      ) =>
                        handleChange(
                          'ptDeduction',
                          value
                        )
                      }
                    />

                    <Field
                      label="PT State"
                      value={
                        formData.ptState
                      }
                      onChange={(
                        value
                      ) =>
                        handleChange(
                          'ptState',
                          value
                        )
                      }
                    />
                  </div>
                )}

                <ToggleRow
                  label="ESI Applicable"
                  checked={
                    formData.esiApplicable
                  }
                  onChange={(
                    value
                  ) =>
                    handleChange(
                      'esiApplicable',
                      value
                    )
                  }
                />

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field
                    label="PAN"
                    value={
                      formData.pan
                    }
                    maxLength={10}
                    onChange={(
                      value
                    ) =>
                      handleChange(
                        'pan',
                        value.toUpperCase()
                      )
                    }
                  />

                  <SelectField
                    label="Tax Regime"
                    value={
                      formData.taxRegime
                    }
                    onChange={(
                      value
                    ) =>
                      handleChange(
                        'taxRegime',
                        value
                      )
                    }
                    options={[
                      [
                        'new',
                        'New Regime',
                      ],
                      [
                        'old',
                        'Old Regime',
                      ],
                    ]}
                  />

                  <Field
                    label="UAN Number"
                    value={
                      formData.uanNumber
                    }
                    onChange={(
                      value
                    ) =>
                      handleChange(
                        'uanNumber',
                        value
                      )
                    }
                  />

                  <Field
                    label="PF Number"
                    value={
                      formData.pfNumber
                    }
                    onChange={(
                      value
                    ) =>
                      handleChange(
                        'pfNumber',
                        value
                      )
                    }
                  />

                  <Field
                    label="PF Joining Date"
                    type="date"
                    value={
                      formData.pfJoiningDate
                    }
                    onChange={(
                      value
                    ) =>
                      handleChange(
                        'pfJoiningDate',
                        value
                      )
                    }
                  />

                  <Field
                    label="ESI Number"
                    value={
                      formData.esiNumber
                    }
                    onChange={(
                      value
                    ) =>
                      handleChange(
                        'esiNumber',
                        value
                      )
                    }
                  />
                </div>
              </div>

              {/* Bank */}

              <div className="space-y-4 rounded-xl border p-4">
                <div>
                  <p className="text-sm font-semibold">
                    Bank Details
                  </p>

                  <p className="text-[11px] text-muted-foreground">
                    Leave all fields blank if bank information is not currently available.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field
                    label="Bank Name"
                    value={
                      formData.bankName
                    }
                    onChange={(
                      value
                    ) =>
                      handleChange(
                        'bankName',
                        value
                      )
                    }
                  />

                  <Field
                    label="Account Holder Name"
                    value={
                      formData.accountHolderName
                    }
                    onChange={(
                      value
                    ) =>
                      handleChange(
                        'accountHolderName',
                        value
                      )
                    }
                  />

                  <Field
                    label="Bank Account Number"
                    value={
                      formData.bankAccountNumber
                    }
                    onChange={(
                      value
                    ) =>
                      handleChange(
                        'bankAccountNumber',
                        value
                      )
                    }
                  />

                  <Field
                    label="IFSC Code"
                    value={
                      formData.ifscCode
                    }
                    maxLength={11}
                    onChange={(
                      value
                    ) =>
                      handleChange(
                        'ifscCode',
                        value.toUpperCase()
                      )
                    }
                  />
                </div>
              </div>
            </div>
          )}

          {/* ============================================
              STEP 4
             ============================================ */}

          {currentStep ===
            3 && (
            <div className="space-y-5">
              <SectionHeader
                title="Review & Confirmation"
                description="Verify the information before creating the employee."
              />

              <div className="grid grid-cols-2 gap-4 rounded-xl border bg-muted/40 p-4 text-xs sm:grid-cols-3">
                <ReviewItem
                  label="Full Name"
                  value={`${formData.firstName} ${formData.lastName}`.trim()}
                />

                <ReviewItem
                  label="Official Email"
                  value={
                    formData.email
                  }
                />

                <ReviewItem
                  label="Department"
                  value={
                    formData.departmentName ||
                    'Not provided'
                  }
                />

                <ReviewItem
                  label="Designation"
                  value={
                    formData.designationName ||
                    'Not provided'
                  }
                />

                <ReviewItem
                  label="Joining Date"
                  value={
                    formData.joiningDate
                  }
                />

                <ReviewItem
                  label="Annual CTC"
                  value={`₹${Number(
                    formData.annualCtc ||
                      0
                  ).toLocaleString(
                    'en-IN'
                  )}`}
                />

                <ReviewItem
                  label="Monthly Gross"
                  value={`₹${monthlyGross.toLocaleString(
                    'en-IN'
                  )}`}
                />

                <ReviewItem
                  label="Earning Components"
                  value={
                    formData.configureComponentsNow
                      ? `₹${earningTotal.toLocaleString(
                          'en-IN'
                        )}`
                      : 'Incomplete'
                  }
                />

                <ReviewItem
                  label="Professional Tax"
                  value={
                    formData.ptApplicable
                      ? `₹${Number(
                          formData.ptDeduction ||
                            0
                        ).toLocaleString(
                          'en-IN'
                        )}`
                      : 'Not Applicable'
                  }
                />

                {formData.ptApplicable && (
                  <ReviewItem
                    label="PT State"
                    value={formData.ptState.trim()}
                  />
                )}

                <ReviewItem
                  label="PF"
                  value={
                    formData.pfApplicable
                      ? 'Applicable'
                      : 'Not Applicable'
                  }
                />

                <ReviewItem
                  label="ESI"
                  value={
                    formData.esiApplicable
                      ? 'Applicable'
                      : 'Not Applicable'
                  }
                />

                <ReviewItem
                  label="Bank"
                  value={
                    formData.bankName ||
                    'Not provided'
                  }
                />
              </div>

              {formData.configureComponentsNow &&
                !componentsMatch && (
                  <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />

                    <span>
                      Salary component total does not match Monthly Gross. Return to Compensation before creating the employee.
                    </span>
                  </div>
                )}

              <div className="flex items-start gap-2.5 rounded-xl border border-blue-200 bg-blue-50 p-3.5 text-xs text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />

                <div>
                  <span className="mb-0.5 block font-bold">
                    Automated Identity Provisioning
                  </span>

                  <span>
                    The system will generate a unique Employee ID, create the Supabase Auth account, assign the EMPLOYEE role, persist compensation/statutory records, and issue a one-time temporary password.
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Navigation */}

          <div className="mt-8 flex items-center justify-between border-t pt-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={
                prevStep
              }
              disabled={
                currentStep ===
                  0 ||
                isSubmitting
              }
            >
              Previous
            </Button>

            {currentStep ===
            STEPS.length -
              1 ? (
              <Button
                type="button"
                size="sm"
                className="bg-[#1e2a78] text-white hover:bg-[#152060]"
                onClick={
                  handleCreateEmployee
                }
                disabled={
                  isSubmitting ||
                  (
                    formData.configureComponentsNow &&
                    !componentsMatch
                  )
                }
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    Creating Employee...
                  </>
                ) : (
                  <>
                    <UserCheck className="mr-1.5 h-3.5 w-3.5" />
                    Create Employee & Credentials
                  </>
                )}
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                className="bg-[#1e2a78] text-white hover:bg-[#152060]"
                onClick={
                  nextStep
                }
              >
                Next
                <ChevronRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ================================================
          CREATED CREDENTIALS
         ================================================ */}

      <Dialog
        open={
          showCreatedModal
        }
        onOpenChange={
          setShowCreatedModal
        }
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <UserCheck className="h-5 w-5" />
            </div>

            <DialogTitle>
              Employee Successfully Created
            </DialogTitle>

            <DialogDescription>
              Save or distribute these credentials now. The temporary password is shown only once.
            </DialogDescription>
          </DialogHeader>

          {createdCredentials && (
            <div className="space-y-3 py-2 text-xs">
              <CredentialRow
                label="Employee"
                value={
                  createdCredentials.name
                }
              />

              <CredentialRow
                label="Employee ID"
                value={
                  createdCredentials.code
                }
              />

              <CredentialRow
                label="Official Email"
                value={
                  createdCredentials.email
                }
              />

              <div className="flex items-center justify-between rounded-lg border p-3">
                <span className="text-muted-foreground">
                  Temporary Password
                </span>

                <div className="flex items-center gap-2">
                  <span className="rounded border bg-background px-2 py-1 font-mono font-bold">
                    {showPassword
                      ? createdCredentials.temporaryPassword
                      : '••••••••••••••'}
                  </span>

                  <button
                    type="button"
                    onClick={() =>
                      setShowPassword(
                        (
                          previous
                        ) =>
                          !previous
                      )
                    }
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
                The employee must change this temporary password on first login.
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={
                handleCopyCredentials
              }
            >
              <Copy className="mr-1.5 h-3.5 w-3.5" />
              {copied
                ? 'Copied'
                : 'Copy Credentials'}
            </Button>

            <Button
              size="sm"
              className="bg-[#1e2a78] text-white"
              onClick={() => {
                setShowCreatedModal(
                  false
                )

                router.push(
                  '/employees'
                )

                router.refresh()
              }}
            >
              Finish
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ================================================
          REAUTHENTICATION
         ================================================ */}

      <Dialog
        open={
          showReauthModal
        }
        onOpenChange={
          setShowReauthModal
        }
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Session Expired
            </DialogTitle>

            <DialogDescription>
              Your entered employee data has been preserved. Re-authenticate to continue.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={
              handleReauthenticate
            }
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label>
                Administrator Password
              </Label>

              <div className="relative">
                <Input
                  type={
                    showReauthPassword
                      ? 'text'
                      : 'password'
                  }
                  value={
                    reauthPassword
                  }
                  onChange={(
                    event
                  ) =>
                    setReauthPassword(
                      event.target.value
                    )
                  }
                  disabled={
                    isReauthenticating
                  }
                  className="pr-10"
                />

                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  onClick={() =>
                    setShowReauthPassword(
                      (
                        previous
                      ) =>
                        !previous
                    )
                  }
                >
                  {showReauthPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  setShowReauthModal(
                    false
                  )
                }
              >
                Cancel
              </Button>

              <Button
                type="submit"
                className="bg-[#1e2a78] text-white"
                disabled={
                  isReauthenticating
                }
              >
                {isReauthenticating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  'Re-authenticate'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* =========================================================
   SMALL COMPONENTS
   ========================================================= */

function SectionHeader({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div className="border-b pb-2">
      <h3 className="text-base font-semibold">
        {title}
      </h3>

      <p className="text-xs text-muted-foreground">
        {description}
      </p>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  maxLength,
}: {
  label: string
  value: string
  onChange: (
    value: string
  ) => void
  type?: string
  maxLength?: number
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">
        {label}
      </Label>

      <Input
        type={type}
        value={value}
        maxLength={
          maxLength
        }
        onChange={(
          event
        ) =>
          onChange(
            event.target.value
          )
        }
      />
    </div>
  )
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (
    value: string
  ) => void
  options: Array<
    [string, string]
  >
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">
        {label}
      </Label>

      <select
        value={value}
        onChange={(
          event
        ) =>
          onChange(
            event.target.value
          )
        }
        className="h-10 w-full rounded-md border bg-background px-3 text-xs"
      >
        {options.map(
          ([
            optionValue,
            optionLabel,
          ]) => (
            <option
              key={
                optionValue
              }
              value={
                optionValue
              }
            >
              {optionLabel}
            </option>
          )
        )}
      </select>
    </div>
  )
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (
    value: boolean
  ) => void
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border p-3">
      <span className="text-xs font-medium">
        {label}
      </span>

      <Switch
        checked={checked}
        onCheckedChange={
          onChange
        }
      />
    </div>
  )
}

function ReviewItem({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div>
      <span className="block text-[11px] text-muted-foreground">
        {label}
      </span>

      <span className="font-semibold">
        {value ||
          'Not provided'}
      </span>
    </div>
  )
}

function CredentialRow({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="flex items-center justify-between border-b pb-2">
      <span className="text-muted-foreground">
        {label}
      </span>

      <strong>
        {value}
      </strong>
    </div>
  )
}