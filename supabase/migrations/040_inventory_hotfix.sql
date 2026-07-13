-- ============================================================
-- RollBowl Migration 040: Inventory Hotfix
-- ============================================================
-- 1. Fix order_items aggregation to separate subscription/paid quantities
-- 2. Validate exact active batch conditions before assigning 'on_stall'
-- 3. Calculate tax explicitly as ROUND(subtotal * 0.05, 0)
-- 4. Correctly cast payment_method to payment_method_type
-- 5. Build and reuse a genuinely trusted item dataset (CTE)
-- 6. Enforce subscription category_credit_costs and daily limits
-- 7. Safe validation of payload values before casts
-- ============================================================

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
  ELSE
    IF v_payment_method NOT IN ('upi', 'card', 'cash') THEN
      RAISE EXCEPTION '%', jsonb_build_object('code', 'INVALID_PAYMENT_METHOD', 'message', 'Unsupported payment method.')::text;
    END IF;
    v_final_payment_method := v_payment_method::payment_method_type;
    
    -- Cash, Card, and UPI all default to pending in this RPC.
    -- Card/UPI are marked 'paid' ONLY when a trusted webhook confirms receipt out-of-band.
    v_payment_status := 'pending'::payment_status;
  END IF;

  -- 8. CREATE ORDER
  INSERT INTO orders (
    user_id, customer_name, stall_id, stall_name,
    status, order_type, payment_status, payment_method,
    subtotal, tax, discount, total, notes,
    pickup_date, expected_pickup_slot
  ) VALUES (
    v_user_id, v_user_record.name, v_stall_record.id, v_stall_record.name,
    'pending', v_order_type, v_payment_status, v_final_payment_method,
    v_subtotal, v_tax, 0, v_total, v_notes,
    v_pickup_date, v_expected_pickup_slot
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
    'payment_status', v_payment_status
  );
END;
$$;

-- ============================================================
-- 11. EXPLICIT ACL ENFORCEMENT
-- ============================================================

-- place_order
REVOKE ALL ON FUNCTION place_order(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION place_order(JSONB) FROM anon;
REVOKE ALL ON FUNCTION place_order(JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION place_order(JSONB) TO authenticated;

-- activate_inventory_batch
REVOKE ALL ON FUNCTION activate_inventory_batch(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION activate_inventory_batch(UUID) FROM anon;
REVOKE ALL ON FUNCTION activate_inventory_batch(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION activate_inventory_batch(UUID) TO authenticated;

-- close_inventory_batch
REVOKE ALL ON FUNCTION close_inventory_batch(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION close_inventory_batch(UUID, TEXT) FROM anon;
REVOKE ALL ON FUNCTION close_inventory_batch(UUID, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION close_inventory_batch(UUID, TEXT) TO authenticated;

-- cancel_inventory_batch
REVOKE ALL ON FUNCTION cancel_inventory_batch(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION cancel_inventory_batch(UUID, TEXT) FROM anon;
REVOKE ALL ON FUNCTION cancel_inventory_batch(UUID, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION cancel_inventory_batch(UUID, TEXT) TO authenticated;

-- record_inventory_movement
REVOKE ALL ON FUNCTION record_inventory_movement(UUID, TEXT, INTEGER, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION record_inventory_movement(UUID, TEXT, INTEGER, TEXT, UUID) FROM anon;
REVOKE ALL ON FUNCTION record_inventory_movement(UUID, TEXT, INTEGER, TEXT, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION record_inventory_movement(UUID, TEXT, INTEGER, TEXT, UUID) TO authenticated;
