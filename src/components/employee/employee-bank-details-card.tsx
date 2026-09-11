'use client'

import {
  useCallback,
  useEffect,
  useState,
} from 'react'

import {
  Building2,
  CheckCircle2,
  CreditCard,
  Edit3,
  Loader2,
  Plus,
  ShieldCheck,
} from 'lucide-react'

import {
  toast,
} from 'sonner'

import {
  Badge,
} from '@/components/ui/badge'

import {
  Button,
} from '@/components/ui/button'

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

import {
  Input,
} from '@/components/ui/input'

import {
  Label,
} from '@/components/ui/label'

type BankAccount = {
  id: string
  employeeId: string
  bankName: string
  accountNumberMasked: string
  ifscCode: string
  accountHolderName: string
  isPrimary: boolean
  isActive: boolean
}

type Props = {
  employeeId: string
  employeeName: string
  onBankAccountChanged?: (
    account: BankAccount
  ) => void
}

export function EmployeeBankDetailsCard({
  employeeId,
  employeeName,
  onBankAccountChanged,
}: Props) {
  const [
    account,
    setAccount,
  ] =
    useState<
      BankAccount | null
    >(null)

  const [
    loading,
    setLoading,
  ] =
    useState(true)

  const [
    dialogOpen,
    setDialogOpen,
  ] =
    useState(false)

  const [
    saving,
    setSaving,
  ] =
    useState(false)

  const [
    accountHolderName,
    setAccountHolderName,
  ] =
    useState(
      employeeName
    )

  const [
    bankName,
    setBankName,
  ] =
    useState('')

  const [
    accountNumber,
    setAccountNumber,
  ] =
    useState('')

  const [
    confirmAccountNumber,
    setConfirmAccountNumber,
  ] =
    useState('')

  const [
    ifscCode,
    setIfscCode,
  ] =
    useState('')

  const load =
    useCallback(
      async () => {
        if (
          !employeeId
        ) {
          return
        }

        setLoading(
          true
        )

        try {
          const response =
            await fetch(
              `/api/employees/${employeeId}/bank-account`,
              {
                cache:
                  'no-store',

                credentials:
                  'include',
              }
            )

          const result =
            await response.json()

          if (
            !response.ok ||
            result.success ===
              false
          ) {
            throw new Error(
              result.error ||
              'Unable to load bank details.'
            )
          }

          setAccount(
            result.data ||
            null
          )
        } catch (
          error: any
        ) {
          console.error(
            '[EmployeeBankDetailsCard]',
            error
          )

          toast.error(
            error?.message ||
              'Unable to load bank details.'
          )
        } finally {
          setLoading(
            false
          )
        }
      },
      [
        employeeId,
      ]
    )

  useEffect(
    () => {
      void load()
    },
    [load]
  )

  const openEditor =
    () => {
      setAccountHolderName(
        account?.accountHolderName ||
          employeeName ||
          ''
      )

      setBankName(
        account?.bankName ||
          ''
      )

      /**
       * Never pre-fill the actual account number from the server.
       * Entering Edit means the administrator must confirm the
       * destination account again.
       */
      setAccountNumber(
        ''
      )

      setConfirmAccountNumber(
        ''
      )

      setIfscCode(
        account?.ifscCode ||
          ''
      )

      setDialogOpen(
        true
      )
    }

  const save =
    async () => {
      const cleanAccount =
        accountNumber
          .replace(
            /\s+/g,
            ''
          )

      const cleanConfirm =
        confirmAccountNumber
          .replace(
            /\s+/g,
            ''
          )

      if (
        accountHolderName
          .trim()
          .length <
        2
      ) {
        toast.error(
          'Enter the account holder name.'
        )

        return
      }

      if (
        bankName
          .trim()
          .length <
        2
      ) {
        toast.error(
          'Enter the bank name.'
        )

        return
      }

      if (
        !/^\d{6,20}$/.test(
          cleanAccount
        )
      ) {
        toast.error(
          'Enter a valid 6–20 digit bank account number.'
        )

        return
      }

      if (
        cleanAccount !==
        cleanConfirm
      ) {
        toast.error(
          'Account numbers do not match.'
        )

        return
      }

      const cleanIfsc =
        ifscCode
          .trim()
          .toUpperCase()

      if (
        !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(
          cleanIfsc
        )
      ) {
        toast.error(
          'Enter a valid IFSC code.'
        )

        return
      }

      setSaving(
        true
      )

      try {
        const response =
          await fetch(
            `/api/employees/${employeeId}/bank-account`,
            {
              method:
                'PUT',

              credentials:
                'include',

              headers: {
                'Content-Type':
                  'application/json',
              },

              body:
                JSON.stringify({
                  accountHolderName:
                    accountHolderName.trim(),

                  bankName:
                    bankName.trim(),

                  accountNumber:
                    cleanAccount,

                  confirmAccountNumber:
                    cleanConfirm,

                  ifscCode:
                    cleanIfsc,
                }),
            }
          )

        const result =
          await response.json()

        if (
          !response.ok ||
          result.success ===
            false
        ) {
          throw new Error(
            result.error ||
              'Unable to save bank details.'
          )
        }

        setAccount(
          result.data
        )

        setDialogOpen(
          false
        )

        toast.success(
          account
            ? 'Bank details updated successfully.'
            : 'Bank details added successfully.'
        )

        onBankAccountChanged?.(
          result.data
        )
      } catch (
        error: any
      ) {
        toast.error(
          error?.message ||
            'Unable to save bank details.'
        )
      } finally {
        setSaving(
          false
        )
      }
    }

  return (
    <>
      <Card className="h-full">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300">
              <Building2 className="h-4 w-4" />
            </div>

            <CardTitle className="text-sm">
              Bank Details
            </CardTitle>
          </div>

          {!loading && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={
                openEditor
              }
            >
              {account ? (
                <>
                  <Edit3 className="mr-1.5 h-3.5 w-3.5" />
                  Edit Bank Details
                </>
              ) : (
                <>
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Add Bank Details
                </>
              )}
            </Button>
          )}
        </CardHeader>

        <CardContent className="p-5">
          {loading ? (
            <div className="flex min-h-28 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading bank details...
            </div>
          ) : !account ? (
            <div className="flex min-h-28 flex-col items-center justify-center text-center">
              <CreditCard className="mb-2 h-7 w-7 text-muted-foreground/40" />

              <p className="text-sm font-medium">
                No bank details provided.
              </p>

              <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                An active bank account is required for Direct Bank Transfer payroll.
              </p>

              <Button
                type="button"
                size="sm"
                className="mt-4"
                onClick={
                  openEditor
                }
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Add Bank Details
              </Button>
            </div>
          ) : (
            <div className="space-y-3 text-sm">
              <BankRow
                label="Account Holder"
                value={
                  account.accountHolderName
                }
              />

              <BankRow
                label="Bank Name"
                value={
                  account.bankName
                }
              />

              <BankRow
                label="Account Number"
                value={
                  account.accountNumberMasked
                }
                mono
              />

              <BankRow
                label="IFSC"
                value={
                  account.ifscCode
                }
                mono
              />

              <div className="flex items-center justify-between border-t pt-3">
                <span className="text-xs text-muted-foreground">
                  Payroll payout status
                </span>

                <div className="flex items-center gap-2">
                  {account.isPrimary && (
                    <Badge
                      variant="outline"
                      className="border-blue-200 bg-blue-50 text-blue-700"
                    >
                      Primary
                    </Badge>
                  )}

                  {account.isActive ? (
                    <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                      <CheckCircle2 className="mr-1 h-3 w-3" />
                      Active
                    </Badge>
                  ) : (
                    <Badge variant="outline">
                      Inactive
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={
          dialogOpen
        }
        onOpenChange={
          open => {
            if (
              !saving
            ) {
              setDialogOpen(
                open
              )
            }
          }
        }
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {account
                ? 'Edit Bank Details'
                : 'Add Bank Details'}
            </DialogTitle>

            <DialogDescription>
              Configure the active primary bank account used for payroll transfer for {employeeName}.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="bank-holder">
                Account Holder Name
              </Label>

              <Input
                id="bank-holder"
                value={
                  accountHolderName
                }
                onChange={
                  event =>
                    setAccountHolderName(
                      event.target.value
                    )
                }
                autoComplete="off"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="bank-name">
                Bank Name
              </Label>

              <Input
                id="bank-name"
                value={
                  bankName
                }
                onChange={
                  event =>
                    setBankName(
                      event.target.value
                    )
                }
                placeholder="Example: State Bank of India"
                autoComplete="off"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="bank-account-number">
                  Account Number
                </Label>

                <Input
                  id="bank-account-number"
                  value={
                    accountNumber
                  }
                  onChange={
                    event =>
                      setAccountNumber(
                        event.target.value.replace(
                          /\D/g,
                          ''
                        )
                      )
                  }
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder={
                    account
                      ? 'Re-enter account number'
                      : 'Account number'
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="bank-account-confirm">
                  Confirm Account Number
                </Label>

                <Input
                  id="bank-account-confirm"
                  value={
                    confirmAccountNumber
                  }
                  onChange={
                    event =>
                      setConfirmAccountNumber(
                        event.target.value.replace(
                          /\D/g,
                          ''
                        )
                      )
                  }
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="Confirm account number"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bank-ifsc">
                IFSC Code
              </Label>

              <Input
                id="bank-ifsc"
                value={
                  ifscCode
                }
                onChange={
                  event =>
                    setIfscCode(
                      event.target.value
                        .toUpperCase()
                        .replace(
                          /[^A-Z0-9]/g,
                          ''
                        )
                        .slice(
                          0,
                          11
                        )
                    )
                }
                autoComplete="off"
                placeholder="SBIN0001234"
                maxLength={
                  11
                }
              />
            </div>

            <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
              <div className="flex items-start gap-2">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />

                <p>
                  The profile displays only the masked account number. Saving this form makes the new account the active primary payroll destination and deactivates the previous active account.
                </p>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() =>
                setDialogOpen(
                  false
                )
              }
              disabled={
                saving
              }
            >
              Cancel
            </Button>

            <Button
              onClick={() =>
                void save()
              }
              disabled={
                saving
              }
              className="bg-[#1e2a78] text-white hover:bg-[#152060]"
            >
              {saving && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}

              Save Bank Details
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function BankRow({
  label,
  value,
  mono = false,
}: {
  label: string
  value?: string | null
  mono?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b pb-2 last:border-0">
      <span className="text-xs text-muted-foreground">
        {label}
      </span>

      <span
        className={
          mono
            ? 'font-mono text-xs font-medium'
            : 'text-sm font-medium'
        }
      >
        {value ||
          'Not provided'}
      </span>
    </div>
  )
}
