-- ============================================================
-- RollBowl Migration 023: Membership Terms Acceptance
-- ============================================================
-- Adds fields to track T&C acceptance per subscription.
-- ============================================================

ALTER TABLE subscriptions
ADD COLUMN IF NOT EXISTS accepted_terms_version TEXT,
ADD COLUMN IF NOT EXISTS accepted_terms_at TIMESTAMPTZ;

COMMENT ON COLUMN subscriptions.accepted_terms_version IS 'The version of the T&C accepted by the user for this subscription.';
COMMENT ON COLUMN subscriptions.accepted_terms_at IS 'The timestamp when the user accepted the terms.';
