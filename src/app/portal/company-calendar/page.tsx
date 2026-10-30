'use client'

import {
  useEffect,
  useMemo,
  useState,
} from 'react'

import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Loader2,
  Sparkles,
} from 'lucide-react'

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
  useAuth,
} from '@/components/providers/auth-provider'

import {
  toast,
} from 'sonner'

interface Holiday {
  id: string
  name: string
  date: string
  type:
    | 'public'
    | 'company'
    | 'optional'
    | 'restricted'
  isActive?: boolean
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

function toLocalDate(
  value:
    string
): Date {
  return new Date(
    `${value}T00:00:00`
  )
}

function formatDate(
  value:
    string
): string {
  return toLocalDate(
    value
  ).toLocaleDateString(
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
): string {
  return toLocalDate(
    value
  ).toLocaleDateString(
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
): string {
  switch (
    type
  ) {
    case 'company':
      return 'Paid Company Holiday'

    case 'optional':
      return 'Optional Holiday'

    case 'restricted':
      return 'Restricted Holiday'

    default:
      return 'Paid Public Holiday'
  }
}

function typeBadgeClass(
  type:
    Holiday['type']
): string {
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

function getTodayKey(): string {
  const today =
    new Date()

  return [
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
}

function getDaysUntil(
  value:
    string
): number {
  const today =
    new Date()

  const start =
    new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate()
    )

  const target =
    toLocalDate(
      value
    )

  const diff =
    target.getTime() -
    start.getTime()

  return Math.ceil(
    diff /
    (
      1000 *
      60 *
      60 *
      24
    )
  )
}

export default function CompanyCalendarPage() {
  const {
    user,
  } =
    useAuth()

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
    error,
    setError,
  ] =
    useState<
      string | null
    >(
      null
    )

  const fetchHolidays =
    async () => {
      if (
        !user
      ) {
        return
      }

      setLoading(
        true
      )

      setError(
        null
      )

      try {
        const response =
          await fetch(
            `/api/holidays?year=${year}`,
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
          !response.ok ||
          data.success ===
            false
        ) {
          throw new Error(
            data.error ||
            'Unable to load company holidays.'
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
        fetchError:
          any
      ) {
        console.error(
          '[CompanyCalendarPage] Holiday load failed:',
          fetchError
        )

        const message =
          fetchError?.message ||
          'Unable to load company holidays.'

        setError(
          message
        )

        setHolidays(
          []
        )

        toast.error(
          message
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
      user,
      year,
    ]
  )

  const todayKey =
    getTodayKey()

  const upcoming =
    useMemo(
      () =>
        holidays.filter(
          holiday =>
            holiday.date >=
            todayKey
        ),
      [
        holidays,
        todayKey,
      ]
    )

  const nextHoliday =
    upcoming[0] ||
    null

  const holidaysByMonth =
    useMemo(
      () =>
        MONTH_NAMES.map(
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
        ),
      [
        holidays,
      ]
    )

  return (
    <div className="w-full space-y-6 pb-6">
      {/* =====================================================
          HEADER
          ===================================================== */}

      <div className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#1e2a78] dark:bg-blue-950/40 dark:text-blue-300">
              <CalendarIcon className="h-5 w-5" />
            </div>

            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground truncate">
                Company Calendar
              </h1>

              <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
                View the official company holiday calendar published by HR.
              </p>
            </div>
          </div>
        </div>

        <Badge
          variant="outline"
          className="w-fit border-blue-200 bg-blue-50 px-3 py-1 text-xs text-blue-700 dark:bg-blue-950/30 dark:text-blue-300 shrink-0"
        >
          <Sparkles className="mr-1 h-3.5 w-3.5" />

          HR Published Calendar
        </Badge>
      </div>

      {/* =====================================================
          YEAR + SUMMARY
          ===================================================== */}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Calendar Year
            </p>

            <div className="mt-2 flex items-center justify-between">
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

              <span className="text-xl font-bold">
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

        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Total Holidays
            </p>

            <p className="mt-1.5 text-2xl font-bold">
              {
                holidays.length
              }
            </p>

            <p className="mt-1 text-xs text-muted-foreground">
              Official holidays configured for {year}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Upcoming Holidays
            </p>

            <p className="mt-1.5 text-2xl font-bold">
              {upcoming.length}
            </p>

            <p className="mt-1 text-xs text-muted-foreground">
              Remaining in {year}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Next Holiday
            </p>

            {nextHoliday ? (
              <div className="mt-1.5">
                <p className="font-semibold">
                  {
                    nextHoliday.name
                  }
                </p>

                <p className="mt-1 text-sm text-muted-foreground">
                  {formatDate(
                    nextHoliday.date
                  )}{' '}
                  •{' '}
                  {formatDay(
                    nextHoliday.date
                  )}
                </p>

                <p className="mt-2 text-xs font-medium text-[#1e2a78] dark:text-blue-300">
                  {getDaysUntil(
                    nextHoliday.date
                  ) ===
                  0
                    ? 'Today'
                    : `In ${getDaysUntil(
                        nextHoliday.date
                      )} day${
                        getDaysUntil(
                          nextHoliday.date
                        ) ===
                        1
                          ? ''
                          : 's'
                      }`}
                </p>
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                No upcoming holiday in this year.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* =====================================================
          UPCOMING HOLIDAYS
          ===================================================== */}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock3 className="h-4 w-4 text-[#1e2a78]" />

            Upcoming Holidays
          </CardTitle>

          <CardDescription>
            The next official company holidays scheduled for this year.
          </CardDescription>
        </CardHeader>

        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-7 w-7 animate-spin text-[#1e2a78]" />
            </div>
          ) : error ? (
            <div className="rounded-xl border border-red-200 bg-red-50/60 p-8 text-center dark:bg-red-950/20">
              <p className="text-sm font-medium text-red-700 dark:text-red-300">
                {error}
              </p>

              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() =>
                  void fetchHolidays()
                }
              >
                Retry
              </Button>
            </div>
          ) : upcoming.length ===
            0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              No upcoming holidays scheduled for {year}.
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {upcoming
                .slice(
                  0,
                  6
                )
                .map(
                  holiday => (
                    <div
                      key={
                        holiday.id
                      }
                      className="rounded-lg border bg-card p-3.5"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-foreground">
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
                    </div>
                  )
                )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* =====================================================
          OFFICIAL HOLIDAY LIST
          ===================================================== */}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Official Holiday List — {year}
          </CardTitle>

          <CardDescription>
            This list is maintained by Administration and updates automatically when HR changes the company holiday calendar.
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
              <CalendarIcon className="mx-auto h-9 w-9 text-muted-foreground" />

              <h3 className="mt-3 text-sm font-semibold">
                No holidays published for {year}
              </h3>

              <p className="mt-1 text-sm text-muted-foreground">
                When Administration publishes holidays for this year, they will appear here automatically.
              </p>
            </div>
          ) : (
            <div className="relative w-full overflow-x-auto rounded-xl border">
              <table className="w-full min-w-[500px] text-xs sm:text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Date
                    </th>

                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Day
                    </th>

                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Holiday
                    </th>

                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Type
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {holidays.map(
                    holiday => {
                      const isPast =
                        holiday.date <
                        todayKey

                      return (
                        <tr
                          key={
                            holiday.id
                          }
                          className={
                            isPast
                              ? 'border-b bg-muted/10 text-muted-foreground last:border-b-0'
                              : 'border-b last:border-b-0'
                          }
                        >
                          <td className="px-4 py-4 font-medium">
                            {formatDate(
                              holiday.date
                            )}
                          </td>

                          <td className="px-4 py-4">
                            {formatDay(
                              holiday.date
                            )}
                          </td>

                          <td className="px-4 py-4 font-medium text-foreground">
                            {
                              holiday.name
                            }
                          </td>

                          <td className="px-4 py-4">
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
                          </td>
                        </tr>
                      )
                    }
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* =====================================================
          MONTHLY BREAKDOWN
          ===================================================== */}

      {!loading &&
        holidays.length >
          0 && (
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
                            className="rounded-lg border p-3"
                          >
                            <div className="flex items-start justify-between gap-3">
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
                          </div>
                        )
                      )}
                    </CardContent>
                  </Card>
                )
              )}
          </div>
        )}
    </div>
  )
}
