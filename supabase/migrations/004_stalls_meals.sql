-- ============================================================
-- RollBowl Migration 004: Stalls & Meals
-- ============================================================
-- Stalls belong to colleges, operated by users.
-- Meals belong to stalls and carry category/type enums.
-- ============================================================

-- ─── Stalls ─────────────────────────────────────────────────

CREATE TABLE stalls (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  college_id      UUID NOT NULL REFERENCES colleges(id) ON DELETE RESTRICT,
  operator_id     UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  description     TEXT NOT NULL DEFAULT '',
  image_url       TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  rating          NUMERIC(3,2) NOT NULL DEFAULT 0.00,
  total_ratings   INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE stalls IS 'Kitchen/stall locations within colleges.';

-- ─── Meals ──────────────────────────────────────────────────

CREATE TABLE meals (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,
  description       TEXT NOT NULL DEFAULT '',
  price             NUMERIC(10,2) NOT NULL,
  original_price    NUMERIC(10,2),
  category          meal_category NOT NULL,
  type              meal_type NOT NULL,
  stall_id          UUID NOT NULL REFERENCES stalls(id) ON DELETE CASCADE,
  image_url         TEXT NOT NULL DEFAULT '',
  is_available      BOOLEAN NOT NULL DEFAULT true,
  is_featured       BOOLEAN NOT NULL DEFAULT false,
  rating            NUMERIC(3,2) NOT NULL DEFAULT 0.00,
  total_ratings     INTEGER NOT NULL DEFAULT 0,
  preparation_time  INTEGER NOT NULL DEFAULT 15,
  nutrition         JSONB,
  tags              TEXT[] NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE meals IS 'Menu items available for ordering.';
COMMENT ON COLUMN meals.preparation_time IS 'Estimated preparation time in minutes.';
COMMENT ON COLUMN meals.nutrition IS 'JSON: { calories, protein, carbs, fat }.';

-- Constraint: price must be positive
ALTER TABLE meals ADD CONSTRAINT meals_price_positive CHECK (price > 0);
