export interface Company {
  id: string;
  name: string;
  registration_number: string;
  pan: string;
  tan: string;
  gstin?: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
  created_at: Date;
  updated_at: Date;
}

export interface CompanySettings {
  id: string;
  company_id: string;
  financial_year_start_month: number;
  timezone: string;
  date_format: string;
  currency: string;
  created_at: Date;
  updated_at: Date;
}

export interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface Role {
  id: string;
  name: string;
  description: string;
  created_at: Date;
}

export interface Permission {
  id: string;
  module: string;
  action: string;
  created_at: Date;
}

export interface UserRole {
  user_id: string;
  role_id: string;
  created_at: Date;
}

export interface Employee {
  id: string;
  user_id: string;
  employee_code: string;
  first_name: string;
  last_name: string;
  full_name: string;
  gender: string;
  date_of_birth: Date;
  personal_email: string;
  official_email: string;
  phone: string;
  joining_date: Date;
  employment_status: string;
  employment_type: string;
  probation_end_date?: Date;
  confirmation_date?: Date;
  notice_period_days: number;
  last_working_date?: Date;
  resignation_date?: Date;
  exit_reason?: string;
  department_id?: string;
  designation_id?: string;
  location_id?: string;
  reporting_manager_id?: string;
  current_address?: string;
  permanent_address?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  emergency_contact_relation?: string;
  profile_image_url?: string;
  created_at: Date;
  updated_at: Date;
  deleted_at?: Date;
}

export interface EmployeeBankAccount {
  id: string;
  employee_id: string;
  bank_name: string;
  account_holder_name: string;
  account_number: string;
  ifsc_code: string;
  branch_name: string;
  is_primary: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface EmployeeStatutoryDetails {
  id: string;
  employee_id: string;
  pan: string;
  pf_applicable: boolean;
  pf_number?: string;
  uan_number?: string;
  esi_applicable: boolean;
  esi_number?: string;
  pt_applicable: boolean;
  tax_regime: 'OLD' | 'NEW';
  created_at: Date;
  updated_at: Date;
}

export interface Department {
  id: string;
  name: string;
  code: string;
  head_id?: string;
  parent_id?: string;
  created_at: Date;
  updated_at: Date;
}

export interface Designation {
  id: string;
  name: string;
  code: string;
  level: number;
  department_id?: string;
  created_at: Date;
  updated_at: Date;
}

export interface Location {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  country: string;
  pincode: string;
  created_at: Date;
  updated_at: Date;
}

export interface SalaryComponent {
  id: string;
  name: string;
  code: string;
  type: 'earning' | 'deduction';
  category?: string;
  is_taxable: boolean;
  is_statutory: boolean;
  is_recurring: boolean;
  show_on_payslip: boolean;
  part_of_ctc: boolean;
  default_formula?: string;
  default_amount?: number;
  sort_order: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface SalaryStructure {
  id: string;
  employee_id: string;
  annual_ctc: number;
  monthly_gross: number;
  effective_from: Date;
  effective_until?: Date;
  status: string;
  revision_id?: string;
  approved_by?: string;
  notes?: string;
  created_at: Date;
  updated_at: Date;
}

export interface SalaryStructureComponent {
  id: string;
  salary_structure_id: string;
  component_id: string;
  annual_amount: number;
  monthly_amount: number;
  formula?: string;
  calculation_type: 'FLAT' | 'PERCENTAGE';
  percentage_of?: string;
  percentage_value?: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface SalaryRevision {
  id: string;
  employee_id: string;
  structure_id: string;
  annual_ctc: number;
  effective_from: Date;
  effective_to?: Date;
  reason: string;
  status: string;
  created_at: Date;
  updated_at: Date;
}

export interface PayrollSettings {
  id: string;
  company_id: string;
  payroll_frequency: string;
  cycle_start_day: number;
  cycle_end_day: number;
  cutoff_day: number;
  payment_day: number;
  pf_employer_contribution_rate: number;
  pf_employee_contribution_rate: number;
  pf_wage_ceiling: number;
  pf_admin_charge_rate: number;
  pf_edli_rate: number;
  esi_employee_rate: number;
  esi_employer_rate: number;
  esi_wage_ceiling: number;
  rounding_method: string;
  auto_generate_payslips: boolean;
  payslip_release_day: number;
  created_at: Date;
  updated_at: Date;
}

export interface StatutoryRule {
  id: string;
  rule_type: 'pf' | 'pt' | 'tds' | 'esi';
  rule_name: string;
  state?: string;
  config: Record<string, any>;
  effective_from: Date;
  effective_until?: Date;
  is_active: boolean;
  notes?: string;
  created_at: Date;
  updated_at: Date;
}

export interface PayrollPeriod {
  id: string;
  company_id: string;
  period_month: number;
  period_year: number;
  start_date: Date;
  end_date: Date;
  payment_date?: Date;
  calendar_days: number;
  working_days: number;
  status: string;
  created_at: Date;
  updated_at: Date;
}

export interface PayrollRun {
  id: string;
  period_id: string;
  status: string;
  processed_by: string;
  approved_by?: string;
  total_gross_pay: number;
  total_deductions: number;
  total_net_pay: number;
  employee_count: number;
  created_at: Date;
  updated_at: Date;
}

export interface PayrollEmployeeRecord {
  id: string;
  run_id: string;
  employee_id: string;
  employee_code: string;
  employee_name: string;
  department_name?: string;
  designation_name?: string;
  salary_structure_id: string;
  annual_ctc: number;
  monthly_gross_entitlement: number;
  paid_days: number;
  lop_days: number;
  gross_earnings: number;
  total_deductions: number;
  net_salary: number;
  status: string;
  warnings?: string[];
  errors?: string[];
  calculation_details?: Record<string, any>;
  payment_mode?: string;
  created_at: Date;
  updated_at: Date;
}

export interface PayrollEarning {
  id: string;
  record_id: string;
  component_id: string;
  amount: number;
  created_at: Date;
}

export interface PayrollDeduction {
  id: string;
  record_id: string;
  component_id: string;
  amount: number;
  created_at: Date;
}

export interface Payslip {
  id: string;
  record_id: string;
  employee_id: string;
  period_month: number;
  period_year: number;
  pay_period_start: Date;
  pay_period_end: Date;
  gross_amount: number;
  deduction_amount: number;
  net_salary: number;
  amount_in_words: string;
  status: string;
  snapshot_data: Record<string, any>;
  pdf_url?: string;
  pdf_generation_status: string;
  filename?: string;
  created_at: Date;
  updated_at: Date;
}

export interface AttendanceRecord {
  id: string;
  employee_id: string;
  date: Date;
  check_in?: Date;
  check_out?: Date;
  status: string;
  work_hours: number;
  created_at: Date;
  updated_at: Date;
}

export interface LeaveType {
  id: string;
  name: string;
  code: string;
  is_paid: boolean;
  yearly_quota: number;
  created_at: Date;
  updated_at: Date;
}

export interface LeaveBalance {
  id: string;
  employee_id: string;
  leave_type_id: string;
  year: number;
  allocated: number;
  used: number;
  balance: number;
  created_at: Date;
  updated_at: Date;
}

export interface LeaveRequest {
  id: string;
  employee_id: string;
  leave_type_id: string;
  start_date: Date;
  end_date: Date;
  days: number;
  reason: string;
  status: string;
  approver_id?: string;
  approver_remarks?: string;
  created_at: Date;
  updated_at: Date;
}

export interface Holiday {
  id: string;
  name: string;
  date: Date;
  type: string;
  location_id?: string;
  created_at: Date;
  updated_at: Date;
}

export interface Document {
  id: string;
  employee_id?: string;
  type: string;
  name: string;
  file_url: string;
  uploaded_by: string;
  created_at: Date;
  updated_at: Date;
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  category: string;
  author_id: string;
  is_published: boolean;
  published_at?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  link?: string;
  created_at: Date;
}

export interface ApprovalRequest {
  id: string;
  type: string;
  reference_id: string;
  requester_id: string;
  approver_id: string;
  status: string;
  remarks?: string;
  created_at: Date;
  updated_at: Date;
}

export interface AuditLog {
  id: string;
  user_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  details: Record<string, any>;
  ip_address?: string;
  user_agent?: string;
  created_at: Date;
}

export interface PaginatedResponse<T> {
  data: T[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    total_pages: number;
  };
}

export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data?: T;
  error?: any;
}

export interface SelectOption {
  label: string;
  value: string;
  disabled?: boolean;
}
