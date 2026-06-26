-- ============================================================
-- RollBowl Migration 008: Notifications
-- ============================================================
-- System notifications for order updates, promotions, etc.
-- ============================================================

CREATE TABLE notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  type        notification_type NOT NULL,
  is_read     BOOLEAN NOT NULL DEFAULT false,
  data        JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE notifications IS 'In-app notifications for users.';
COMMENT ON COLUMN notifications.data IS 'Optional JSON payload (e.g., { orderId, screen }).';
