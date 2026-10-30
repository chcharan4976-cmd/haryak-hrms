-- ============================================================
-- HARYAK ONE — 14-Day Chat Message Retention & Automated Cleanup Migration
-- Haryak Technologies India Private Limited
-- Company Tagline: Empowering Tomorrow’s Solutions, Today.
-- Migration Date: October 22, 2026
-- ============================================================
--
-- RETENTION POLICY SPECIFICATION:
-- 1. All chat messages in `chat_messages` expire exactly 14 days after creation:
--    expires_at = created_at + INTERVAL '14 days'
-- 2. Reading, editing, replying to, or acknowledging a message does NOT extend retention.
-- 3. Cleanup is restricted SOLELY to `chat_messages` (and FK-cascaded `chat_message_receipts`).
-- 4. STRICT DATA PROTECTION ALLOWLIST:
--    This migration NEVER deletes or modifies:
--    - payslips, payroll_runs, payroll_employee_records, payroll_earnings, payroll_deductions
--    - documents, document_versions, document_categories
--    - employees, users, companies, departments, designations
--    - attendance_records, timesheets, timesheet_entries
--    - leave_requests, leave_balances, leave_types
--    - audit_logs, security_events, hr_requests
-- ============================================================

-- ------------------------------------------------------------
-- STEP 1: Add `expires_at` column to `chat_messages`
-- ------------------------------------------------------------
ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- ------------------------------------------------------------
-- STEP 2: Backfill existing chat messages using original `created_at`
-- ------------------------------------------------------------
UPDATE chat_messages
SET expires_at = created_at + INTERVAL '14 days'
WHERE expires_at IS NULL;

-- ------------------------------------------------------------
-- STEP 3: Automated trigger to set `expires_at` on new messages
-- Ensures every message receives expires_at = created_at + 14 days
-- regardless of insertion method (direct SQL, SDK, or API).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_chat_message_expires_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.expires_at IS NULL THEN
    NEW.expires_at := COALESCE(NEW.created_at, NOW()) + INTERVAL '14 days';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_chat_messages_expires_at ON chat_messages;
CREATE TRIGGER trg_chat_messages_expires_at
  BEFORE INSERT ON chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION set_chat_message_expires_at();

-- ------------------------------------------------------------
-- STEP 4: Performance Indexes for Expiry Filtering & Cleanup
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_chat_messages_expires_at
  ON chat_messages(expires_at)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_chat_messages_cleanup_active
  ON chat_messages(company_id, expires_at)
  WHERE deleted_at IS NULL;

-- ------------------------------------------------------------
-- STEP 5: Stored Procedure for Bounded, Idempotent Cleanup
-- Deletes expired chat messages in bounded batches with safety caps.
-- Cascading foreign keys safely remove child rows in `chat_message_receipts`.
-- ------------------------------------------------------------
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
  v_target_company_id UUID;
BEGIN
  LOOP
    EXIT WHEN v_total_deleted >= v_cap;

    WITH expired_batch AS (
      SELECT id
      FROM chat_messages
      WHERE expires_at <= NOW()
      LIMIT v_limit
      FOR UPDATE SKIP LOCKED
    )
    DELETE FROM chat_messages
    WHERE id IN (SELECT id FROM expired_batch);

    GET DIAGNOSTICS v_batch_deleted = ROW_COUNT;
    v_total_deleted := v_total_deleted + v_batch_deleted;
    v_batches := v_batches + 1;

    EXIT WHEN v_batch_deleted = 0;
  END LOOP;

  -- Record job execution in scheduled_job_runs if any messages were cleaned or periodically
  BEGIN
    SELECT id INTO v_target_company_id FROM companies LIMIT 1;
    IF v_target_company_id IS NOT NULL THEN
      INSERT INTO scheduled_job_runs (
        company_id,
        job_name,
        status,
        idempotency_key,
        records_processed,
        details,
        executed_at
      )
      VALUES (
        v_target_company_id,
        'chat_message_cleanup',
        'success',
        'chat_clean_' || TO_CHAR(NOW() AT TIME ZONE 'UTC', 'YYYYMMDD_HH24MI_SS') || '_' || SUBSTRING(gen_random_uuid()::text, 1, 8),
        v_total_deleted,
        jsonb_build_object(
          'deleted_count', v_total_deleted,
          'batches_processed', v_batches,
          'duration_ms', ROUND(EXTRACT(EPOCH FROM (clock_timestamp() - v_start_time)) * 1000),
          'retention_policy_days', 14,
          'executed_at_utc', NOW() AT TIME ZONE 'UTC'
        ),
        NOW()
      );
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      -- Logging failure should not abort the successful deletion
      NULL;
  END;

  RETURN jsonb_build_object(
    'success', TRUE,
    'deleted_count', v_total_deleted,
    'batches_processed', v_batches,
    'duration_ms', ROUND(EXTRACT(EPOCH FROM (clock_timestamp() - v_start_time)) * 1000),
    'cutoff_timestamp', NOW()
  );
END;
$$;

-- Restrict execution to service_role and postgres superusers
REVOKE ALL ON FUNCTION cleanup_expired_chat_messages(INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION cleanup_expired_chat_messages(INT, INT) TO service_role;
GRANT EXECUTE ON FUNCTION cleanup_expired_chat_messages(INT, INT) TO postgres;

-- ------------------------------------------------------------
-- STEP 6: Scheduler Registration (pg_cron or Edge Function fallback)
-- ------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) THEN
    PERFORM cron.unschedule('cleanup-expired-chat-messages')
    WHERE EXISTS (
      SELECT 1 FROM cron.job WHERE jobname = 'cleanup-expired-chat-messages'
    );

    PERFORM cron.schedule(
      'cleanup-expired-chat-messages',
      '0 3 * * *', -- Daily at 03:00 UTC
      'SELECT cleanup_expired_chat_messages(500, 5000);'
    );
    RAISE NOTICE 'pg_cron job cleanup-expired-chat-messages scheduled for 03:00 UTC daily.';
  ELSE
    RAISE NOTICE 'pg_cron extension not found. Configure automated invocation via Supabase Edge Function or cron caller targeting POST /api/chat/cleanup.';
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Scheduler configuration notice: %. Automated cleanup can be invoked via /api/chat/cleanup.', SQLERRM;
END $$;

-- ============================================================
-- ROLLBACK SCRIPT (Execute only if rolling back this migration):
-- ============================================================
-- DO $$
-- BEGIN
--   IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
--     PERFORM cron.unschedule('cleanup-expired-chat-messages')
--     WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-expired-chat-messages');
--   END IF;
-- EXCEPTION WHEN OTHERS THEN NULL;
-- END $$;
-- DROP FUNCTION IF EXISTS cleanup_expired_chat_messages(INT, INT);
-- DROP TRIGGER IF EXISTS trg_chat_messages_expires_at ON chat_messages;
-- DROP FUNCTION IF EXISTS set_chat_message_expires_at();
-- DROP INDEX IF EXISTS idx_chat_messages_cleanup_active;
-- DROP INDEX IF EXISTS idx_chat_messages_expires_at;
-- ALTER TABLE chat_messages DROP COLUMN IF EXISTS expires_at;
