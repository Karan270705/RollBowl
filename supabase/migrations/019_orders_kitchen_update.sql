-- ============================================================
-- RollBowl Migration 019: Kitchen Orders Update Policy
-- ============================================================
-- Grant UPDATE access on `orders` to the `kitchen` role.
-- Currently, the kitchen role only has SELECT access.

CREATE POLICY orders_kitchen_update ON orders
  FOR UPDATE USING (get_user_role() = 'kitchen')
  WITH CHECK (get_user_role() = 'kitchen');
