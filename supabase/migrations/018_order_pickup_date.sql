-- ============================================================
-- RollBowl Migration 018: Order Pickup Date
-- ============================================================
-- Decouples business scheduling from kitchen operational estimates
-- by introducing a dedicated pickup_date.
-- ============================================================

-- 1. Add the column (nullable initially for backfill)
ALTER TABLE orders
  ADD COLUMN pickup_date DATE;

-- 2. Backfill existing records
-- We use estimated_ready_time if available, otherwise created_at
UPDATE orders
  SET pickup_date = DATE(COALESCE(estimated_ready_time, created_at));

-- 3. Enforce NOT NULL for all future records
ALTER TABLE orders
  ALTER COLUMN pickup_date SET NOT NULL;

-- 4. Create an index to speed up date-based queries (which the Kitchen app heavily relies on)
CREATE INDEX idx_orders_pickup_date ON orders(pickup_date);
