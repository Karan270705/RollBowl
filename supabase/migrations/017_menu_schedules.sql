-- ============================================================
-- RollBowl Migration 017: Menu Schedules
-- ============================================================
-- Menu schedules act as the foundation for daily operations.
-- Customers order and subscribe based on the menu_schedules.
-- ============================================================

-- ─── Menu Schedules ──────────────────────────────────────────

CREATE TABLE menu_schedules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stall_id        UUID NOT NULL REFERENCES stalls(id) ON DELETE CASCADE,
  menu_date       DATE NOT NULL,
  visible_from    TIMESTAMPTZ NOT NULL,
  order_cutoff    TIMESTAMPTZ NOT NULL,
  is_published    BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE menu_schedules IS 'The source-of-truth menu for a specific date and stall.';

ALTER TABLE menu_schedules ADD CONSTRAINT unique_stall_menu_date UNIQUE (stall_id, menu_date);

CREATE OR REPLACE FUNCTION update_menu_schedules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER menu_schedules_updated_at_trigger
  BEFORE UPDATE ON menu_schedules
  FOR EACH ROW EXECUTE FUNCTION update_menu_schedules_updated_at();

-- ─── Menu Schedule Items ─────────────────────────────────────

CREATE TABLE menu_schedule_items (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_schedule_id        UUID NOT NULL REFERENCES menu_schedules(id) ON DELETE CASCADE,
  meal_id                 UUID NOT NULL REFERENCES meals(id) ON DELETE RESTRICT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE menu_schedule_items IS 'Meals offered on a specific menu schedule. Quantities are managed by inventory logic.';

ALTER TABLE menu_schedule_items ADD CONSTRAINT unique_schedule_meal UNIQUE (menu_schedule_id, meal_id);

-- ─── Row Level Security ──────────────────────────────────────

ALTER TABLE menu_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_schedule_items ENABLE ROW LEVEL SECURITY;

-- 1. Operations (kitchen / stall_operator) have full access
CREATE POLICY menu_schedules_ops_all ON menu_schedules
  FOR ALL USING (
    get_user_role() IN ('kitchen', 'stall_operator')
  ) WITH CHECK (
    get_user_role() IN ('kitchen', 'stall_operator')
  );

CREATE POLICY menu_schedule_items_ops_all ON menu_schedule_items
  FOR ALL USING (
    get_user_role() IN ('kitchen', 'stall_operator')
  ) WITH CHECK (
    get_user_role() IN ('kitchen', 'stall_operator')
  );

-- 2. Customers can only read published schedules
CREATE POLICY menu_schedules_customer_select ON menu_schedules
  FOR SELECT USING (
    is_published = true
  );

CREATE POLICY menu_schedule_items_customer_select ON menu_schedule_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM menu_schedules
      WHERE id = menu_schedule_items.menu_schedule_id
        AND is_published = true
    )
  );

-- ─── Indexes ─────────────────────────────────────────────────

CREATE INDEX idx_menu_schedules_stall_date ON menu_schedules(stall_id, menu_date);
CREATE INDEX idx_menu_schedule_items_schedule ON menu_schedule_items(menu_schedule_id);

-- ============================================================
-- END OF MIGRATION 017
-- ============================================================
