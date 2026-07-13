-- ============================================================
-- RollBowl Migration 039: Add Subscription Payment Method
-- ============================================================
-- Extends the payment_method_type ENUM to safely support orders 
-- that are 100% covered by a subscription plan.
-- ============================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_enum 
        JOIN pg_type ON pg_type.oid = pg_enum.enumtypid 
        WHERE pg_type.typname = 'payment_method_type' 
          AND pg_enum.enumlabel = 'subscription'
    ) THEN
        ALTER TYPE payment_method_type ADD VALUE 'subscription';
    END IF;
END$$;
