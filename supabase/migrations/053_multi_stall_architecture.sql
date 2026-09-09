-- ============================================================
-- RollBowl Migration 053: Multi-Stall Architecture Isolation
-- ============================================================

-- 1. Create staff_assignments table for multi-stall RBAC
CREATE TABLE IF NOT EXISTS public.staff_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  stall_id UUID NOT NULL REFERENCES public.stalls(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('kitchen', 'stall_operator', 'manager')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, stall_id)
);

ALTER TABLE public.staff_assignments ENABLE ROW LEVEL SECURITY;

-- Customers can only read their own staff assignments, stall operators can read for their stall.
CREATE POLICY staff_assignments_read ON public.staff_assignments
  FOR SELECT USING (
    user_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.stalls WHERE id = staff_assignments.stall_id AND operator_id = auth.uid())
  );

-- 2. Create reliable helper function for checking staff access
CREATE OR REPLACE FUNCTION public.is_staff_of_stall(p_stall_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.staff_assignments
    WHERE stall_id = p_stall_id AND user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.is_staff_of_stall(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_staff_of_stall(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_staff_of_stall(UUID) TO authenticated;

-- 3. Add stall_id to subscriptions (Nullable initially)
ALTER TABLE public.subscriptions 
  ADD COLUMN IF NOT EXISTS stall_id UUID REFERENCES public.stalls(id) ON DELETE RESTRICT;

-- 4. Safe Backfill & Verification Audit
DO $$
DECLARE
  v_sole_stall_id UUID;
  v_all_stalls_count INT;
  v_kitchen_count_total INT;
  v_kitchen_count_assigned INT;
  v_operator_count INT;
  v_sub_total INT;
  v_sub_via_req INT;
  v_sub_via_hist INT;
  v_sub_null INT;
BEGIN
  -- Verify Operator Backfill Safety
  IF EXISTS (SELECT 1 FROM public.stalls WHERE operator_id IS NULL) THEN
    RAISE EXCEPTION 'MIGRATION STOPPED: Found stalls with NULL operator_id. Cannot safely backfill.';
  END IF;

  -- Verify if the system has operated as a strictly single-stall architecture historically
  SELECT count(*) INTO v_all_stalls_count FROM public.stalls;
  IF v_all_stalls_count = 1 THEN
    SELECT id INTO v_sole_stall_id FROM public.stalls LIMIT 1;
  ELSE
    v_sole_stall_id := NULL;
  END IF;

  -- Backfill Operators (Preserve existing relationships, adding explicit NULL check per instructions)
  WITH inserted AS (
    INSERT INTO public.staff_assignments (user_id, stall_id, role)
    SELECT operator_id, id, 'stall_operator' 
    FROM public.stalls
    WHERE operator_id IS NOT NULL
    ON CONFLICT (user_id, stall_id) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_operator_count FROM inserted;

  -- Backfill Kitchen Staff
  SELECT count(*) INTO v_kitchen_count_total FROM public.users WHERE role = 'kitchen';
  IF v_sole_stall_id IS NOT NULL THEN
    WITH inserted AS (
      INSERT INTO public.staff_assignments (user_id, stall_id, role)
      SELECT id, v_sole_stall_id, 'kitchen' FROM public.users WHERE role = 'kitchen'
      ON CONFLICT (user_id, stall_id) DO NOTHING
      RETURNING 1
    )
    SELECT count(*) INTO v_kitchen_count_assigned FROM inserted;
  ELSIF v_kitchen_count_total > 0 THEN
    RAISE EXCEPTION 'MIGRATION STOPPED: % kitchen users exist but cannot be safely assigned because % stalls exist. Manual staff_assignments insertion required before migration.', v_kitchen_count_total, v_all_stalls_count;
  ELSE
    v_kitchen_count_assigned := 0;
  END IF;

  -- Backfill Subscriptions Priority 1: From Purchase Requests
  WITH updated AS (
    UPDATE public.subscriptions s
    SET stall_id = req.stall_id
    FROM public.subscription_purchase_requests req
    WHERE s.id = req.created_subscription_id
      AND s.stall_id IS NULL
    RETURNING 1
  )
  SELECT count(*) INTO v_sub_via_req FROM updated;

  -- Backfill Subscriptions Priority 2: Historical Single Stall Verification
  IF v_sole_stall_id IS NOT NULL THEN
    WITH updated AS (
      UPDATE public.subscriptions
      SET stall_id = v_sole_stall_id
      WHERE stall_id IS NULL
      RETURNING 1
    )
    SELECT count(*) INTO v_sub_via_hist FROM updated;
  ELSE
    v_sub_via_hist := 0;
  END IF;

  -- Compute remaining counts
  SELECT count(*) INTO v_sub_total FROM public.subscriptions;
  SELECT count(*) INTO v_sub_null FROM public.subscriptions WHERE stall_id IS NULL;

  -- Provide EXACT COUNTS for the Migration Audit Trail
  RAISE NOTICE '==================================================';
  RAISE NOTICE '=== MIGRATION 053 AUDIT TRAIL                  ===';
  RAISE NOTICE '==================================================';
  RAISE NOTICE 'Total kitchen users: %', v_kitchen_count_total;
  RAISE NOTICE 'Kitchen users assigned to the existing stall: %', v_kitchen_count_assigned;
  RAISE NOTICE 'Total existing subscriptions: %', v_sub_total;
  RAISE NOTICE 'Subscriptions backfilled through purchase requests: %', v_sub_via_req;
  RAISE NOTICE 'Subscriptions backfilled through verified single-stall historical ownership: %', v_sub_via_hist;
  RAISE NOTICE 'Subscriptions that could not be safely mapped: %', v_sub_null;
  RAISE NOTICE 'Total rows remaining with stall_id IS NULL: %', v_sub_null;
  RAISE NOTICE '==================================================';

  -- STOP if unresolved historical records remain to ensure data safety
  IF v_sub_null > 0 THEN
    RAISE EXCEPTION 'MIGRATION STOPPED: % subscriptions could not be safely mapped. Unresolved historical records exist.', v_sub_null;
  END IF;
END $$;

-- 5. Enforce Data Integrity
ALTER TABLE public.subscriptions ALTER COLUMN stall_id SET NOT NULL;

-- 6. Stall-Specific Unique Indexes
DROP INDEX IF EXISTS idx_subscriptions_one_active_per_user;

DROP INDEX IF EXISTS idx_sub_req_one_pending_per_user;
CREATE UNIQUE INDEX idx_sub_req_one_pending_per_user
  ON public.subscription_purchase_requests(user_id, stall_id)
  WHERE status IN ('awaiting_proof', 'verification_pending');

-- 7. Update RLS Policies (Switch from global to stall-scoped isolation for STAFF ONLY)

-- a. subscriptions
DROP POLICY IF EXISTS subscriptions_ops_select ON public.subscriptions;
CREATE POLICY subscriptions_staff_all ON public.subscriptions
  FOR ALL USING (is_staff_of_stall(stall_id)) WITH CHECK (is_staff_of_stall(stall_id));

-- b. subscription_purchase_requests
DROP POLICY IF EXISTS "Operators can read subscription requests for their stall" ON public.subscription_purchase_requests;
CREATE POLICY sub_req_staff_all ON public.subscription_purchase_requests
  FOR ALL USING (is_staff_of_stall(stall_id)) WITH CHECK (is_staff_of_stall(stall_id));

-- c. orders
DROP POLICY IF EXISTS orders_kitchen_select ON public.orders;
DROP POLICY IF EXISTS orders_kitchen_update ON public.orders;
DROP POLICY IF EXISTS orders_ops_select ON public.orders;
DROP POLICY IF EXISTS orders_ops_update ON public.orders;
CREATE POLICY orders_staff_all ON public.orders
  FOR ALL USING (is_staff_of_stall(stall_id)) WITH CHECK (is_staff_of_stall(stall_id));

-- d. order_items
DROP POLICY IF EXISTS order_items_kitchen_select ON public.order_items;
CREATE POLICY order_items_staff_all ON public.order_items
  FOR ALL USING (EXISTS (
    SELECT 1 FROM public.orders WHERE orders.id = order_items.order_id AND is_staff_of_stall(orders.stall_id)
  )) WITH CHECK (EXISTS (
    SELECT 1 FROM public.orders WHERE orders.id = order_items.order_id AND is_staff_of_stall(orders.stall_id)
  ));

-- e. menu_schedules
DROP POLICY IF EXISTS menu_schedules_ops_all ON public.menu_schedules;
CREATE POLICY menu_schedules_staff_all ON public.menu_schedules
  FOR ALL USING (is_staff_of_stall(stall_id)) WITH CHECK (is_staff_of_stall(stall_id));

-- f. menu_schedule_items
DROP POLICY IF EXISTS menu_schedule_items_ops_all ON public.menu_schedule_items;
CREATE POLICY menu_schedule_items_staff_all ON public.menu_schedule_items
  FOR ALL USING (EXISTS (
    SELECT 1 FROM public.menu_schedules WHERE menu_schedules.id = menu_schedule_items.menu_schedule_id AND is_staff_of_stall(menu_schedules.stall_id)
  )) WITH CHECK (EXISTS (
    SELECT 1 FROM public.menu_schedules WHERE menu_schedules.id = menu_schedule_items.menu_schedule_id AND is_staff_of_stall(menu_schedules.stall_id)
  ));

-- g. inventory_batches
DROP POLICY IF EXISTS "Operators can manage their batches" ON public.inventory_batches;
CREATE POLICY inv_batch_staff_all ON public.inventory_batches
  FOR ALL USING (is_staff_of_stall(stall_id)) WITH CHECK (is_staff_of_stall(stall_id));

-- h. inventory_batch_items
DROP POLICY IF EXISTS "Operators can manage their batch items" ON public.inventory_batch_items;
CREATE POLICY inv_batch_item_staff_all ON public.inventory_batch_items
  FOR ALL USING (EXISTS (
    SELECT 1 FROM public.inventory_batches WHERE inventory_batches.id = inventory_batch_items.inventory_batch_id AND is_staff_of_stall(inventory_batches.stall_id)
  )) WITH CHECK (EXISTS (
    SELECT 1 FROM public.inventory_batches WHERE inventory_batches.id = inventory_batch_items.inventory_batch_id AND is_staff_of_stall(inventory_batches.stall_id)
  ));

-- i. inventory_movements
DROP POLICY IF EXISTS "Operators can manage their movements" ON public.inventory_movements;
CREATE POLICY inv_mov_staff_all ON public.inventory_movements
  FOR ALL USING (EXISTS (
    SELECT 1 FROM public.inventory_batches WHERE inventory_batches.id = inventory_movements.inventory_batch_id AND is_staff_of_stall(inventory_batches.stall_id)
  )) WITH CHECK (EXISTS (
    SELECT 1 FROM public.inventory_batches WHERE inventory_batches.id = inventory_movements.inventory_batch_id AND is_staff_of_stall(inventory_batches.stall_id)
  ));

-- j. payment_settings
DROP POLICY IF EXISTS "Operators manage their payment settings" ON public.payment_settings;
CREATE POLICY payment_settings_staff_all ON public.payment_settings
  FOR ALL USING (is_staff_of_stall(stall_id)) WITH CHECK (is_staff_of_stall(stall_id));
CREATE POLICY payment_settings_customer_select ON public.payment_settings
  FOR SELECT USING (
    is_active = true
    AND EXISTS (SELECT 1 FROM public.stalls WHERE id = payment_settings.stall_id AND is_active = true)
  );

-- k. meals
DROP POLICY IF EXISTS meals_operator_insert ON public.meals;
DROP POLICY IF EXISTS meals_operator_update ON public.meals;
DROP POLICY IF EXISTS meals_operator_delete ON public.meals;

CREATE POLICY meals_staff_insert ON public.meals
  FOR INSERT WITH CHECK (is_staff_of_stall(stall_id));

CREATE POLICY meals_staff_update ON public.meals
  FOR UPDATE USING (is_staff_of_stall(stall_id))
  WITH CHECK (is_staff_of_stall(stall_id));

CREATE POLICY meals_staff_delete ON public.meals
  FOR DELETE USING (is_staff_of_stall(stall_id));


-- 8. RPC Updates
-- a. Clean up old/obsolete function overloads
DROP FUNCTION IF EXISTS public.purchase_subscription(UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS public.create_subscription_purchase_request(UUID);

-- b. Update purchase_subscription (Migration 032 fix)
CREATE OR REPLACE FUNCTION public.purchase_subscription(
  p_user_id UUID,
  p_plan_id UUID,
  p_stall_id UUID,
  p_terms_version TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan record;
  v_new_end_date DATE;
  v_extended_days INT;
  v_sub_id UUID;
  v_start_date DATE;
BEGIN
  -- 1. Must be authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  
  -- 2. Validate stall
  IF NOT EXISTS (SELECT 1 FROM public.stalls WHERE id = p_stall_id AND is_active = true) THEN
    RAISE EXCEPTION 'Stall is inactive or not found';
  END IF;

  -- 3. Only ops/kitchen can skip payment verification and create directly
  IF NOT is_staff_of_stall(p_stall_id) THEN
    RAISE EXCEPTION 'Not authorized to direct purchase subscriptions for this stall';
  END IF;

  -- Lock the user's row to serialize subscription creation and avoid race conditions
  PERFORM 1 FROM public.users WHERE id = p_user_id FOR UPDATE;

  -- 4. Fetch plan and check activity
  SELECT * INTO v_plan FROM public.subscription_plans WHERE id = p_plan_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found';
  END IF;
  IF NOT v_plan.is_active THEN
    RAISE EXCEPTION 'Plan is not active';
  END IF;

  -- 5. Active sub limit (stall-specific dynamic date guard)
  IF EXISTS (
    SELECT 1 FROM public.subscriptions 
    WHERE user_id = p_user_id 
      AND stall_id = p_stall_id 
      AND status = 'active'
      AND start_date <= (now() AT TIME ZONE 'Asia/Kolkata')::date
      AND end_date >= (now() AT TIME ZONE 'Asia/Kolkata')::date
  ) THEN
    RAISE EXCEPTION 'User already has an active subscription at this stall';
  END IF;

  -- 6. Calculate validity
  v_start_date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  SELECT new_end_date, extended_days INTO v_new_end_date, v_extended_days 
  FROM public.calculate_subscription_expiry(v_start_date, v_plan.duration_days, p_stall_id);

  -- 7. Insert Subscription
  INSERT INTO public.subscriptions (
    user_id, stall_id, plan_id, plan_name, status, start_date, end_date, extended_days,
    total_meals, consumed_meals, remaining_meals, meals_per_day, daily_credits_used,
    accepted_terms_version, accepted_terms_at, purchase_price, currency,
    entitlement_credit_costs, entitlement_features
  ) VALUES (
    p_user_id, p_stall_id, p_plan_id, v_plan.name, 'active', v_start_date, v_new_end_date, v_extended_days,
    v_plan.total_meals, 0, v_plan.total_meals, v_plan.meals_per_day, 0,
    p_terms_version, now(), v_plan.price, 'INR',
    v_plan.category_credit_costs, v_plan.features
  ) RETURNING id INTO v_sub_id;

  RETURN v_sub_id;
END;
$$;

-- c. Update create_subscription_purchase_request (Migration 051 fix)
CREATE OR REPLACE FUNCTION public.create_subscription_purchase_request(
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
  v_base_amount NUMERIC(10,2);
  v_fee_percent NUMERIC(5,2);
  v_fee_amount NUMERIC(10,2);
  v_expected_amount NUMERIC(10,2);
BEGIN
  -- 1. Authentication Check
  IF auth.uid() IS NULL THEN 
    RAISE EXCEPTION '%', jsonb_build_object('code', 'UNAUTHORIZED', 'message', 'Not authorized.')::text; 
  END IF;

  SELECT * INTO v_user FROM public.users WHERE id = auth.uid();
  IF NOT FOUND THEN 
    RAISE EXCEPTION '%', jsonb_build_object('code', 'USER_NOT_FOUND', 'message', 'Authenticated user not found.')::text; 
  END IF;

  -- 2. Mandatory Stall & College Authorization Check (Stall scoped)
  IF p_stall_id IS NULL THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'STALL_ID_REQUIRED', 'message', 'Stall ID is mandatory.')::text;
  END IF;

  SELECT * INTO v_stall FROM public.stalls WHERE id = p_stall_id AND is_active = true;
  IF NOT FOUND THEN 
    RAISE EXCEPTION '%', jsonb_build_object('code', 'STALL_NOT_FOUND', 'message', 'Stall not found or inactive.')::text; 
  END IF;

  IF v_user.college_id IS NULL OR v_stall.college_id != v_user.college_id THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'PLAN_NOT_AVAILABLE_FOR_STALL', 'message', 'Stall does not belong to your college.')::text;
  END IF;

  -- Require active payment settings for this stall
  IF NOT EXISTS (SELECT 1 FROM public.payment_settings WHERE stall_id = p_stall_id AND is_active = true) THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'PAYMENT_UNAVAILABLE', 'message', 'Payments are not configured for this stall.')::text;
  END IF;

  -- 3. Plan Verification
  SELECT * INTO v_plan FROM public.subscription_plans WHERE id = p_plan_id AND is_active = true;
  IF NOT FOUND THEN 
    RAISE EXCEPTION '%', jsonb_build_object('code', 'PLAN_NOT_FOUND', 'message', 'Plan not found.')::text; 
  END IF;

  IF v_plan.price <= 0 THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'INVALID_PAYLOAD', 'message', 'Plan price must be > 0.')::text;
  END IF;

  -- 4. Active Subscription Guard (Stall scoped dynamic date guard)
  IF EXISTS (
    SELECT 1 FROM public.subscriptions 
    WHERE user_id = auth.uid() 
      AND stall_id = p_stall_id 
      AND status = 'active'
      AND start_date <= (now() AT TIME ZONE 'Asia/Kolkata')::date
      AND end_date >= (now() AT TIME ZONE 'Asia/Kolkata')::date
  ) THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'ACTIVE_SUBSCRIPTION_EXISTS', 'message', 'User already has an active subscription at this stall.')::text;
  END IF;

  -- 5. Pending Request Check (Stall scoped)
  IF EXISTS (
    SELECT 1 FROM public.subscription_purchase_requests 
    WHERE user_id = auth.uid() AND stall_id = p_stall_id
      AND status IN ('awaiting_proof', 'verification_pending')
  ) THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'SUBSCRIPTION_REQUEST_ALREADY_PENDING', 'message', 'You already have a subscription purchase awaiting completion at this stall.')::text;
  END IF;

  -- 6. Server-Side 2% Convenience Fee Calculation
  v_base_amount := v_plan.price;
  v_fee_percent := 2.00;
  v_fee_amount := ROUND((v_base_amount * v_fee_percent / 100.00)::numeric, 2);
  v_expected_amount := ROUND((v_base_amount + v_fee_amount)::numeric, 2);

  -- 7. Insert Request
  BEGIN
    INSERT INTO public.subscription_purchase_requests (
      user_id, stall_id, plan_id,
      plan_name_snapshot, base_amount_snapshot, convenience_fee_percent_snapshot,
      convenience_fee_snapshot, currency_snapshot,
      total_meals_snapshot, duration_days_snapshot, meals_per_day_snapshot,
      category_credit_costs_snapshot, features_snapshot,
      expected_amount, status
    ) VALUES (
      auth.uid(), p_stall_id, p_plan_id,
      v_plan.name, v_base_amount, v_fee_percent,
      v_fee_amount, 'INR',
      v_plan.total_meals, v_plan.duration_days, v_plan.meals_per_day,
      v_plan.category_credit_costs, v_plan.features,
      v_expected_amount, 'awaiting_proof'
    ) RETURNING id INTO v_req_id;
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION '%', jsonb_build_object(
        'code', 'SUBSCRIPTION_REQUEST_ALREADY_PENDING',
        'message', 'You already have a subscription purchase awaiting completion at this stall.'
      )::text;
  END;

  RETURN jsonb_build_object(
    'request_id', v_req_id,
    'base_amount', v_base_amount,
    'convenience_fee_percent', v_fee_percent,
    'convenience_fee', v_fee_amount,
    'expected_amount', v_expected_amount,
    'currency', 'INR',
    'status', 'awaiting_proof'
  );
END;
$$;

-- d. Update approve_subscription_purchase (Migration 047 fix)
CREATE OR REPLACE FUNCTION public.approve_subscription_purchase(
  p_request_id UUID
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_req RECORD;
  v_proof RECORD;
  v_sub_id UUID;
  v_start_date DATE;
  v_new_end_date DATE;
  v_extended_days INT;
BEGIN
  -- 1. Lock Request Row
  SELECT * INTO v_req FROM public.subscription_purchase_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN 
    RAISE EXCEPTION '%', jsonb_build_object('code', 'SUBSCRIPTION_REQUEST_NOT_FOUND', 'message', 'Request not found.')::text; 
  END IF;
  
  -- 2. Verify Stall Operator/Staff
  IF NOT is_staff_of_stall(v_req.stall_id) THEN 
    RAISE EXCEPTION '%', jsonb_build_object('code', 'UNAUTHORIZED_STALL_ACCESS', 'message', 'Unauthorized.')::text; 
  END IF;

  -- 3. Idempotency & Null Safety
  IF v_req.status = 'approved' THEN 
    IF v_req.created_subscription_id IS NULL THEN
      RAISE EXCEPTION '%', jsonb_build_object('code', 'CORRUPT_APPROVED_REQUEST', 'message', 'Approved request missing created_subscription_id.')::text;
    END IF;
    RETURN v_req.created_subscription_id; 
  END IF;

  -- 4. Require status = verification_pending
  IF v_req.status != 'verification_pending' THEN 
    RAISE EXCEPTION '%', jsonb_build_object('code', 'PAYMENT_PROOF_NOT_PENDING', 'message', 'Request status is not verification_pending.')::text; 
  END IF;

  -- 5. Require current_payment_proof_id
  IF v_req.current_payment_proof_id IS NULL THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'MISSING_PAYMENT_PROOF', 'message', 'Request has no current_payment_proof_id.')::text;
  END IF;

  -- 6. Strict Snapshot Completeness Validation
  IF v_req.plan_name_snapshot IS NULL OR
     v_req.base_amount_snapshot IS NULL OR
     v_req.convenience_fee_percent_snapshot IS NULL OR
     v_req.convenience_fee_snapshot IS NULL OR
     v_req.currency_snapshot IS NULL OR
     v_req.total_meals_snapshot IS NULL OR
     v_req.duration_days_snapshot IS NULL OR
     v_req.meals_per_day_snapshot IS NULL OR
     v_req.category_credit_costs_snapshot IS NULL OR
     v_req.features_snapshot IS NULL THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'REQUEST_SNAPSHOT_INCOMPLETE', 'message', 'Subscription purchase request has incomplete plan snapshot data.')::text;
  END IF;

  -- 7. Validate base + fee = expected amount
  IF ROUND((v_req.base_amount_snapshot + v_req.convenience_fee_snapshot)::numeric, 2) != v_req.expected_amount THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'AMOUNT_MISMATCH', 'message', 'Snapshotted base amount + convenience fee does not equal expected amount.')::text;
  END IF;

  -- 8. Validate fee percent and fee amount are non-negative
  IF v_req.convenience_fee_percent_snapshot < 0 OR v_req.convenience_fee_snapshot < 0 THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'INVALID_PAYLOAD', 'message', 'Fee percentage or fee amount cannot be negative.')::text;
  END IF;

  -- 9 & 10. Lock & Verify Payment Proof
  SELECT * INTO v_proof FROM public.payment_proofs WHERE id = v_req.current_payment_proof_id FOR UPDATE;
  IF NOT FOUND THEN 
    RAISE EXCEPTION '%', jsonb_build_object('code', 'PROOF_NOT_FOUND', 'message', 'Linked payment proof record not found.')::text; 
  END IF;

  -- 11. Validate proof constraints
  IF v_proof.subscription_request_id != v_req.id THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'PROOF_MISMATCH_REQUEST', 'message', 'Proof subscription_request_id mismatch.')::text;
  END IF;
  IF v_proof.payment_context != 'subscription' THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'PROOF_INVALID_CONTEXT', 'message', 'Proof payment_context must be subscription.')::text;
  END IF;
  IF v_proof.status != 'pending' THEN 
    RAISE EXCEPTION '%', jsonb_build_object('code', 'PAYMENT_PROOF_NOT_PENDING', 'message', 'Proof status is not pending.')::text; 
  END IF;
  IF v_proof.expected_amount != v_req.expected_amount THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'AMOUNT_MISMATCH', 'message', 'Proof expected_amount does not match request.')::text;
  END IF;
  IF v_proof.user_id != v_req.user_id OR v_proof.stall_id != v_req.stall_id THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'USER_OR_STALL_MISMATCH', 'message', 'Proof user_id or stall_id mismatch.')::text;
  END IF;

  -- Lock the user's row to serialize subscription creation and avoid race conditions
  PERFORM 1 FROM public.users WHERE id = v_req.user_id FOR UPDATE;

  -- 12. Reject if user already has an active subscription AT THIS STALL dynamically
  IF EXISTS (
    SELECT 1 FROM public.subscriptions 
    WHERE user_id = v_req.user_id 
      AND stall_id = v_req.stall_id 
      AND status = 'active'
      AND start_date <= (now() AT TIME ZONE 'Asia/Kolkata')::date
      AND end_date >= (now() AT TIME ZONE 'Asia/Kolkata')::date
  ) THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'ACTIVE_SUBSCRIPTION_EXISTS', 'message', 'User already has an active subscription at this stall.')::text;
  END IF;

  -- 13 & 14. Approval Start Date
  v_start_date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  SELECT new_end_date, extended_days INTO v_new_end_date, v_extended_days
  FROM public.calculate_subscription_expiry(v_start_date, v_req.duration_days_snapshot, v_req.stall_id);

  -- 15 & 16. Create Subscription
  BEGIN
    INSERT INTO public.subscriptions (
      user_id, stall_id, plan_id, plan_name, status, start_date, end_date, extended_days,
      total_meals, consumed_meals, remaining_meals, meals_per_day, daily_credits_used,
      accepted_terms_version, accepted_terms_at, purchase_price, currency,
      entitlement_credit_costs, entitlement_features
    ) VALUES (
      v_req.user_id, v_req.stall_id, v_req.plan_id, v_req.plan_name_snapshot, 'active', v_start_date, v_new_end_date, v_extended_days,
      v_req.total_meals_snapshot, 0, v_req.total_meals_snapshot, v_req.meals_per_day_snapshot, 0,
      NULL, now(), v_req.base_amount_snapshot, v_req.currency_snapshot,
      v_req.category_credit_costs_snapshot, v_req.features_snapshot
    ) RETURNING id INTO v_sub_id;
  END;

  -- 17. Insert Payment Record
  INSERT INTO public.payment_records (subscription_id, amount, status, method)
  VALUES (v_sub_id, v_req.expected_amount, 'paid', 'upi');

  -- 18. Mark proof verified
  UPDATE public.payment_proofs SET status = 'verified', verified_at = now(), verified_by = auth.uid()
  WHERE id = v_req.current_payment_proof_id;

  -- 19 & 20. Mark request approved and link created_subscription_id
  UPDATE public.subscription_purchase_requests SET 
    status = 'approved', approved_at = now(), approved_by = auth.uid(), created_subscription_id = v_sub_id
  WHERE id = p_request_id;

  -- 21. Notify customer
  INSERT INTO public.notifications (user_id, type, title, body)
  VALUES (v_req.user_id, 'subscription', 'Subscription Approved', 'Your subscription purchase has been verified and approved!');

  -- 22. Return subscription ID
  RETURN v_sub_id;
END;
$$;
