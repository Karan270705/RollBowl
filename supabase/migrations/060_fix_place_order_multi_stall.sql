-- ============================================================================
-- RollBowl Migration 060: Fix place_order for Multi-Stall Meals
-- ============================================================================
-- In a multi-stall setup (migration 053), a stall (e.g. Abc) can add another
-- stall's meal (e.g. Veggie Roll from Main Stall) to its menu schedule. 
-- The place_order RPC previously enforced that every ordered meal's `stall_id`
-- exactly matched the checkout `stall_id`. This migration removes that strict
-- check, since menu availability is either enforced by inventory batches (if
-- tracked) or frontend menu schedules (if untracked).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.place_order(p_payload JSONB)
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
  v_subtotal NUMERIC(10,2) := 0;
  v_tax NUMERIC(10,2) := 0;
  v_total NUMERIC(10,2) := 0;
  
  v_item JSONB;
  v_meal_uuid UUID;
  v_qty INTEGER;
  v_sub_qty INTEGER;
  v_paid_qty INTEGER;
  
  v_order_id UUID;
  v_order_number TEXT;
  
  v_order_type order_type;
  v_payment_status payment_status;
  v_payment_verification_status payment_verification_status;
  v_final_payment_method payment_method_type;
  v_payment_proof_deadline TIMESTAMPTZ;
  
  v_client_sub_id UUID;
  v_sub RECORD;
  v_credits_to_consume INTEGER := 0;
  v_effective_daily_credits INTEGER := 0;
  v_reserved_total INTEGER := 0;
  v_reserved_today INTEGER := 0;
  v_available_total INTEGER := 0;
  v_available_daily INTEGER := 0;
  v_credit_cost INTEGER;
  v_credit_cost_numeric NUMERIC;
  
  v_resolved_batch_id UUID;
  v_batch_item RECORD;
  v_state RECORD;
  
  v_trusted_items JSONB := '[]'::JSONB;
  v_final_items JSONB := '[]'::JSONB;
  
  v_cutoff TIMESTAMPTZ;
  v_now_ist TIMESTAMPTZ;
BEGIN
  -- 1. AUTHENTICATION & USER VALIDATION
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'UNAUTHORIZED', 'message', 'Not authorized')::text;
  END IF;

  SELECT id, name, phone INTO v_user_record
  FROM public.users WHERE id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'USER_NOT_FOUND', 'message', 'User profile not found')::text;
  END IF;

  IF v_user_record.phone IS NULL OR trim(v_user_record.phone) = '' THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'PHONE_REQUIRED', 'message', 'Phone number required')::text;
  END IF;

  -- 2. STALL VALIDATION
  IF (p_payload->>'stallId') IS NULL THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'INVALID_PAYLOAD', 'message', 'stallId is required')::text;
  END IF;

  SELECT id, name, is_active INTO v_stall_record
  FROM public.stalls
  WHERE id = (p_payload->>'stallId')::UUID;

  IF NOT FOUND THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'STALL_NOT_FOUND', 'message', 'Stall not found')::text;
  END IF;

  IF NOT v_stall_record.is_active THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'STALL_INACTIVE', 'message', 'Stall is currently inactive')::text;
  END IF;

  -- 3. CUTOFF TIME & PICKUP DATE VALIDATION
  IF (p_payload->>'pickupDate') IS NULL THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'INVALID_PAYLOAD', 'message', 'pickupDate is required')::text;
  END IF;

  v_pickup_date := (p_payload->>'pickupDate')::DATE;
  v_now_ist := now() AT TIME ZONE 'Asia/Kolkata';

  IF v_pickup_date < v_now_ist::DATE THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'PAST_PICKUP_DATE', 'message', 'Cannot order for a past date')::text;
  END IF;

  IF v_pickup_date = v_now_ist::DATE THEN
    SELECT order_cutoff INTO v_cutoff
    FROM public.menu_schedules
    WHERE stall_id = (p_payload->>'stallId')::UUID
      AND menu_date = v_pickup_date
      AND is_published = true
    LIMIT 1;

    IF v_cutoff IS NOT NULL AND now() >= v_cutoff THEN
      RAISE EXCEPTION '%', jsonb_build_object('code', 'CUTOFF_PASSED', 'message', 'Order cutoff time for today has passed')::text;
    END IF;
  END IF;

  v_expected_pickup_slot := trim(COALESCE(p_payload->>'expectedPickupSlot', '13:00 - 13:30'));
  BEGIN
    v_parsed_slot_start := split_part(v_expected_pickup_slot, ' - ', 1)::TIME;
    v_parsed_slot_end   := split_part(v_expected_pickup_slot, ' - ', 2)::TIME;
    IF v_parsed_slot_start >= v_parsed_slot_end THEN
      RAISE EXCEPTION 'Invalid slot window';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'INVALID_PICKUP_SLOT', 'message', 'Expected pickup slot must be in HH:MI - HH:MI format.')::text;
  END;

  v_payment_method := COALESCE(p_payload->>'paymentMethod', 'upi');
  v_notes := p_payload->>'notes';
  v_items := p_payload->'items';

  IF v_items IS NULL OR jsonb_array_length(v_items) = 0 THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'EMPTY_ORDER', 'message', 'Order items cannot be empty')::text;
  END IF;

  -- 4. INVENTORY BATCH & SUBSCRIPTION RESOLUTION (LOCK FOR UPDATE)
  SELECT id INTO v_resolved_batch_id
  FROM inventory_batches
  WHERE stall_id = v_stall_record.id
    AND inventory_date = v_pickup_date
    AND status = 'active'
  LIMIT 1;

  IF (p_payload->>'subscriptionId') IS NOT NULL AND trim(p_payload->>'subscriptionId') != '' THEN
    v_client_sub_id := (p_payload->>'subscriptionId')::UUID;
  END IF;

  IF v_client_sub_id IS NOT NULL THEN
    SELECT s.*
    INTO v_sub
    FROM public.subscriptions s
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

    -- Calculate active pending reservations for this subscription
    SELECT COALESCE(SUM(credits), 0) INTO v_reserved_total
    FROM public.subscription_credit_reservations
    WHERE subscription_id = v_sub.id
      AND status = 'reserved';

    SELECT COALESCE(SUM(credits), 0) INTO v_reserved_today
    FROM public.subscription_credit_reservations
    WHERE subscription_id = v_sub.id
      AND status = 'reserved'
      AND service_date = v_pickup_date;
  END IF;

  -- 5. VALIDATE INVENTORY & BUILD FINAL DATASET
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_payload->'items')
  LOOP
    v_meal_uuid := COALESCE(v_item->>'mealId', v_item->>'meal_id')::UUID;
    v_qty := COALESCE(v_item->>'quantity', v_item->>'qty')::INTEGER;
    v_sub_qty := CASE
      WHEN (v_item->>'subscriptionQuantity') IS NOT NULL THEN (v_item->>'subscriptionQuantity')::INTEGER
      WHEN (v_item->>'sub_qty') IS NOT NULL THEN (v_item->>'sub_qty')::INTEGER
      WHEN COALESCE((v_item->>'isSubscriptionItem')::BOOLEAN, false) = true OR COALESCE((v_item->>'useSubscription')::BOOLEAN, false) = true THEN v_qty
      ELSE 0
    END;
    
    IF v_qty <= 0 THEN
      RAISE EXCEPTION '%', jsonb_build_object('code', 'INVALID_QUANTITY', 'message', 'Quantity must be positive')::text;
    END IF;
    
    IF v_sub_qty < 0 OR v_sub_qty > v_qty THEN
      RAISE EXCEPTION '%', jsonb_build_object('code', 'INVALID_SUBSCRIPTION_QUANTITY', 'message', 'Subscription quantity invalid')::text;
    END IF;

    v_paid_qty := v_qty - v_sub_qty;
    
    DECLARE
      v_db_meal RECORD;
    BEGIN
      SELECT id, name, price, is_available, category INTO v_db_meal
      FROM meals
      -- REMOVED: `AND stall_id = v_stall_record.id` to allow multi-stall ordering
      WHERE id = v_meal_uuid;
      
      IF NOT FOUND THEN
        RAISE EXCEPTION '%', jsonb_build_object('code', 'MEAL_NOT_FOUND', 'message', 'Meal not found')::text;
      END IF;

      v_trusted_items := v_trusted_items || jsonb_build_object(
        'meal_id', v_db_meal.id,
        'meal_name', v_db_meal.name,
        'price', v_db_meal.price,
        'is_available', v_db_meal.is_available,
        'category', v_db_meal.category,
        'qty', v_qty,
        'sub_qty', v_sub_qty,
        'paid_qty', v_paid_qty
      );
    END;
  END LOOP;

  FOR v_item IN SELECT value FROM jsonb_array_elements(v_trusted_items)
  LOOP
    v_meal_uuid := (v_item->>'meal_id')::UUID;
    v_qty       := (v_item->>'qty')::INTEGER;
    v_sub_qty   := (v_item->>'sub_qty')::INTEGER;
    v_paid_qty  := (v_item->>'paid_qty')::INTEGER;
    
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

      v_credit_cost_numeric := (v_sub.category_credit_costs->>(v_item->>'category'))::NUMERIC;
      IF v_credit_cost_numeric % 1 != 0 OR v_credit_cost_numeric <= 0 OR v_credit_cost_numeric > 10000 THEN
         RAISE EXCEPTION '%', jsonb_build_object('code', 'SUBSCRIPTION_PLAN_CONFIG_INVALID', 'message', 'Credit cost must be a positive integer.')::text;
      END IF;
      
      v_credit_cost := v_credit_cost_numeric::INTEGER;
      v_credits_to_consume := v_credits_to_consume + (v_credit_cost * v_sub_qty);
    END IF;

    v_subtotal := v_subtotal + ((v_item->>'price')::NUMERIC * v_paid_qty);
    
    v_final_items := v_final_items || jsonb_build_object(
      'meal_id', v_meal_uuid,
      'meal_name', v_item->>'meal_name',
      'price', (v_item->>'price')::NUMERIC,
      'paid_qty', v_paid_qty,
      'sub_qty', v_sub_qty,
      'credit_cost', v_credit_cost
    );
  END LOOP;

  -- 6. VALIDATE AVAILABLE TOTAL & DAILY CREDITS (RESERVATIONS ARE AUDITED BUT NOT YET CONSUMED)
  IF v_credits_to_consume > 0 THEN
    v_available_total := COALESCE(v_sub.remaining_meals, 0) - v_reserved_total;
    IF v_available_total < v_credits_to_consume THEN
      RAISE EXCEPTION '%', jsonb_build_object(
        'code', 'INSUFFICIENT_CREDITS',
        'message', 'Insufficient subscription credits available (including pending reservations).',
        'required', v_credits_to_consume,
        'remaining', v_sub.remaining_meals,
        'reserved', v_reserved_total,
        'available', v_available_total
      )::text;
    END IF;

    v_available_daily := COALESCE(v_sub.meals_per_day, 0) - v_effective_daily_credits - v_reserved_today;
    IF v_available_daily < v_credits_to_consume THEN
       RAISE EXCEPTION '%', jsonb_build_object(
         'code', 'DAILY_CREDIT_LIMIT_EXCEEDED',
         'message', 'Exceeds daily subscription credit limit (including pending reservations).',
         'required', v_credits_to_consume,
         'remaining_today', GREATEST(0, v_available_daily)
       )::text;
    END IF;
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

  -- 9. CREATE ORDER ITEMS
  FOR v_item IN SELECT value FROM jsonb_array_elements(v_final_items)
  LOOP
    v_meal_uuid := (v_item->>'meal_id')::UUID;
    v_paid_qty  := (v_item->>'paid_qty')::INTEGER;
    v_sub_qty   := (v_item->>'sub_qty')::INTEGER;
    v_credit_cost := (v_item->>'credit_cost')::INTEGER;
    
    IF v_paid_qty > 0 THEN
      INSERT INTO order_items (
        order_id, meal_id, meal_name, quantity,
        unit_price, total_price,
        subscription_id, credits_used
      ) VALUES (
        v_order_id, v_meal_uuid, v_item->>'meal_name', v_paid_qty,
        (v_item->>'price')::NUMERIC, (v_item->>'price')::NUMERIC * v_paid_qty,
        NULL, 0
      );
    END IF;
    
    IF v_sub_qty > 0 THEN
      INSERT INTO order_items (
        order_id, meal_id, meal_name, quantity,
        unit_price, total_price,
        subscription_id, credits_used
      ) VALUES (
        v_order_id, v_meal_uuid, v_item->>'meal_name', v_sub_qty,
        (v_item->>'price')::NUMERIC, 0,
        v_client_sub_id, v_sub_qty * v_credit_cost
      );
    END IF;
  END LOOP;

  -- 10. CREATE DURABLE 'reserved' LEDGER ENTRY (WITHOUT MUTATING SUBSCRIPTION BALANCES)
  IF v_credits_to_consume > 0 THEN
    INSERT INTO public.subscription_credit_reservations (
      order_id, subscription_id, user_id, service_date, credits, status, reserved_at
    ) VALUES (
      v_order_id, v_client_sub_id, v_user_id, v_pickup_date, v_credits_to_consume, 'reserved', now()
    );
  END IF;

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

-- Explicitly re-grant execution permissions since we used CREATE OR REPLACE
REVOKE ALL ON FUNCTION public.place_order(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.place_order(JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.place_order(JSONB) TO authenticated;
