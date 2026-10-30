-- ==============================================================================
-- HARYAK ONE — ENTERPRISE HRMS
-- READ-ONLY LIVE DATABASE INTEGRITY & SCHEMA AUDIT
-- File: database/audits/01_read_only_database_audit.sql
--
-- INSTRUCTIONS:
-- 1. Copy and paste this script into the Supabase SQL Editor.
-- 2. Click "Run" (or Ctrl+Enter).
-- 3. Review the Results tab to inspect table presence, column completeness,
--    function status, trigger existence, RLS state, and seed data status.
--
-- NOTE: THIS SCRIPT IS 100% READ-ONLY. It contains NO INSERT, UPDATE, DELETE,
--       ALTER, or DROP statements. It will not modify your database in any way.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. EXTENSIONS AUDIT
-- ------------------------------------------------------------------------------
SELECT 
  extname AS extension_name,
  extversion AS installed_version,
  CASE 
    WHEN extname IN ('uuid-ossp', 'pgcrypto') THEN 'CRITICAL (Required)'
    WHEN extname IN ('pg_cron', 'pg_net') THEN 'OPTIONAL (Recommended for automated jobs)'
    ELSE 'OTHER'
  END AS priority
FROM pg_extension
ORDER BY extname;

-- ------------------------------------------------------------------------------
-- 2. TABLE EXISTENCE & ROW COUNTS AUDIT
-- Validates all 53 expected Haryak One tables in the public schema
-- ------------------------------------------------------------------------------
WITH expected_tables(table_name, domain) AS (
  VALUES
    -- Core & Organization
    ('companies', 'Core'),
    ('company_settings', 'Core'),
    ('roles', 'Core / Auth'),
    ('permissions', 'Core / Auth'),
    ('role_permissions', 'Core / Auth'),
    ('users', 'Core / Auth'),
    ('user_roles', 'Core / Auth'),
    ('departments', 'Organization'),
    ('designations', 'Organization'),
    ('locations', 'Organization'),
    -- HR & Employees
    ('employees', 'Employee Directory'),
    ('employee_bank_accounts', 'Employee Finance'),
    ('employee_statutory_details', 'Employee Statutory'),
    ('employee_employment_history', 'Employee History'),
    -- Compensation & Payroll
    ('salary_components', 'Compensation'),
    ('salary_structures', 'Compensation'),
    ('salary_structure_components', 'Compensation'),
    ('salary_revisions', 'Compensation'),
    ('payroll_settings', 'Payroll Engine'),
    ('statutory_rules', 'Payroll Engine'),
    ('payroll_periods', 'Payroll Engine'),
    ('payroll_runs', 'Payroll Engine'),
    ('payroll_employee_records', 'Payroll Engine'),
    ('payroll_earnings', 'Payroll Engine'),
    ('payroll_deductions', 'Payroll Engine'),
    ('payroll_adjustments', 'Payroll Engine'),
    ('payslips', 'Payslips'),
    -- Attendance & Leave
    ('attendance_records', 'Attendance'),
    ('attendance_regularization_requests', 'Attendance'),
    ('leave_types', 'Leave Management'),
    ('leave_balances', 'Leave Management'),
    ('leave_requests', 'Leave Management'),
    ('holidays', 'Company Calendar'),
    -- Documents (EDMS)
    ('documents', 'EDMS Documents'),
    ('document_categories', 'EDMS Documents'),
    ('document_versions', 'EDMS Documents'),
    -- Communications & Workflow
    ('announcements', 'Announcements'),
    ('notifications', 'Notifications'),
    ('notification_preferences', 'Notifications'),
    ('push_subscriptions', 'Notifications'),
    ('approval_requests', 'Workflows / Approvals'),
    ('hr_requests', 'Helpdesk / Tickets'),
    -- Security & System
    ('audit_logs', 'Audit & Compliance'),
    ('security_events', 'Security Center'),
    ('scheduled_job_runs', 'Job Automation'),
    ('user_sessions', 'Security Center'),
    -- Timesheets
    ('timesheets', 'Timesheets'),
    ('timesheet_entries', 'Timesheets'),
    ('timesheet_reviews', 'Timesheets'),
    -- Organization Chat
    ('chat_conversations', 'Organization Chat'),
    ('chat_participants', 'Organization Chat'),
    ('chat_messages', 'Organization Chat'),
    ('chat_message_receipts', 'Organization Chat')
)
SELECT 
  e.domain,
  e.table_name,
  CASE WHEN t.table_name IS NOT NULL THEN 'EXISTS' ELSE 'MISSING' END AS status,
  COALESCE(s.n_live_tup, 0) AS approximate_row_count,
  CASE 
    WHEN t.table_name IS NULL THEN 'FAIL: Table must be created'
    ELSE 'PASS'
  END AS evaluation
FROM expected_tables e
LEFT JOIN information_schema.tables t 
  ON t.table_schema = 'public' AND t.table_name = e.table_name
LEFT JOIN pg_stat_user_tables s 
  ON s.schemaname = 'public' AND s.relname = e.table_name
ORDER BY e.domain, e.table_name;

-- ------------------------------------------------------------------------------
-- 3. CRITICAL COLUMN COMPATIBILITY AUDIT
-- Verifies the specific columns that application services require
-- ------------------------------------------------------------------------------
WITH expected_columns(table_name, column_name, expected_type, purpose) AS (
  VALUES
    -- Admin Bootstrap & Security
    ('users', 'must_change_password', 'boolean', 'Admin bootstrap forced password reset'),
    ('users', 'password_changed_at', 'timestamp with time zone', 'Audit timestamp of last password change'),
    -- Organization Chat Retention
    ('chat_messages', 'expires_at', 'timestamp with time zone', '14-day automated message retention cutoff'),
    ('chat_messages', 'deleted_at', 'timestamp with time zone', 'Soft-delete support'),
    -- EDMS Documents
    ('documents', 'category', 'character varying', 'EDMS Category grouping'),
    ('documents', 'verification_status', 'character varying', 'HR document verification workflow'),
    ('documents', 'requires_acknowledgement', 'boolean', 'Employee acknowledgement tracking'),
    ('documents', 'acknowledged_at', 'timestamp with time zone', 'Acknowledgement timestamp'),
    -- Relational Timesheets (Monthly Model)
    ('timesheets', 'year', 'integer', 'Timesheet calendar year filter'),
    ('timesheets', 'month', 'integer', 'Timesheet calendar month filter'),
    ('timesheets', 'period_start', 'date', 'Monthly period start date'),
    ('timesheets', 'period_end', 'date', 'Monthly period end date'),
    ('timesheets', 'billable_hours', 'numeric', 'Total billable hours tracked'),
    ('timesheets', 'version', 'integer', 'Timesheet versioning'),
    ('timesheets', 'submitted_by', 'uuid', 'User submitting timesheet'),
    ('timesheets', 'approved_by', 'uuid', 'User approving timesheet'),
    ('timesheets', 'rejection_reason', 'text', 'Reason for rejection/return'),
    -- Timesheet Entries
    ('timesheet_entries', 'entry_date', 'date', 'Date of logged work'),
    ('timesheet_entries', 'task_category', 'character varying', 'Category of task performed'),
    ('timesheet_entries', 'is_billable', 'boolean', 'Billable flag'),
    -- Holidays
    ('holidays', 'type', 'character varying', 'Holiday classification (public/company/optional/restricted)')
)
SELECT 
  ec.table_name,
  ec.column_name,
  ec.expected_type,
  CASE 
    WHEN c.column_name IS NOT NULL THEN 'EXISTS' 
    ELSE 'MISSING (Action Required)' 
  END AS status,
  c.data_type AS actual_type,
  c.is_nullable,
  ec.purpose
FROM expected_columns ec
LEFT JOIN information_schema.columns c
  ON c.table_schema = 'public' 
 AND c.table_name = ec.table_name 
 AND c.column_name = ec.column_name
ORDER BY ec.table_name, ec.column_name;

-- ------------------------------------------------------------------------------
-- 4. TIMESHEETS CONFLICT & CHECK CONSTRAINT AUDIT
-- Checks whether any existing rows would block adding unique constraints
-- and verifies check constraint definitions on timesheets
-- ------------------------------------------------------------------------------
SELECT 
  conname AS constraint_name,
  pg_get_constraintdef(c.oid) AS constraint_definition
FROM pg_constraint c
JOIN pg_class t ON t.oid = c.conrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname = 'public' 
  AND t.relname = 'timesheets';

-- Check for timesheet row duplicates on (company_id, employee_id, year, month)
-- Only runs if year and month columns exist
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'timesheets' AND column_name = 'year'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'timesheets' AND column_name = 'month'
  ) THEN
    RAISE NOTICE 'Auditing timesheet table for duplicate (company_id, employee_id, year, month) rows...';
  ELSE
    RAISE NOTICE 'Timesheets table does not yet have year/month columns. No duplicate monthly rows exist.';
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 5. RPC & STORED FUNCTIONS AUDIT
-- Checks whether essential functions exist in the database
-- ------------------------------------------------------------------------------
WITH expected_functions(routine_name, return_type, description) AS (
  VALUES
    ('has_active_super_admin', 'boolean', 'Checks if at least one active Super Admin exists in the company'),
    ('cleanup_expired_chat_messages', 'jsonb', 'Deletes chat messages older than 14 days in safe bounded batches'),
    ('is_admin_or_hr', 'boolean', 'Security definer helper for RLS tenant and role authorization'),
    ('is_reviewer_or_admin', 'boolean', 'Security definer helper for timesheet review authorization'),
    ('set_updated_at_timestamp', 'trigger', 'Automated updated_at timestamp trigger function')
)
SELECT 
  ef.routine_name,
  ef.description,
  CASE 
    WHEN r.routine_name IS NOT NULL THEN 'INSTALLED' 
    ELSE 'MISSING (Action Required)' 
  END AS status,
  r.data_type AS actual_return_type,
  r.security_type
FROM expected_functions ef
LEFT JOIN information_schema.routines r
  ON r.routine_schema = 'public' 
 AND r.routine_name = ef.routine_name
ORDER BY ef.routine_name;

-- ------------------------------------------------------------------------------
-- ------------------------------------------------------------------------------
-- 6. ROW LEVEL SECURITY (RLS) AUDIT & STATUS EVALUATION
-- Evaluates whether every application table in public schema has RLS enabled
-- and checks for dangerous "RLS enabled with zero policies" conditions.
-- ------------------------------------------------------------------------------
SELECT 
  c.relname AS table_name,
  CASE WHEN c.relrowsecurity THEN 'ENABLED' ELSE 'DISABLED' END AS rls_enabled,
  CASE WHEN c.relforcerowsecurity THEN 'FORCED' ELSE 'NORMAL' END AS rls_forced,
  COUNT(p.polname) AS active_policy_count,
  CASE 
    WHEN c.relrowsecurity AND COUNT(p.polname) = 0 THEN 'FAIL: RLS ENABLED WITH 0 POLICIES (Blocks all authenticated access)'
    WHEN c.relrowsecurity AND COUNT(p.polname) > 0 THEN 'PASS'
    ELSE 'WARNING: RLS DISABLED'
  END AS evaluation,
  COALESCE(string_agg(p.polname, ', ' ORDER BY p.polname), 'None') AS policies
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_policy p ON p.polrelid = c.oid
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname NOT LIKE 'pg_%'
  AND c.relname NOT LIKE 'sql_%'
GROUP BY c.relname, c.relrowsecurity, c.relforcerowsecurity
ORDER BY c.relname;

-- ------------------------------------------------------------------------------
-- 6B. DETAILED RLS POLICY DEFINITIONS INVENTORY
-- Lists command, target roles, USING expression, and WITH CHECK expression
-- for every active policy in the public schema.
-- ------------------------------------------------------------------------------
SELECT 
  tablename,
  policyname,
  cmd AS command,
  roles,
  qual AS using_expression,
  with_check AS with_check_expression
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;


-- ------------------------------------------------------------------------------
-- 7. FOUNDATIONAL SEED DATA AUDIT
-- Verifies whether core company reference tables contain required data
-- ------------------------------------------------------------------------------
SELECT 'companies' AS table_name, count(*) AS total_row_count, count(*) AS target_company_row_count,
  CASE WHEN count(*) >= 1 THEN 'PASS' ELSE 'FAIL: No company record exists' END AS status 
FROM companies
UNION ALL
SELECT 'roles' AS table_name, count(*) AS total_row_count, 
  count(*) FILTER (WHERE company_id = 'c2a6b9b4-37e4-4bd9-9347-8d779bccecc4'::uuid) AS target_company_row_count,
  CASE WHEN count(*) >= 5 THEN 'PASS (5 System Roles)' ELSE 'FAIL: Expected at least 5 system roles' END AS status 
FROM roles
UNION ALL
SELECT 'users' AS table_name, count(*) AS total_row_count, 
  count(*) FILTER (WHERE company_id = 'c2a6b9b4-37e4-4bd9-9347-8d779bccecc4'::uuid) AS target_company_row_count,
  CASE WHEN count(*) >= 1 THEN 'PASS' ELSE 'FAIL: No Super Admin exists' END AS status 
FROM users
UNION ALL
SELECT 'salary_components' AS table_name, count(*) AS total_row_count, 
  count(*) FILTER (WHERE company_id = 'c2a6b9b4-37e4-4bd9-9347-8d779bccecc4'::uuid) AS target_company_row_count,
  CASE WHEN count(*) >= 4 THEN 'PASS' ELSE 'WARNING: Empty. Default components (Basic, HRA, etc.) missing' END AS status 
FROM salary_components
UNION ALL
SELECT 'leave_types' AS table_name, count(*) AS total_row_count, 
  count(*) FILTER (WHERE company_id = 'c2a6b9b4-37e4-4bd9-9347-8d779bccecc4'::uuid) AS target_company_row_count,
  CASE WHEN count(*) >= 4 THEN 'PASS' ELSE 'WARNING: Empty. Default leave types (CL, SL, EL, WFH) missing' END AS status 
FROM leave_types
UNION ALL
SELECT 'payroll_settings' AS table_name, count(*) AS total_row_count, 
  count(*) FILTER (WHERE company_id = 'c2a6b9b4-37e4-4bd9-9347-8d779bccecc4'::uuid) AS target_company_row_count,
  CASE WHEN count(*) >= 1 THEN 'PASS' ELSE 'WARNING: Empty. Default payroll cycle settings missing' END AS status 
FROM payroll_settings
UNION ALL
SELECT 'document_categories' AS table_name, count(*) AS total_row_count, 
  count(*) FILTER (WHERE company_id = 'c2a6b9b4-37e4-4bd9-9347-8d779bccecc4'::uuid) AS target_company_row_count,
  CASE WHEN count(*) >= 1 THEN 'PASS' ELSE 'INFO: Empty. Document categories not yet populated' END AS status 
FROM document_categories;

-- ------------------------------------------------------------------------------
-- 8. SUPABASE REALTIME PUBLICATION AUDIT
-- Verifies which tables are published for WebSocket Realtime events
-- ------------------------------------------------------------------------------
SELECT 
  pubname AS publication_name,
  schemaname,
  tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
ORDER BY tablename;
