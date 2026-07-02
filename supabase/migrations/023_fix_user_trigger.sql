-- ============================================================
-- RollBowl Migration 023: Fix User Trigger Name Default
-- ============================================================
-- The previous trigger allowed `name` to default to an empty string.
-- This caused the frontend UI to display "Unknown" for users created
-- outside the standard flow. We now properly fallback to email part.
-- ============================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, name, phone)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    -- 1. Try to get name from metadata, convert empty to NULL
    -- 2. Fallback to the part of email before @
    -- 3. Absolute fallback: 'Unknown User'
    COALESCE(
      NULLIF(TRIM(NEW.raw_user_meta_data ->> 'name'), ''), 
      SPLIT_PART(NEW.email, '@', 1), 
      'Unknown User'
    ),
    COALESCE(NEW.phone, '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
