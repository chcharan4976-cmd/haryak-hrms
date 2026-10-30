'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Edit3,
  Filter,
  Loader2,
  MoreHorizontal,
  Plus,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
  type: 'public' | 'company' | 'optional' | 'restricted'
  isActive: boolean
}

interface HolidayForm {
  id: string
  name: string
  date: string
  type: 'public' | 'company' | 'optional' | 'restricted'
}

type ViewMode = 'directory' | 'calendar'
type StatusFilter = 'all' | 'upcoming' | 'past'

const emptyForm: HolidayForm = {
  id: '',
  name: '',
  date: '',
  type: 'public',
}

const MONTH_NAMES = [
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

const WEEK_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function toDate(value: string) {
  return new Date(`${value}T00:00:00`)
}

function formatDate(value: string) {
  return toDate(value).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function formatDay(value: string) {
  return toDate(value).toLocaleDateString('en-IN', {
    weekday: 'long',
  })
}

function todayKey() {
  const today = new Date()
  return [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-')
}

function daysBetween(from: string, to: string) {
  const start = toDate(from).getTime()
  const end = toDate(to).getTime()
  return Math.max(0, Math.ceil((end - start) / 86_400_000))
}

function typeLabel(type: Holiday['type']) {
  switch (type) {
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

function typeBadgeClass(type: Holiday['type']) {
  switch (type) {
    case 'company':
      return 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/30 dark:text-violet-300'
    case 'optional':
      return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300'
    case 'restricted':
      return 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
    default:
      return 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300'
  }
}

function holidayDotClass(type: Holiday['type']) {
  switch (type) {
    case 'company':
      return 'bg-violet-500'
    case 'optional':
      return 'bg-amber-500'
    case 'restricted':
      return 'bg-slate-500'
    default:
      return 'bg-blue-600'
  }
}

function statusLabel(holiday: Holiday) {
  const today = todayKey()

  if (holiday.date === today) {
    return 'Today'
  }

  return holiday.date > today ? 'Upcoming' : 'Completed'
}

function statusBadgeClass(holiday: Holiday) {
  const status = statusLabel(holiday)

  if (status === 'Today') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300'
  }

  if (status === 'Upcoming') {
    return 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300'
  }

  return 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
}

export default function CalendarPage() {
  const [year, setYear] = useState(new Date().getFullYear())
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<HolidayForm>(emptyForm)
  const [deleteTarget, setDeleteTarget] = useState<Holiday | null>(null)

  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | Holiday['type']>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [viewMode, setViewMode] = useState<ViewMode>('directory')

  const fetchHolidays = async () => {
    setLoading(true)

    try {
      const response = await fetch(`/api/holidays?year=${year}`, {
        cache: 'no-store',
      })

      const data = await response.json()

      if (!response.ok || data.success === false) {
        throw new Error(data.error || 'Unable to load holidays.')
      }

      const nextHolidays = Array.isArray(data.holidays) ? data.holidays : []

      nextHolidays.sort((a: Holiday, b: Holiday) =>
        a.date.localeCompare(b.date),
      )

      setHolidays(nextHolidays)
    } catch (error: any) {
      toast.error(error?.message || 'Unable to load holidays.')
      setHolidays([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchHolidays()
  }, [year])

  const today = todayKey()

  const upcomingHolidays = useMemo(
    () => holidays.filter((holiday) => holiday.date >= today),
    [holidays, today],
  )

  const upcomingHoliday = upcomingHolidays[0] || null
  const followingHoliday = upcomingHolidays[1] || null

  const publicHolidayCount = useMemo(
    () => holidays.filter((holiday) => holiday.type === 'public').length,
    [holidays],
  )

  const companyHolidayCount = useMemo(
    () => holidays.filter((holiday) => holiday.type === 'company').length,
    [holidays],
  )

  const optionalHolidayCount = useMemo(
    () =>
      holidays.filter(
        (holiday) =>
          holiday.type === 'optional' || holiday.type === 'restricted',
      ).length,
    [holidays],
  )

  const filteredHolidays = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase()

    return holidays.filter((holiday) => {
      const matchesSearch =
        !normalizedSearch ||
        holiday.name.toLowerCase().includes(normalizedSearch) ||
        formatDate(holiday.date).toLowerCase().includes(normalizedSearch) ||
        formatDay(holiday.date).toLowerCase().includes(normalizedSearch)

      const matchesType =
        typeFilter === 'all' || holiday.type === typeFilter

      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'upcoming'
          ? holiday.date >= today
          : holiday.date < today)

      return matchesSearch && matchesType && matchesStatus
    })
  }, [holidays, searchQuery, statusFilter, today, typeFilter])

  const holidaysByMonth = useMemo(
    () =>
      MONTH_NAMES.map((monthName, monthIndex) => ({
        monthName,
        monthIndex,
        holidays: holidays.filter(
          (holiday) =>
            Number(holiday.date.slice(5, 7)) - 1 === monthIndex,
        ),
      })),
    [holidays],
  )

  const openCreate = () => {
    const defaultMonth =
      year === new Date().getFullYear()
        ? String(new Date().getMonth() + 1).padStart(2, '0')
        : '01'

    setForm({
      ...emptyForm,
      date: `${year}-${defaultMonth}-01`,
    })
    setDialogOpen(true)
  }

  const openEdit = (holiday: Holiday) => {
    setForm({
      id: holiday.id,
      name: holiday.name,
      date: holiday.date,
      type: holiday.type,
    })
    setDialogOpen(true)
  }

  const duplicateHoliday = (holiday: Holiday) => {
    setForm({
      id: '',
      name: `${holiday.name} Copy`,
      date: holiday.date,
      type: holiday.type,
    })
    setDialogOpen(true)
  }

  const saveHoliday = async () => {
    if (!form.name.trim()) {
      toast.error('Holiday name is required.')
      return
    }

    if (!form.date) {
      toast.error('Holiday date is required.')
      return
    }

    const duplicate = holidays.find(
      (holiday) =>
        holiday.date === form.date &&
        holiday.id !== form.id &&
        holiday.name.trim().toLowerCase() === form.name.trim().toLowerCase(),
    )

    if (duplicate) {
      toast.error('This holiday already exists on the selected date.')
      return
    }

    setSaving(true)

    try {
      const isEditing = Boolean(form.id)

      const response = await fetch('/api/holidays', {
        method: isEditing ? 'PATCH' : 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: form.id,
          name: form.name.trim(),
          date: form.date,
          type: form.type,
        }),
      })

      const data = await response.json()

      if (!response.ok || data.success === false) {
        throw new Error(data.error || 'Unable to save holiday.')
      }

      toast.success(
        isEditing
          ? 'Holiday updated successfully.'
          : 'Holiday added successfully.',
      )

      setDialogOpen(false)
      setForm(emptyForm)

      const holidayYear = Number(form.date.slice(0, 4))

      if (holidayYear !== year) {
        setYear(holidayYear)
      } else {
        await fetchHolidays()
      }
    } catch (error: any) {
      toast.error(error?.message || 'Unable to save holiday.')
    } finally {
      setSaving(false)
    }
  }

  const deleteHoliday = async () => {
    if (!deleteTarget) {
      return
    }

    setSaving(true)

    try {
      const response = await fetch('/api/holidays', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: deleteTarget.id,
        }),
      })

      const data = await response.json()

      if (!response.ok || data.success === false) {
        throw new Error(data.error || 'Unable to remove holiday.')
      }

      toast.success('Holiday removed successfully.')
      setDeleteTarget(null)
      await fetchHolidays()
    } catch (error: any) {
      toast.error(error?.message || 'Unable to remove holiday.')
    } finally {
      setSaving(false)
    }
  }

  const clearFilters = () => {
    setSearchQuery('')
    setTypeFilter('all')
    setStatusFilter('all')
  }

  return (
    <div className="w-full space-y-6 pb-6">
      {/* Premium page hero */}
      <section className="relative overflow-hidden rounded-xl border border-[#1e2a78]/10 bg-gradient-to-br from-[#17256f] via-[#1e2a78] to-[#263b9a] p-4 text-white shadow-sm sm:p-5">
        <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 left-1/3 h-64 w-64 rounded-full bg-blue-300/10 blur-3xl" />

        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/10 shadow-inner backdrop-blur">
              <CalendarDays className="h-5 w-5" />
            </div>

            <div>
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                <Badge className="border-white/15 bg-white/10 text-white hover:bg-white/10">
                  <Sparkles className="mr-1 h-3 w-3" />
                  Company Calendar
                </Badge>

                <Badge className="border-emerald-300/20 bg-emerald-300/10 text-emerald-100 hover:bg-emerald-300/10">
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                  Published to employees
                </Badge>
              </div>

              <h1 className="text-xl font-bold tracking-tight">
                Holiday Management
              </h1>

              <p className="mt-1 max-w-2xl text-sm leading-5 text-blue-100/90">
                Plan, publish and govern the official company holiday calendar
                from one workspace.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center rounded-xl border border-white/15 bg-white/10 p-1 backdrop-blur">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-white hover:bg-white/10 hover:text-white"
                onClick={() => setYear((value) => value - 1)}
                aria-label="Previous year"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>

              <div className="min-w-24 px-3 text-center">
                <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-blue-200">
                  Calendar
                </p>
                <p className="text-lg font-bold">{year}</p>
              </div>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-white hover:bg-white/10 hover:text-white"
                onClick={() => setYear((value) => value + 1)}
                aria-label="Next year"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <Button
              type="button"
              onClick={openCreate}
              className="h-9 bg-white px-4 font-semibold text-[#1e2a78] shadow-sm hover:bg-blue-50"
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Holiday
            </Button>
          </div>
        </div>
      </section>

      {/* Executive holiday summary */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <MetricCard
          icon={<CalendarRange className="h-5 w-5" />}
          eyebrow="Annual Calendar"
          title="Total Holidays"
          value={loading ? '—' : String(holidays.length)}
          description={`${year} official schedule`}
        />

        <MetricCard
          icon={<Clock3 className="h-5 w-5" />}
          eyebrow="Remaining"
          title="Upcoming Holidays"
          value={loading ? '—' : String(upcomingHolidays.length)}
          description={
            upcomingHoliday
              ? `${upcomingHoliday.name} is next`
              : 'No remaining holidays'
          }
        />

        <MetricCard
          icon={<CheckCircle2 className="h-5 w-5" />}
          eyebrow="Holiday Coverage"
          title="Public Holidays"
          value={loading ? '—' : String(publicHolidayCount)}
          description={`${companyHolidayCount} company • ${optionalHolidayCount} optional/restricted`}
        />

        <Card className="overflow-hidden border-[#1e2a78]/15 shadow-sm">
          <CardContent className="relative h-full p-4">
            <div className="absolute right-0 top-0 h-24 w-24 rounded-bl-full bg-blue-50 dark:bg-blue-950/30" />

            <div className="relative">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Next Company Holiday
                </p>

                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#1e2a78]/10 text-[#1e2a78] dark:text-blue-300">
                  <CalendarDays className="h-4 w-4" />
                </div>
              </div>

              {loading ? (
                <div className="mt-2 flex h-10 items-center">
                  <Loader2 className="h-5 w-5 animate-spin text-[#1e2a78]" />
                </div>
              ) : upcomingHoliday ? (
                <>
                  <p className="mt-2 line-clamp-1 text-base font-bold">
                    {upcomingHoliday.name}
                  </p>

                  <p className="mt-1 text-sm text-muted-foreground">
                    {formatDate(upcomingHoliday.date)} •{' '}
                    {formatDay(upcomingHoliday.date)}
                  </p>

                  <div className="mt-2 flex items-center gap-2">
                    <Badge className="border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300">
                      {upcomingHoliday.date === today
                        ? 'Today'
                        : `${daysBetween(today, upcomingHoliday.date)} days away`}
                    </Badge>

                    <Badge
                      variant="outline"
                      className={typeBadgeClass(upcomingHoliday.type)}
                    >
                      {typeLabel(upcomingHoliday.type)}
                    </Badge>
                  </div>
                </>
              ) : (
                <div className="mt-4">
                  <p className="font-semibold">Calendar complete</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    No upcoming holiday remains in {year}.
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Next holiday spotlight */}
      {!loading && upcomingHoliday && (
        <section className="grid gap-3 lg:grid-cols-[1.6fr_1fr]">
          <Card className="overflow-hidden border-[#1e2a78]/10 shadow-sm">
            <CardContent className="p-0">
              <div className="grid min-h-32 md:grid-cols-[140px_1fr]">
                <div className="flex flex-col items-center justify-center bg-[#1e2a78] p-4 text-white">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-200">
                    {toDate(upcomingHoliday.date).toLocaleDateString('en-IN', {
                      month: 'short',
                    })}
                  </span>
                  <span className="mt-1 text-4xl font-black leading-none">
                    {String(toDate(upcomingHoliday.date).getDate()).padStart(
                      2,
                      '0',
                    )}
                  </span>
                  <span className="mt-2 text-sm text-blue-100">
                    {formatDay(upcomingHoliday.date)}
                  </span>
                </div>

                <div className="flex flex-col justify-center p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#1e2a78] dark:text-blue-300">
                    Next official holiday
                  </p>

                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-bold tracking-tight">
                      {upcomingHoliday.name}
                    </h2>

                    <Badge
                      variant="outline"
                      className={typeBadgeClass(upcomingHoliday.type)}
                    >
                      {typeLabel(upcomingHoliday.type)}
                    </Badge>
                  </div>

                  <p className="mt-2 text-sm text-muted-foreground">
                    {upcomingHoliday.date === today
                      ? 'Observed today across the published company calendar.'
                      : `${daysBetween(
                          today,
                          upcomingHoliday.date,
                        )} days remaining until this holiday.`}
                  </p>

                  {followingHoliday && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Next after this:{' '}
                      <span className="font-semibold text-foreground">
                        {followingHoliday.name}
                      </span>{' '}
                      • {formatDate(followingHoliday.date)}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border shadow-sm">
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-base">Calendar Composition</CardTitle>
              <CardDescription>
                Holiday types configured for {year}
              </CardDescription>
            </CardHeader>

            <CardContent className="grid grid-cols-2 gap-2 pb-4">
              <CompositionItem
                label="Public"
                value={publicHolidayCount}
                dotClass="bg-blue-600"
              />
              <CompositionItem
                label="Company"
                value={companyHolidayCount}
                dotClass="bg-violet-500"
              />
              <CompositionItem
                label="Optional"
                value={
                  holidays.filter((holiday) => holiday.type === 'optional')
                    .length
                }
                dotClass="bg-amber-500"
              />
              <CompositionItem
                label="Restricted"
                value={
                  holidays.filter((holiday) => holiday.type === 'restricted')
                    .length
                }
                dotClass="bg-slate-500"
              />
            </CardContent>
          </Card>
        </section>
      )}

      {/* Directory / calendar workspace */}
      <Card className="overflow-hidden border shadow-sm">
        <CardHeader className="border-b bg-muted/10 pb-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <CardTitle className="text-lg">Holiday Directory</CardTitle>
              <CardDescription className="mt-1">
                Manage the official {year} calendar and published employee
                holidays.
              </CardDescription>
            </div>

            <div className="flex w-full flex-col gap-2 sm:flex-row xl:w-auto">
              <div className="relative min-w-0 sm:w-64">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search holidays..."
                  className="pl-9"
                />
              </div>

              <Select
                value={typeFilter}
                onValueChange={(value) =>
                  setTypeFilter(value as 'all' | Holiday['type'])
                }
              >
                <SelectTrigger className="sm:w-44">
                  <Filter className="mr-2 h-4 w-4 text-muted-foreground" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="public">Public</SelectItem>
                  <SelectItem value="company">Company</SelectItem>
                  <SelectItem value="optional">Optional</SelectItem>
                  <SelectItem value="restricted">Restricted</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={statusFilter}
                onValueChange={(value) =>
                  setStatusFilter(value as StatusFilter)
                }
              >
                <SelectTrigger className="sm:w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="upcoming">Upcoming</SelectItem>
                  <SelectItem value="past">Completed</SelectItem>
                </SelectContent>
              </Select>

              <div className="flex rounded-lg border bg-background p-1">
                <Button
                  type="button"
                  variant={viewMode === 'directory' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-8"
                  onClick={() => setViewMode('directory')}
                >
                  List
                </Button>
                <Button
                  type="button"
                  variant={viewMode === 'calendar' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-8"
                  onClick={() => setViewMode('calendar')}
                >
                  Calendar
                </Button>
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {loading ? (
            <div className="flex min-h-80 flex-col items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-[#1e2a78]" />
              <p className="mt-3 text-sm font-medium">
                Loading company calendar
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Retrieving the published holiday schedule.
              </p>
            </div>
          ) : holidays.length === 0 ? (
            <EmptyState year={year} onCreate={openCreate} />
          ) : viewMode === 'directory' ? (
            <>
              <div className="hidden lg:block">
                <div className="grid grid-cols-[1.7fr_1fr_0.8fr_1fr_0.85fr_auto] gap-4 border-b bg-muted/30 px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  <div>Holiday</div>
                  <div>Date</div>
                  <div>Day</div>
                  <div>Type</div>
                  <div>Status</div>
                  <div className="text-right">Action</div>
                </div>

                {filteredHolidays.length === 0 ? (
                  <NoResults onClear={clearFilters} />
                ) : (
                  filteredHolidays.map((holiday) => (
                    <div
                      key={holiday.id}
                      className="group grid grid-cols-[1.7fr_1fr_0.8fr_1fr_0.85fr_auto] items-center gap-4 border-b px-5 py-4 transition-colors last:border-b-0 hover:bg-muted/25"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div
                          className={`h-9 w-1 shrink-0 rounded-full ${holidayDotClass(
                            holiday.type,
                          )}`}
                        />
                        <div className="min-w-0">
                          <p className="truncate font-semibold">
                            {holiday.name}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            Official company calendar
                          </p>
                        </div>
                      </div>

                      <div className="text-sm font-medium">
                        {formatDate(holiday.date)}
                      </div>

                      <div className="text-sm text-muted-foreground">
                        {formatDay(holiday.date)}
                      </div>

                      <div>
                        <Badge
                          variant="outline"
                          className={typeBadgeClass(holiday.type)}
                        >
                          {typeLabel(holiday.type)}
                        </Badge>
                      </div>

                      <div>
                        <Badge
                          variant="outline"
                          className={statusBadgeClass(holiday)}
                        >
                          {statusLabel(holiday)}
                        </Badge>
                      </div>

                      <div className="flex justify-end">
                        <HolidayActions
                          holiday={holiday}
                          onEdit={openEdit}
                          onDuplicate={duplicateHoliday}
                          onDelete={setDeleteTarget}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="grid gap-3 p-4 lg:hidden">
                {filteredHolidays.length === 0 ? (
                  <NoResults onClear={clearFilters} />
                ) : (
                  filteredHolidays.map((holiday) => (
                    <div
                      key={holiday.id}
                      className="rounded-xl border bg-background p-4 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 gap-3">
                          <div
                            className={`mt-1 h-10 w-1 shrink-0 rounded-full ${holidayDotClass(
                              holiday.type,
                            )}`}
                          />
                          <div>
                            <p className="font-semibold">{holiday.name}</p>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {formatDate(holiday.date)} •{' '}
                              {formatDay(holiday.date)}
                            </p>
                          </div>
                        </div>

                        <HolidayActions
                          holiday={holiday}
                          onEdit={openEdit}
                          onDuplicate={duplicateHoliday}
                          onDelete={setDeleteTarget}
                        />
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <Badge
                          variant="outline"
                          className={typeBadgeClass(holiday.type)}
                        >
                          {typeLabel(holiday.type)}
                        </Badge>

                        <Badge
                          variant="outline"
                          className={statusBadgeClass(holiday)}
                        >
                          {statusLabel(holiday)}
                        </Badge>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          ) : (
            <div className="p-4 sm:p-5">
              <YearCalendar
                year={year}
                months={holidaysByMonth}
                onHolidayClick={openEdit}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Annual timeline */}
      {!loading && holidays.length > 0 && (
        <Card className="border shadow-sm">
          <CardHeader className="border-b pb-4">
            <CardTitle className="text-lg">Annual Holiday Timeline</CardTitle>
            <CardDescription>
              Month-by-month view of the published {year} holiday schedule.
            </CardDescription>
          </CardHeader>

          <CardContent className="p-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {holidaysByMonth
                .filter((month) => month.holidays.length > 0)
                .map((month) => (
                  <div
                    key={month.monthName}
                    className="rounded-xl border bg-muted/15 p-4 transition-colors hover:bg-muted/30"
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <p className="font-semibold">{month.monthName}</p>
                      <Badge variant="secondary">
                        {month.holidays.length}{' '}
                        {month.holidays.length === 1 ? 'holiday' : 'holidays'}
                      </Badge>
                    </div>

                    <div className="space-y-2">
                      {month.holidays.map((holiday) => (
                        <button
                          type="button"
                          key={holiday.id}
                          onClick={() => openEdit(holiday)}
                          className="flex w-full items-center gap-3 rounded-lg border bg-background p-3 text-left transition-colors hover:border-[#1e2a78]/30 hover:bg-blue-50/40 dark:hover:bg-blue-950/10"
                        >
                          <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg bg-muted">
                            <span className="text-[9px] font-semibold uppercase text-muted-foreground">
                              {toDate(holiday.date).toLocaleDateString('en-IN', {
                                month: 'short',
                              })}
                            </span>
                            <span className="text-sm font-bold leading-none">
                              {toDate(holiday.date).getDate()}
                            </span>
                          </div>

                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold">
                              {holiday.name}
                            </p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {formatDay(holiday.date)}
                            </p>
                          </div>

                          <span
                            className={`h-2.5 w-2.5 shrink-0 rounded-full ${holidayDotClass(
                              holiday.type,
                            )}`}
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create / edit holiday */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!saving) {
            setDialogOpen(open)
            if (!open) {
              setForm(emptyForm)
            }
          }
        }}
      >
        <DialogContent className="overflow-hidden p-0 sm:max-w-xl">
          <div className="bg-gradient-to-r from-[#17256f] to-[#263b9a] px-6 py-5 text-white">
            <DialogHeader>
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
                <CalendarDays className="h-5 w-5" />
              </div>

              <DialogTitle className="text-xl text-white">
                {form.id ? 'Edit Holiday' : 'Add Company Holiday'}
              </DialogTitle>

              <p className="text-sm text-blue-100">
                {form.id
                  ? 'Update the published holiday information.'
                  : 'Create a holiday for the official employee calendar.'}
              </p>
            </DialogHeader>
          </div>

          <div className="space-y-5 px-6 py-5">
            <div className="space-y-2">
              <Label htmlFor="holiday-name">Holiday Name</Label>
              <Input
                id="holiday-name"
                value={form.name}
                placeholder="e.g. Independence Day"
                autoFocus
                onChange={(event) =>
                  setForm((previous) => ({
                    ...previous,
                    name: event.target.value,
                  }))
                }
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="holiday-date">Holiday Date</Label>
                <Input
                  id="holiday-date"
                  type="date"
                  value={form.date}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      date: event.target.value,
                    }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>Holiday Type</Label>
                <Select
                  value={form.type}
                  onValueChange={(value) =>
                    setForm((previous) => ({
                      ...previous,
                      type: value as HolidayForm['type'],
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>

                  <SelectContent>
                    <SelectItem value="public">Public Holiday</SelectItem>
                    <SelectItem value="company">Company Holiday</SelectItem>
                    <SelectItem value="optional">Optional Holiday</SelectItem>
                    <SelectItem value="restricted">
                      Restricted Holiday
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {form.date && (
              <div className="rounded-xl border bg-muted/30 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Calendar Preview
                </p>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">
                      {form.name.trim() || 'Holiday name'}
                    </p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {formatDate(form.date)} • {formatDay(form.date)}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={typeBadgeClass(form.type)}
                  >
                    {typeLabel(form.type)}
                  </Badge>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="border-t bg-muted/20 px-6 py-4">
            <Button
              variant="outline"
              disabled={saving}
              onClick={() => setDialogOpen(false)}
            >
              Cancel
            </Button>

            <Button
              onClick={() => void saveHoliday()}
              disabled={saving}
              className="bg-[#1e2a78] text-white hover:bg-[#16205f]"
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {form.id ? 'Save Changes' : 'Publish Holiday'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && !saving) {
            setDeleteTarget(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400">
              <Trash2 className="h-5 w-5" />
            </div>

            <DialogTitle>Remove Holiday?</DialogTitle>
          </DialogHeader>

          <div className="rounded-xl border bg-muted/30 p-4">
            <p className="font-semibold">
              {deleteTarget?.name || 'Selected holiday'}
            </p>
            {deleteTarget && (
              <p className="mt-1 text-sm text-muted-foreground">
                {formatDate(deleteTarget.date)} •{' '}
                {formatDay(deleteTarget.date)}
              </p>
            )}
          </div>

          <p className="text-sm leading-6 text-muted-foreground">
            This holiday will no longer appear in the published employee
            company calendar.
          </p>

          <DialogFooter>
            <Button
              variant="outline"
              disabled={saving}
              onClick={() => setDeleteTarget(null)}
            >
              Cancel
            </Button>

            <Button
              variant="destructive"
              disabled={saving}
              onClick={() => void deleteHoliday()}
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Remove Holiday
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function MetricCard({
  icon,
  eyebrow,
  title,
  value,
  description,
}: {
  icon: React.ReactNode
  eyebrow: string
  title: string
  value: string
  description: string
}) {
  return (
    <Card className="border shadow-sm transition-shadow hover:shadow-md">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {eyebrow}
            </p>
            <p className="mt-1 text-sm font-medium text-muted-foreground">
              {title}
            </p>
          </div>

          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1e2a78]/8 text-[#1e2a78] dark:bg-blue-950/30 dark:text-blue-300">
            {icon}
          </div>
        </div>

        <p className="mt-4 text-3xl font-bold tracking-tight">{value}</p>
        <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
          {description}
        </p>
      </CardContent>
    </Card>
  )
}

function CompositionItem({
  label,
  value,
  dotClass,
}: {
  label: string
  value: number
  dotClass: string
}) {
  return (
    <div className="rounded-xl border bg-muted/20 p-3.5">
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${dotClass}`} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </div>
  )
}

function HolidayActions({
  holiday,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  holiday: Holiday
  onEdit: (holiday: Holiday) => void
  onDuplicate: (holiday: Holiday) => void
  onDelete: (holiday: Holiday) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          aria-label={`Actions for ${holiday.name}`}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onClick={() => onEdit(holiday)}>
          <Edit3 className="mr-2 h-4 w-4" />
          Edit Holiday
        </DropdownMenuItem>

        <DropdownMenuItem onClick={() => onDuplicate(holiday)}>
          <Plus className="mr-2 h-4 w-4" />
          Duplicate
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          className="text-red-600 focus:text-red-600"
          onClick={() => onDelete(holiday)}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Delete Holiday
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function EmptyState({
  year,
  onCreate,
}: {
  year: number
  onCreate: () => void
}) {
  return (
    <div className="flex min-h-80 flex-col items-center justify-center p-8 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-[#1e2a78] dark:bg-blue-950/30 dark:text-blue-300">
        <CalendarDays className="h-7 w-7" />
      </div>

      <h3 className="mt-4 text-lg font-semibold">
        No holidays configured for {year}
      </h3>

      <p className="mt-1 max-w-md text-sm leading-6 text-muted-foreground">
        Publish the official company holidays for this year. They will then be
        available to employees through Company Calendar.
      </p>

      <Button
        onClick={onCreate}
        className="mt-5 bg-[#1e2a78] text-white hover:bg-[#16205f]"
      >
        <Plus className="mr-2 h-4 w-4" />
        Add First Holiday
      </Button>
    </div>
  )
}

function NoResults({ onClear }: { onClear: () => void }) {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center p-8 text-center">
      <Search className="h-8 w-8 text-muted-foreground/60" />
      <p className="mt-3 font-semibold">No matching holidays</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Change the search or filters to view more calendar entries.
      </p>
      <Button variant="outline" size="sm" className="mt-4" onClick={onClear}>
        Clear Filters
      </Button>
    </div>
  )
}

function YearCalendar({
  year,
  months,
  onHolidayClick,
}: {
  year: number
  months: Array<{
    monthName: string
    monthIndex: number
    holidays: Holiday[]
  }>
  onHolidayClick: (holiday: Holiday) => void
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {months.map((month) => (
        <MonthCalendar
          key={month.monthName}
          year={year}
          monthIndex={month.monthIndex}
          monthName={month.monthName}
          holidays={month.holidays}
          onHolidayClick={onHolidayClick}
        />
      ))}
    </div>
  )
}

function MonthCalendar({
  year,
  monthIndex,
  monthName,
  holidays,
  onHolidayClick,
}: {
  year: number
  monthIndex: number
  monthName: string
  holidays: Holiday[]
  onHolidayClick: (holiday: Holiday) => void
}) {
  const firstDay = new Date(year, monthIndex, 1)
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()
  const mondayBasedOffset = (firstDay.getDay() + 6) % 7
  const cells: Array<number | null> = []

  for (let index = 0; index < mondayBasedOffset; index += 1) {
    cells.push(null)
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(day)
  }

  while (cells.length % 7 !== 0) {
    cells.push(null)
  }

  const holidayMap = new Map<number, Holiday[]>()

  holidays.forEach((holiday) => {
    const day = Number(holiday.date.slice(8, 10))
    const existing = holidayMap.get(day) || []
    existing.push(holiday)
    holidayMap.set(day, existing)
  })

  const current = new Date()
  const isCurrentMonth =
    current.getFullYear() === year && current.getMonth() === monthIndex

  return (
    <div
      className={`rounded-xl border bg-background p-4 ${
        isCurrentMonth ? 'ring-1 ring-[#1e2a78]/20' : ''
      }`}
    >
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="font-semibold">{monthName}</p>
          <p className="text-xs text-muted-foreground">
            {holidays.length}{' '}
            {holidays.length === 1 ? 'holiday' : 'holidays'}
          </p>
        </div>

        {isCurrentMonth && (
          <Badge className="bg-[#1e2a78] text-white hover:bg-[#1e2a78]">
            Current
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {WEEK_DAYS.map((day) => (
          <div
            key={day}
            className="py-1 text-center text-[9px] font-semibold uppercase text-muted-foreground"
          >
            {day}
          </div>
        ))}

        {cells.map((day, index) => {
          if (!day) {
            return <div key={`empty-${index}`} className="aspect-square" />
          }

          const dayHolidays = holidayMap.get(day) || []
          const isToday =
            isCurrentMonth && current.getDate() === day

          return (
            <div
              key={day}
              className={`relative flex aspect-square min-h-9 items-center justify-center rounded-lg border border-transparent text-xs ${
                dayHolidays.length > 0
                  ? 'bg-blue-50 font-semibold text-[#1e2a78] dark:bg-blue-950/20 dark:text-blue-300'
                  : 'text-foreground'
              } ${
                isToday
                  ? 'border-[#1e2a78] ring-1 ring-[#1e2a78]/10'
                  : ''
              }`}
            >
              <span>{day}</span>

              {dayHolidays.length > 0 && (
                <button
                  type="button"
                  onClick={() => onHolidayClick(dayHolidays[0])}
                  className="absolute inset-0 rounded-lg"
                  title={dayHolidays.map((holiday) => holiday.name).join(', ')}
                  aria-label={dayHolidays.map((holiday) => holiday.name).join(', ')}
                />
              )}

              {dayHolidays.length > 0 && (
                <span
                  className={`absolute bottom-1 h-1.5 w-1.5 rounded-full ${holidayDotClass(
                    dayHolidays[0].type,
                  )}`}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
