-- ============================================================
-- RollBowl Migration 025: Backfill User Phones
-- ============================================================
-- One-time backfill to extract phone numbers from raw_user_meta_data
-- for existing users who signed up via email before the trigger fix.
-- ============================================================

UPDATE public.users pu
SET phone = au.raw_user_meta_data ->> 'phone'
FROM auth.users au
WHERE pu.id = au.id
  AND (pu.phone IS NULL OR TRIM(pu.phone) = '')
  AND au.raw_user_meta_data ->> 'phone' IS NOT NULL
  AND TRIM(au.raw_user_meta_data ->> 'phone') != '';
