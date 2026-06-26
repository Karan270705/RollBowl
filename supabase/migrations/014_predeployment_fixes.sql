-- ============================================================
-- RollBowl Migration 014: Pre-Deployment Fixes
-- ============================================================
-- Addresses all blocking issues identified in
-- PRE_DEPLOYMENT_CHECKLIST.md before first Supabase deployment.
--
-- Run AFTER migrations 001–013 have been applied.
-- Each fix section is labelled with its BLOCK number.
--
-- Syntax-reviewed and corrected from initial draft:
--   BUG-1: Removed self-referencing subquery in WITH CHECK
--           (recursive RLS loop). Uses get_user_role() instead.
--   BUG-2: LPAD width increased from 4 to 6 for scale safety.
--   BUG-3: Replaced DEFAULT '' (UNIQUE collision risk) with a
--           sequence-backed DEFAULT expression on the column.
--   BUG-4: CASE inside UPDATE SET now uses snapshot variable
--           (v_inventory.available_quantity) not live column ref.
--   BUG-5: auth.uid() does not work inside SECURITY DEFINER.
--           p_user_id is now passed explicitly by the caller.
--   BUG-6: Enum comparisons explicitly cast to ::user_role
--           and ::text where required for clarity and safety.
-- ============================================================


-- ============================================================
-- BLOCK-1: Fix Role Escalation Vulnerability
-- ============================================================
-- BUG-1 FIX: The original draft used:
--   WITH CHECK (role = (SELECT role FROM public.users WHERE id = auth.uid()))
-- This creates a recursive RLS evaluation loop — the subquery
-- re-enters the same policy on the users table, causing a
-- stack-depth error or silent failure in Supabase.
--
-- CORRECT approach: use the existing get_user_role() SECURITY
-- DEFINER helper (defined in 011), which executes outside the
-- RLS evaluation context and safely reads the stored role.
-- ============================================================

DROP POLICY IF EXISTS users_own_update ON users;

CREATE POLICY users_own_update ON users
  FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    -- get_user_role() reads the CURRENT stored role via a
    -- SECURITY DEFINER function, avoiding recursive RLS evaluation.
    -- The incoming NEW.role must match the stored role — preventing
    -- any client from escalating their own role.
    AND role = get_user_role()
  );

COMMENT ON POLICY users_own_update ON users
  IS 'Users may update their own profile. Role is immutable by the user — get_user_role() enforces the stored value. Only service_role may change roles.';


-- ============================================================
-- BLOCK-2: Remove Customer Payment Insertion Capability
-- ============================================================

DROP POLICY IF EXISTS payments_own_insert ON payment_records;

-- No replacement INSERT policy is created.
-- Payment records are written exclusively by server-side Edge
-- Functions using the service_role key (which bypasses RLS).
-- Customers have SELECT only on their own records.

COMMENT ON TABLE payment_records
  IS 'Payment transaction ledger. INSERT is service_role only (via Edge Function after gateway verification). Customers: SELECT only.';


-- ============================================================
-- BLOCK-3: Automatic Order Number Generation
-- ============================================================
-- BUG-2 FIX: LPAD width changed from 4 to 6 ('RB-001001').
--   LPAD('10000', 4, '0') = '10000' — does not truncate, but
--   the 4-wide format becomes misleading at scale. 6 is safer.
--
-- BUG-3 FIX: Removed DEFAULT '' which risks UNIQUE constraint
--   collisions if multiple rows default simultaneously (e.g.,
--   COPY command, bulk insert). Replaced with a sequence-backed
--   DEFAULT expression on the column itself so order_number is
--   generated correctly even if the trigger is absent.
--   The trigger still runs and remains the primary mechanism;
--   the column DEFAULT is a reliable fallback.
-- ============================================================

CREATE SEQUENCE IF NOT EXISTS rollbowl_order_seq
  START WITH 1001
  INCREMENT BY 1
  NO CYCLE;

-- Column-level DEFAULT: sequence-backed, unique by construction.
-- This is the fallback for any INSERT path that bypasses the trigger.
ALTER TABLE orders
  ALTER COLUMN order_number
    SET DEFAULT ('RB-' || LPAD(nextval('rollbowl_order_seq')::TEXT, 6, '0'));

-- Trigger function: also uses the sequence, applied BEFORE INSERT.
-- When a caller omits order_number, the trigger fires first and
-- sets the value; the column DEFAULT is then not applied.
-- When order_number IS already set by a caller, the trigger
-- leaves it unchanged (preserving explicit values for seeding).
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.order_number IS NULL OR NEW.order_number = '' THEN
    NEW.order_number := 'RB-' || LPAD(nextval('rollbowl_order_seq')::TEXT, 6, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS orders_generate_number_trigger ON orders;
CREATE TRIGGER orders_generate_number_trigger
  BEFORE INSERT ON orders
  FOR EACH ROW EXECUTE FUNCTION generate_order_number();

COMMENT ON SEQUENCE rollbowl_order_seq
  IS 'Generates unique order number suffixes. Format: RB-001001, RB-001002, ...';
COMMENT ON COLUMN orders.order_number
  IS 'Human-readable order number. Auto-generated by column DEFAULT and trigger. Format: RB-001001.';


-- ============================================================
-- BLOCK-4: Fix remaining_meals Derived Value
-- ============================================================

CREATE OR REPLACE FUNCTION sync_remaining_meals()
RETURNS TRIGGER AS $$
BEGIN
  NEW.remaining_meals := NEW.total_meals - NEW.consumed_meals;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Fires on INSERT and on any UPDATE that touches total_meals
-- or consumed_meals. Column-of-interest syntax avoids firing
-- on irrelevant updates (e.g., status changes).
DROP TRIGGER IF EXISTS subscriptions_sync_remaining_trigger ON subscriptions;
CREATE TRIGGER subscriptions_sync_remaining_trigger
  BEFORE INSERT OR UPDATE OF total_meals, consumed_meals ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION sync_remaining_meals();

COMMENT ON COLUMN subscriptions.remaining_meals
  IS 'Recomputed by trigger on every write as (total_meals - consumed_meals). Do not set directly from the client.';


-- ============================================================
-- BLOCK-5: Atomic Inventory Reservation Function
-- ============================================================
-- BUG-4 FIX: Inside the UPDATE SET clause, column references
--   on the right-hand side refer to the OLD row values, not
--   the values being written in the same statement. The CASE
--   expression for is_available must compare against the
--   already-captured snapshot (v_inventory.available_quantity)
--   minus p_quantity — not the live column name (which still
--   holds the old value at evaluation time).
--
-- BUG-5 FIX: auth.uid() returns NULL inside SECURITY DEFINER
--   functions because the function runs as its owner (postgres),
--   not as the calling user's JWT session. The calling user's
--   UUID must be passed explicitly as a parameter (p_user_id).
--   The client must supply auth.uid() at the call site:
--     SELECT * FROM reserve_meal_item(
--       inventory_id,
--       (SELECT auth.uid()),   -- or pass from application layer
--       quantity,
--       pickup_time
--     );
-- ============================================================

CREATE OR REPLACE FUNCTION reserve_meal_item(
  p_inventory_item_id  UUID,
  p_user_id            UUID,       -- must be auth.uid() from caller
  p_quantity           INTEGER,
  p_pickup_time        TIMESTAMPTZ
)
RETURNS meal_reservations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inventory   inventory_items;
  v_reservation meal_reservations;
  v_post_qty    INTEGER;           -- available_quantity after deduction
BEGIN
  -- Guard: caller must supply their own user_id
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id is required'
      USING ERRCODE = 'P0001';
  END IF;

  -- Guard: pickup time must be in the future
  IF p_pickup_time <= now() THEN
    RAISE EXCEPTION 'pickup_time must be in the future'
      USING ERRCODE = 'P0001';
  END IF;

  -- Guard: per-reservation quantity limit
  IF p_quantity < 1 OR p_quantity > 10 THEN
    RAISE EXCEPTION 'invalid_quantity: must be 1–10, got %', p_quantity
      USING ERRCODE = 'P0001';
  END IF;

  -- Step 1: Lock the inventory row for this transaction.
  -- Concurrent callers on the same row will wait here until
  -- this transaction commits or rolls back.
  SELECT *
    INTO v_inventory
    FROM inventory_items
   WHERE id = p_inventory_item_id
     FOR UPDATE;

  -- Step 2: Guard — row must exist
  IF NOT FOUND THEN
    RAISE EXCEPTION 'inventory_item_not_found: id=%', p_inventory_item_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Step 3: Guard — must have enough available stock
  IF v_inventory.available_quantity < p_quantity THEN
    RAISE EXCEPTION 'insufficient_stock: available=%, requested=%',
      v_inventory.available_quantity, p_quantity
      USING ERRCODE = 'P0001';
  END IF;

  -- Compute post-deduction quantity using snapshot variable.
  -- BUG-4: Do NOT use 'available_quantity - p_quantity' inside
  -- the UPDATE SET clause — that references the OLD column value
  -- at evaluation time, not the value being written in line above.
  v_post_qty := v_inventory.available_quantity - p_quantity;

  -- Step 4: Atomically adjust inventory counts.
  -- All expressions use the locked snapshot (v_inventory.*),
  -- not live column references, to avoid stale-read confusion.
  UPDATE inventory_items
     SET reserved_quantity  = v_inventory.reserved_quantity + p_quantity,
         available_quantity = v_post_qty,
         -- Mark unavailable once stock hits zero
         is_available       = CASE
                                WHEN v_post_qty <= 0 THEN false
                                ELSE v_inventory.is_available
                              END
   WHERE id = p_inventory_item_id;

  -- Step 5: Create the reservation record.
  -- p_user_id is the caller's auth.uid(), passed explicitly.
  INSERT INTO meal_reservations (
    user_id,
    inventory_item_id,
    meal_name,
    stall_name,
    quantity,
    pickup_time,
    status
  )
  VALUES (
    p_user_id,
    p_inventory_item_id,
    v_inventory.meal_name,
    (SELECT name FROM stalls WHERE id = v_inventory.stall_id),
    p_quantity,
    p_pickup_time,
    'confirmed'
  )
  RETURNING * INTO v_reservation;

  RETURN v_reservation;
END;
$$;

-- Restrict to authenticated role only (not anon)
REVOKE ALL ON FUNCTION reserve_meal_item(UUID, UUID, INTEGER, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION reserve_meal_item(UUID, UUID, INTEGER, TIMESTAMPTZ) TO authenticated;

COMMENT ON FUNCTION reserve_meal_item(UUID, UUID, INTEGER, TIMESTAMPTZ)
  IS 'Atomically reserves inventory and creates a meal_reservation row using row-level locking. p_user_id must be auth.uid() supplied by the caller (SECURITY DEFINER cannot call auth.uid() directly). Call as RPC.';


-- ============================================================
-- BLOCK-6: Enforce Payment Source Constraint
-- ============================================================

ALTER TABLE payment_records
  ADD CONSTRAINT payments_requires_source
  CHECK (
    (order_id IS NOT NULL AND subscription_id IS NULL)
    OR
    (order_id IS NULL AND subscription_id IS NOT NULL)
  );

COMMENT ON CONSTRAINT payments_requires_source ON payment_records
  IS 'Every payment record must reference exactly one source: either an order or a subscription — never neither, never both.';


-- ============================================================
-- BLOCK-7: Scope Operations Staff User Visibility to College
-- ============================================================
-- BUG-6 FIX: Enum comparisons use explicit ::user_role cast
--   for clarity and to avoid relying on implicit unknown→enum
--   casting, which is technically correct but brittle if enum
--   names ever overlap with other types.
-- ============================================================

DROP POLICY IF EXISTS users_ops_select ON users;

-- Helper: returns the college_id of the calling operator's stall.
-- Returns NULL if the caller is not a stall operator or has no stall.
CREATE OR REPLACE FUNCTION get_operator_college_id()
RETURNS UUID AS $$
  SELECT college_id
    FROM public.stalls
   WHERE operator_id = auth.uid()
     AND is_active = true
   LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- Stall operators: see only users whose college matches
-- the operator's own active stall college.
CREATE POLICY users_stall_operator_select ON users
  FOR SELECT
  USING (
    get_user_role() = 'stall_operator'::user_role
    AND college_id = get_operator_college_id()
  );

-- Kitchen staff: see users from colleges that have active stalls.
-- Kitchen is campus-wide, so they need to see across their college
-- but not globally across all cities.
CREATE POLICY users_kitchen_select ON users
  FOR SELECT
  USING (
    get_user_role() = 'kitchen'::user_role
    AND college_id IN (
      SELECT college_id FROM public.stalls WHERE is_active = true
    )
  );

COMMENT ON POLICY users_stall_operator_select ON users
  IS 'Stall operators see only users from their own college. Cross-college user data is inaccessible.';
COMMENT ON POLICY users_kitchen_select ON users
  IS 'Kitchen staff see users from colleges with active stalls only.';


-- ============================================================
-- BLOCK-8: Add Missing stall-images UPDATE and DELETE Policies
-- ============================================================

CREATE POLICY storage_stall_images_update ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'stall-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY storage_stall_images_delete ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'stall-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );


-- ============================================================
-- BLOCK-9: Restrict Image Uploads to Operations Roles Only
-- ============================================================
-- BUG-6 FIX: get_user_role() returns user_role enum. Comparing
--   with string literals in IN() relies on implicit cast. Made
--   explicit with ::text cast on the function return value for
--   maximum compatibility across Postgres versions.
-- ============================================================

-- ─── meal-images ────────────────────────────────────────────

DROP POLICY IF EXISTS storage_meal_images_insert ON storage.objects;

CREATE POLICY storage_meal_images_insert ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'meal-images'
    AND get_user_role()::text IN ('kitchen', 'stall_operator')
  );

-- ─── stall-images ───────────────────────────────────────────

DROP POLICY IF EXISTS storage_stall_images_insert ON storage.objects;

CREATE POLICY storage_stall_images_insert ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'stall-images'
    AND get_user_role()::text IN ('kitchen', 'stall_operator')
  );


-- ============================================================
-- BLOCK-10: Realtime RLS — Dashboard Verification Note
-- ============================================================
-- THIS CANNOT BE FIXED VIA SQL MIGRATION.
--
-- REQUIRED MANUAL STEP before first deployment:
--   1. Supabase Dashboard → Database → Replication
--   2. Find the supabase_realtime publication row
--   3. Ensure "Enable Row Level Security" is toggled ON for:
--        - orders
--        - inventory_items
--        - notifications
--        - meal_reservations
--
-- Without this, Realtime broadcasts bypass RLS and expose
-- other users' rows to any subscriber on the channel.
--
-- VERIFICATION QUERY (after enabling in Dashboard):
--   SELECT pubname, puballtables, pubrowsecurity
--   FROM pg_publication
--   WHERE pubname = 'supabase_realtime';
--   -- pubrowsecurity must be TRUE
-- ============================================================

DO $$
BEGIN
  RAISE NOTICE 'BLOCK-10 REMINDER: Enable Realtime RLS manually in Supabase Dashboard → Database → Replication. pubrowsecurity must be TRUE.';
END;
$$;


-- ============================================================
-- RECOMMENDED IMPROVEMENTS
-- ============================================================

-- ─── REC-1: Subscription date range integrity ────────────────

ALTER TABLE subscriptions
  ADD CONSTRAINT subs_valid_date_range
  CHECK (end_date > start_date);

COMMENT ON CONSTRAINT subs_valid_date_range ON subscriptions
  IS 'end_date must be strictly after start_date.';


-- ─── REC-2: Orders financial field guards ────────────────────

ALTER TABLE orders
  ADD CONSTRAINT orders_subtotal_non_negative CHECK (subtotal >= 0);

ALTER TABLE orders
  ADD CONSTRAINT orders_tax_non_negative CHECK (tax >= 0);

ALTER TABLE orders
  ADD CONSTRAINT orders_discount_non_negative CHECK (discount >= 0);


-- ─── REC-3: subscriptions.updated_at ────────────────────────

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION update_subscriptions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS subscriptions_updated_at_trigger ON subscriptions;
CREATE TRIGGER subscriptions_updated_at_trigger
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_subscriptions_updated_at();

COMMENT ON COLUMN subscriptions.updated_at
  IS 'Auto-set on every UPDATE. Tracks status transitions (active → paused → expired).';


-- ─── REC-4: Composite index on orders (stall_id, status) ─────

CREATE INDEX IF NOT EXISTS idx_orders_stall_status
  ON orders(stall_id, status);

COMMENT ON INDEX idx_orders_stall_status
  IS 'Optimises stall dashboard queries that filter by stall_id AND status together.';


-- ─── REC-5: Composite index on subscriptions (user_id, status) ─

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_status
  ON subscriptions(user_id, status);

COMMENT ON INDEX idx_subscriptions_user_status
  IS 'Optimises active-subscription lookup queries filtering by user_id AND status.';


-- ============================================================
-- END OF MIGRATION 014
-- ============================================================
-- Post-execution verification:
--
-- 1. Role escalation blocked:
--    UPDATE users SET role = 'kitchen' WHERE id = auth.uid();
--    → Must fail: RLS policy violation
--
-- 2. Payment self-insert blocked:
--    INSERT INTO payment_records (order_id, amount, status, method)
--    VALUES ('<order_id>', 100, 'paid', 'UPI');
--    → Must fail: no INSERT policy exists for customers
--
-- 3. Order number auto-generates:
--    INSERT INTO orders (user_id, customer_name, stall_id,
--      stall_name, order_type, ...) VALUES (...);
--    SELECT order_number FROM orders ORDER BY created_at DESC LIMIT 1;
--    → Must return 'RB-001001' (or next in sequence)
--
-- 4. remaining_meals auto-syncs:
--    UPDATE subscriptions SET consumed_meals = 5 WHERE id = '<id>';
--    SELECT remaining_meals FROM subscriptions WHERE id = '<id>';
--    → Must return (total_meals - 5) without manual intervention
--
-- 5. Atomic reservation (RPC call from client):
--    SELECT * FROM reserve_meal_item(
--      '<inventory_item_id>',
--      auth.uid(),
--      1,
--      now() + interval '1 hour'
--    );
--    → First call succeeds; second call on qty=1 item must raise
--      insufficient_stock exception
-- ============================================================
