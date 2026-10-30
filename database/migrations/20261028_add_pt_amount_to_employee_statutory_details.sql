-- ============================================================
-- HARYAK ONE — Professional Tax Amount Column Migration
-- Haryak Technologies India Private Limited
-- Company Tagline: Empowering Tomorrow’s Solutions, Today.
-- Migration Date: October 28, 2026
-- ============================================================
--
-- OBJECTIVE:
-- Add `pt_amount` column to `public.employee_statutory_details`
-- to persist employee-level configured Professional Tax deduction amounts.
--
-- BACKGROUND:
-- In Indian payroll architecture and Haryak One's compensation model:
-- 1. When PT is applicable (`pt_applicable = true`), companies can configure
--    an employee-specific fixed PT deduction (`pt_amount`) or fall back to
--    state-level statutory rules / slabs (`pt_state`).
-- 2. The employee onboarding API (`/api/employees`), compensation revision API
--    (`/api/compensation/[employeeId]`), and payroll execution engine
--    (`/api/payroll/run`) require `pt_amount` on `employee_statutory_details`.
-- 3. This migration is fully idempotent and backward-compatible.
-- ============================================================

-- 1. Add `pt_amount` column to `employee_statutory_details` table
ALTER TABLE employee_statutory_details
  ADD COLUMN IF NOT EXISTS pt_amount NUMERIC(10, 2) DEFAULT NULL;

-- 2. Add documentation comment explaining column usage
COMMENT ON COLUMN employee_statutory_details.pt_amount IS 
  'Configured monthly Professional Tax deduction amount for the employee. NULL indicates state statutory rule calculation applies.';

-- 3. Explicitly notify PostgREST to reload its schema cache immediately
NOTIFY pgrst, 'reload schema';
