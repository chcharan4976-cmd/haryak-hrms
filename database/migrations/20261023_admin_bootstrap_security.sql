-- ============================================================
-- HARYAK ONE — Initial Admin Bootstrap & Forced Password Reset Security Migration
-- Haryak Technologies India Private Limited
-- Company Tagline: Empowering Tomorrow’s Solutions, Today.
-- Migration Date: October 23, 2026
-- ============================================================

-- 1. Add `must_change_password` flag to `public.users` table
-- Tracks server-side forced password change status in addition to auth user_metadata
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Add index for fast Super Admin existence check
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);
CREATE INDEX IF NOT EXISTS idx_roles_name ON roles(name);
CREATE INDEX IF NOT EXISTS idx_user_roles_role_user ON user_roles(role_id, user_id);

-- 3. Stored function: check if an active Super Admin exists in the database
CREATE OR REPLACE FUNCTION has_active_super_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_exists BOOLEAN := FALSE;
BEGIN
  SELECT TRUE INTO v_exists
  FROM user_roles ur
  JOIN roles r ON r.id = ur.role_id
  JOIN users u ON u.id = ur.user_id
  WHERE r.name = 'SUPER_ADMIN'
    AND u.is_active = TRUE
  LIMIT 1;

  RETURN COALESCE(v_exists, FALSE);
END;
$$;

REVOKE ALL ON FUNCTION has_active_super_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION has_active_super_admin() TO service_role, postgres, authenticated, anon;
