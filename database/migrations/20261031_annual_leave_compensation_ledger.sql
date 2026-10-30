-- ============================================================
-- HARYAK ONE — Annual Leave Compensation Ledger & Year-End Audit Migration
-- Haryak Technologies India Private Limited
-- ============================================================

-- 1. Create table for annual leave compensation ledgers
CREATE TABLE IF NOT EXISTS annual_leave_compensation_ledgers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  calendar_year INTEGER NOT NULL,
  annual_entitlement INTEGER NOT NULL DEFAULT 11,
  total_leaves_taken NUMERIC(5,2) NOT NULL DEFAULT 0,
  total_deductions_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  eligible_compensation_days NUMERIC(5,2) NOT NULL DEFAULT 0,
  eligible_compensation_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  approved_compensation_days NUMERIC(5,2) NOT NULL DEFAULT 0,
  approved_compensation_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  paid_compensation_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  audit_status VARCHAR(30) NOT NULL DEFAULT 'PENDING_AUDIT',
  audited_by UUID REFERENCES users(id),
  audited_at TIMESTAMPTZ,
  audit_notes TEXT,
  settlement_payroll_period_id UUID REFERENCES payroll_periods(id) ON DELETE SET NULL,
  settlement_payroll_run_id UUID REFERENCES payroll_runs(id) ON DELETE SET NULL,
  settlement_reference VARCHAR(100),
  settled_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, employee_id, calendar_year)
);

-- 2. Create table for date-level deduction entries
CREATE TABLE IF NOT EXISTS annual_leave_compensation_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ledger_id UUID REFERENCES annual_leave_compensation_ledgers(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  calendar_year INTEGER NOT NULL,
  leave_date DATE NOT NULL,
  leave_type_name VARCHAR(100) DEFAULT 'Normal Working Day Leave',
  reason TEXT,
  source VARCHAR(30) NOT NULL DEFAULT 'TIMESHEET',
  daily_salary_rate NUMERIC(15,2) NOT NULL DEFAULT 0,
  deduction_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  is_eligible_for_compensation BOOLEAN NOT NULL DEFAULT TRUE,
  compensation_sequence INTEGER,
  ineligibility_reason TEXT,
  is_compensated BOOLEAN NOT NULL DEFAULT FALSE,
  compensated_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  payroll_period_id UUID REFERENCES payroll_periods(id) ON DELETE SET NULL,
  payroll_run_id UUID REFERENCES payroll_runs(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, employee_id, leave_date)
);

-- 3. Create indexes for fast lookup and tenant isolation
CREATE INDEX IF NOT EXISTS idx_annual_leave_comp_ledger ON annual_leave_compensation_ledgers(company_id, calendar_year);
CREATE INDEX IF NOT EXISTS idx_annual_leave_comp_entries ON annual_leave_compensation_entries(company_id, employee_id, calendar_year);
