-- ============================================================
-- RollBowl Migration 005: Orders & Order Items
-- ============================================================
-- Orders are the core transactional entity.
-- order_items are line items within an order.
-- ============================================================

-- ─── Orders ─────────────────────────────────────────────────

CREATE TABLE orders (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number          TEXT NOT NULL UNIQUE,
  user_id               UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  customer_name         TEXT NOT NULL,
  stall_id              UUID NOT NULL REFERENCES stalls(id) ON DELETE RESTRICT,
  stall_name            TEXT NOT NULL,
  status                order_status NOT NULL DEFAULT 'pending',
  order_type            order_type NOT NULL,
  payment_status        payment_status NOT NULL DEFAULT 'pending',
  subtotal              NUMERIC(10,2) NOT NULL DEFAULT 0,
  tax                   NUMERIC(10,2) NOT NULL DEFAULT 0,
  discount              NUMERIC(10,2) NOT NULL DEFAULT 0,
  total                 NUMERIC(10,2) NOT NULL DEFAULT 0,
  notes                 TEXT,
  estimated_ready_time  TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE orders IS 'Customer order headers (pre-order, on-stall, subscription).';

-- Constraint: total must be non-negative
ALTER TABLE orders ADD CONSTRAINT orders_total_non_negative CHECK (total >= 0);

-- ─── Order Items ────────────────────────────────────────────

CREATE TABLE order_items (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id              UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  meal_id               UUID NOT NULL REFERENCES meals(id) ON DELETE RESTRICT,
  meal_name             TEXT NOT NULL,
  quantity              INTEGER NOT NULL DEFAULT 1,
  unit_price            NUMERIC(10,2) NOT NULL,
  total_price           NUMERIC(10,2) NOT NULL,
  special_instructions  TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE order_items IS 'Individual line items within an order.';

-- Constraint: quantity must be at least 1
ALTER TABLE order_items ADD CONSTRAINT order_items_quantity_positive CHECK (quantity >= 1);

-- ─── Trigger: Auto-update updated_at on orders ──────────────

CREATE OR REPLACE FUNCTION update_orders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER orders_updated_at_trigger
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_orders_updated_at();
