-- ============================================================
-- RollBowl Migration 031: Update Subscription Plan Prices
-- ============================================================
-- Updates the current catalogue prices for active plans.
-- 
-- Previous:
-- Solo: 1200.00
-- Plus: 2100.00
--
-- New:
-- Solo: 1200.00 (unchanged)
-- Plus: 2099.00
-- ============================================================

DO $$ 
DECLARE
  v_solo_count INT;
  v_plus_count INT;
BEGIN
  -- Verify the intended records exist before updating
  SELECT count(*) INTO v_solo_count FROM subscription_plans WHERE name = 'Solo Plan' AND is_active = true;
  SELECT count(*) INTO v_plus_count FROM subscription_plans WHERE name = 'Plus Plan' AND is_active = true;
  
  IF v_solo_count = 0 THEN
    RAISE EXCEPTION 'Active Solo Plan not found in subscription_plans';
  END IF;

  IF v_plus_count = 0 THEN
    RAISE EXCEPTION 'Active Plus Plan not found in subscription_plans';
  END IF;

  -- Safe update
  UPDATE subscription_plans
  SET price = 1200.00
  WHERE name = 'Solo Plan' AND is_active = true;

  UPDATE subscription_plans
  SET price = 2099.00
  WHERE name = 'Plus Plan' AND is_active = true;

END $$;
