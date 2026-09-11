/**
 * Haryak Technologies India Private Limited — Payroll Validation Engine
 * 
 * Pre-approval validation that identifies issues before payroll is processed.
 * Issues are categorized as ERROR (blocks processing), WARNING, or INFO.
 */

import type { PayrollInput, PayrollCalculationResult } from './payroll-engine'

export type ValidationSeverity = 'error' | 'warning' | 'info'

export interface ValidationIssue {
  severity: ValidationSeverity
  code: string
  message: string
  employeeId?: string
  employeeName?: string
  field?: string
  suggestion?: string
}

export interface ValidationResult {
  isValid: boolean // true if no errors (warnings/info don't block)
  issues: ValidationIssue[]
  errorCount: number
  warningCount: number
  infoCount: number
}

/**
 * Validate a single employee's payroll input before calculation.
 */
export function validateEmployeePayroll(input: PayrollInput): ValidationResult {
  const issues: ValidationIssue[] = []
  const empId = input.employee?.employee_code || 'Unknown'
  const empName = input.employee?.full_name || 'Unknown'

  // ── ERRORS (block processing) ──────────────────────────

  if (!input.salaryStructure) {
    issues.push({
      severity: 'error',
      code: 'NO_SALARY_STRUCTURE',
      message: 'No active salary structure found.',
      employeeId: empId,
      employeeName: empName,
      suggestion: 'Assign a salary structure to this employee before running payroll.',
    })
  }

  if (!input.salaryComponents || input.salaryComponents.length === 0) {
    issues.push({
      severity: 'error',
      code: 'NO_SALARY_COMPONENTS',
      message: 'No salary components defined.',
      employeeId: empId,
      employeeName: empName,
      suggestion: 'Add earnings components to the salary structure.',
    })
  }

  if (input.paidDays < 0) {
    issues.push({
      severity: 'error',
      code: 'NEGATIVE_PAID_DAYS',
      message: `Paid days cannot be negative (${input.paidDays}).`,
      employeeId: empId,
      employeeName: empName,
      field: 'paidDays',
    })
  }

  if (input.workingDays <= 0) {
    issues.push({
      severity: 'error',
      code: 'INVALID_WORKING_DAYS',
      message: `Working days must be positive (${input.workingDays}).`,
      employeeId: empId,
      employeeName: empName,
      field: 'workingDays',
    })
  }

  // Joining after period
  if (input.employee.joining_date && input.period.end_date) {
    const joinDate = new Date(input.employee.joining_date)
    const periodEnd = new Date(input.period.end_date)
    if (joinDate > periodEnd) {
      issues.push({
        severity: 'error',
        code: 'JOINING_AFTER_PERIOD',
        message: `Employee joined on ${input.employee.joining_date}, which is after the payroll period end date.`,
        employeeId: empId,
        employeeName: empName,
      })
    }
  }

  // Exited before period
  if (input.employee.last_working_date && input.period.start_date) {
    const lastDay = new Date(input.employee.last_working_date)
    const periodStart = new Date(input.period.start_date)
    if (lastDay < periodStart) {
      issues.push({
        severity: 'error',
        code: 'EXITED_BEFORE_PERIOD',
        message: `Employee's last working date (${input.employee.last_working_date}) is before the payroll period.`,
        employeeId: empId,
        employeeName: empName,
      })
    }
  }

  // ── WARNINGS ───────────────────────────────────────────

  // Missing bank info
  if (!input.employee.employee_code) {
    issues.push({
      severity: 'warning',
      code: 'MISSING_BANK_INFO',
      message: 'Bank account details may be missing.',
      employeeId: empId,
      employeeName: empName,
      suggestion: 'Verify bank details are set up for salary payment.',
    })
  }

  // Missing PAN
  if (!input.employee.employee_code) {
    // This would normally check statutory details
    issues.push({
      severity: 'warning',
      code: 'MISSING_PAN',
      message: 'PAN card details may be missing.',
      employeeId: empId,
      employeeName: empName,
      suggestion: 'PAN is required for TDS calculations.',
    })
  }

  // PF applicable but no UAN
  if (input.pfApplicable) {
    issues.push({
      severity: 'info',
      code: 'PF_APPLICABLE',
      message: 'PF contribution will be deducted.',
      employeeId: empId,
      employeeName: empName,
    })
  }

  // High LOP
  if (input.lopDays > 5) {
    issues.push({
      severity: 'warning',
      code: 'HIGH_LOP',
      message: `Employee has ${input.lopDays} LOP days this month.`,
      employeeId: empId,
      employeeName: empName,
      suggestion: 'Verify LOP days are accurate.',
    })
  }

  // Excess paid days
  if (input.paidDays > input.workingDays) {
    issues.push({
      severity: 'warning',
      code: 'EXCESS_PAID_DAYS',
      message: `Paid days (${input.paidDays}) exceed working days (${input.workingDays}).`,
      employeeId: empId,
      employeeName: empName,
      suggestion: 'This may indicate overtime or data entry error.',
    })
  }

  // Zero deductions when PF/PT applicable
  if (input.pfApplicable && input.salaryComponents?.length > 0) {
    const hasBasic = input.salaryComponents.some(
      sc => sc.component.code === 'BASIC' || sc.component.code === 'basic_salary'
    )
    if (!hasBasic) {
      issues.push({
        severity: 'warning',
        code: 'PF_NO_BASIC',
        message: 'PF is applicable but no Basic Salary component found.',
        employeeId: empId,
        employeeName: empName,
        suggestion: 'PF is typically calculated on Basic Salary.',
      })
    }
  }

  // Probation status
  if (input.employee.employment_status === 'probation') {
    issues.push({
      severity: 'info',
      code: 'ON_PROBATION',
      message: 'Employee is currently on probation.',
      employeeId: empId,
      employeeName: empName,
    })
  }

  // Notice period
  if (input.employee.employment_status === 'notice') {
    issues.push({
      severity: 'warning',
      code: 'ON_NOTICE',
      message: 'Employee is serving notice period.',
      employeeId: empId,
      employeeName: empName,
      suggestion: 'Verify last working date and prorate salary accordingly.',
    })
  }

  // ── INFO ───────────────────────────────────────────────

  // Mid-month joining
  if (input.employee.joining_date && input.period.start_date) {
    const joinDate = new Date(input.employee.joining_date)
    const periodStart = new Date(input.period.start_date)
    const periodEnd = new Date(input.period.end_date)
    if (joinDate > periodStart && joinDate <= periodEnd) {
      issues.push({
        severity: 'info',
        code: 'MID_MONTH_JOINING',
        message: `Employee joined mid-month on ${input.employee.joining_date}. Salary will be prorated.`,
        employeeId: empId,
        employeeName: empName,
      })
    }
  }

  // ── Summary ────────────────────────────────────────────

  const errorCount = issues.filter(i => i.severity === 'error').length
  const warningCount = issues.filter(i => i.severity === 'warning').length
  const infoCount = issues.filter(i => i.severity === 'info').length

  return {
    isValid: errorCount === 0,
    issues,
    errorCount,
    warningCount,
    infoCount,
  }
}

/**
 * Validate calculation results after processing.
 */
export function validateCalculationResult(
  result: PayrollCalculationResult,
  input: PayrollInput
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const empId = input.employee?.employee_code || 'Unknown'
  const empName = input.employee?.full_name || 'Unknown'

  // Negative net pay
  if (result.netSalary < 0) {
    issues.push({
      severity: 'error',
      code: 'NEGATIVE_NET_PAY',
      message: `Net salary is negative (₹${result.netSalary}).`,
      employeeId: empId,
      employeeName: empName,
      suggestion: 'Review deductions — total deductions exceed gross earnings.',
    })
  }

  // Zero gross
  if (result.grossEarnings === 0) {
    issues.push({
      severity: 'warning',
      code: 'ZERO_GROSS',
      message: 'Gross earnings are zero.',
      employeeId: empId,
      employeeName: empName,
      suggestion: 'This may be expected for unpaid leave or data issue.',
    })
  }

  // Unusually high deductions (> 60% of gross)
  if (result.grossEarnings > 0 && result.totalDeductions > result.grossEarnings * 0.6) {
    issues.push({
      severity: 'warning',
      code: 'HIGH_DEDUCTIONS',
      message: `Total deductions (₹${result.totalDeductions}) are more than 60% of gross (₹${result.grossEarnings}).`,
      employeeId: empId,
      employeeName: empName,
      suggestion: 'Verify all deduction amounts.',
    })
  }

  // Copy warnings and errors from calculation
  for (const w of result.warnings) {
    issues.push({
      severity: 'warning',
      code: w.code,
      message: w.message,
      employeeId: empId,
      employeeName: empName,
      field: w.field,
    })
  }

  for (const e of result.errors) {
    issues.push({
      severity: 'error',
      code: e.code,
      message: e.message,
      employeeId: empId,
      employeeName: empName,
      field: e.field,
    })
  }

  return issues
}

/**
 * Validate entire payroll run.
 */
export function validatePayrollRun(
  results: { input: PayrollInput; result: PayrollCalculationResult }[]
): ValidationResult {
  const allIssues: ValidationIssue[] = []

  // Check for duplicate employees
  const employeeIds = results.map(r => r.input.employee.id)
  const duplicates = employeeIds.filter((id, i) => employeeIds.indexOf(id) !== i)
  if (duplicates.length > 0) {
    allIssues.push({
      severity: 'error',
      code: 'DUPLICATE_EMPLOYEE',
      message: `Duplicate employee(s) found in payroll run.`,
      suggestion: 'Each employee should appear only once per payroll run.',
    })
  }

  // Collect per-employee issues
  for (const { input, result } of results) {
    const preIssues = validateEmployeePayroll(input)
    allIssues.push(...preIssues.issues)

    const postIssues = validateCalculationResult(result, input)
    allIssues.push(...postIssues)
  }

  // Run-level checks
  if (results.length === 0) {
    allIssues.push({
      severity: 'warning',
      code: 'EMPTY_PAYROLL',
      message: 'No employees in this payroll run.',
      suggestion: 'Add eligible employees to the payroll run.',
    })
  }

  const errorCount = allIssues.filter(i => i.severity === 'error').length
  const warningCount = allIssues.filter(i => i.severity === 'warning').length
  const infoCount = allIssues.filter(i => i.severity === 'info').length

  return {
    isValid: errorCount === 0,
    issues: allIssues,
    errorCount,
    warningCount,
    infoCount,
  }
}
