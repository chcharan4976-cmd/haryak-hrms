-- ============================================================
-- HARYAK ONE — Monthly Timesheet Leave Integration Migration
-- Haryak Technologies India Private Limited
-- ============================================================

-- 1. Add leave support columns to timesheet_entries
ALTER TABLE timesheet_entries
  ADD COLUMN IF NOT EXISTS is_leave BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS leave_type_id UUID REFERENCES leave_types(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS leave_type_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS leave_type_code VARCHAR(50);

-- Index for efficient leave querying
CREATE INDEX IF NOT EXISTS idx_timesheet_entries_is_leave ON timesheet_entries(timesheet_id, is_leave);
CREATE INDEX IF NOT EXISTS idx_timesheet_entries_work_date ON timesheet_entries(timesheet_id, work_date);
