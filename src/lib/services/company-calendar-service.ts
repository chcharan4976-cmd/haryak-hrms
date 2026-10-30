/**
 * Haryak Technologies India Private Limited
 * Canonical Company Calendar & Working-Day Calculation Service
 *
 * Single source of truth for:
 * - Monthly working day calculation (excluding weekends and public holidays)
 * - Company Calendar public/company holiday resolution
 * - Consistent working day schedule across Timesheet, Attendance, Leave, and Payroll
 */

import { createAdminClient } from '@/lib/supabase/admin'

export interface CompanyHoliday {
  id?: string
  date: string
  name: string
  type: string
}

export interface MonthlyCalendarDetails {
  year: number
  month: number
  calendarDays: number
  workingDays: number
  workingDates: string[]
  weekendDates: string[]
  holidayDates: string[]
  holidays: CompanyHoliday[]
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

export function getDaysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

export function toDateString(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`
}

export function getDayOfWeekFromIso(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

export function isWeekendIso(dateStr: string): boolean {
  const day = getDayOfWeekFromIso(dateStr)
  return day === 0 || day === 6
}

/**
 * Calculates the canonical working days and company calendar for a given month and company.
 *
 * Rules:
 * 1. Saturdays (day 6) are non-working days by default.
 * 2. Sundays (day 0) are non-working days.
 * 3. Public and company holidays in the company calendar are automatically excluded.
 * 4. Only remaining eligible dates become monthly working days.
 * 5. Handles 28, 29, 30, and 31 day months dynamically.
 */
export async function getCompanyMonthlyCalendar(
  companyId: string,
  year: number,
  month: number
): Promise<MonthlyCalendarDetails> {
  const calendarDays = getDaysInMonth(year, month)
  const monthStart = `${year}-${pad2(month)}-01`
  const monthEnd = `${year}-${pad2(month)}-${pad2(calendarDays)}`

  const holidays: CompanyHoliday[] = []
  const holidayDateSet = new Set<string>()

  // Fetch company holidays from public.holidays table
  const supabase = createAdminClient()
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(companyId)
  if (supabase && companyId && isUuid) {
    const { data: dbHolidays, error } = await supabase
      .from('holidays')
      .select('id, date, name, type, is_active')
      .eq('company_id', companyId)
      .gte('date', monthStart)
      .lte('date', monthEnd)
      .eq('is_active', true)
      .order('date', { ascending: true })

    if (error) {
      console.warn('[CompanyCalendarService] Error fetching holidays:', error.message)
    } else if (dbHolidays) {
      for (const h of dbHolidays) {
        const dateStr = String(h.date).slice(0, 10)
        // Public and company-wide declared holidays are excluded from working days
        const holidayType = String(h.type || 'public').toLowerCase()
        if (holidayType === 'public' || holidayType === 'company') {
          holidays.push({
            id: h.id,
            date: dateStr,
            name: h.name || 'Company Holiday',
            type: holidayType,
          })
          holidayDateSet.add(dateStr)
        }
      }
    }
  }

  const workingDates: string[] = []
  const weekendDates: string[] = []
  const holidayDates: string[] = []

  for (let day = 1; day <= calendarDays; day++) {
    const dateStr = toDateString(year, month, day)
    const isWeekend = isWeekendIso(dateStr)
    const isHoliday = holidayDateSet.has(dateStr)

    if (isWeekend) {
      weekendDates.push(dateStr)
    } else if (isHoliday) {
      holidayDates.push(dateStr)
    } else {
      workingDates.push(dateStr)
    }
  }

  return {
    year,
    month,
    calendarDays,
    workingDays: workingDates.length,
    workingDates,
    weekendDates,
    holidayDates,
    holidays,
  }
}

/**
 * Fetches all official company calendar public and company holidays for the entire calendar year.
 * These are paid company holidays that are separate from employee annual leave.
 */
export async function getCompanyAnnualHolidays(
  companyId: string,
  year: number
): Promise<CompanyHoliday[]> {
  const holidays: CompanyHoliday[] = []
  const supabase = createAdminClient()
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(companyId)

  if (supabase && companyId && isUuid) {
    const { data: dbHolidays, error } = await supabase
      .from('holidays')
      .select('id, date, name, type, is_active')
      .eq('company_id', companyId)
      .gte('date', `${year}-01-01`)
      .lte('date', `${year}-12-31`)
      .eq('is_active', true)
      .order('date', { ascending: true })

    if (error) {
      console.warn('[CompanyCalendarService] Error fetching annual holidays:', error.message)
    } else if (dbHolidays) {
      for (const h of dbHolidays) {
        const dateStr = String(h.date).slice(0, 10)
        const holidayType = String(h.type || 'public').toLowerCase()
        if (holidayType === 'public' || holidayType === 'company') {
          holidays.push({
            id: h.id,
            date: dateStr,
            name: h.name || 'Company Holiday',
            type: holidayType,
          })
        }
      }
    }
  }

  return holidays
}
