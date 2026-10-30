-- ============================================================
-- HARYAK ONE — Comprehensive Timesheet Schema Harmonization
-- Haryak Technologies India Private Limited
-- Company Tagline: Empowering Tomorrow’s Solutions, Today.
-- ============================================================

-- 1. Harmonize timesheet_entries table
ALTER TABLE timesheet_entries
  ADD COLUMN IF NOT EXISTS task_title VARCHAR(255),
  ADD COLUMN IF NOT EXISTS task_category VARCHAR(100),
  ADD COLUMN IF NOT EXISTS entry_date DATE;

-- Backfill cross-compatible values in timesheet_entries
UPDATE timesheet_entries
  SET task_title = COALESCE(task_name, task_category, 'General Work')
  WHERE task_title IS NULL;

UPDATE timesheet_entries
  SET task_name = COALESCE(task_title, task_category, 'General Work')
  WHERE task_name IS NULL;

UPDATE timesheet_entries
  SET entry_date = work_date
  WHERE entry_date IS NULL AND work_date IS NOT NULL;

UPDATE timesheet_entries
  SET work_date = entry_date
  WHERE work_date IS NULL AND entry_date IS NOT NULL;

UPDATE timesheet_entries
  SET task_category = COALESCE(task_title, task_name, 'Other')
  WHERE task_category IS NULL;

-- 2. Harmonize timesheets master table
ALTER TABLE timesheets
  ADD COLUMN IF NOT EXISTS year INTEGER,
  ADD COLUMN IF NOT EXISTS month INTEGER,
  ADD COLUMN IF NOT EXISTS period_start DATE,
  ADD COLUMN IF NOT EXISTS period_end DATE,
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS billable_hours NUMERIC(7,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS submitted_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS comments TEXT;

-- Backfill timesheets month/year from dates if present
UPDATE timesheets
  SET
    year = EXTRACT(YEAR FROM COALESCE(period_start, week_start_date)),
    month = EXTRACT(MONTH FROM COALESCE(period_start, week_start_date))
  WHERE (year IS NULL OR month IS NULL) AND (period_start IS NOT NULL OR week_start_date IS NOT NULL);

UPDATE timesheets
  SET
    period_start = COALESCE(week_start_date, (year || '-' || LPAD(month::text, 2, '0') || '-01')::date)
  WHERE period_start IS NULL AND (week_start_date IS NOT NULL OR (year IS NOT NULL AND month IS NOT NULL));

UPDATE timesheets
  SET
    period_end = COALESCE(week_end_date, period_start)
  WHERE period_end IS NULL;

-- 3. Update status check constraint to support all enterprise statuses
ALTER TABLE timesheets DROP CONSTRAINT IF EXISTS chk_timesheet_status;
ALTER TABLE timesheets ADD CONSTRAINT chk_timesheet_status CHECK (
  status IN (
    'DRAFT',
    'SUBMITTED',
    'UNDER_REVIEW',
    'APPROVED',
    'REJECTED',
    'RETURNED',
    'RETURNED_FOR_CORRECTION',
    'LOCKED'
  )
);

-- 4. Create unique index for monthly timesheets
CREATE UNIQUE INDEX IF NOT EXISTS idx_timesheets_monthly_unique
  ON timesheets(company_id, employee_id, year, month)
  WHERE year IS NOT NULL AND month IS NOT NULL;

-- 5. Ensure timesheet_reviews audit table exists
CREATE TABLE IF NOT EXISTS timesheet_reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  timesheet_id UUID NOT NULL REFERENCES timesheets(id) ON DELETE CASCADE,
  action VARCHAR(50) NOT NULL,
  actor_id UUID NOT NULL REFERENCES users(id),
  actor_role VARCHAR(50) NOT NULL,
  comments TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_timesheet_reviews_ts ON timesheet_reviews(timesheet_id);
CREATE INDEX IF NOT EXISTS idx_timesheet_entries_emp_work_date ON timesheet_entries(employee_id, work_date);
CREATE INDEX IF NOT EXISTS idx_timesheet_entries_entry_date ON timesheet_entries(timesheet_id, entry_date);

-- Enable RLS
ALTER TABLE timesheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE timesheet_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE timesheet_reviews ENABLE ROW LEVEL SECURITY;
