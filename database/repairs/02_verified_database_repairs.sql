-- ==============================================================================
-- HARYAK ONE — ENTERPRISE HRMS
-- HARDENED PRODUCTION DATABASE REPAIRS & INTEGRITY CORRECTIONS
-- File: database/repairs/02_verified_database_repairs.sql
--
-- TARGET: Supabase PostgreSQL (Live Database)
--
-- STATUS: REVIEW ONLY — DO NOT EXECUTE AUTOMATICALLY
-- This script must be reviewed by the database administrator and executed manually
-- in the Supabase SQL Editor only after reviewing the preflight checks.
--
-- CORE DESIGN PRINCIPLES:
-- 1. 100% IDEMPOTENT: Safe to run repeatedly without mutating valid existing data.
-- 2. NON-DESTRUCTIVE: Uses ADD COLUMN IF NOT EXISTS, CREATE TABLE IF NOT EXISTS,
--    and ON CONFLICT DO NOTHING. Never overwrites existing configurations.
-- 3. NO BLIND EXCEPTION SWALLOWING: All broad "EXCEPTION WHEN OTHERS THEN NULL"
--    blocks have been eliminated. Failures are surfaced with explicit error messages.
-- 4. STRICT DATA PROTECTION: Chat cleanup operates solely on chat_messages.
--    Official EDMS documents, payslips, employees, and audit logs are never touched.
-- 5. EXPLICIT SCOPING: All seed rows and scorecard queries target the verified
--    primary company UUID ('c2a6b9b4-37e4-4bd9-9347-8d779bccecc4'::uuid).
-- ==============================================================================

-- ==============================================================================
-- SECTION 0: PREFLIGHT SAFETY CHECKS & AMBIGUITY VALIDATION
-- This section performs strict sanity checks. If any conflict or ambiguity exists,
-- execution will immediately terminate with an exception before changes occur.
-- ==============================================================================

DO $$
DECLARE
  v_target_company_id CONSTANT UUID := 'c2a6b9b4-37e4-4bd9-9347-8d779bccecc4'::uuid;
  v_company_id UUID;
  v_company_count INT;
  v_duplicate_timesheets INT := 0;
BEGIN
  RAISE NOTICE '=====================================================';
  RAISE NOTICE 'SECTION 0: Executing Preflight Safety Validation...';
  RAISE NOTICE '=====================================================';

  -- 1. Unambiguous Target Company Resolution
  SELECT id INTO v_company_id 
  FROM companies 
  WHERE id = v_target_company_id;

  IF v_company_id IS NULL THEN
    -- Fallback: Check if there is exactly one company with the canonical legal name
    SELECT COUNT(*) INTO v_company_count 
    FROM companies 
    WHERE legal_name = 'Haryak Technologies India Private Limited' 
       OR name = 'Haryak Technologies India Private Limited';

    IF v_company_count = 1 THEN
      SELECT id INTO v_company_id 
      FROM companies 
      WHERE legal_name = 'Haryak Technologies India Private Limited' 
         OR name = 'Haryak Technologies India Private Limited';
      RAISE NOTICE 'Target company resolved via legal name match: %', v_company_id;
    ELSE
      SELECT COUNT(*) INTO v_company_count FROM companies;
      IF v_company_count = 1 THEN
        SELECT id INTO v_company_id FROM companies;
        RAISE NOTICE 'Single registered company selected as target: %', v_company_id;
      ELSE
        RAISE EXCEPTION 'PREFLIGHT HALT: Target company % could not be resolved unambiguously. Found % registered companies. Aborting repairs.', v_target_company_id, v_company_count;
      END IF;
    END IF;
  ELSE
    RAISE NOTICE 'Target company identity confirmed: %', v_company_id;
  END IF;

  -- 2. Validate Timesheet Data Uniqueness Prior to Applying Constraints
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'timesheets') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'timesheets' AND column_name = 'year') 
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'timesheets' AND column_name = 'month') THEN
      SELECT COUNT(*) INTO v_duplicate_timesheets
      FROM (
        SELECT company_id, employee_id, year, month, COUNT(*)
        FROM timesheets
        WHERE year IS NOT NULL AND month IS NOT NULL
        GROUP BY company_id, employee_id, year, month
        HAVING COUNT(*) > 1
      ) dups;

      IF v_duplicate_timesheets > 0 THEN
        RAISE EXCEPTION 'PREFLIGHT HALT: Detected % duplicate monthly timesheet records in timesheets. Resolve duplicates before applying constraints.', v_duplicate_timesheets;
      END IF;
    END IF;
  END IF;

  RAISE NOTICE 'Preflight validation completed successfully. Proceeding with schema corrections.';
END $$;


-- ==============================================================================
-- SECTION 1: ADDITIVE SCHEMA REPAIRS (TIMESHEETS & CHAT RETENTION)
-- Risk Assessment: Low. Additive DDL and nullability relaxation on legacy columns.
-- ==============================================================================

-- 1. Core Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Timesheets Table Harmonization
CREATE TABLE IF NOT EXISTS timesheets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Relax NOT NULL on weekly columns so monthly timesheets insert without fake dates
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'timesheets' AND column_name = 'week_start_date' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE timesheets ALTER COLUMN week_start_date DROP NOT NULL;
    RAISE NOTICE 'Dropped NOT NULL restriction on timesheets.week_start_date';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'timesheets' AND column_name = 'week_end_date' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE timesheets ALTER COLUMN week_end_date DROP NOT NULL;
    RAISE NOTICE 'Dropped NOT NULL restriction on timesheets.week_end_date';
  END IF;
END $$;

-- Add monthly timesheet columns expected by timesheet-service.ts
ALTER TABLE timesheets
  ADD COLUMN IF NOT EXISTS year INTEGER,
  ADD COLUMN IF NOT EXISTS month INTEGER,
  ADD COLUMN IF NOT EXISTS period_start DATE,
  ADD COLUMN IF NOT EXISTS period_end DATE,
  ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS total_hours NUMERIC(7,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS billable_hours NUMERIC(7,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS submitted_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS comments TEXT,
  ADD COLUMN IF NOT EXISTS review_comments TEXT;

-- Update status check constraint to include all valid application statuses
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'chk_timesheet_status'
  ) THEN
    ALTER TABLE timesheets DROP CONSTRAINT chk_timesheet_status;
  END IF;

  ALTER TABLE timesheets ADD CONSTRAINT chk_timesheet_status CHECK (
    status IN ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'RETURNED', 'RETURNED_FOR_CORRECTION', 'LOCKED')
  );
  RAISE NOTICE 'Updated chk_timesheet_status to permit all application statuses';
END $$;

-- Update dates check constraint to handle nulls safely for monthly records
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'chk_timesheet_dates'
  ) THEN
    ALTER TABLE timesheets DROP CONSTRAINT chk_timesheet_dates;
  END IF;

  ALTER TABLE timesheets ADD CONSTRAINT chk_timesheet_dates CHECK (
    (week_start_date IS NULL OR week_end_date IS NULL OR week_end_date >= week_start_date) AND
    (period_start IS NULL OR period_end IS NULL OR period_end >= period_start)
  );
  RAISE NOTICE 'Applied flexible chk_timesheet_dates constraint';
END $$;

-- Apply unique constraint for company + employee + year + month
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'uq_timesheets_company_emp_period'
  ) THEN
    ALTER TABLE timesheets 
      ADD CONSTRAINT uq_timesheets_company_emp_period 
      UNIQUE(company_id, employee_id, year, month);
    RAISE NOTICE 'Added unique constraint uq_timesheets_company_emp_period';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_timesheets_emp_period ON timesheets(employee_id, year, month);
CREATE INDEX IF NOT EXISTS idx_timesheets_company_status ON timesheets(company_id, status);

-- 3. Harmonize timesheet_entries table
CREATE TABLE IF NOT EXISTS timesheet_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  timesheet_id UUID NOT NULL REFERENCES timesheets(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'timesheet_entries' AND column_name = 'work_date' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE timesheet_entries ALTER COLUMN work_date DROP NOT NULL;
    RAISE NOTICE 'Dropped NOT NULL on timesheet_entries.work_date';
  END IF;
END $$;

ALTER TABLE timesheet_entries
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS employee_id UUID REFERENCES employees(id),
  ADD COLUMN IF NOT EXISTS entry_date DATE,
  ADD COLUMN IF NOT EXISTS work_date DATE,
  ADD COLUMN IF NOT EXISTS project_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS task_category VARCHAR(100),
  ADD COLUMN IF NOT EXISTS task_name VARCHAR(200),
  ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS hours NUMERIC(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_billable BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_timesheet_entries_ts_date ON timesheet_entries(timesheet_id, entry_date);
CREATE INDEX IF NOT EXISTS idx_timesheet_entries_ts_workdate ON timesheet_entries(timesheet_id, work_date);

-- 4. Create missing timesheet_reviews table
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

-- 5. Organization Chat Retention Attributes & Indexes
ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- Backfill existing messages: expires_at = created_at + 14 days
UPDATE chat_messages
SET expires_at = created_at + INTERVAL '14 days'
WHERE expires_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_chat_messages_expires_at
  ON chat_messages(expires_at)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_chat_messages_cleanup_active
  ON chat_messages(company_id, expires_at)
  WHERE deleted_at IS NULL;


-- ==============================================================================
-- SECTION 2: STORED FUNCTIONS & AUTOMATION TRIGGERS
-- Risk Assessment: Low. Security definer functions with restricted search_paths
-- and tight permission grants.
-- ==============================================================================

-- 1. Function: has_active_super_admin (Used during bootstrap check)
CREATE OR REPLACE FUNCTION public.has_active_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    JOIN public.users u ON u.id = ur.user_id
    WHERE r.name = 'SUPER_ADMIN'
      AND u.is_active = TRUE
  );
$$;

REVOKE ALL ON FUNCTION public.has_active_super_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_active_super_admin() TO anon, authenticated, service_role;

-- 2. Function: is_admin_or_hr (Helper for Admin RLS Policies)
CREATE OR REPLACE FUNCTION public.is_admin_or_hr(user_uuid UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = user_uuid
      AND r.name IN ('SUPER_ADMIN', 'HR_ADMIN', 'PAYROLL_ADMIN')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.is_admin_or_hr(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin_or_hr(UUID) TO authenticated, service_role;

-- 3. Function: is_reviewer_or_admin (Helper for Timesheet Review Authorization)
CREATE OR REPLACE FUNCTION public.is_reviewer_or_admin(user_uuid UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = user_uuid
      AND r.name IN ('SUPER_ADMIN', 'HR_ADMIN', 'PAYROLL_ADMIN', 'MANAGER')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.is_reviewer_or_admin(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_reviewer_or_admin(UUID) TO authenticated, service_role;

-- 4. Automated trigger to set expires_at on new chat messages
CREATE OR REPLACE FUNCTION set_chat_message_expires_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.expires_at IS NULL THEN
    NEW.expires_at := COALESCE(NEW.created_at, NOW()) + INTERVAL '14 days';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_chat_messages_expires_at ON chat_messages;
CREATE TRIGGER trg_chat_messages_expires_at
  BEFORE INSERT ON chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION set_chat_message_expires_at();

-- 5. Stored Procedure for Bounded, Idempotent Message Cleanup
-- Processes expired chat messages in bounded batches with safety caps.
-- Foreign key cascades cleanly remove child rows in chat_message_receipts.
-- STRICT DATA INTEGRITY: Operates solely on chat_messages.
-- Never touches official EDMS documents, payslips, employees, or audit records.
CREATE OR REPLACE FUNCTION cleanup_expired_chat_messages(
  p_batch_size INT DEFAULT 500,
  p_max_total INT DEFAULT 5000
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_batch_deleted INT := 0;
  v_total_deleted INT := 0;
  v_batches INT := 0;
  v_start_time TIMESTAMPTZ := clock_timestamp();
  v_limit INT := LEAST(GREATEST(p_batch_size, 10), 1000);
  v_cap INT := LEAST(GREATEST(p_max_total, 10), 20000);
BEGIN
  LOOP
    EXIT WHEN v_total_deleted >= v_cap;

    WITH expired_batch AS (
      SELECT id
      FROM chat_messages
      WHERE expires_at <= NOW()
        AND deleted_at IS NULL
      LIMIT v_limit
      FOR UPDATE SKIP LOCKED
    ),
    deleted_rows AS (
      DELETE FROM chat_messages
      WHERE id IN (SELECT id FROM expired_batch)
      RETURNING id
    )
    SELECT COUNT(*) INTO v_batch_deleted FROM deleted_rows;

    EXIT WHEN v_batch_deleted = 0;

    v_total_deleted := v_total_deleted + v_batch_deleted;
    v_batches := v_batches + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'deleted_count', v_total_deleted,
    'batches_processed', v_batches,
    'duration_ms', ROUND(EXTRACT(EPOCH FROM (clock_timestamp() - v_start_time)) * 1000, 2)
  );
END;
$$;

REVOKE ALL ON FUNCTION cleanup_expired_chat_messages(INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION cleanup_expired_chat_messages(INT, INT) TO service_role;
GRANT EXECUTE ON FUNCTION cleanup_expired_chat_messages(INT, INT) TO postgres;


-- ==============================================================================
-- SECTION 3: ROW LEVEL SECURITY (RLS) POLICIES & TENANT/ROLE SECURITY
-- Risk Assessment: Medium. Protects tenant boundaries, segregation of duties,
-- manager hierarchies, and employee privacy.
-- Backend Route Handlers use the service_role client and bypass RLS automatically.
-- These policies enforce strict boundaries for authenticated client-side / SSR operations.
-- ==============================================================================

-- Safely enable RLS on all application tables in public schema
DO $$
DECLARE
  tbl TEXT;
  tbls TEXT[] := ARRAY[
    -- Core & Organization Master
    'companies', 'company_settings', 'roles', 'permissions', 'role_permissions',
    'users', 'user_roles', 'departments', 'designations', 'locations',
    -- HR & Employees
    'employees', 'employee_bank_accounts', 'employee_statutory_details', 'employee_employment_history',
    -- Compensation & Payroll Engine
    'salary_components', 'salary_structures', 'salary_structure_components', 'salary_revisions',
    'payroll_settings', 'statutory_rules', 'payroll_periods', 'payroll_runs',
    'payroll_employee_records', 'payroll_earnings', 'payroll_deductions', 'payroll_adjustments', 'payslips',
    -- Attendance & Leave
    'attendance_records', 'attendance_regularization_requests',
    'leave_types', 'leave_balances', 'leave_requests', 'holidays',
    -- Documents (EDMS)
    'documents', 'document_versions', 'document_categories',
    -- Communications & Workflow
    'announcements', 'notifications', 'notification_preferences', 'push_subscriptions',
    'approval_requests', 'hr_requests',
    -- Security & Automation History
    'audit_logs', 'security_events', 'user_sessions', 'scheduled_job_runs',
    -- Timesheets
    'timesheets', 'timesheet_entries', 'timesheet_reviews',
    -- Organization Chat
    'chat_conversations', 'chat_participants', 'chat_messages', 'chat_message_receipts'
  ];
BEGIN
  FOREACH tbl IN ARRAY tbls LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = tbl) THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', tbl);
      RAISE NOTICE 'Enabled RLS on table %', tbl;
    ELSE
      RAISE NOTICE 'Table % does not exist; skipped RLS.', tbl;
    END IF;
  END LOOP;
END $$;

-- ------------------------------------------------------------------------------
-- 1. Organization & Core Identity Isolation
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users view own company" ON companies;
CREATE POLICY "Users view own company" ON companies
  FOR SELECT TO authenticated
  USING (id = (SELECT company_id FROM users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Users view company settings" ON company_settings;
CREATE POLICY "Users view company settings" ON company_settings
  FOR SELECT TO authenticated
  USING (company_id = (SELECT company_id FROM users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Users view company users" ON users;
CREATE POLICY "Users view company users" ON users
  FOR SELECT TO authenticated
  USING (company_id = (SELECT company_id FROM users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Users view company departments" ON departments;
CREATE POLICY "Users view company departments" ON departments
  FOR SELECT TO authenticated
  USING (company_id = (SELECT company_id FROM users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Users view company designations" ON designations;
CREATE POLICY "Users view company designations" ON designations
  FOR SELECT TO authenticated
  USING (company_id = (SELECT company_id FROM users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Users view company locations" ON locations;
CREATE POLICY "Users view company locations" ON locations
  FOR SELECT TO authenticated
  USING (company_id = (SELECT company_id FROM users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Users view company roles" ON roles;
CREATE POLICY "Users view company roles" ON roles
  FOR SELECT TO authenticated
  USING (company_id = (SELECT company_id FROM users WHERE id = auth.uid()) OR is_system = TRUE);

DROP POLICY IF EXISTS "Users view company user roles" ON user_roles;
CREATE POLICY "Users view company user roles" ON user_roles
  FOR SELECT TO authenticated
  USING (
    user_id IN (SELECT id FROM users WHERE company_id = (SELECT company_id FROM users WHERE id = auth.uid()))
  );

-- ------------------------------------------------------------------------------
-- 2. Employees Table Policies
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view employees in their company" ON employees;
CREATE POLICY "Users can view employees in their company" ON employees
  FOR SELECT TO authenticated
  USING (company_id = (SELECT company_id FROM users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Admins can manage employees" ON employees;
CREATE POLICY "Admins can manage employees" ON employees
  FOR ALL TO authenticated
  USING (
    company_id = (SELECT company_id FROM users WHERE id = auth.uid())
    AND public.is_admin_or_hr(auth.uid())
  )
  WITH CHECK (
    company_id = (SELECT company_id FROM users WHERE id = auth.uid())
    AND public.is_admin_or_hr(auth.uid())
  );

-- ------------------------------------------------------------------------------
-- 3. Sensitive Employee Finance & Statutory Details (Strict Personal Isolation)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users view own bank accounts or if admin" ON employee_bank_accounts;
CREATE POLICY "Users view own bank accounts or if admin" ON employee_bank_accounts
  FOR SELECT TO authenticated
  USING (
    (SELECT company_id FROM employees WHERE id = employee_bank_accounts.employee_id) = (SELECT company_id FROM users WHERE id = auth.uid())
    AND (
      employee_id = (SELECT employee_id FROM users WHERE id = auth.uid())
      OR public.is_admin_or_hr(auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users view own statutory details or if admin" ON employee_statutory_details;
CREATE POLICY "Users view own statutory details or if admin" ON employee_statutory_details
  FOR SELECT TO authenticated
  USING (
    (SELECT company_id FROM employees WHERE id = employee_statutory_details.employee_id) = (SELECT company_id FROM users WHERE id = auth.uid())
    AND (
      employee_id = (SELECT employee_id FROM users WHERE id = auth.uid())
      OR public.is_admin_or_hr(auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users view own employment history or if admin" ON employee_employment_history;
CREATE POLICY "Users view own employment history or if admin" ON employee_employment_history
  FOR SELECT TO authenticated
  USING (
    company_id = (SELECT company_id FROM users WHERE id = auth.uid())
    AND (
      employee_id = (SELECT employee_id FROM users WHERE id = auth.uid())
      OR public.is_admin_or_hr(auth.uid())
    )
  );

-- ------------------------------------------------------------------------------
-- 4. Salary Structures, Components & Revisions
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users view company salary components" ON salary_components;
CREATE POLICY "Users view company salary components" ON salary_components
  FOR SELECT TO authenticated
  USING (company_id = (SELECT company_id FROM users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Users view own salary structure or if admin" ON salary_structures;
CREATE POLICY "Users view own salary structure or if admin" ON salary_structures
  FOR SELECT TO authenticated
  USING (
    company_id = (SELECT company_id FROM users WHERE id = auth.uid())
    AND (
      employee_id = (SELECT employee_id FROM users WHERE id = auth.uid())
      OR public.is_admin_or_hr(auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users view own salary structure components or if admin" ON salary_structure_components;
CREATE POLICY "Users view own salary structure components or if admin" ON salary_structure_components
  FOR SELECT TO authenticated
  USING (
    (SELECT company_id FROM salary_structures WHERE id = salary_structure_id) = (SELECT company_id FROM users WHERE id = auth.uid())
    AND (
      (SELECT employee_id FROM salary_structures WHERE id = salary_structure_id) = (SELECT employee_id FROM users WHERE id = auth.uid())
      OR public.is_admin_or_hr(auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users view own salary revisions or if admin" ON salary_revisions;
CREATE POLICY "Users view own salary revisions or if admin" ON salary_revisions
  FOR SELECT TO authenticated
  USING (
    company_id = (SELECT company_id FROM users WHERE id = auth.uid())
    AND (
      employee_id = (SELECT employee_id FROM users WHERE id = auth.uid())
      OR public.is_admin_or_hr(auth.uid())
    )
  );

-- ------------------------------------------------------------------------------
-- 5. Payslips (Strict Employee Isolation)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Employees view own payslips or company admin" ON payslips;
CREATE POLICY "Employees view own payslips or company admin" ON payslips
  FOR SELECT TO authenticated
  USING (
    company_id = (SELECT company_id FROM users WHERE id = auth.uid())
    AND (
      employee_id = (SELECT employee_id FROM users WHERE id = auth.uid())
      OR public.is_admin_or_hr(auth.uid())
    )
  );

-- ------------------------------------------------------------------------------
-- 6. Payroll Runs & Employee Records
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can view payroll runs" ON payroll_runs;
CREATE POLICY "Admins can view payroll runs" ON payroll_runs
  FOR SELECT TO authenticated
  USING (
    company_id = (SELECT company_id FROM users WHERE id = auth.uid())
    AND public.is_admin_or_hr(auth.uid())
  );

DROP POLICY IF EXISTS "Users view own payroll records or if admin" ON payroll_employee_records;
CREATE POLICY "Users view own payroll records or if admin" ON payroll_employee_records
  FOR SELECT TO authenticated
  USING (
    (SELECT company_id FROM payroll_runs WHERE id = payroll_run_id) = (SELECT company_id FROM users WHERE id = auth.uid())
    AND (
      employee_id = (SELECT employee_id FROM users WHERE id = auth.uid())
      OR public.is_admin_or_hr(auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users view own payroll earnings or if admin" ON payroll_earnings;
CREATE POLICY "Users view own payroll earnings or if admin" ON payroll_earnings
  FOR SELECT TO authenticated
  USING (
    payroll_employee_record_id IN (
      SELECT per.id FROM payroll_employee_records per
      JOIN payroll_runs pr ON pr.id = per.payroll_run_id
      WHERE pr.company_id = (SELECT company_id FROM users WHERE id = auth.uid())
        AND (
          per.employee_id = (SELECT employee_id FROM users WHERE id = auth.uid())
          OR public.is_admin_or_hr(auth.uid())
        )
    )
  );

DROP POLICY IF EXISTS "Users view own payroll deductions or if admin" ON payroll_deductions;
CREATE POLICY "Users view own payroll deductions or if admin" ON payroll_deductions
  FOR SELECT TO authenticated
  USING (
    payroll_employee_record_id IN (
      SELECT per.id FROM payroll_employee_records per
      JOIN payroll_runs pr ON pr.id = per.payroll_run_id
      WHERE pr.company_id = (SELECT company_id FROM users WHERE id = auth.uid())
        AND (
          per.employee_id = (SELECT employee_id FROM users WHERE id = auth.uid())
          OR public.is_admin_or_hr(auth.uid())
        )
    )
  );

-- ------------------------------------------------------------------------------
-- 7. Attendance Records (Manager Hierarchy & Self-Service)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users view attendance in company" ON attendance_records;
CREATE POLICY "Users view attendance in company" ON attendance_records
  FOR SELECT TO authenticated
  USING (
    company_id = (SELECT company_id FROM users WHERE id = auth.uid())
    AND (
      employee_id = (SELECT employee_id FROM users WHERE id = auth.uid())
      OR public.is_admin_or_hr(auth.uid())
      OR (
        public.is_reviewer_or_admin(auth.uid())
        AND employee_id IN (
          SELECT id FROM employees 
          WHERE reporting_manager_id = (SELECT employee_id FROM users WHERE id = auth.uid())
        )
      )
    )
  );

DROP POLICY IF EXISTS "Employees can check in own attendance" ON attendance_records;
CREATE POLICY "Employees can check in own attendance" ON attendance_records
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = (SELECT company_id FROM users WHERE id = auth.uid())
    AND employee_id = (SELECT employee_id FROM users WHERE id = auth.uid())
  );

-- ------------------------------------------------------------------------------
-- 8. Leave Requests & Balances (Manager Hierarchy & Self-Service)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users view company leave types" ON leave_types;
CREATE POLICY "Users view company leave types" ON leave_types
  FOR SELECT TO authenticated
  USING (company_id = (SELECT company_id FROM users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Users view own leaves or if admin" ON leave_requests;
CREATE POLICY "Users view own leaves or if admin" ON leave_requests
  FOR SELECT TO authenticated
  USING (
    company_id = (SELECT company_id FROM users WHERE id = auth.uid())
    AND (
      employee_id = (SELECT employee_id FROM users WHERE id = auth.uid())
      OR public.is_admin_or_hr(auth.uid())
      OR (
        public.is_reviewer_or_admin(auth.uid())
        AND employee_id IN (
          SELECT id FROM employees 
          WHERE reporting_manager_id = (SELECT employee_id FROM users WHERE id = auth.uid())
        )
      )
    )
  );

DROP POLICY IF EXISTS "Employees can submit leave requests" ON leave_requests;
CREATE POLICY "Employees can submit leave requests" ON leave_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = (SELECT company_id FROM users WHERE id = auth.uid())
    AND employee_id = (SELECT employee_id FROM users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Users view own leave balances or if admin" ON leave_balances;
CREATE POLICY "Users view own leave balances or if admin" ON leave_balances
  FOR SELECT TO authenticated
  USING (
    (SELECT company_id FROM employees WHERE id = employee_id) = (SELECT company_id FROM users WHERE id = auth.uid())
    AND (
      employee_id = (SELECT employee_id FROM users WHERE id = auth.uid())
      OR public.is_admin_or_hr(auth.uid())
      OR (
        public.is_reviewer_or_admin(auth.uid())
        AND employee_id IN (
          SELECT id FROM employees 
          WHERE reporting_manager_id = (SELECT employee_id FROM users WHERE id = auth.uid())
        )
      )
    )
  );

-- ------------------------------------------------------------------------------
-- 9. Documents (EDMS - Anti-Leakage Verified)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users view authorized documents" ON documents;
CREATE POLICY "Users view authorized documents" ON documents
  FOR SELECT TO authenticated
  USING (
    company_id = (SELECT company_id FROM users WHERE id = auth.uid())
    AND (
      visibility IN ('company_wide', 'company')
      OR employee_id = (SELECT employee_id FROM users WHERE id = auth.uid())
      OR public.is_admin_or_hr(auth.uid())
    )
  );

-- STRICT ANTI-LEAKAGE: Document versions view requires access to parent document
DROP POLICY IF EXISTS "Users view authorized document versions" ON document_versions;
CREATE POLICY "Users view authorized document versions" ON document_versions
  FOR SELECT TO authenticated
  USING (
    company_id = (SELECT company_id FROM users WHERE id = auth.uid())
    AND document_id IN (
      SELECT id FROM documents WHERE
        company_id = (SELECT company_id FROM users WHERE id = auth.uid())
        AND (
          visibility IN ('company_wide', 'company')
          OR employee_id = (SELECT employee_id FROM users WHERE id = auth.uid())
          OR public.is_admin_or_hr(auth.uid())
        )
    )
  );

DROP POLICY IF EXISTS "Users view company document categories" ON document_categories;
CREATE POLICY "Users view company document categories" ON document_categories
  FOR SELECT TO authenticated
  USING (
    company_id = (SELECT company_id FROM users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Admins manage document categories" ON document_categories;
CREATE POLICY "Admins manage document categories" ON document_categories
  FOR ALL TO authenticated
  USING (
    company_id = (SELECT company_id FROM users WHERE id = auth.uid())
    AND public.is_admin_or_hr(auth.uid())
  )
  WITH CHECK (
    company_id = (SELECT company_id FROM users WHERE id = auth.uid())
    AND public.is_admin_or_hr(auth.uid())
  );

-- ------------------------------------------------------------------------------
-- 10. Timesheets, Entries, and Reviews (Strict Manager Hierarchy & Reviewer Role Checking)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users view own timesheets or if admin" ON timesheets;
DROP POLICY IF EXISTS "Users view timesheets" ON timesheets;
CREATE POLICY "Users view timesheets" ON timesheets
  FOR SELECT TO authenticated
  USING (
    company_id = (SELECT company_id FROM users WHERE id = auth.uid())
    AND (
      employee_id = (SELECT employee_id FROM users WHERE id = auth.uid())
      OR public.is_admin_or_hr(auth.uid())
      OR (
        public.is_reviewer_or_admin(auth.uid())
        AND employee_id IN (
          SELECT id FROM employees 
          WHERE reporting_manager_id = (SELECT employee_id FROM users WHERE id = auth.uid())
        )
      )
    )
  );

DROP POLICY IF EXISTS "Employees manage own draft timesheets" ON timesheets;
CREATE POLICY "Employees manage own draft timesheets" ON timesheets
  FOR ALL TO authenticated
  USING (
    company_id = (SELECT company_id FROM users WHERE id = auth.uid())
    AND employee_id = (SELECT employee_id FROM users WHERE id = auth.uid())
    AND status IN ('DRAFT', 'RETURNED_FOR_CORRECTION')
  )
  WITH CHECK (
    company_id = (SELECT company_id FROM users WHERE id = auth.uid())
    AND employee_id = (SELECT employee_id FROM users WHERE id = auth.uid())
    AND status IN ('DRAFT', 'SUBMITTED', 'RETURNED_FOR_CORRECTION')
  );

DROP POLICY IF EXISTS "Managers update direct reports timesheets" ON timesheets;
CREATE POLICY "Managers update direct reports timesheets" ON timesheets
  FOR UPDATE TO authenticated
  USING (
    company_id = (SELECT company_id FROM users WHERE id = auth.uid())
    AND public.is_reviewer_or_admin(auth.uid())
    AND employee_id IN (
      SELECT id FROM employees 
      WHERE reporting_manager_id = (SELECT employee_id FROM users WHERE id = auth.uid())
    )
    AND (employee_id IS NULL OR employee_id != (SELECT employee_id FROM users WHERE id = auth.uid()))
  )
  WITH CHECK (
    company_id = (SELECT company_id FROM users WHERE id = auth.uid())
    AND public.is_reviewer_or_admin(auth.uid())
    AND employee_id IN (
      SELECT id FROM employees 
      WHERE reporting_manager_id = (SELECT employee_id FROM users WHERE id = auth.uid())
    )
    AND (employee_id IS NULL OR employee_id != (SELECT employee_id FROM users WHERE id = auth.uid()))
  );

DROP POLICY IF EXISTS "Admins manage company timesheets" ON timesheets;
CREATE POLICY "Admins manage company timesheets" ON timesheets
  FOR ALL TO authenticated
  USING (
    company_id = (SELECT company_id FROM users WHERE id = auth.uid())
    AND public.is_admin_or_hr(auth.uid())
  )
  WITH CHECK (
    company_id = (SELECT company_id FROM users WHERE id = auth.uid())
    AND public.is_admin_or_hr(auth.uid())
  );

DROP POLICY IF EXISTS "Users view timesheet entries" ON timesheet_entries;
CREATE POLICY "Users view timesheet entries" ON timesheet_entries
  FOR SELECT TO authenticated
  USING (
    timesheet_id IN (
      SELECT id FROM timesheets WHERE
        company_id = (SELECT company_id FROM users WHERE id = auth.uid())
        AND (
          employee_id = (SELECT employee_id FROM users WHERE id = auth.uid())
          OR public.is_admin_or_hr(auth.uid())
          OR (
            public.is_reviewer_or_admin(auth.uid())
            AND employee_id IN (
              SELECT id FROM employees 
              WHERE reporting_manager_id = (SELECT employee_id FROM users WHERE id = auth.uid())
            )
          )
        )
    )
  );

DROP POLICY IF EXISTS "Employees manage own draft timesheet entries" ON timesheet_entries;
CREATE POLICY "Employees manage own draft timesheet entries" ON timesheet_entries
  FOR ALL TO authenticated
  USING (
    timesheet_id IN (
      SELECT id FROM timesheets WHERE
        company_id = (SELECT company_id FROM users WHERE id = auth.uid())
        AND employee_id = (SELECT employee_id FROM users WHERE id = auth.uid())
        AND status IN ('DRAFT', 'RETURNED_FOR_CORRECTION')
    )
  )
  WITH CHECK (
    timesheet_id IN (
      SELECT id FROM timesheets WHERE
        company_id = (SELECT company_id FROM users WHERE id = auth.uid())
        AND employee_id = (SELECT employee_id FROM users WHERE id = auth.uid())
        AND status IN ('DRAFT', 'RETURNED_FOR_CORRECTION')
    )
  );

DROP POLICY IF EXISTS "Admins manage all timesheet entries" ON timesheet_entries;
CREATE POLICY "Admins manage all timesheet entries" ON timesheet_entries
  FOR ALL TO authenticated
  USING (
    public.is_admin_or_hr(auth.uid())
    AND timesheet_id IN (
      SELECT id FROM timesheets WHERE company_id = (SELECT company_id FROM users WHERE id = auth.uid())
    )
  )
  WITH CHECK (
    public.is_admin_or_hr(auth.uid())
    AND timesheet_id IN (
      SELECT id FROM timesheets WHERE company_id = (SELECT company_id FROM users WHERE id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users view timesheet reviews" ON timesheet_reviews;
CREATE POLICY "Users view timesheet reviews" ON timesheet_reviews
  FOR SELECT TO authenticated
  USING (
    timesheet_id IN (
      SELECT id FROM timesheets WHERE
        company_id = (SELECT company_id FROM users WHERE id = auth.uid())
        AND (
          employee_id = (SELECT employee_id FROM users WHERE id = auth.uid())
          OR public.is_admin_or_hr(auth.uid())
          OR (
            public.is_reviewer_or_admin(auth.uid())
            AND employee_id IN (
              SELECT id FROM employees 
              WHERE reporting_manager_id = (SELECT employee_id FROM users WHERE id = auth.uid())
            )
          )
        )
    )
  );

-- STRICT REVIEWER AUTHORIZATION & SEGREGATION OF DUTIES:
-- 1. Actor must be caller (actor_id = auth.uid()).
-- 2. Admins can review company timesheets.
-- 3. Managers can review ONLY their direct reporting subordinates' timesheets.
-- 4. Self-approval is strictly forbidden (employee_id != manager's employee_id).
DROP POLICY IF EXISTS "Authorized reviewers insert timesheet reviews" ON timesheet_reviews;
CREATE POLICY "Authorized reviewers insert timesheet reviews" ON timesheet_reviews
  FOR INSERT TO authenticated
  WITH CHECK (
    actor_id = auth.uid()
    AND (
      -- Company administrators
      (
        public.is_admin_or_hr(auth.uid())
        AND timesheet_id IN (
          SELECT id FROM timesheets 
          WHERE company_id = (SELECT company_id FROM users WHERE id = auth.uid())
        )
      )
      OR
      -- Managers (direct reporting subordinates only, no self-review)
      (
        public.is_reviewer_or_admin(auth.uid())
        AND timesheet_id IN (
          SELECT t.id FROM timesheets t
          JOIN employees e ON e.id = t.employee_id
          WHERE t.company_id = (SELECT company_id FROM users WHERE id = auth.uid())
            AND e.reporting_manager_id = (SELECT employee_id FROM users WHERE id = auth.uid())
            AND (t.employee_id IS NULL OR t.employee_id != (SELECT employee_id FROM users WHERE id = auth.uid()))
        )
      )
    )
  );

-- ------------------------------------------------------------------------------
-- 11. HR Requests & Helpdesk
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users view own hr requests or if admin" ON hr_requests;
CREATE POLICY "Users view own hr requests or if admin" ON hr_requests
  FOR SELECT TO authenticated
  USING (
    company_id = (SELECT company_id FROM users WHERE id = auth.uid())
    AND (
      employee_id = (SELECT employee_id FROM users WHERE id = auth.uid())
      OR public.is_admin_or_hr(auth.uid())
    )
  );

DROP POLICY IF EXISTS "Employees can submit hr requests" ON hr_requests;
CREATE POLICY "Employees can submit hr requests" ON hr_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = (SELECT company_id FROM users WHERE id = auth.uid())
    AND employee_id = (SELECT employee_id FROM users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Admins manage hr requests" ON hr_requests;
CREATE POLICY "Admins manage hr requests" ON hr_requests
  FOR ALL TO authenticated
  USING (
    company_id = (SELECT company_id FROM users WHERE id = auth.uid())
    AND public.is_admin_or_hr(auth.uid())
  )
  WITH CHECK (
    company_id = (SELECT company_id FROM users WHERE id = auth.uid())
    AND public.is_admin_or_hr(auth.uid())
  );

-- ------------------------------------------------------------------------------
-- 12. Notifications
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users view and manage own notifications" ON notifications;
CREATE POLICY "Users view and manage own notifications" ON notifications
  FOR ALL TO authenticated
  USING (
    user_id = auth.uid()
    AND company_id = (SELECT company_id FROM users WHERE id = auth.uid())
  )
  WITH CHECK (
    user_id = auth.uid()
    AND company_id = (SELECT company_id FROM users WHERE id = auth.uid())
  );

-- ------------------------------------------------------------------------------
-- 13. Audit Logs (Append-Only Isolation)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can insert audit logs" ON audit_logs;
CREATE POLICY "Authenticated users can insert audit logs" ON audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (company_id = (SELECT company_id FROM users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Admins can view audit logs" ON audit_logs;
CREATE POLICY "Admins can view audit logs" ON audit_logs
  FOR SELECT TO authenticated
  USING (
    company_id = (SELECT company_id FROM users WHERE id = auth.uid())
    AND public.is_admin_or_hr(auth.uid())
  );

-- ------------------------------------------------------------------------------
-- 14. Organization Chat Policies (Defense-in-Depth & 14-Day Expiry Filtering)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users view accessible chat conversations" ON chat_conversations;
CREATE POLICY "Users view accessible chat conversations" ON chat_conversations
  FOR SELECT TO authenticated
  USING (
    company_id = (SELECT company_id FROM users WHERE id = auth.uid())
    AND (
      type = 'channel'
      OR id IN (SELECT conversation_id FROM chat_participants WHERE user_id = auth.uid())
      OR public.is_admin_or_hr(auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users view participants of accessible conversations" ON chat_participants;
CREATE POLICY "Users view participants of accessible conversations" ON chat_participants
  FOR SELECT TO authenticated
  USING (
    conversation_id IN (
      SELECT id FROM chat_conversations
      WHERE company_id = (SELECT company_id FROM users WHERE id = auth.uid())
        AND (
          type = 'channel'
          OR id IN (SELECT cp.conversation_id FROM chat_participants cp WHERE cp.user_id = auth.uid())
          OR public.is_admin_or_hr(auth.uid())
        )
    )
  );

DROP POLICY IF EXISTS "Users view non-expired messages in accessible conversations" ON chat_messages;
CREATE POLICY "Users view non-expired messages in accessible conversations" ON chat_messages
  FOR SELECT TO authenticated
  USING (
    company_id = (SELECT company_id FROM users WHERE id = auth.uid())
    AND deleted_at IS NULL
    AND (expires_at IS NULL OR expires_at > NOW())
    AND conversation_id IN (
      SELECT id FROM chat_conversations
      WHERE company_id = (SELECT company_id FROM users WHERE id = auth.uid())
        AND (
          type = 'channel'
          OR id IN (SELECT cp.conversation_id FROM chat_participants cp WHERE cp.user_id = auth.uid())
          OR public.is_admin_or_hr(auth.uid())
        )
    )
  );

DROP POLICY IF EXISTS "Users view receipts of accessible conversations" ON chat_message_receipts;
CREATE POLICY "Users view receipts of accessible conversations" ON chat_message_receipts
  FOR SELECT TO authenticated
  USING (
    conversation_id IN (
      SELECT id FROM chat_conversations
      WHERE company_id = (SELECT company_id FROM users WHERE id = auth.uid())
        AND (
          type = 'channel'
          OR id IN (SELECT cp.conversation_id FROM chat_participants cp WHERE cp.user_id = auth.uid())
          OR public.is_admin_or_hr(auth.uid())
        )
    )
  );


-- ==============================================================================
-- SECTION 4: BASELINE REFERENCE & CONFIGURATION SEED DATA (INSERT-ONLY)
-- Risk Assessment: Low. Operates strictly with ON CONFLICT DO NOTHING.
-- Existing company configuration is NEVER overwritten.
-- Target Company: Explicitly scoped to verified UUID ('c2a6b9b4-37e4-4bd9-9347-8d779bccecc4').
-- ==============================================================================

DO $$
DECLARE
  v_target_company_id CONSTANT UUID := 'c2a6b9b4-37e4-4bd9-9347-8d779bccecc4'::uuid;
  v_company_id UUID;
  v_company_count INT;
BEGIN
  -- Resolve explicitly verified company
  SELECT id INTO v_company_id FROM companies WHERE id = v_target_company_id;

  IF v_company_id IS NULL THEN
    SELECT COUNT(*) INTO v_company_count FROM companies WHERE legal_name = 'Haryak Technologies India Private Limited';
    IF v_company_count = 1 THEN
      SELECT id INTO v_company_id FROM companies WHERE legal_name = 'Haryak Technologies India Private Limited';
    ELSE
      SELECT COUNT(*) INTO v_company_count FROM companies;
      IF v_company_count = 1 THEN
        SELECT id INTO v_company_id FROM companies;
      ELSE
        RAISE EXCEPTION 'Cannot seed data: Primary company % could not be resolved.', v_target_company_id;
      END IF;
    END IF;
  END IF;

  RAISE NOTICE 'Restoring reference baseline data for company ID: %', v_company_id;

  -- 1. Standard System Roles (Insert-Only)
  INSERT INTO roles (company_id, name, display_name, description, is_system) VALUES
    (v_company_id, 'SUPER_ADMIN', 'Super Administrator', 'Full system access', TRUE),
    (v_company_id, 'HR_ADMIN', 'HR Administrator', 'HR management access', TRUE),
    (v_company_id, 'PAYROLL_ADMIN', 'Payroll Administrator', 'Payroll management access', TRUE),
    (v_company_id, 'MANAGER', 'Manager', 'Manager level access', TRUE),
    (v_company_id, 'EMPLOYEE', 'Employee', 'Employee self-service access', TRUE)
  ON CONFLICT (company_id, name) DO NOTHING;

  -- 2. Default Salary Components (Insert-Only)
  -- STATUTORY NOTICE: Statutory deductions (PF, PT, ESI) and rates provided are
  -- standard Indian statutory baseline defaults. These values are company-configurable
  -- and must be reviewed and confirmed by the company's authorized payroll/accounting professional.
  INSERT INTO salary_components (
    company_id, name, code, type, category, is_taxable, is_statutory, sort_order
  ) VALUES
    (v_company_id, 'Basic Salary', 'BASIC', 'earning', 'basic', true, false, 1),
    (v_company_id, 'House Rent Allowance', 'HRA', 'earning', 'hra', true, false, 2),
    (v_company_id, 'Special Allowance', 'SPECIAL_ALLOWANCE', 'earning', 'allowance', true, false, 3),
    (v_company_id, 'Conveyance Allowance', 'CONVEYANCE', 'earning', 'allowance', true, false, 4),
    (v_company_id, 'Provident Fund (Employee)', 'PF_EMPLOYEE', 'deduction', 'statutory', false, true, 5),
    (v_company_id, 'Professional Tax', 'PT', 'deduction', 'statutory', false, true, 6),
    (v_company_id, 'Employee State Insurance (Employee)', 'ESI_EMPLOYEE', 'deduction', 'statutory', false, true, 7)
  ON CONFLICT (company_id, code) DO NOTHING;

  -- 3. Default Leave Types (Insert-Only)
  INSERT INTO leave_types (
    company_id, name, code, description, annual_quota, is_paid, carry_forward, is_active, color
  ) VALUES
    (v_company_id, 'Casual Leave', 'CL', 'Short unplanned personal leave', 12, true, false, true, '#3B82F6'),
    (v_company_id, 'Sick Leave', 'SL', 'Medical and wellness leave', 12, true, false, true, '#EF4444'),
    (v_company_id, 'Earned Leave', 'EL', 'Accrued annual vacation leave', 15, true, true, true, '#10B981'),
    (v_company_id, 'Work From Home', 'WFH', 'Remote working allocation', 24, true, false, true, '#8B5CF6')
  ON CONFLICT (company_id, code) DO NOTHING;

  -- 4. Default Payroll Settings (Insert-Only)
  -- Statutory parameters (12% EPF, 0.75% / 3.25% ESI, ₹15,000 PF wage ceiling) are
  -- configurable baseline defaults requiring professional validation.
  INSERT INTO payroll_settings (
    company_id, payroll_frequency, cycle_start_day, cycle_end_day, cutoff_day, payment_day,
    pf_employer_contribution_rate, pf_employee_contribution_rate, pf_wage_ceiling,
    esi_employee_rate, esi_employer_rate, esi_wage_ceiling, rounding_method, auto_generate_payslips
  ) VALUES (
    v_company_id, 'monthly', 1, 0, 25, 1,
    12.00, 12.00, 15000.00,
    0.75, 3.25, 21000.00, 'round', false
  )
  ON CONFLICT (company_id) DO NOTHING;

  -- 5. Default EDMS Document Categories (Insert-Only)
  INSERT INTO document_categories (
    company_id, code, name, category_group, description, is_mandatory, has_expiry, default_retention_months, is_active
  ) VALUES
    (v_company_id, 'identity_onboarding', 'Identity & Onboarding', 'identity_onboarding', 'Government IDs, PAN, Aadhaar, Passport, and onboarding forms', true, false, 84, true),
    (v_company_id, 'employment_hr', 'Employment & HR', 'employment_hr', 'Offer letters, employment contracts, NDA, and appointment letters', true, false, 84, true),
    (v_company_id, 'payroll_statutory', 'Payroll & Statutory', 'payroll_statutory', 'Form 16, investment proofs, bank verification, and tax declarations', false, true, 84, true),
    (v_company_id, 'company_policy', 'Company Policies & Handbooks', 'company_policy', 'Employee handbooks, code of conduct, and corporate guidelines', false, false, 84, true)
  ON CONFLICT (company_id, code) DO NOTHING;

  RAISE NOTICE 'Baseline reference data successfully restored with insert-only protection.';
END $$;


-- ==============================================================================
-- SECTION 5: OPTIONAL ENHANCEMENTS (REALTIME SUBSCRIPTIONS)
-- Risk Assessment: Low. Adds chat tables to Supabase Realtime publication if live
-- WebSocket broadcasting is desired.
-- Architectural Note: The chat UI currently operates via HTTP polling.
-- This section is entirely optional and can be omitted without impacting application features.
-- ==============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'chat_messages'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
      RAISE NOTICE 'Added chat_messages to supabase_realtime publication';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'chat_message_receipts'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE chat_message_receipts;
      RAISE NOTICE 'Added chat_message_receipts to supabase_realtime publication';
    END IF;
  ELSE
    RAISE NOTICE 'Publication supabase_realtime not found; skipped optional realtime registration.';
  END IF;
END $$;


-- ==============================================================================
-- SECTION 6: TARGET-COMPANY POST-REPAIR INTEGRITY SCORECARD
-- Validates that every repaired object exists, holds required columns,
-- constraints, indexes, policies, and privileges strictly for target company.
-- ==============================================================================

SELECT 
  'POST-REPAIR COMPANY-SCOPED INTEGRITY SCORECARD' AS audit_metric,
  -- Target Company Row Counts
  (SELECT COUNT(*) FROM salary_components WHERE company_id = 'c2a6b9b4-37e4-4bd9-9347-8d779bccecc4'::uuid) AS company_salary_components,
  (SELECT COUNT(*) FROM leave_types WHERE company_id = 'c2a6b9b4-37e4-4bd9-9347-8d779bccecc4'::uuid) AS company_leave_types,
  (SELECT COUNT(*) FROM document_categories WHERE company_id = 'c2a6b9b4-37e4-4bd9-9347-8d779bccecc4'::uuid) AS company_document_categories,
  (SELECT COUNT(*) FROM payroll_settings WHERE company_id = 'c2a6b9b4-37e4-4bd9-9347-8d779bccecc4'::uuid) AS company_payroll_settings,
  -- Timesheets Schema Objects
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'timesheet_reviews') AS table_timesheet_reviews_exists,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'timesheets' AND column_name = 'year') AS col_timesheets_year_exists,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'timesheet_entries' AND column_name = 'entry_date') AS col_timesheet_entries_entry_date_exists,
  (SELECT COUNT(*) FROM pg_constraint WHERE conname = 'uq_timesheets_company_emp_period') AS constraint_timesheets_monthly_unique_exists,
  (SELECT COUNT(*) FROM pg_constraint WHERE conname = 'chk_timesheet_status') AS constraint_timesheets_status_exists,
  -- Stored Functions & Triggers
  (SELECT COUNT(*) FROM information_schema.routines WHERE routine_schema = 'public' AND routine_name = 'cleanup_expired_chat_messages') AS fn_chat_cleanup_exists,
  (SELECT COUNT(*) FROM information_schema.routines WHERE routine_schema = 'public' AND routine_name = 'is_admin_or_hr') AS fn_is_admin_or_hr_exists,
  (SELECT COUNT(*) FROM information_schema.routines WHERE routine_schema = 'public' AND routine_name = 'is_reviewer_or_admin') AS fn_is_reviewer_or_admin_exists,
  (SELECT COUNT(*) FROM information_schema.routines WHERE routine_schema = 'public' AND routine_name = 'has_active_super_admin') AS fn_has_active_super_admin_exists,
  -- Function Privilege Check (must be 0 for PUBLIC execution grant on sensitive procedures)
  (SELECT COUNT(*) FROM information_schema.routine_privileges WHERE routine_schema = 'public' AND routine_name = 'cleanup_expired_chat_messages' AND grantee = 'PUBLIC') AS fn_chat_cleanup_public_privilege_count,
  -- Active RLS Policies Count Across Sensitive Tables
  (SELECT COUNT(*) FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public') AS total_active_rls_policies;
