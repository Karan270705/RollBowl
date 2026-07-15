-- ============================================================
-- RollBowl Migration 045: Payment Screenshots Retention Cleanup
-- ============================================================
-- Adds metadata columns for cleanup, partial index for efficiency,
-- and a database view containing cleanup logic for screenshots.
-- ============================================================

BEGIN;

-- 1. Add tracking columns to payment_proofs if they don't exist
ALTER TABLE payment_proofs
ADD COLUMN IF NOT EXISTS screenshot_deleted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS screenshot_delete_error TEXT,
ADD COLUMN IF NOT EXISTS screenshot_delete_attempted_at TIMESTAMPTZ;

-- 2. Create a targeted partial index to identify uncleaned proofs efficiently
CREATE INDEX IF NOT EXISTS idx_payment_proofs_retention_eligible
ON payment_proofs (status, verified_at, submitted_at)
WHERE screenshot_path IS NOT NULL AND screenshot_deleted_at IS NULL;

-- 3. Create view for eligible screenshots to delete
CREATE OR REPLACE VIEW eligible_payment_proofs_cleanup AS
SELECT p.id, p.screenshot_path
FROM payment_proofs p
WHERE p.screenshot_path IS NOT NULL
  AND p.screenshot_deleted_at IS NULL
  AND (
    (
      p.status = 'verified'
      AND p.verified_at IS NOT NULL
      AND p.verified_at < (now() - interval '7 days')
    )
    OR
    (
      p.status = 'superseded'
      AND p.submitted_at < (now() - interval '7 days')
    )
  )
  -- For order proofs: verify the related order is no longer awaiting proof or verification
  AND (
    p.payment_context != 'order'
    OR EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = p.order_id
        AND o.payment_verification_status NOT IN ('awaiting_proof', 'pending')
    )
  )
  -- For subscription proofs: verify the related subscription request is in a final status (approved, rejected, cancelled)
  AND (
    p.payment_context != 'subscription'
    OR EXISTS (
      SELECT 1 FROM subscription_purchase_requests r
      WHERE r.id = p.subscription_request_id
        AND r.status IN ('approved', 'rejected', 'cancelled')
    )
  );

-- 4. Restrict direct view access to postgres/service_role roles only (RLS bypass)
REVOKE ALL ON eligible_payment_proofs_cleanup FROM PUBLIC;
REVOKE ALL ON eligible_payment_proofs_cleanup FROM anon;
REVOKE ALL ON eligible_payment_proofs_cleanup FROM authenticated;

COMMIT;
