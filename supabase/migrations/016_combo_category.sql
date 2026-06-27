-- ============================================================
-- RollBowl Migration 016: Combo Category
-- ============================================================
-- Business categories renamed: 'combos' -> 'combo'
-- ============================================================

-- Rename Enum Value (supported in PostgreSQL 10+)
ALTER TYPE meal_category RENAME VALUE 'combos' TO 'combo';
