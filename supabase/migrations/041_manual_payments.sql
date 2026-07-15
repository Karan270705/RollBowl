-- ============================================================
-- RollBowl Migration 041: Manual UPI Payments
-- ============================================================

-- 1. Create Enums
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_verification_status') THEN
        CREATE TYPE payment_verification_status AS ENUM ('not_required', 'awaiting_proof', 'pending', 'verified', 'rejected', 'expired');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_proof_status') THEN
        CREATE TYPE payment_proof_status AS ENUM ('pending', 'verified', 'rejected', 'superseded');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_request_status') THEN
        CREATE TYPE subscription_request_status AS ENUM ('awaiting_proof', 'verification_pending', 'approved', 'rejected', 'cancelled');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_context_type') THEN
        CREATE TYPE payment_context_type AS ENUM ('order', 'subscription');
    END IF;
END$$;

-- 2. Modify Orders Table
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS payment_verification_status payment_verification_status,
ADD COLUMN IF NOT EXISTS payment_proof_deadline TIMESTAMPTZ;

-- Backfill orders
UPDATE orders 
SET payment_verification_status = 'not_required' 
WHERE payment_verification_status IS NULL;

ALTER TABLE orders ALTER COLUMN payment_verification_status SET NOT NULL;

-- 3. Create Settings Table
CREATE TABLE IF NOT EXISTS payment_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stall_id UUID NOT NULL REFERENCES stalls(id) ON DELETE CASCADE,
  recipient_name TEXT NOT NULL,
  upi_id TEXT NOT NULL,
  qr_image_path TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_active_payment_settings ON payment_settings(stall_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_payment_settings_stall ON payment_settings(stall_id);

ALTER TABLE payment_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read for active payment settings" ON payment_settings
  FOR SELECT USING (is_active = true);
CREATE POLICY "Operators manage their payment settings" ON payment_settings
  FOR ALL USING (is_stall_operator(stall_id)) WITH CHECK (is_stall_operator(stall_id));

-- 4. Subscription Purchase Requests
CREATE TABLE IF NOT EXISTS subscription_purchase_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stall_id UUID NOT NULL REFERENCES stalls(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES subscription_plans(id) ON DELETE CASCADE,
  expected_amount NUMERIC(10,2) NOT NULL CHECK (expected_amount >= 0),
  status subscription_request_status NOT NULL DEFAULT 'awaiting_proof',
  current_payment_proof_id UUID, -- Foreign key added below
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Payment Proofs
CREATE TABLE IF NOT EXISTS payment_proofs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stall_id UUID NOT NULL REFERENCES stalls(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  subscription_request_id UUID REFERENCES subscription_purchase_requests(id) ON DELETE CASCADE,
  payment_context payment_context_type NOT NULL,
  expected_amount NUMERIC(10,2) NOT NULL CHECK (expected_amount >= 0),
  upi_id_snapshot TEXT NOT NULL,
  recipient_name_snapshot TEXT NOT NULL,
  screenshot_path TEXT NOT NULL,
  screenshot_mime_type TEXT,
  screenshot_size_bytes BIGINT,
  status payment_proof_status NOT NULL DEFAULT 'pending',
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  verified_at TIMESTAMPTZ,
  verified_by UUID REFERENCES users(id) ON DELETE SET NULL,
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT proof_target_check 
    CHECK ((order_id IS NOT NULL AND subscription_request_id IS NULL AND payment_context = 'order') OR
           (subscription_request_id IS NOT NULL AND order_id IS NULL AND payment_context = 'subscription'))
);

ALTER TABLE subscription_purchase_requests 
  ADD CONSTRAINT fk_sub_req_proof 
  FOREIGN KEY (current_payment_proof_id) REFERENCES payment_proofs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_payment_proofs_user ON payment_proofs(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_proofs_stall ON payment_proofs(stall_id);
CREATE INDEX IF NOT EXISTS idx_payment_proofs_order ON payment_proofs(order_id);
CREATE INDEX IF NOT EXISTS idx_payment_proofs_subreq ON payment_proofs(subscription_request_id);

CREATE INDEX IF NOT EXISTS idx_sub_req_user ON subscription_purchase_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_sub_req_stall ON subscription_purchase_requests(stall_id);

ALTER TABLE payment_proofs ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_purchase_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Customers can read own payment proofs" ON payment_proofs
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Customers can read own subscription requests" ON subscription_purchase_requests
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Operators can read proofs for their stall" ON payment_proofs
  FOR SELECT USING (is_stall_operator(stall_id));
CREATE POLICY "Operators can read subscription requests for their stall" ON subscription_purchase_requests
  FOR SELECT USING (is_stall_operator(stall_id));

-- 6. Storage Bucket setup
INSERT INTO storage.buckets (id, name, public) 
VALUES ('payment-proofs', 'payment-proofs', false) 
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users can upload their own proofs" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'payment-proofs' AND 
  (auth.uid())::text = (string_to_array(name, '/'))[2]
);

CREATE POLICY "Users can read their own proofs" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'payment-proofs' AND 
  (auth.uid())::text = (string_to_array(name, '/'))[2]
);

CREATE POLICY "Operators can read proofs for their stall" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'payment-proofs' AND 
  EXISTS (
    SELECT 1 FROM public.payment_proofs p
    WHERE p.screenshot_path = storage.objects.name
    AND public.is_stall_operator(p.stall_id)
  )
);

-- 7. Update place_order to use payment_verification_status
CREATE OR REPLACE FUNCTION place_order(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_user_id UUID;
  v_customer_name TEXT;
  v_stall_id UUID;
  v_stall_name TEXT;
  v_items JSONB;
  v_subtotal NUMERIC(10,2);
  v_tax NUMERIC(10,2);
  v_total NUMERIC(10,2);
  v_pickup_date DATE;
  v_expected_pickup_slot TEXT;
  v_payment_method TEXT;
  v_notes TEXT;
  v_subscription_updates JSONB;
  
  v_batch_id UUID;
  v_item JSONB;
  v_meal_id UUID;
  v_requested_qty INTEGER;
  
  v_inventory_item RECORD;
  v_state RECORD;
  
  v_order_id UUID;
  v_order_number TEXT;
  v_verification_status payment_verification_status;
  v_deadline TIMESTAMPTZ;
BEGIN
  -- Extract payload
  v_user_id := (p_payload->>'userId')::UUID;
  v_customer_name := p_payload->>'customerName';
  v_stall_id := (p_payload->>'stallId')::UUID;
  v_stall_name := p_payload->>'stallName';
  v_items := p_payload->'items';
  v_subtotal := (p_payload->>'subtotal')::NUMERIC(10,2);
  v_tax := (p_payload->>'tax')::NUMERIC(10,2);
  v_total := (p_payload->>'total')::NUMERIC(10,2);
  v_pickup_date := (p_payload->>'pickupDate')::DATE;
  v_expected_pickup_slot := p_payload->>'expectedPickupSlot';
  v_payment_method := p_payload->>'paymentMethod';
  v_notes := p_payload->>'notes';
  v_subscription_updates := p_payload->'subscriptionUpdates';

  -- Authenticate User
  IF auth.uid() IS NULL OR auth.uid() != v_user_id THEN
    RAISE EXCEPTION 'Unauthorized order placement.';
  END IF;

  -- 2. Resolve Active Inventory Batch
  SELECT id INTO v_batch_id
  FROM inventory_batches
  WHERE stall_id = v_stall_id
    AND inventory_date = v_pickup_date
    AND status = 'active';

  -- 3. If Batch Exists, Lock and Validate Inventory
  IF v_batch_id IS NOT NULL THEN
    FOR v_item IN 
      SELECT * FROM jsonb_array_elements(v_items) ORDER BY (value->>'mealId')::UUID ASC
    LOOP
      v_meal_id := (v_item->>'mealId')::UUID;
      v_requested_qty := (v_item->>'quantity')::INTEGER;

      SELECT * INTO v_inventory_item
      FROM inventory_batch_items
      WHERE inventory_batch_id = v_batch_id AND meal_id = v_meal_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RETURN jsonb_build_object(
          'error', 'ITEM_NOT_IN_BATCH',
          'message', 'Not available for today''s pickup',
          'meal_id', v_meal_id,
          'item_name', v_item->>'mealName'
        );
      END IF;

      SELECT * INTO v_state
      FROM live_inventory_status
      WHERE inventory_batch_item_id = v_inventory_item.id;

      IF v_state.extra_available < v_requested_qty THEN
        RETURN jsonb_build_object(
          'error', 'INSUFFICIENT_STOCK',
          'message', format('Only %s %s currently available.', v_state.extra_available, v_item->>'mealName'),
          'meal_id', v_meal_id,
          'item_name', v_item->>'mealName',
          'requested_quantity', v_requested_qty,
          'available_quantity', GREATEST(v_state.extra_available, 0)
        );
      END IF;
    END LOOP;
  END IF;

  -- Determine payment status
  IF v_payment_method = 'upi' THEN
    v_verification_status := 'awaiting_proof';
    v_deadline := now() + interval '15 minutes';
  ELSIF v_payment_method = 'card' THEN
    v_verification_status := 'not_required';
    v_deadline := NULL;
  ELSE
    v_verification_status := 'not_required';
    v_deadline := NULL;
  END IF;

  -- 4. Create the Order
  v_order_number := 'RB-' || floor(random() * 900000 + 100000)::TEXT;

  INSERT INTO orders (
    order_number, user_id, customer_name, stall_id, stall_name,
    status, order_type, payment_status, payment_method,
    subtotal, tax, discount, total, notes,
    pickup_date, expected_pickup_slot,
    payment_verification_status, payment_proof_deadline
  ) VALUES (
    v_order_number, v_user_id, v_customer_name, v_stall_id, v_stall_name,
    'pending', 'on_stall', 
    'pending'::payment_status, -- Always pending until verified or collected
    v_payment_method::payment_method,
    v_subtotal, v_tax, 0, v_total, v_notes,
    v_pickup_date, v_expected_pickup_slot,
    v_verification_status, v_deadline
  ) RETURNING id INTO v_order_id;

  -- 5. Create Order Items
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
  LOOP
    INSERT INTO order_items (
      order_id, meal_id, meal_name, quantity, unit_price, total_price,
      subscription_id, credits_used
    ) VALUES (
      v_order_id,
      (v_item->>'mealId')::UUID,
      v_item->>'mealName',
      (v_item->>'quantity')::INTEGER,
      (v_item->>'unitPrice')::NUMERIC(10,2),
      (v_item->>'totalPrice')::NUMERIC(10,2),
      (v_item->>'subscriptionId')::UUID,
      (v_item->>'creditsUsed')::INTEGER
    );
  END LOOP;

  -- 6. Subscription Transactional Updates (if applicable)
  IF v_subscription_updates IS NOT NULL AND jsonb_typeof(v_subscription_updates) = 'object' THEN
    UPDATE subscriptions
    SET last_usage_date = (v_subscription_updates->'updates'->>'lastUsageDate')::DATE,
        daily_credits_used = (v_subscription_updates->'updates'->>'dailyCreditsUsed')::INTEGER,
        consumed_meals = (v_subscription_updates->'updates'->>'consumedMeals')::INTEGER,
        remaining_meals = (v_subscription_updates->'updates'->>'remainingMeals')::INTEGER
    WHERE id = (v_subscription_updates->>'id')::UUID
      AND user_id = v_user_id;
  END IF;

  -- 7. Return Order Info
  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'order_number', v_order_number
  );
END;
$func$;

-- 8. RPCs

CREATE OR REPLACE FUNCTION submit_order_payment_proof(
  p_order_id UUID,
  p_screenshot_path TEXT,
  p_mime_type TEXT,
  p_size BIGINT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $func$
DECLARE
  v_order RECORD;
  v_settings RECORD;
  v_proof_id UUID;
BEGIN
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  IF v_order.user_id != auth.uid() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF v_order.payment_method != 'upi' THEN RAISE EXCEPTION 'ORDER_NOT_UPI'; END IF;
  IF v_order.payment_verification_status NOT IN ('awaiting_proof', 'rejected') THEN
    RAISE EXCEPTION 'PAYMENT_PROOF_NOT_PENDING';
  END IF;

  SELECT * INTO v_settings FROM payment_settings 
  WHERE stall_id = v_order.stall_id AND is_active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'PAYMENT_SETTINGS_NOT_FOUND'; END IF;
  
  IF p_screenshot_path NOT LIKE 'orders/' || (auth.uid())::text || '/%' THEN
    RAISE EXCEPTION 'INVALID_SCREENSHOT_PATH';
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
$func$;

CREATE OR REPLACE FUNCTION verify_order_payment(p_proof_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $func$
DECLARE
  v_proof RECORD;
  v_order RECORD;
BEGIN
  SELECT * INTO v_proof FROM payment_proofs WHERE id = p_proof_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PAYMENT_PROOF_NOT_FOUND'; END IF;

  IF NOT is_stall_operator(v_proof.stall_id) THEN RAISE EXCEPTION 'UNAUTHORIZED_STALL_ACCESS'; END IF;
  IF v_proof.status != 'pending' THEN RAISE EXCEPTION 'PAYMENT_PROOF_NOT_PENDING'; END IF;

  SELECT * INTO v_order FROM orders WHERE id = v_proof.order_id FOR UPDATE;
  
  UPDATE payment_proofs SET status = 'verified', verified_at = now(), verified_by = auth.uid()
  WHERE id = p_proof_id;

  UPDATE orders SET
    payment_status = 'paid',
    payment_verification_status = 'verified',
    status = CASE WHEN status = 'pending' THEN 'confirmed'::order_status ELSE status END
  WHERE id = v_proof.order_id;
  
  INSERT INTO payment_records (order_id, amount, status, method)
  VALUES (v_proof.order_id, v_proof.expected_amount, 'paid', 'upi');

  INSERT INTO notifications (user_id, type, title, body)
  VALUES (
    v_proof.user_id,
    'order_update',
    'Payment Verified',
    'Your payment for order ' || v_order.order_number || ' has been verified and confirmed.'
  );
END;
$func$;

CREATE OR REPLACE FUNCTION reject_order_payment(p_proof_id UUID, p_reason TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $func$
DECLARE
  v_proof RECORD;
  v_order RECORD;
BEGIN
  IF p_reason IS NULL OR trim(p_reason) = '' THEN RAISE EXCEPTION 'REJECTION_REASON_REQUIRED'; END IF;

  SELECT * INTO v_proof FROM payment_proofs WHERE id = p_proof_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PAYMENT_PROOF_NOT_FOUND'; END IF;

  IF NOT is_stall_operator(v_proof.stall_id) THEN RAISE EXCEPTION 'UNAUTHORIZED_STALL_ACCESS'; END IF;
  IF v_proof.status != 'pending' THEN RAISE EXCEPTION 'PAYMENT_PROOF_NOT_PENDING'; END IF;

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
$func$;

CREATE OR REPLACE FUNCTION mark_cash_collected(p_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $func$
DECLARE
  v_order RECORD;
BEGIN
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;

  IF NOT is_stall_operator(v_order.stall_id) THEN RAISE EXCEPTION 'UNAUTHORIZED_STALL_ACCESS'; END IF;
  IF v_order.payment_method != 'cash' THEN RAISE EXCEPTION 'INVALID_PAYLOAD'; END IF;

  IF v_order.payment_status = 'paid' THEN RETURN; END IF;

  UPDATE orders SET payment_status = 'paid' WHERE id = p_order_id;
  
  INSERT INTO payment_records (order_id, amount, status, method)
  VALUES (p_order_id, v_order.total, 'paid', 'cash');
END;
$func$;

CREATE OR REPLACE FUNCTION expire_unverified_upi_orders()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $func$
DECLARE
  v_order RECORD;
BEGIN
  FOR v_order IN
    SELECT * FROM orders
    WHERE payment_verification_status = 'awaiting_proof'
      AND payment_proof_deadline < now()
      AND status != 'cancelled'
    FOR UPDATE SKIP LOCKED
  LOOP
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
$func$;

CREATE OR REPLACE FUNCTION create_subscription_purchase_request(
  p_stall_id UUID, 
  p_plan_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $func$
DECLARE
  v_plan RECORD;
  v_req_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  SELECT * INTO v_plan FROM subscription_plans WHERE id = p_plan_id AND is_active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'PLAN_NOT_FOUND'; END IF;

  INSERT INTO subscription_purchase_requests (
    user_id, stall_id, plan_id, expected_amount, status
  ) VALUES (
    auth.uid(), p_stall_id, p_plan_id, v_plan.price, 'awaiting_proof'
  ) RETURNING id INTO v_req_id;

  RETURN jsonb_build_object(
    'request_id', v_req_id,
    'expected_amount', v_plan.price
  );
END;
$func$;

CREATE OR REPLACE FUNCTION submit_subscription_payment_proof(
  p_request_id UUID,
  p_screenshot_path TEXT,
  p_mime_type TEXT,
  p_size BIGINT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $func$
DECLARE
  v_req RECORD;
  v_settings RECORD;
  v_proof_id UUID;
BEGIN
  SELECT * INTO v_req FROM subscription_purchase_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SUBSCRIPTION_REQUEST_NOT_FOUND'; END IF;
  
  IF v_req.user_id != auth.uid() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF v_req.status NOT IN ('awaiting_proof', 'rejected') THEN RAISE EXCEPTION 'PAYMENT_PROOF_NOT_PENDING'; END IF;

  SELECT * INTO v_settings FROM payment_settings 
  WHERE stall_id = v_req.stall_id AND is_active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'PAYMENT_SETTINGS_NOT_FOUND'; END IF;
  
  IF p_screenshot_path NOT LIKE 'subscriptions/' || (auth.uid())::text || '/%' THEN
    RAISE EXCEPTION 'INVALID_SCREENSHOT_PATH';
  END IF;

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
$func$;

CREATE OR REPLACE FUNCTION approve_subscription_purchase(
  p_request_id UUID
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $func$
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
  IF NOT FOUND THEN RAISE EXCEPTION 'SUBSCRIPTION_REQUEST_NOT_FOUND'; END IF;
  
  IF NOT is_stall_operator(v_req.stall_id) THEN RAISE EXCEPTION 'UNAUTHORIZED_STALL_ACCESS'; END IF;
  IF v_req.status = 'approved' THEN RETURN v_req.created_subscription_id; END IF;
  IF v_req.status != 'verification_pending' THEN RAISE EXCEPTION 'PAYMENT_PROOF_NOT_PENDING'; END IF;

  SELECT * INTO v_proof FROM payment_proofs WHERE id = v_req.current_payment_proof_id FOR UPDATE;
  IF v_proof.status != 'pending' THEN RAISE EXCEPTION 'PAYMENT_PROOF_NOT_PENDING'; END IF;

  SELECT * INTO v_plan FROM subscription_plans WHERE id = v_req.plan_id AND is_active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'PLAN_NOT_FOUND'; END IF;

  IF EXISTS (SELECT 1 FROM subscriptions WHERE user_id = v_req.user_id AND status = 'active') THEN
    RAISE EXCEPTION 'User already has an active subscription';
  END IF;

  v_start_date := CURRENT_DATE;
  SELECT new_end_date, extended_days INTO v_new_end_date, v_extended_days
  FROM calculate_subscription_expiry(v_start_date, v_plan.duration_days, v_req.stall_id);

  INSERT INTO subscriptions (
    user_id, plan_id, plan_name, status, start_date, end_date, extended_days,
    total_meals, consumed_meals, remaining_meals, meals_per_day, daily_credits_used,
    purchase_price, currency
  ) VALUES (
    v_req.user_id, v_req.plan_id, v_plan.name, 'active', v_start_date, v_new_end_date, v_extended_days,
    v_plan.total_meals, 0, v_plan.total_meals, v_plan.meals_per_day, 0,
    v_plan.price, 'INR'
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
$func$;

CREATE OR REPLACE FUNCTION reject_subscription_purchase(
  p_request_id UUID, p_reason TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $func$
DECLARE
  v_req RECORD;
  v_proof RECORD;
BEGIN
  IF p_reason IS NULL OR trim(p_reason) = '' THEN RAISE EXCEPTION 'REJECTION_REASON_REQUIRED'; END IF;

  SELECT * INTO v_req FROM subscription_purchase_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SUBSCRIPTION_REQUEST_NOT_FOUND'; END IF;
  
  IF NOT is_stall_operator(v_req.stall_id) THEN RAISE EXCEPTION 'UNAUTHORIZED_STALL_ACCESS'; END IF;
  IF v_req.status != 'verification_pending' THEN RAISE EXCEPTION 'PAYMENT_PROOF_NOT_PENDING'; END IF;

  SELECT * INTO v_proof FROM payment_proofs WHERE id = v_req.current_payment_proof_id FOR UPDATE;
  
  UPDATE payment_proofs SET status = 'rejected', rejected_at = now(), rejection_reason = p_reason
  WHERE id = v_proof.id;

  UPDATE subscription_purchase_requests SET 
    status = 'rejected', rejected_at = now(), rejection_reason = p_reason
  WHERE id = p_request_id;

  INSERT INTO notifications (user_id, type, title, body)
  VALUES (v_req.user_id, 'subscription', 'Subscription Payment Rejected', 'Your subscription payment was rejected. Reason: ' || p_reason);
END;
$func$;
