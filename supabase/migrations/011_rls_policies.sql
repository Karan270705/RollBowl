-- ============================================================
-- RollBowl Migration 011: Row Level Security & Policies
-- ============================================================
-- Enable RLS on ALL tables. Define fine-grained access rules.
--
-- Policy naming convention:
--   {table}_{role}_{action}  e.g. users_own_select
--
-- Helper: get current user's role from public.users
-- ============================================================

-- ─── Helper Function ────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_user_role()
RETURNS user_role AS $$
  SELECT role FROM public.users WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ─── Helper: Check if user is a stall operator for a given stall ──

CREATE OR REPLACE FUNCTION is_stall_operator(p_stall_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.stalls
    WHERE id = p_stall_id AND operator_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;


-- ═══════════════════════════════════════════════════════════
-- ENABLE RLS ON ALL TABLES
-- ═══════════════════════════════════════════════════════════

ALTER TABLE cities ENABLE ROW LEVEL SECURITY;
ALTER TABLE universities ENABLE ROW LEVEL SECURITY;
ALTER TABLE colleges ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE stalls ENABLE ROW LEVEL SECURITY;
ALTER TABLE meals ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE meal_histories ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE meal_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_records ENABLE ROW LEVEL SECURITY;


-- ═══════════════════════════════════════════════════════════
-- GEOGRAPHY (cities, universities, colleges)
-- Public read for all authenticated users.
-- ═══════════════════════════════════════════════════════════

CREATE POLICY cities_read ON cities
  FOR SELECT USING (true);

CREATE POLICY universities_read ON universities
  FOR SELECT USING (true);

CREATE POLICY colleges_read ON colleges
  FOR SELECT USING (true);


-- ═══════════════════════════════════════════════════════════
-- USERS
-- Users can read and update their own profile only.
-- ═══════════════════════════════════════════════════════════

CREATE POLICY users_own_select ON users
  FOR SELECT USING (id = auth.uid());

CREATE POLICY users_own_update ON users
  FOR UPDATE USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Operations users can read customer profiles (for order fulfillment)
CREATE POLICY users_ops_select ON users
  FOR SELECT USING (
    get_user_role() IN ('kitchen', 'stall_operator')
  );


-- ═══════════════════════════════════════════════════════════
-- ADDRESSES
-- Users manage only their own addresses.
-- ═══════════════════════════════════════════════════════════

CREATE POLICY addresses_own_select ON addresses
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY addresses_own_insert ON addresses
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY addresses_own_update ON addresses
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY addresses_own_delete ON addresses
  FOR DELETE USING (user_id = auth.uid());


-- ═══════════════════════════════════════════════════════════
-- STALLS
-- Public read. Operators can update their own stalls.
-- ═══════════════════════════════════════════════════════════

CREATE POLICY stalls_read ON stalls
  FOR SELECT USING (true);

CREATE POLICY stalls_operator_update ON stalls
  FOR UPDATE USING (operator_id = auth.uid())
  WITH CHECK (operator_id = auth.uid());


-- ═══════════════════════════════════════════════════════════
-- MEALS
-- Public read. Operators can manage meals in their stalls.
-- ═══════════════════════════════════════════════════════════

CREATE POLICY meals_read ON meals
  FOR SELECT USING (true);

CREATE POLICY meals_operator_insert ON meals
  FOR INSERT WITH CHECK (is_stall_operator(stall_id));

CREATE POLICY meals_operator_update ON meals
  FOR UPDATE USING (is_stall_operator(stall_id))
  WITH CHECK (is_stall_operator(stall_id));

CREATE POLICY meals_operator_delete ON meals
  FOR DELETE USING (is_stall_operator(stall_id));


-- ═══════════════════════════════════════════════════════════
-- ORDERS
-- Customers: read/create own orders.
-- Operators: read/update orders for their stalls.
-- ═══════════════════════════════════════════════════════════

CREATE POLICY orders_customer_select ON orders
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY orders_customer_insert ON orders
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY orders_ops_select ON orders
  FOR SELECT USING (is_stall_operator(stall_id));

CREATE POLICY orders_ops_update ON orders
  FOR UPDATE USING (is_stall_operator(stall_id))
  WITH CHECK (is_stall_operator(stall_id));

-- Kitchen staff can view all orders
CREATE POLICY orders_kitchen_select ON orders
  FOR SELECT USING (get_user_role() = 'kitchen');


-- ═══════════════════════════════════════════════════════════
-- ORDER ITEMS
-- Same visibility as the parent order.
-- ═══════════════════════════════════════════════════════════

CREATE POLICY order_items_customer_select ON order_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM orders WHERE orders.id = order_items.order_id
        AND orders.user_id = auth.uid()
    )
  );

CREATE POLICY order_items_customer_insert ON order_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM orders WHERE orders.id = order_items.order_id
        AND orders.user_id = auth.uid()
    )
  );

CREATE POLICY order_items_ops_select ON order_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM orders WHERE orders.id = order_items.order_id
        AND is_stall_operator(orders.stall_id)
    )
  );

CREATE POLICY order_items_kitchen_select ON order_items
  FOR SELECT USING (get_user_role() = 'kitchen');


-- ═══════════════════════════════════════════════════════════
-- SUBSCRIPTION PLANS
-- Public read (catalog).
-- ═══════════════════════════════════════════════════════════

CREATE POLICY plans_read ON subscription_plans
  FOR SELECT USING (true);


-- ═══════════════════════════════════════════════════════════
-- SUBSCRIPTIONS
-- Users see own. Ops can read for validation.
-- ═══════════════════════════════════════════════════════════

CREATE POLICY subscriptions_own_select ON subscriptions
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY subscriptions_own_insert ON subscriptions
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY subscriptions_ops_select ON subscriptions
  FOR SELECT USING (
    get_user_role() IN ('kitchen', 'stall_operator')
  );


-- ═══════════════════════════════════════════════════════════
-- MEAL HISTORIES
-- Users see their own consumption logs.
-- ═══════════════════════════════════════════════════════════

CREATE POLICY meal_histories_own_select ON meal_histories
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM subscriptions
      WHERE subscriptions.id = meal_histories.subscription_id
        AND subscriptions.user_id = auth.uid()
    )
  );

CREATE POLICY meal_histories_own_insert ON meal_histories
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM subscriptions
      WHERE subscriptions.id = meal_histories.subscription_id
        AND subscriptions.user_id = auth.uid()
    )
  );


-- ═══════════════════════════════════════════════════════════
-- NOTIFICATIONS
-- Users read/update their own only.
-- ═══════════════════════════════════════════════════════════

CREATE POLICY notifications_own_select ON notifications
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY notifications_own_update ON notifications
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());


-- ═══════════════════════════════════════════════════════════
-- INVENTORY ITEMS
-- Public read. Operators update their stall inventory.
-- ═══════════════════════════════════════════════════════════

CREATE POLICY inventory_read ON inventory_items
  FOR SELECT USING (true);

CREATE POLICY inventory_operator_insert ON inventory_items
  FOR INSERT WITH CHECK (is_stall_operator(stall_id));

CREATE POLICY inventory_operator_update ON inventory_items
  FOR UPDATE USING (is_stall_operator(stall_id))
  WITH CHECK (is_stall_operator(stall_id));

CREATE POLICY inventory_operator_delete ON inventory_items
  FOR DELETE USING (is_stall_operator(stall_id));


-- ═══════════════════════════════════════════════════════════
-- MEAL RESERVATIONS
-- Customers manage their own. Operators see/update for stall.
-- ═══════════════════════════════════════════════════════════

CREATE POLICY reservations_customer_select ON meal_reservations
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY reservations_customer_insert ON meal_reservations
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY reservations_customer_update ON meal_reservations
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY reservations_ops_select ON meal_reservations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM inventory_items
      WHERE inventory_items.id = meal_reservations.inventory_item_id
        AND is_stall_operator(inventory_items.stall_id)
    )
  );

CREATE POLICY reservations_ops_update ON meal_reservations
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM inventory_items
      WHERE inventory_items.id = meal_reservations.inventory_item_id
        AND is_stall_operator(inventory_items.stall_id)
    )
  );


-- ═══════════════════════════════════════════════════════════
-- PAYMENT RECORDS
-- Users see their own payments (via order or subscription).
-- ═══════════════════════════════════════════════════════════

CREATE POLICY payments_own_select ON payment_records
  FOR SELECT USING (
    (order_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM orders WHERE orders.id = payment_records.order_id
        AND orders.user_id = auth.uid()
    ))
    OR
    (subscription_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM subscriptions WHERE subscriptions.id = payment_records.subscription_id
        AND subscriptions.user_id = auth.uid()
    ))
  );

CREATE POLICY payments_own_insert ON payment_records
  FOR INSERT WITH CHECK (
    (order_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM orders WHERE orders.id = payment_records.order_id
        AND orders.user_id = auth.uid()
    ))
    OR
    (subscription_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM subscriptions WHERE subscriptions.id = payment_records.subscription_id
        AND subscriptions.user_id = auth.uid()
    ))
  );
