-- ============================================================
-- RollBowl Migration 042: Manual Payments Hotfix
-- ============================================================

BEGIN;

-- 1. Restore exact place_order from 040_inventory_hotfix.sql with minimal additions
CREATE OR REPLACE FUNCTION place_order(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_user_record RECORD;
  v_stall_record RECORD;
  v_items JSONB;
  
  v_pickup_date DATE;
  v_expected_pickup_slot TEXT;
  v_parsed_slot_start TIME;
  v_parsed_slot_end TIME;
  
  v_payment_method TEXT;
  v_notes TEXT;
  v_client_sub_id UUID;
  v_client_batch_id UUID;
  
  v_resolved_batch_id UUID;
  v_batch inventory_batches%ROWTYPE;
  v_sub RECORD;
  
  v_subtotal NUMERIC(10,2) := 0;
  v_tax NUMERIC(10,2) := 0;
  v_total NUMERIC(10,2) := 0;
  
  v_order_id UUID;
  v_order_number TEXT;
  v_order_type order_type;
  v_payment_status payment_status;
  v_final_payment_method payment_method_type;
  
  v_credits_to_consume INTEGER := 0;
  v_effective_daily_credits INTEGER := 0;
  
  v_has_missing_meal BOOLEAN := false;
  v_has_invalid_aggregate BOOLEAN := false;
  v_trusted_items JSONB := '[]'::jsonb;
  v_final_items JSONB := '[]'::jsonb;
  v_item JSONB;
  
  v_i JSONB;
  v_qty_numeric NUMERIC;
  v_credit_cost_numeric NUMERIC;
  v_meal_uuid UUID;
  v_paid_qty INTEGER;
  v_sub_qty INTEGER;
  v_qty INTEGER;
  v_credit_cost INTEGER;
  v_batch_item inventory_batch_items%ROWTYPE;
  v_state RECORD;

  v_payment_verification_status payment_verification_status;
  v_payment_proof_deadline timestamptz;
BEGIN
  -- 1. SAFE PAYLOAD VALIDATION
  IF p_payload IS NULL OR jsonb_typeof(p_payload) != 'object' THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'INVALID_PAYLOAD', 'message', 'Payload must be a JSON object.')::text;
  END IF;

  v_items := p_payload->'items';
  IF v_items IS NULL OR jsonb_typeof(v_items) != 'array' OR jsonb_array_length(v_items) = 0 THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'INVALID_ITEMS', 'message', 'Cart cannot be empty.')::text;
  END IF;
  
  IF jsonb_array_length(v_items) > 100 THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'INVALID_ITEMS', 'message', 'Cart exceeds maximum item count.')::text;
  END IF;

  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'UNAUTHORIZED', 'message', 'You must be logged in to place an order.')::text;
  END IF;

  -- Backward compatibility payload matching
  IF (p_payload ? 'userId') AND p_payload->>'userId' IS NOT NULL THEN
    IF NOT (p_payload->>'userId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') THEN
      RAISE EXCEPTION '%', jsonb_build_object('code', 'UNAUTHORIZED', 'message', 'Invalid userId format.')::text;
    END IF;
    IF (p_payload->>'userId')::UUID != v_user_id THEN
      RAISE EXCEPTION '%', jsonb_build_object('code', 'UNAUTHORIZED', 'message', 'User ID mismatch.')::text;
    END IF;
  END IF;

  IF p_payload->>'stallId' IS NULL OR btrim(p_payload->>'stallId') = '' OR NOT (p_payload->>'stallId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'INVALID_PAYLOAD', 'message', 'Invalid stallId format.')::text;
  END IF;

  IF p_payload->>'pickupDate' IS NULL OR btrim(p_payload->>'pickupDate') = '' THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'INVALID_PAYLOAD', 'message', 'pickupDate is required.')::text;
  END IF;

  IF p_payload->>'pickupDate' !~ '^\d{4}-\d{2}-\d{2}$' THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'INVALID_PAYLOAD', 'message', 'Invalid pickupDate format. Expected YYYY-MM-DD.')::text;
  END IF;

  BEGIN
    v_pickup_date := (p_payload->>'pickupDate')::DATE;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'INVALID_PAYLOAD', 'message', 'Invalid pickupDate calendar value.')::text;
  END;

  IF (p_payload ? 'inventoryBatchId') AND p_payload->>'inventoryBatchId' IS NOT NULL THEN
    IF NOT (p_payload->>'inventoryBatchId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') THEN
      RAISE EXCEPTION '%', jsonb_build_object('code', 'INVALID_PAYLOAD', 'message', 'Invalid inventoryBatchId format.')::text;
    END IF;
    v_client_batch_id := (p_payload->>'inventoryBatchId')::UUID;
  END IF;

  IF (p_payload ? 'subscriptionId') AND p_payload->>'subscriptionId' IS NOT NULL THEN
    IF NOT (p_payload->>'subscriptionId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') THEN
      RAISE EXCEPTION '%', jsonb_build_object('code', 'INVALID_PAYLOAD', 'message', 'Invalid subscriptionId format.')::text;
    END IF;
    v_client_sub_id := (p_payload->>'subscriptionId')::UUID;
  END IF;

  v_expected_pickup_slot := p_payload->>'expectedPickupSlot';
  v_payment_method := p_payload->>'paymentMethod';
  v_notes := p_payload->>'notes';

  -- Verify User
  SELECT * INTO v_user_record FROM users WHERE id = v_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'USER_NOT_FOUND', 'message', 'Authenticated user record not found.')::text;
  END IF;

  -- Verify Stall
  SELECT * INTO v_stall_record FROM stalls WHERE id = (p_payload->>'stallId')::UUID;
  IF NOT FOUND THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'STALL_NOT_FOUND', 'message', 'Stall not found.')::text;
  END IF;

  -- 2. SAFE ITEM PARSING AND NORMALIZATION
  FOR v_i IN SELECT * FROM jsonb_array_elements(v_items)
  LOOP
    IF jsonb_typeof(v_i) != 'object' THEN
      RAISE EXCEPTION '%', jsonb_build_object('code', 'INVALID_ITEMS', 'message', 'Each item must be an object.')::text;
    END IF;

    IF NOT (v_i ? 'mealId') OR v_i->>'mealId' IS NULL OR jsonb_typeof(v_i->'mealId') != 'string' OR btrim(v_i->>'mealId') = '' OR NOT (v_i->>'mealId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') THEN
      RAISE EXCEPTION '%', jsonb_build_object('code', 'INVALID_ITEMS', 'message', 'Invalid or missing mealId format.')::text;
    END IF;

    IF NOT (v_i ? 'quantity') OR v_i->'quantity' IS NULL THEN
      RAISE EXCEPTION '%', jsonb_build_object('code', 'INVALID_QUANTITY', 'message', 'Item quantity is required.')::text;
    END IF;

    IF jsonb_typeof(v_i->'quantity') != 'number' THEN
      RAISE EXCEPTION '%', jsonb_build_object('code', 'INVALID_QUANTITY', 'message', 'Item quantity must be a number.')::text;
    END IF;

    BEGIN
      v_qty_numeric := (v_i->>'quantity')::NUMERIC;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION '%', jsonb_build_object('code', 'INVALID_QUANTITY', 'message', 'Item quantity format is invalid.')::text;
    END;

    IF v_qty_numeric % 1 != 0 OR v_qty_numeric < 1 OR v_qty_numeric > 1000 THEN
      RAISE EXCEPTION '%', jsonb_build_object('code', 'INVALID_QUANTITY', 'message', 'Item quantity must be a positive integer between 1 and 1000.')::text;
    END IF;

    IF (v_i ? 'useSubscription') AND v_i->'useSubscription' IS NOT NULL AND jsonb_typeof(v_i->'useSubscription') != 'boolean' THEN
      RAISE EXCEPTION '%', jsonb_build_object('code', 'INVALID_ITEMS', 'message', 'useSubscription must be a boolean.')::text;
    END IF;
  END LOOP;

  WITH raw_items AS (
    SELECT 
      (value->>'mealId')::UUID AS meal_id,
      SUM(CASE WHEN COALESCE((value->>'useSubscription')::BOOLEAN, false) THEN 0 ELSE (value->>'quantity')::NUMERIC END) AS paid_qty_num,
      SUM(CASE WHEN COALESCE((value->>'useSubscription')::BOOLEAN, false) THEN (value->>'quantity')::NUMERIC ELSE 0 END) AS sub_qty_num
    FROM jsonb_array_elements(v_items)
    GROUP BY (value->>'mealId')::UUID
  ),
  validated_join AS (
    SELECT 
      r.meal_id AS raw_id,
      m.id AS db_id,
      m.name,
      m.category,
      m.price,
      m.is_available,
      r.paid_qty_num,
      r.sub_qty_num
    FROM raw_items r
    LEFT JOIN meals m ON m.id = r.meal_id AND m.stall_id = v_stall_record.id
  )
  SELECT 
    bool_or(raw_id IS NOT NULL AND db_id IS NULL),
    bool_or(paid_qty_num < 0 OR sub_qty_num < 0 OR (paid_qty_num + sub_qty_num) < 1 OR (paid_qty_num + sub_qty_num) > 1000),
    jsonb_agg(
      jsonb_build_object(
        'meal_id', db_id,
        'meal_name', name,
        'category', category,
        'price', price,
        'is_available', is_available,
        'paid_qty', paid_qty_num::INTEGER,
        'sub_qty', sub_qty_num::INTEGER,
        'total_qty', (paid_qty_num + sub_qty_num)::INTEGER
      ) ORDER BY db_id ASC
    ) FILTER (WHERE db_id IS NOT NULL)
  INTO v_has_missing_meal, v_has_invalid_aggregate, v_trusted_items
  FROM validated_join;

  IF v_has_missing_meal OR v_trusted_items IS NULL THEN
     RAISE EXCEPTION '%', jsonb_build_object('code', 'MEAL_NOT_FOUND', 'message', 'One or more meals are invalid or belong to a different stall.')::text;
  END IF;

  IF v_has_invalid_aggregate THEN
     RAISE EXCEPTION '%', jsonb_build_object('code', 'INVALID_QUANTITY', 'message', 'Aggregated meal quantities are out of bounds.')::text;
  END IF;

  -- 3. RESOLVE DELIVERY WINDOW / INVENTORY BATCH (LOCK 1)
  IF v_client_batch_id IS NOT NULL THEN
    SELECT * INTO v_batch
    FROM inventory_batches
    WHERE id = v_client_batch_id FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION '%', jsonb_build_object('code', 'BATCH_NOT_FOUND', 'message', 'Inventory batch not found.')::text;
    END IF;

    IF v_batch.stall_id != v_stall_record.id THEN
      RAISE EXCEPTION '%', jsonb_build_object('code', 'WINDOW_MISMATCH', 'message', 'Batch does not belong to the selected stall.')::text;
    END IF;

    IF v_batch.inventory_date != v_pickup_date THEN
      RAISE EXCEPTION '%', jsonb_build_object('code', 'WINDOW_MISMATCH', 'message', 'Batch date does not match pickup date.')::text;
    END IF;

    IF v_batch.status != 'active' THEN
      RAISE EXCEPTION '%', jsonb_build_object('code', 'BATCH_NOT_ACTIVE', 'message', 'Inventory batch is not active.')::text;
    END IF;

    v_resolved_batch_id := v_client_batch_id;
    
    -- Canonical window override, discarding client's free-form string
    v_expected_pickup_slot := to_char(v_batch.window_start, 'HH24:MI') || '-' || to_char(v_batch.window_end, 'HH24:MI');
  ELSE
    -- Inspect if ANY active batch exists for the exact selected stall and pickupDate
    -- Do not let free-form expectedPickupSlot determine this bypass.
    IF EXISTS (
      SELECT 1 FROM inventory_batches 
      WHERE stall_id = v_stall_record.id AND inventory_date = v_pickup_date AND status = 'active'
    ) THEN
      RAISE EXCEPTION '%', jsonb_build_object('code', 'BATCH_REQUIRED', 'message', 'Active inventory exists for this date. Client must supply inventoryBatchId.')::text;
    END IF;
    
    -- Preorder mode. Validate the expectedPickupSlot format manually safely.
    IF v_expected_pickup_slot IS NULL OR v_expected_pickup_slot = '' THEN
      RAISE EXCEPTION '%', jsonb_build_object('code', 'INVALID_PAYLOAD', 'message', 'expectedPickupSlot is required for preorder mode.')::text;
    END IF;

    IF v_expected_pickup_slot !~ '^\d{2}:\d{2}-\d{2}:\d{2}$' AND v_expected_pickup_slot !~ '^\d{2}:\d{2}:\d{2}-\d{2}:\d{2}:\d{2}$' THEN
      RAISE EXCEPTION '%', jsonb_build_object('code', 'INVALID_PAYLOAD', 'message', 'Invalid expectedPickupSlot format. Use HH:MM-HH:MM.')::text;
    END IF;
    
    BEGIN
      v_parsed_slot_start := split_part(v_expected_pickup_slot, '-', 1)::TIME;
      v_parsed_slot_end := split_part(v_expected_pickup_slot, '-', 2)::TIME;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION '%', jsonb_build_object('code', 'INVALID_PAYLOAD', 'message', 'Invalid times in expectedPickupSlot.')::text;
    END;

    IF v_parsed_slot_end <= v_parsed_slot_start THEN
      RAISE EXCEPTION '%', jsonb_build_object('code', 'INVALID_PAYLOAD', 'message', 'expectedPickupSlot end time must be after start time.')::text;
    END IF;
  END IF;

  -- 4. SUBSCRIPTION LOCK & VALIDATE (LOCK 2)
  IF v_client_sub_id IS NOT NULL THEN
    SELECT s.*, p.category_credit_costs, p.meals_per_day INTO v_sub
    FROM subscriptions s
    JOIN subscription_plans p ON s.plan_id = p.id
    WHERE s.id = v_client_sub_id AND s.user_id = v_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION '%', jsonb_build_object('code', 'INVALID_SUBSCRIPTION', 'message', 'Subscription not found or unauthorized.')::text;
    END IF;

    IF v_sub.status != 'active' THEN
      RAISE EXCEPTION '%', jsonb_build_object('code', 'INVALID_SUBSCRIPTION', 'message', 'Subscription is not active.')::text;
    END IF;
    
    IF v_pickup_date < v_sub.start_date OR v_pickup_date > v_sub.end_date THEN
      RAISE EXCEPTION '%', jsonb_build_object('code', 'INVALID_SUBSCRIPTION', 'message', 'Subscription is not valid for the selected pickup date.')::text;
    END IF;

    IF COALESCE(v_sub.last_usage_date, '1970-01-01'::DATE) = v_pickup_date THEN
      v_effective_daily_credits := COALESCE(v_sub.daily_credits_used, 0);
    ELSE
      v_effective_daily_credits := 0;
    END IF;
  END IF;

  -- 5. VALIDATE INVENTORY & BUILD FINAL DATASET (LOCK 3 - deterministically ordered)
  FOR v_item IN SELECT value FROM jsonb_array_elements(v_trusted_items)
  LOOP
    v_meal_uuid := (v_item->>'meal_id')::UUID;
    v_paid_qty := (v_item->>'paid_qty')::INTEGER;
    v_sub_qty := (v_item->>'sub_qty')::INTEGER;
    v_qty := (v_item->>'total_qty')::INTEGER;
    
    IF NOT COALESCE((v_item->>'is_available')::BOOLEAN, false) THEN
      RAISE EXCEPTION '%', jsonb_build_object('code', 'MEAL_NOT_AVAILABLE', 'message', 'Meal is currently unavailable.', 'meal_name', v_item->>'meal_name')::text;
    END IF;

    IF v_resolved_batch_id IS NOT NULL THEN
      SELECT * INTO v_batch_item FROM inventory_batch_items WHERE inventory_batch_id = v_resolved_batch_id AND meal_id = v_meal_uuid FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION '%', jsonb_build_object('code', 'ITEM_NOT_IN_BATCH', 'message', 'Meal is not available in today''s batch.', 'meal_name', v_item->>'meal_name', 'meal_id', v_meal_uuid)::text;
      END IF;

      SELECT * INTO v_state FROM live_inventory_status WHERE inventory_batch_item_id = v_batch_item.id;
      IF v_state.extra_available < v_qty THEN
        RAISE EXCEPTION '%', jsonb_build_object('code', 'INSUFFICIENT_STOCK', 'message', 'Insufficient stock.', 'meal_name', v_item->>'meal_name', 'requested_quantity', v_qty, 'available_quantity', GREATEST(v_state.extra_available, 0))::text;
      END IF;
    END IF;

    v_credit_cost := 0;
    IF v_sub_qty > 0 THEN
      IF v_client_sub_id IS NULL THEN
        RAISE EXCEPTION '%', jsonb_build_object('code', 'INVALID_PAYLOAD', 'message', 'Subscription quantity requested but no subscriptionId provided.')::text;
      END IF;
      
      IF jsonb_typeof(v_sub.category_credit_costs) != 'object' THEN
        RAISE EXCEPTION '%', jsonb_build_object('code', 'SUBSCRIPTION_PLAN_CONFIG_INVALID', 'message', 'Subscription plan configuration is invalid.')::text;
      END IF;
      
      IF NOT (v_sub.category_credit_costs ? (v_item->>'category')) THEN
         RAISE EXCEPTION '%', jsonb_build_object('code', 'SUBSCRIPTION_ITEM_NOT_ELIGIBLE', 'message', 'Meal category is not eligible for subscription.', 'category', v_item->>'category')::text;
      END IF;

      IF jsonb_typeof(v_sub.category_credit_costs->(v_item->>'category')) != 'number' THEN
         RAISE EXCEPTION '%', jsonb_build_object('code', 'SUBSCRIPTION_PLAN_CONFIG_INVALID', 'message', 'Credit cost must be a number.')::text;
      END IF;

      BEGIN
        v_credit_cost_numeric := (v_sub.category_credit_costs->>(v_item->>'category'))::NUMERIC;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION '%', jsonb_build_object('code', 'SUBSCRIPTION_PLAN_CONFIG_INVALID', 'message', 'Credit cost format is invalid.')::text;
      END;

      IF v_credit_cost_numeric % 1 != 0 OR v_credit_cost_numeric <= 0 OR v_credit_cost_numeric > 10000 THEN
         RAISE EXCEPTION '%', jsonb_build_object('code', 'SUBSCRIPTION_PLAN_CONFIG_INVALID', 'message', 'Credit cost must be a positive integer.')::text;
      END IF;
      
      v_credit_cost := v_credit_cost_numeric::INTEGER;
      v_credits_to_consume := v_credits_to_consume + (v_credit_cost * v_sub_qty);
    END IF;

    v_subtotal := v_subtotal + ((v_item->>'price')::NUMERIC * v_paid_qty);
    
    -- Store strictly validated and priced data into the final structure to avoid any re-evaluation
    v_final_items := v_final_items || jsonb_build_object(
      'meal_id', v_meal_uuid,
      'meal_name', v_item->>'meal_name',
      'price', (v_item->>'price')::NUMERIC,
      'paid_qty', v_paid_qty,
      'sub_qty', v_sub_qty,
      'credit_cost', v_credit_cost
    );
  END LOOP;

  -- 6. APPLY SUBSCRIPTION USAGE
  IF v_credits_to_consume > 0 THEN
    IF COALESCE(v_sub.remaining_meals, 0) < v_credits_to_consume THEN
      RAISE EXCEPTION '%', jsonb_build_object('code', 'INSUFFICIENT_CREDITS', 'message', 'Insufficient subscription credits.', 'required', v_credits_to_consume, 'remaining', v_sub.remaining_meals)::text;
    END IF;

    IF (v_effective_daily_credits + v_credits_to_consume) > COALESCE(v_sub.meals_per_day, 0) THEN
       RAISE EXCEPTION '%', jsonb_build_object('code', 'DAILY_CREDIT_LIMIT_EXCEEDED', 'message', 'Exceeds daily credit limit.', 'required', v_credits_to_consume, 'remaining_today', GREATEST(0, COALESCE(v_sub.meals_per_day, 0) - v_effective_daily_credits))::text;
    END IF;

    UPDATE subscriptions
    SET consumed_meals = COALESCE(consumed_meals, 0) + v_credits_to_consume,
        remaining_meals = remaining_meals - v_credits_to_consume,
        daily_credits_used = v_effective_daily_credits + v_credits_to_consume,
        last_usage_date = v_pickup_date
    WHERE id = v_client_sub_id;
  END IF;

  -- 7. TAX & PAYMENT RESOLUTION
  v_tax := ROUND(v_subtotal * 0.05, 0);
  v_total := GREATEST(v_subtotal + v_tax, 0);

  IF v_client_sub_id IS NOT NULL AND v_credits_to_consume > 0 THEN
    v_order_type := 'subscription'::order_type;
  ELSIF v_resolved_batch_id IS NOT NULL THEN
    v_order_type := 'on_stall'::order_type;
  ELSE
    v_order_type := 'pre_order'::order_type;
  END IF;

  IF v_subtotal = 0 AND v_credits_to_consume > 0 THEN
    -- 100% covered by subscription
    v_final_payment_method := 'subscription'::payment_method_type;
    v_payment_status := 'paid'::payment_status;
    v_payment_verification_status := 'not_required';
    v_payment_proof_deadline := NULL;
  ELSE
    IF v_payment_method NOT IN ('upi', 'cash') THEN
      RAISE EXCEPTION '%', jsonb_build_object('code', 'INVALID_PAYMENT_METHOD', 'message', 'Unsupported payment method. Only cash and upi are supported.')::text;
    END IF;
    v_final_payment_method := v_payment_method::payment_method_type;
    v_payment_status := 'pending'::payment_status;

    IF v_final_payment_method = 'upi' THEN
      v_payment_verification_status := 'awaiting_proof';
      v_payment_proof_deadline := now() + interval '15 minutes';
    ELSE
      v_payment_verification_status := 'not_required';
      v_payment_proof_deadline := NULL;
    END IF;
  END IF;

  -- 8. CREATE ORDER

  INSERT INTO orders (
    user_id, customer_name, stall_id, stall_name,
    status, order_type, payment_status, payment_method,
    subtotal, tax, discount, total, notes,
    pickup_date, expected_pickup_slot,
    payment_verification_status, payment_proof_deadline
  ) VALUES (
    v_user_id, v_user_record.name, v_stall_record.id, v_stall_record.name,
    'pending', v_order_type, v_payment_status, v_final_payment_method,
    v_subtotal, v_tax, 0, v_total, v_notes,
    v_pickup_date, v_expected_pickup_slot,
    v_payment_verification_status, v_payment_proof_deadline
  ) RETURNING id, order_number INTO v_order_id, v_order_number;

  -- 9. CREATE ORDER ITEMS (PAID + SUB LINES)
  FOR v_item IN SELECT value FROM jsonb_array_elements(v_final_items)
  LOOP
    v_meal_uuid := (v_item->>'meal_id')::UUID;
    v_paid_qty := (v_item->>'paid_qty')::INTEGER;
    v_sub_qty := (v_item->>'sub_qty')::INTEGER;
    
    IF v_paid_qty > 0 THEN
      INSERT INTO order_items (
        order_id, meal_id, meal_name, quantity, unit_price, total_price,
        subscription_id, credits_used
      ) VALUES (
        v_order_id, v_meal_uuid, v_item->>'meal_name', v_paid_qty, (v_item->>'price')::NUMERIC, ((v_item->>'price')::NUMERIC * v_paid_qty),
        NULL, 0
      );
    END IF;

    IF v_sub_qty > 0 THEN
      INSERT INTO order_items (
        order_id, meal_id, meal_name, quantity, unit_price, total_price,
        subscription_id, credits_used
      ) VALUES (
        v_order_id, v_meal_uuid, v_item->>'meal_name', v_sub_qty, (v_item->>'price')::NUMERIC, 0,
        v_client_sub_id, ((v_item->>'credit_cost')::INTEGER * v_sub_qty)
      );
    END IF;
  END LOOP;

  -- 10. RETURN TRUSTED RESULT
  RETURN jsonb_build_object(
    'success', true, 
    'order_id', v_order_id,
    'order_number', v_order_number,
    'subtotal', v_subtotal,
    'tax', v_tax,
    'discount', 0.00,
    'total', v_total,
    'order_type', v_order_type,
    'payment_status', v_payment_status,
    'payment_verification_status', v_payment_verification_status,
    'payment_proof_deadline', v_payment_proof_deadline
  );
END;
$$;


-- 2. Fix RPC execution privileges & Proof Submission Validation
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

CREATE OR REPLACE FUNCTION mark_cash_collected(p_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_order RECORD;
BEGIN
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '%', jsonb_build_object('code', 'ORDER_NOT_FOUND', 'message', 'Order not found.')::text; END IF;

  IF NOT is_stall_operator(v_order.stall_id) THEN RAISE EXCEPTION '%', jsonb_build_object('code', 'UNAUTHORIZED_STALL_ACCESS', 'message', 'Unauthorized.')::text; END IF;
  IF v_order.payment_method != 'cash' THEN RAISE EXCEPTION '%', jsonb_build_object('code', 'INVALID_PAYLOAD', 'message', 'Not a cash order.')::text; END IF;

  IF v_order.payment_status = 'paid' THEN RETURN; END IF;

  UPDATE orders SET payment_status = 'paid' WHERE id = p_order_id;
  
  IF NOT EXISTS (SELECT 1 FROM payment_records WHERE order_id = p_order_id AND status = 'paid' AND method = 'cash') THEN
    INSERT INTO payment_records (order_id, amount, status, method)
    VALUES (p_order_id, v_order.total, 'paid', 'cash');
  END IF;
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

CREATE OR REPLACE FUNCTION create_subscription_purchase_request(
  p_stall_id UUID, 
  p_plan_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_plan RECORD;
  v_user RECORD;
  v_stall RECORD;
  v_req_id UUID;
  v_resolved_stall_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '%', jsonb_build_object('code', 'UNAUTHORIZED', 'message', 'Not authorized.')::text; END IF;

  SELECT * INTO v_user FROM users WHERE id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION '%', jsonb_build_object('code', 'USER_NOT_FOUND', 'message', 'Authenticated user not found.')::text; END IF;

  SELECT * INTO v_stall FROM stalls WHERE id = p_stall_id AND is_active = true;
  IF NOT FOUND THEN RAISE EXCEPTION '%', jsonb_build_object('code', 'STALL_NOT_FOUND', 'message', 'Stall not found or inactive.')::text; END IF;

  -- Verify the stall belongs to the user's college (established business relationship)
  IF v_user.college_id IS NULL OR v_stall.college_id != v_user.college_id THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'PLAN_NOT_AVAILABLE_FOR_STALL', 'message', 'Stall does not belong to your college.')::text;
  END IF;

  v_resolved_stall_id := v_stall.id;

  SELECT * INTO v_plan FROM subscription_plans WHERE id = p_plan_id AND is_active = true;
  IF NOT FOUND THEN RAISE EXCEPTION '%', jsonb_build_object('code', 'PLAN_NOT_FOUND', 'message', 'Plan not found.')::text; END IF;

  IF v_plan.price <= 0 THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'INVALID_PAYLOAD', 'message', 'Plan price must be > 0.')::text;
  END IF;

  IF EXISTS (
    SELECT 1 FROM subscription_purchase_requests 
    WHERE user_id = auth.uid() 
      AND plan_id = p_plan_id 
      AND stall_id = v_resolved_stall_id 
      AND status IN ('awaiting_proof', 'verification_pending')
  ) THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'SUBSCRIPTION_REQUEST_ALREADY_PENDING', 'message', 'Request already pending.')::text;
  END IF;

  INSERT INTO subscription_purchase_requests (
    user_id, stall_id, plan_id, expected_amount, status
  ) VALUES (
    auth.uid(), v_resolved_stall_id, p_plan_id, v_plan.price, 'awaiting_proof'
  ) RETURNING id INTO v_req_id;

  RETURN jsonb_build_object(
    'request_id', v_req_id,
    'expected_amount', v_plan.price
  );
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

-- 3. APPLY EXPLICIT REVOKE/GRANT

-- place_order
REVOKE ALL ON FUNCTION place_order(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION place_order(JSONB) FROM anon;
REVOKE ALL ON FUNCTION place_order(JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION place_order(JSONB) TO authenticated;

-- submit_order_payment_proof
REVOKE ALL ON FUNCTION submit_order_payment_proof(UUID, TEXT, TEXT, BIGINT) FROM PUBLIC;
REVOKE ALL ON FUNCTION submit_order_payment_proof(UUID, TEXT, TEXT, BIGINT) FROM anon;
REVOKE ALL ON FUNCTION submit_order_payment_proof(UUID, TEXT, TEXT, BIGINT) FROM authenticated;
GRANT EXECUTE ON FUNCTION submit_order_payment_proof(UUID, TEXT, TEXT, BIGINT) TO authenticated;

-- verify_order_payment
REVOKE ALL ON FUNCTION verify_order_payment(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION verify_order_payment(UUID) FROM anon;
REVOKE ALL ON FUNCTION verify_order_payment(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION verify_order_payment(UUID) TO authenticated;

-- reject_order_payment
REVOKE ALL ON FUNCTION reject_order_payment(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION reject_order_payment(UUID, TEXT) FROM anon;
REVOKE ALL ON FUNCTION reject_order_payment(UUID, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION reject_order_payment(UUID, TEXT) TO authenticated;

-- mark_cash_collected
REVOKE ALL ON FUNCTION mark_cash_collected(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION mark_cash_collected(UUID) FROM anon;
REVOKE ALL ON FUNCTION mark_cash_collected(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION mark_cash_collected(UUID) TO authenticated;

-- expire_unverified_upi_orders (Admin ONLY)
REVOKE ALL ON FUNCTION expire_unverified_upi_orders() FROM PUBLIC;
REVOKE ALL ON FUNCTION expire_unverified_upi_orders() FROM anon;
REVOKE ALL ON FUNCTION expire_unverified_upi_orders() FROM authenticated;

-- create_subscription_purchase_request
REVOKE ALL ON FUNCTION create_subscription_purchase_request(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION create_subscription_purchase_request(UUID, UUID) FROM anon;
REVOKE ALL ON FUNCTION create_subscription_purchase_request(UUID, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION create_subscription_purchase_request(UUID, UUID) TO authenticated;

-- submit_subscription_payment_proof
REVOKE ALL ON FUNCTION submit_subscription_payment_proof(UUID, TEXT, TEXT, BIGINT) FROM PUBLIC;
REVOKE ALL ON FUNCTION submit_subscription_payment_proof(UUID, TEXT, TEXT, BIGINT) FROM anon;
REVOKE ALL ON FUNCTION submit_subscription_payment_proof(UUID, TEXT, TEXT, BIGINT) FROM authenticated;
GRANT EXECUTE ON FUNCTION submit_subscription_payment_proof(UUID, TEXT, TEXT, BIGINT) TO authenticated;

-- approve_subscription_purchase
REVOKE ALL ON FUNCTION approve_subscription_purchase(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION approve_subscription_purchase(UUID) FROM anon;
REVOKE ALL ON FUNCTION approve_subscription_purchase(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION approve_subscription_purchase(UUID) TO authenticated;

-- reject_subscription_purchase
REVOKE ALL ON FUNCTION reject_subscription_purchase(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION reject_subscription_purchase(UUID, TEXT) FROM anon;
REVOKE ALL ON FUNCTION reject_subscription_purchase(UUID, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION reject_subscription_purchase(UUID, TEXT) TO authenticated;

COMMIT;
