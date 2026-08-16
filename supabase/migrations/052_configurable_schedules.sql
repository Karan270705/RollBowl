-- Migration 052: Add configurable schedule delivery window to menu_schedules
--
-- This migration adds explicit start and end timestamps for the delivery/pickup window
-- and backfills existing schedules to maintain backward compatibility with old hardcoded logic.

ALTER TABLE public.menu_schedules
ADD COLUMN delivery_start_at TIMESTAMPTZ,
ADD COLUMN delivery_end_at TIMESTAMPTZ;

-- Backfill existing data using the previous hardcoded time-of-day offsets (12:00 PM - 2:00 PM)
UPDATE public.menu_schedules
SET delivery_start_at = (menu_date::text || ' 12:00:00+05:30')::timestamptz,
    delivery_end_at = (menu_date::text || ' 14:00:00+05:30')::timestamptz
WHERE delivery_start_at IS NULL;

-- Make the columns NOT NULL after backfilling
ALTER TABLE public.menu_schedules
ALTER COLUMN delivery_start_at SET NOT NULL,
ALTER COLUMN delivery_end_at SET NOT NULL;
