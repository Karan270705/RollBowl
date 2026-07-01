-- ============================================================
-- RollBowl Migration 020: Subscriptions Engine
-- ============================================================
-- 1. Add kitchen_holidays table for carry-forward logic
-- 2. Add plan-driven eligibility via category_credit_costs
-- 3. Add daily credit usage tracking to subscriptions
-- 4. Link order_items directly to subscriptions
-- ============================================================

-- ─── 1. Kitchen Holidays ────────────────────────────────────
CREATE TABLE kitchen_holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL UNIQUE,
  reason TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Note: A database trigger or edge function will be needed to 
-- increment `end_date` on active subscriptions when a holiday is added.

-- ─── 2. Subscription Plans ──────────────────────────────────
-- Adds a JSONB mapping of meal_category -> credit_cost
ALTER TABLE subscription_plans 
ADD COLUMN IF NOT EXISTS category_credit_costs JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Example payload: '{"roll": 1, "bowl": 1, "combo": 2}'

-- ─── 3. Subscriptions ───────────────────────────────────────
-- Track the last day credits were used and how many were used that day
ALTER TABLE subscriptions
ADD COLUMN IF NOT EXISTS last_usage_date DATE,
ADD COLUMN IF NOT EXISTS daily_credits_used INTEGER NOT NULL DEFAULT 0;

-- ─── 4. Order Items ─────────────────────────────────────────
-- Link consumed credits directly to the transaction
ALTER TABLE order_items
ADD COLUMN IF NOT EXISTS subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS credits_used INTEGER NOT NULL DEFAULT 0;

-- ─── 5. Seed Data (Plans) ───────────────────────────────────
-- Insert the Solo and Plus plans if they do not exist
INSERT INTO subscription_plans (name, description, price, duration_days, meals_per_day, total_meals, features, is_popular, badge, category_credit_costs)
VALUES (
  'Solo Plan',
  'Choose any ONE item from the daily menu (per day)',
  1200.00,
  25,
  1,
  20,
  ARRAY['1 Meal per day', 'Eligible: Rolls & Bowls', '25 Days Validity', 'Carry forward on holidays'],
  true,
  '20 MEALS',
  '{"roll": 1, "bowl": 1}'::jsonb
) ON CONFLICT DO NOTHING;

INSERT INTO subscription_plans (name, description, price, duration_days, meals_per_day, total_meals, features, is_popular, badge, category_credit_costs)
VALUES (
  'Plus Plan',
  'Choose any TWO items from the daily menu (per day)',
  2100.00,
  25,
  2,
  20,
  ARRAY['2 Meals per day', 'Eligible: Rolls, Bowls, Combos', '25 Days Validity', 'Carry forward on holidays'],
  false,
  '20 MEALS',
  '{"roll": 1, "bowl": 1, "combo": 2}'::jsonb
) ON CONFLICT DO NOTHING;
