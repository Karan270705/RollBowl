-- ============================================================
-- RollBowl Migration 003: Users & Addresses
-- ============================================================
-- The `users` table extends Supabase Auth (`auth.users`).
-- A trigger auto-creates a profile row on signup.
-- ============================================================

-- ─── Users (Public Profile) ─────────────────────────────────

CREATE TABLE users (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL DEFAULT '',
  email       TEXT NOT NULL DEFAULT '',
  phone       TEXT NOT NULL DEFAULT '',
  role        user_role NOT NULL DEFAULT 'customer',
  avatar_url  TEXT,
  college_id  UUID REFERENCES colleges(id) ON DELETE SET NULL,
  city_id     UUID REFERENCES cities(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE users IS 'Public user profiles extending Supabase Auth.';

-- ─── Trigger: Auto-create profile on signup ─────────────────

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, name, phone)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data ->> 'name', ''),
    COALESCE(NEW.phone, '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ─── Addresses ──────────────────────────────────────────────

CREATE TABLE addresses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label         TEXT NOT NULL,
  full_address  TEXT NOT NULL,
  landmark      TEXT,
  is_default    BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE addresses IS 'User delivery/pickup locations (Hostel, Department, etc).';
