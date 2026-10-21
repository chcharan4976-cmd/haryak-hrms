/**
 * Haryak Technologies India Private Limited
 * Canonical date/time formatting utilities.
 *
 * Database timestamps remain UTC/TIMESTAMPTZ.
 * User-facing timestamps are rendered in Indian Standard Time.
 */

export const COMPANY_TIME_ZONE = 'Asia/Kolkata'

export function formatIndiaTime(
  value: string | Date | null | undefined,
): string {
  if (!value) return '-'

  const date =
    value instanceof Date
      ? value
      : new Date(value)

  if (Number.isNaN(date.getTime())) {
    return '-'
  }

  return new Intl.DateTimeFormat('en-IN', {
    timeZone: COMPANY_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(date)
}

export function formatIndiaDate(
  value: string | Date | null | undefined,
): string {
  if (!value) return '-'

  const date =
    value instanceof Date
      ? value
      : new Date(value)

  if (Number.isNaN(date.getTime())) {
    return '-'
  }

  return new Intl.DateTimeFormat('en-IN', {
    timeZone: COMPANY_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}

export function formatIndiaDateTime(
  value: string | Date | null | undefined,
): string {
  if (!value) return '-'

  const date =
    value instanceof Date
      ? value
      : new Date(value)

  if (Number.isNaN(date.getTime())) {
    return '-'
  }

  return new Intl.DateTimeFormat('en-IN', {
    timeZone: COMPANY_TIME_ZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(date)
}

/**
 * Returns today's YYYY-MM-DD value according to India time.
 *
 * Important for attendance, leave and payroll date boundaries:
 * do not use new Date().toISOString().split('T')[0] for an
 * India-based business because that represents the UTC date.
 */
export function getIndiaDateString(
  value: Date = new Date(),
): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: COMPANY_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value)

  const year =
    parts.find((part) => part.type === 'year')?.value

  const month =
    parts.find((part) => part.type === 'month')?.value

  const day =
    parts.find((part) => part.type === 'day')?.value

  if (!year || !month || !day) {
    throw new Error(
      'Unable to determine current India date.',
    )
  }

  return `${year}-${month}-${day}`
}

export function getIndiaMonthYear(
  value: Date = new Date(),
): {
  month: number
  year: number
} {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: COMPANY_TIME_ZONE,
    year: 'numeric',
    month: 'numeric',
  }).formatToParts(value)

  const month = Number(
    parts.find((part) => part.type === 'month')?.value,
  )

  const year = Number(
    parts.find((part) => part.type === 'year')?.value,
  )

  if (
    !Number.isInteger(month) ||
    !Number.isInteger(year)
  ) {
    throw new Error(
      'Unable to determine current India month/year.',
    )
  }

  return {
    month,
    year,
  }
}