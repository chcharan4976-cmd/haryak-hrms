-- ============================================================

-- HARYAK ONE — Enterprise HRMS Database Schema

-- Haryak Technologies India Private Limited

-- ============================================================

-- IMPORTANT: Statutory payroll settings must be validated by

-- the company's authorized payroll/accounting professional.

-- ============================================================



-- Enable UUID extension

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE EXTENSION IF NOT EXISTS "pgcrypto";



-- ============================================================

-- CORE: Companies & Settings

-- ============================================================



CREATE TABLE companies (

  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  name VARCHAR(255) NOT NULL,

  legal_name VARCHAR(255),

  logo_url TEXT,

  website VARCHAR(255),

  email VARCHAR(255),

  phone VARCHAR(50),

  address_line1 TEXT,

  address_line2 TEXT,

  city VARCHAR(100),

  state VARCHAR(100),

  pincode VARCHAR(10),

  country VARCHAR(100) DEFAULT 'India',

  gstin VARCHAR(20),

  cin VARCHAR(25),

  pan VARCHAR(15),

  fiscal_year_start INTEGER DEFAULT 4, -- April

  currency VARCHAR(5) DEFAULT 'INR',

  timezone VARCHAR(50) DEFAULT 'Asia/Kolkata',

  date_format VARCHAR(20) DEFAULT 'DD/MM/YYYY',

  employee_id_prefix VARCHAR(10) DEFAULT 'HRK',

  employee_id_counter INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  updated_at TIMESTAMPTZ DEFAULT NOW()

);



CREATE TABLE company_settings (

  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  company_id UUID NOT NULL REFERENCES companies(id),

  setting_key VARCHAR(100) NOT NULL,

  setting_value JSONB NOT NULL DEFAULT '{}',

  category VARCHAR(50) NOT NULL DEFAULT 'general',

  created_at TIMESTAMPTZ DEFAULT NOW(),

  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(company_id, setting_key)

);



-- ============================================================

-- AUTH: Users, Roles, Permissions

-- ============================================================



CREATE TABLE roles (

  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  company_id UUID NOT NULL REFERENCES companies(id),

  name VARCHAR(50) NOT NULL,

  display_name VARCHAR(100) NOT NULL,

  description TEXT,

  is_system BOOLEAN DEFAULT FALSE,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(company_id, name)

);



CREATE TABLE permissions (

  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  module VARCHAR(50) NOT NULL,

  action VARCHAR(50) NOT NULL,

  description TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(module, action)

);



CREATE TABLE role_permissions (

  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,

  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(role_id, permission_id)

);



CREATE TABLE users (

  id UUID PRIMARY KEY, -- matches Supabase auth.users.id

  company_id UUID NOT NULL REFERENCES companies(id),

  employee_id UUID, -- linked after employee creation

  email VARCHAR(255) NOT NULL UNIQUE,

  full_name VARCHAR(255) NOT NULL,

  avatar_url TEXT,

  is_active BOOLEAN DEFAULT TRUE,

  failed_login_attempts INTEGER DEFAULT 0,

  locked_until TIMESTAMPTZ,

  last_login_at TIMESTAMPTZ,

  password_changed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  updated_at TIMESTAMPTZ DEFAULT NOW()

);



CREATE TABLE user_roles (

  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,

  assigned_by UUID REFERENCES users(id),

  assigned_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, role_id)

);



-- ============================================================

-- ORGANIZATION: Departments, Designations, Locations

-- ============================================================



CREATE TABLE departments (

  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  company_id UUID NOT NULL REFERENCES companies(id),

  name VARCHAR(100) NOT NULL,

  code VARCHAR(20),

  description TEXT,

  head_employee_id UUID, -- FK added after employees table

  parent_department_id UUID REFERENCES departments(id),

  is_active BOOLEAN DEFAULT TRUE,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(company_id, name)

);



CREATE TABLE designations (

  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  company_id UUID NOT NULL REFERENCES companies(id),

  name VARCHAR(100) NOT NULL,

  level INTEGER,

  description TEXT,

  is_active BOOLEAN DEFAULT TRUE,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(company_id, name)

);



CREATE TABLE locations (

  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  company_id UUID NOT NULL REFERENCES companies(id),

  name VARCHAR(100) NOT NULL,

  address TEXT,

  city VARCHAR(100),

  state VARCHAR(100),

  pincode VARCHAR(10),

  is_active BOOLEAN DEFAULT TRUE,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  updated_at TIMESTAMPTZ DEFAULT NOW()

);



-- ============================================================

-- EMPLOYEES

-- ============================================================



CREATE TABLE employees (

  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  company_id UUID NOT NULL REFERENCES companies(id),

  user_id UUID REFERENCES users(id),

  employee_code VARCHAR(20) NOT NULL, -- HRK-001



  -- Personal

  first_name VARCHAR(100) NOT NULL,

  last_name VARCHAR(100),

  full_name VARCHAR(255) NOT NULL,

  gender VARCHAR(20),

  date_of_birth DATE,

  profile_image_url TEXT,



  -- Contact

  official_email VARCHAR(255) NOT NULL,

  personal_email VARCHAR(255),

  phone VARCHAR(20),

  emergency_contact_name VARCHAR(255),

  emergency_contact_phone VARCHAR(20),

  emergency_contact_relationship VARCHAR(50),



  -- Address

  current_address TEXT,

  current_city VARCHAR(100),

  current_state VARCHAR(100),

  current_pincode VARCHAR(10),

  permanent_address TEXT,

  permanent_city VARCHAR(100),

  permanent_state VARCHAR(100),

  permanent_pincode VARCHAR(10),



  -- Employment

  department_id UUID REFERENCES departments(id),

  designation_id UUID REFERENCES designations(id),

  location_id UUID REFERENCES locations(id),

  reporting_manager_id UUID REFERENCES employees(id),

  employment_type VARCHAR(30) DEFAULT 'full_time', -- full_time, part_time, contract, intern

  employment_status VARCHAR(30) DEFAULT 'active', -- active, probation, notice, resigned, terminated, absconding



  joining_date DATE NOT NULL,

  probation_end_date DATE,

  confirmation_date DATE,

  notice_period_days INTEGER DEFAULT 30,

  last_working_date DATE,

  resignation_date DATE,

  exit_reason TEXT,



  -- Metadata

  is_active BOOLEAN DEFAULT TRUE,

  created_by UUID REFERENCES users(id),

  created_at TIMESTAMPTZ DEFAULT NOW(),

  updated_at TIMESTAMPTZ DEFAULT NOW(),

  deleted_at TIMESTAMPTZ, -- soft delete



  UNIQUE(company_id, employee_code),

  UNIQUE(company_id, official_email)

);



-- Add FK from departments to employees for head

ALTER TABLE departments ADD CONSTRAINT fk_dept_head 

  FOREIGN KEY (head_employee_id) REFERENCES employees(id);



-- Add FK from users to employees

ALTER TABLE users ADD CONSTRAINT fk_user_employee 

  FOREIGN KEY (employee_id) REFERENCES employees(id);



-- ============================================================

-- EMPLOYEE: Bank & Statutory

-- ============================================================



CREATE TABLE employee_bank_accounts (

  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,

  bank_name VARCHAR(100),

  branch_name VARCHAR(200),

  account_holder_name VARCHAR(255),

  account_number_encrypted TEXT, -- encrypted

  account_number_masked VARCHAR(20), -- \*\*\*\*\*\*\*\*4931

  ifsc_code VARCHAR(15),

  is_primary BOOLEAN DEFAULT TRUE,

  is_active BOOLEAN DEFAULT TRUE,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  updated_at TIMESTAMPTZ DEFAULT NOW()

);



CREATE TABLE employee_statutory_details (

  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  employee_id UUID NOT NULL UNIQUE REFERENCES employees(id) ON DELETE CASCADE,



  -- PAN

  pan_encrypted TEXT,

  pan_masked VARCHAR(15), -- \*\*\*\*\*1234\*



  -- PF

  pf_applicable BOOLEAN DEFAULT TRUE,

  uan_number VARCHAR(20),

  pf_number VARCHAR(30),

  pf_joining_date DATE,



  -- ESI

  esi_applicable BOOLEAN DEFAULT FALSE,

  esi_number VARCHAR(20),



  -- PT

  pt_applicable BOOLEAN DEFAULT TRUE,

  pt_state VARCHAR(50),



  -- Tax

  tax_regime VARCHAR(20) DEFAULT 'new', -- old, new



  created_at TIMESTAMPTZ DEFAULT NOW(),

  updated_at TIMESTAMPTZ DEFAULT NOW()

);



-- ============================================================

-- COMPENSATION: Salary Components & Structures

-- ============================================================



CREATE TABLE salary_components (

  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  company_id UUID NOT NULL REFERENCES companies(id),

  name VARCHAR(100) NOT NULL,

  code VARCHAR(30) NOT NULL,

  type VARCHAR(20) NOT NULL, -- earning, deduction

  category VARCHAR(50), -- basic, hra, allowance, statutory, custom

  description TEXT,



  is_taxable BOOLEAN DEFAULT TRUE,

  is_recurring BOOLEAN DEFAULT TRUE,

  is_statutory BOOLEAN DEFAULT FALSE,

  show_on_payslip BOOLEAN DEFAULT TRUE,



  default_formula TEXT, -- e.g., '0.4 \* CTC' or fixed amount

  default_amount DECIMAL(15,2),



  sort_order INTEGER DEFAULT 0,

  is_active BOOLEAN DEFAULT TRUE,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(company_id, code)

);



CREATE TABLE salary_structures (

  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  company_id UUID NOT NULL REFERENCES companies(id),

  employee_id UUID NOT NULL REFERENCES employees(id),



  annual_ctc DECIMAL(15,2) NOT NULL,

  monthly_gross DECIMAL(15,2) NOT NULL,



  effective_from DATE NOT NULL,

  effective_until DATE,



  status VARCHAR(20) DEFAULT 'active', -- draft, active, superseded, inactive

  revision_id UUID, -- FK added after salary_revisions



  approved_by UUID REFERENCES users(id),

  approved_at TIMESTAMPTZ,



  notes TEXT,

  created_by UUID REFERENCES users(id),

  created_at TIMESTAMPTZ DEFAULT NOW(),

  updated_at TIMESTAMPTZ DEFAULT NOW()

);



CREATE TABLE salary_structure_components (

  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  salary_structure_id UUID NOT NULL REFERENCES salary_structures(id) ON DELETE CASCADE,

  component_id UUID NOT NULL REFERENCES salary_components(id),



  annual_amount DECIMAL(15,2) NOT NULL DEFAULT 0,

  monthly_amount DECIMAL(15,2) NOT NULL DEFAULT 0,



  formula TEXT,

  calculation_type VARCHAR(20) DEFAULT 'fixed', -- fixed, percentage, formula

  percentage_of VARCHAR(50), -- base component reference

  percentage_value DECIMAL(8,4),



  is_active BOOLEAN DEFAULT TRUE,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(salary_structure_id, component_id)

);



CREATE TABLE salary_revisions (

  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  company_id UUID NOT NULL REFERENCES companies(id),

  employee_id UUID NOT NULL REFERENCES employees(id),



  old_salary_structure_id UUID REFERENCES salary_structures(id),

  new_salary_structure_id UUID REFERENCES salary_structures(id),



  old_ctc DECIMAL(15,2),

  new_ctc DECIMAL(15,2),

  increment_amount DECIMAL(15,2),

  increment_percentage DECIMAL(8,4),



  effective_date DATE NOT NULL,

  reason TEXT,



  status VARCHAR(20) DEFAULT 'draft', -- draft, pending_approval, approved, rejected, activated



  requested_by UUID REFERENCES users(id),

  approved_by UUID REFERENCES users(id),

  approved_at TIMESTAMPTZ,

  rejection_reason TEXT,



  letter_document_id UUID, -- FK to documents



  created_at TIMESTAMPTZ DEFAULT NOW(),

  updated_at TIMESTAMPTZ DEFAULT NOW()

);



-- Add FK from salary_structures to salary_revisions

ALTER TABLE salary_structures ADD CONSTRAINT fk_salary_revision 

  FOREIGN KEY (revision_id) REFERENCES salary_revisions(id);



-- ============================================================

-- PAYROLL: Settings, Rules, Periods, Runs

-- ============================================================



CREATE TABLE payroll_settings (

  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  company_id UUID NOT NULL UNIQUE REFERENCES companies(id),



  payroll_frequency VARCHAR(20) DEFAULT 'monthly',

  cycle_start_day INTEGER DEFAULT 1,

  cycle_end_day INTEGER DEFAULT 0, -- 0 = last day

  cutoff_day INTEGER DEFAULT 25,

  payment_day INTEGER DEFAULT 1,



  pf_employer_contribution_rate DECIMAL(6,4) DEFAULT 12.00,

  pf_employee_contribution_rate DECIMAL(6,4) DEFAULT 12.00,

  pf_wage_ceiling DECIMAL(15,2) DEFAULT 15000.00,

  pf_admin_charge_rate DECIMAL(6,4) DEFAULT 0.50,

  pf_edli_rate DECIMAL(6,4) DEFAULT 0.50,



  esi_employee_rate DECIMAL(6,4) DEFAULT 0.75,

  esi_employer_rate DECIMAL(6,4) DEFAULT 3.25,

  esi_wage_ceiling DECIMAL(15,2) DEFAULT 21000.00,



  rounding_method VARCHAR(20) DEFAULT 'round', -- round, floor, ceil



  auto_generate_payslips BOOLEAN DEFAULT FALSE,

  payslip_release_day INTEGER DEFAULT 1,



  created_at TIMESTAMPTZ DEFAULT NOW(),

  updated_at TIMESTAMPTZ DEFAULT NOW()

);



CREATE TABLE statutory_rules (

  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  company_id UUID NOT NULL REFERENCES companies(id),



  rule_type VARCHAR(30) NOT NULL, -- pf, pt, tds, esi

  rule_name VARCHAR(100) NOT NULL,

  state VARCHAR(50), -- for PT which varies by state



  config JSONB NOT NULL DEFAULT '{}',

  -- PT config example: {"slabs": [{"from": 0, "to": 10000, "amount": 0}, {"from": 10001, "to": 15000, "amount": 150}]}



  effective_from DATE NOT NULL,

  effective_until DATE,



  is_active BOOLEAN DEFAULT TRUE,

  notes TEXT,



  created_by UUID REFERENCES users(id),

  created_at TIMESTAMPTZ DEFAULT NOW(),

  updated_at TIMESTAMPTZ DEFAULT NOW()

);



CREATE TABLE payroll_periods (

  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  company_id UUID NOT NULL REFERENCES companies(id),



  period_month INTEGER NOT NULL, -- 1-12

  period_year INTEGER NOT NULL,



  start_date DATE NOT NULL,

  end_date DATE NOT NULL,



  calendar_days INTEGER NOT NULL,

  working_days INTEGER NOT NULL,



  status VARCHAR(30) DEFAULT 'upcoming',

  -- upcoming, open, processing, review, closed



  opened_at TIMESTAMPTZ,

  closed_at TIMESTAMPTZ,



  created_at TIMESTAMPTZ DEFAULT NOW(),

  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(company_id, period_month, period_year)

);



CREATE TABLE payroll_runs (

  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  company_id UUID NOT NULL REFERENCES companies(id),

  payroll_period_id UUID NOT NULL REFERENCES payroll_periods(id),



  run_number INTEGER DEFAULT 1,

  run_type VARCHAR(20) DEFAULT 'regular', -- regular, supplementary, arrears



  status VARCHAR(30) DEFAULT 'draft',

  -- draft, data_collection, calculating, review, approval_pending, 

  -- approved, locked, payslips_generated, paid, closed



  total_employees INTEGER DEFAULT 0,

  total_gross DECIMAL(15,2) DEFAULT 0,

  total_deductions DECIMAL(15,2) DEFAULT 0,

  total_net DECIMAL(15,2) DEFAULT 0,



  calculated_at TIMESTAMPTZ,

  calculated_by UUID REFERENCES users(id),



  reviewed_at TIMESTAMPTZ,

  reviewed_by UUID REFERENCES users(id),



  approved_at TIMESTAMPTZ,

  approved_by UUID REFERENCES users(id),



  locked_at TIMESTAMPTZ,

  locked_by UUID REFERENCES users(id),



  unlock_reason TEXT,

  unlocked_at TIMESTAMPTZ,

  unlocked_by UUID REFERENCES users(id),



  payslips_generated_at TIMESTAMPTZ,

  paid_at TIMESTAMPTZ,

  payment_reference TEXT,



  notes TEXT,

  created_by UUID REFERENCES users(id),

  created_at TIMESTAMPTZ DEFAULT NOW(),

  updated_at TIMESTAMPTZ DEFAULT NOW()

);



CREATE TABLE payroll_employee_records (

  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  payroll_run_id UUID NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,

  employee_id UUID NOT NULL REFERENCES employees(id),



  -- Snapshot data (immutable after lock)

  employee_code VARCHAR(20) NOT NULL,

  employee_name VARCHAR(255) NOT NULL,

  department_name VARCHAR(100),

  designation_name VARCHAR(100),

  joining_date DATE,



  salary_structure_id UUID REFERENCES salary_structures(id),

  annual_ctc DECIMAL(15,2),

  monthly_gross_entitlement DECIMAL(15,2),



  -- Days

  calendar_days INTEGER NOT NULL,

  working_days INTEGER NOT NULL,

  paid_days DECIMAL(5,2) NOT NULL,

  lop_days DECIMAL(5,2) DEFAULT 0,



  -- Totals

  gross_earnings DECIMAL(15,2) NOT NULL DEFAULT 0,

  total_deductions DECIMAL(15,2) NOT NULL DEFAULT 0,

  net_salary DECIMAL(15,2) NOT NULL DEFAULT 0,



  -- Status

  status VARCHAR(20) DEFAULT 'calculated',

  -- calculated, reviewed, approved, error



  warnings JSONB DEFAULT '[]',

  errors JSONB DEFAULT '[]',



  calculation_details JSONB DEFAULT '{}',



  payment_mode VARCHAR(30) DEFAULT 'bank_transfer',



  created_at TIMESTAMPTZ DEFAULT NOW(),

  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(payroll_run_id, employee_id)

);



CREATE TABLE payroll_earnings (

  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  payroll_employee_record_id UUID NOT NULL REFERENCES payroll_employee_records(id) ON DELETE CASCADE,



  component_id UUID REFERENCES salary_components(id),

  component_name VARCHAR(100) NOT NULL,

  component_code VARCHAR(30) NOT NULL,



  monthly_entitlement DECIMAL(15,2) NOT NULL DEFAULT 0,

  paid_day_factor DECIMAL(8,6) DEFAULT 1.0,

  adjustment DECIMAL(15,2) DEFAULT 0,

  final_amount DECIMAL(15,2) NOT NULL DEFAULT 0,



  is_taxable BOOLEAN DEFAULT TRUE,

  sort_order INTEGER DEFAULT 0,



  calculation_breakdown JSONB DEFAULT '{}',



  created_at TIMESTAMPTZ DEFAULT NOW()

);



CREATE TABLE payroll_deductions (

  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  payroll_employee_record_id UUID NOT NULL REFERENCES payroll_employee_records(id) ON DELETE CASCADE,



  component_id UUID REFERENCES salary_components(id),

  component_name VARCHAR(100) NOT NULL,

  component_code VARCHAR(30) NOT NULL,



  amount DECIMAL(15,2) NOT NULL DEFAULT 0,



  is_statutory BOOLEAN DEFAULT FALSE,

  sort_order INTEGER DEFAULT 0,



  calculation_breakdown JSONB DEFAULT '{}',



  created_at TIMESTAMPTZ DEFAULT NOW()

);



-- ============================================================

-- PAYSLIPS

-- ============================================================



CREATE TABLE payslips (

  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  company_id UUID NOT NULL REFERENCES companies(id),

  employee_id UUID NOT NULL REFERENCES employees(id),

  payroll_run_id UUID NOT NULL REFERENCES payroll_runs(id),

  payroll_employee_record_id UUID NOT NULL REFERENCES payroll_employee_records(id),



  -- Period info

  period_month INTEGER NOT NULL,

  period_year INTEGER NOT NULL,

  pay_period_start DATE NOT NULL,

  pay_period_end DATE NOT NULL,



  -- Snapshot (immutable)

  snapshot_data JSONB NOT NULL, -- complete payslip data at time of generation



  -- Generated files

  pdf_url TEXT,

  pdf_generated_at TIMESTAMPTZ,

  pdf_generation_status VARCHAR(20) DEFAULT 'pending', -- pending, generating, generated, failed

  pdf_generation_error TEXT,



  -- Net

  net_salary DECIMAL(15,2) NOT NULL,

  amount_in_words TEXT NOT NULL,



  -- Status

  status VARCHAR(20) DEFAULT 'generated', -- generated, published, viewed, downloaded

  published_at TIMESTAMPTZ,

  first_viewed_at TIMESTAMPTZ,



  -- Filename

  filename VARCHAR(255),



  created_at TIMESTAMPTZ DEFAULT NOW(),

  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(company_id, employee_id, period_month, period_year)

);



-- ============================================================

-- ATTENDANCE

-- ============================================================



CREATE TABLE attendance_records (

  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  company_id UUID NOT NULL REFERENCES companies(id),

  employee_id UUID NOT NULL REFERENCES employees(id),



  attendance_date DATE NOT NULL,

  status VARCHAR(20) NOT NULL, -- present, absent, half_day, leave, holiday, weekly_off, wfh, on_duty



  check_in_time TIMESTAMPTZ,

  check_out_time TIMESTAMPTZ,

  working_hours DECIMAL(5,2),



  is_manual_entry BOOLEAN DEFAULT FALSE,

  manual_reason TEXT,



  approved_by UUID REFERENCES users(id),

  approved_at TIMESTAMPTZ,



  remarks TEXT,



  created_at TIMESTAMPTZ DEFAULT NOW(),

  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(employee_id, attendance_date)

);



-- ============================================================

-- LEAVE

-- ============================================================



CREATE TABLE leave_types (

  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  company_id UUID NOT NULL REFERENCES companies(id),



  name VARCHAR(50) NOT NULL,

  code VARCHAR(10) NOT NULL,

  description TEXT,



  annual_quota DECIMAL(5,2) DEFAULT 0,

  carry_forward BOOLEAN DEFAULT FALSE,

  max_carry_forward DECIMAL(5,2) DEFAULT 0,



  is_paid BOOLEAN DEFAULT TRUE,

  is_active BOOLEAN DEFAULT TRUE,



  color VARCHAR(10) DEFAULT '#3B82F6',



  created_at TIMESTAMPTZ DEFAULT NOW(),

  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(company_id, code)

);



CREATE TABLE leave_balances (

  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  employee_id UUID NOT NULL REFERENCES employees(id),

  leave_type_id UUID NOT NULL REFERENCES leave_types(id),



  fiscal_year INTEGER NOT NULL,



  opening_balance DECIMAL(5,2) DEFAULT 0,

  accrued DECIMAL(5,2) DEFAULT 0,

  used DECIMAL(5,2) DEFAULT 0,

  adjusted DECIMAL(5,2) DEFAULT 0,

  closing_balance DECIMAL(5,2) DEFAULT 0,



  created_at TIMESTAMPTZ DEFAULT NOW(),

  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(employee_id, leave_type_id, fiscal_year)

);



CREATE TABLE leave_requests (

  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  company_id UUID NOT NULL REFERENCES companies(id),

  employee_id UUID NOT NULL REFERENCES employees(id),

  leave_type_id UUID NOT NULL REFERENCES leave_types(id),



  start_date DATE NOT NULL,

  end_date DATE NOT NULL,

  total_days DECIMAL(5,2) NOT NULL,



  reason TEXT,



  status VARCHAR(20) DEFAULT 'pending', -- pending, approved, rejected, cancelled



  applied_at TIMESTAMPTZ DEFAULT NOW(),



  approved_by UUID REFERENCES users(id),

  approved_at TIMESTAMPTZ,

  rejection_reason TEXT,



  cancelled_at TIMESTAMPTZ,

  cancel_reason TEXT,



  created_at TIMESTAMPTZ DEFAULT NOW(),

  updated_at TIMESTAMPTZ DEFAULT NOW()

);



-- ============================================================

-- HOLIDAYS

-- ============================================================



CREATE TABLE holidays (

  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  company_id UUID NOT NULL REFERENCES companies(id),



  name VARCHAR(100) NOT NULL,

  date DATE NOT NULL,

  type VARCHAR(30) DEFAULT 'public', -- public, restricted, optional



  is_active BOOLEAN DEFAULT TRUE,



  created_at TIMESTAMPTZ DEFAULT NOW(),

  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(company_id, date, name)

);



-- ============================================================

-- DOCUMENTS

-- ============================================================



CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id),
  employee_id UUID REFERENCES employees(id), -- null for company docs

  document_type VARCHAR(50) NOT NULL,
  -- offer_letter, appointment_letter, increment_letter, promotion_letter,
  -- payslip, experience_letter, relieving_letter, id_proof, pan_card,
  -- education, hr_document, custom

  category VARCHAR(50) DEFAULT 'employment_hr',
  subcategory VARCHAR(50),
  reference_number VARCHAR(100),
  issuing_authority VARCHAR(255),

  title VARCHAR(255) NOT NULL,
  description TEXT,

  file_url TEXT NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_size BIGINT,
  mime_type VARCHAR(100),
  checksum_sha256 VARCHAR(64),

  version INTEGER DEFAULT 1,

  visibility VARCHAR(20) DEFAULT 'private', -- private, employee, department, company

  issue_date DATE,
  effective_date DATE,
  expiry_date DATE,

  status VARCHAR(50) DEFAULT 'DRAFT',
  -- DRAFT, UPLOADED, PENDING_VERIFICATION, VERIFIED, REJECTED, REPLACEMENT_REQUESTED, EXPIRED, ARCHIVED, ISSUED, ACKNOWLEDGED, SUPERSEDED

  verification_status VARCHAR(50) DEFAULT 'unverified',
  verified_by UUID REFERENCES users(id),
  verified_at TIMESTAMPTZ,
  verification_notes TEXT,
  rejection_reason TEXT,
  replacement_requested_at TIMESTAMPTZ,
  replacement_reason TEXT,

  is_archived BOOLEAN DEFAULT FALSE,
  archived_at TIMESTAMPTZ,
  archived_by UUID REFERENCES users(id),
  retention_period_months INTEGER DEFAULT 84,

  requires_acknowledgement BOOLEAN DEFAULT FALSE,
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID REFERENCES users(id),

  uploaded_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS document_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(100) NOT NULL,
  category_group VARCHAR(50) NOT NULL, -- identity_onboarding, employment_hr, payroll_statutory, company_policy
  description TEXT,
  is_mandatory BOOLEAN DEFAULT FALSE,
  has_expiry BOOLEAN DEFAULT FALSE,
  default_retention_months INTEGER DEFAULT 84,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, code)
);



-- ============================================================

-- ANNOUNCEMENTS

-- ============================================================



CREATE TABLE announcements (

  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  company_id UUID NOT NULL REFERENCES companies(id),



  title VARCHAR(255) NOT NULL,

  content TEXT NOT NULL,

  category VARCHAR(50) DEFAULT 'general',

  -- general, policy, event, birthday, holiday, important



  priority VARCHAR(20) DEFAULT 'normal', -- low, normal, high, urgent



  is_pinned BOOLEAN DEFAULT FALSE,

  is_published BOOLEAN DEFAULT FALSE,



  published_at TIMESTAMPTZ,

  expires_at TIMESTAMPTZ,



  target_type VARCHAR(20) DEFAULT 'all', -- all, department, team, specific

  target_departments UUID[], -- department IDs

  target_employees UUID[], -- employee IDs



  created_by UUID REFERENCES users(id),

  created_at TIMESTAMPTZ DEFAULT NOW(),

  updated_at TIMESTAMPTZ DEFAULT NOW()

);



-- ============================================================

-- NOTIFICATIONS

-- ============================================================



CREATE TABLE notifications (

  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  company_id UUID NOT NULL REFERENCES companies(id),

  user_id UUID NOT NULL REFERENCES users(id),



  title VARCHAR(255) NOT NULL,

  message TEXT,

  type VARCHAR(50) NOT NULL,

  -- payslip_released, leave_submitted, leave_approved, leave_rejected,

  -- salary_revision, document_uploaded, announcement, payroll_approval,

  -- onboarding_task, general



  reference_type VARCHAR(50), -- payslip, leave_request, employee, payroll_run

  reference_id UUID,



  is_read BOOLEAN DEFAULT FALSE,

  read_at TIMESTAMPTZ,



  action_url TEXT,



  created_at TIMESTAMPTZ DEFAULT NOW()

);



-- ============================================================

-- APPROVAL REQUESTS

-- ============================================================



CREATE TABLE approval_requests (

  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  company_id UUID NOT NULL REFERENCES companies(id),



  request_type VARCHAR(50) NOT NULL,

  -- salary_revision, leave, payroll, correction, termination



  reference_type VARCHAR(50) NOT NULL,

  reference_id UUID NOT NULL,



  requested_by UUID NOT NULL REFERENCES users(id),



  approver_id UUID NOT NULL REFERENCES users(id),



  status VARCHAR(20) DEFAULT 'pending', -- pending, approved, rejected, cancelled



  comments TEXT,

  approval_comments TEXT,

  rejection_reason TEXT,



  requested_at TIMESTAMPTZ DEFAULT NOW(),

  responded_at TIMESTAMPTZ,



  created_at TIMESTAMPTZ DEFAULT NOW(),

  updated_at TIMESTAMPTZ DEFAULT NOW()

);



-- ============================================================

-- AUDIT LOGS

-- ============================================================



CREATE TABLE audit_logs (

  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  company_id UUID NOT NULL REFERENCES companies(id),



  user_id UUID REFERENCES users(id),

  user_email VARCHAR(255),

  user_name VARCHAR(255),



  action VARCHAR(50) NOT NULL,

  -- created, updated, deleted, viewed, downloaded, approved, rejected,

  -- locked, unlocked, generated, revealed, login, logout



  entity_type VARCHAR(50) NOT NULL,

  -- employee, salary_structure, payroll_run, payslip, leave_request,

  -- document, bank_account, statutory_details, user, role, settings



  entity_id UUID,

  entity_name VARCHAR(255),



  previous_value JSONB,

  new_value JSONB,



  description TEXT,

  reason TEXT,



  ip_address VARCHAR(50),

  user_agent TEXT,



  created_at TIMESTAMPTZ DEFAULT NOW()

);



-- Make audit_logs append-only (no UPDATE/DELETE from app)

-- Note: This is enforced at the application level; 

-- RLS policies further protect audit data.



-- ============================================================

-- INDEXES

-- ============================================================



-- Employees

CREATE INDEX idx_employees_company ON employees(company_id);

CREATE INDEX idx_employees_department ON employees(department_id);

CREATE INDEX idx_employees_designation ON employees(designation_id);

CREATE INDEX idx_employees_manager ON employees(reporting_manager_id);

CREATE INDEX idx_employees_status ON employees(employment_status);

CREATE INDEX idx_employees_active ON employees(is_active);

CREATE INDEX idx_employees_code ON employees(employee_code);

CREATE INDEX idx_employees_joining ON employees(joining_date);



-- Salary

CREATE INDEX idx_salary_structures_employee ON salary_structures(employee_id);

CREATE INDEX idx_salary_structures_effective ON salary_structures(effective_from);

CREATE INDEX idx_salary_structure_components_structure ON salary_structure_components(salary_structure_id);



-- Payroll

CREATE INDEX idx_payroll_periods_company ON payroll_periods(company_id, period_year, period_month);

CREATE INDEX idx_payroll_runs_period ON payroll_runs(payroll_period_id);

CREATE INDEX idx_payroll_runs_status ON payroll_runs(status);

CREATE INDEX idx_payroll_emp_records_run ON payroll_employee_records(payroll_run_id);

CREATE INDEX idx_payroll_emp_records_employee ON payroll_employee_records(employee_id);

CREATE INDEX idx_payroll_earnings_record ON payroll_earnings(payroll_employee_record_id);

CREATE INDEX idx_payroll_deductions_record ON payroll_deductions(payroll_employee_record_id);



-- Payslips

CREATE INDEX idx_payslips_employee ON payslips(employee_id);

CREATE INDEX idx_payslips_period ON payslips(period_year, period_month);

CREATE INDEX idx_payslips_company ON payslips(company_id);



-- Attendance

CREATE INDEX idx_attendance_employee ON attendance_records(employee_id);

CREATE INDEX idx_attendance_date ON attendance_records(attendance_date);

CREATE INDEX idx_attendance_company ON attendance_records(company_id);



-- Leave

CREATE INDEX idx_leave_requests_employee ON leave_requests(employee_id);

CREATE INDEX idx_leave_requests_status ON leave_requests(status);

CREATE INDEX idx_leave_balances_employee ON leave_balances(employee_id);



-- Notifications

CREATE INDEX idx_notifications_user ON notifications(user_id);

CREATE INDEX idx_notifications_read ON notifications(user_id, is_read);



-- Audit

CREATE INDEX idx_audit_logs_company ON audit_logs(company_id);

CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);

CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);

CREATE INDEX idx_audit_logs_action ON audit_logs(action);

CREATE INDEX idx_audit_logs_created ON audit_logs(created_at);



-- Approvals

CREATE INDEX idx_approval_requests_approver ON approval_requests(approver_id, status);

CREATE INDEX idx_approval_requests_requester ON approval_requests(requested_by);

-- ============================================================

-- HR REQUESTS / HELP DESK

-- ============================================================



CREATE TABLE hr_requests (

  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  company_id UUID NOT NULL REFERENCES companies(id),

  employee_id UUID NOT NULL REFERENCES employees(id),

  ticket_number VARCHAR(30) UNIQUE NOT NULL,

  category VARCHAR(50) NOT NULL, -- payroll_question, payslip_issue, leave_question, profile_correction, bank_change, document_request, other

  subject VARCHAR(200) NOT NULL,

  description TEXT NOT NULL,

  status VARCHAR(30) DEFAULT 'OPEN', -- OPEN, IN_REVIEW, WAITING_FOR_EMPLOYEE, RESOLVED, CLOSED

  assigned_to UUID REFERENCES users(id),

  resolution_notes TEXT,

  resolved_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  updated_at TIMESTAMPTZ DEFAULT NOW()

);



-- ============================================================

-- SECURITY EVENTS & SCHEDULED JOBS

-- ============================================================



CREATE TABLE security_events (

  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  company_id UUID NOT NULL REFERENCES companies(id),

  user_id UUID REFERENCES users(id),

  event_type VARCHAR(50) NOT NULL, -- login_success, login_failed, password_change, credential_reset, session_terminated

  ip_address VARCHAR(45),

  user_agent TEXT,

  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW()

);



CREATE TABLE scheduled_job_runs (

  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  company_id UUID NOT NULL REFERENCES companies(id),

  job_name VARCHAR(50) NOT NULL, -- open_payroll_prep, prepare_drafts, publish_approved_payslips

  status VARCHAR(20) NOT NULL, -- success, failure, skipped

  idempotency_key VARCHAR(100) UNIQUE,

  executed_at TIMESTAMPTZ DEFAULT NOW(),

  records_processed INTEGER DEFAULT 0,

  details JSONB DEFAULT '{}'

);

-- ============================================================
-- HARYAK HRMS — CURRENT APPLICATION COMPLETION MODULES
-- Schema only: no company, employee, permission, holiday,
-- payroll, chat, or other seed/business rows are inserted.
-- ============================================================


-- ============================================================
-- TIMESHEETS
-- ============================================================

CREATE TABLE timesheets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id),
  week_start_date DATE NOT NULL,
  week_end_date DATE NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
  total_hours DECIMAL(7,2) NOT NULL DEFAULT 0,
  submitted_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  review_comments TEXT,
  approved_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chk_timesheet_dates CHECK (week_end_date >= week_start_date),
  CONSTRAINT chk_timesheet_status CHECK (
    status IN ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'RETURNED')
  ),
  UNIQUE(company_id, employee_id, week_start_date, week_end_date)
);

CREATE TABLE timesheet_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  timesheet_id UUID NOT NULL REFERENCES timesheets(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id),
  work_date DATE NOT NULL,
  project_name VARCHAR(200),
  task_name VARCHAR(200),
  description TEXT,
  hours DECIMAL(5,2) NOT NULL DEFAULT 0,
  is_billable BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chk_timesheet_entry_hours CHECK (hours >= 0 AND hours <= 24)
);


-- ============================================================
-- ATTENDANCE REGULARIZATION / CORRECTIONS
-- ============================================================

CREATE TABLE attendance_regularization_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id),
  attendance_record_id UUID REFERENCES attendance_records(id) ON DELETE SET NULL,
  attendance_date DATE NOT NULL,
  request_type VARCHAR(40) NOT NULL,
  requested_check_in TIMESTAMPTZ,
  requested_check_out TIMESTAMPTZ,
  requested_status VARCHAR(20),
  reason TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  requested_by UUID REFERENCES users(id),
  approver_id UUID REFERENCES users(id),
  approval_comments TEXT,
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chk_attendance_regularization_status CHECK (
    status IN ('pending', 'approved', 'rejected', 'cancelled')
  )
);


-- ============================================================
-- EMPLOYEE EMPLOYMENT HISTORY
-- ============================================================

CREATE TABLE employee_employment_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL,
  effective_date DATE NOT NULL,
  previous_department_id UUID REFERENCES departments(id),
  new_department_id UUID REFERENCES departments(id),
  previous_designation_id UUID REFERENCES designations(id),
  new_designation_id UUID REFERENCES designations(id),
  previous_manager_id UUID REFERENCES employees(id),
  new_manager_id UUID REFERENCES employees(id),
  previous_employment_status VARCHAR(30),
  new_employment_status VARCHAR(30),
  previous_employment_type VARCHAR(30),
  new_employment_type VARCHAR(30),
  reason TEXT,
  notes TEXT,
  changed_by UUID REFERENCES users(id),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);


-- ============================================================
-- PAYROLL ADJUSTMENTS / ARREARS / REIMBURSEMENTS
-- ============================================================

CREATE TABLE payroll_adjustments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id),
  payroll_period_id UUID REFERENCES payroll_periods(id) ON DELETE SET NULL,
  payroll_run_id UUID REFERENCES payroll_runs(id) ON DELETE SET NULL,
  adjustment_type VARCHAR(40) NOT NULL,
  direction VARCHAR(10) NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  description TEXT NOT NULL,
  effective_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  requested_by UUID REFERENCES users(id),
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chk_payroll_adjustment_amount CHECK (amount >= 0),
  CONSTRAINT chk_payroll_adjustment_direction CHECK (direction IN ('earning', 'deduction')),
  CONSTRAINT chk_payroll_adjustment_status CHECK (
    status IN ('pending', 'approved', 'rejected', 'applied', 'cancelled')
  )
);


-- ============================================================
-- DOCUMENT VERSION HISTORY
-- ============================================================

CREATE TABLE document_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  file_url TEXT NOT NULL,
  file_name VARCHAR(255),
  file_size BIGINT,
  mime_type VARCHAR(150),
  checksum_sha256 VARCHAR(64),
  change_summary TEXT,
  uploaded_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chk_document_version_number CHECK (version_number > 0),
  UNIQUE(document_id, version_number)
);


-- ============================================================
-- NOTIFICATION PREFERENCES & WEB PUSH SUBSCRIPTIONS
-- ============================================================

CREATE TABLE notification_preferences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  in_app_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  browser_push_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  payroll_notifications BOOLEAN NOT NULL DEFAULT TRUE,
  leave_notifications BOOLEAN NOT NULL DEFAULT TRUE,
  attendance_notifications BOOLEAN NOT NULL DEFAULT TRUE,
  announcement_notifications BOOLEAN NOT NULL DEFAULT TRUE,
  chat_notifications BOOLEAN NOT NULL DEFAULT TRUE,
  quiet_hours_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  timezone VARCHAR(50) DEFAULT 'Asia/Kolkata',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, user_id)
);

CREATE TABLE push_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth_secret TEXT NOT NULL,
  user_agent TEXT,
  device_name VARCHAR(150),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, endpoint)
);


-- ============================================================
-- USER SESSIONS / SECURITY CENTER
-- ============================================================

CREATE TABLE user_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_token_hash VARCHAR(128),
  device_name VARCHAR(150),
  browser VARCHAR(100),
  operating_system VARCHAR(100),
  ip_address VARCHAR(45),
  user_agent TEXT,
  is_current BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES users(id),
  revoke_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);


-- ============================================================
-- ORGANIZATION CHAT
-- Genuine sent / delivered / read receipt storage.
-- IDs are TEXT to preserve the application's legacy conv_/msg_
-- identifier format.
-- ============================================================

CREATE TABLE chat_conversations (
  id TEXT PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_chat_conversation_type CHECK (type IN ('direct', 'group', 'channel'))
);

CREATE TABLE chat_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id TEXT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  display_name TEXT NOT NULL,
  participant_role TEXT,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  left_at TIMESTAMPTZ,
  UNIQUE(conversation_id, user_id)
);

CREATE TABLE chat_messages (
  id TEXT PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  conversation_id TEXT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  sender_user_id TEXT NOT NULL,
  sender_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  sender_name TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_ai_message BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  edited_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);

CREATE TABLE chat_message_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id TEXT NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  conversation_id TEXT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(message_id, user_id)
);


-- ============================================================
-- ADDITIONAL INDEXES FOR COMPLETION MODULES
-- ============================================================

CREATE INDEX idx_timesheets_company_status
  ON timesheets(company_id, status);

CREATE INDEX idx_timesheets_employee_period
  ON timesheets(employee_id, week_start_date, week_end_date);

CREATE INDEX idx_timesheet_entries_timesheet
  ON timesheet_entries(timesheet_id);

CREATE INDEX idx_timesheet_entries_employee_date
  ON timesheet_entries(employee_id, work_date);

CREATE INDEX idx_attendance_regularization_company_status
  ON attendance_regularization_requests(company_id, status);

CREATE INDEX idx_attendance_regularization_employee_date
  ON attendance_regularization_requests(employee_id, attendance_date);

CREATE INDEX idx_employment_history_employee_date
  ON employee_employment_history(employee_id, effective_date DESC);

CREATE INDEX idx_payroll_adjustments_company_status
  ON payroll_adjustments(company_id, status);

CREATE INDEX idx_payroll_adjustments_employee
  ON payroll_adjustments(employee_id, effective_date);

CREATE INDEX idx_document_versions_document
  ON document_versions(document_id, version_number DESC);

CREATE INDEX idx_notification_preferences_user
  ON notification_preferences(user_id);

CREATE INDEX idx_push_subscriptions_user_active
  ON push_subscriptions(user_id, is_active);

CREATE INDEX idx_user_sessions_user_active
  ON user_sessions(user_id, is_active);

CREATE INDEX idx_chat_conversations_company_updated
  ON chat_conversations(company_id, updated_at DESC);

CREATE INDEX idx_chat_participants_user
  ON chat_participants(company_id, user_id, left_at);

CREATE INDEX idx_chat_participants_conversation
  ON chat_participants(conversation_id, left_at);

CREATE INDEX idx_chat_messages_conversation_created
  ON chat_messages(conversation_id, created_at);

CREATE INDEX idx_chat_messages_company_created
  ON chat_messages(company_id, created_at);

CREATE INDEX idx_chat_receipts_user_read
  ON chat_message_receipts(user_id, read_at);

CREATE INDEX idx_chat_receipts_message
  ON chat_message_receipts(message_id);


-- ============================================================
-- HOLIDAY TYPE CONTRACT
-- Aligns the database with the current Calendar UI.
-- Existing type column remains VARCHAR for application compatibility.
-- ============================================================

ALTER TABLE holidays
  ADD CONSTRAINT chk_holidays_type
  CHECK (type IN ('public', 'company', 'optional', 'restricted'));


-- ============================================================
-- UPDATED_AT AUTOMATION
-- Applies only to tables that actually contain updated_at.
-- ============================================================

CREATE OR REPLACE FUNCTION set_updated_at_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  table_name TEXT;
  trigger_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'companies',
    'company_settings',
    'roles',
    'users',
    'departments',
    'designations',
    'locations',
    'employees',
    'employee_bank_accounts',
    'employee_statutory_details',
    'salary_components',
    'salary_structures',
    'salary_structure_components',
    'salary_revisions',
    'payroll_settings',
    'statutory_rules',
    'payroll_periods',
    'payroll_runs',
    'payroll_employee_records',
    'payslips',
    'attendance_records',
    'leave_types',
    'leave_balances',
    'leave_requests',
    'holidays',
    'documents',
    'announcements',
    'approval_requests',
    'hr_requests',
    'timesheets',
    'timesheet_entries',
    'attendance_regularization_requests',
    'payroll_adjustments',
    'notification_preferences',
    'push_subscriptions',
    'chat_conversations',
    'chat_message_receipts'
  ]
  LOOP
    trigger_name := 'trg_' || table_name || '_updated_at';

    EXECUTE format(
      'DROP TRIGGER IF EXISTS %I ON %I',
      trigger_name,
      table_name
    );

    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON %I
       FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp()',
      trigger_name,
      table_name
    );
  END LOOP;
END;
$$;


-- ============================================================
-- OPTIONAL SUPABASE REALTIME REGISTRATION
-- These guarded blocks add current chat tables to the default
-- Supabase realtime publication when it exists.
-- ============================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication
    WHERE pubname = 'supabase_realtime'
  ) THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END;

    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE chat_message_receipts;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END;
  END IF;
END;
$$;


-- ============================================================
-- END OF HARYAK HRMS SCHEMA
-- ============================================================
