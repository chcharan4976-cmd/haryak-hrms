-- ============================================================
-- Migration: 20261104_atomic_employee_code_allocation.sql
-- Module: Employee ID Card Studio & Core Employee Allocation
-- Description: Concurrency-safe atomic database-level sequential code allocation and reservation mechanism
-- Purpose: Protects against distributed race conditions across multiple serverless / multi-instance application nodes.
-- Security: Fail-closed SECURITY DEFINER, search_path locked to pg_catalog, pg_temp.
-- Service-Role Auth: Derived strictly from verified database execution context, never trusting caller booleans.
-- Note: Do NOT execute this migration directly against production without change-window approval.
-- ============================================================

-- ------------------------------------------------------------------------------
-- 1. Dedicated Employee Code Reservations Table
-- Ensures distributed serverless isolates hold a durable, transactional reservation
-- in the database before proceeding with storage uploads, external auth, or inserts.
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.employee_code_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_code VARCHAR(50) NOT NULL,
  reservation_type VARCHAR(50) NOT NULL DEFAULT 'TEMPORARY_CARD', -- 'TEMPORARY_CARD', 'PERMANENT_EMPLOYEE'
  status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE', -- 'ACTIVE', 'COMMITTED', 'CONVERTED', 'RELEASED'
  temporary_card_id UUID REFERENCES public.temporary_employee_id_cards(id) ON DELETE SET NULL,
  employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  reserved_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '15 minutes'),
  consumed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Enable RLS on reservations
ALTER TABLE public.employee_code_reservations ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- 2. Indexes: Enforce Database-Level Active Reservation Uniqueness
-- ------------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_employee_code_reservation
  ON public.employee_code_reservations (company_id, employee_code)
  WHERE status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_code_reservations_company_status_expiry
  ON public.employee_code_reservations (company_id, status, expires_at);

-- Partial Unique Index to Enforce Database-Level Uniqueness for Unlinked Temporary Cards
CREATE UNIQUE INDEX IF NOT EXISTS uq_temp_id_cards_active_unlinked_code
  ON public.temporary_employee_id_cards(company_id, employee_code)
  WHERE deleted_at IS NULL AND employee_id IS NULL;

-- ------------------------------------------------------------------------------
-- 2b. Core Helper Function: is_service_role()
-- Derives service-role authorization strictly from verified database execution context.
-- Never trusts caller-supplied arguments or parameters.
-- SECURITY NOTE: Must be SECURITY INVOKER (never SECURITY DEFINER) and NEVER test CURRENT_USER!
-- In PostgreSQL, inside any SECURITY DEFINER function owned by postgres/supabase_admin,
-- CURRENT_USER switches to the function owner (postgres), which would cause
-- unprivileged authenticated callers to be misidentified as service-role!
-- Instead, test the cryptographically verified PostgREST JWT claim, or SESSION_USER
-- (which does NOT change under SECURITY DEFINER) for direct TCP database connections.
-- Fails closed on malformed JSON, conflicting claims, or untrusted session users.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_service_role()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_jwt_claim_role TEXT;
  v_jwt_claims_raw TEXT;
  v_jwt_claims_role TEXT;
BEGIN
  -- 1. Read PostgREST JWT runtime settings safely (returns NULL if unconfigured)
  v_jwt_claim_role := NULLIF(current_setting('request.jwt.claim.role', true), '');
  v_jwt_claims_raw := NULLIF(current_setting('request.jwt.claims', true), '');

  -- 2. Safely parse the 'role' property from request.jwt.claims JSON (fail closed on malformed JSON)
  IF v_jwt_claims_raw IS NOT NULL THEN
    BEGIN
      v_jwt_claims_role := (v_jwt_claims_raw::jsonb ->> 'role');
    EXCEPTION WHEN OTHERS THEN
      -- Malformed or unparseable JSON: immediately fail closed
      RETURN FALSE;
    END;
  END IF;

  -- 3. If any PostgREST JWT context exists, this is an API / web request.
  -- Fail closed on conflicting claims or any unprivileged role claim.
  IF v_jwt_claim_role IS NOT NULL OR v_jwt_claims_raw IS NOT NULL THEN
    -- If claim.role is present and not 'service_role', reject immediately
    IF v_jwt_claim_role IS NOT NULL AND v_jwt_claim_role <> 'service_role' THEN
      RETURN FALSE;
    END IF;
    -- If claims JSON contains a role and it is not 'service_role', reject immediately
    IF v_jwt_claims_role IS NOT NULL AND v_jwt_claims_role <> 'service_role' THEN
      RETURN FALSE;
    END IF;
    -- Both claims (if present) must agree on 'service_role'
    RETURN (COALESCE(v_jwt_claim_role, v_jwt_claims_role) = 'service_role');
  END IF;

  -- 4. Direct TCP database connection fallback (no PostgREST JWT context whatsoever).
  -- PostgREST API connections connect as 'authenticator', so PostgREST requests
  -- without JWT will have SESSION_USER = 'authenticator' and be rejected here.
  -- Only true administrative connection roles (postgres, supabase_admin, service_role) qualify.
  -- NEVER check CURRENT_USER in SECURITY DEFINER context!
  IF SESSION_USER IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN TRUE;
  END IF;

  -- Default fail-closed for all other contexts
  RETURN FALSE;
END;
$$;


-- ------------------------------------------------------------------------------
-- 3. Core Stored Function: reserve_next_employee_code
-- Atomically acquires company transaction lock, reclaims expired leases,
-- determines lowest available sequential integer, inserts an active reservation,
-- and returns the reservation ID and allocated code.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reserve_next_employee_code(
  p_company_id UUID,
  p_reservation_type TEXT DEFAULT 'TEMPORARY_CARD',
  p_user_id UUID DEFAULT NULL,
  p_ttl_minutes INTEGER DEFAULT 15,
  p_is_service_role BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
  reservation_id UUID,
  employee_code TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_prefix TEXT;
  v_used_numbers INT[];
  v_next INT := 1;
  v_res_id UUID;
  v_res_code TEXT;
  v_ttl INT;
  v_is_service_role BOOLEAN;
  v_actual_user_id UUID;
BEGIN
  -- Derive service-role authorization strictly from verified execution context
  v_is_service_role := public.is_service_role();

  -- Impersonation check: Reject caller if attempting to assert p_is_service_role = TRUE without verified context
  IF p_is_service_role IS TRUE AND NOT v_is_service_role THEN
    RAISE EXCEPTION 'Security violation: caller cannot assert service-role authorization without verified service-role credentials.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'Company ID cannot be NULL for employee code reservation.'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Authenticated user validation and cross-company tenant isolation
  IF NOT v_is_service_role THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'Unauthenticated access denied.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- Cross-company access guard
    IF NOT EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND company_id = p_company_id AND is_active = true
    ) THEN
      RAISE EXCEPTION 'Unauthorized cross-company access denied.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- Caller identity mismatch guard
    IF p_user_id IS NOT NULL AND p_user_id <> auth.uid() THEN
      RAISE EXCEPTION 'Unauthorized caller identity mismatch.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    v_actual_user_id := COALESCE(p_user_id, auth.uid());
  ELSE
    v_actual_user_id := p_user_id;
  END IF;

  -- Disallow anonymous / unowned reservations unless explicitly running as verified service role
  IF v_actual_user_id IS NULL AND NOT v_is_service_role THEN
    RAISE EXCEPTION 'A valid user ID or verified service-role authorization is required to create an employee code reservation.'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  v_ttl := COALESCE(p_ttl_minutes, 15);
  IF v_ttl < 1 OR v_ttl > 120 THEN
    v_ttl := 15;
  END IF;

  -- 1. Acquire transaction-level advisory lock hashed to company UUID.
  -- Serializes allocation strictly within this tenant. Other companies run fully in parallel.
  PERFORM pg_advisory_xact_lock(hashtext('emp_code_alloc_' || p_company_id::text));

  -- 2. Automatically expire abandoned active reservations for this company
  UPDATE public.employee_code_reservations
  SET status = 'RELEASED',
      consumed_at = NOW()
  WHERE company_id = p_company_id
    AND status = 'ACTIVE'
    AND expires_at < NOW();

  -- 3. Fetch company prefix (defaults to HRK)
  SELECT COALESCE(NULLIF(TRIM(employee_id_prefix), ''), 'HRK') INTO v_prefix
  FROM public.companies
  WHERE id = p_company_id;

  IF v_prefix IS NULL THEN
    v_prefix := 'HRK';
  END IF;

  -- 4. Gather all allocated or currently reserved numbers from:
  --    a. Permanent employees
  --    b. Active temporary ID cards (deleted_at IS NULL)
  --    c. Active, non-expired reservations
  WITH combined_codes AS (
    SELECT e.employee_code
    FROM public.employees e
    WHERE e.company_id = p_company_id
    UNION ALL
    SELECT t.employee_code
    FROM public.temporary_employee_id_cards t
    WHERE t.company_id = p_company_id
      AND t.deleted_at IS NULL
    UNION ALL
    SELECT r.employee_code
    FROM public.employee_code_reservations r
    WHERE r.company_id = p_company_id
      AND r.status = 'ACTIVE'
      AND r.expires_at >= NOW()
  ),
  extracted_numbers AS (
    SELECT (substring(employee_code from '^' || v_prefix || '-([0-9]+)$'))::int AS num
    FROM combined_codes
    WHERE employee_code ~ ('^' || v_prefix || '-[0-9]+$')
  )
  SELECT array_agg(DISTINCT num) INTO v_used_numbers
  FROM extracted_numbers;

  -- 5. Find lowest positive integer not present in any table or active reservation
  IF v_used_numbers IS NOT NULL THEN
    WHILE v_next = ANY(v_used_numbers) LOOP
      v_next := v_next + 1;
    END LOOP;
  END IF;

  v_res_code := v_prefix || '-' || lpad(v_next::text, 3, '0');

  -- 6. Atomically persist active reservation before releasing transaction lock
  INSERT INTO public.employee_code_reservations (
    company_id,
    employee_code,
    reservation_type,
    status,
    expires_at,
    reserved_by
  ) VALUES (
    p_company_id,
    v_res_code,
    COALESCE(p_reservation_type, 'TEMPORARY_CARD'),
    'ACTIVE',
    NOW() + (v_ttl || ' minutes')::interval,
    v_actual_user_id
  )
  RETURNING id INTO v_res_id;

  RETURN QUERY SELECT v_res_id, v_res_code;
END;
$$;

-- ------------------------------------------------------------------------------
-- 4. Stored Function: renew_employee_code_reservation
-- Extends an in-progress active reservation lease. Rejects expired or unauthorized leases.
-- Enforces strict ownership: NULL reserved_by does NOT permit arbitrary renewal.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.renew_employee_code_reservation(
  p_reservation_id UUID,
  p_company_id UUID,
  p_user_id UUID DEFAULT NULL,
  p_additional_minutes INTEGER DEFAULT 15,
  p_is_service_role BOOLEAN DEFAULT FALSE
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_ttl INT;
  v_updated INT;
  v_is_service_role BOOLEAN;
  v_actual_user_id UUID;
BEGIN
  v_is_service_role := public.is_service_role();

  IF p_is_service_role IS TRUE AND NOT v_is_service_role THEN
    RAISE EXCEPTION 'Security violation: caller cannot assert service-role authorization without verified service-role credentials.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_reservation_id IS NULL OR p_company_id IS NULL THEN
    RAISE EXCEPTION 'Reservation ID and Company ID cannot be NULL.'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF NOT v_is_service_role THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'Unauthenticated access denied.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND company_id = p_company_id AND is_active = true
    ) THEN
      RAISE EXCEPTION 'Unauthorized cross-company access denied.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF p_user_id IS NOT NULL AND p_user_id <> auth.uid() THEN
      RAISE EXCEPTION 'Unauthorized caller identity mismatch.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    v_actual_user_id := COALESCE(p_user_id, auth.uid());
  ELSE
    v_actual_user_id := p_user_id;
  END IF;

  v_ttl := COALESCE(p_additional_minutes, 15);
  IF v_ttl < 1 OR v_ttl > 120 THEN
    v_ttl := 15;
  END IF;

  -- Strict check: status must be ACTIVE, expires_at must NOT be past, company and user must match
  UPDATE public.employee_code_reservations
  SET expires_at = NOW() + (v_ttl || ' minutes')::interval
  WHERE id = p_reservation_id
    AND company_id = p_company_id
    AND status = 'ACTIVE'
    AND expires_at >= NOW()
    AND (
      (reserved_by IS NOT NULL AND v_actual_user_id IS NOT NULL AND reserved_by = v_actual_user_id)
      OR
      (v_is_service_role = TRUE)
    );

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

-- ------------------------------------------------------------------------------
-- 5. Stored Function: commit_employee_code_reservation
-- Transitions ACTIVE -> COMMITTED with company isolation, non-expiration, and strict ownership validation.
-- Enforces strict ownership: NULL reserved_by does NOT permit arbitrary commit.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.commit_employee_code_reservation(
  p_reservation_id UUID,
  p_company_id UUID,
  p_user_id UUID DEFAULT NULL,
  p_temporary_card_id UUID DEFAULT NULL,
  p_employee_id UUID DEFAULT NULL,
  p_is_service_role BOOLEAN DEFAULT FALSE
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_updated INT;
  v_is_service_role BOOLEAN;
  v_actual_user_id UUID;
BEGIN
  v_is_service_role := public.is_service_role();

  IF p_is_service_role IS TRUE AND NOT v_is_service_role THEN
    RAISE EXCEPTION 'Security violation: caller cannot assert service-role authorization without verified service-role credentials.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_reservation_id IS NULL OR p_company_id IS NULL THEN
    RAISE EXCEPTION 'Reservation ID and Company ID cannot be NULL.'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF NOT v_is_service_role THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'Unauthenticated access denied.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND company_id = p_company_id AND is_active = true
    ) THEN
      RAISE EXCEPTION 'Unauthorized cross-company access denied.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF p_user_id IS NOT NULL AND p_user_id <> auth.uid() THEN
      RAISE EXCEPTION 'Unauthorized caller identity mismatch.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    v_actual_user_id := COALESCE(p_user_id, auth.uid());
  ELSE
    v_actual_user_id := p_user_id;
  END IF;

  -- Must be ACTIVE, NOT EXPIRED, matching company, matching owner or verified service-role
  UPDATE public.employee_code_reservations
  SET status = 'COMMITTED',
      temporary_card_id = COALESCE(p_temporary_card_id, temporary_card_id),
      employee_id = COALESCE(p_employee_id, employee_id),
      consumed_at = NOW()
  WHERE id = p_reservation_id
    AND company_id = p_company_id
    AND status = 'ACTIVE'
    AND expires_at >= NOW()
    AND (
      (reserved_by IS NOT NULL AND v_actual_user_id IS NOT NULL AND reserved_by = v_actual_user_id)
      OR
      (v_is_service_role = TRUE)
    );

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

-- ------------------------------------------------------------------------------
-- 6. Stored Function: release_employee_code_reservation
-- Transitions ACTIVE -> RELEASED immediately on error or cancellation.
-- Enforces strict ownership: NULL reserved_by does NOT permit arbitrary release.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.release_employee_code_reservation(
  p_reservation_id UUID,
  p_company_id UUID,
  p_user_id UUID DEFAULT NULL,
  p_is_service_role BOOLEAN DEFAULT FALSE
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_updated INT;
  v_is_service_role BOOLEAN;
  v_actual_user_id UUID;
BEGIN
  v_is_service_role := public.is_service_role();

  IF p_is_service_role IS TRUE AND NOT v_is_service_role THEN
    RAISE EXCEPTION 'Security violation: caller cannot assert service-role authorization without verified service-role credentials.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_reservation_id IS NULL OR p_company_id IS NULL THEN
    RAISE EXCEPTION 'Reservation ID and Company ID cannot be NULL.'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF NOT v_is_service_role THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'Unauthenticated access denied.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND company_id = p_company_id AND is_active = true
    ) THEN
      RAISE EXCEPTION 'Unauthorized cross-company access denied.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF p_user_id IS NOT NULL AND p_user_id <> auth.uid() THEN
      RAISE EXCEPTION 'Unauthorized caller identity mismatch.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    v_actual_user_id := COALESCE(p_user_id, auth.uid());
  ELSE
    v_actual_user_id := p_user_id;
  END IF;

  UPDATE public.employee_code_reservations
  SET status = 'RELEASED',
      consumed_at = NOW()
  WHERE id = p_reservation_id
    AND company_id = p_company_id
    AND status = 'ACTIVE'
    AND (
      (reserved_by IS NOT NULL AND v_actual_user_id IS NOT NULL AND reserved_by = v_actual_user_id)
      OR
      (v_is_service_role = TRUE)
    );

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

-- ------------------------------------------------------------------------------
-- 7. Stored Function: convert_temporary_card_to_employee
-- Backward-compatible linking function with strict ownership validation.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.convert_temporary_card_to_employee(
  p_company_id UUID,
  p_temporary_card_id UUID,
  p_employee_id UUID,
  p_user_id UUID DEFAULT NULL,
  p_is_service_role BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_card_code TEXT;
  v_emp_code TEXT;
  v_existing_linked_emp UUID;
  v_res_count INT;
  v_is_service_role BOOLEAN;
  v_actual_user_id UUID;
BEGIN
  v_is_service_role := public.is_service_role();

  IF p_is_service_role IS TRUE AND NOT v_is_service_role THEN
    RAISE EXCEPTION 'Security violation: caller cannot assert service-role authorization without verified service-role credentials.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_company_id IS NULL OR p_temporary_card_id IS NULL OR p_employee_id IS NULL THEN
    RAISE EXCEPTION 'Parameters cannot be NULL in convert_temporary_card_to_employee.'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF NOT v_is_service_role THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'Unauthenticated access denied.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND company_id = p_company_id AND is_active = true
    ) THEN
      RAISE EXCEPTION 'Unauthorized cross-company access denied.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF p_user_id IS NOT NULL AND p_user_id <> auth.uid() THEN
      RAISE EXCEPTION 'Unauthorized caller identity mismatch.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    v_actual_user_id := COALESCE(p_user_id, auth.uid());
  ELSE
    v_actual_user_id := p_user_id;
  END IF;

  -- 1. Row-lock temporary card to serialize concurrent conversion attempts
  SELECT employee_code, employee_id INTO v_card_code, v_existing_linked_emp
  FROM public.temporary_employee_id_cards
  WHERE id = p_temporary_card_id
    AND company_id = p_company_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF v_card_code IS NULL THEN
    RAISE EXCEPTION 'Active temporary ID card not found for conversion or company mismatch.'
      USING ERRCODE = 'data_exception';
  END IF;

  -- 2. Idempotency & duplicate conversion guard
  IF v_existing_linked_emp IS NOT NULL THEN
    IF v_existing_linked_emp = p_employee_id THEN
      -- Already converted to this exact employee (idempotent retry)
      RETURN jsonb_build_object('success', true, 'idempotent', true, 'code', v_card_code);
    ELSE
      RAISE EXCEPTION 'Temporary ID card % is already converted to another employee (%).',
        p_temporary_card_id, v_existing_linked_emp
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- 3. Verify permanent employee exists, belongs to company, and matching code
  SELECT employee_code INTO v_emp_code
  FROM public.employees
  WHERE id = p_employee_id
    AND company_id = p_company_id;

  IF v_emp_code IS NULL THEN
    RAISE EXCEPTION 'Permanent employee record not found or company mismatch.'
      USING ERRCODE = 'data_exception';
  END IF;

  IF v_card_code <> v_emp_code THEN
    RAISE EXCEPTION 'Code mismatch between temporary card (%) and permanent employee record (%).',
      v_card_code, v_emp_code
      USING ERRCODE = 'check_violation';
  END IF;

  -- 4. Atomically link card to employee
  UPDATE public.temporary_employee_id_cards
  SET employee_id = p_employee_id
  WHERE id = p_temporary_card_id;

  -- 5. Transition reservation status to CONVERTED
  UPDATE public.employee_code_reservations
  SET status = 'CONVERTED',
      employee_id = p_employee_id,
      temporary_card_id = p_temporary_card_id,
      consumed_at = NOW()
  WHERE company_id = p_company_id
    AND employee_code = v_card_code
    AND status IN ('ACTIVE', 'COMMITTED')
    AND (
      (reserved_by IS NOT NULL AND v_actual_user_id IS NOT NULL AND reserved_by = v_actual_user_id)
      OR
      (v_is_service_role = TRUE)
    );

  GET DIAGNOSTICS v_res_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'employee_id', p_employee_id,
    'temporary_card_id', p_temporary_card_id,
    'employee_code', v_card_code,
    'reservations_converted', v_res_count
  );
END;
$$;

-- ------------------------------------------------------------------------------
-- 7b. Truly Transactional Stored Function: convert_temporary_card_to_permanent_employee
-- Executes in ONE atomic PostgreSQL transaction:
-- 1. Row-locks temporary card (FOR UPDATE) & verifies idempotency / duplicate guards.
-- 2. Row-locks associated reservation (FOR UPDATE) & verifies ownership.
-- 3. Inserts permanent employee record, preserving the temporary card's code.
-- 4. Associates temporary card with the permanent employee.
-- 5. Transitions reservation status to CONVERTED.
-- 6. Updates users table link.
-- Rollback guarantee: If ANY step fails, PostgreSQL automatically rolls back the entire transaction.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.convert_temporary_card_to_permanent_employee(
  p_company_id UUID,
  p_temporary_card_id UUID,
  p_auth_user_id UUID,
  p_creator_id UUID DEFAULT NULL,
  p_employee_data JSONB DEFAULT '{}'::jsonb,
  p_is_service_role BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_card RECORD;
  v_res RECORD;
  v_new_emp_id UUID;
  v_existing_emp RECORD;
  v_dept_id UUID;
  v_desig_id UUID;
  v_dob DATE;
  v_joining_date DATE;
  v_is_service_role BOOLEAN;
  v_actual_creator_id UUID;
BEGIN
  -- Derive service-role authorization strictly from verified execution context
  v_is_service_role := public.is_service_role();

  -- Impersonation check: Caller cannot assert p_is_service_role = TRUE without verified context
  IF p_is_service_role IS TRUE AND NOT v_is_service_role THEN
    RAISE EXCEPTION 'Security violation: caller cannot assert service-role authorization without verified service-role credentials.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_company_id IS NULL OR p_temporary_card_id IS NULL OR p_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'Parameters (company_id, temporary_card_id, auth_user_id) cannot be NULL.'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF NOT v_is_service_role THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'Unauthenticated access denied.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND company_id = p_company_id AND is_active = true
    ) THEN
      RAISE EXCEPTION 'Unauthorized cross-company access denied.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF p_creator_id IS NOT NULL AND p_creator_id <> auth.uid() THEN
      RAISE EXCEPTION 'Unauthorized caller identity mismatch.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    v_actual_creator_id := COALESCE(p_creator_id, auth.uid());
  ELSE
    v_actual_creator_id := p_creator_id;
  END IF;

  -- 1. Row-lock temporary card to serialize concurrent conversion attempts
  SELECT * INTO v_card
  FROM public.temporary_employee_id_cards
  WHERE id = p_temporary_card_id
    AND company_id = p_company_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF v_card.id IS NULL THEN
    RAISE EXCEPTION 'Active temporary ID card not found for conversion or company mismatch.'
      USING ERRCODE = 'data_exception';
  END IF;

  -- 2. Idempotency & duplicate conversion guard
  IF v_card.employee_id IS NOT NULL THEN
    SELECT * INTO v_existing_emp
    FROM public.employees
    WHERE id = v_card.employee_id
      AND company_id = p_company_id;

    IF v_existing_emp.id IS NOT NULL AND (
      v_existing_emp.user_id = p_auth_user_id OR
      LOWER(v_existing_emp.official_email) = LOWER(p_employee_data->>'official_email')
    ) THEN
      -- Idempotent retry: card is already converted to this exact employee
      RETURN jsonb_build_object(
        'success', true,
        'idempotent', true,
        'employee_id', v_existing_emp.id,
        'employee_code', v_existing_emp.employee_code,
        'message', 'Temporary card already converted to this employee.'
      );
    ELSE
      RAISE EXCEPTION 'Temporary ID card % is already converted to another employee (%).',
        p_temporary_card_id, v_card.employee_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- 3. Row-lock associated reservation & enforce ownership
  SELECT * INTO v_res
  FROM public.employee_code_reservations
  WHERE company_id = p_company_id
    AND (temporary_card_id = p_temporary_card_id OR employee_code = v_card.employee_code)
  FOR UPDATE;

  IF v_res.id IS NOT NULL THEN
    IF v_res.reserved_by IS NULL THEN
      -- Strict check: NULL owner reservations can ONLY be converted by verified service role
      IF NOT v_is_service_role THEN
        RAISE EXCEPTION 'Unauthorized: NULL-owner reservations may only be converted via verified service role.'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
    ELSE
      -- Non-null owner reservation: must match creator OR caller is verified service role
      IF NOT (
        (v_actual_creator_id IS NOT NULL AND v_res.reserved_by = v_actual_creator_id)
        OR v_is_service_role = TRUE
      ) THEN
        RAISE EXCEPTION 'Unauthorized: Caller does not own the reservation for temporary card %.',
          p_temporary_card_id
          USING ERRCODE = 'insufficient_privilege';
      END IF;
    END IF;
  END IF;

  -- Parse optional foreign keys and dates safely
  BEGIN
    v_dept_id := NULLIF(p_employee_data->>'department_id', '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_dept_id := NULL;
  END;

  BEGIN
    v_desig_id := NULLIF(p_employee_data->>'designation_id', '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_desig_id := NULL;
  END;

  BEGIN
    v_dob := NULLIF(p_employee_data->>'date_of_birth', '')::date;
  EXCEPTION WHEN OTHERS THEN
    v_dob := NULL;
  END;

  BEGIN
    v_joining_date := (p_employee_data->>'joining_date')::date;
  EXCEPTION WHEN OTHERS THEN
    v_joining_date := CURRENT_DATE;
  END;

  -- 4. STEP 1: Insert permanent employee record within this transaction
  INSERT INTO public.employees (
    company_id,
    user_id,
    employee_code,
    first_name,
    last_name,
    full_name,
    official_email,
    phone,
    gender,
    date_of_birth,
    department_id,
    designation_id,
    joining_date,
    employment_type,
    employment_status,
    is_active,
    created_by
  ) VALUES (
    p_company_id,
    p_auth_user_id,
    v_card.employee_code, -- Preserves exact employee code
    COALESCE(p_employee_data->>'first_name', ''),
    COALESCE(p_employee_data->>'last_name', ''),
    COALESCE(p_employee_data->>'full_name', ''),
    p_employee_data->>'official_email',
    NULLIF(p_employee_data->>'phone', ''),
    NULLIF(p_employee_data->>'gender', ''),
    v_dob,
    v_dept_id,
    v_desig_id,
    v_joining_date,
    COALESCE(p_employee_data->>'employment_type', 'full_time'),
    'active',
    true,
    v_actual_creator_id
  ) RETURNING id INTO v_new_emp_id;

  -- 5. STEP 2: Associate temporary card with permanent employee
  UPDATE public.temporary_employee_id_cards
  SET employee_id = v_new_emp_id
  WHERE id = p_temporary_card_id;

  -- 6. STEP 3: Transition reservation status to CONVERTED
  IF v_res.id IS NOT NULL THEN
    UPDATE public.employee_code_reservations
    SET status = 'CONVERTED',
        employee_id = v_new_emp_id,
        temporary_card_id = p_temporary_card_id,
        consumed_at = NOW()
    WHERE id = v_res.id;
  ELSE
    UPDATE public.employee_code_reservations
    SET status = 'CONVERTED',
        employee_id = v_new_emp_id,
        temporary_card_id = p_temporary_card_id,
        consumed_at = NOW()
    WHERE company_id = p_company_id
      AND employee_code = v_card.employee_code
      AND status IN ('ACTIVE', 'COMMITTED');
  END IF;

  -- 7. Link users table
  UPDATE public.users
  SET employee_id = v_new_emp_id
  WHERE id = p_auth_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'converted', true,
    'employee_id', v_new_emp_id,
    'employee_code', v_card.employee_code
  );
END;
$$;

-- ------------------------------------------------------------------------------
-- 8. Restricted Legacy Function: allocate_next_employee_code
-- RESTRICTED: Kept solely for backward compatibility. Uses a 2-minute lease.
-- Primary application code must use reserve_next_employee_code to manage reservation lifecycle.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.allocate_next_employee_code(
  p_company_id UUID,
  p_is_temporary BOOLEAN DEFAULT FALSE,
  p_user_id UUID DEFAULT NULL,
  p_is_service_role BOOLEAN DEFAULT FALSE
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_rec RECORD;
  v_res_type TEXT;
  v_is_service_role BOOLEAN;
BEGIN
  v_is_service_role := public.is_service_role();

  IF p_is_service_role IS TRUE AND NOT v_is_service_role THEN
    RAISE EXCEPTION 'Security violation: caller cannot assert service-role authorization without verified service-role credentials.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_res_type := CASE WHEN p_is_temporary THEN 'TEMPORARY_CARD' ELSE 'PERMANENT_EMPLOYEE' END;
  SELECT * INTO v_rec FROM public.reserve_next_employee_code(p_company_id, v_res_type, p_user_id, 2, v_is_service_role);
  RETURN v_rec.employee_code;
END;
$$;

-- ------------------------------------------------------------------------------
-- 9. Automatic Fallback Commit Triggers on Insert
-- Auto-commits active, unexpired reservations when temporary card or employee is inserted.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_auto_commit_code_reservation_temp_card()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  -- If metadata contains specific reservation_id, commit that specific reservation
  IF NEW.metadata ? 'reservation_id' THEN
    UPDATE public.employee_code_reservations
    SET status = 'COMMITTED',
        temporary_card_id = NEW.id,
        consumed_at = NOW()
    WHERE id = (NEW.metadata->>'reservation_id')::uuid
      AND company_id = NEW.company_id
      AND status = 'ACTIVE'
      AND expires_at >= NOW();
  ELSE
    -- Generic commit for matching active, unexpired reservation
    UPDATE public.employee_code_reservations
    SET status = 'COMMITTED',
        temporary_card_id = NEW.id,
        consumed_at = NOW()
    WHERE company_id = NEW.company_id
      AND employee_code = NEW.employee_code
      AND status = 'ACTIVE'
      AND expires_at >= NOW();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_commit_code_reservation_on_temp_card ON public.temporary_employee_id_cards;
CREATE TRIGGER trg_commit_code_reservation_on_temp_card
  AFTER INSERT ON public.temporary_employee_id_cards
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_auto_commit_code_reservation_temp_card();

CREATE OR REPLACE FUNCTION public.trg_auto_commit_code_reservation_employee()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  -- 1. Auto-commit reservation if active and not expired
  UPDATE public.employee_code_reservations
  SET status = 'COMMITTED',
      employee_id = NEW.id,
      consumed_at = NOW()
  WHERE company_id = NEW.company_id
    AND employee_code = NEW.employee_code
    AND status = 'ACTIVE'
    AND expires_at >= NOW();

  -- 2. If an active unlinked temporary card exists with the same code, link it
  UPDATE public.temporary_employee_id_cards
  SET employee_id = NEW.id
  WHERE company_id = NEW.company_id
    AND employee_code = NEW.employee_code
    AND employee_id IS NULL
    AND deleted_at IS NULL;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_commit_code_reservation_on_employee ON public.employees;
CREATE TRIGGER trg_commit_code_reservation_on_employee
  AFTER INSERT ON public.employees
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_auto_commit_code_reservation_employee();

-- ------------------------------------------------------------------------------
-- 10. RLS & Permissions
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view own company code reservations" ON public.employee_code_reservations;
CREATE POLICY "Users can view own company code reservations"
  ON public.employee_code_reservations
  FOR SELECT
  TO authenticated
  USING (company_id = (SELECT u.company_id FROM public.users u WHERE u.id = (SELECT auth.uid())));

REVOKE ALL ON TABLE public.employee_code_reservations FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.employee_code_reservations TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_service_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_service_role() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.reserve_next_employee_code(UUID, TEXT, UUID, INTEGER, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reserve_next_employee_code(UUID, TEXT, UUID, INTEGER, BOOLEAN) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.renew_employee_code_reservation(UUID, UUID, UUID, INTEGER, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.renew_employee_code_reservation(UUID, UUID, UUID, INTEGER, BOOLEAN) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.commit_employee_code_reservation(UUID, UUID, UUID, UUID, UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commit_employee_code_reservation(UUID, UUID, UUID, UUID, UUID, BOOLEAN) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.release_employee_code_reservation(UUID, UUID, UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.release_employee_code_reservation(UUID, UUID, UUID, BOOLEAN) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.convert_temporary_card_to_employee(UUID, UUID, UUID, UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.convert_temporary_card_to_employee(UUID, UUID, UUID, UUID, BOOLEAN) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.convert_temporary_card_to_permanent_employee(UUID, UUID, UUID, UUID, JSONB, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.convert_temporary_card_to_permanent_employee(UUID, UUID, UUID, UUID, JSONB, BOOLEAN) TO service_role;

REVOKE ALL ON FUNCTION public.allocate_next_employee_code(UUID, BOOLEAN, UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.allocate_next_employee_code(UUID, BOOLEAN, UUID, BOOLEAN) TO authenticated, service_role;
