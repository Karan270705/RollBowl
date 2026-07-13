-- ============================================================
-- RollBowl Migration 037: Inventory Security & Realtime
-- ============================================================

-- 1. Enable RLS
ALTER TABLE inventory_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_batch_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;

-- 2. Customer Read Policies (Authenticated users can read ACTIVE batches only)
CREATE POLICY "Customers can view active batches"
  ON inventory_batches FOR SELECT
  TO authenticated
  USING (status = 'active');

CREATE POLICY "Customers can view active batch items"
  ON inventory_batch_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM inventory_batches
      WHERE inventory_batches.id = inventory_batch_items.inventory_batch_id
        AND inventory_batches.status = 'active'
    )
  );

-- 3. Kitchen Operator Policies (Using the existing `is_stall_operator` helper function)
CREATE POLICY "Operators can manage their batches"
  ON inventory_batches FOR ALL
  TO authenticated
  USING (is_stall_operator(stall_id))
  WITH CHECK (is_stall_operator(stall_id));

CREATE POLICY "Operators can manage their batch items"
  ON inventory_batch_items FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM inventory_batches
      WHERE inventory_batches.id = inventory_batch_items.inventory_batch_id
        AND is_stall_operator(inventory_batches.stall_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM inventory_batches
      WHERE inventory_batches.id = inventory_batch_items.inventory_batch_id
        AND is_stall_operator(inventory_batches.stall_id)
    )
  );

CREATE POLICY "Operators can manage their movements"
  ON inventory_movements FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM inventory_batches
      WHERE inventory_batches.id = inventory_movements.inventory_batch_id
        AND is_stall_operator(inventory_batches.stall_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM inventory_batches
      WHERE inventory_batches.id = inventory_movements.inventory_batch_id
        AND is_stall_operator(inventory_batches.stall_id)
    )
  );

-- 4. Enable Realtime 
-- Customers need realtime updates when batches activate and items adjust.
-- Note: 'orders' is already in supabase_realtime.
ALTER PUBLICATION supabase_realtime ADD TABLE inventory_batches;
ALTER PUBLICATION supabase_realtime ADD TABLE inventory_batch_items;
