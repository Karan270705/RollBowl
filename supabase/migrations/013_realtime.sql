-- ============================================================
-- RollBowl Migration 013: Realtime Configuration
-- ============================================================
-- Enable Supabase Realtime on specific tables.
-- Only tables that need live updates are enabled.
-- ============================================================

-- Enable realtime for order status updates
ALTER PUBLICATION supabase_realtime ADD TABLE orders;

-- Enable realtime for live inventory availability
ALTER PUBLICATION supabase_realtime ADD TABLE inventory_items;

-- Enable realtime for instant notification delivery
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- Enable realtime for reservation status changes
ALTER PUBLICATION supabase_realtime ADD TABLE meal_reservations;
