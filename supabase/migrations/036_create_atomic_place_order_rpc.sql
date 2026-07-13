-- ============================================================
-- RollBowl Migration 036: Atomic Place Order RPC
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
BEGIN
  -- 1. Extract payload
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
    -- Lock inventory_batch_items in deterministic order (meal_id ascending)
    -- We do this by iterating over the distinct meal_ids in the order sorted by UUID.
    FOR v_item IN 
      SELECT * FROM jsonb_array_elements(v_items) ORDER BY (value->>'mealId')::UUID ASC
    LOOP
      v_meal_id := (v_item->>'mealId')::UUID;
      v_requested_qty := (v_item->>'quantity')::INTEGER;

      -- Check if the item exists in the batch and lock it
      SELECT * INTO v_inventory_item
      FROM inventory_batch_items
      WHERE inventory_batch_id = v_batch_id AND meal_id = v_meal_id
      FOR UPDATE;

      IF NOT FOUND THEN
        -- Item not offered in today's active batch
        RETURN jsonb_build_object(
          'error', 'ITEM_NOT_IN_BATCH',
          'message', 'Not available for today''s pickup',
          'meal_id', v_meal_id,
          'item_name', v_item->>'mealName'
        );
      END IF;

      -- Check availability by forcing recalculation using the live_inventory_status view
      -- Because we hold the row lock on inventory_batch_items, concurrent transactions
      -- doing the same will wait here.
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

  -- 4. Create the Order
  v_order_number := 'RB-' || floor(random() * 900000 + 100000)::TEXT;

  INSERT INTO orders (
    order_number, user_id, customer_name, stall_id, stall_name,
    status, order_type, payment_status, payment_method,
    subtotal, tax, discount, total, notes,
    pickup_date, expected_pickup_slot
  ) VALUES (
    v_order_number, v_user_id, v_customer_name, v_stall_id, v_stall_name,
    'pending', 'on_stall', 
    CASE WHEN v_payment_method = 'cash' THEN 'pending'::payment_status ELSE 'paid'::payment_status END,
    v_payment_method::payment_method,
    v_subtotal, v_tax, 0, v_total, v_notes,
    v_pickup_date, v_expected_pickup_slot
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
      AND user_id = v_user_id; -- Extra security check to ensure the user owns the sub
  END IF;

  -- 7. Return Order Info
  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'order_number', v_order_number
  );
END;
$$;
