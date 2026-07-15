-- ============================================================
-- RollBowl Migration 046: Live Inventory Fix & Automation
-- ============================================================

BEGIN;

-- 1. Operational Date Helper
-- Resolves the operational date using the canonical 14:00 cutoff.
-- Stated as a new canonical backend helper, as no prior helper or table existed.
CREATE OR REPLACE FUNCTION get_current_operational_date()
RETURNS DATE
LANGUAGE plpgsql
AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
  v_local_time TIME := (v_now AT TIME ZONE 'Asia/Kolkata')::TIME;
  v_local_date DATE := (v_now AT TIME ZONE 'Asia/Kolkata')::DATE;
BEGIN
  IF v_local_time > '14:00:00'::TIME THEN
    RETURN v_local_date + 1;
  ELSE
    RETURN v_local_date;
  END IF;
END;
$$;


-- 2. Batch Auto-Close Function
-- Active batches are closed 60 minutes after their window_end.
-- Uses Kolkata local time/date comparison, constructs the expiry timestamp,
-- and handles overnight windows safely. Set-based UPDATE returning closed count.
CREATE OR REPLACE FUNCTION close_expired_inventory_batches()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_closed_count INTEGER;
  v_current_local_timestamp TIMESTAMP;
BEGIN
  -- Construct the current timestamp in Asia/Kolkata timezone (timestamp without time zone)
  v_current_local_timestamp := now() AT TIME ZONE 'Asia/Kolkata';

  -- Close all active batches whose expiry timestamp (inventory_date + window_end + 60 minutes) is in the past
  WITH expired_batches AS (
    SELECT id
    FROM inventory_batches
    WHERE status = 'active'
      AND (
        CASE 
          WHEN window_end < window_start THEN (inventory_date + 1 + window_end + interval '60 minutes')
          ELSE (inventory_date + window_end + interval '60 minutes')
        END < v_current_local_timestamp
      )
  )
  UPDATE inventory_batches
  SET status = 'closed',
      closed_at = now(),
      notes = CASE 
                WHEN notes IS NULL THEN 'Auto-closed by system.'
                WHEN notes NOT LIKE '%Auto-closed by system.%' THEN notes || E'\nAuto-closed by system.'
                ELSE notes
              END,
      updated_at = now()
  FROM expired_batches
  WHERE inventory_batches.id = expired_batches.id;

  GET DIAGNOSTICS v_closed_count = ROW_COUNT;
  RETURN v_closed_count;
END;
$$;

-- Revoke execution privileges from public/anon/authenticated for safety
REVOKE ALL ON FUNCTION close_expired_inventory_batches() FROM PUBLIC;
REVOKE ALL ON FUNCTION close_expired_inventory_batches() FROM anon;
REVOKE ALL ON FUNCTION close_expired_inventory_batches() FROM authenticated;


-- 3. Enable Realtime Base-Table Coverage
-- Ensures both Customer and Kitchen apps receive instant updates on all inventory factors.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'inventory_movements'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE inventory_movements;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'order_items'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE order_items;
  END IF;
END;
$$;


-- 4. Revised record_inventory_movement RPC
-- Provides trusted inventory movements by verifying auth, applying correct lock ordering,
-- handling null inputs, validating reference orders, and returning a JSON payload.
CREATE OR REPLACE FUNCTION record_inventory_movement(
  p_batch_item_id uuid, 
  p_movement_type text, 
  p_quantity integer, 
  p_note text DEFAULT NULL::text, 
  p_reference_order_id uuid DEFAULT NULL::uuid
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  v_batch_id UUID;
  v_item inventory_batch_items%ROWTYPE;
  v_batch inventory_batches%ROWTYPE;
  v_state RECORD;
  v_order_stall_id UUID;
  v_movement_id UUID;
BEGIN
  -- 1. Explicitly reject nulls / negative inputs (using consistent JSONB exceptions)
  IF p_batch_item_id IS NULL THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'INVALID_PAYLOAD', 'message', 'Batch item ID is required.')::text;
  END IF;

  IF p_movement_type IS NULL OR btrim(p_movement_type) = '' THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'INVALID_MOVEMENT_TYPE', 'message', 'Movement type is required or blank.')::text;
  END IF;

  IF p_quantity IS NULL THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'INVALID_QUANTITY', 'message', 'Quantity is required.')::text;
  END IF;

  IF p_quantity <= 0 THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'INVALID_QUANTITY', 'message', 'Movement quantity must be a positive integer.')::text;
  END IF;

  -- Require auth.uid()
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'UNAUTHORIZED', 'message', 'You must be logged in.')::text;
  END IF;

  -- Allow only approved movement types
  IF p_movement_type NOT IN ('walk_in_sale', 'complimentary', 'damaged', 'wasted', 'stock_added', 'correction_increase', 'correction_decrease') THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'INVALID_MOVEMENT_TYPE', 'message', 'Invalid movement type.')::text;
  END IF;

  -- Resolve the batch ID from the item ID (without lock)
  SELECT inventory_batch_id INTO v_batch_id FROM inventory_batch_items WHERE id = p_batch_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'ITEM_NOT_IN_BATCH', 'message', 'Inventory batch item not found.')::text;
  END IF;

  -- 2. Lock both batch and batch item: lock the batch row FOR UPDATE first (deadlock avoidance)
  SELECT * INTO v_batch FROM inventory_batches WHERE id = v_batch_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'BATCH_NOT_FOUND', 'message', 'Associated inventory batch not found.')::text;
  END IF;

  -- Check is_stall_operator(batch.stall_id)
  IF NOT is_stall_operator(v_batch.stall_id) THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'UNAUTHORIZED', 'message', 'You are not authorized for this stall.')::text;
  END IF;

  -- Confirm batch status is active
  IF v_batch.status != 'active' THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'BATCH_NOT_ACTIVE', 'message', 'Movements can only be recorded on active batches.')::text;
  END IF;

  -- Lock the target inventory_batch_items row FOR UPDATE second
  SELECT * INTO v_item FROM inventory_batch_items WHERE id = p_batch_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'ITEM_NOT_IN_BATCH', 'message', 'Inventory batch item not found.')::text;
  END IF;

  -- Verify batch item is linked to the correct batch row
  IF v_item.inventory_batch_id != v_batch.id THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'BATCH_ITEM_MISMATCH', 'message', 'Inventory batch item does not belong to the locked batch.')::text;
  END IF;

  -- Validate reference order if provided
  IF p_reference_order_id IS NOT NULL THEN
    SELECT stall_id INTO v_order_stall_id FROM orders WHERE id = p_reference_order_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION '%', jsonb_build_object('code', 'ORDER_NOT_FOUND', 'message', 'Reference order not found.')::text;
    END IF;
    IF v_order_stall_id != v_batch.stall_id THEN
      RAISE EXCEPTION '%', jsonb_build_object('code', 'ORDER_STALL_MISMATCH', 'message', 'Reference order belongs to a different stall.')::text;
    END IF;
  END IF;

  -- 4. Require a valid live inventory state from view
  SELECT * INTO v_state FROM live_inventory_status WHERE inventory_batch_item_id = p_batch_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'INVENTORY_STATE_NOT_FOUND', 'message', 'Live inventory state could not be calculated.')::text;
  END IF;

  -- Validate normal manual outflows against extra_available (protect reserved app orders)
  IF p_movement_type IN ('walk_in_sale', 'complimentary', 'damaged', 'wasted', 'correction_decrease') THEN
    IF COALESCE(v_state.extra_available, 0) < p_quantity THEN
      RAISE EXCEPTION '%',
        jsonb_build_object(
          'code', 'INSUFFICIENT_STOCK',
          'message', 'Insufficient stock for manual outflow. Only ' || COALESCE(v_state.extra_available, 0)::text || ' available.',
          'available_quantity', COALESCE(v_state.extra_available, 0)
        )::text;
    END IF;
  END IF;

  -- Insert exactly one movement and capture ID
  INSERT INTO inventory_movements (
    inventory_batch_id, inventory_batch_item_id, meal_id, movement_type, quantity, reference_order_id, created_by, note
  ) VALUES (
    v_batch.id, v_item.id, v_item.meal_id, p_movement_type, p_quantity, p_reference_order_id, auth.uid(), p_note
  ) RETURNING id INTO v_movement_id;

  -- Recalculate live inventory state after insertion and check FOUND again
  SELECT * INTO v_state FROM live_inventory_status WHERE inventory_batch_item_id = p_batch_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION '%', jsonb_build_object('code', 'INVENTORY_STATE_NOT_FOUND', 'message', 'Live inventory state could not be recalculated.')::text;
  END IF;
  
  -- Return structured JSON
  RETURN jsonb_build_object(
    'success', true,
    'movement_id', v_movement_id,
    'inventory_batch_item_id', v_state.inventory_batch_item_id,
    'batch_id', v_state.batch_id,
    'meal_id', v_state.meal_id,
    'item_name', v_state.item_name,
    'stall_id', v_state.stall_id,
    'inventory_date', v_state.inventory_date,
    'window_start', v_state.window_start,
    'window_end', v_state.window_end,
    'batch_status', v_state.batch_status,
    'loaded_quantity', v_state.loaded_quantity,
    'manual_inflow', v_state.manual_inflow,
    'manual_outflow', v_state.manual_outflow,
    'active_reserved', v_state.active_reserved,
    'fulfilled', v_state.fulfilled,
    'cancelled', v_state.cancelled,
    'effective_loaded', v_state.effective_loaded,
    'remaining_physical', v_state.remaining_physical,
    'extra_available', v_state.extra_available,
    'customer_available', v_state.customer_available,
    'stock_status', v_state.stock_status
  );
END;
$$;

-- Revoke and grant privileges
REVOKE ALL ON FUNCTION record_inventory_movement(uuid, text, integer, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION record_inventory_movement(uuid, text, integer, text, uuid) FROM anon;
REVOKE ALL ON FUNCTION record_inventory_movement(uuid, text, integer, text, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION record_inventory_movement(uuid, text, integer, text, uuid) TO authenticated;

COMMIT;
