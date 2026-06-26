# DATABASE SETUP GUIDE

Complete instructions for setting up the RollBowl Supabase database from scratch.

---

## Prerequisites

- A Supabase project (create one at [supabase.com](https://supabase.com))
- Access to the **SQL Editor** in the Supabase Dashboard
- Your Supabase **Project URL** and **Anon Key** (found in Settings → API)

---

## Migration Execution Order

Run each migration file **in sequence** via the Supabase SQL Editor (Dashboard → SQL Editor → New Query). Each file must complete successfully before proceeding to the next.

| Step | File | Purpose |
|------|------|---------|
| 1 | `001_enums.sql` | PostgreSQL enum types (user_role, order_status, etc.) |
| 2 | `002_geography.sql` | Cities, Universities, Colleges tables |
| 3 | `003_users.sql` | Users table + auth trigger, Addresses table |
| 4 | `004_stalls_meals.sql` | Stalls and Meals tables |
| 5 | `005_orders.sql` | Orders, Order Items + updated_at trigger |
| 6 | `006_subscriptions.sql` | Subscription Plans, Subscriptions, Meal Histories |
| 7 | `007_inventory.sql` | Inventory Items + updated_at trigger, Meal Reservations |
| 8 | `008_notifications.sql` | Notifications table |
| 9 | `009_payments.sql` | Payment Records table |
| 10 | `010_indexes.sql` | Performance indexes on all tables |
| 11 | `011_rls_policies.sql` | RLS enablement + all security policies |
| 12 | `012_storage.sql` | Storage buckets (meal-images, avatars, stall-images) |
| 13 | `013_realtime.sql` | Realtime publication for orders, inventory, notifications |

> **Important:** Do NOT skip steps or run them out of order. Foreign key references depend on tables created in earlier migrations.

---

## Step-by-Step Execution

### Step 1: Create Enums

Open the SQL Editor and paste the contents of `supabase/migrations/001_enums.sql`. Click **Run**.

**Verify:** Run the following query to confirm all 9 enums were created:
```sql
SELECT typname FROM pg_type
WHERE typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  AND typtype = 'e'
ORDER BY typname;
```

Expected output: `meal_category`, `meal_type`, `notification_type`, `order_status`, `order_type`, `payment_status`, `reservation_status`, `subscription_status`, `user_role`

### Step 2: Create Geography Tables

Paste and run `002_geography.sql`.

**Verify:**
```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name IN ('cities', 'universities', 'colleges');
```

### Step 3: Create Users & Addresses

Paste and run `003_users.sql`.

**Verify the auth trigger exists:**
```sql
SELECT trigger_name FROM information_schema.triggers
WHERE event_object_schema = 'auth' AND trigger_name = 'on_auth_user_created';
```

### Step 4: Create Stalls & Meals

Paste and run `004_stalls_meals.sql`.

### Step 5: Create Orders

Paste and run `005_orders.sql`.

**Verify the updated_at trigger exists:**
```sql
SELECT trigger_name FROM information_schema.triggers
WHERE trigger_name = 'orders_updated_at_trigger';
```

### Step 6: Create Subscriptions

Paste and run `006_subscriptions.sql`.

### Step 7: Create Inventory

Paste and run `007_inventory.sql`.

### Step 8: Create Notifications

Paste and run `008_notifications.sql`.

### Step 9: Create Payments

Paste and run `009_payments.sql`.

### Step 10: Create Indexes

Paste and run `010_indexes.sql`.

**Verify index count:**
```sql
SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public';
```

### Step 11: Enable RLS & Create Policies

Paste and run `011_rls_policies.sql`.

**Verify RLS is enabled on all tables:**
```sql
SELECT tablename, rowsecurity FROM pg_tables
WHERE schemaname = 'public' ORDER BY tablename;
```

All tables should show `rowsecurity = true`.

### Step 12: Create Storage Buckets

Paste and run `012_storage.sql`.

**Verify buckets:**
```sql
SELECT id, name, public FROM storage.buckets ORDER BY name;
```

Expected: `avatars`, `meal-images`, `stall-images` (all public = true).

### Step 13: Enable Realtime

Paste and run `013_realtime.sql`.

**Verify realtime tables:**
You can check the Realtime section in the Supabase Dashboard (Database → Replication) to confirm `orders`, `inventory_items`, `notifications`, and `meal_reservations` are listed.

---

## Post-Setup Configuration

### 1. Supabase Auth Settings

In Supabase Dashboard → Authentication → Providers:

- **Email:** Enable (allow signup)
- **Phone:** Enable (for OTP login — optional for MVP)
- **Google/Apple:** Leave disabled for now (SOCIAL_LOGIN_ENABLED = false in config)

### 2. Supabase Auth URL Configuration

In Authentication → URL Configuration:
- **Site URL:** Set to your app's deep link scheme (e.g., `rollbowl://`)
- **Redirect URLs:** Add `rollbowl://auth/callback`

### 3. Environment Variables

After setup, you'll need these values for the frontend (do NOT add them yet):
- `SUPABASE_URL` — Your project URL
- `SUPABASE_ANON_KEY` — Your anon/public key

---

## Schema Validation Checklist

Run the following master validation query after all migrations:

```sql
-- Full table inventory
SELECT table_name, COUNT(column_name) AS column_count
FROM information_schema.columns
WHERE table_schema = 'public'
GROUP BY table_name
ORDER BY table_name;
```

### Expected Results

| Table | Expected Columns |
|-------|-----------------|
| `cities` | 4 |
| `universities` | 4 |
| `colleges` | 6 |
| `users` | 9 |
| `addresses` | 7 |
| `stalls` | 9 |
| `meals` | 17 |
| `orders` | 17 |
| `order_items` | 8 |
| `subscription_plans` | 11 |
| `subscriptions` | 12 |
| `meal_histories` | 6 |
| `notifications` | 7 |
| `inventory_items` | 12 |
| `meal_reservations` | 9 |
| `payment_records` | 7 |

**Total: 16 tables**

### Enum Validation

```sql
-- Verify all enum types and their values
SELECT t.typname AS enum_name, e.enumlabel AS enum_value
FROM pg_type t
  JOIN pg_enum e ON t.oid = e.enumtypid
  JOIN pg_namespace n ON t.typnamespace = n.oid
WHERE n.nspname = 'public'
ORDER BY t.typname, e.enumsortorder;
```

### Foreign Key Validation

```sql
-- List all foreign key relationships
SELECT
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS references_table,
  ccu.column_name AS references_column
FROM information_schema.table_constraints AS tc
  JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
  JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
ORDER BY tc.table_name;
```

### RLS Policy Validation

```sql
-- List all RLS policies
SELECT tablename, policyname, permissive, roles, cmd
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

### Trigger Validation

```sql
-- List all custom triggers
SELECT trigger_name, event_object_table, action_timing, event_manipulation
FROM information_schema.triggers
WHERE trigger_schema IN ('public', 'auth')
ORDER BY trigger_name;
```

Expected triggers:
- `on_auth_user_created` (auth.users → INSERT)
- `orders_updated_at_trigger` (orders → UPDATE)
- `inventory_updated_at_trigger` (inventory_items → UPDATE)

### Constraint Validation

```sql
-- List all CHECK constraints
SELECT conname, conrelid::regclass AS table_name, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE contype = 'c' AND connamespace = 'public'::regnamespace
ORDER BY conrelid::regclass::text, conname;
```

Expected constraints:
- `meals_price_positive` — price > 0
- `orders_total_non_negative` — total >= 0
- `order_items_quantity_positive` — quantity >= 1
- `plans_price_positive` — price > 0
- `subs_remaining_non_negative` — remaining_meals >= 0
- `inv_available_non_negative` — available_quantity >= 0
- `inv_total_non_negative` — total_quantity >= 0
- `inv_sold_non_negative` — sold_quantity >= 0
- `inv_reserved_non_negative` — reserved_quantity >= 0
- `reservations_quantity_positive` — quantity >= 1
- `payments_amount_positive` — amount > 0

---

## Storage Bucket Upload Convention

Organize uploaded files by user/entity ID:

```
meal-images/
  {stall_id}/
    {meal_id}.webp

avatars/
  {user_id}/
    avatar.webp

stall-images/
  {operator_id}/
    {stall_id}.webp
```

---

## Mock Data → Table Mapping Reference

| Frontend Mock Constant | Target Table |
|----------------------|-------------|
| `MOCK_CITIES` | `cities` |
| `MOCK_UNIVERSITIES` | `universities` |
| `MOCK_COLLEGES` | `colleges` |
| `MOCK_CURRENT_USER` | `auth.users` + `users` |
| `MOCK_ADDRESSES` | `addresses` |
| `MOCK_STALLS` | `stalls` |
| `MOCK_MEALS` | `meals` |
| `MOCK_ORDERS` | `orders` |
| `OrderItem[]` (in orders) | `order_items` |
| `MOCK_PLANS` | `subscription_plans` |
| `MOCK_SUBSCRIPTION` | `subscriptions` |
| `MOCK_MEAL_HISTORY` | `meal_histories` |
| `MOCK_NOTIFICATIONS` | `notifications` |
| `MOCK_INVENTORY` | `inventory_items` |
| `MOCK_RESERVATIONS` | `meal_reservations` |
| `MOCK_PAYMENTS` | `payment_records` |

---

## Troubleshooting

### "relation already exists"
If you re-run a migration, it will fail because objects already exist. Either:
- Drop and recreate the database (Dashboard → Settings → General → Reset Database)
- Or use `DROP TABLE IF EXISTS` before re-running (not recommended in production)

### "permission denied for schema auth"
The `003_users.sql` trigger on `auth.users` requires running in the SQL Editor with service role access. The Supabase Dashboard SQL Editor runs with sufficient privileges by default.

### RLS blocking all queries
If queries return empty results after enabling RLS, ensure:
1. You're authenticated (not using an anonymous client)
2. The JWT `auth.uid()` matches the `user_id` or ownership column
3. Check which policies apply with the policy validation query above

---

## What Comes Next

After successful database setup:
1. **Seed reference data** — Insert cities, universities, colleges, subscription plans
2. **Connect frontend** — Install `@supabase/supabase-js`, configure client
3. **Replace mock services** — Swap `mockFetchMeals` → `supabase.from('meals').select()`
4. **Enable realtime hooks** — Replace mock intervals with Supabase channel subscriptions
