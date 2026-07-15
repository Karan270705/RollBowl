-- ============================================================
-- RollBowl Migration 044: Fix create_notification role cast
-- ============================================================

CREATE OR REPLACE FUNCTION create_notification(
  p_user_id UUID,
  p_title TEXT,
  p_body TEXT,
  p_type notification_type,
  p_data JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_notification_id UUID;
  v_caller_role user_role;
BEGIN
  -- 1. Authorization Check: Prevent unauthorized cross-user spam
  IF auth.uid() != p_user_id THEN
    -- Fetch the caller's role from the users table
    SELECT role INTO v_caller_role FROM users WHERE id = auth.uid();
    
    -- If the caller is not a kitchen operator, stall operator, or admin, reject the insert
    -- Cast v_caller_role to text because 'admin' is not in the user_role enum
    IF v_caller_role::text NOT IN ('kitchen', 'stall_operator', 'admin') THEN
      RAISE EXCEPTION 'Unauthorized: Only kitchen operators can create notifications for other users.';
    END IF;
  END IF;

  -- 2. Prevent duplicate notifications for specific events (like EXPIRING or EXPIRED)
  IF p_data IS NOT NULL AND p_data->>'event' IS NOT NULL AND p_data->>'subscriptionId' IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM notifications 
      WHERE user_id = p_user_id 
      AND data->>'event' = p_data->>'event' 
      AND data->>'subscriptionId' = p_data->>'subscriptionId'
    ) THEN
      RETURN NULL; -- Already notified
    END IF;
  END IF;

  -- 3. Securely Insert
  INSERT INTO notifications (user_id, title, body, type, data)
  VALUES (p_user_id, p_title, p_body, p_type, p_data)
  RETURNING id INTO v_notification_id;

  RETURN v_notification_id;
END;
$$;
