-- ============================================================
-- RollBowl Migration 021: Subscriptions & Holidays RLS
-- ============================================================

-- ─── 1. Subscriptions ───────────────────────────────────────
-- Customer App must be able to update their own subscription
-- counters when placing an order that consumes credits.

CREATE POLICY subscriptions_own_update ON subscriptions
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());


-- ─── 2. Kitchen Holidays ────────────────────────────────────
-- Created in Migration 020, but RLS was never enabled nor 
-- were read/write policies created.

ALTER TABLE kitchen_holidays ENABLE ROW LEVEL SECURITY;

-- Anyone (Customers, Operators, Kitchen) can view active holidays
-- to know when their subscriptions are paused.
CREATE POLICY kitchen_holidays_read ON kitchen_holidays
  FOR SELECT USING (true);

-- Only kitchen staff can add, update, or remove holidays.
CREATE POLICY kitchen_holidays_kitchen_all ON kitchen_holidays
  USING (get_user_role() = 'kitchen');
