-- ============================================================
-- RollBowl Migration 002: Geography Tables
-- ============================================================
-- Cities → Universities → Colleges hierarchy.
-- These are reference data tables — mostly read-only for clients.
-- ============================================================

-- ─── Cities ──────────────────────────────────────────────────

CREATE TABLE cities (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  state       TEXT NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE cities IS 'Operational cities where RollBowl is available.';

-- ─── Universities ────────────────────────────────────────────

CREATE TABLE universities (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  city_id     UUID NOT NULL REFERENCES cities(id) ON DELETE RESTRICT,
  logo_url    TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE universities IS 'Parent university institutions linked to cities.';

-- ─── Colleges ────────────────────────────────────────────────

CREATE TABLE colleges (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  university_id   UUID NOT NULL REFERENCES universities(id) ON DELETE RESTRICT,
  city_id         UUID NOT NULL REFERENCES cities(id) ON DELETE RESTRICT,
  address         TEXT NOT NULL,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE colleges IS 'Specific campuses where RollBowl stalls operate.';
