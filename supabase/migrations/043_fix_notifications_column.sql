-- ============================================================
-- RollBowl Migration 043: Fix Notifications Column Name
-- ============================================================
-- Re-defines manual payment functions to insert into the correct
-- 'body' column of the 'notifications' table instead of 'message'.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION submit_order_payment_proof(
  p_order_id UUID,
  p_screenshot_path TEXT,
  p_mime_type TEXT,
  p_size BIGINT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_settings RECORD;
  v_proof_id UUID;
  v_ext TEXT;
BEGIN
  IF p_screenshot_path IS NULL OR trim(p_screenshot_path) = '' THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'INVALID_SCREENSHOT_PATH', 'message', 'Screenshot path is required.')::text;
  END IF;

  IF p_mime_type IS NULL OR trim(p_mime_type) = '' THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'INVALID_SCREENSHOT_TYPE', 'message', 'MIME type is required.')::text;
  END IF;

  IF p_size IS NULL THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'INVALID_SCREENSHOT_SIZE', 'message', 'Screenshot size is required.')::text;
  END IF;

  IF p_mime_type NOT IN ('image/jpeg', 'image/png', 'image/webp') THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'INVALID_SCREENSHOT_TYPE', 'message', 'Invalid image format. Supported formats: JPEG, PNG, WEBP.')::text;
  END IF;

  IF p_size <= 0 OR p_size > 5242880 THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'SCREENSHOT_TOO_LARGE', 'message', 'Screenshot must be > 0 and <= 5MB.')::text;
  END IF;

  IF p_screenshot_path !~ ('^orders/' || (auth.uid())::text || '/[^/]+$') THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'INVALID_SCREENSHOT_PATH', 'message', 'Invalid screenshot path format. Must be exactly orders/{uid}/{filename} with no nested directories.')::text;
  END IF;

  IF p_screenshot_path ~ ('^orders/' || (auth.uid())::text || '/\.[^/]+$') THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'INVALID_SCREENSHOT_PATH', 'message', 'Filename must not consist only of an extension.')::text;
  END IF;

  v_ext := lower(substring(p_screenshot_path from '\.([^\.]+)$'));
  IF v_ext NOT IN ('jpg', 'jpeg', 'png', 'webp') THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'INVALID_SCREENSHOT_TYPE', 'message', 'Invalid file extension.')::text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM storage.objects
    WHERE bucket_id = 'payment-proofs'
      AND name = p_screenshot_path
  ) THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'INVALID_SCREENSHOT_PATH', 'message', 'Screenshot object does not exist in storage.')::text;
  END IF;
  
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN 
    RAISE EXCEPTION '%', jsonb_build_object('code', 'ORDER_NOT_FOUND', 'message', 'Order not found.')::text; 
  END IF;

  IF v_order.user_id != auth.uid() THEN 
    RAISE EXCEPTION '%', jsonb_build_object('code', 'UNAUTHORIZED', 'message', 'Not authorized.')::text; 
  END IF;

  IF v_order.payment_method != 'upi' THEN 
    RAISE EXCEPTION '%', jsonb_build_object('code', 'ORDER_NOT_UPI', 'message', 'Not a UPI order.')::text; 
  END IF;

  IF v_order.status IN ('cancelled') OR v_order.payment_verification_status = 'expired' THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'PAYMENT_PROOF_EXPIRED', 'message', 'Order is cancelled or expired.')::text;
  END IF;

  IF v_order.payment_verification_status = 'awaiting_proof' AND v_order.payment_proof_deadline < now() THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'PAYMENT_PROOF_EXPIRED', 'message', 'Payment proof submission time has expired.')::text;
  END IF;

  IF v_order.payment_verification_status NOT IN ('awaiting_proof', 'rejected') THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'PAYMENT_PROOF_NOT_PENDING', 'message', 'Payment proof is not pending or awaiting proof.')::text;
  END IF;

  SELECT * INTO v_settings FROM payment_settings 
  WHERE stall_id = v_order.stall_id AND is_active = true;
  IF NOT FOUND THEN 
    RAISE EXCEPTION '%', jsonb_build_object('code', 'PAYMENT_SETTINGS_NOT_FOUND', 'message', 'No active payment settings for this stall.')::text; 
  END IF;

  UPDATE payment_proofs SET status = 'superseded' 
  WHERE order_id = p_order_id AND status IN ('pending', 'rejected');

  INSERT INTO payment_proofs (
    user_id, stall_id, order_id, payment_context,
    expected_amount, upi_id_snapshot, recipient_name_snapshot,
    screenshot_path, screenshot_mime_type, screenshot_size_bytes, status
  ) VALUES (
    auth.uid(), v_order.stall_id, p_order_id, 'order',
    v_order.total, v_settings.upi_id, v_settings.recipient_name,
    p_screenshot_path, p_mime_type, p_size, 'pending'
  ) RETURNING id INTO v_proof_id;

  UPDATE orders SET payment_verification_status = 'pending' WHERE id = p_order_id;

  INSERT INTO notifications (user_id, type, title, body)
  VALUES (
    (SELECT operator_id FROM stalls WHERE id = v_order.stall_id),
    'order_update',
    'New UPI Payment Proof',
    'Order ' || v_order.order_number || ' has submitted a payment proof for verification.'
  );

  RETURN v_proof_id;
END;
$$;

CREATE OR REPLACE FUNCTION verify_order_payment(p_proof_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_proof RECORD;
  v_order RECORD;
BEGIN
  SELECT * INTO v_proof FROM payment_proofs WHERE id = p_proof_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '%', jsonb_build_object('code', 'PAYMENT_PROOF_NOT_FOUND', 'message', 'Payment proof not found.')::text; END IF;

  IF NOT is_stall_operator(v_proof.stall_id) THEN RAISE EXCEPTION '%', jsonb_build_object('code', 'UNAUTHORIZED_STALL_ACCESS', 'message', 'Not an authorized operator for this stall.')::text; END IF;
  IF v_proof.status != 'pending' THEN RAISE EXCEPTION '%', jsonb_build_object('code', 'PAYMENT_PROOF_NOT_PENDING', 'message', 'Proof is not pending.')::text; END IF;

  SELECT * INTO v_order FROM orders WHERE id = v_proof.order_id FOR UPDATE;
  
  UPDATE payment_proofs SET status = 'verified', verified_at = now(), verified_by = auth.uid()
  WHERE id = p_proof_id;

  UPDATE orders SET
    payment_status = 'paid',
    payment_verification_status = 'verified',
    status = CASE WHEN status = 'pending' THEN 'confirmed'::order_status ELSE status END
  WHERE id = v_proof.order_id;
  
  IF NOT EXISTS (SELECT 1 FROM payment_records WHERE order_id = v_proof.order_id AND status = 'paid' AND method = 'upi') THEN
    INSERT INTO payment_records (order_id, amount, status, method)
    VALUES (v_proof.order_id, v_proof.expected_amount, 'paid', 'upi');
  END IF;

  INSERT INTO notifications (user_id, type, title, body)
  VALUES (
    v_proof.user_id,
    'order_update',
    'Payment Verified',
    'Your payment for order ' || v_order.order_number || ' has been verified and confirmed.'
  );
END;
$$;

CREATE OR REPLACE FUNCTION reject_order_payment(p_proof_id UUID, p_reason TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_proof RECORD;
  v_order RECORD;
BEGIN
  IF p_reason IS NULL OR trim(p_reason) = '' THEN RAISE EXCEPTION '%', jsonb_build_object('code', 'REJECTION_REASON_REQUIRED', 'message', 'Rejection reason is required.')::text; END IF;

  SELECT * INTO v_proof FROM payment_proofs WHERE id = p_proof_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '%', jsonb_build_object('code', 'PAYMENT_PROOF_NOT_FOUND', 'message', 'Proof not found.')::text; END IF;

  IF NOT is_stall_operator(v_proof.stall_id) THEN RAISE EXCEPTION '%', jsonb_build_object('code', 'UNAUTHORIZED_STALL_ACCESS', 'message', 'Unauthorized.')::text; END IF;
  IF v_proof.status != 'pending' THEN RAISE EXCEPTION '%', jsonb_build_object('code', 'PAYMENT_PROOF_NOT_PENDING', 'message', 'Proof is not pending.')::text; END IF;

  SELECT * INTO v_order FROM orders WHERE id = v_proof.order_id FOR UPDATE;

  UPDATE payment_proofs SET status = 'rejected', rejected_at = now(), rejection_reason = p_reason
  WHERE id = p_proof_id;

  UPDATE orders SET payment_verification_status = 'rejected' WHERE id = v_proof.order_id;

  INSERT INTO notifications (user_id, type, title, body)
  VALUES (
    v_proof.user_id,
    'order_update',
    'Payment Rejected',
    'Your payment proof for order ' || v_order.order_number || ' was rejected. Reason: ' || p_reason
  );
END;
$$;

CREATE OR REPLACE FUNCTION expire_unverified_upi_orders()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_sub_usage RECORD;
  v_sub RECORD;
  v_new_consumed INTEGER;
  v_new_remaining INTEGER;
  v_recalculated_daily INTEGER;
BEGIN
  FOR v_order IN
    SELECT * FROM orders
    WHERE payment_method = 'upi'
      AND payment_verification_status = 'awaiting_proof'
      AND payment_proof_deadline < now()
      AND status NOT IN ('cancelled', 'picked_up', 'delivered')
      AND payment_status != 'paid'
    FOR UPDATE SKIP LOCKED
  LOOP
    -- 1. Restore subscription credits if applicable
    FOR v_sub_usage IN
      SELECT subscription_id, SUM(credits_used)::INTEGER AS total_credits_returned
      FROM order_items
      WHERE order_id = v_order.id
        AND subscription_id IS NOT NULL
        AND credits_used > 0
      GROUP BY subscription_id
    LOOP
      SELECT * INTO v_sub FROM subscriptions WHERE id = v_sub_usage.subscription_id FOR UPDATE;
      IF FOUND THEN
        v_new_consumed := GREATEST(0, v_sub.consumed_meals - v_sub_usage.total_credits_returned);
        v_new_remaining := v_sub.remaining_meals + v_sub_usage.total_credits_returned;
        
        -- Restore daily usage
        IF v_sub.last_usage_date = v_order.pickup_date THEN
           SELECT COALESCE(SUM(oi.credits_used)::INTEGER, 0) INTO v_recalculated_daily
           FROM order_items oi
           JOIN orders o ON o.id = oi.order_id
           WHERE oi.subscription_id = v_sub.id
             AND oi.credits_used > 0
             AND o.pickup_date = v_order.pickup_date
             AND o.status != 'cancelled'
             AND o.id != v_order.id; -- EXCLUDE current expiring order
             
           v_recalculated_daily := GREATEST(0, v_recalculated_daily);
        ELSE
           v_recalculated_daily := v_sub.daily_credits_used;
        END IF;
        
        UPDATE subscriptions
        SET remaining_meals = v_new_remaining,
            consumed_meals = v_new_consumed,
            daily_credits_used = v_recalculated_daily
        WHERE id = v_sub.id;
      END IF;
    END LOOP;

    -- 2. Finalize cancellation idempotently
    UPDATE orders SET status = 'cancelled', payment_verification_status = 'expired'
    WHERE id = v_order.id;

    INSERT INTO notifications (user_id, type, title, body)
    VALUES (
      v_order.user_id,
      'order_update',
      'Order Cancelled',
      'Your order ' || v_order.order_number || ' was cancelled because payment proof was not submitted in time.'
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION submit_subscription_payment_proof(
  p_request_id UUID,
  p_screenshot_path TEXT,
  p_mime_type TEXT,
  p_size BIGINT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_req RECORD;
  v_settings RECORD;
  v_proof_id UUID;
  v_ext TEXT;
BEGIN
  IF p_screenshot_path IS NULL OR trim(p_screenshot_path) = '' THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'INVALID_SCREENSHOT_PATH', 'message', 'Screenshot path is required.')::text;
  END IF;

  IF p_mime_type IS NULL OR trim(p_mime_type) = '' THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'INVALID_SCREENSHOT_TYPE', 'message', 'MIME type is required.')::text;
  END IF;

  IF p_size IS NULL THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'INVALID_SCREENSHOT_SIZE', 'message', 'Screenshot size is required.')::text;
  END IF;

  IF p_mime_type NOT IN ('image/jpeg', 'image/png', 'image/webp') THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'INVALID_SCREENSHOT_TYPE', 'message', 'Invalid image format. Supported formats: JPEG, PNG, WEBP.')::text;
  END IF;

  IF p_size <= 0 OR p_size > 5242880 THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'SCREENSHOT_TOO_LARGE', 'message', 'Screenshot must be > 0 and <= 5MB.')::text;
  END IF;

  IF p_screenshot_path !~ ('^subscriptions/' || (auth.uid())::text || '/[^/]+$') THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'INVALID_SCREENSHOT_PATH', 'message', 'Invalid screenshot path format. Must be exactly subscriptions/{uid}/{filename} with no nested directories.')::text;
  END IF;

  IF p_screenshot_path ~ ('^subscriptions/' || (auth.uid())::text || '/\.[^/]+$') THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'INVALID_SCREENSHOT_PATH', 'message', 'Filename must not consist only of an extension.')::text;
  END IF;

  v_ext := lower(substring(p_screenshot_path from '\.([^\.]+)$'));
  IF v_ext NOT IN ('jpg', 'jpeg', 'png', 'webp') THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'INVALID_SCREENSHOT_TYPE', 'message', 'Invalid file extension.')::text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM storage.objects
    WHERE bucket_id = 'payment-proofs'
      AND name = p_screenshot_path
  ) THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'INVALID_SCREENSHOT_PATH', 'message', 'Screenshot object does not exist in storage.')::text;
  END IF;

  SELECT * INTO v_req FROM subscription_purchase_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '%', jsonb_build_object('code', 'SUBSCRIPTION_REQUEST_NOT_FOUND', 'message', 'Request not found.')::text; END IF;
  
  IF v_req.user_id != auth.uid() THEN RAISE EXCEPTION '%', jsonb_build_object('code', 'UNAUTHORIZED', 'message', 'Not authorized.')::text; END IF;
  IF v_req.status NOT IN ('awaiting_proof', 'rejected') THEN RAISE EXCEPTION '%', jsonb_build_object('code', 'PAYMENT_PROOF_NOT_PENDING', 'message', 'Proof is not pending.')::text; END IF;

  SELECT * INTO v_settings FROM payment_settings 
  WHERE stall_id = v_req.stall_id AND is_active = true;
  IF NOT FOUND THEN RAISE EXCEPTION '%', jsonb_build_object('code', 'PAYMENT_SETTINGS_NOT_FOUND', 'message', 'Payment settings not found.')::text; END IF;
  
  UPDATE payment_proofs SET status = 'superseded' 
  WHERE subscription_request_id = p_request_id AND status IN ('pending', 'rejected');

  INSERT INTO payment_proofs (
    user_id, stall_id, subscription_request_id, payment_context,
    expected_amount, upi_id_snapshot, recipient_name_snapshot,
    screenshot_path, screenshot_mime_type, screenshot_size_bytes, status
  ) VALUES (
    auth.uid(), v_req.stall_id, p_request_id, 'subscription',
    v_req.expected_amount, v_settings.upi_id, v_settings.recipient_name,
    p_screenshot_path, p_mime_type, p_size, 'pending'
  ) RETURNING id INTO v_proof_id;

  UPDATE subscription_purchase_requests SET 
    status = 'verification_pending',
    current_payment_proof_id = v_proof_id
  WHERE id = p_request_id;

  INSERT INTO notifications (user_id, type, title, body)
  VALUES (
    (SELECT operator_id FROM stalls WHERE id = v_req.stall_id),
    'subscription',
    'New Subscription Payment Proof',
    'A new subscription payment proof is awaiting verification.'
  );

  RETURN v_proof_id;
END;
$$;

CREATE OR REPLACE FUNCTION approve_subscription_purchase(
  p_request_id UUID
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_req RECORD;
  v_proof RECORD;
  v_plan RECORD;
  v_sub_id UUID;
  v_start_date DATE;
  v_new_end_date DATE;
  v_extended_days INT;
BEGIN
  SELECT * INTO v_req FROM subscription_purchase_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '%', jsonb_build_object('code', 'SUBSCRIPTION_REQUEST_NOT_FOUND', 'message', 'Request not found.')::text; END IF;
  
  IF NOT is_stall_operator(v_req.stall_id) THEN RAISE EXCEPTION '%', jsonb_build_object('code', 'UNAUTHORIZED_STALL_ACCESS', 'message', 'Unauthorized.')::text; END IF;
  IF v_req.status = 'approved' THEN RETURN v_req.created_subscription_id; END IF;
  IF v_req.status != 'verification_pending' THEN RAISE EXCEPTION '%', jsonb_build_object('code', 'PAYMENT_PROOF_NOT_PENDING', 'message', 'Not pending.')::text; END IF;

  SELECT * INTO v_proof FROM payment_proofs WHERE id = v_req.current_payment_proof_id FOR UPDATE;
  IF v_proof.status != 'pending' THEN RAISE EXCEPTION '%', jsonb_build_object('code', 'PAYMENT_PROOF_NOT_PENDING', 'message', 'Proof not pending.')::text; END IF;

  SELECT * INTO v_plan FROM subscription_plans WHERE id = v_req.plan_id AND is_active = true;
  IF NOT FOUND THEN RAISE EXCEPTION '%', jsonb_build_object('code', 'PLAN_NOT_FOUND', 'message', 'Plan not found.')::text; END IF;

  IF EXISTS (SELECT 1 FROM subscriptions WHERE user_id = v_req.user_id AND status = 'active') THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'ACTIVE_SUBSCRIPTION_EXISTS', 'message', 'User already has an active subscription.')::text;
  END IF;

  v_start_date := CURRENT_DATE;
  SELECT new_end_date, extended_days INTO v_new_end_date, v_extended_days
  FROM calculate_subscription_expiry(v_start_date, v_plan.duration_days, v_req.stall_id);

  INSERT INTO subscriptions (
    user_id, plan_id, plan_name, status, start_date, end_date, extended_days,
    total_meals, consumed_meals, remaining_meals, meals_per_day, daily_credits_used,
    accepted_terms_version, accepted_terms_at, purchase_price, currency
  ) VALUES (
    v_req.user_id, v_req.plan_id, v_plan.name, 'active', v_start_date, v_new_end_date, v_extended_days,
    v_plan.total_meals, 0, v_plan.total_meals, v_plan.meals_per_day, 0,
    NULL, now(), v_req.expected_amount, 'INR'
  ) RETURNING id INTO v_sub_id;

  INSERT INTO payment_records (subscription_id, amount, status, method)
  VALUES (v_sub_id, v_req.expected_amount, 'paid', 'upi');

  UPDATE payment_proofs SET status = 'verified', verified_at = now(), verified_by = auth.uid()
  WHERE id = v_req.current_payment_proof_id;

  UPDATE subscription_purchase_requests SET 
    status = 'approved', approved_at = now(), approved_by = auth.uid(), created_subscription_id = v_sub_id
  WHERE id = p_request_id;

  INSERT INTO notifications (user_id, type, title, body)
  VALUES (v_req.user_id, 'subscription', 'Subscription Approved', 'Your subscription purchase has been verified and approved!');

  RETURN v_sub_id;
END;
$$;

CREATE OR REPLACE FUNCTION reject_subscription_purchase(
  p_request_id UUID, p_reason TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_req RECORD;
  v_proof RECORD;
BEGIN
  IF p_reason IS NULL OR trim(p_reason) = '' THEN RAISE EXCEPTION '%', jsonb_build_object('code', 'REJECTION_REASON_REQUIRED', 'message', 'Reason required.')::text; END IF;

  SELECT * INTO v_req FROM subscription_purchase_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '%', jsonb_build_object('code', 'SUBSCRIPTION_REQUEST_NOT_FOUND', 'message', 'Request not found.')::text; END IF;
  
  IF NOT is_stall_operator(v_req.stall_id) THEN RAISE EXCEPTION '%', jsonb_build_object('code', 'UNAUTHORIZED_STALL_ACCESS', 'message', 'Unauthorized.')::text; END IF;
  IF v_req.status != 'verification_pending' THEN RAISE EXCEPTION '%', jsonb_build_object('code', 'PAYMENT_PROOF_NOT_PENDING', 'message', 'Not pending.')::text; END IF;

  SELECT * INTO v_proof FROM payment_proofs WHERE id = v_req.current_payment_proof_id FOR UPDATE;
  
  UPDATE payment_proofs SET status = 'rejected', rejected_at = now(), rejection_reason = p_reason
  WHERE id = v_proof.id;

  UPDATE subscription_purchase_requests SET 
    status = 'rejected', rejected_at = now(), rejection_reason = p_reason
  WHERE id = p_request_id;

  INSERT INTO notifications (user_id, type, title, body)
  VALUES (v_req.user_id, 'subscription', 'Subscription Payment Rejected', 'Your subscription payment was rejected. Reason: ' || p_reason);
END;
$$;

COMMIT;
