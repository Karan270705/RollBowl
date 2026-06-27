-- ============================================================
-- RollBowl Seed: Real Catalog (27 Products)
-- ============================================================
-- Idempotent script to replace old demo meals with the real catalog.
-- Run in Supabase SQL Editor.
-- ============================================================

-- 1. Remove old demo meals (Explicit deletes avoid TRUNCATE CASCADE)
-- Note: In a fresh MVP database with no active orders, this is safe.
-- If FK violations occur, ensure child tables are cleared first.
DELETE FROM meals;

-- 2. Insert the Real 27 Product Catalog
INSERT INTO meals (
  id, name, description,
  price, original_price,
  category, type,
  stall_id, image_url,
  is_available, is_featured,
  rating, total_ratings,
  preparation_time, serving_size, nutrition, tags
)
VALUES
  -- ─── ROLLS (8 Items) ─────────────────────────────────────────
  (
    'a0010000-0000-0000-0000-000000000001', 'Veggie Potato Roll',
    'A wholesome roll filled with steamed mashed potatoes, fresh onions, green chillies, mint, curry leaves, and aromatic spices, finished with fresh coriander. Wrapped in a soft whole wheat flatbread and lightly roasted in pure ghee.',
    55.00, NULL, 'roll'::meal_category, 'veg'::meal_type, '57a11000-0000-0000-0000-000000000001', '', 
    true, true, 0.00, 0, 10, '1 Roll', '{}'::jsonb, ARRAY['roll', 'veg', 'potato']
  ),
  (
    'a0010000-0000-0000-0000-000000000002', 'Paneer Delight Roll',
    'A delicious blend of freshly grated paneer, onions, tomatoes, and signature Indian spices, garnished with fresh coriander. Wrapped in a whole wheat flatbread and roasted to perfection in ghee.',
    85.00, NULL, 'roll'::meal_category, 'veg'::meal_type, '57a11000-0000-0000-0000-000000000001', '', 
    true, true, 0.00, 0, 12, '1 Roll', '{}'::jsonb, ARRAY['roll', 'veg', 'paneer']
  ),
  (
    'a0010000-0000-0000-0000-000000000003', 'Soyabean Roll',
    'A nutritious roll packed with seasoned soya chunks, fresh onions, tomatoes, and flavorful Indian spices. Wrapped in a whole wheat flatbread and lightly roasted in ghee.',
    49.00, NULL, 'roll'::meal_category, 'veg'::meal_type, '57a11000-0000-0000-0000-000000000001', '', 
    true, false, 0.00, 0, 10, '1 Roll', '{}'::jsonb, ARRAY['roll', 'veg', 'soya']
  ),
  (
    'a0010000-0000-0000-0000-000000000004', 'Chole Masala Roll',
    'Protein-rich chickpeas cooked with onions, tomato puree, traditional chole spices, and herbs for a bold, tangy flavor. Wrapped in a whole wheat flatbread and lightly roasted in ghee.',
    59.00, NULL, 'roll'::meal_category, 'veg'::meal_type, '57a11000-0000-0000-0000-000000000001', '', 
    true, false, 0.00, 0, 10, '1 Roll', '{}'::jsonb, ARRAY['roll', 'veg', 'chole']
  ),
  (
    'a0010000-0000-0000-0000-000000000005', 'Rajma Bean Roll',
    'Tender kidney beans simmered with onions, tomato puree, and aromatic spices, finished with fresh coriander. Wrapped in a soft whole wheat flatbread and roasted in ghee for a satisfying bite.',
    59.00, NULL, 'roll'::meal_category, 'veg'::meal_type, '57a11000-0000-0000-0000-000000000001', '', 
    true, false, 0.00, 0, 10, '1 Roll', '{}'::jsonb, ARRAY['roll', 'veg', 'rajma']
  ),
  (
    'a0010000-0000-0000-0000-000000000006', 'Veggie Roll',
    'Fresh cabbage, onions, tomatoes, carrot and aromatic spices wrapped in a whole wheat flatbread and roasted in ghee.',
    49.00, NULL, 'roll'::meal_category, 'veg'::meal_type, '57a11000-0000-0000-0000-000000000001', '', 
    false, false, 0.00, 0, 8, '1 Roll', '{}'::jsonb, ARRAY['roll', 'veg', 'cabbage']
  ),
  (
    'a0010000-0000-0000-0000-000000000007', 'Matki Masala Roll',
    'Nutritious moth beans (matki) cooked with traditional spices wrapped in a whole wheat flatbread.',
    55.00, NULL, 'roll'::meal_category, 'veg'::meal_type, '57a11000-0000-0000-0000-000000000001', '', 
    false, false, 0.00, 0, 10, '1 Roll', '{}'::jsonb, ARRAY['roll', 'veg', 'matki']
  ),
  (
    'a0010000-0000-0000-0000-000000000008', 'Mix Sprouts Roll',
    'Protein-rich mixed sprouts with onions, tomatoes, and fresh coriander wrapped in a whole wheat flatbread and roasted in ghee.',
    59.00, NULL, 'roll'::meal_category, 'veg'::meal_type, '57a11000-0000-0000-0000-000000000001', '', 
    false, false, 0.00, 0, 10, '1 Roll', '{}'::jsonb, ARRAY['roll', 'veg', 'sprouts']
  ),

  -- ─── BOWLS (5 Items) ─────────────────────────────────────────
  (
    'a0010000-0000-0000-0000-000000000009', 'Dal Tadka Rice Bowl',
    'Steamed premium basmati rice served with comforting yellow dal, tempered in pure ghee with traditional Indian spices for a rich and homely taste.',
    59.00, NULL, 'bowl'::meal_category, 'veg'::meal_type, '57a11000-0000-0000-0000-000000000001', '', 
    true, true, 0.00, 0, 15, '350 mL', '{}'::jsonb, ARRAY['bowl', 'veg', 'dal']
  ),
  (
    'a0010000-0000-0000-0000-000000000010', 'Chole Masala Rice Bowl',
    'Steamed basmati rice served with authentic chickpea curry cooked in a flavorful onion-tomato gravy and traditional Indian spices.',
    69.00, NULL, 'bowl'::meal_category, 'veg'::meal_type, '57a11000-0000-0000-0000-000000000001', '', 
    true, false, 0.00, 0, 15, '350 mL', '{}'::jsonb, ARRAY['bowl', 'veg', 'chole']
  ),
  (
    'a0010000-0000-0000-0000-000000000011', 'Rajma Bean Rice Bowl',
    'Fluffy basmati rice paired with a hearty rajma curry made from tender kidney beans, onion-tomato gravy, aromatic spices, and fresh coriander.',
    69.00, NULL, 'bowl'::meal_category, 'veg'::meal_type, '57a11000-0000-0000-0000-000000000001', '', 
    true, false, 0.00, 0, 15, '350 mL', '{}'::jsonb, ARRAY['bowl', 'veg', 'rajma']
  ),
  (
    'a0010000-0000-0000-0000-000000000012', 'Soyabean Rice Bowl',
    'Nutritious soya chunks cooked in a rich gravy, served alongside steamed basmati rice.',
    55.00, NULL, 'bowl'::meal_category, 'veg'::meal_type, '57a11000-0000-0000-0000-000000000001', '', 
    false, false, 0.00, 0, 15, '350 mL', '{}'::jsonb, ARRAY['bowl', 'veg', 'soya']
  ),
  (
    'a0010000-0000-0000-0000-000000000013', 'Veg Pulao Rice Bowl',
    'Aromatic basmati rice cooked with mixed vegetables and whole spices.',
    59.00, NULL, 'bowl'::meal_category, 'veg'::meal_type, '57a11000-0000-0000-0000-000000000001', '', 
    false, false, 0.00, 0, 15, '350 mL', '{}'::jsonb, ARRAY['bowl', 'veg', 'pulao']
  ),

  -- ─── DOUBLE ROLL COMBOS (8 Items) ────────────────────────────
  (
    'a0010000-0000-0000-0000-000000000014', '2 Veggie Potato Roll',
    'A satisfying combo containing 2 Veggie Potato Rolls.',
    99.00, 110.00, 'combo'::meal_category, 'veg'::meal_type, '57a11000-0000-0000-0000-000000000001', '', 
    true, false, 0.00, 0, 12, '1 Meal', '{}'::jsonb, ARRAY['combo', 'veg', 'roll']
  ),
  (
    'a0010000-0000-0000-0000-000000000015', '2 Paneer Delight Roll',
    'A satisfying combo containing 2 Paneer Delight Rolls.',
    159.00, 170.00, 'combo'::meal_category, 'veg'::meal_type, '57a11000-0000-0000-0000-000000000001', '', 
    true, true, 0.00, 0, 15, '1 Meal', '{}'::jsonb, ARRAY['combo', 'veg', 'roll', 'paneer']
  ),
  (
    'a0010000-0000-0000-0000-000000000016', '2 Soyabean Roll',
    'A satisfying combo containing 2 Soyabean Rolls.',
    89.00, 98.00, 'combo'::meal_category, 'veg'::meal_type, '57a11000-0000-0000-0000-000000000001', '', 
    true, false, 0.00, 0, 12, '1 Meal', '{}'::jsonb, ARRAY['combo', 'veg', 'roll']
  ),
  (
    'a0010000-0000-0000-0000-000000000017', '2 Chole Masala Roll',
    'A satisfying combo containing 2 Chole Masala Rolls.',
    109.00, 118.00, 'combo'::meal_category, 'veg'::meal_type, '57a11000-0000-0000-0000-000000000001', '', 
    false, false, 0.00, 0, 12, '1 Meal', '{}'::jsonb, ARRAY['combo', 'veg', 'roll']
  ),
  (
    'a0010000-0000-0000-0000-000000000018', '2 Rajma Bean Roll',
    'A satisfying combo containing 2 Rajma Bean Rolls.',
    109.00, 118.00, 'combo'::meal_category, 'veg'::meal_type, '57a11000-0000-0000-0000-000000000001', '', 
    false, false, 0.00, 0, 12, '1 Meal', '{}'::jsonb, ARRAY['combo', 'veg', 'roll']
  ),
  (
    'a0010000-0000-0000-0000-000000000019', '2 Veggie Roll',
    'A satisfying combo containing 2 Veggie Rolls.',
    89.00, 98.00, 'combo'::meal_category, 'veg'::meal_type, '57a11000-0000-0000-0000-000000000001', '', 
    false, false, 0.00, 0, 10, '1 Meal', '{}'::jsonb, ARRAY['combo', 'veg', 'roll']
  ),
  (
    'a0010000-0000-0000-0000-000000000020', '2 Matki Masala Roll',
    'A satisfying combo containing 2 Matki Masala Rolls.',
    99.00, 110.00, 'combo'::meal_category, 'veg'::meal_type, '57a11000-0000-0000-0000-000000000001', '', 
    false, false, 0.00, 0, 12, '1 Meal', '{}'::jsonb, ARRAY['combo', 'veg', 'roll']
  ),
  (
    'a0010000-0000-0000-0000-000000000021', '2 Mix Sprouts Roll',
    'A satisfying combo containing 2 Mix Sprouts Rolls.',
    109.00, 118.00, 'combo'::meal_category, 'veg'::meal_type, '57a11000-0000-0000-0000-000000000001', '', 
    false, false, 0.00, 0, 12, '1 Meal', '{}'::jsonb, ARRAY['combo', 'veg', 'roll']
  ),

  -- ─── ROLL + BOWL COMBOS (6 Items) ────────────────────────────
  (
    'a0010000-0000-0000-0000-000000000022', 'Paneer Delight Roll & Dal Tadka Rice Bowl',
    'A satisfying combo containing Paneer Delight Roll and Dal Tadka Rice Bowl.',
    139.00, 144.00, 'combo'::meal_category, 'veg'::meal_type, '57a11000-0000-0000-0000-000000000001', '', 
    true, true, 0.00, 0, 20, '1 Meal', '{}'::jsonb, ARRAY['combo', 'veg', 'roll', 'bowl', 'paneer']
  ),
  (
    'a0010000-0000-0000-0000-000000000023', 'Soyabean Roll & Dal Tadka Rice Bowl',
    'A satisfying combo containing Soyabean Roll and Dal Tadka Rice Bowl.',
    99.00, 108.00, 'combo'::meal_category, 'veg'::meal_type, '57a11000-0000-0000-0000-000000000001', '', 
    true, false, 0.00, 0, 18, '1 Meal', '{}'::jsonb, ARRAY['combo', 'veg', 'roll', 'bowl']
  ),
  (
    'a0010000-0000-0000-0000-000000000024', 'Veggie Potato Roll & Rajma Bean Rice Bowl',
    'A satisfying combo containing Veggie Potato Roll and Rajma Bean Rice Bowl.',
    115.00, 124.00, 'combo'::meal_category, 'veg'::meal_type, '57a11000-0000-0000-0000-000000000001', '', 
    true, false, 0.00, 0, 18, '1 Meal', '{}'::jsonb, ARRAY['combo', 'veg', 'roll', 'bowl']
  ),
  (
    'a0010000-0000-0000-0000-000000000025', 'Rajma Bean Roll & Rajma Bean Rice Bowl',
    'A satisfying combo containing Rajma Bean Roll and Rajma Bean Rice Bowl.',
    119.00, 128.00, 'combo'::meal_category, 'veg'::meal_type, '57a11000-0000-0000-0000-000000000001', '', 
    false, false, 0.00, 0, 18, '1 Meal', '{}'::jsonb, ARRAY['combo', 'veg', 'roll', 'bowl']
  ),
  (
    'a0010000-0000-0000-0000-000000000026', 'Chole Masala Roll & Chole Masala Rice Bowl',
    'A satisfying combo containing Chole Masala Roll and Chole Masala Rice Bowl.',
    119.00, 128.00, 'combo'::meal_category, 'veg'::meal_type, '57a11000-0000-0000-0000-000000000001', '', 
    false, false, 0.00, 0, 18, '1 Meal', '{}'::jsonb, ARRAY['combo', 'veg', 'roll', 'bowl']
  ),
  (
    'a0010000-0000-0000-0000-000000000027', 'Veggie Roll & Chole Masala Rice Bowl',
    'A satisfying combo containing Veggie Roll and Chole Masala Rice Bowl.',
    109.00, 118.00, 'combo'::meal_category, 'veg'::meal_type, '57a11000-0000-0000-0000-000000000001', '', 
    false, false, 0.00, 0, 15, '1 Meal', '{}'::jsonb, ARRAY['combo', 'veg', 'roll', 'bowl']
  );

-- 3. Update Image URLs for the 10 provided meals
UPDATE meals SET image_url = 'https://xhyojkqsgpvjctmdqxzq.supabase.co/storage/v1/object/public/meal-images/chole-masala-rice-bowl-image.png' WHERE name = 'Chole Masala Rice Bowl';
UPDATE meals SET image_url = 'https://xhyojkqsgpvjctmdqxzq.supabase.co/storage/v1/object/public/meal-images/chole-masala-roll-image.jpeg' WHERE name = 'Chole Masala Roll';
UPDATE meals SET image_url = 'https://xhyojkqsgpvjctmdqxzq.supabase.co/storage/v1/object/public/meal-images/dal-tadka-rice-bowl-image.png' WHERE name = 'Dal Tadka Rice Bowl';
UPDATE meals SET image_url = 'https://xhyojkqsgpvjctmdqxzq.supabase.co/storage/v1/object/public/meal-images/mix-sprout-roll-image.jpeg' WHERE name = 'Mix Sprouts Roll';
UPDATE meals SET image_url = 'https://xhyojkqsgpvjctmdqxzq.supabase.co/storage/v1/object/public/meal-images/paneer-delight-roll-image.png' WHERE name = 'Paneer Delight Roll';
UPDATE meals SET image_url = 'https://xhyojkqsgpvjctmdqxzq.supabase.co/storage/v1/object/public/meal-images/rajma-bean-rice-bowl-image.png' WHERE name = 'Rajma Bean Rice Bowl';
UPDATE meals SET image_url = 'https://xhyojkqsgpvjctmdqxzq.supabase.co/storage/v1/object/public/meal-images/rajma-bean-roll-image.png' WHERE name = 'Rajma Bean Roll';
UPDATE meals SET image_url = 'https://xhyojkqsgpvjctmdqxzq.supabase.co/storage/v1/object/public/meal-images/soyabean-roll-image.jpeg' WHERE name = 'Soyabean Roll';
UPDATE meals SET image_url = 'https://xhyojkqsgpvjctmdqxzq.supabase.co/storage/v1/object/public/meal-images/veggie-potato-roll-image.jpeg' WHERE name = 'Veggie Potato Roll';
UPDATE meals SET image_url = 'https://xhyojkqsgpvjctmdqxzq.supabase.co/storage/v1/object/public/meal-images/veggie-roll-image.jpeg' WHERE name = 'Veggie Roll';
