-- ============================================================
-- RollBowl Migration 026: Expected Pickup Slot
-- ============================================================

ALTER TABLE orders ADD COLUMN expected_pickup_slot TEXT;

COMMENT ON COLUMN orders.expected_pickup_slot IS 'Customer selected pickup time slot (e.g. 12:00–12:30, Not Sure).';
