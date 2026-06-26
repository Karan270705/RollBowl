-- ============================================================
-- RollBowl Migration 006: Subscriptions
-- ============================================================
-- Subscription plans (catalog) and user subscriptions.
-- meal_histories tracks consumed meals under a subscription.
-- ============================================================

-- ─── Subscription Plans (Catalog) ───────────────────────────

CREATE TABLE subscription_plans (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  description     TEXT NOT NULL DEFAULT '',
  price           NUMERIC(10,2) NOT NULL,
  duration_days   INTEGER NOT NULL,
  meals_per_day   INTEGER NOT NULL,
  total_meals     INTEGER NOT NULL,
  features        TEXT[] NOT NULL DEFAULT '{}',
  is_popular      BOOLEAN NOT NULL DEFAULT false,
  badge           TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE subscription_plans IS 'Available meal subscription plans (Basic, Standard, Premium).';

-- Constraint: price must be positive
ALTER TABLE subscription_plans ADD CONSTRAINT plans_price_positive CHECK (price > 0);

-- ─── User Subscriptions ─────────────────────────────────────

CREATE TABLE subscriptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  plan_id         UUID NOT NULL REFERENCES subscription_plans(id) ON DELETE RESTRICT,
  plan_name       TEXT NOT NULL,
  status          subscription_status NOT NULL DEFAULT 'active',
  start_date      DATE NOT NULL,
  end_date        DATE NOT NULL,
  total_meals     INTEGER NOT NULL,
  consumed_meals  INTEGER NOT NULL DEFAULT 0,
  remaining_meals INTEGER NOT NULL,
  meals_per_day   INTEGER NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE subscriptions IS 'Active or past user meal subscriptions.';

-- Constraint: remaining_meals must be non-negative
ALTER TABLE subscriptions ADD CONSTRAINT subs_remaining_non_negative CHECK (remaining_meals >= 0);

-- ─── Meal History (Subscription Consumption Log) ────────────

CREATE TABLE meal_histories (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id   UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  meal_name         TEXT NOT NULL,
  date              DATE NOT NULL,
  time              TEXT NOT NULL,
  category          meal_category NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE meal_histories IS 'Log of meals consumed under a subscription plan.';
