DO $$ 
DECLARE
  v_company_id UUID;
BEGIN
  -- 1. Insert or get Company
  SELECT id INTO v_company_id FROM companies WHERE legal_name = 'Haryak Technologies India Private Limited' LIMIT 1;
  
  IF v_company_id IS NULL THEN
    INSERT INTO companies (
      name, 
      legal_name, 
      email, 
      website, 
      employee_id_prefix, 
      employee_id_counter, 
      fiscal_year_start, 
      currency, 
      timezone, 
      date_format, 
      country
    ) VALUES (
      'Haryak Technologies',
      'Haryak Technologies India Private Limited',
      'hr@haryak.com',
      'https://haryak.com',
      'HRK',
      0,
      4,
      'INR',
      'Asia/Kolkata',
      'DD/MM/YYYY',
      'India'
    ) RETURNING id INTO v_company_id;
  END IF;

  -- 2. Create Default Roles
  INSERT INTO roles (company_id, name, display_name, description, is_system) VALUES
    (v_company_id, 'SUPER_ADMIN', 'Super Administrator', 'Full system access', TRUE),
    (v_company_id, 'HR_ADMIN', 'HR Administrator', 'HR management access', TRUE),
    (v_company_id, 'PAYROLL_ADMIN', 'Payroll Administrator', 'Payroll management access', TRUE),
    (v_company_id, 'MANAGER', 'Manager', 'Manager level access', TRUE),
    (v_company_id, 'EMPLOYEE', 'Employee', 'Employee self-service access', TRUE)
  ON CONFLICT (company_id, name) DO NOTHING;

  -- 3. Create Default Salary Components
  INSERT INTO salary_components (
    company_id, name, code, type, category, is_taxable, is_statutory, sort_order
  ) VALUES
    (v_company_id, 'Basic Salary', 'BASIC', 'earning', 'basic', true, false, 1),
    (v_company_id, 'HRA', 'HRA', 'earning', 'hra', true, false, 2),
    (v_company_id, 'Special Allowance', 'SPECIAL_ALLOWANCE', 'earning', 'allowance', true, false, 3),
    (v_company_id, 'Conveyance Allowance', 'CONVEYANCE', 'earning', 'allowance', true, false, 4)
  ON CONFLICT (company_id, code) DO UPDATE SET
    name = EXCLUDED.name,
    type = EXCLUDED.type,
    category = EXCLUDED.category,
    is_taxable = EXCLUDED.is_taxable,
    is_statutory = EXCLUDED.is_statutory,
    sort_order = EXCLUDED.sort_order;

  -- 4. Create Default Leave Types
  INSERT INTO leave_types (
    company_id, name, code, annual_quota, is_paid, carry_forward, is_active
  ) VALUES
    (v_company_id, 'Casual Leave', 'CL', 12, true, false, true),
    (v_company_id, 'Sick Leave', 'SL', 12, true, false, true),
    (v_company_id, 'Earned Leave', 'EL', 15, true, true, true),
    (v_company_id, 'Work From Home', 'WFH', 24, true, false, true)
  ON CONFLICT (company_id, code) DO UPDATE SET
    name = EXCLUDED.name,
    annual_quota = EXCLUDED.annual_quota,
    is_paid = EXCLUDED.is_paid,
    carry_forward = EXCLUDED.carry_forward;

  -- 5. Create Default Payroll Settings
  INSERT INTO payroll_settings (
    company_id, payroll_frequency, cycle_start_day, cycle_end_day, cutoff_day, payment_day
  ) VALUES (
    v_company_id, 'monthly', 1, 0, 25, 1
  )
  ON CONFLICT (company_id) DO NOTHING;

END $$;
