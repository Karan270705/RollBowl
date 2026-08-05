-- ==============================================================================
-- Migration: 051_expire_ended_subscriptions.sql
-- Description:
--   1. Replace active subscription guard in create_subscription_purchase_request
--      to use date-based validity.
--   2. Define expire_ended_subscriptions() to expire subscriptions past end_date.
-- ==============================================================================

-- ─── 1. PATCH LIVE RPC: create_subscription_purchase_request ────────────────────

CREATE OR REPLACE FUNCTION public.create_subscription_purchase_request(p_stall_id uuid, p_plan_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_plan RECORD;
  v_user RECORD;
  v_stall RECORD;
  v_req_id UUID;
  v_resolved_stall_id UUID;
  v_primary_stall_id UUID;
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

  -- 2. Mandatory Stall & Single-Stall Primary Resolution
  --    Validation rules:
  --      - null -> STALL_ID_REQUIRED
  --      - submitted stall does not exist -> STALL_NOT_FOUND
  --      - submitted stall exists but is inactive -> STALL_INACTIVE
  --      - submitted active stall is not configured primary -> STALL_NOT_PRIMARY
  IF p_stall_id IS NULL THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'STALL_ID_REQUIRED', 'message', 'Stall ID is mandatory.')::text;
  END IF;

  SELECT * INTO v_stall FROM public.stalls WHERE id = p_stall_id;
  IF NOT FOUND THEN 
    RAISE EXCEPTION '%', jsonb_build_object('code', 'STALL_NOT_FOUND', 'message', 'Stall not found.')::text; 
  END IF;

  IF v_stall.is_active = false THEN 
    RAISE EXCEPTION '%', jsonb_build_object('code', 'STALL_INACTIVE', 'message', 'Stall is inactive.')::text; 
  END IF;

  -- Authoritative primary stall resolution from active payment configuration
  -- (does not infer from created_at ordering)
  SELECT stall_id INTO v_primary_stall_id
  FROM public.payment_settings
  WHERE is_active = true
  LIMIT 1;

  IF v_primary_stall_id IS NULL THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'PRIMARY_STALL_NOT_CONFIGURED', 'message', 'Primary stall is not configured in payment settings.')::text;
  END IF;

  IF p_stall_id != v_primary_stall_id THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'STALL_NOT_PRIMARY', 'message', 'Submitted stall is not the configured primary stall.')::text;
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
  IF EXISTS (
    SELECT 1
    FROM public.subscriptions
    WHERE user_id = auth.uid()
      AND status = 'active'
      AND start_date <= (now() AT TIME ZONE 'Asia/Kolkata')::date
      AND end_date >= (now() AT TIME ZONE 'Asia/Kolkata')::date
  ) THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'ACTIVE_SUBSCRIPTION_EXISTS', 'message', 'User already has an active subscription.')::text;
  END IF;

  -- 5. Global Pending Request Check (Enforcing 1 pending subscription purchase globally per user)
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
    'base_amount', v_base_amount,
    'convenience_fee_percent', v_fee_percent,
    'convenience_fee', v_fee_amount,
    'expected_amount', v_expected_amount,
    'currency', 'INR',
    'status', 'awaiting_proof'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.create_subscription_purchase_request(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_subscription_purchase_request(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.create_subscription_purchase_request(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_subscription_purchase_request(uuid, uuid) TO authenticated;

-- ─── 2. HELPER: expire_ended_subscriptions ─────────────────────

CREATE OR REPLACE FUNCTION public.expire_ended_subscriptions()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  UPDATE public.subscriptions
  SET 
    status = 'expired',
    updated_at = now()
  WHERE status = 'active'
    AND end_date < (now() AT TIME ZONE 'Asia/Kolkata')::date;
    
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  
  RETURN v_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_ended_subscriptions() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.expire_ended_subscriptions() FROM anon;
REVOKE ALL ON FUNCTION public.expire_ended_subscriptions() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.expire_ended_subscriptions() TO service_role;
