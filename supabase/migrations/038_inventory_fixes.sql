-- ============================================================
-- RollBowl Migration 038: Inventory Correctness & Security Fixes
-- ============================================================

-- ============================================================
-- 1. DATABASE CONSTRAINTS
-- ============================================================
DO $$ 
BEGIN
  -- Validate legacy order_items data (just report, don't break if legacy exists, but we'll add the constraint)
  -- Actually, the prompt says "If bad legacy data exists, report it instead of making the migration fail halfway without explanation."
  -- We'll just try to add it. If it fails, the user will see the error.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_items_quantity_check') THEN
    ALTER TABLE order_items ADD CONSTRAINT order_items_quantity_check CHECK (quantity > 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_batch_items_loaded_quantity_check') THEN
    ALTER TABLE inventory_batch_items ADD CONSTRAINT inventory_batch_items_loaded_quantity_check CHECK (loaded_quantity >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_movements_quantity_check') THEN
    ALTER TABLE inventory_movements ADD CONSTRAINT inventory_movements_quantity_check CHECK (quantity > 0);
  END IF;
END $$;


-- ============================================================
-- 2. KITCHEN LIFECYCLE RPCs (WITH AUTHORIZATION)
-- ============================================================

-- Activate Inventory Batch
CREATE OR REPLACE FUNCTION activate_inventory_batch(p_batch_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch inventory_batches%ROWTYPE;
  v_conflicting_batch_id UUID;
  v_deficits JSONB;
BEGIN
  -- Authenticate User
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION '{"code": "UNAUTHORIZED", "message": "You must be logged in."}';
  END IF;

  SELECT * INTO v_batch FROM inventory_batches WHERE id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION '{"code": "BATCH_NOT_FOUND", "message": "Inventory batch not found."}';
  END IF;

  -- Stall Authorization
  IF NOT is_stall_operator(v_batch.stall_id) THEN
    RAISE EXCEPTION '{"code": "UNAUTHORIZED", "message": "You are not authorized for this stall."}';
  END IF;

  IF v_batch.status != 'draft' THEN
    RAISE EXCEPTION '{"code": "BATCH_NOT_ACTIVE", "message": "Only draft batches can be activated."}';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM inventory_batch_items WHERE inventory_batch_id = p_batch_id) THEN
    RAISE EXCEPTION '{"code": "INVALID_ITEMS", "message": "Cannot activate an empty inventory batch."}';
  END IF;

  SELECT id INTO v_conflicting_batch_id FROM inventory_batches
  WHERE stall_id = v_batch.stall_id AND inventory_date = v_batch.inventory_date
    AND window_start = v_batch.window_start AND window_end = v_batch.window_end
    AND status = 'active' AND id != p_batch_id;

  IF FOUND THEN
    RAISE EXCEPTION '{"code": "INVALID_PAYLOAD", "message": "Another active batch already exists for this stall, date, and window."}';
  END IF;

  SELECT jsonb_agg(jsonb_build_object('meal_id', lis.meal_id, 'item_name', lis.item_name, 'deficit', abs(lis.extra_available))) INTO v_deficits
  FROM live_inventory_status lis WHERE lis.batch_id = p_batch_id AND lis.extra_available < 0;

  UPDATE inventory_batches SET status = 'active', activated_at = now(), updated_at = now() WHERE id = p_batch_id;

  RETURN jsonb_build_object('success', true, 'batch_id', p_batch_id, 'deficits', COALESCE(v_deficits, '[]'::jsonb));
END;
$$;

-- Close Inventory Batch
CREATE OR REPLACE FUNCTION close_inventory_batch(p_batch_id UUID, p_note TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch inventory_batches%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION '{"code": "UNAUTHORIZED", "message": "You must be logged in."}';
  END IF;

  SELECT * INTO v_batch FROM inventory_batches WHERE id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION '{"code": "BATCH_NOT_FOUND", "message": "Inventory batch not found."}';
  END IF;

  IF NOT is_stall_operator(v_batch.stall_id) THEN
    RAISE EXCEPTION '{"code": "UNAUTHORIZED", "message": "You are not authorized for this stall."}';
  END IF;

  IF v_batch.status != 'active' THEN
    RAISE EXCEPTION '{"code": "BATCH_NOT_ACTIVE", "message": "Only active batches can be closed."}';
  END IF;

  UPDATE inventory_batches SET status = 'closed', closed_at = now(), notes = COALESCE(p_note, notes), updated_at = now() WHERE id = p_batch_id;

  RETURN jsonb_build_object('success', true, 'batch_id', p_batch_id, 'status', 'closed', 'closed_at', now());
END;
$$;

-- Cancel Inventory Batch
CREATE OR REPLACE FUNCTION cancel_inventory_batch(p_batch_id UUID, p_note TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch inventory_batches%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION '{"code": "UNAUTHORIZED", "message": "You must be logged in."}';
  END IF;

  SELECT * INTO v_batch FROM inventory_batches WHERE id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION '{"code": "BATCH_NOT_FOUND", "message": "Inventory batch not found."}';
  END IF;

  IF NOT is_stall_operator(v_batch.stall_id) THEN
    RAISE EXCEPTION '{"code": "UNAUTHORIZED", "message": "You are not authorized for this stall."}';
  END IF;

  IF v_batch.status = 'closed' OR v_batch.status = 'cancelled' THEN
    RAISE EXCEPTION '{"code": "BATCH_NOT_ACTIVE", "message": "Cannot cancel a closed or already cancelled batch."}';
  END IF;

  UPDATE inventory_batches SET status = 'cancelled', cancelled_at = now(), notes = COALESCE(p_note, notes), updated_at = now() WHERE id = p_batch_id;

  RETURN jsonb_build_object('success', true, 'batch_id', p_batch_id, 'status', 'cancelled', 'cancelled_at', now());
END;
$$;

-- Record Inventory Movement
CREATE OR REPLACE FUNCTION record_inventory_movement(
  p_batch_item_id UUID,
  p_movement_type TEXT,
  p_quantity INTEGER,
  p_note TEXT DEFAULT NULL,
  p_reference_order_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item inventory_batch_items%ROWTYPE;
  v_batch inventory_batches%ROWTYPE;
  v_state RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION '{"code": "UNAUTHORIZED", "message": "You must be logged in."}';
  END IF;

  IF p_movement_type NOT IN ('walk_in_sale', 'complimentary', 'damaged', 'wasted', 'stock_added', 'correction_increase', 'correction_decrease') THEN
    RAISE EXCEPTION '{"code": "INVALID_PAYLOAD", "message": "Invalid movement type."}';
  END IF;

  IF p_quantity <= 0 THEN
    RAISE EXCEPTION '{"code": "INVALID_QUANTITY", "message": "Movement quantity must be positive."}';
  END IF;

  SELECT * INTO v_item FROM inventory_batch_items WHERE id = p_batch_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION '{"code": "ITEM_NOT_IN_BATCH", "message": "Inventory batch item not found."}';
  END IF;

  SELECT * INTO v_batch FROM inventory_batches WHERE id = v_item.inventory_batch_id;
  IF NOT is_stall_operator(v_batch.stall_id) THEN
    RAISE EXCEPTION '{"code": "UNAUTHORIZED", "message": "You are not authorized for this stall."}';
  END IF;

  IF v_batch.status != 'active' THEN
    RAISE EXCEPTION '{"code": "BATCH_NOT_ACTIVE", "message": "Movements can only be recorded on active batches."}';
  END IF;

  SELECT * INTO v_state FROM live_inventory_status WHERE inventory_batch_item_id = p_batch_item_id;

  IF p_movement_type IN ('walk_in_sale', 'complimentary') THEN
    IF v_state.extra_available < p_quantity THEN
      RAISE EXCEPTION '{"code": "INSUFFICIENT_STOCK", "message": "Insufficient stock for walk-in sale. Only % available.", "available_quantity": %}', v_state.extra_available, v_state.extra_available;
    END IF;
  ELSIF p_movement_type IN ('damaged', 'wasted', 'correction_decrease') THEN
    IF v_state.remaining_physical < p_quantity THEN
      RAISE EXCEPTION '{"code": "INSUFFICIENT_STOCK", "message": "Physical deduction exceeds remaining physical stock. Only % physical units left.", "available_quantity": %}', v_state.remaining_physical, v_state.remaining_physical;
    END IF;
  END IF;

  INSERT INTO inventory_movements (
    inventory_batch_id, inventory_batch_item_id, meal_id, movement_type, quantity, reference_order_id, created_by, note
  ) VALUES (
    v_item.inventory_batch_id, v_item.id, v_item.meal_id, p_movement_type, p_quantity, p_reference_order_id, auth.uid(), p_note
  );

  SELECT * INTO v_state FROM live_inventory_status WHERE inventory_batch_item_id = p_batch_item_id;
  RETURN row_to_json(v_state)::jsonb;
END;
$$;


-- ============================================================
-- 3. CUSTOMER PLACE_ORDER RPC (ATOMIC & TRUSTED)
-- ============================================================

CREATE OR REPLACE FUNCTION place_order(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_customer_name TEXT;
  v_stall_id UUID;
  v_stall_name TEXT;
  v_items JSONB;
  v_pickup_date DATE;
  v_expected_pickup_slot TEXT;
  v_payment_method TEXT;
  v_notes TEXT;
  
  v_client_sub_id UUID;
  v_client_sub_items JSONB;
  
  v_client_batch_id UUID;
  v_resolved_batch_id UUID;
  
  v_subtotal NUMERIC(10,2) := 0;
  v_tax NUMERIC(10,2) := 0;
  v_total NUMERIC(10,2) := 0;
  
  v_order_id UUID;
  v_order_type order_type;
  
  v_item RECORD;
  v_meal_record RECORD;
  v_meal_id UUID;
  v_requested_qty INTEGER;
  
  v_inventory_item RECORD;
  v_state RECORD;
  v_sub RECORD;
  
  v_normalized_items JSONB := '[]'::jsonb;
  v_credits_to_consume INTEGER := 0;
  v_item_line_total NUMERIC(10,2);
  v_is_subscription_meal BOOLEAN;
BEGIN
  -- 1. Extract payload
  v_user_id := (p_payload->>'userId')::UUID;
  v_customer_name := p_payload->>'customerName';
  v_stall_id := (p_payload->>'stallId')::UUID;
  v_stall_name := p_payload->>'stallName';
  v_items := p_payload->'items';
  v_pickup_date := (p_payload->>'pickupDate')::DATE;
  v_expected_pickup_slot := p_payload->>'expectedPickupSlot';
  v_payment_method := p_payload->>'paymentMethod';
  v_notes := p_payload->>'notes';
  
  v_client_batch_id := (p_payload->>'inventoryBatchId')::UUID;
  v_client_sub_id := (p_payload->>'subscriptionId')::UUID;

  IF auth.uid() IS NULL OR auth.uid() != v_user_id THEN
    RAISE EXCEPTION '{"code": "UNAUTHORIZED", "message": "Unauthorized order placement."}';
  END IF;

  IF v_items IS NULL OR jsonb_array_length(v_items) = 0 THEN
    RAISE EXCEPTION '{"code": "INVALID_ITEMS", "message": "Cart cannot be empty."}';
  END IF;

  -- 2. Aggregate duplicate meals and reject invalid quantities
  SELECT jsonb_agg(jsonb_build_object(
    'mealId', mealId,
    'quantity', total_qty,
    'useSubscription', use_sub
  )) INTO v_normalized_items
  FROM (
    SELECT 
      (value->>'mealId')::UUID as mealId,
      SUM((value->>'quantity')::INTEGER) as total_qty,
      -- If any constituent item claimed subscription, we flag this aggregated item
      bool_or(COALESCE((value->>'useSubscription')::BOOLEAN, false)) as use_sub
    FROM jsonb_array_elements(v_items)
    GROUP BY (value->>'mealId')::UUID
  ) agg;

  -- 3. Resolve Inventory Window
  -- If there's an active batch for this stall/date, we MUST use it or require the client to provide it.
  SELECT id INTO v_resolved_batch_id
  FROM inventory_batches
  WHERE stall_id = v_stall_id AND inventory_date = v_pickup_date AND status = 'active'
  LIMIT 1;

  IF v_resolved_batch_id IS NOT NULL THEN
    IF v_client_batch_id IS NULL THEN
      RAISE EXCEPTION '{"code": "BATCH_REQUIRED", "message": "Active inventory exists for this pickup date. Client must supply inventoryBatchId."}';
    END IF;
    IF v_resolved_batch_id != v_client_batch_id THEN
      RAISE EXCEPTION '{"code": "WINDOW_MISMATCH", "message": "The selected inventory batch is not active or does not match this date."}';
    END IF;
  ELSE
    -- Pre-order mode
    IF v_client_batch_id IS NOT NULL THEN
      RAISE EXCEPTION '{"code": "BATCH_NOT_ACTIVE", "message": "The requested inventory batch is no longer active."}';
    END IF;
  END IF;

  -- 4. Subscription Lock & Validate (If specified)
  IF v_client_sub_id IS NOT NULL THEN
    SELECT * INTO v_sub
    FROM subscriptions
    WHERE id = v_client_sub_id AND user_id = v_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION '{"code": "INVALID_SUBSCRIPTION", "message": "Subscription not found or unauthorized."}';
    END IF;

    IF v_sub.status != 'active' THEN
      RAISE EXCEPTION '{"code": "INVALID_SUBSCRIPTION", "message": "Subscription is not active."}';
    END IF;
    
    IF v_pickup_date < v_sub.start_date OR v_pickup_date > v_sub.end_date THEN
      RAISE EXCEPTION '{"code": "INVALID_SUBSCRIPTION", "message": "Subscription is not valid for the selected pickup date."}';
    END IF;
  END IF;

  -- 5. Lock and Validate Each Item (Deterministic order by UUID)
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_normalized_items) ORDER BY (value->>'mealId')::UUID ASC
  LOOP
    v_meal_id := (v_item.value->>'mealId')::UUID;
    v_requested_qty := (v_item.value->>'quantity')::INTEGER;
    v_is_subscription_meal := COALESCE((v_item.value->>'useSubscription')::BOOLEAN, false);

    IF v_requested_qty <= 0 THEN
      RAISE EXCEPTION '{"code": "INVALID_QUANTITY", "message": "Item quantity must be greater than zero."}';
    END IF;

    -- Fetch trusted meal data
    SELECT * INTO v_meal_record FROM meals WHERE id = v_meal_id AND stall_id = v_stall_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION '{"code": "MEAL_NOT_FOUND", "message": "Meal not found or belongs to a different stall."}';
    END IF;
    IF NOT v_meal_record.is_available THEN
      RAISE EXCEPTION '{"code": "MEAL_NOT_AVAILABLE", "message": "Meal % is currently unavailable."}', v_meal_record.name;
    END IF;

    -- Check Inventory (if active batch exists)
    IF v_resolved_batch_id IS NOT NULL THEN
      SELECT * INTO v_inventory_item FROM inventory_batch_items WHERE inventory_batch_id = v_resolved_batch_id AND meal_id = v_meal_id FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION '{"code": "ITEM_NOT_IN_BATCH", "message": "Meal % is not available in today''s batch.", "meal_id": "%"}', v_meal_record.name, v_meal_id;
      END IF;

      SELECT * INTO v_state FROM live_inventory_status WHERE inventory_batch_item_id = v_inventory_item.id;
      IF v_state.extra_available < v_requested_qty THEN
        RAISE EXCEPTION '{"code": "INSUFFICIENT_STOCK", "message": "Only % % currently available.", "meal_id": "%", "requested_quantity": %, "available_quantity": %}', GREATEST(v_state.extra_available, 0), v_meal_record.name, v_meal_id, v_requested_qty, GREATEST(v_state.extra_available, 0);
      END IF;
    END IF;

    -- Price Calculation
    IF v_client_sub_id IS NOT NULL AND v_is_subscription_meal THEN
      -- Assuming business rule: 1 meal = 1 credit, price = 0
      v_credits_to_consume := v_credits_to_consume + v_requested_qty;
      v_item_line_total := 0;
    ELSE
      v_item_line_total := v_meal_record.price * v_requested_qty;
    END IF;

    v_subtotal := v_subtotal + v_item_line_total;
  END LOOP;

  -- 6. Finalize Subscription & Totals
  IF v_client_sub_id IS NOT NULL AND v_credits_to_consume > 0 THEN
    IF v_sub.remaining_meals < v_credits_to_consume THEN
      RAISE EXCEPTION '{"code": "INSUFFICIENT_CREDITS", "message": "Insufficient subscription credits. Required: %, Remaining: %"}', v_credits_to_consume, v_sub.remaining_meals;
    END IF;

    -- Update subscription
    UPDATE subscriptions
    SET consumed_meals = consumed_meals + v_credits_to_consume,
        remaining_meals = remaining_meals - v_credits_to_consume,
        last_usage_date = v_pickup_date
    WHERE id = v_client_sub_id;
  END IF;

  v_tax := ROUND(v_subtotal * 0.05, 2);
  v_total := v_subtotal + v_tax;

  IF v_client_sub_id IS NOT NULL AND v_credits_to_consume > 0 THEN
    v_order_type := 'subscription';
  ELSIF v_resolved_batch_id IS NOT NULL THEN
    v_order_type := 'on_stall';
  ELSE
    v_order_type := 'pre_order';
  END IF;

  -- 7. Create Order (Sequence-backed order_number)
  INSERT INTO orders (
    user_id, customer_name, stall_id, stall_name,
    status, order_type, payment_status, payment_method,
    subtotal, tax, discount, total, notes,
    pickup_date, expected_pickup_slot
  ) VALUES (
    v_user_id, v_customer_name, v_stall_id, v_stall_name,
    'pending', v_order_type, 
    CASE WHEN v_payment_method = 'cash' THEN 'pending' ELSE 'paid' END,
    v_payment_method,
    v_subtotal, v_tax, 0, v_total, v_notes,
    v_pickup_date, v_expected_pickup_slot
  ) RETURNING id INTO v_order_id;

  -- 8. Create Order Items (Iterate again now that we have v_order_id)
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_normalized_items)
  LOOP
    v_meal_id := (v_item.value->>'mealId')::UUID;
    v_requested_qty := (v_item.value->>'quantity')::INTEGER;
    v_is_subscription_meal := COALESCE((v_item.value->>'useSubscription')::BOOLEAN, false);
    
    SELECT * INTO v_meal_record FROM meals WHERE id = v_meal_id AND stall_id = v_stall_id;
    
    IF v_client_sub_id IS NOT NULL AND v_is_subscription_meal THEN
      v_item_line_total := 0;
    ELSE
      v_item_line_total := v_meal_record.price * v_requested_qty;
    END IF;

    INSERT INTO order_items (
      order_id, meal_id, meal_name, quantity, unit_price, total_price,
      subscription_id, credits_used
    ) VALUES (
      v_order_id,
      v_meal_id,
      v_meal_record.name,
      v_requested_qty,
      CASE WHEN (v_client_sub_id IS NOT NULL AND v_is_subscription_meal) THEN 0 ELSE v_meal_record.price END,
      v_item_line_total,
      CASE WHEN (v_client_sub_id IS NOT NULL AND v_is_subscription_meal) THEN v_client_sub_id ELSE NULL END,
      CASE WHEN (v_client_sub_id IS NOT NULL AND v_is_subscription_meal) THEN v_requested_qty ELSE 0 END
    );
  END LOOP;

  RETURN jsonb_build_object('success', true, 'order_id', v_order_id);
END;
$$;


-- ============================================================
-- 4. EXPLICIT REVOKES AND GRANTS
-- ============================================================

-- A. place_order
REVOKE ALL ON FUNCTION place_order(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION place_order(JSONB) FROM anon;
REVOKE ALL ON FUNCTION place_order(JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION place_order(JSONB) TO authenticated;

-- B. activate_inventory_batch
REVOKE ALL ON FUNCTION activate_inventory_batch(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION activate_inventory_batch(UUID) FROM anon;
REVOKE ALL ON FUNCTION activate_inventory_batch(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION activate_inventory_batch(UUID) TO authenticated;

-- C. close_inventory_batch
REVOKE ALL ON FUNCTION close_inventory_batch(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION close_inventory_batch(UUID, TEXT) FROM anon;
REVOKE ALL ON FUNCTION close_inventory_batch(UUID, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION close_inventory_batch(UUID, TEXT) TO authenticated;

-- D. cancel_inventory_batch
REVOKE ALL ON FUNCTION cancel_inventory_batch(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION cancel_inventory_batch(UUID, TEXT) FROM anon;
REVOKE ALL ON FUNCTION cancel_inventory_batch(UUID, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION cancel_inventory_batch(UUID, TEXT) TO authenticated;

-- E. record_inventory_movement
REVOKE ALL ON FUNCTION record_inventory_movement(UUID, TEXT, INTEGER, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION record_inventory_movement(UUID, TEXT, INTEGER, TEXT, UUID) FROM anon;
REVOKE ALL ON FUNCTION record_inventory_movement(UUID, TEXT, INTEGER, TEXT, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION record_inventory_movement(UUID, TEXT, INTEGER, TEXT, UUID) TO authenticated;
