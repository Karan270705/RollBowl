-- ==============================================================================
-- Migration: 050_authoritative_kitchen_subscription_acceptance.sql
-- Description:
--   1. Plus Plan Entitlements & Precise Scoped Repair:
--      - Updates Plus Plan in subscription_plans to total_meals = 40, meals_per_day = 2.
--      - Corrects ONLY active Plus Plan subscriptions where total_meals = 20.
--      - Corrects ONLY subscription_purchase_requests linked via created_subscription_id.
--   2. Durable Credit Reservation Ledger (subscription_credit_reservations):
--      - Table with strict check constraints on status, consumed_at, released_at.
--      - Includes legacy_backfill and legacy_state_verified metadata columns.
--   3. Historical Order Backfill with Fixed Cutoff Timestamp:
--      - Captures v_migration_cutoff := clock_timestamp().
--      - Non-cancelled orders backfilled as 'consumed'.
--      - Cancelled orders backfilled as 'legacy_released_unverified' (legacy_state_verified = false).
--      - Never alters historical subscription balances.
--   4. place_order with Capacity Reservation:
--      - Validates total and daily available credits including pending reservations.
--      - Creates 'reserved' ledger entry without mutating consumed_meals/remaining_meals.
--   5. Authoritative Kitchen Acceptance (accept_order):
--      - Validates effectiveDailyUsed + reservation.credits <= meals_per_day (no double counting).
--      - Atomically converts 'reserved' -> 'consumed' and mutates subscription balances.
--   6. Comprehensive Release Path Coverage:
--      - release_subscription_reservation handles 'reserved' -> 'released' idempotently.
--      - Refuses automatic release on 'consumed' (requires explicit reversal workflow).
--      - Replaces old direct balance refund loops in expire_unverified_upi_orders and reject_order_payment.
-- ==============================================================================

-- ─── 1. PLUS PLAN ENTITLEMENT CORRECTION (SCOPED TO ACTIVE SUBSCRIPTIONS) ───────
UPDATE public.subscription_plans
SET total_meals = 40,
    meals_per_day = 2,
    badge = '40 MEALS',
    features = ARRAY[
      '2 Meals per day',
      '40 Total Meals',
      'Eligible: Rolls, Bowls, Combos',
      '25 Days Validity',
      'Carry forward on holidays'
    ]
WHERE name = 'Plus Plan' AND (total_meals != 40 OR meals_per_day != 2);

-- Correct active Plus Plan subscriptions only
UPDATE public.subscriptions
SET total_meals = 40,
    meals_per_day = 2,
    remaining_meals = GREATEST(0, 40 - COALESCE(consumed_meals, 0))
WHERE plan_name = 'Plus Plan'
  AND status = 'active'
  AND total_meals = 20;

-- Correct ONLY requests linked to those exact corrected subscriptions via created_subscription_id
UPDATE public.subscription_purchase_requests
SET total_meals_snapshot = 40,
    meals_per_day_snapshot = 2
WHERE created_subscription_id IN (
  SELECT id
  FROM public.subscriptions
  WHERE plan_name = 'Plus Plan' AND status = 'active' AND total_meals = 40
) AND total_meals_snapshot = 20;

-- ─── 2. DURABLE CREDIT RESERVATION LEDGER ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.subscription_credit_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE RESTRICT,
  subscription_id UUID NOT NULL REFERENCES public.subscriptions(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  service_date DATE NOT NULL,
  credits INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'reserved',
  reserved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  consumed_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  release_reason TEXT,
  legacy_backfill BOOLEAN NOT NULL DEFAULT false,
  legacy_state_verified BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT chk_sub_res_status CHECK (status IN ('reserved', 'consumed', 'released', 'legacy_released_unverified')),
  CONSTRAINT chk_sub_res_credits CHECK (credits > 0),
  CONSTRAINT chk_sub_res_consumed_at CHECK (
    (status = 'consumed' AND consumed_at IS NOT NULL) OR
    (status != 'consumed' AND consumed_at IS NULL)
  ),
  CONSTRAINT chk_sub_res_released_at CHECK (
    (status IN ('released', 'legacy_released_unverified') AND released_at IS NOT NULL) OR
    (status NOT IN ('released', 'legacy_released_unverified') AND released_at IS NULL)
  ),
  CONSTRAINT chk_sub_res_mutual_exclusion CHECK (
    NOT (consumed_at IS NOT NULL AND released_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_sub_res_sub_status
ON public.subscription_credit_reservations (subscription_id, status);

CREATE INDEX IF NOT EXISTS idx_sub_res_sub_date_status
ON public.subscription_credit_reservations (subscription_id, service_date, status);

CREATE INDEX IF NOT EXISTS idx_sub_res_user_date_status
ON public.subscription_credit_reservations (user_id, service_date, status);

ALTER TABLE public.subscription_credit_reservations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sub_credit_res_read ON public.subscription_credit_reservations;
CREATE POLICY sub_credit_res_read ON public.subscription_credit_reservations
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.stalls
      WHERE id = (SELECT stall_id FROM public.orders WHERE id = subscription_credit_reservations.order_id)
        AND operator_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('kitchen', 'stall_operator')
    )
  );

-- ─── 3. HISTORICAL ORDER BACKFILL WITH FIXED CUTOFF TIMESTAMP ──────────────────
-- We capture clock_timestamp() once so all legacy order classifications use the exact same cutoff.
-- Non-cancelled legacy subscription orders are backfilled as 'consumed'.
-- Cancelled legacy subscription orders are backfilled as 'legacy_released_unverified' (legacy_state_verified = false).
-- Historical subscription balances are NEVER modified.
DO $$
DECLARE
  v_migration_cutoff TIMESTAMPTZ := clock_timestamp();
BEGIN
  INSERT INTO public.subscription_credit_reservations (
    order_id,
    subscription_id,
    user_id,
    service_date,
    credits,
    status,
    reserved_at,
    consumed_at,
    released_at,
    release_reason,
    legacy_backfill,
    legacy_state_verified
  )
  SELECT 
    o.id,
    oi.subscription_id,
    o.user_id,
    COALESCE(o.pickup_date, o.created_at::DATE),
    SUM(oi.credits_used)::INTEGER,
    CASE 
      WHEN o.status = 'cancelled' THEN 'legacy_released_unverified'
      ELSE 'consumed'
    END AS status,
    o.created_at,
    CASE WHEN o.status != 'cancelled' THEN o.created_at ELSE NULL END,
    CASE WHEN o.status = 'cancelled' THEN o.updated_at ELSE NULL END,
    CASE WHEN o.status = 'cancelled' THEN 'Historical cancelled order before Migration 050 (unverified legacy refund)' ELSE NULL END,
    true AS legacy_backfill,
    CASE WHEN o.status = 'cancelled' THEN false ELSE true END AS legacy_state_verified
  FROM public.orders o
  JOIN public.order_items oi ON oi.order_id = o.id
  WHERE oi.subscription_id IS NOT NULL 
    AND oi.credits_used > 0
    AND o.created_at < v_migration_cutoff
  GROUP BY o.id, o.order_number, o.status, o.created_at, o.updated_at, o.pickup_date, o.user_id, oi.subscription_id
  ON CONFLICT (order_id) DO NOTHING;
END;
$$;

-- ─── 4. REFACTOR place_order WITH CAPACITY RESERVATION ─────────────────────────
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
  v_payment_verification_status TEXT;
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
      WHERE id = v_meal_uuid AND stall_id = v_stall_record.id;
      
      IF NOT FOUND THEN
        RAISE EXCEPTION '%', jsonb_build_object('code', 'MEAL_NOT_FOUND', 'message', 'Meal not found or does not belong to stall')::text;
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

-- ─── 5. AUTHORITATIVE KITCHEN ACCEPTANCE (accept_order) ────────────────────────
-- Verifies capacity without double counting:
-- effectiveDailyUsed + reservation.credits <= subscription.meals_per_day
CREATE OR REPLACE FUNCTION public.accept_order(
  p_order_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_res RECORD;
  v_sub RECORD;
  v_effective_daily_used INTEGER := 0;
  v_total_credits_for_order INTEGER := 0;
BEGIN
  -- 1. Authentication Check
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'UNAUTHORIZED', 'message', 'Not authorized.')::text;
  END IF;

  -- 2. Lock Order row FOR UPDATE
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'ORDER_NOT_FOUND', 'message', 'Order not found.')::text;
  END IF;

  -- 3. Check operator permissions / stall ownership
  IF NOT EXISTS (
    SELECT 1 FROM public.stalls WHERE id = v_order.stall_id AND (operator_id = auth.uid() OR auth.role() = 'service_role')
  ) AND NOT EXISTS (
    SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('kitchen', 'stall_operator')
  ) THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'UNAUTHORIZED_STALL_OPERATOR', 'message', 'Operator does not have permission for this stall.')::text;
  END IF;

  -- 4. Lock reservation FOR UPDATE
  SELECT * INTO v_res
  FROM public.subscription_credit_reservations
  WHERE order_id = v_order.id
  FOR UPDATE;

  IF NOT FOUND THEN
    -- If order has no subscription items, simply accept canonical status
    SELECT COALESCE(SUM(credits_used)::INTEGER, 0) INTO v_total_credits_for_order
    FROM public.order_items WHERE order_id = v_order.id AND subscription_id IS NOT NULL;

    IF v_total_credits_for_order = 0 THEN
      UPDATE public.orders SET status = 'confirmed' WHERE id = v_order.id RETURNING * INTO v_order;
      RETURN jsonb_build_object('success', true, 'order_id', v_order.id, 'status', v_order.status, 'already_accepted', false);
    ELSE
      RAISE EXCEPTION '%', jsonb_build_object('code', 'SUBSCRIPTION_RESERVATION_MISSING', 'message', 'Subscription reservation row missing for subscription order.')::text;
    END IF;
  END IF;

  -- 5. Idempotency Check: if reservation is already consumed, return success without double deducting
  IF v_res.status = 'consumed' THEN
    RETURN jsonb_build_object(
      'success', true,
      'order_id', v_order.id,
      'status', v_order.status,
      'already_accepted', true,
      'reservation_status', v_res.status
    );
  END IF;

  -- 6. If reservation is not 'reserved', raise structured error
  IF v_res.status != 'reserved' THEN
    RAISE EXCEPTION '%', jsonb_build_object(
      'code', 'INVALID_RESERVATION_STATUS',
      'message', 'Subscription credit reservation is not in reserved status.',
      'order_id', v_order.id,
      'reservation_status', v_res.status
    )::text;
  END IF;

  -- 7. Lock subscription FOR UPDATE
  SELECT * INTO v_sub FROM public.subscriptions WHERE id = v_res.subscription_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'SUBSCRIPTION_NOT_FOUND', 'message', 'Subscription record not found.')::text;
  END IF;

  -- Validate reservation integrity against order and subscription
  IF v_res.order_id != v_order.id OR v_res.user_id != v_order.user_id THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'RESERVATION_INTEGRITY_MISMATCH', 'message', 'Reservation metadata does not match order.')::text;
  END IF;

  IF v_sub.status != 'active' THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'SUBSCRIPTION_NOT_ACTIVE', 'message', 'Customer subscription is not active.', 'status', v_sub.status)::text;
  END IF;

  IF v_res.service_date < v_sub.start_date OR v_res.service_date > v_sub.end_date THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'SUBSCRIPTION_DATE_INVALID', 'message', 'Order service date falls outside subscription validity duration.')::text;
  END IF;

  IF COALESCE(v_sub.remaining_meals, 0) < v_res.credits THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'INSUFFICIENT_SUBSCRIPTION_CREDITS', 'message', 'Insufficient subscription credits remaining.', 'required', v_res.credits, 'remaining', v_sub.remaining_meals)::text;
  END IF;

  -- 8. Acceptance Daily Limit Calculation WITHOUT double counting:
  -- We check ONLY effectiveDailyUsed + reservation.credits <= subscription.meals_per_day
  IF v_sub.last_usage_date = v_res.service_date THEN
    v_effective_daily_used := COALESCE(v_sub.daily_credits_used, 0);
  ELSE
    v_effective_daily_used := 0;
  END IF;

  IF (v_effective_daily_used + v_res.credits) > COALESCE(v_sub.meals_per_day, 0) THEN
    RAISE EXCEPTION '%', jsonb_build_object(
      'code', 'DAILY_CREDIT_LIMIT_EXCEEDED',
      'message', 'Order exceeds daily subscription credit limit at acceptance.',
      'required', v_res.credits,
      'remaining_today', GREATEST(0, COALESCE(v_sub.meals_per_day, 0) - v_effective_daily_used)
    )::text;
  END IF;

  -- 9. Permanently consume credits on subscription
  UPDATE public.subscriptions
  SET consumed_meals = COALESCE(consumed_meals, 0) + v_res.credits,
      remaining_meals = remaining_meals - v_res.credits,
      daily_credits_used = v_effective_daily_used + v_res.credits,
      last_usage_date = v_res.service_date
  WHERE id = v_sub.id;

  -- 10. Update reservation status to 'consumed'
  UPDATE public.subscription_credit_reservations
  SET status = 'consumed',
      consumed_at = now()
  WHERE id = v_res.id;

  -- 11. Update order status to canonical accepted status ('confirmed')
  UPDATE public.orders
  SET status = 'confirmed'
  WHERE id = v_order.id
  RETURNING * INTO v_order;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order.id,
    'status', v_order.status,
    'already_accepted', false,
    'reservation_status', 'consumed'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.accept_order(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accept_order(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.accept_order(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_order(UUID) TO service_role;

-- ─── 6. COMPREHENSIVE RELEASE PATH FUNCTION ────────────────────────────────────
-- Idempotently moves 'reserved' -> 'released' without mutating subscription balances.
-- Refuses automatic release if status is 'consumed' (requires explicit reversal workflow).
CREATE OR REPLACE FUNCTION public.release_subscription_reservation(
  p_order_id UUID,
  p_reason TEXT DEFAULT 'Order cancelled or expired before acceptance'
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_res RECORD;
BEGIN
  SELECT * INTO v_res
  FROM public.subscription_credit_reservations
  WHERE order_id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_res.status = 'reserved' THEN
    UPDATE public.subscription_credit_reservations
    SET status = 'released',
        released_at = now(),
        release_reason = p_reason
    WHERE id = v_res.id;
    RETURN true;
  ELSIF v_res.status IN ('released', 'legacy_released_unverified') THEN
    -- Idempotent return for already released reservations
    RETURN true;
  ELSIF v_res.status = 'consumed' THEN
    -- Refuse automatic release; accepted orders require explicit ledger reversal
    RAISE EXCEPTION '%', jsonb_build_object(
      'code', 'CANNOT_RELEASE_CONSUMED_RESERVATION',
      'message', 'Cannot automatically release a consumed reservation. Requires explicit reversal workflow.',
      'order_id', p_order_id
    )::text;
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.release_subscription_reservation(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_subscription_reservation(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.release_subscription_reservation(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_subscription_reservation(UUID, TEXT) TO service_role;

-- ─── 7. REFACTOR ALL RELEASE PATHS (UPI EXPIRATION & PROOF REJECTION) ──────────
CREATE OR REPLACE FUNCTION public.expire_unverified_upi_orders()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
BEGIN
  FOR v_order IN
    SELECT *
    FROM orders
    WHERE payment_method = 'upi'
      AND payment_verification_status = 'awaiting_proof'
      AND payment_proof_deadline < now()
      AND status NOT IN ('cancelled', 'delivered', 'picked_up')
      AND payment_status != 'paid'
    FOR UPDATE SKIP LOCKED
  LOOP
    -- Authoritative release of reservation without touching subscription balances
    PERFORM public.release_subscription_reservation(v_order.id, 'UPI payment proof verification expired');

    UPDATE orders
    SET status = 'cancelled',
        payment_verification_status = 'expired'
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

CREATE OR REPLACE FUNCTION public.reject_order_payment(p_proof_id UUID, p_reason TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_proof RECORD;
  v_order RECORD;
BEGIN
  IF p_reason IS NULL OR trim(p_reason) = '' THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'REJECTION_REASON_REQUIRED', 'message', 'Rejection reason is required.')::text;
  END IF;

  SELECT * INTO v_proof FROM payment_proofs WHERE id = p_proof_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'PAYMENT_PROOF_NOT_FOUND', 'message', 'Proof not found.')::text;
  END IF;

  IF NOT is_stall_operator(v_proof.stall_id) THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'UNAUTHORIZED_STALL_ACCESS', 'message', 'Unauthorized.')::text;
  END IF;

  IF v_proof.status != 'pending' THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'PAYMENT_PROOF_NOT_PENDING', 'message', 'Proof is not pending.')::text;
  END IF;

  SELECT * INTO v_order FROM orders WHERE id = v_proof.order_id FOR UPDATE;

  UPDATE payment_proofs
  SET status = 'rejected', rejected_at = now(), rejection_reason = p_reason
  WHERE id = p_proof_id;

  UPDATE orders
  SET payment_verification_status = 'rejected'
  WHERE id = v_proof.order_id;

  INSERT INTO notifications (user_id, type, title, body)
  VALUES (
    v_proof.user_id,
    'order_update',
    'Payment Rejected',
    'Your payment proof for order ' || v_order.order_number || ' was rejected. Reason: ' || p_reason
  );
END;
$$;
