-- ============================================================
-- RollBowl Migration 027: Payment Method Enum
-- ============================================================

-- 1. Create the payment_method_type ENUM
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_method_type') THEN
        CREATE TYPE payment_method_type AS ENUM ('upi', 'card', 'cash');
    END IF;
END$$;

-- 2. Add the payment_method column to the orders table
-- We are not providing a default value to enforce explicit passing.
-- However, since there are existing rows, we need to allow NULL initially, 
-- or set a default just for the existing rows, then remove the default. 
-- Since we don't want a default going forward, let's backfill existing rows to 'upi' 
-- and then set NOT NULL.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method payment_method_type;

-- Backfill existing rows
UPDATE orders SET payment_method = 'upi' WHERE payment_method IS NULL;

-- Enforce NOT NULL constraint
ALTER TABLE orders ALTER COLUMN payment_method SET NOT NULL;

COMMENT ON COLUMN orders.payment_method IS 'The method of payment selected by the customer.';
