-- ============================================================
-- Migration 054: Admin Multi-Stall Access (SAFE VERSION v4 - Idempotent)
-- ============================================================
-- Uses get_user_role() SECURITY DEFINER (from migration 011) to avoid
-- RLS recursion on the users table.
--
-- Fully idempotent: safe to re-run even if partially applied.
-- user_role enum values: 'customer', 'kitchen', 'stall_operator'
-- ============================================================

BEGIN;

-- ============================================================
-- 1. Add location/contact fields to stalls table
-- ============================================================
ALTER TABLE public.stalls
  ADD COLUMN IF NOT EXISTS location    TEXT,
  ADD COLUMN IF NOT EXISTS address     TEXT,
  ADD COLUMN IF NOT EXISTS phone       TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT;

-- ============================================================
-- 2. Drop ALL old and new policy names first (idempotent)
-- ============================================================

-- orders
DROP POLICY IF EXISTS orders_staff_all              ON public.orders;
DROP POLICY IF EXISTS orders_kitchen_all            ON public.orders;

-- menu_schedules
DROP POLICY IF EXISTS menu_schedules_staff_all      ON public.menu_schedules;
DROP POLICY IF EXISTS menu_schedules_kitchen_all    ON public.menu_schedules;

-- inventory_batches
DROP POLICY IF EXISTS inventory_batches_staff_all   ON public.inventory_batches;
DROP POLICY IF EXISTS inv_batch_staff_all            ON public.inventory_batches;
DROP POLICY IF EXISTS inventory_batches_kitchen_all ON public.inventory_batches;

-- inventory_batch_items
DROP POLICY IF EXISTS inv_batch_item_staff_all          ON public.inventory_batch_items;
DROP POLICY IF EXISTS inventory_batch_items_kitchen_all ON public.inventory_batch_items;

-- inventory_movements
DROP POLICY IF EXISTS inventory_movements_staff_all     ON public.inventory_movements;
DROP POLICY IF EXISTS inv_mov_staff_all                 ON public.inventory_movements;
DROP POLICY IF EXISTS inventory_movements_kitchen_all   ON public.inventory_movements;

-- subscriptions
DROP POLICY IF EXISTS subscriptions_staff_all           ON public.subscriptions;
DROP POLICY IF EXISTS subscriptions_kitchen_all         ON public.subscriptions;

-- subscription_purchase_requests
DROP POLICY IF EXISTS sub_req_staff_all                 ON public.subscription_purchase_requests;
DROP POLICY IF EXISTS sub_req_kitchen_all               ON public.subscription_purchase_requests;

-- payment_proofs
DROP POLICY IF EXISTS payment_proofs_staff_all          ON public.payment_proofs;
DROP POLICY IF EXISTS payment_proofs_kitchen_all        ON public.payment_proofs;

-- meals
DROP POLICY IF EXISTS meals_staff_insert                ON public.meals;
DROP POLICY IF EXISTS meals_staff_update                ON public.meals;
DROP POLICY IF EXISTS meals_staff_delete                ON public.meals;
DROP POLICY IF EXISTS meals_kitchen_all                 ON public.meals;

-- order_items
DROP POLICY IF EXISTS order_items_staff_all             ON public.order_items;
DROP POLICY IF EXISTS order_items_kitchen_all           ON public.order_items;

-- stalls
DROP POLICY IF EXISTS stalls_admin_manage               ON public.stalls;
DROP POLICY IF EXISTS stalls_admin_insert_update        ON public.stalls;
DROP POLICY IF EXISTS stalls_admin_update               ON public.stalls;
DROP POLICY IF EXISTS stalls_kitchen_read               ON public.stalls;
DROP POLICY IF EXISTS stalls_operator_insert            ON public.stalls;
DROP POLICY IF EXISTS stalls_operator_update            ON public.stalls;

-- ============================================================
-- 3. Create new role-based policies using get_user_role()
-- ============================================================

CREATE POLICY orders_kitchen_all ON public.orders
  FOR ALL
  USING (get_user_role() IN ('kitchen', 'stall_operator'))
  WITH CHECK (get_user_role() IN ('kitchen', 'stall_operator'));

CREATE POLICY menu_schedules_kitchen_all ON public.menu_schedules
  FOR ALL
  USING (get_user_role() IN ('kitchen', 'stall_operator'))
  WITH CHECK (get_user_role() IN ('kitchen', 'stall_operator'));

CREATE POLICY inventory_batches_kitchen_all ON public.inventory_batches
  FOR ALL
  USING (get_user_role() IN ('kitchen', 'stall_operator'))
  WITH CHECK (get_user_role() IN ('kitchen', 'stall_operator'));

CREATE POLICY inventory_batch_items_kitchen_all ON public.inventory_batch_items
  FOR ALL
  USING (get_user_role() IN ('kitchen', 'stall_operator'))
  WITH CHECK (get_user_role() IN ('kitchen', 'stall_operator'));

CREATE POLICY inventory_movements_kitchen_all ON public.inventory_movements
  FOR ALL
  USING (get_user_role() IN ('kitchen', 'stall_operator'))
  WITH CHECK (get_user_role() IN ('kitchen', 'stall_operator'));

CREATE POLICY subscriptions_kitchen_all ON public.subscriptions
  FOR ALL
  USING (get_user_role() IN ('kitchen', 'stall_operator'))
  WITH CHECK (get_user_role() IN ('kitchen', 'stall_operator'));

CREATE POLICY sub_req_kitchen_all ON public.subscription_purchase_requests
  FOR ALL
  USING (get_user_role() IN ('kitchen', 'stall_operator'))
  WITH CHECK (get_user_role() IN ('kitchen', 'stall_operator'));

CREATE POLICY payment_proofs_kitchen_all ON public.payment_proofs
  FOR ALL
  USING (get_user_role() IN ('kitchen', 'stall_operator'))
  WITH CHECK (get_user_role() IN ('kitchen', 'stall_operator'));

CREATE POLICY meals_kitchen_all ON public.meals
  FOR ALL
  USING (get_user_role() IN ('kitchen', 'stall_operator'))
  WITH CHECK (get_user_role() IN ('kitchen', 'stall_operator'));

CREATE POLICY order_items_kitchen_all ON public.order_items
  FOR ALL
  USING (get_user_role() IN ('kitchen', 'stall_operator'))
  WITH CHECK (get_user_role() IN ('kitchen', 'stall_operator'));

-- Stalls: read all active, write restricted to stall_operator only
CREATE POLICY stalls_kitchen_read ON public.stalls
  FOR SELECT
  USING (is_active = true AND get_user_role() IN ('kitchen', 'stall_operator'));

CREATE POLICY stalls_operator_insert ON public.stalls
  FOR INSERT
  WITH CHECK (get_user_role() = 'stall_operator');

CREATE POLICY stalls_operator_update ON public.stalls
  FOR UPDATE
  USING    (get_user_role() = 'stall_operator')
  WITH CHECK (get_user_role() = 'stall_operator');

-- NO DELETE policy on stalls: use is_active = false for soft delete

COMMIT;

-- ============================================================
-- Verification queries (run after migration):
--
-- SELECT tablename, policyname, cmd
-- FROM pg_policies
-- WHERE tablename IN ('orders','menu_schedules','inventory_batches','stalls')
-- ORDER BY tablename, policyname;
--
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'stalls'
-- AND column_name IN ('location','address','phone','description');
-- ============================================================
