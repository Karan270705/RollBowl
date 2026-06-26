-- ============================================================
-- RollBowl MVP Seed Data (Final — validated UUIDs)
-- ============================================================
-- All UUIDs use hex characters only (0-9, a-f). Valid per RFC 4122.
-- Idempotent: ON CONFLICT DO NOTHING on all inserts.
-- Run as service_role in Supabase SQL Editor.
--
-- INSERT ORDER:
--   1. UPDATE users role
--   2. cities
--   3. universities  (FK → cities)
--   4. colleges      (FK → universities, cities)
--   5. stalls        (FK → colleges, users)
--   6. meals         (FK → stalls)
-- ============================================================
-- ─── 1. Promote existing user to stall_operator ─────────────
UPDATE public.users
SET role = 'stall_operator'::user_role
WHERE id = '50b623b0-984f-44ff-9667-97804e1f6947';
-- ─── 2. City ────────────────────────────────────────────────
INSERT INTO cities (id, name, state, is_active)
VALUES (
  'c1c10000-0000-0000-0000-000000000001',
  'Demo City',
  'Demo State',
  true
)
ON CONFLICT (id) DO NOTHING;
-- ─── 3. University ──────────────────────────────────────────
INSERT INTO universities (id, name, city_id, logo_url)
VALUES (
  'a01c0000-0000-0000-0000-000000000001',
  'Demo University',
  'c1c10000-0000-0000-0000-000000000001',
  NULL
)
ON CONFLICT (id) DO NOTHING;
-- ─── 4. College ─────────────────────────────────────────────
INSERT INTO colleges (id, name, university_id, city_id, address, is_active)
VALUES (
  'c011e6e0-0000-0000-0000-000000000001',
  'Demo College',
  'a01c0000-0000-0000-0000-000000000001',
  'c1c10000-0000-0000-0000-000000000001',
  'Main Campus, Demo City',
  true
)
ON CONFLICT (id) DO NOTHING;
-- ─── 5. Stall ───────────────────────────────────────────────
INSERT INTO stalls (id, name, college_id, operator_id, description, image_url, is_active, rating, total_ratings)
VALUES (
  '57a11000-0000-0000-0000-000000000001',
  'RollBowl Main Stall',
  'c011e6e0-0000-0000-0000-000000000001',
  '50b623b0-984f-44ff-9667-97804e1f6947',
  'Your go-to spot for delicious rolls and rice bowls on campus.',
  '',
  true,
  0.00,
  0
)
ON CONFLICT (id) DO NOTHING;
-- ─── 6. Meals — Rolls (7 items) ─────────────────────────────
INSERT INTO meals (
  id, name, description,
  price, original_price,
  category, type,
  stall_id, image_url,
  is_available, is_featured,
  rating, total_ratings,
  preparation_time, nutrition, tags
)
VALUES
  (
    'ea010000-0000-0000-0000-000000000001',
    'Veggie Potato Roll',
    'Crispy roll stuffed with spiced mashed potatoes and fresh herbs.',
    100.00, 120.00,
    'snacks'::meal_category, 'veg'::meal_type,
    '57a11000-0000-0000-0000-000000000001',
    '', true, false, 0.00, 0, 8,
    '{}'::jsonb,
    ARRAY['roll', 'potato', 'veg', 'snack', 'bestseller']
  ),
  (
    'ea010000-0000-0000-0000-000000000002',
    'Paneer Delight Roll',
    'Soft paneer cubes tossed in tangy masala, wrapped in a warm roll.',
    100.00, 120.00,
    'snacks'::meal_category, 'veg'::meal_type,
    '57a11000-0000-0000-0000-000000000001',
    '', true, false, 0.00, 0, 10,
    '{}'::jsonb,
    ARRAY['roll', 'paneer', 'veg', 'snack', 'protein-rich']
  ),
  (
    'ea010000-0000-0000-0000-000000000003',
    'Chatpata Chole Roll',
    'Tangy and spicy chickpeas with onions and chutney in a flaky roll.',
    100.00, 120.00,
    'snacks'::meal_category, 'veg'::meal_type,
    '57a11000-0000-0000-0000-000000000001',
    '', true, false, 0.00, 0, 8,
    '{}'::jsonb,
    ARRAY['roll', 'chole', 'chickpea', 'veg', 'snack', 'spicy']
  ),
  (
    'ea010000-0000-0000-0000-000000000004',
    'Rajma Bean Roll',
    'Hearty kidney beans in a rich gravy, rolled up for a satisfying bite.',
    100.00, 120.00,
    'snacks'::meal_category, 'veg'::meal_type,
    '57a11000-0000-0000-0000-000000000001',
    '', true, false, 0.00, 0, 9,
    '{}'::jsonb,
    ARRAY['roll', 'rajma', 'kidney-beans', 'veg', 'snack', 'protein-rich']
  ),
  (
    'ea010000-0000-0000-0000-000000000005',
    'Soya Protein Roll',
    'High-protein soya chunks cooked in aromatic spices, wrapped fresh.',
    100.00, 120.00,
    'snacks'::meal_category, 'veg'::meal_type,
    '57a11000-0000-0000-0000-000000000001',
    '', true, false, 0.00, 0, 10,
    '{}'::jsonb,
    ARRAY['roll', 'soya', 'veg', 'snack', 'high-protein', 'healthy']
  ),
  (
    'ea010000-0000-0000-0000-000000000006',
    'Veggie Cabbage Roll',
    'Crunchy shredded cabbage with mild spices in a light, crisp roll.',
    100.00, 120.00,
    'snacks'::meal_category, 'veg'::meal_type,
    '57a11000-0000-0000-0000-000000000001',
    '', true, false, 0.00, 0, 8,
    '{}'::jsonb,
    ARRAY['roll', 'cabbage', 'veg', 'snack', 'light', 'low-calorie']
  ),
  (
    'ea010000-0000-0000-0000-000000000007',
    'Mixed Sprouts Roll',
    'Nutritious mixed sprouts sautéed with lemon and green chili in a warm roll.',
    100.00, 120.00,
    'snacks'::meal_category, 'veg'::meal_type,
    '57a11000-0000-0000-0000-000000000001',
    '', true, false, 0.00, 0, 9,
    '{}'::jsonb,
    ARRAY['roll', 'sprouts', 'veg', 'snack', 'healthy', 'high-protein']
  )
ON CONFLICT (id) DO NOTHING;
-- ─── 7. Meals — Rice Bowls (3 items) ────────────────────────
INSERT INTO meals (
  id, name, description,
  price, original_price,
  category, type,
  stall_id, image_url,
  is_available, is_featured,
  rating, total_ratings,
  preparation_time, nutrition, tags
)
VALUES
  (
    'ea010000-0000-0000-0000-000000000008',
    'Dal Tadka Rice Bowl',
    'Classic yellow dal with smoky tadka served over steamed basmati rice.',
    150.00, 180.00,
    'lunch'::meal_category, 'veg'::meal_type,
    '57a11000-0000-0000-0000-000000000001',
    '', true, false, 0.00, 0, 12,
    '{}'::jsonb,
    ARRAY['rice-bowl', 'dal', 'tadka', 'veg', 'lunch', 'comfort-food']
  ),
  (
    'ea010000-0000-0000-0000-000000000009',
    'Rajma Rice Bowl',
    'Punjabi-style rajma in thick tomato gravy paired with fluffy rice.',
    150.00, 180.00,
    'lunch'::meal_category, 'veg'::meal_type,
    '57a11000-0000-0000-0000-000000000001',
    '', true, false, 0.00, 0, 14,
    '{}'::jsonb,
    ARRAY['rice-bowl', 'rajma', 'veg', 'lunch', 'protein-rich', 'hearty']
  ),
  (
    'ea010000-0000-0000-0000-000000000010',
    'Chole Rice Bowl',
    'Spicy Amritsari chole served over aromatic jeera rice.',
    150.00, 180.00,
    'lunch'::meal_category, 'veg'::meal_type,
    '57a11000-0000-0000-0000-000000000001',
    '', true, false, 0.00, 0, 13,
    '{}'::jsonb,
    ARRAY['rice-bowl', 'chole', 'chickpea', 'veg', 'lunch', 'spicy']
  )
ON CONFLICT (id) DO NOTHING;

-- ─── Row counts ─────────────────────────────────────────────
SELECT 'cities'       AS table_name, COUNT(*) AS row_count FROM cities
UNION ALL
SELECT 'universities',               COUNT(*)              FROM universities
UNION ALL
SELECT 'colleges',                   COUNT(*)              FROM colleges
UNION ALL
SELECT 'stalls',                     COUNT(*)              FROM stalls
UNION ALL
SELECT 'meals',                      COUNT(*)              FROM meals
ORDER BY table_name;
-- Expected:
-- cities        | 1
-- colleges      | 1
-- meals         | 10
-- stalls        | 1
-- universities  | 1
-- ─── Operator role ───────────────────────────────────────────
SELECT id, name, email, role
FROM users
WHERE id = '50b623b0-984f-44ff-9667-97804e1f6947';
-- Expected: role = 'stall_operator'
-- ─── Full FK chain ───────────────────────────────────────────
SELECT
  c.name   AS city,
  un.name  AS university,
  co.name  AS college,
  st.name  AS stall,
  u.id     AS operator_id,
  u.role   AS operator_role
FROM stalls st
  JOIN colleges co     ON st.college_id    = co.id
  JOIN universities un ON co.university_id = un.id
  JOIN cities c        ON co.city_id       = c.id
  JOIN users u         ON st.operator_id   = u.id
WHERE st.id = '57a11000-0000-0000-0000-000000000001';
-- Expected single row:
-- Demo City | Demo University | Demo College | RollBowl Main Stall
-- | 50b623b0-984f-44ff-9667-97804e1f6947 | stall_operator
-- ─── Meals summary ───────────────────────────────────────────
SELECT name, price, original_price, category, type, preparation_time
FROM meals
WHERE stall_id = '57a11000-0000-0000-0000-000000000001'
ORDER BY category, name;
-- Expected: 10 rows — 7 snacks (price 100), 3 lunch (price 150), all veg
-- ─── Enum sanity ─────────────────────────────────────────────
SELECT DISTINCT category FROM meals WHERE stall_id = '57a11000-0000-0000-0000-000000000001';
-- Expected: snacks, lunch
SELECT DISTINCT type FROM meals WHERE stall_id = '57a11000-0000-0000-0000-000000000001';
-- Expected: veg