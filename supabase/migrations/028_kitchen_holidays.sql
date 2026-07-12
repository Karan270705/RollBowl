-- ============================================================
-- RollBowl Migration 028: Kitchen Holidays
-- ============================================================
-- Adds the kitchen_holidays table and extended_days to subscriptions
-- ============================================================

-- 1. Create kitchen_holidays table
DROP TABLE IF EXISTS kitchen_holidays CASCADE;
CREATE TABLE kitchen_holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stall_id UUID NOT NULL REFERENCES stalls(id) ON DELETE CASCADE,
  holiday_date DATE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE(stall_id, holiday_date)
);

COMMENT ON TABLE kitchen_holidays IS 'Dates when the kitchen is closed, preventing new orders/menus.';

-- 2. Add extended_days to subscriptions for tracking holiday extensions
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS extended_days INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN subscriptions.extended_days IS 'Number of days the subscription end_date has been extended due to holidays.';

-- 3. Create RLS Policies for kitchen_holidays
ALTER TABLE kitchen_holidays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for all users"
  ON kitchen_holidays FOR SELECT
  USING (true);

CREATE POLICY "Enable all access for kitchen staff"
  ON kitchen_holidays FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role IN ('kitchen', 'stall_operator')
    )
  );
