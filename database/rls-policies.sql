-- ==============================================================================
-- HARYAK TECHNOLOGIES INDIA PRIVATE LIMITED
-- Enterprise HRMS Row Level Security (RLS) Policies
-- Complete Tenant Isolation + Employee Self-Service Lockdown
-- ==============================================================================

-- Enable Row Level Security on all sensitive tables
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_statutory_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE salary_structures ENABLE ROW LEVEL SECURITY;
ALTER TABLE salary_structure_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE salary_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_employee_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_earnings ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_deductions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payslips ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
  BEGIN ALTER TABLE hr_requests ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN END;
  BEGIN ALTER TABLE notifications ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN END;
  BEGIN ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY; EXCEPTION WHEN OTHERS THEN END;
END $$;

-- Helper function: is current user an administrator?
CREATE OR REPLACE FUNCTION public.is_admin_or_hr(user_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = user_uuid
      AND r.name IN ('SUPER_ADMIN', 'HR_ADMIN', 'PAYROLL_ADMIN')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------------------------
-- 1. Employees Table
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
  );

-- ------------------------------------------------------------------------------
-- 2. Employee Bank Accounts (CRITICAL: Strict Isolation)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users view own bank accounts or if admin" ON employee_bank_accounts;
CREATE POLICY "Users view own bank accounts or if admin" ON employee_bank_accounts
  FOR SELECT TO authenticated
  USING (
    -- Own bank account
    employee_id = (SELECT employee_id FROM users WHERE id = auth.uid())
    OR
    -- Company admin
    (
      public.is_admin_or_hr(auth.uid())
      AND (SELECT company_id FROM employees WHERE id = employee_bank_accounts.employee_id) = (SELECT company_id FROM users WHERE id = auth.uid())
    )
  );

-- ------------------------------------------------------------------------------
-- 3. Employee Statutory Details (PAN, PF, UAN)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users view own statutory details or if admin" ON employee_statutory_details;
CREATE POLICY "Users view own statutory details or if admin" ON employee_statutory_details
  FOR SELECT TO authenticated
  USING (
    employee_id = (SELECT employee_id FROM users WHERE id = auth.uid())
    OR
    (
      public.is_admin_or_hr(auth.uid())
      AND (SELECT company_id FROM employees WHERE id = employee_statutory_details.employee_id) = (SELECT company_id FROM users WHERE id = auth.uid())
    )
  );

-- ------------------------------------------------------------------------------
-- 4. Salary Structures & Compensation History
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users view own salary structure or if admin" ON salary_structures;
CREATE POLICY "Users view own salary structure or if admin" ON salary_structures
  FOR SELECT TO authenticated
  USING (
    employee_id = (SELECT employee_id FROM users WHERE id = auth.uid())
    OR
    (
      public.is_admin_or_hr(auth.uid())
      AND company_id = (SELECT company_id FROM users WHERE id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users view own salary structure components or if admin" ON salary_structure_components;
CREATE POLICY "Users view own salary structure components or if admin" ON salary_structure_components
  FOR SELECT TO authenticated
  USING (
    (SELECT employee_id FROM salary_structures WHERE id = salary_structure_id) = (SELECT employee_id FROM users WHERE id = auth.uid())
    OR
    (
      public.is_admin_or_hr(auth.uid())
      AND (SELECT company_id FROM salary_structures WHERE id = salary_structure_id) = (SELECT company_id FROM users WHERE id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users view own salary revisions or if admin" ON salary_revisions;
CREATE POLICY "Users view own salary revisions or if admin" ON salary_revisions
  FOR SELECT TO authenticated
  USING (
    employee_id = (SELECT employee_id FROM users WHERE id = auth.uid())
    OR
    (
      public.is_admin_or_hr(auth.uid())
      AND company_id = (SELECT company_id FROM users WHERE id = auth.uid())
    )
  );

-- ------------------------------------------------------------------------------
-- 5. Payslips (Strict Employee Isolation)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Employees view own payslips or company admin" ON payslips;
CREATE POLICY "Employees view own payslips or company admin" ON payslips
  FOR SELECT TO authenticated
  USING (
    employee_id = (SELECT employee_id FROM users WHERE id = auth.uid())
    OR
    (
      public.is_admin_or_hr(auth.uid())
      AND company_id = (SELECT company_id FROM users WHERE id = auth.uid())
    )
  );

-- ------------------------------------------------------------------------------
-- 6. Payroll Runs & Employee Payroll Records (Admin Only for Runs)
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can view payroll runs" ON payroll_runs;
CREATE POLICY "Admins can view payroll runs" ON payroll_runs
  FOR SELECT TO authenticated
  USING (
    public.is_admin_or_hr(auth.uid())
    AND company_id = (SELECT company_id FROM users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Users view own payroll records or if admin" ON payroll_employee_records;
CREATE POLICY "Users view own payroll records or if admin" ON payroll_employee_records
  FOR SELECT TO authenticated
  USING (
    employee_id = (SELECT employee_id FROM users WHERE id = auth.uid())
    OR
    (
      public.is_admin_or_hr(auth.uid())
      AND (SELECT company_id FROM payroll_runs WHERE id = payroll_run_id) = (SELECT company_id FROM users WHERE id = auth.uid())
    )
  );

-- ------------------------------------------------------------------------------
-- 7. Attendance Records
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users view attendance in company" ON attendance_records;
CREATE POLICY "Users view attendance in company" ON attendance_records
  FOR SELECT TO authenticated
  USING (
    employee_id = (SELECT employee_id FROM users WHERE id = auth.uid())
    OR
    (
      public.is_admin_or_hr(auth.uid())
      AND company_id = (SELECT company_id FROM users WHERE id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Employees can check in own attendance" ON attendance_records;
CREATE POLICY "Employees can check in own attendance" ON attendance_records
  FOR INSERT TO authenticated
  WITH CHECK (
    employee_id = (SELECT employee_id FROM users WHERE id = auth.uid())
    AND company_id = (SELECT company_id FROM users WHERE id = auth.uid())
  );

-- ------------------------------------------------------------------------------
-- 8. Leave Requests & Balances
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users view own leaves or if admin" ON leave_requests;
CREATE POLICY "Users view own leaves or if admin" ON leave_requests
  FOR SELECT TO authenticated
  USING (
    employee_id = (SELECT employee_id FROM users WHERE id = auth.uid())
    OR
    (
      public.is_admin_or_hr(auth.uid())
      AND company_id = (SELECT company_id FROM users WHERE id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Employees can submit leave requests" ON leave_requests;
CREATE POLICY "Employees can submit leave requests" ON leave_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    employee_id = (SELECT employee_id FROM users WHERE id = auth.uid())
    AND company_id = (SELECT company_id FROM users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Users view own leave balances or if admin" ON leave_balances;
CREATE POLICY "Users view own leave balances or if admin" ON leave_balances
  FOR SELECT TO authenticated
  USING (
    employee_id = (SELECT employee_id FROM users WHERE id = auth.uid())
    OR
    (
      public.is_admin_or_hr(auth.uid())
      AND (SELECT company_id FROM employees WHERE id = employee_id) = (SELECT company_id FROM users WHERE id = auth.uid())
    )
  );

-- ------------------------------------------------------------------------------
-- 9. Documents
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users view authorized documents" ON documents;
CREATE POLICY "Users view authorized documents" ON documents
  FOR SELECT TO authenticated
  USING (
    company_id = (SELECT company_id FROM users WHERE id = auth.uid())
    AND (
      visibility = 'company_wide'
      OR employee_id = (SELECT employee_id FROM users WHERE id = auth.uid())
      OR public.is_admin_or_hr(auth.uid())
    )
  );

-- ------------------------------------------------------------------------------
-- 10. Audit Logs (Append-Only)
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'audit_logs') THEN
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
  END IF;
END $$;
