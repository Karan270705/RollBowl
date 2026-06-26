-- ============================================================
-- RollBowl Migration 012: Storage Buckets
-- ============================================================
-- Creates Supabase Storage buckets for static assets.
-- Requires running in the Supabase SQL editor (storage schema).
-- ============================================================

-- ─── Meal Images Bucket ─────────────────────────────────────
-- Public read, authenticated upload.

INSERT INTO storage.buckets (id, name, public)
VALUES ('meal-images', 'meal-images', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public reads
CREATE POLICY storage_meal_images_read ON storage.objects
  FOR SELECT USING (bucket_id = 'meal-images');

-- Allow authenticated users to upload (operators only in practice)
CREATE POLICY storage_meal_images_insert ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'meal-images'
    AND auth.role() = 'authenticated'
  );

-- Allow owners to update/delete their uploads
CREATE POLICY storage_meal_images_update ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'meal-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY storage_meal_images_delete ON storage.objects
  FOR DELETE USING (
    bucket_id = 'meal-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );


-- ─── User Avatars Bucket ────────────────────────────────────
-- Public read, user can upload own avatar only.

INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY storage_avatars_read ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

CREATE POLICY storage_avatars_insert ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY storage_avatars_update ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY storage_avatars_delete ON storage.objects
  FOR DELETE USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );


-- ─── Stall Images Bucket ───────────────────────────────────
-- Public read, operators upload.

INSERT INTO storage.buckets (id, name, public)
VALUES ('stall-images', 'stall-images', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY storage_stall_images_read ON storage.objects
  FOR SELECT USING (bucket_id = 'stall-images');

CREATE POLICY storage_stall_images_insert ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'stall-images'
    AND auth.role() = 'authenticated'
  );
