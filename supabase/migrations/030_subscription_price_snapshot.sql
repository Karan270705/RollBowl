-- ============================================================
-- RollBowl Migration 030: Subscription Price Snapshot
-- ============================================================
-- Adds historical purchase price safety to subscriptions table.
-- Ensures that future catalogue price changes do not rewrite 
-- the apparent amount paid for existing subscriptions.
-- ============================================================

ALTER TABLE subscriptions
ADD COLUMN IF NOT EXISTS purchase_price NUMERIC(10,2),
ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'INR';

-- Note: Existing subscriptions will have purchase_price = NULL.
-- Since we cannot reliably guarantee their historical amount, 
-- they will remain NULL and display as "Not recorded" in reports.
