-- ============================================================
-- RollBowl Migration 047: Subscription Convenience Fee, Entitlements & Integrity
-- ============================================================

-- ─── 0. Pre-Execution Diagnostic Queries ────────────────────
-- A. Duplicate active subscriptions:
-- SELECT user_id, COUNT(*) AS active_count, array_agg(id ORDER BY created_at) AS subscription_ids FROM public.subscriptions WHERE status = 'active' GROUP BY user_id HAVING COUNT(*) > 1;
--
-- B. Duplicate pending purchase requests:
-- SELECT user_id, COUNT(*) AS pending_count, array_agg(id ORDER BY created_at) AS request_ids FROM public.subscription_purchase_requests WHERE status IN ('awaiting_proof', 'verification_pending') GROUP BY user_id HAVING COUNT(*) > 1;
--
-- C. Orphaned plan references:
-- SELECT r.id, r.user_id, r.plan_id, r.status FROM public.subscription_purchase_requests r LEFT JOIN public.subscription_plans p ON p.id = r.plan_id WHERE p.id IS NULL;

-- ─── 1. Add Immutable Request Snapshot Columns ──────────────
ALTER TABLE public.subscription_purchase_requests
  ADD COLUMN IF NOT EXISTS plan_name_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS base_amount_snapshot NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS convenience_fee_percent_snapshot NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS convenience_fee_snapshot NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS currency_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS total_meals_snapshot INTEGER,
  ADD COLUMN IF NOT EXISTS duration_days_snapshot INTEGER,
  ADD COLUMN IF NOT EXISTS meals_per_day_snapshot INTEGER,
  ADD COLUMN IF NOT EXISTS category_credit_costs_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS features_snapshot TEXT[];

-- ─── 2. Add Activated Subscription Entitlement Columns ──────
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS entitlement_credit_costs JSONB,
  ADD COLUMN IF NOT EXISTS entitlement_features TEXT[];

-- ─── 3. Historical Backfill ─────────────────────────────────
UPDATE public.subscription_purchase_requests r
SET
  plan_name_snapshot               = COALESCE(r.plan_name_snapshot, p.name),
  base_amount_snapshot             = COALESCE(r.base_amount_snapshot, r.expected_amount),
  convenience_fee_percent_snapshot = COALESCE(r.convenience_fee_percent_snapshot, 0.00),
  convenience_fee_snapshot         = COALESCE(r.convenience_fee_snapshot, 0.00),
  currency_snapshot                = COALESCE(r.currency_snapshot, 'INR'),
  total_meals_snapshot             = COALESCE(r.total_meals_snapshot, p.total_meals),
  duration_days_snapshot           = COALESCE(r.duration_days_snapshot, p.duration_days),
  meals_per_day_snapshot           = COALESCE(r.meals_per_day_snapshot, p.meals_per_day),
  category_credit_costs_snapshot   = COALESCE(r.category_credit_costs_snapshot, p.category_credit_costs),
  features_snapshot                = COALESCE(r.features_snapshot, p.features)
FROM public.subscription_plans p
WHERE r.plan_id = p.id
  AND (
    r.plan_name_snapshot IS NULL OR
    r.base_amount_snapshot IS NULL OR
    r.convenience_fee_percent_snapshot IS NULL OR
    r.convenience_fee_snapshot IS NULL OR
    r.currency_snapshot IS NULL OR
    r.total_meals_snapshot IS NULL OR
    r.duration_days_snapshot IS NULL OR
    r.meals_per_day_snapshot IS NULL OR
    r.category_credit_costs_snapshot IS NULL OR
    r.features_snapshot IS NULL
  );

UPDATE public.subscriptions s
SET
  entitlement_credit_costs = COALESCE(s.entitlement_credit_costs, p.category_credit_costs),
  entitlement_features     = COALESCE(s.entitlement_features, p.features)
FROM public.subscription_plans p
WHERE s.plan_id = p.id
  AND (s.entitlement_credit_costs IS NULL OR s.entitlement_features IS NULL);

-- ─── 4. Post-Backfill Diagnostic & Safe NOT NULL Application ──
DO $$
DECLARE
  v_incomplete INT;
BEGIN
  SELECT count(*) INTO v_incomplete
  FROM public.subscription_purchase_requests
  WHERE plan_name_snapshot IS NULL
     OR base_amount_snapshot IS NULL
     OR convenience_fee_percent_snapshot IS NULL
     OR convenience_fee_snapshot IS NULL
     OR currency_snapshot IS NULL
     OR total_meals_snapshot IS NULL
     OR duration_days_snapshot IS NULL
     OR meals_per_day_snapshot IS NULL
     OR category_credit_costs_snapshot IS NULL
     OR features_snapshot IS NULL;

  IF v_incomplete > 0 THEN
    RAISE EXCEPTION 'Cannot apply NOT NULL constraints: % incomplete rows remain in subscription_purchase_requests.', v_incomplete;
  END IF;

  ALTER TABLE public.subscription_purchase_requests
    ALTER COLUMN plan_name_snapshot SET NOT NULL,
    ALTER COLUMN base_amount_snapshot SET NOT NULL,
    ALTER COLUMN convenience_fee_percent_snapshot SET NOT NULL,
    ALTER COLUMN convenience_fee_snapshot SET NOT NULL,
    ALTER COLUMN currency_snapshot SET NOT NULL,
    ALTER COLUMN total_meals_snapshot SET NOT NULL,
    ALTER COLUMN duration_days_snapshot SET NOT NULL,
    ALTER COLUMN meals_per_day_snapshot SET NOT NULL,
    ALTER COLUMN category_credit_costs_snapshot SET NOT NULL,
    ALTER COLUMN features_snapshot SET NOT NULL;
END $$;

-- ─── 5. Schema-Scoped Safe Financial Check Constraints ──────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'chk_sub_req_plan_name_not_empty' 
      AND conrelid = 'public.subscription_purchase_requests'::regclass
  ) THEN
    ALTER TABLE public.subscription_purchase_requests
      ADD CONSTRAINT chk_sub_req_plan_name_not_empty CHECK (length(trim(plan_name_snapshot)) > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'chk_sub_req_base_amount_positive' 
      AND conrelid = 'public.subscription_purchase_requests'::regclass
  ) THEN
    ALTER TABLE public.subscription_purchase_requests
      ADD CONSTRAINT chk_sub_req_base_amount_positive CHECK (base_amount_snapshot > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'chk_sub_req_fee_percent_non_negative' 
      AND conrelid = 'public.subscription_purchase_requests'::regclass
  ) THEN
    ALTER TABLE public.subscription_purchase_requests
      ADD CONSTRAINT chk_sub_req_fee_percent_non_negative CHECK (convenience_fee_percent_snapshot >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'chk_sub_req_convenience_fee_non_negative' 
      AND conrelid = 'public.subscription_purchase_requests'::regclass
  ) THEN
    ALTER TABLE public.subscription_purchase_requests
      ADD CONSTRAINT chk_sub_req_convenience_fee_non_negative CHECK (convenience_fee_snapshot >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'chk_sub_req_expected_amount_positive' 
      AND conrelid = 'public.subscription_purchase_requests'::regclass
  ) THEN
    ALTER TABLE public.subscription_purchase_requests
      ADD CONSTRAINT chk_sub_req_expected_amount_positive CHECK (expected_amount > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'chk_sub_req_currency_not_empty' 
      AND conrelid = 'public.subscription_purchase_requests'::regclass
  ) THEN
    ALTER TABLE public.subscription_purchase_requests
      ADD CONSTRAINT chk_sub_req_currency_not_empty CHECK (length(trim(currency_snapshot)) > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'chk_sub_req_total_meals_positive' 
      AND conrelid = 'public.subscription_purchase_requests'::regclass
  ) THEN
    ALTER TABLE public.subscription_purchase_requests
      ADD CONSTRAINT chk_sub_req_total_meals_positive CHECK (total_meals_snapshot > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'chk_sub_req_duration_days_positive' 
      AND conrelid = 'public.subscription_purchase_requests'::regclass
  ) THEN
    ALTER TABLE public.subscription_purchase_requests
      ADD CONSTRAINT chk_sub_req_duration_days_positive CHECK (duration_days_snapshot > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'chk_sub_req_meals_per_day_positive' 
      AND conrelid = 'public.subscription_purchase_requests'::regclass
  ) THEN
    ALTER TABLE public.subscription_purchase_requests
      ADD CONSTRAINT chk_sub_req_meals_per_day_positive CHECK (meals_per_day_snapshot > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'chk_sub_req_amount_sum_consistency' 
      AND conrelid = 'public.subscription_purchase_requests'::regclass
  ) THEN
    ALTER TABLE public.subscription_purchase_requests
      ADD CONSTRAINT chk_sub_req_amount_sum_consistency CHECK (
        ROUND((base_amount_snapshot + convenience_fee_snapshot)::numeric, 2) = expected_amount
      );
  END IF;
END $$;

-- ─── 6. Unique Indexes ──────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_one_active_per_user
  ON public.subscriptions(user_id)
  WHERE status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS idx_sub_req_one_pending_per_user
  ON public.subscription_purchase_requests(user_id)
  WHERE status IN ('awaiting_proof', 'verification_pending');

-- ─── 7. CREATE OR REPLACE FUNCTION create_subscription_purchase_request
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
  v_resolved_stall_id UUID;
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

  -- 2. Mandatory Stall & College Authorization Check
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

  v_resolved_stall_id := v_stall.id;

  -- 3. Plan Verification
  SELECT * INTO v_plan FROM public.subscription_plans WHERE id = p_plan_id AND is_active = true;
  IF NOT FOUND THEN 
    RAISE EXCEPTION '%', jsonb_build_object('code', 'PLAN_NOT_FOUND', 'message', 'Plan not found.')::text; 
  END IF;

  IF v_plan.price <= 0 THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'INVALID_PAYLOAD', 'message', 'Plan price must be > 0.')::text;
  END IF;

  -- 4. Active Subscription Guard
  IF EXISTS (SELECT 1 FROM public.subscriptions WHERE user_id = auth.uid() AND status = 'active') THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'ACTIVE_SUBSCRIPTION_EXISTS', 'message', 'User already has an active subscription.')::text;
  END IF;

  -- 5. Global Pending Request Check
  IF EXISTS (
    SELECT 1 FROM public.subscription_purchase_requests 
    WHERE user_id = auth.uid() 
      AND status IN ('awaiting_proof', 'verification_pending')
  ) THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'SUBSCRIPTION_REQUEST_ALREADY_PENDING', 'message', 'You already have a subscription purchase awaiting completion or verification.')::text;
  END IF;

  -- 6. Server-Side 2% Convenience Fee Calculation
  v_base_amount := v_plan.price;
  v_fee_percent := 2.00;
  v_fee_amount := ROUND((v_base_amount * v_fee_percent / 100.00)::numeric, 2);
  v_expected_amount := ROUND((v_base_amount + v_fee_amount)::numeric, 2);

  -- 7. Insert Request with Immutable Snapshots & Unique Violation Guard
  BEGIN
    INSERT INTO public.subscription_purchase_requests (
      user_id, stall_id, plan_id,
      plan_name_snapshot, base_amount_snapshot, convenience_fee_percent_snapshot,
      convenience_fee_snapshot, currency_snapshot,
      total_meals_snapshot, duration_days_snapshot, meals_per_day_snapshot,
      category_credit_costs_snapshot, features_snapshot,
      expected_amount, status
    ) VALUES (
      auth.uid(), v_resolved_stall_id, p_plan_id,
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
        'message', 'You already have a subscription purchase awaiting completion or verification.'
      )::text;
  END;

  RETURN jsonb_build_object(
    'request_id', v_req_id,
    'plan_name', v_plan.name,
    'base_amount', v_base_amount,
    'convenience_fee_percent', v_fee_percent,
    'convenience_fee', v_fee_amount,
    'expected_amount', v_expected_amount,
    'currency', 'INR',
    'total_meals', v_plan.total_meals,
    'duration_days', v_plan.duration_days,
    'meals_per_day', v_plan.meals_per_day,
    'category_credit_costs', v_plan.category_credit_costs,
    'features', v_plan.features
  );
END;
$$;

-- ─── 8. CREATE OR REPLACE FUNCTION approve_subscription_purchase
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
  
  -- 2. Verify Stall Operator
  IF NOT is_stall_operator(v_req.stall_id) THEN 
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

  -- 6. Strict Snapshot Completeness Validation (Zero Invented Fallbacks)
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

  -- 9 & 10. Lock & Verify Payment Proof (handle NOT FOUND)
  SELECT * INTO v_proof FROM public.payment_proofs WHERE id = v_req.current_payment_proof_id FOR UPDATE;
  IF NOT FOUND THEN 
    RAISE EXCEPTION '%', jsonb_build_object('code', 'PROOF_NOT_FOUND', 'message', 'Linked payment proof record not found.')::text; 
  END IF;

  -- 11. Validate proof ownership, context, status, and amount
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

  -- 12. Reject if user already has an active subscription
  IF EXISTS (SELECT 1 FROM public.subscriptions WHERE user_id = v_req.user_id AND status = 'active') THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'ACTIVE_SUBSCRIPTION_EXISTS', 'message', 'User already has an active subscription.')::text;
  END IF;

  -- 13 & 14. IST Approval Start Date & Inclusive Validity via Snapshot
  v_start_date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  SELECT new_end_date, extended_days INTO v_new_end_date, v_extended_days
  FROM public.calculate_subscription_expiry(v_start_date, v_req.duration_days_snapshot, v_req.stall_id);

  -- 15 & 16. Create Subscription Using Strictly Validated Snapshots & Unique Violation Guard
  BEGIN
    INSERT INTO public.subscriptions (
      user_id, plan_id, plan_name, status, start_date, end_date, extended_days,
      total_meals, consumed_meals, remaining_meals, meals_per_day, daily_credits_used,
      accepted_terms_version, accepted_terms_at, purchase_price, currency,
      entitlement_credit_costs, entitlement_features
    ) VALUES (
      v_req.user_id, v_req.plan_id, v_req.plan_name_snapshot, 'active', v_start_date, v_new_end_date, v_extended_days,
      v_req.total_meals_snapshot, 0, v_req.total_meals_snapshot, v_req.meals_per_day_snapshot, 0,
      NULL, now(), v_req.base_amount_snapshot, v_req.currency_snapshot,
      v_req.category_credit_costs_snapshot, v_req.features_snapshot
    ) RETURNING id INTO v_sub_id;
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION '%', jsonb_build_object(
        'code', 'ACTIVE_SUBSCRIPTION_EXISTS',
        'message', 'User already has an active subscription.'
      )::text;
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

-- ─── 9. Update place_order to use immutable entitlement fields
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

  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'UNAUTHORIZED', 'message', 'User must be authenticated.')::text;
  END IF;

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
      RAISE EXCEPTION '%', jsonb_build_object('code', 'INVALID_ITEMS', 'message', 'Missing quantity field.')::text;
    END IF;

    BEGIN
      v_qty_numeric := (v_i->>'quantity')::NUMERIC;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION '%', jsonb_build_object('code', 'INVALID_ITEMS', 'message', 'Quantity format is invalid.')::text;
    END;

    IF v_qty_numeric % 1 != 0 OR v_qty_numeric <= 0 OR v_qty_numeric > 100 THEN
      RAISE EXCEPTION '%', jsonb_build_object('code', 'INVALID_ITEMS', 'message', 'Quantity must be a positive integer between 1 and 100.')::text;
    END IF;
  END LOOP;

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
  ELSE
    v_client_batch_id := NULL;
  END IF;

  IF (p_payload ? 'subscriptionId') AND p_payload->>'subscriptionId' IS NOT NULL THEN
    IF NOT (p_payload->>'subscriptionId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') THEN
      RAISE EXCEPTION '%', jsonb_build_object('code', 'INVALID_PAYLOAD', 'message', 'Invalid subscriptionId format.')::text;
    END IF;
    v_client_sub_id := (p_payload->>'subscriptionId')::UUID;
  ELSE
    v_client_sub_id := NULL;
  END IF;

  v_expected_pickup_slot := p_payload->>'expectedPickupSlot';
  IF v_expected_pickup_slot IS NULL OR btrim(v_expected_pickup_slot) = '' THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'INVALID_PAYLOAD', 'message', 'expectedPickupSlot is required.')::text;
  END IF;

  IF NOT (v_expected_pickup_slot ~ '^(0?[1-9]|1[0-2]):[0-5][0-9]\s([AP]M)\s-\s(0?[1-9]|1[0-2]):[0-5][0-9]\s([AP]M)$') THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'INVALID_PAYLOAD', 'message', 'expectedPickupSlot must follow standard format HH:MM AM - HH:MM PM.')::text;
  END IF;

  BEGIN
    v_parsed_slot_start := to_timestamp(split_part(v_expected_pickup_slot, ' - ', 1), 'HH12:MI AM')::time;
    v_parsed_slot_end := to_timestamp(split_part(v_expected_pickup_slot, ' - ', 2), 'HH12:MI AM')::time;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'INVALID_PAYLOAD', 'message', 'expectedPickupSlot contains invalid time values.')::text;
  END;

  IF v_parsed_slot_end <= v_parsed_slot_start THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'INVALID_PAYLOAD', 'message', 'expectedPickupSlot end time must be after start time.')::text;
  END IF;

  v_payment_method := COALESCE(p_payload->>'paymentMethod', 'cash');
  v_notes := COALESCE(p_payload->>'notes', '');
  v_items := p_payload->'items';

  IF jsonb_array_length(v_items) = 0 THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'INVALID_ITEMS', 'message', 'Order must contain at least one item.')::text;
  END IF;

  -- 3. RESOLVE & LOCK BATCH (LOCK 1 - highest lock order)
  IF v_pickup_date = (now() AT TIME ZONE 'Asia/Kolkata')::DATE THEN
    SELECT * INTO v_batch 
    FROM inventory_batches 
    WHERE stall_id = v_stall_record.id 
      AND batch_date = v_pickup_date 
      AND status = 'active'
    FOR UPDATE;

    IF FOUND THEN
      v_resolved_batch_id := v_batch.id;
    ELSIF v_client_batch_id IS NOT NULL THEN
      RAISE EXCEPTION '%', jsonb_build_object('code', 'BATCH_NOT_ACTIVE', 'message', 'The specified inventory batch is no longer active.')::text;
    END IF;
  ELSE
    IF v_client_batch_id IS NOT NULL THEN
      RAISE EXCEPTION '%', jsonb_build_object('code', 'INVALID_PAYLOAD', 'message', 'Cannot specify inventoryBatchId for future pre-orders.')::text;
    END IF;
  END IF;

  -- PRE-AGGREGATION AND CATALOG VALIDATION
  SELECT 
    bool_or(m.id IS NULL) AS missing_meal,
    bool_or(a.total_qty <= 0 OR a.paid_qty < 0 OR a.sub_qty < 0 OR a.total_qty != (a.paid_qty + a.sub_qty)) AS invalid_aggregate,
    COALESCE(jsonb_agg(
      jsonb_build_object(
        'meal_id', a.meal_id,
        'paid_qty', a.paid_qty,
        'sub_qty', a.sub_qty,
        'total_qty', a.total_qty,
        'meal_name', m.name,
        'price', m.price,
        'is_available', m.is_available,
        'category', m.category
      ) ORDER BY a.meal_id
    ), '[]'::jsonb) AS trusted_items
  INTO 
    v_has_missing_meal,
    v_has_invalid_aggregate,
    v_trusted_items
  FROM (
    SELECT 
      (elem->>'mealId')::UUID AS meal_id,
      SUM(CASE WHEN COALESCE((elem->>'isSubscriptionItem')::BOOLEAN, false) = true THEN 0 ELSE (elem->>'quantity')::INTEGER END) AS paid_qty,
      SUM(CASE WHEN COALESCE((elem->>'isSubscriptionItem')::BOOLEAN, false) = true THEN (elem->>'quantity')::INTEGER ELSE 0 END) AS sub_qty,
      SUM((elem->>'quantity')::INTEGER) AS total_qty
    FROM jsonb_array_elements(v_items) AS elem
    GROUP BY (elem->>'mealId')::UUID
  ) a
  LEFT JOIN meals m ON m.id = a.meal_id;

  IF v_has_missing_meal THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'MEAL_NOT_FOUND', 'message', 'One or more items reference invalid meals.')::text;
  END IF;

  IF v_has_invalid_aggregate THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'INVALID_ITEMS', 'message', 'Invalid item quantities.')::text;
  END IF;

  -- 4. SUBSCRIPTION LOCK & VALIDATE (LOCK 2)
  -- Decoupled from mutable subscription_plans by reading immutable entitlement columns
  IF v_client_sub_id IS NOT NULL THEN
    SELECT s.*, 
           s.entitlement_credit_costs AS category_credit_costs,
           s.meals_per_day INTO v_sub
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

    UPDATE public.subscriptions
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

-- ─── 10. Re-apply Secure Execution Privileges ───────────────
REVOKE ALL ON FUNCTION public.create_subscription_purchase_request(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_subscription_purchase_request(UUID, UUID) FROM anon;
REVOKE ALL ON FUNCTION public.create_subscription_purchase_request(UUID, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_subscription_purchase_request(UUID, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.approve_subscription_purchase(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.approve_subscription_purchase(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.approve_subscription_purchase(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.approve_subscription_purchase(UUID) TO authenticated;
