-- ============================================================================
-- RollBowl Migration 059: Walk-In Sale Feature
-- ============================================================================
-- Adds the walk_in_orders table and the place_walk_in_order() function to
-- support stall staff logging sales for customers who order directly at the
-- stall without using the app.
--
-- Inventory deduction integrates with the existing inventory_batch_items /
-- inventory_movements architecture (migrations 033-035) rather than any
-- legacy table.
-- ============================================================================

-- 1. Sequence for unique daily order numbers
-- Produces WI-YYYY-MM-DD-001, WI-YYYY-MM-DD-002, etc.
-- NOTE: This is a global sequence (not per-day) for simplicity & atomicity.
CREATE SEQUENCE IF NOT EXISTS walk_in_order_seq START 1;

-- 2. walk_in_orders table
CREATE TABLE public.walk_in_orders (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  stall_id         UUID          NOT NULL REFERENCES public.stalls(id) ON DELETE CASCADE,
  order_number     TEXT          NOT NULL UNIQUE,
  service_date     DATE          NOT NULL,
  batch_id         UUID          REFERENCES public.inventory_batches(id) ON DELETE SET NULL,
  items            JSONB         NOT NULL,
  total_amount     DECIMAL(10,2) NOT NULL DEFAULT 0,
  payment_method   TEXT          NOT NULL,
  notes            TEXT,
  created_by       UUID          REFERENCES public.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.walk_in_orders IS
  'Walk-in sales logged by stall staff for customers who order directly at the stall.';

-- 3. Indexes
CREATE INDEX idx_walk_in_orders_stall_date  ON public.walk_in_orders (stall_id, service_date);
CREATE INDEX idx_walk_in_orders_batch       ON public.walk_in_orders (batch_id);
CREATE INDEX idx_walk_in_orders_created_at  ON public.walk_in_orders (created_at DESC);

-- 4. Enable RLS
ALTER TABLE public.walk_in_orders ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies
-- Uses the existing is_staff_of_stall() helper (migration 053) for consistency.
CREATE POLICY walk_in_orders_staff_select
  ON public.walk_in_orders FOR SELECT
  USING (public.is_staff_of_stall(stall_id));

CREATE POLICY walk_in_orders_staff_insert
  ON public.walk_in_orders FOR INSERT
  WITH CHECK (public.is_staff_of_stall(stall_id));

-- 6. updated_at trigger
CREATE OR REPLACE FUNCTION public.update_walk_in_orders_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER walk_in_orders_updated_at
  BEFORE UPDATE ON public.walk_in_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_walk_in_orders_updated_at();

-- 7. place_walk_in_order() RPC
-- Atomically:
--   a) validates staff access
--   b) checks & deducts inventory from inventory_batch_items (loaded_quantity)
--   c) logs a walk_in_sale movement in inventory_movements per item
--   d) inserts the walk_in_orders record
--
-- p_items shape (JSONB array):
--   [{ "meal_id": "uuid", "quantity": 2, "unit_price": 80.00 }, ...]
--
-- p_batch_id can be NULL for stalls not using live inventory tracking.
-- When NULL, inventory deduction is skipped (untracked mode).
CREATE OR REPLACE FUNCTION public.place_walk_in_order(
  p_stall_id       UUID,
  p_service_date   DATE,
  p_batch_id       UUID,
  p_items          JSONB,
  p_payment_method TEXT,
  p_notes          TEXT,
  p_created_by     UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id            UUID;
  v_order_number        TEXT;
  v_total               DECIMAL(10,2) := 0;
  v_items_enriched      JSONB         := '[]'::JSONB;
  v_item                JSONB;
  v_meal_id             UUID;
  v_meal_name           TEXT;
  v_quantity            INTEGER;
  v_unit_price          DECIMAL(10,2);
  v_batch_item_id       UUID;
  v_current_loaded      INTEGER;
BEGIN
  -- Access guard
  IF NOT EXISTS (
    SELECT 1 FROM public.staff_assignments
    WHERE user_id = p_created_by
      AND stall_id = p_stall_id
  ) THEN
    RAISE EXCEPTION 'WALK_IN_ACCESS_DENIED: User % does not have staff access to stall %',
      p_created_by, p_stall_id;
  END IF;

  -- Validate items array is non-empty
  IF jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'WALK_IN_EMPTY_ORDER: Items array must not be empty';
  END IF;

  -- Generate order number: WI-YYYY-MM-DD-NNN
  v_order_number := 'WI-' || TO_CHAR(p_service_date, 'YYYY-MM-DD') || '-' ||
                    LPAD(NEXTVAL('walk_in_order_seq')::TEXT, 3, '0');

  -- Pass 1: validate meals, enrich items JSONB, accumulate total
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_meal_id    := (v_item->>'meal_id')::UUID;
    v_quantity   := (v_item->>'quantity')::INTEGER;
    v_unit_price := (v_item->>'unit_price')::DECIMAL(10,2);

    IF v_quantity <= 0 THEN
      RAISE EXCEPTION 'WALK_IN_INVALID_QTY: quantity must be > 0 for meal %', v_meal_id;
    END IF;

    SELECT name INTO v_meal_name FROM public.meals WHERE id = v_meal_id;
    IF v_meal_name IS NULL THEN
      RAISE EXCEPTION 'WALK_IN_MEAL_NOT_FOUND: Meal % not found', v_meal_id;
    END IF;

    v_total          := v_total + (v_quantity * v_unit_price);
    v_items_enriched := v_items_enriched || jsonb_build_array(
      jsonb_build_object(
        'meal_id',    v_meal_id,
        'meal_name',  v_meal_name,
        'quantity',   v_quantity,
        'unit_price', v_unit_price
      )
    );
  END LOOP;

  -- Pass 2: inventory check & deduction (only when batch provided)
  IF p_batch_id IS NOT NULL THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
      v_meal_id  := (v_item->>'meal_id')::UUID;
      v_quantity := (v_item->>'quantity')::INTEGER;

      -- Lock the batch item row to prevent concurrent over-deduction
      SELECT ibi.id, ibi.loaded_quantity
        INTO v_batch_item_id, v_current_loaded
        FROM public.inventory_batch_items ibi
        JOIN public.inventory_batches ib ON ib.id = ibi.inventory_batch_id
       WHERE ibi.inventory_batch_id = p_batch_id
         AND ibi.meal_id            = v_meal_id
         AND ib.stall_id            = p_stall_id
         AND ib.inventory_date      = p_service_date
       FOR UPDATE;

      IF v_batch_item_id IS NULL THEN
        RAISE EXCEPTION 'WALK_IN_NO_INVENTORY: No inventory batch item found for meal % in batch %',
          v_meal_id, p_batch_id;
      END IF;

      IF v_current_loaded < v_quantity THEN
        RAISE EXCEPTION 'WALK_IN_INSUFFICIENT_STOCK: meal %, available %, requested %',
          v_meal_id, v_current_loaded, v_quantity;
      END IF;

      -- Deduct from loaded_quantity
      UPDATE public.inventory_batch_items
         SET loaded_quantity = loaded_quantity - v_quantity,
             updated_at      = now()
       WHERE id = v_batch_item_id;

      -- Audit movement
      INSERT INTO public.inventory_movements (
        inventory_batch_id, inventory_batch_item_id, meal_id,
        movement_type, quantity, reference_order_id, created_by, note
      ) VALUES (
        p_batch_id, v_batch_item_id, v_meal_id,
        'walk_in_sale', v_quantity, NULL, p_created_by,
        'Walk-in sale: ' || v_order_number
      );
    END LOOP;
  END IF;

  -- Insert walk_in_orders record
  INSERT INTO public.walk_in_orders (
    stall_id, order_number, service_date, batch_id,
    items, total_amount, payment_method, notes, created_by
  ) VALUES (
    p_stall_id, v_order_number, p_service_date, p_batch_id,
    v_items_enriched, v_total, p_payment_method, p_notes, p_created_by
  ) RETURNING id INTO v_order_id;

  RETURN jsonb_build_object(
    'success',       true,
    'order_id',      v_order_id,
    'order_number',  v_order_number,
    'total',         v_total
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION '%', SQLERRM;
END;
$$;

COMMENT ON FUNCTION public.place_walk_in_order IS
  'Atomically creates a walk-in order, deducts inventory (if batch provided), and logs movements.';

REVOKE ALL ON FUNCTION public.place_walk_in_order(UUID, DATE, UUID, JSONB, TEXT, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.place_walk_in_order(UUID, DATE, UUID, JSONB, TEXT, TEXT, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.place_walk_in_order(UUID, DATE, UUID, JSONB, TEXT, TEXT, UUID) TO authenticated;
