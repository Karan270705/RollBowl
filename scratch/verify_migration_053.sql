-- ============================================================
-- Migration 053 Verification Script
-- Run this in Supabase SQL Editor to verify migration success
-- ============================================================

-- 1. Check if staff_assignments table was created
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'staff_assignments'
) AS staff_assignments_exists;

-- 2. Check staff assignments created
SELECT
  role,
  count(*) as count
FROM public.staff_assignments
GROUP BY role
ORDER BY role;

-- 3. Check if subscriptions.stall_id column exists and is NOT NULL
SELECT
  column_name,
  is_nullable,
  data_type
FROM information_schema.columns
WHERE table_name = 'subscriptions'
  AND column_name = 'stall_id';

-- 4. CRITICAL: Check for any NULL stall_id in subscriptions
SELECT count(*) as subscriptions_with_null_stall_id
FROM public.subscriptions
WHERE stall_id IS NULL;

-- 5. Check total subscriptions and their stall distribution
SELECT
  stall_id,
  count(*) as subscription_count
FROM public.subscriptions
GROUP BY stall_id;

-- 6. Check total stalls in system
SELECT
  id,
  name,
  is_active,
  operator_id
FROM public.stalls
ORDER BY created_at;

-- 7. Check if new RLS policies exist
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd
FROM pg_policies
WHERE tablename IN ('subscriptions', 'orders', 'staff_assignments', 'payment_settings', 'meals')
ORDER BY tablename, policyname;

-- 8. Check if old policies were dropped (should NOT exist)
SELECT
  policyname
FROM pg_policies
WHERE tablename = 'orders'
  AND policyname IN ('orders_kitchen_select', 'orders_ops_select');

-- 9. Check is_staff_of_stall function exists
SELECT
  proname,
  pg_get_function_identity_arguments(oid) as signature
FROM pg_proc
WHERE proname = 'is_staff_of_stall';

-- 10. Check purchase_subscription function signature
SELECT
  proname,
  pg_get_function_identity_arguments(oid) as signature
FROM pg_proc
WHERE proname = 'purchase_subscription';

-- 11. Check total kitchen users in system
SELECT count(*) as total_kitchen_users
FROM public.users
WHERE role = 'kitchen';
