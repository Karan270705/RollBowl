-- ============================================================
-- RollBowl Migration 029: Subscription Expiry RPC
-- ============================================================

-- 1. Deterministic Expiry Calculation Function
-- Calculates the exact end date and extended days for a given start date and duration.
-- It iteratively expands the end date to account for holidays that fall within the new period.
CREATE OR REPLACE FUNCTION calculate_subscription_expiry(
  p_start_date DATE,
  p_duration_days INT,
  p_stall_id UUID
) RETURNS TABLE (
  new_end_date DATE,
  extended_days INT
) LANGUAGE plpgsql AS $$
DECLARE
  v_base_end_date DATE;
  v_current_end_date DATE;
  v_new_end_date DATE;
  v_holiday_count INT;
BEGIN
  -- Base end date is start_date + duration - 1
  v_base_end_date := p_start_date + (p_duration_days - 1);
  v_new_end_date := v_base_end_date;
  
  LOOP
    v_current_end_date := v_new_end_date;
    
    -- Count active holidays between start_date and current_end_date for the stall
    SELECT COUNT(*) INTO v_holiday_count
    FROM kitchen_holidays
    WHERE stall_id = p_stall_id
      AND is_active = true
      AND holiday_date BETWEEN p_start_date AND v_current_end_date;
      
    v_new_end_date := v_base_end_date + v_holiday_count;
    
    -- If the new end date is the same as current, we've stabilized
    EXIT WHEN v_new_end_date = v_current_end_date;
  END LOOP;
  
  RETURN QUERY SELECT v_new_end_date, v_holiday_count;
END;
$$;

-- 2. Bulk Recalculation for Overlapping Subscriptions
-- Finds all active subscriptions that overlap with a modified holiday date
-- and updates their end_date and extended_days using the deterministic algorithm.
CREATE OR REPLACE FUNCTION recalculate_overlapping_subscriptions(
  p_stall_id UUID,
  p_holiday_date DATE
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  sub RECORD;
  calc RECORD;
BEGIN
  FOR sub IN 
    SELECT s.id, s.start_date, s.end_date, s.extended_days, p.duration_days
    FROM subscriptions s
    JOIN subscription_plans p ON s.plan_id = p.id
    WHERE s.status = 'active'
      AND s.start_date <= p_holiday_date 
      AND s.end_date >= p_holiday_date
  LOOP
    -- Recalculate expiry
    SELECT * INTO calc FROM calculate_subscription_expiry(sub.start_date, sub.duration_days, p_stall_id);
    
    -- Update if changed
    IF calc.new_end_date != sub.end_date OR calc.extended_days != sub.extended_days THEN
      UPDATE subscriptions
      SET end_date = calc.new_end_date,
          extended_days = calc.extended_days
      WHERE id = sub.id;
    END IF;
  END LOOP;
END;
$$;
