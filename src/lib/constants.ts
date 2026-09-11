export const APP_NAME = 'Haryak Technologies India Private Limited';
export const SHORT_COMPANY_NAME = 'Haryak Technologies';
export const COMPANY_NAME = 'Haryak Technologies India Private Limited';
export const COMPANY_TAGLINE = "Empowering Tomorrow's Solutions, Today";
export const COMPANY_WEBSITE = 'https://haryak.com';
export const PORTAL_TITLE = 'Employee & Administration Portal';

export const BRAND_COLORS = {
  primary: '#1e3a8a',
  secondary: '#2563eb',
  accent: '#3b82f6',
  background: '#ffffff',
  foreground: '#0f172a',
  muted: '#f1f5f9',
};

export enum ROLES {
  SUPER_ADMIN = 'SUPER_ADMIN',
  HR_ADMIN = 'HR_ADMIN',
  PAYROLL_ADMIN = 'PAYROLL_ADMIN',
  MANAGER = 'MANAGER',
  EMPLOYEE = 'EMPLOYEE',
}

export enum EMPLOYMENT_STATUS {
  ACTIVE = 'ACTIVE',
  PROBATION = 'PROBATION',
  CONFIRMED = 'CONFIRMED',
  NOTICE_PERIOD = 'NOTICE_PERIOD',
  EXITED = 'EXITED',
  RESIGNED = 'RESIGNED',
  TERMINATED = 'TERMINATED',
  ON_LEAVE = 'ON_LEAVE',
  INACTIVE = 'INACTIVE',
}

export enum EMPLOYMENT_TYPE {
  FULL_TIME = 'FULL_TIME',
  PART_TIME = 'PART_TIME',
  CONTRACT = 'CONTRACT',
  INTERN = 'INTERN',
}

export enum PAYROLL_STATUS {
  UPCOMING = 'UPCOMING',
  PREPARATION_OPEN = 'PREPARATION_OPEN',
  CALCULATING = 'CALCULATING',
  REVIEW_REQUIRED = 'REVIEW_REQUIRED',
  READY_FOR_APPROVAL = 'READY_FOR_APPROVAL',
  APPROVED = 'APPROVED',
  LOCKED = 'LOCKED',
  SCHEDULED_FOR_RELEASE = 'SCHEDULED_FOR_RELEASE',
  PUBLISHED = 'PUBLISHED',
  PAID = 'PAID',
  CLOSED = 'CLOSED',
  ERROR = 'ERROR',
}

export enum LEAVE_STATUS {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
}

export enum ATTENDANCE_STATUS {
  PRESENT = 'PRESENT',
  ABSENT = 'ABSENT',
  LATE = 'LATE',
  HALF_DAY = 'HALF_DAY',
  ON_LEAVE = 'ON_LEAVE',
}

export const DOCUMENT_TYPES = [
  'ID_PROOF',
  'ADDRESS_PROOF',
  'EDUCATIONAL_CERTIFICATE',
  'EXPERIENCE_LETTER',
  'RELIEVING_LETTER',
  'SALARY_SLIP',
  'BANK_STATEMENT',
  'TAX_DOCUMENT',
  'OTHER',
] as const;

export const ANNOUNCEMENT_CATEGORIES = [
  'GENERAL',
  'HR',
  'EVENT',
  'POLICY',
  'ACHIEVEMENT',
] as const;

export const NOTIFICATION_TYPES = [
  'LEAVE_REQUEST',
  'LEAVE_APPROVED',
  'LEAVE_REJECTED',
  'PAYSLIP_GENERATED',
  'ANNOUNCEMENT',
  'TASK_ASSIGNED',
  'SYSTEM',
] as const;

export enum APPROVAL_STATUS {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export const CURRENCY = '₹';
export const DATE_FORMAT = 'dd MMM yyyy';

export const ADMIN_SIDEBAR_NAV = [
  { label: 'Dashboard', href: '/admin/dashboard', icon: 'dashboard' },
  { label: 'Employees', href: '/admin/employees', icon: 'users' },
  { label: 'Leave', href: '/admin/leave', icon: 'calendar' },
  { label: 'Attendance', href: '/admin/attendance', icon: 'clock' },
  { label: 'Payroll', href: '/admin/payroll', icon: 'indian-rupee' },
  { label: 'Settings', href: '/admin/settings', icon: 'settings' },
];

export const EMPLOYEE_PORTAL_NAV = [
  { label: 'Dashboard', href: '/portal/dashboard', icon: 'dashboard' },
  { label: 'Profile', href: '/portal/profile', icon: 'user' },
  { label: 'Leave', href: '/portal/leave', icon: 'calendar' },
  { label: 'Attendance', href: '/portal/attendance', icon: 'clock' },
  { label: 'Payslips', href: '/portal/payslips', icon: 'file-text' },
];

export const PAYSLIP_EARNING_COMPONENTS = [
  'Basic Salary',
  'HRA',
  'Personal/Special Allowance',
  'Other Allowance',
  'City/Location Allowance',
  'Conveyance Allowance',
  'Performance Pay/Incentive',
] as const;

export const PAYSLIP_DEDUCTION_COMPONENTS = [
  'Provident Fund (PF)',
  'Professional Tax (PT)',
  'Income Tax (TDS)',
  'Other Deductions',
] as const;
