-- ============================================================
-- RollBowl Migration 034: Inventory Movements & State
-- ============================================================
-- Creates the immutable movement log and the live calculation
-- views for inventory availability.
-- ============================================================

-- 1. Inventory Movements
CREATE TABLE inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_batch_id UUID NOT NULL REFERENCES inventory_batches(id) ON DELETE CASCADE,
  inventory_batch_item_id UUID NOT NULL REFERENCES inventory_batch_items(id) ON DELETE CASCADE,
  meal_id UUID NOT NULL REFERENCES meals(id) ON DELETE RESTRICT,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('walk_in_sale', 'complimentary', 'damaged', 'wasted', 'stock_added', 'correction_increase', 'correction_decrease')),
  quantity INTEGER NOT NULL CHECK (quantity > 0), -- Must be strictly positive; the type dictates inflow/outflow
  reference_order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE inventory_movements IS 'Immutable audit log for all manual stock adjustments.';

CREATE INDEX idx_inventory_movements_item ON inventory_movements(inventory_batch_item_id);
CREATE INDEX idx_inventory_movements_batch ON inventory_movements(inventory_batch_id);

-- 2. Live Inventory Calculation View
CREATE OR REPLACE VIEW live_inventory_status AS
WITH movement_stats AS (
  SELECT
    inventory_batch_item_id,
    SUM(CASE WHEN movement_type IN ('stock_added', 'correction_increase') THEN quantity ELSE 0 END) as manual_inflow,
    SUM(CASE WHEN movement_type IN ('walk_in_sale', 'complimentary', 'damaged', 'wasted', 'correction_decrease') THEN quantity ELSE 0 END) as manual_outflow
  FROM inventory_movements
  GROUP BY inventory_batch_item_id
),
order_stats AS (
  SELECT 
    oi.meal_id,
    o.stall_id,
    o.pickup_date,
    SUM(CASE WHEN o.status IN ('pending', 'confirmed', 'preparing', 'ready') THEN oi.quantity ELSE 0 END) as active_reserved,
    SUM(CASE WHEN o.status = 'picked_up' THEN oi.quantity ELSE 0 END) as fulfilled,
    SUM(CASE WHEN o.status = 'cancelled' THEN oi.quantity ELSE 0 END) as cancelled
  FROM order_items oi
  JOIN orders o ON oi.order_id = o.id
  GROUP BY oi.meal_id, o.stall_id, o.pickup_date
)
SELECT 
  ibi.id as inventory_batch_item_id,
  ib.id as batch_id,
  ibi.meal_id,
  m.name as item_name,
  ib.stall_id,
  ib.inventory_date,
  ib.window_start,
  ib.window_end,
  ib.status as batch_status,
  
  -- Raw Inputs
  ibi.loaded_quantity,
  COALESCE(ms.manual_inflow, 0)::INTEGER as manual_inflow,
  COALESCE(ms.manual_outflow, 0)::INTEGER as manual_outflow,
  COALESCE(os.active_reserved, 0)::INTEGER as active_reserved,
  COALESCE(os.fulfilled, 0)::INTEGER as fulfilled,
  COALESCE(os.cancelled, 0)::INTEGER as cancelled,
  
  -- Effective Loaded: loaded_quantity + manual inflow
  (ibi.loaded_quantity + COALESCE(ms.manual_inflow, 0))::INTEGER as effective_loaded,
  
  -- Remaining Physical: effective loaded - fulfilled - manual outflow
  (ibi.loaded_quantity + COALESCE(ms.manual_inflow, 0) - COALESCE(os.fulfilled, 0) - COALESCE(ms.manual_outflow, 0))::INTEGER as remaining_physical,
  
  -- Extra Available: remaining physical - active reserved
  (ibi.loaded_quantity + COALESCE(ms.manual_inflow, 0) - COALESCE(os.fulfilled, 0) - COALESCE(ms.manual_outflow, 0) - COALESCE(os.active_reserved, 0))::INTEGER as extra_available,
  
  -- Customer Available: GREATEST(extra_available, 0)
  GREATEST((ibi.loaded_quantity + COALESCE(ms.manual_inflow, 0) - COALESCE(os.fulfilled, 0) - COALESCE(ms.manual_outflow, 0) - COALESCE(os.active_reserved, 0)), 0)::INTEGER as customer_available,
  
  -- Stock Status String
  CASE 
    WHEN (ibi.loaded_quantity + COALESCE(ms.manual_inflow, 0) - COALESCE(os.fulfilled, 0) - COALESCE(ms.manual_outflow, 0) - COALESCE(os.active_reserved, 0)) < 0 THEN 'deficit'
    WHEN (ibi.loaded_quantity + COALESCE(ms.manual_inflow, 0) - COALESCE(os.fulfilled, 0) - COALESCE(ms.manual_outflow, 0) - COALESCE(os.active_reserved, 0)) = 0 THEN 'out_of_stock'
    WHEN (ibi.loaded_quantity + COALESCE(ms.manual_inflow, 0) - COALESCE(os.fulfilled, 0) - COALESCE(ms.manual_outflow, 0) - COALESCE(os.active_reserved, 0)) <= 5 THEN 'low_stock'
    ELSE 'available'
  END as stock_status

FROM inventory_batch_items ibi
JOIN inventory_batches ib ON ibi.inventory_batch_id = ib.id
JOIN meals m ON ibi.meal_id = m.id
LEFT JOIN movement_stats ms ON ms.inventory_batch_item_id = ibi.id
LEFT JOIN order_stats os ON os.meal_id = ibi.meal_id AND os.stall_id = ib.stall_id AND os.pickup_date = ib.inventory_date;

-- 3. Customer Safe View (Excludes internal metrics like loaded quantity, deficits, or exact active reserved)
CREATE OR REPLACE VIEW customer_safe_inventory AS
SELECT 
  batch_id,
  stall_id,
  inventory_date,
  window_start,
  window_end,
  meal_id,
  item_name,
  customer_available,
  CASE WHEN stock_status = 'deficit' THEN 'out_of_stock' ELSE stock_status END as stock_status,
  batch_status
FROM live_inventory_status
WHERE batch_status = 'active';
