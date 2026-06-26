-- ============================================================
-- RollBowl Migration 010: Performance Indexes
-- ============================================================
-- Targeted indexes for the most common query patterns.
-- Kept minimal — add more as query profiling dictates.
-- ============================================================

-- ─── Geography ──────────────────────────────────────────────

CREATE INDEX idx_universities_city ON universities(city_id);
CREATE INDEX idx_colleges_city ON colleges(city_id);
CREATE INDEX idx_colleges_university ON colleges(university_id);

-- ─── Users ──────────────────────────────────────────────────

CREATE INDEX idx_users_college ON users(college_id);
CREATE INDEX idx_users_city ON users(city_id);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_addresses_user ON addresses(user_id);

-- ─── Stalls & Meals ─────────────────────────────────────────

CREATE INDEX idx_stalls_college ON stalls(college_id);
CREATE INDEX idx_stalls_operator ON stalls(operator_id);
CREATE INDEX idx_meals_stall ON meals(stall_id);
CREATE INDEX idx_meals_category ON meals(category);
CREATE INDEX idx_meals_available ON meals(is_available) WHERE is_available = true;
CREATE INDEX idx_meals_featured ON meals(is_featured) WHERE is_featured = true;

-- ─── Orders ─────────────────────────────────────────────────

CREATE INDEX idx_orders_user ON orders(user_id);
CREATE INDEX idx_orders_stall ON orders(stall_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created ON orders(created_at DESC);
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_items_meal ON order_items(meal_id);

-- ─── Subscriptions ──────────────────────────────────────────

CREATE INDEX idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_plan ON subscriptions(plan_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_meal_histories_sub ON meal_histories(subscription_id);
CREATE INDEX idx_meal_histories_date ON meal_histories(date DESC);

-- ─── Inventory ──────────────────────────────────────────────

CREATE INDEX idx_inventory_stall ON inventory_items(stall_id);
CREATE INDEX idx_inventory_meal ON inventory_items(meal_id);
CREATE INDEX idx_inventory_available ON inventory_items(is_available) WHERE is_available = true;
CREATE INDEX idx_reservations_user ON meal_reservations(user_id);
CREATE INDEX idx_reservations_inventory ON meal_reservations(inventory_item_id);
CREATE INDEX idx_reservations_status ON meal_reservations(status);

-- ─── Notifications ──────────────────────────────────────────

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_unread ON notifications(user_id, is_read) WHERE is_read = false;
CREATE INDEX idx_notifications_created ON notifications(created_at DESC);

-- ─── Payments ───────────────────────────────────────────────

CREATE INDEX idx_payments_order ON payment_records(order_id);
CREATE INDEX idx_payments_subscription ON payment_records(subscription_id);
CREATE INDEX idx_payments_status ON payment_records(status);
