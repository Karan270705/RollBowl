-- ============================================================
-- RollBowl Migration 065: Fix Payment Method Check Constraint
-- ============================================================
-- Adds 'subscription' back to the payment method check constraint
-- which was removed in migration 062

-- Update orders table check constraint to include 'subscription'
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_method_check;
ALTER TABLE orders ADD CONSTRAINT orders_payment_method_check
  CHECK (payment_method IN ('cash', 'upi', 'razorpay', 'subscription'));

-- Update subscription_purchase_requests table check constraint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'subscription_purchase_requests_payment_method_check'
  ) THEN
    ALTER TABLE subscription_purchase_requests DROP CONSTRAINT subscription_purchase_requests_payment_method_check;
    ALTER TABLE subscription_purchase_requests ADD CONSTRAINT subscription_purchase_requests_payment_method_check
      CHECK (payment_method IN ('cash', 'upi', 'razorpay'));
  END IF;
END$$;
