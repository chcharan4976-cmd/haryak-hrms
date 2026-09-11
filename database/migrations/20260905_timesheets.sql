-- ============================================================
-- HARYAK ONE — Relational Timesheets Schema Migration
-- Haryak Technologies India Private Limited
-- ============================================================

CREATE TABLE IF NOT EXISTS timesheets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
  version INTEGER NOT NULL DEFAULT 1,
  total_hours NUMERIC(6,2) NOT NULL DEFAULT 0,
  billable_hours NUMERIC(6,2) NOT NULL DEFAULT 0,
  submitted_at TIMESTAMPTZ,
  submitted_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES users(id),
  rejection_reason TEXT,
  comments TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, employee_id, year, month)
);

CREATE TABLE IF NOT EXISTS timesheet_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  timesheet_id UUID NOT NULL REFERENCES timesheets(id) ON DELETE CASCADE,
  entry_date DATE NOT NULL,
  project_name VARCHAR(255),
  task_category VARCHAR(100),
  description TEXT NOT NULL,
  hours NUMERIC(4,2) NOT NULL,
  is_billable BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS timesheet_reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  timesheet_id UUID NOT NULL REFERENCES timesheets(id) ON DELETE CASCADE,
  action VARCHAR(50) NOT NULL,
  actor_id UUID NOT NULL REFERENCES users(id),
  actor_role VARCHAR(50) NOT NULL,
  comments TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_timesheets_emp_period ON timesheets(employee_id, year, month);
CREATE INDEX IF NOT EXISTS idx_timesheets_company_status ON timesheets(company_id, status);
CREATE INDEX IF NOT EXISTS idx_timesheet_entries_ts_date ON timesheet_entries(timesheet_id, entry_date);
CREATE INDEX IF NOT EXISTS idx_timesheet_reviews_ts ON timesheet_reviews(timesheet_id);

ALTER TABLE timesheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE timesheet_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE timesheet_reviews ENABLE ROW LEVEL SECURITY;
