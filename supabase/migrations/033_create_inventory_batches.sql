-- ============================================================
-- RollBowl Migration 033: Inventory Batches Schema
-- ============================================================
-- Creates the foundational tables for the shared inventory 
-- backend. Replaces the legacy inventory tables (007) but 
-- avoids modifying them for safety.
-- ============================================================

-- 1. Inventory Batches
CREATE TABLE inventory_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stall_id UUID NOT NULL REFERENCES stalls(id) ON DELETE RESTRICT,
  inventory_date DATE NOT NULL,
  window_start TIME NOT NULL,
  window_end TIME NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'closed', 'cancelled')),
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  notes TEXT,
  activated_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE inventory_batches IS 'Physical delivery inventory sessions for a specific stall and pickup window.';

-- Partial unique index to prevent duplicate active batches for the same stall, date, and window.
CREATE UNIQUE INDEX idx_unique_active_inventory_batch 
ON inventory_batches (stall_id, inventory_date, window_start, window_end)
WHERE status = 'active';

-- Index for querying batches by date and stall
CREATE INDEX idx_inventory_batches_stall_date ON inventory_batches (stall_id, inventory_date);
CREATE INDEX idx_inventory_batches_status ON inventory_batches (status);

-- 2. Inventory Batch Items
CREATE TABLE inventory_batch_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_batch_id UUID NOT NULL REFERENCES inventory_batches(id) ON DELETE CASCADE,
  meal_id UUID NOT NULL REFERENCES meals(id) ON DELETE RESTRICT,
  loaded_quantity INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT inv_batch_item_unique UNIQUE (inventory_batch_id, meal_id),
  CONSTRAINT inv_batch_loaded_non_negative CHECK (loaded_quantity >= 0)
);

COMMENT ON TABLE inventory_batch_items IS 'Loaded stock per menu item within an inventory batch.';

-- Index for finding items by meal and batch
CREATE INDEX idx_inventory_batch_items_meal ON inventory_batch_items(meal_id);
CREATE INDEX idx_inventory_batch_items_batch ON inventory_batch_items(inventory_batch_id);

-- 3. Triggers for updated_at
CREATE OR REPLACE FUNCTION update_inventory_batches_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER inventory_batches_updated_at_trigger
  BEFORE UPDATE ON inventory_batches
  FOR EACH ROW EXECUTE FUNCTION update_inventory_batches_updated_at();

CREATE OR REPLACE FUNCTION update_inventory_batch_items_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER inventory_batch_items_updated_at_trigger
  BEFORE UPDATE ON inventory_batch_items
  FOR EACH ROW EXECUTE FUNCTION update_inventory_batch_items_updated_at();
