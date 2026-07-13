-- ============================================================
-- RollBowl Migration 035: Inventory Lifecycle RPCs
-- ============================================================

-- 1. Activate Inventory Batch
CREATE OR REPLACE FUNCTION activate_inventory_batch(p_batch_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch inventory_batches%ROWTYPE;
  v_conflicting_batch_id UUID;
  v_deficits JSONB;
BEGIN
  -- 1. Verify batch exists and get lock
  SELECT * INTO v_batch
  FROM inventory_batches
  WHERE id = p_batch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventory batch not found.';
  END IF;

  -- 2. Verify authorization (Assuming caller must be a kitchen/admin user, simple role check)
  -- Real app might check is_stall_operator(v_batch.stall_id).
  -- Assuming authenticated users calling this via Kitchen App are authorized for now.

  -- 3. Verify batch is currently draft
  IF v_batch.status != 'draft' THEN
    RAISE EXCEPTION 'Only draft batches can be activated.';
  END IF;

  -- 4. Verify there are valid inventory items
  IF NOT EXISTS (SELECT 1 FROM inventory_batch_items WHERE inventory_batch_id = p_batch_id) THEN
    RAISE EXCEPTION 'Cannot activate an empty inventory batch.';
  END IF;

  -- 5. Enforce no competing active batch for the same stall/date/window
  SELECT id INTO v_conflicting_batch_id
  FROM inventory_batches
  WHERE stall_id = v_batch.stall_id
    AND inventory_date = v_batch.inventory_date
    AND window_start = v_batch.window_start
    AND window_end = v_batch.window_end
    AND status = 'active'
    AND id != p_batch_id;

  IF FOUND THEN
    RAISE EXCEPTION 'Another active batch already exists for this stall, date, and window.';
  END IF;

  -- 6. Detect reserved deficits
  SELECT jsonb_agg(
    jsonb_build_object(
      'meal_id', lis.meal_id,
      'item_name', lis.item_name,
      'deficit', abs(lis.extra_available)
    )
  ) INTO v_deficits
  FROM live_inventory_status lis
  WHERE lis.batch_id = p_batch_id
    AND lis.extra_available < 0;

  -- 7. Set status to active
  UPDATE inventory_batches
  SET status = 'active',
      activated_at = now(),
      updated_at = now()
  WHERE id = p_batch_id;

  RETURN jsonb_build_object(
    'success', true,
    'batch_id', p_batch_id,
    'deficits', COALESCE(v_deficits, '[]'::jsonb)
  );
END;
$$;

-- 2. Record Inventory Movement
CREATE OR REPLACE FUNCTION record_inventory_movement(
  p_batch_item_id UUID,
  p_movement_type TEXT,
  p_quantity INTEGER,
  p_note TEXT DEFAULT NULL,
  p_reference_order_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item inventory_batch_items%ROWTYPE;
  v_batch inventory_batches%ROWTYPE;
  v_state RECORD;
BEGIN
  -- Validate movement type and quantity
  IF p_movement_type NOT IN ('walk_in_sale', 'complimentary', 'damaged', 'wasted', 'stock_added', 'correction_increase', 'correction_decrease') THEN
    RAISE EXCEPTION 'Invalid movement type.';
  END IF;

  IF p_quantity <= 0 THEN
    RAISE EXCEPTION 'Movement quantity must be positive.';
  END IF;

  -- Lock the specific batch item
  SELECT * INTO v_item
  FROM inventory_batch_items
  WHERE id = p_batch_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventory batch item not found.';
  END IF;

  -- Get batch info
  SELECT * INTO v_batch
  FROM inventory_batches
  WHERE id = v_item.inventory_batch_id;

  IF v_batch.status != 'active' THEN
    RAISE EXCEPTION 'Movements can only be recorded on active batches.';
  END IF;

  -- Check available stock for outflows
  IF p_movement_type IN ('walk_in_sale', 'complimentary', 'damaged', 'wasted', 'correction_decrease') THEN
    SELECT * INTO v_state
    FROM live_inventory_status
    WHERE inventory_batch_item_id = p_batch_item_id;

    IF v_state.extra_available < p_quantity THEN
      RAISE EXCEPTION 'Insufficient stock. Only % available.', v_state.extra_available;
    END IF;
  END IF;

  -- Insert movement log
  INSERT INTO inventory_movements (
    inventory_batch_id,
    inventory_batch_item_id,
    meal_id,
    movement_type,
    quantity,
    reference_order_id,
    created_by,
    note
  ) VALUES (
    v_item.inventory_batch_id,
    v_item.id,
    v_item.meal_id,
    p_movement_type,
    p_quantity,
    p_reference_order_id,
    auth.uid(),
    p_note
  );

  -- Return recalculated state
  SELECT * INTO v_state
  FROM live_inventory_status
  WHERE inventory_batch_item_id = p_batch_item_id;

  RETURN row_to_json(v_state)::jsonb;
END;
$$;

-- 3. Close Inventory Batch
CREATE OR REPLACE FUNCTION close_inventory_batch(p_batch_id UUID, p_note TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch inventory_batches%ROWTYPE;
BEGIN
  -- Verify batch exists and get lock
  SELECT * INTO v_batch
  FROM inventory_batches
  WHERE id = p_batch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventory batch not found.';
  END IF;

  IF v_batch.status != 'active' THEN
    RAISE EXCEPTION 'Only active batches can be closed.';
  END IF;

  -- Set status to closed
  UPDATE inventory_batches
  SET status = 'closed',
      closed_at = now(),
      notes = COALESCE(p_note, notes),
      updated_at = now()
  WHERE id = p_batch_id;

  RETURN jsonb_build_object(
    'success', true,
    'batch_id', p_batch_id,
    'status', 'closed',
    'closed_at', now()
  );
END;
$$;

-- 4. Cancel Inventory Batch
CREATE OR REPLACE FUNCTION cancel_inventory_batch(p_batch_id UUID, p_note TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch inventory_batches%ROWTYPE;
BEGIN
  -- Verify batch exists and get lock
  SELECT * INTO v_batch
  FROM inventory_batches
  WHERE id = p_batch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventory batch not found.';
  END IF;

  IF v_batch.status = 'closed' OR v_batch.status = 'cancelled' THEN
    RAISE EXCEPTION 'Cannot cancel a closed or already cancelled batch.';
  END IF;

  -- Set status to cancelled
  UPDATE inventory_batches
  SET status = 'cancelled',
      cancelled_at = now(),
      notes = COALESCE(p_note, notes),
      updated_at = now()
  WHERE id = p_batch_id;

  RETURN jsonb_build_object(
    'success', true,
    'batch_id', p_batch_id,
    'status', 'cancelled',
    'cancelled_at', now()
  );
END;
$$;
