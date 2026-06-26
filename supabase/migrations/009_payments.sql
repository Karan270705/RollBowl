-- ============================================================
-- RollBowl Migration 009: Payment Records
-- ============================================================
-- Transaction ledger for orders and subscriptions.
-- ============================================================

CREATE TABLE payment_records (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID REFERENCES orders(id) ON DELETE SET NULL,
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
  amount          NUMERIC(10,2) NOT NULL,
  status          payment_status NOT NULL DEFAULT 'pending',
  method          TEXT NOT NULL DEFAULT '',
  transaction_id  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE payment_records IS 'Payment transaction ledger for orders and subscriptions.';

-- Constraint: amount must be positive
ALTER TABLE payment_records ADD CONSTRAINT payments_amount_positive CHECK (amount > 0);

-- At least one of order_id or subscription_id should be set
-- (advisory — not enforced via CHECK to allow flexibility)
