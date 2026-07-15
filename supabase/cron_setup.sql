-- ============================================================
-- RollBowl pg_cron Setup: Batch Auto-Closure
-- ============================================================

-- 1. Ensure the pg_cron extension is enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2. Safely unschedule the existing job if it is already scheduled to prevent duplicates
DO $$
DECLARE
  v_job_id INTEGER;
BEGIN
  SELECT jobid INTO v_job_id FROM cron.job WHERE jobname = 'auto-close-expired-inventory-batches-15m';
  IF FOUND THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;
END;
$$;

-- 3. Schedule the function to run every 15 minutes
-- Invokes public.close_expired_inventory_batches() directly
SELECT cron.schedule(
  'auto-close-expired-inventory-batches-15m',
  '*/15 * * * *',
  $$SELECT public.close_expired_inventory_batches();$$
);

-- ============================================================
-- VERIFICATION QUERIES (Run these manually in SQL Editor)
-- ============================================================

-- Verify that the job is successfully scheduled:
-- SELECT * FROM cron.job WHERE jobname = 'auto-close-expired-inventory-batches-15m';

-- Query job history and runs:
-- SELECT * FROM cron.job_run_details 
-- WHERE jobname = 'auto-close-expired-inventory-batches-15m' 
-- ORDER BY start_time DESC 
-- LIMIT 10;
