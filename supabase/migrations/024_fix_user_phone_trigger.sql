-- ============================================================
-- RollBowl Migration 024: Fix User Trigger Phone Default
-- ============================================================
-- The previous trigger attempted to use NEW.phone, but since 
-- users sign up via email, NEW.phone is NULL. The phone number 
-- is actually stored inside raw_user_meta_data.
-- ============================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, name, phone)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(
      NULLIF(TRIM(NEW.raw_user_meta_data ->> 'name'), ''), 
      SPLIT_PART(NEW.email, '@', 1), 
      'Unknown User'
    ),
    -- 1. Try NEW.phone (if OTP used)
    -- 2. Try raw_user_meta_data ->> 'phone' (if passed during email signup)
    -- 3. Fallback to empty string
    COALESCE(
      NULLIF(TRIM(NEW.phone), ''),
      NULLIF(TRIM(NEW.raw_user_meta_data ->> 'phone'), ''),
      ''
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
