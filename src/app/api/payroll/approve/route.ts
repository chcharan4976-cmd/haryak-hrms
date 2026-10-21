import { NextResponse } from 'next/server'

import {
  createAdminClient,
} from '@/lib/supabase/admin'

import {
  resolveRequestContext,
} from '@/lib/services/company-resolver'

import {
  createAuditLog,
} from '@/lib/services/audit-service'

import {
  amountToWords,
} from '@/lib/utils/amount-to-words'

import {
  formatHumanDate,
  formatPeriodRange,
} from '@/lib/utils/format'

/* =========================================================
   HELPERS
   ========================================================= */

function maskBankAccount(
  accountStr: string | null
) {
  if (
    !accountStr ||
    accountStr.length < 4
  ) {
    return 'Not provided'
  }

  return (
    '*'.repeat(
      Math.max(
        0,
        accountStr.length - 4
      )
    ) +
    accountStr.slice(-4)
  )
}

function getPrimaryBank(
  employee: any
) {
  const accounts =
    employee
      ?.employee_bank_accounts ||
    []

  return (
    accounts.find(
      (bank: any) =>
        bank.is_primary
    ) ||
    accounts[0] ||
    null
  )
}

function getStatutoryDetails(
  employee: any
) {
  const details =
    employee
      ?.employee_statutory_details

  if (
    Array.isArray(details)
  ) {
    return details[0] || null
  }

  return details || null
}

function hasUsableBankAccount(
  bank: any
) {
  return Boolean(
    bank &&
      (
        bank.account_number_masked ||
        bank.account_number_encrypted ||
        bank.account_number
      )
  )
}

/* =========================================================
   APPROVE PAYROLL
   ========================================================= */

export async function POST(
  request: Request
) {
  /* -------------------------------------------------------
     AUTHENTICATION / AUTHORIZATION
     ------------------------------------------------------- */

  const auth =
    await resolveRequestContext()

  if (!auth.ok) {
    return NextResponse.json(
      {
        success: false,
        error:
          auth.error.message,
      },
      {
        status:
          auth.error.status,
      }
    )
  }

  const {
    companyId,
    roles,
    authUserId,
    email,
    fullName,
  } = auth.context

  const canApprovePayroll =
    roles.some(
      role =>
        [
          'SUPER_ADMIN',
          'HR_ADMIN',
          'PAYROLL_ADMIN',
        ].includes(role)
    )

  if (!canApprovePayroll) {
    return NextResponse.json(
      {
        success: false,
        error: 'Unauthorized',
      },
      {
        status: 403,
      }
    )
  }

  /* -------------------------------------------------------
     REQUEST
     ------------------------------------------------------- */

  let body: any

  try {
    body =
      await request.json()
  } catch {
    return NextResponse.json(
      {
        success: false,
        error:
          'Invalid request body.',
      },
      {
        status: 400,
      }
    )
  }

  const {
    payroll_run_id,
  } = body

  if (!payroll_run_id) {
    return NextResponse.json(
      {
        success: false,
        error:
          'Missing payroll_run_id',
      },
      {
        status: 400,
      }
    )
  }

  const admin =
    createAdminClient()

  if (!admin) {
    return NextResponse.json(
      {
        success: false,
        error:
          'Database error',
      },
      {
        status: 500,
      }
    )
  }

  /* -------------------------------------------------------
     LOAD PAYROLL RUN
     ------------------------------------------------------- */

  const {
    data: run,
    error: runErr,
  } = await admin
    .from('payroll_runs')
    .select(`
      *,
      payroll_period:payroll_periods(*)
    `)
    .eq(
      'id',
      payroll_run_id
    )
    .eq(
      'company_id',
      companyId
    )
    .single()

  if (
    runErr ||
    !run
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          'Payroll run not found',
      },
      {
        status: 404,
      }
    )
  }

  if (!run.payroll_period) {
    return NextResponse.json(
      {
        success: false,
        error:
          'Payroll period is missing for this payroll run.',
      },
      {
        status: 400,
      }
    )
  }

  if (
    run.status === 'approved' ||
    run.status === 'locked'
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          'Payroll run is already approved/locked',
      },
      {
        status: 409,
      }
    )
  }

  /* -------------------------------------------------------
     LOAD EMPLOYEE PAYROLL RECORDS

     These records are the authoritative calculated payroll
     result used to construct immutable payslip snapshots.
     ------------------------------------------------------- */

  const {
    data: records,
    error: recErr,
  } = await admin
    .from(
      'payroll_employee_records'
    )
    .select(`
      *,
      payroll_earnings(*),
      payroll_deductions(*),
      employee:employees(
        *,
        employee_bank_accounts(*),
        employee_statutory_details(*)
      )
    `)
    .eq(
      'payroll_run_id',
      payroll_run_id
    )

  if (recErr) {
    return NextResponse.json(
      {
        success: false,
        error:
          recErr.message,
      },
      {
        status: 500,
      }
    )
  }

  const payrollRecords =
    records || []

  if (
    payrollRecords.length === 0
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          'Cannot approve an empty payroll run.',
      },
      {
        status: 400,
      }
    )
  }

  /* =======================================================
     VALIDATE EVERY EMPLOYEE BEFORE WRITING ANY PAYSLIP
     ======================================================= */

  for (
    const record of
      payrollRecords
  ) {
    /* -----------------------------------------------------
       CALCULATION ERRORS
       ----------------------------------------------------- */

    if (
      record.status ===
        'error' ||
      (
        Array.isArray(
          record.errors
        ) &&
        record.errors.length >
          0
      )
    ) {
      const errorMessages =
        (
          Array.isArray(
            record.errors
          )
            ? record.errors
            : []
        )
          .map(
            (error: any) =>
              error?.message ||
              error?.code ||
              String(error)
          )
          .join(', ')

      return NextResponse.json(
        {
          success: false,

          error:
            `Cannot approve payroll run: Employee ${record.employee_code} has errors${
              errorMessages
                ? `: ${errorMessages}`
                : '.'
            }`,

          employee:
            record.employee_code,
        },
        {
          status: 400,
        }
      )
    }

    /* -----------------------------------------------------
       BANK ACCOUNT
       ----------------------------------------------------- */

    const primaryBank =
      getPrimaryBank(
        record.employee
      )

    const paymentMode =
      String(
        record.payment_mode ||
          'Direct Bank Transfer'
      )

    if (
      paymentMode
        .toLowerCase()
        .includes('bank') &&
      !hasUsableBankAccount(
        primaryBank
      )
    ) {
      return NextResponse.json(
        {
          success: false,

          error:
            `Bank account missing for ${record.employee_name} (${record.employee_code}): Direct Bank Transfer payout requires an active bank account. Approval blocked.`,

          employee:
            record.employee_code,
        },
        {
          status: 400,
        }
      )
    }

    /* -----------------------------------------------------
       DEDUCTION RECONCILIATION
       ----------------------------------------------------- */

    const deductionLines =
      record.payroll_deductions ||
      []

    const sumDeductions =
      deductionLines.reduce(
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

    const expectedDeductions =
      Number(
        record.total_deductions ||
          0
      )

    if (
      Math.abs(
        sumDeductions -
          expectedDeductions
      ) > 0.01
    ) {
      return NextResponse.json(
        {
          success: false,

          error:
            `Deduction reconciliation mismatch for ${record.employee_name} (${record.employee_code}): Total deductions (₹${expectedDeductions.toLocaleString(
              'en-IN'
            )}) does not match sum of deduction lines (₹${sumDeductions.toLocaleString(
              'en-IN'
            )}). Approval blocked.`,

          employee:
            record.employee_code,

          expectedDeductions,

          sumDeductions,

          deductionLines,
        },
        {
          status: 400,
        }
      )
    }
  }

  /* =======================================================
     HISTORICAL PAYSLIP IMMUTABILITY CHECK
     ======================================================= */

  const employeeIds =
    Array.from(
      new Set(
        payrollRecords
          .map(
            (record: any) =>
              record.employee_id
          )
          .filter(Boolean)
      )
    )

  if (
    employeeIds.length === 0
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          'Payroll records do not contain valid employee IDs.',
      },
      {
        status: 400,
      }
    )
  }

  const {
    data: existingPayslips,
    error:
      existingPayslipError,
  } = await admin
    .from('payslips')
    .select(`
      id,
      employee_id,
      period_month,
      period_year,
      status
    `)
    .eq(
      'company_id',
      companyId
    )
    .eq(
      'period_month',
      run.payroll_period
        .period_month
    )
    .eq(
      'period_year',
      run.payroll_period
        .period_year
    )
    .in(
      'employee_id',
      employeeIds
    )

  if (
    existingPayslipError
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          existingPayslipError
            .message,
      },
      {
        status: 500,
      }
    )
  }

  if (
    (
      existingPayslips ||
      []
    ).length > 0
  ) {
    return NextResponse.json(
      {
        success: false,

        error:
          'Approval blocked because a payslip already exists for one or more employees in this payroll period. Historical payslips cannot be overwritten.',

        existingPayslips:
          existingPayslips ||
          [],
      },
      {
        status: 409,
      }
    )
  }

  /* =======================================================
     BUILD IMMUTABLE PAYSLIP SNAPSHOTS

     Build everything BEFORE writing or locking anything.
     ======================================================= */

  const monthNames = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ]

  const periodMonth =
    Number(
      run.payroll_period
        .period_month
    )

  const periodYear =
    Number(
      run.payroll_period
        .period_year
    )

  if (
    !Number.isInteger(
      periodMonth
    ) ||
    periodMonth < 1 ||
    periodMonth > 12
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          'Payroll period month is invalid.',
      },
      {
        status: 400,
      }
    )
  }

  if (
    !Number.isInteger(
      periodYear
    ) ||
    periodYear <= 0
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          'Payroll period year is invalid.',
      },
      {
        status: 400,
      }
    )
  }

  const monthName =
    monthNames[
      periodMonth - 1
    ]

  const payslips:
    any[] = []

  for (
    const record of
      payrollRecords
  ) {
    const primaryBank =
      getPrimaryBank(
        record.employee
      )

    const statutory =
      getStatutoryDetails(
        record.employee
      )

    const earningsList =
      (
        record.payroll_earnings ||
        []
      ).map(
        (earning: any) => ({
          name:
            earning.component_name,

          amount:
            Number(
              earning.final_amount ||
                0
            ),
        })
      )

    const deductionsList =
      (
        record.payroll_deductions ||
        []
      ).map(
        (deduction: any) => ({
          name:
            deduction.component_name,

          amount:
            Number(
              deduction.amount ||
                0
            ),
        })
      )

    const bankAccountMasked =
      primaryBank
        ?.account_number_masked ||
      (
        primaryBank
          ?.account_number_encrypted
          ? maskBankAccount(
              primaryBank
                .account_number_encrypted
            )
          : 'Not provided'
      )

    /*
     * IMMUTABLE SNAPSHOT
     *
     * The payslip UI/print route must read these historical
     * values rather than recalculating from the employee's
     * current salary after a future hike.
     */
    const snapshot_data = {
      employeeId:
        record.employee_code,

      employeeName:
        record.employee_name,

      department:
        record.department_name ||
        '',

      designation:
        record.designation_name ||
        '',

      dateOfJoining:
        formatHumanDate(
          record.joining_date
        ),

      joiningDate:
        record.joining_date ||
        '',

      bankName:
        primaryBank?.bank_name ||
        'Not provided',

      bankAccountNo:
        bankAccountMasked,

      bankAccountMasked:
        bankAccountMasked,

      ifscCode:
        primaryBank?.ifsc_code ||
        'Not provided',

      pan:
        statutory?.pan_masked ||
        statutory?.pan_number ||
        'Not provided',

      uanOrPFNo:
        statutory?.uan_number ||
        statutory?.pf_number ||
        'Not provided',

      paidDays:
        Number(
          record.paid_days ||
            0
        ),

      lopDays:
        Number(
          record.lop_days ||
            0
        ),

      paymentMode:
        record.payment_mode ||
        'Direct Bank Transfer',

      payPeriod:
        formatPeriodRange(
          run.payroll_period
            .start_date,
          run.payroll_period
            .end_date
        ),

      payMonth:
        `${monthName} ${periodYear}`,

      earnings:
        earningsList,

      deductions:
        deductionsList,

      grossEarnings:
        Number(
          record.gross_earnings ||
            0
        ),

      totalDeductions:
        Number(
          record.total_deductions ||
            0
        ),

      netSalary:
        Number(
          record.net_salary ||
            0
        ),

      annualCTC:
        Number(
          record.annual_ctc ||
            0
        ),

      /*
       * These fields preserve the current existing API
       * contract.
       *
       * They are not being presented here as true cumulative
       * year-to-date calculations; they retain the values
       * generated by the existing workflow.
       */
      ytdGrossEarnings:
        Number(
          record.gross_earnings ||
            0
        ),

      ytdPFContribution:
        Number(
          deductionsList.find(
            (
              deduction: any
            ) => {
              const name =
                String(
                  deduction.name ||
                    ''
                ).toLowerCase()

              return (
                name.includes(
                  'pf'
                ) ||
                name.includes(
                  'provident'
                )
              )
            }
          )?.amount || 0
        ),

      ytdProfessionalTax:
        Number(
          deductionsList.find(
            (
              deduction: any
            ) => {
              const name =
                String(
                  deduction.name ||
                    ''
                ).toLowerCase()

              return (
                name.includes(
                  'pt'
                ) ||
                name.includes(
                  'professional'
                )
              )
            }
          )?.amount || 0
        ),

      ytdIncomeTax:
        Number(
          deductionsList.find(
            (
              deduction: any
            ) => {
              const name =
                String(
                  deduction.name ||
                    ''
                ).toLowerCase()

              return (
                name.includes(
                  'tds'
                ) ||
                name.includes(
                  'income tax'
                )
              )
            }
          )?.amount || 0
        ),

      ytdNetPay:
        Number(
          record.net_salary ||
            0
        ),
    }

    const filename =
      `Haryak_Payslip_${record.employee_code}_${monthName}_${periodYear}.pdf`

    payslips.push({
      company_id:
        companyId,

      employee_id:
        record.employee_id,

      payroll_run_id:
        payroll_run_id,

      payroll_employee_record_id:
        record.id,

      period_month:
        periodMonth,

      period_year:
        periodYear,

      pay_period_start:
        run.payroll_period
          .start_date,

      pay_period_end:
        run.payroll_period
          .end_date,

      snapshot_data,

      net_salary:
        Number(
          record.net_salary ||
            0
        ),

      amount_in_words:
        amountToWords(
          Number(
            record.net_salary ||
              0
          )
        ),

      filename,

      status:
        'generated',
    })
  }

  /* =======================================================
     INSERT PAYSLIPS

     IMPORTANT:
     INSERT ONLY.

     Never UPSERT historical payslips.

     If the database also has a UNIQUE constraint for:
       company_id
       employee_id
       period_month
       period_year

     it provides an additional concurrency-level safeguard.
     ======================================================= */

  const {
    data: createdPayslips,
    error: payslipInsertError,
  } = await admin
    .from('payslips')
    .insert(payslips)
    .select('id')

  if (
    payslipInsertError
  ) {
    console.error(
      'Error creating payslips:',
      payslipInsertError
    )

    return NextResponse.json(
      {
        success: false,

        error:
          `Payslip creation failed. Payroll was not approved: ${payslipInsertError.message}`,
      },
      {
        status: 500,
      }
    )
  }

  const createdPayslipIds =
    (
      createdPayslips ||
      []
    )
      .map(
        payslip =>
          payslip.id
      )
      .filter(Boolean)

  /* =======================================================
     APPROVE + LOCK PAYROLL

     Only after payslip persistence succeeds.
     ======================================================= */

  const approvedAt =
    new Date()
      .toISOString()

  const {
    data: approvedRun,
    error: updateErr,
  } = await admin
    .from('payroll_runs')
    .update({
      status:
        'approved',

      approved_at:
        approvedAt,

      approved_by:
        authUserId,

      locked_at:
        approvedAt,

      locked_by:
        authUserId,
    })
    .eq(
      'id',
      payroll_run_id
    )
    .eq(
      'company_id',
      companyId
    )
    /*
     * Optimistic concurrency guard.
     *
     * The run must still have the same status that was loaded
     * at the beginning of this request.
     */
    .eq(
      'status',
      run.status
    )
    .select('id, status')
    .maybeSingle()

  if (
    updateErr ||
    !approvedRun
  ) {
    /*
     * Compensating cleanup.
     *
     * Delete ONLY the payslips created by THIS request.
     *
     * Never delete by employee/month/year because that could
     * affect historical data belonging to another request.
     */
    if (
      createdPayslipIds.length >
      0
    ) {
      const {
        error: cleanupError,
      } = await admin
        .from('payslips')
        .delete()
        .in(
          'id',
          createdPayslipIds
        )
        .eq(
          'company_id',
          companyId
        )
        .eq(
          'payroll_run_id',
          payroll_run_id
        )

      if (cleanupError) {
        console.error(
          'CRITICAL: Payroll approval failed and compensating payslip cleanup also failed:',
          cleanupError
        )

        return NextResponse.json(
          {
            success: false,

            error:
              'Payroll approval failed after payslip creation, and automatic cleanup could not be completed. Manual reconciliation is required before retrying.',

            details:
              updateErr?.message ||
              'Payroll run changed before approval could be completed.',
          },
          {
            status: 500,
          }
        )
      }
    }

    return NextResponse.json(
      {
        success: false,

        error:
          updateErr?.message ||
          'Payroll run changed before approval could be completed. Newly-created payslips were rolled back.',
      },
      {
        status: 409,
      }
    )
  }

  /* =======================================================
     AUDIT LOG

     Audit logging happens only after:
     - payslips persisted
     - payroll approved
     - payroll locked
     ======================================================= */

  try {
    await createAuditLog({
      companyId,

      userId:
        authUserId,

      userEmail:
        email,

      userName:
        fullName,

      action:
        'approved',

      entityType:
        'payroll_run',

      entityId:
        payroll_run_id,

      description:
        `Approved and locked payroll run for ${periodMonth}/${periodYear}`,
    })
  } catch (auditError) {
    /*
     * Payroll and payslips are already finalized at this
     * point.
     *
     * Do not mutate financial records because a secondary
     * audit logging call failed.
     */
    console.error(
      'Payroll approved but audit logging failed:',
      auditError
    )
  }

  return NextResponse.json(
    {
      success: true,

      message:
        'Payroll approved and locked successfully',

      payrollRunId:
        payroll_run_id,

      payslipsGenerated:
        payslips.length,

      status:
        'approved',
    },
    {
      status: 200,
    }
  )
}