-- ============================================================
-- RollBowl Migration 007: Inventory & Reservations
-- ============================================================
-- inventory_items tracks live extra-meal stock at each stall.
-- meal_reservations allows customers to hold inventory items.
-- ============================================================

-- ─── Inventory Items ────────────────────────────────────────

CREATE TABLE inventory_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meal_id             UUID NOT NULL REFERENCES meals(id) ON DELETE CASCADE,
  meal_name           TEXT NOT NULL,
  stall_id            UUID NOT NULL REFERENCES stalls(id) ON DELETE CASCADE,
  category            meal_category NOT NULL,
  total_quantity      INTEGER NOT NULL DEFAULT 0,
  sold_quantity       INTEGER NOT NULL DEFAULT 0,
  reserved_quantity   INTEGER NOT NULL DEFAULT 0,
  available_quantity  INTEGER NOT NULL DEFAULT 0,
  price               NUMERIC(10,2) NOT NULL,
  is_available        BOOLEAN NOT NULL DEFAULT true,  
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE inventory_items IS 'Live stall inventory for extra meal availability.';

-- Constraint: quantities must be non-negative
ALTER TABLE inventory_items ADD CONSTRAINT inv_available_non_negative CHECK (available_quantity >= 0);
ALTER TABLE inventory_items ADD CONSTRAINT inv_total_non_negative CHECK (total_quantity >= 0);
ALTER TABLE inventory_items ADD CONSTRAINT inv_sold_non_negative CHECK (sold_quantity >= 0);
ALTER TABLE inventory_items ADD CONSTRAINT inv_reserved_non_negative CHECK (reserved_quantity >= 0);

-- ─── Trigger: Auto-update updated_at on inventory ───────────

CREATE OR REPLACE FUNCTION update_inventory_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER inventory_updated_at_trigger
  BEFORE UPDATE ON inventory_items
  FOR EACH ROW EXECUTE FUNCTION update_inventory_updated_at();

-- ─── Meal Reservations ──────────────────────────────────────

CREATE TABLE meal_reservations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  inventory_item_id   UUID NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  meal_name           TEXT NOT NULL,
  stall_name          TEXT NOT NULL,
  quantity            INTEGER NOT NULL DEFAULT 1,
  pickup_time         TIMESTAMPTZ NOT NULL,
  status              reservation_status NOT NULL DEFAULT 'pending',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE meal_reservations IS 'Customer reservations (holds) on extra inventory items.';

-- Constraint: quantity must be at least 1
ALTER TABLE meal_reservations ADD CONSTRAINT reservations_quantity_positive CHECK (quantity >= 1);
