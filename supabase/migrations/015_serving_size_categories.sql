-- ============================================================
-- RollBowl Migration 015: Serving Size & Categories
-- ============================================================
-- Business categories renamed: 'snacks' -> 'roll', 'lunch' -> 'bowl'
-- New column: serving_size
-- Existing meals updated to reflect the new sizes and categories
-- ============================================================

-- ─── 1. Rename Enum Values ──────────────────────────────────
-- We use RENAME VALUE which is supported in PostgreSQL 10+
-- This avoids recreating the enum and updating all dependent tables.

ALTER TYPE meal_category RENAME VALUE 'snacks' TO 'roll';
ALTER TYPE meal_category RENAME VALUE 'lunch' TO 'bowl';

-- ─── 2. Add serving_size column ─────────────────────────────
ALTER TABLE meals ADD COLUMN IF NOT EXISTS serving_size TEXT;

-- ─── 3. Populate serving_size ───────────────────────────────
UPDATE meals 
SET serving_size = '1 Roll'
WHERE category = 'roll';

UPDATE meals 
SET serving_size = '350 mL'
WHERE category = 'bowl';

-- ─── 4. Verification Queries ────────────────────────────────
-- Display enum values
SELECT enum_range(NULL::meal_category) AS meal_categories;

-- Display updated meals
SELECT name, category, serving_size 
FROM meals 
ORDER BY category, name;
