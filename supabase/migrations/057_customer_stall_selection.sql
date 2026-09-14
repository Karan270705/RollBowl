-- ============================================================
-- Migration 057: Customer Stall Selection Support
-- ============================================================
-- Adds location field to stalls and preferred_stall_id to users
-- for customer multi-stall selection feature.
-- ============================================================

BEGIN;

-- 1. Add location field to stalls table
ALTER TABLE public.stalls
  ADD COLUMN IF NOT EXISTS location TEXT;

COMMENT ON COLUMN public.stalls.location IS 'Physical location of stall (e.g., "Main Gate", "Food Court Block A", "Library Entrance")';

-- 2. Add preferred_stall_id to users table for customer stall preference
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS preferred_stall_id UUID REFERENCES public.stalls(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.users.preferred_stall_id IS 'Customer preferred/default stall for orders';

-- 3. Create index for location-based queries
CREATE INDEX IF NOT EXISTS idx_stalls_location ON public.stalls(location) WHERE location IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_stalls_college_active ON public.stalls(college_id, is_active) WHERE is_active = true;

-- 4. Manual Data Update integrated into migration
UPDATE public.stalls
SET location = COALESCE(location, 'Main Campus')
WHERE location IS NULL;

COMMIT;
