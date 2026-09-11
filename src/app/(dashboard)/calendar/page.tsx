'use client'

import {
  useEffect,
  useMemo,
  useState,
} from 'react'

import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Loader2,
  Plus,
  Trash2,
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
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

import {
  Dialog,
  DialogContent,
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

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface Holiday {
  id: string
  name: string
  date: string
  type:
    | 'public'
    | 'company'
    | 'optional'
    | 'restricted'
  isActive: boolean
}

interface HolidayForm {
  id: string
  name: string
  date: string
  type:
    | 'public'
    | 'company'
    | 'optional'
    | 'restricted'
}

const emptyForm:
  HolidayForm = {
    id:
      '',

    name:
      '',

    date:
      '',

    type:
      'public',
  }

const MONTH_NAMES =
  [
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

function formatDate(
  value:
    string
) {
  const date =
    new Date(
      `${value}T00:00:00`
    )

  return date.toLocaleDateString(
    'en-IN',
    {
      day:
        '2-digit',

      month:
        'short',

      year:
        'numeric',
    }
  )
}

function formatDay(
  value:
    string
) {
  const date =
    new Date(
      `${value}T00:00:00`
    )

  return date.toLocaleDateString(
    'en-IN',
    {
      weekday:
        'long',
    }
  )
}

function typeLabel(
  type:
    Holiday['type']
) {
  switch (
    type
  ) {
    case 'company':
      return 'Company Holiday'

    case 'optional':
      return 'Optional Holiday'

    case 'restricted':
      return 'Restricted Holiday'

    default:
      return 'Public Holiday'
  }
}

function typeBadgeClass(
  type:
    Holiday['type']
) {
  switch (
    type
  ) {
    case 'company':
      return 'border-violet-200 bg-violet-50 text-violet-700 dark:bg-violet-950/30 dark:text-violet-300'

    case 'optional':
      return 'border-amber-200 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300'

    case 'restricted':
      return 'border-slate-200 bg-slate-50 text-slate-700 dark:bg-slate-900 dark:text-slate-300'

    default:
      return 'border-blue-200 bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300'
  }
}

export default function CalendarPage() {
  const [
    year,
    setYear,
  ] =
    useState(
      new Date()
        .getFullYear()
    )

  const [
    holidays,
    setHolidays,
  ] =
    useState<
      Holiday[]
    >(
      []
    )

  const [
    loading,
    setLoading,
  ] =
    useState(
      true
    )

  const [
    saving,
    setSaving,
  ] =
    useState(
      false
    )

  const [
    dialogOpen,
    setDialogOpen,
  ] =
    useState(
      false
    )

  const [
    form,
    setForm,
  ] =
    useState<
      HolidayForm
    >(
      emptyForm
    )

  const [
    deleteTarget,
    setDeleteTarget,
  ] =
    useState<
      Holiday | null
    >(
      null
    )

  const fetchHolidays =
    async () => {
      setLoading(
        true
      )

      try {
        const response =
          await fetch(
            `/api/holidays?year=${year}`,
            {
              cache:
                'no-store',
            }
          )

        const data =
          await response.json()

        if (
          !response.ok ||
          data.success ===
            false
        ) {
          throw new Error(
            data.error ||
            'Unable to load holidays.'
          )
        }

        setHolidays(
          Array.isArray(
            data.holidays
          )
            ? data.holidays
            : []
        )
      } catch (
        error:
          any
      ) {
        toast.error(
          error?.message ||
          'Unable to load holidays.'
        )

        setHolidays(
          []
        )
      } finally {
        setLoading(
          false
        )
      }
    }

  useEffect(
    () => {
      void fetchHolidays()
    },
    [
      year,
    ]
  )

  const holidaysByMonth =
    useMemo(
      () => {
        return MONTH_NAMES.map(
          (
            monthName,
            monthIndex
          ) => ({
            monthName,

            holidays:
              holidays.filter(
                holiday =>
                  Number(
                    holiday.date.slice(
                      5,
                      7
                    )
                  ) -
                    1 ===
                  monthIndex
              ),
          })
        )
      },
      [
        holidays,
      ]
    )

  const upcomingHoliday =
    useMemo(
      () => {
        const today =
          new Date()

        const todayKey =
          [
            today.getFullYear(),
            String(
              today.getMonth() +
              1
            ).padStart(
              2,
              '0'
            ),
            String(
              today.getDate()
            ).padStart(
              2,
              '0'
            ),
          ].join(
            '-'
          )

        return (
          holidays.find(
            holiday =>
              holiday.date >=
              todayKey
          ) ||
          null
        )
      },
      [
        holidays,
      ]
    )

  const openCreate =
    () => {
      setForm({
        ...emptyForm,

        date:
          `${year}-01-01`,
      })

      setDialogOpen(
        true
      )
    }

  const openEdit =
    (
      holiday:
        Holiday
    ) => {
      setForm({
        id:
          holiday.id,

        name:
          holiday.name,

        date:
          holiday.date,

        type:
          holiday.type,
      })

      setDialogOpen(
        true
      )
    }

  const saveHoliday =
    async () => {
      if (
        !form.name.trim()
      ) {
        toast.error(
          'Holiday name is required.'
        )

        return
      }

      if (
        !form.date
      ) {
        toast.error(
          'Holiday date is required.'
        )

        return
      }

      setSaving(
        true
      )

      try {
        const isEditing =
          Boolean(
            form.id
          )

        const response =
          await fetch(
            '/api/holidays',
            {
              method:
                isEditing
                  ? 'PATCH'
                  : 'POST',

              headers: {
                'Content-Type':
                  'application/json',
              },

              body:
                JSON.stringify({
                  id:
                    form.id,

                  name:
                    form.name.trim(),

                  date:
                    form.date,

                  type:
                    form.type,
                }),
            }
          )

        const data =
          await response.json()

        if (
          !response.ok ||
          data.success ===
            false
        ) {
          throw new Error(
            data.error ||
            'Unable to save holiday.'
          )
        }

        toast.success(
          isEditing
            ? 'Holiday updated successfully.'
            : 'Holiday added successfully.'
        )

        setDialogOpen(
          false
        )

        setForm(
          emptyForm
        )

        const holidayYear =
          Number(
            form.date.slice(
              0,
              4
            )
          )

        if (
          holidayYear !==
          year
        ) {
          setYear(
            holidayYear
          )
        } else {
          await fetchHolidays()
        }
      } catch (
        error:
          any
      ) {
        toast.error(
          error?.message ||
          'Unable to save holiday.'
        )
      } finally {
        setSaving(
          false
        )
      }
    }

  const deleteHoliday =
    async () => {
      if (
        !deleteTarget
      ) {
        return
      }

      setSaving(
        true
      )

      try {
        const response =
          await fetch(
            '/api/holidays',
            {
              method:
                'DELETE',

              headers: {
                'Content-Type':
                  'application/json',
              },

              body:
                JSON.stringify({
                  id:
                    deleteTarget.id,
                }),
            }
          )

        const data =
          await response.json()

        if (
          !response.ok ||
          data.success ===
            false
        ) {
          throw new Error(
            data.error ||
            'Unable to remove holiday.'
          )
        }

        toast.success(
          'Holiday removed successfully.'
        )

        setDeleteTarget(
          null
        )

        await fetchHolidays()
      } catch (
        error:
          any
      ) {
        toast.error(
          error?.message ||
          'Unable to remove holiday.'
        )
      } finally {
        setSaving(
          false
        )
      }
    }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* =====================================================
          PAGE HEADER
          ===================================================== */}

      <div className="flex flex-col gap-4 border-b pb-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-[#1e2a78] dark:bg-blue-950/40 dark:text-blue-300">
              <CalendarDays className="h-5 w-5" />
            </div>

            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                Holiday Management
              </h1>

              <p className="text-sm text-muted-foreground">
                Publish the official company holiday calendar for all employees.
              </p>
            </div>
          </div>
        </div>

        <Button
          onClick={
            openCreate
          }
          className="bg-[#1e2a78] text-white hover:bg-[#16205f]"
        >
          <Plus className="mr-2 h-4 w-4" />

          Add Holiday
        </Button>
      </div>

      {/* =====================================================
          YEAR & SUMMARY
          ===================================================== */}

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1fr_1.5fr]">
        <Card>
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Calendar Year
            </p>

            <div className="mt-3 flex items-center justify-between">
              <Button
                variant="outline"
                size="icon"
                onClick={() =>
                  setYear(
                    value =>
                      value -
                      1
                  )
                }
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>

              <span className="text-2xl font-bold">
                {year}
              </span>

              <Button
                variant="outline"
                size="icon"
                onClick={() =>
                  setYear(
                    value =>
                      value +
                      1
                  )
                }
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        <SummaryCard
          title="Total Holidays"
          value={
            holidays.length
          }
        />

        <SummaryCard
          title="Public Holidays"
          value={
            holidays.filter(
              holiday =>
                holiday.type ===
                'public'
            ).length
          }
        />

        <Card>
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Next Holiday
            </p>

            {upcomingHoliday ? (
              <>
                <p className="mt-2 font-semibold">
                  {
                    upcomingHoliday.name
                  }
                </p>

                <p className="mt-1 text-sm text-muted-foreground">
                  {formatDate(
                    upcomingHoliday.date
                  )}{' '}
                  •{' '}
                  {formatDay(
                    upcomingHoliday.date
                  )}
                </p>
              </>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">
                No upcoming holiday in this year.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* =====================================================
          YEARLY HOLIDAY TABLE
          ===================================================== */}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Official Holiday List — {year}
          </CardTitle>

          <CardDescription>
            Holidays saved here are available to the employee company calendar through the same company-scoped holiday API.
          </CardDescription>
        </CardHeader>

        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-7 w-7 animate-spin text-[#1e2a78]" />
            </div>
          ) : holidays.length ===
            0 ? (
            <div className="rounded-xl border border-dashed p-12 text-center">
              <CalendarDays className="mx-auto h-9 w-9 text-muted-foreground" />

              <h3 className="mt-3 font-semibold">
                No holidays configured for {year}
              </h3>

              <p className="mt-1 text-sm text-muted-foreground">
                Add the official holidays for this year. Employees will then see them in Company Calendar.
              </p>

              <Button
                className="mt-5"
                onClick={
                  openCreate
                }
              >
                <Plus className="mr-2 h-4 w-4" />

                Add First Holiday
              </Button>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border">
              <div className="grid grid-cols-[1.6fr_1fr_1fr_1fr_auto] gap-4 border-b bg-muted/40 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <div>
                  Holiday
                </div>

                <div>
                  Date
                </div>

                <div>
                  Day
                </div>

                <div>
                  Type
                </div>

                <div className="text-right">
                  Actions
                </div>
              </div>

              {holidays.map(
                holiday => (
                  <div
                    key={
                      holiday.id
                    }
                    className="grid grid-cols-[1.6fr_1fr_1fr_1fr_auto] items-center gap-4 border-b px-4 py-4 last:border-b-0"
                  >
                    <div>
                      <p className="font-medium">
                        {
                          holiday.name
                        }
                      </p>
                    </div>

                    <div className="text-sm">
                      {formatDate(
                        holiday.date
                      )}
                    </div>

                    <div className="text-sm text-muted-foreground">
                      {formatDay(
                        holiday.date
                      )}
                    </div>

                    <div>
                      <Badge
                        variant="outline"
                        className={
                          typeBadgeClass(
                            holiday.type
                          )
                        }
                      >
                        {typeLabel(
                          holiday.type
                        )}
                      </Badge>
                    </div>

                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() =>
                          openEdit(
                            holiday
                          )
                        }
                      >
                        <Edit3 className="h-4 w-4" />
                      </Button>

                      <Button
                        variant="outline"
                        size="icon"
                        className="text-red-600 hover:text-red-700"
                        onClick={() =>
                          setDeleteTarget(
                            holiday
                          )
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* =====================================================
          MONTH BREAKDOWN
          ===================================================== */}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {holidaysByMonth
          .filter(
            month =>
              month.holidays
                .length >
              0
          )
          .map(
            month => (
              <Card
                key={
                  month.monthName
                }
              >
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">
                    {
                      month.monthName
                    }
                  </CardTitle>
                </CardHeader>

                <CardContent className="space-y-3">
                  {month.holidays.map(
                    holiday => (
                      <div
                        key={
                          holiday.id
                        }
                        className="flex items-start justify-between gap-3 rounded-lg border p-3"
                      >
                        <div>
                          <p className="text-sm font-medium">
                            {
                              holiday.name
                            }
                          </p>

                          <p className="mt-1 text-xs text-muted-foreground">
                            {formatDate(
                              holiday.date
                            )}{' '}
                            •{' '}
                            {formatDay(
                              holiday.date
                            )}
                          </p>
                        </div>

                        <Badge
                          variant="outline"
                          className={
                            typeBadgeClass(
                              holiday.type
                            )
                          }
                        >
                          {typeLabel(
                            holiday.type
                          )}
                        </Badge>
                      </div>
                    )
                  )}
                </CardContent>
              </Card>
            )
          )}
      </div>

      {/* =====================================================
          CREATE / EDIT DIALOG
          ===================================================== */}

      <Dialog
        open={
          dialogOpen
        }
        onOpenChange={
          setDialogOpen
        }
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {form.id
                ? 'Edit Holiday'
                : 'Add Holiday'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
            <div className="space-y-2">
              <Label htmlFor="holiday-name">
                Holiday Name
              </Label>

              <Input
                id="holiday-name"
                value={
                  form.name ??
                  ''
                }
                placeholder="e.g. Independence Day"
                onChange={
                  event =>
                    setForm(
                      previous => ({
                        ...previous,

                        name:
                          event.target.value,
                      })
                    )
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="holiday-date">
                Holiday Date
              </Label>

              <Input
                id="holiday-date"
                type="date"
                value={
                  form.date ??
                  ''
                }
                onChange={
                  event =>
                    setForm(
                      previous => ({
                        ...previous,

                        date:
                          event.target.value,
                      })
                    )
                }
              />
            </div>

            <div className="space-y-2">
              <Label>
                Holiday Type
              </Label>

              <Select
                value={
                  form.type
                }
                onValueChange={
                  value =>
                    setForm(
                      previous => ({
                        ...previous,

                        type:
                          value as HolidayForm['type'],
                      })
                    )
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>

                <SelectContent>
                  <SelectItem value="public">
                    Public Holiday
                  </SelectItem>

                  <SelectItem value="company">
                    Company Holiday
                  </SelectItem>

                  <SelectItem value="optional">
                    Optional Holiday
                  </SelectItem>

                  <SelectItem value="restricted">
                    Restricted Holiday
                  </SelectItem>
                </SelectContent>
              </Select>
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
            >
              Cancel
            </Button>

            <Button
              onClick={() =>
                void saveHoliday()
              }
              disabled={
                saving
              }
              className="bg-[#1e2a78] text-white hover:bg-[#16205f]"
            >
              {saving && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}

              {form.id
                ? 'Save Changes'
                : 'Add Holiday'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* =====================================================
          DELETE CONFIRMATION
          ===================================================== */}

      <Dialog
        open={
          Boolean(
            deleteTarget
          )
        }
        onOpenChange={
          open => {
            if (
              !open
            ) {
              setDeleteTarget(
                null
              )
            }
          }
        }
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Remove Holiday?
            </DialogTitle>
          </DialogHeader>

          <p className="text-sm text-muted-foreground">
            {deleteTarget
              ? `${deleteTarget.name} will no longer appear in the employee holiday calendar.`
              : ''}
          </p>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() =>
                setDeleteTarget(
                  null
                )
              }
            >
              Cancel
            </Button>

            <Button
              variant="destructive"
              disabled={
                saving
              }
              onClick={() =>
                void deleteHoliday()
              }
            >
              {saving && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}

              Remove Holiday
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function SummaryCard({
  title,
  value,
}: {
  title:
    string
  value:
    number
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          {title}
        </p>

        <p className="mt-2 text-3xl font-bold">
          {value}
        </p>
      </CardContent>
    </Card>
  )
}
