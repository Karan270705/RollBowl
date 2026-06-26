-- ============================================================
-- RollBowl Migration 001: PostgreSQL Enums
-- ============================================================
-- Creates enum types that mirror src/constants/enums.ts exactly.
-- These must be created FIRST because tables reference them.
-- ============================================================

-- User roles (shared across Customer & Operations apps)
CREATE TYPE user_role AS ENUM (
  'customer',
  'kitchen',
  'stall_operator'
);

-- Order lifecycle statuses
CREATE TYPE order_status AS ENUM (
  'pending',
  'confirmed',
  'preparing',
  'ready',
  'picked_up',
  'delivered',
  'cancelled'
);

-- Payment statuses
CREATE TYPE payment_status AS ENUM (
  'pending',
  'paid',
  'failed',
  'refunded'
);

-- Subscription lifecycle statuses
CREATE TYPE subscription_status AS ENUM (
  'active',
  'paused',
  'expired',
  'cancelled'
);

-- Meal time categories
CREATE TYPE meal_category AS ENUM (
  'breakfast',
  'lunch',
  'dinner',
  'snacks',
  'beverages',
  'combos'
);

-- Dietary types
CREATE TYPE meal_type AS ENUM (
  'veg',
  'non_veg',
  'vegan'
);

-- Notification categories
CREATE TYPE notification_type AS ENUM (
  'order_update',
  'delivery_update',
  'promotion',
  'subscription',
  'system'
);

-- Order origin types
CREATE TYPE order_type AS ENUM (
  'pre_order',
  'on_stall',
  'subscription'
);

-- Meal reservation statuses
CREATE TYPE reservation_status AS ENUM (
  'pending',
  'confirmed',
  'collected',
  'cancelled'
);
