import {
  NextRequest,
  NextResponse,
} from 'next/server'

import {
  createAdminClient,
} from '@/lib/supabase/admin'

import {
  resolveRequestContext,
  hasRole,
} from '@/lib/services/company-resolver'

import {
  createAuditLog,
} from '@/lib/services/audit-service'

function maskAccountNumber(
  accountNumber: string
): string {
  const clean =
    accountNumber.replace(
      /\s+/g,
      ''
    )

  if (
    clean.length <=
    4
  ) {
    return clean
  }

  return `${'X'.repeat(
    clean.length - 4
  )}${clean.slice(
    -4
  )}`
}

function normalizeAccountNumber(
  value: unknown
): string {
  return String(
    value || ''
  )
    .replace(
      /\s+/g,
      ''
    )
    .trim()
}

function normalizeIfsc(
  value: unknown
): string {
  return String(
    value || ''
  )
    .trim()
    .toUpperCase()
}

async function authorizeEmployee(
  employeeId: string
) {
  const resolved =
    await resolveRequestContext()

  if (
    !resolved.ok
  ) {
    return {
      ok:
        false as const,

      response:
        NextResponse.json(
          {
            success:
              false,

            error:
              resolved.error.message,
          },
          {
            status:
              resolved.error.status,
          }
        ),
    }
  }

  const {
    context,
  } =
    resolved

  if (
    !hasRole(
      context,
      'SUPER_ADMIN',
      'HR_ADMIN',
      'PAYROLL_ADMIN'
    )
  ) {
    return {
      ok:
        false as const,

      response:
        NextResponse.json(
          {
            success:
              false,

            error:
              'Administrator access is required to manage employee bank details.',
          },
          {
            status:
              403,
          }
        ),
    }
  }

  const admin =
    createAdminClient()

  if (
    !admin
  ) {
    return {
      ok:
        false as const,

      response:
        NextResponse.json(
          {
            success:
              false,

            error:
              'Database unavailable.',
          },
          {
            status:
              503,
          }
        ),
    }
  }

  const {
    data:
      employee,

    error:
      employeeError,
  } =
    await admin
      .from(
        'employees'
      )
      .select(
        'id, company_id, employee_code, full_name'
      )
      .eq(
        'id',
        employeeId
      )
      .eq(
        'company_id',
        context.companyId
      )
      .maybeSingle()

  if (
    employeeError
  ) {
    return {
      ok:
        false as const,

      response:
        NextResponse.json(
          {
            success:
              false,

            error:
              `Unable to verify employee: ${employeeError.message}`,
          },
          {
            status:
              500,
          }
        ),
    }
  }

  if (
    !employee
  ) {
    return {
      ok:
        false as const,

      response:
        NextResponse.json(
          {
            success:
              false,

            error:
              'Employee not found in your company.',
          },
          {
            status:
              404,
          }
        ),
    }
  }

  return {
    ok:
      true as const,

    admin,
    context,
    employee,
  }
}

/**
 * GET
 * Load the employee's active primary bank account.
 *
 * Security:
 * - Account number is never returned unmasked.
 * - Only authorized payroll/HR administrators may read this route.
 */
export async function GET(
  _request: NextRequest,
  {
    params,
  }: {
    params:
      Promise<{
        id: string
      }>
  }
) {
  try {
    const {
      id,
    } =
      await params

    const authorization =
      await authorizeEmployee(
        id
      )

    if (
      !authorization.ok
    ) {
      return authorization.response
    }

    const {
      admin,
    } =
      authorization

    const {
      data:
        accounts,

      error,
    } =
      await admin
        .from(
          'employee_bank_accounts'
        )
        .select(`
          id,
          employee_id,
          bank_name,
          account_number_masked,
          ifsc_code,
          account_holder_name,
          is_primary,
          is_active,
          created_at,
          updated_at
        `)
        .eq(
          'employee_id',
          id
        )
        .eq(
          'is_active',
          true
        )
        .order(
          'is_primary',
          {
            ascending:
              false,
          }
        )
        .order(
          'updated_at',
          {
            ascending:
              false,
          }
        )

    if (
      error
    ) {
      return NextResponse.json(
        {
          success:
            false,

          error:
            `Unable to load bank details: ${error.message}`,
        },
        {
          status:
            500,
        }
      )
    }

    const primary =
      (
        accounts ||
        []
      )[0] ||
      null

    return NextResponse.json({
      success:
        true,

      data:
        primary
          ? {
              id:
                primary.id,

              employeeId:
                primary.employee_id,

              bankName:
                primary.bank_name,

              accountNumberMasked:
                primary.account_number_masked,

              ifscCode:
                primary.ifsc_code,

              accountHolderName:
                primary.account_holder_name,

              isPrimary:
                primary.is_primary ===
                true,

              isActive:
                primary.is_active ===
                true,

              createdAt:
                primary.created_at,

              updatedAt:
                primary.updated_at,
            }
          : null,
    })
  } catch (
    error: any
  ) {
    console.error(
      '[GET employee bank account]',
      error
    )

    return NextResponse.json(
      {
        success:
          false,

        error:
          error?.message ||
          'Unable to load employee bank details.',
      },
      {
        status:
          500,
      }
    )
  }
}

/**
 * PUT
 * Create or replace the employee's active primary bank account.
 *
 * IMPORTANT:
 * Current Haryak schema uses:
 * - account_number_encrypted
 * - account_number_masked
 *
 * This route follows the application's existing persistence model.
 * If production encryption-at-rest is later added, encrypt before
 * assigning account_number_encrypted.
 */
export async function PUT(
  request: NextRequest,
  {
    params,
  }: {
    params:
      Promise<{
        id: string
      }>
  }
) {
  try {
    const {
      id,
    } =
      await params

    const authorization =
      await authorizeEmployee(
        id
      )

    if (
      !authorization.ok
    ) {
      return authorization.response
    }

    const {
      admin,
      context,
      employee,
    } =
      authorization

    const body =
      await request.json()

    const accountHolderName =
      String(
        body.accountHolderName ||
        ''
      ).trim()

    const bankName =
      String(
        body.bankName ||
        ''
      ).trim()

    const accountNumber =
      normalizeAccountNumber(
        body.accountNumber
      )

    const confirmAccountNumber =
      normalizeAccountNumber(
        body.confirmAccountNumber
      )

    const ifscCode =
      normalizeIfsc(
        body.ifscCode
      )

    if (
      accountHolderName.length <
      2
    ) {
      return NextResponse.json(
        {
          success:
            false,

          error:
            'Account holder name is required.',
        },
        {
          status:
            400,
        }
      )
    }

    if (
      bankName.length <
      2
    ) {
      return NextResponse.json(
        {
          success:
            false,

          error:
            'Bank name is required.',
        },
        {
          status:
            400,
        }
      )
    }

    if (
      !/^\d{6,20}$/.test(
        accountNumber
      )
    ) {
      return NextResponse.json(
        {
          success:
            false,

          error:
            'Enter a valid bank account number containing 6 to 20 digits.',
        },
        {
          status:
            400,
        }
      )
    }

    if (
      accountNumber !==
      confirmAccountNumber
    ) {
      return NextResponse.json(
        {
          success:
            false,

          error:
            'Account number and confirmation do not match.',
        },
        {
          status:
            400,
        }
      )
    }

    /**
     * Standard Indian IFSC shape:
     * four letters + zero + six alphanumeric characters.
     */
    if (
      !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(
        ifscCode
      )
    ) {
      return NextResponse.json(
        {
          success:
            false,

          error:
            'Enter a valid 11-character IFSC code.',
        },
        {
          status:
            400,
        }
      )
    }

    const now =
      new Date()
        .toISOString()

    const masked =
      maskAccountNumber(
        accountNumber
      )

    /**
     * First deactivate existing active bank accounts.
     *
     * This preserves historical rows instead of deleting payroll
     * evidence while guaranteeing only the new account is active.
     */
    const {
      error:
        deactivateError,
    } =
      await admin
        .from(
          'employee_bank_accounts'
        )
        .update({
          is_primary:
            false,

          is_active:
            false,

          updated_at:
            now,
        })
        .eq(
          'employee_id',
          id
        )
        .eq(
          'is_active',
          true
        )

    if (
      deactivateError
    ) {
      return NextResponse.json(
        {
          success:
            false,

          error:
            `Existing bank details could not be updated: ${deactivateError.message}`,
        },
        {
          status:
            500,
        }
      )
    }

    const {
      data:
        saved,

      error:
        saveError,
    } =
      await admin
        .from(
          'employee_bank_accounts'
        )
        .insert({
          employee_id:
            id,

          bank_name:
            bankName,

          account_number_encrypted:
            accountNumber,

          account_number_masked:
            masked,

          ifsc_code:
            ifscCode,

          account_holder_name:
            accountHolderName,

          is_primary:
            true,

          is_active:
            true,

          updated_at:
            now,
        })
        .select(`
          id,
          employee_id,
          bank_name,
          account_number_masked,
          ifsc_code,
          account_holder_name,
          is_primary,
          is_active,
          created_at,
          updated_at
        `)
        .single()

    if (
      saveError ||
      !saved
    ) {
      /**
       * Do not report success when the new destination account
       * did not persist.
       */
      return NextResponse.json(
        {
          success:
            false,

          error:
            `Bank details could not be saved: ${
              saveError?.message ||
              'No saved bank-account row was returned.'
            }`,
        },
        {
          status:
            500,
        }
      )
    }

    try {
      await createAuditLog({
        companyId:
          context.companyId,

        userId:
          context.authUserId,

        userEmail:
          context.email,

        userName:
          context.fullName,

        action:
          'updated',

        entityType:
          'employee',

        entityId:
          employee.id,

        entityName:
          `${employee.full_name} (${employee.employee_code})`,

        description:
          `Updated active primary payroll bank account for ${employee.employee_code}. Account ending ${accountNumber.slice(
            -4
          )}.`,

        reason:
          'EMPLOYEE_BANK_ACCOUNT_UPDATED',
      })
    } catch (
      auditError
    ) {
      console.error(
        '[Employee Bank Account] Audit failed:',
        auditError
      )
    }

    return NextResponse.json({
      success:
        true,

      message:
        'Bank details saved successfully.',

      data: {
        id:
          saved.id,

        employeeId:
          saved.employee_id,

        bankName:
          saved.bank_name,

        accountNumberMasked:
          saved.account_number_masked,

        ifscCode:
          saved.ifsc_code,

        accountHolderName:
          saved.account_holder_name,

        isPrimary:
          saved.is_primary ===
          true,

        isActive:
          saved.is_active ===
          true,
      },
    })
  } catch (
    error: any
  ) {
    console.error(
      '[PUT employee bank account]',
      error
    )

    return NextResponse.json(
      {
        success:
          false,

        error:
          error?.message ||
          'Unable to save employee bank details.',
      },
      {
        status:
          500,
      }
    )
  }
}
