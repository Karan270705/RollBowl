-- Migration 049: Align historical menu schedule timestamps with operational rollover configuration
--
-- Single Source of Truth:
-- The authoritative operational rollover boundary is 15:00:00+05:30 (3:00 PM IST).
-- Tomorrow's menu becomes available immediately after operational rollover.
-- Therefore, historical published rows in menu_schedules are updated so that:
--   1. visible_from = (menu_date - 1 calendar day) at 15:00:00+05:30 (09:30:00 UTC)
--   2. order_cutoff = menu_date at 10:00:00+05:30 (04:30:00 UTC)

UPDATE public.menu_schedules
SET visible_from = ((menu_date::date - INTERVAL '1 day')::date::text || ' 15:00:00+05:30')::timestamptz,
    order_cutoff = (menu_date::text || ' 10:00:00+05:30')::timestamptz
WHERE is_published = true;
