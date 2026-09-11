import { format } from 'date-fns';

/**
 * Format an amount in Indian Rupees (INR) with standard Indian numbering convention.
 * e.g. ₹50,000 | ₹6,00,000 | ₹50,000.50
 */
export function formatINR(
  amount: number | string | null | undefined,
  options?: { showPaise?: boolean }
): string {
  if (amount === null || amount === undefined || amount === '') return '₹0';
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return '₹0';

  const hasPaise = options?.showPaise ?? (Math.abs(num % 1) > 0.001);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: hasPaise ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(num);
}

export function formatCurrency(amount: number): string {
  return formatINR(amount, { showPaise: true });
}

export function formatDate(date: Date | string): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return String(date);
  return format(d, 'dd MMM yyyy');
}

export function formatHumanDate(date: Date | string): string {
  if (!date) return 'Not provided';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return String(date);
  return format(d, 'dd MMMM yyyy');
}

export function formatPeriodRange(start: Date | string, end: Date | string): string {
  if (!start || !end) return '';
  const s = typeof start === 'string' ? new Date(start) : start;
  const e = typeof end === 'string' ? new Date(end) : end;
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return `${start} – ${end}`;
  return `${format(s, 'dd MMMM yyyy')} – ${format(e, 'dd MMMM yyyy')}`;
}

export function formatDateTime(date: Date | string): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return String(date);
  return format(d, 'dd MMM yyyy hh:mm a');
}

export function maskPAN(pan: string): string {
  if (!pan || pan === 'Not provided' || pan === '-') return 'Not provided';
  if (pan.includes('*')) return pan;
  if (pan.length !== 10) return pan;
  return '*****' + pan.substring(5, 9) + '*';
}

export function maskBankAccount(account: string): string {
  if (!account || account === 'Not provided' || account === '-') return 'Not provided';
  if (account.includes('*') || account.includes('X')) return account;
  if (account.length < 4) return account;
  return '*'.repeat(account.length - 4) + account.slice(-4);
}

export function maskEmail(email: string): string {
  if (!email) return email;
  const [localPart, domain] = email.split('@');
  if (!domain) return email;
  
  if (localPart.length <= 2) {
    return '*'.repeat(localPart.length) + '@' + domain;
  }
  
  return localPart[0] + '*'.repeat(localPart.length - 2) + localPart[localPart.length - 1] + '@' + domain;
}

export function formatEmployeeId(prefix: string, counter: number): string {
  return `${prefix}-${counter.toString().padStart(3, '0')}`;
}

export function getInitials(name: string): string {
  if (!name) return '';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].substring(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function pluralize(count: number, singular: string, plural?: string): string {
  if (count === 1) return singular;
  return plural || singular + 's';
}
