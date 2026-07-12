-- ============================================================
-- RollBowl Migration 032: Purchase Subscription RPC
-- ============================================================
-- Atomically creates a payment_records row and a subscriptions row
-- using the current authoritative price from subscription_plans.
-- ============================================================

CREATE OR REPLACE FUNCTION purchase_subscription(
  p_user_id UUID,
  p_plan_id UUID,
  p_stall_id UUID,
  p_terms_version TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_plan record;
  v_new_end_date DATE;
  v_extended_days INT;
  v_sub_id UUID;
  v_start_date DATE;
BEGIN
  -- 1. Fetch and validate the active plan to get authoritative price
  SELECT * INTO v_plan
  FROM subscription_plans
  WHERE id = p_plan_id AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active subscription plan not found';
  END IF;

  -- 2. Prevent duplicate active subscriptions
  IF EXISTS (
    SELECT 1 FROM subscriptions 
    WHERE user_id = p_user_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'User already has an active subscription';
  END IF;

  v_start_date := CURRENT_DATE;

  -- 3. Calculate deterministic expiry
  -- We rely on the existing calculate_subscription_expiry RPC
  SELECT new_end_date, extended_days 
  INTO v_new_end_date, v_extended_days
  FROM calculate_subscription_expiry(v_start_date, v_plan.duration_days, p_stall_id);

  IF v_new_end_date IS NULL THEN
    RAISE EXCEPTION 'Failed to calculate subscription expiry';
  END IF;

  -- 4. Create the subscription with purchase_price snapshot
  INSERT INTO subscriptions (
    user_id,
    plan_id,
    plan_name,
    status,
    start_date,
    end_date,
    extended_days,
    total_meals,
    consumed_meals,
    remaining_meals,
    meals_per_day,
    daily_credits_used,
    accepted_terms_version,
    accepted_terms_at,
    purchase_price,
    currency
  ) VALUES (
    p_user_id,
    p_plan_id,
    v_plan.name,
    'active',
    v_start_date,
    v_new_end_date,
    v_extended_days,
    v_plan.total_meals,
    0,
    v_plan.total_meals,
    v_plan.meals_per_day,
    0,
    p_terms_version,
    now(),
    v_plan.price, -- snapshot authoritative price
    'INR'
  ) RETURNING id INTO v_sub_id;

  -- 5. Create payment record atomically
  INSERT INTO payment_records (
    subscription_id,
    amount,
    status,
    method
  ) VALUES (
    v_sub_id,
    v_plan.price,
    'paid',      -- Assume paid for this internal purchase RPC (demo/simulate scenario)
    'simulated'
  );

  RETURN v_sub_id;
END;
$$;
