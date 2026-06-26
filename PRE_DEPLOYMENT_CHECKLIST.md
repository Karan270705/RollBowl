# PRE_DEPLOYMENT_CHECKLIST
### RollBowl Supabase Backend — Senior Backend Architect Review
**Reviewed:** 2026-06-15 | **Migration Files:** 001–013 | **Reviewer:** Backend Architecture Review

---

## SECTION 1 — CRITICAL ISSUES

### ISSUE-001 · `CRITICAL` · Race Condition on Inventory Reservation

**File:** `007_inventory.sql`

**Problem:** `inventory_items` stores `total_quantity`, `sold_quantity`, `reserved_quantity`, and `available_quantity` as four separate denormalized INTEGER columns with no atomicity guarantee. When two customers simultaneously reserve the last unit of a meal, both can read `available_quantity = 1`, both pass the non-negative constraint check, and both INSERT a `meal_reservations` row — resulting in `available_quantity` going to `-1` or both believing they have a confirmed hold. The `CHECK (available_quantity >= 0)` constraint only fires on the `inventory_items` row itself during an UPDATE, but the reservation INSERT and the inventory UPDATE are two separate statements with no transaction isolation enforced at the database level for concurrent callers.

**Impact:** Double-booking of the last extra meal, incorrect stock counts, customer-facing promise failures.

**Required Fix Before Deployment:** Wrap the reservation insert + inventory decrement in a single PostgreSQL function using `FOR UPDATE` row-level locking, or use `UPDATE inventory_items SET reserved_quantity = reserved_quantity + $qty WHERE id = $id AND available_quantity >= $qty RETURNING *` and check `rowCount = 1` before inserting the reservation. A database function is strongly preferred over client-side two-step logic.

---

### ISSUE-002 · `CRITICAL` · Customer Can INSERT Payment Records for Any Order They Own

**File:** `011_rls_policies.sql` → `payments_own_insert`

**Problem:** The `payments_own_insert` policy allows any authenticated customer to INSERT a payment record for any order they own, with any `amount`, `status`, `method`, and `transaction_id`. This means a customer could self-verify a payment by inserting a row with `status = 'paid'` without any real payment gateway interaction.

**Impact:** Fraudulent orders — customers receive food without paying.

**Required Fix Before Deployment:** Remove the `payments_own_insert` RLS policy entirely. Payment records must only be created server-side via a Supabase Edge Function that calls the actual payment gateway, verifies the webhook, and then writes the record using the `service_role` key (which bypasses RLS). Customers should have SELECT only on their own payment records.

---

### ISSUE-003 · `HIGH` · Subscriptions: No Guard Against Consuming More Meals Than Allocated

**File:** `006_subscriptions.sql`

**Problem:** The `subscriptions` table has `remaining_meals >= 0` as a CHECK constraint, but there is no database-enforced mechanism to prevent a client from decrementing `consumed_meals` and `remaining_meals` fields directly. An authenticated user could PATCH their own subscription to set `remaining_meals = 999`. There is also no RLS UPDATE policy on `subscriptions` — meaning the only insert policy exists; no update policy is defined. Effectively, after INSERT, subscriptions are unmodifiable via RLS, which means legitimate consumed-meal tracking can't happen via client either.

**Impact:** Either subscription meal counts can be freely manipulated (if an UPDATE policy is added later without restriction) or legitimate meal tracking won't work (if it stays as-is and you rely on the client to update).

**Required Fix Before Deployment:** Subscription `consumed_meals` and `remaining_meals` should only be modified server-side via a Supabase Edge Function or a PostgreSQL function with `SECURITY DEFINER`. Add a `subscriptions_own_update` RLS policy that is either absent (service role only) or restricted to non-financial fields only (e.g., pause/resume `status`). Do not allow clients to freely update quantity fields.

---

### ISSUE-004 · `HIGH` · `order_number` Has No Generation Logic

**File:** `005_orders.sql`

**Problem:** `order_number` is declared `TEXT NOT NULL UNIQUE` but has no `DEFAULT`. The mock data uses the pattern `RB-1001`, `RB-1002`, etc. There is no sequence, trigger, or function that generates this value. When the frontend calls `supabase.from('orders').insert({...})`, it must provide `order_number` itself — or the INSERT will fail with `null value violates not-null constraint`.

**Impact:** Every order INSERT from the client will fail unless the client generates its own order number, which is prone to collisions and violates the principle that the server owns ID generation.

**Required Fix Before Deployment:** Add a `CREATE SEQUENCE rollbowl_order_seq;` and a trigger (or generated column) that sets `order_number = 'RB-' || LPAD(nextval('rollbowl_order_seq')::text, 4, '0')` automatically on INSERT.

---

### ISSUE-005 · `HIGH` · `remaining_meals` Is a Stored Derived Value — Prone to Drift

**File:** `006_subscriptions.sql`

**Problem:** `remaining_meals` is stored as a plain INTEGER column with initial value set at subscription creation, not computed from `total_meals - consumed_meals`. Any update to `consumed_meals` that doesn't simultaneously update `remaining_meals` will cause drift. There is no trigger enforcing `remaining_meals = total_meals - consumed_meals`.

**Impact:** Frontend will display incorrect remaining meal counts. Customers may be allowed more or fewer meals than entitled.

**Required Fix Before Deployment:** Either (a) make `remaining_meals` a generated column: `remaining_meals INTEGER GENERATED ALWAYS AS (total_meals - consumed_meals) STORED`, or (b) add a BEFORE UPDATE trigger that sets `NEW.remaining_meals = NEW.total_meals - NEW.consumed_meals` before every write.

---

### ISSUE-006 · `HIGH` · `users_ops_select` Exposes ALL User Profiles to ALL Operations Staff

**File:** `011_rls_policies.sql` → `users_ops_select`

**Problem:** The policy `users_ops_select` grants any user with role `kitchen` or `stall_operator` the ability to SELECT every row in the `users` table — across all colleges and cities. A stall operator at PICT (Pune) can read all user profiles including name, phone, email, college, and city for students at DJ Sanghvi (Mumbai).

**Impact:** Privacy violation. Stall operators see personal data for customers they have no business relationship with.

**Required Fix Before Deployment:** Scope the SELECT to users of the stall operator's own college: `WHERE users.college_id = (SELECT college_id FROM stalls WHERE operator_id = auth.uid() LIMIT 1)`. Or, for kitchen role, restrict to users who have active orders at kitchen-managed stalls only.

---

### ISSUE-007 · `MEDIUM` · `payment_records` Has No Constraint Ensuring at Least One FK Is Set

**File:** `009_payments.sql`

**Problem:** Both `order_id` and `subscription_id` are nullable. The comment in the file explicitly notes this is advisory and not enforced. This means a payment record with no order and no subscription can be inserted — an orphaned transaction record with no traceable source.

**Impact:** Untraceable payment records in the ledger, data integrity issues during audits.

**Required Fix Before Deployment:** Add a CHECK constraint: `CHECK (order_id IS NOT NULL OR subscription_id IS NOT NULL)`. This is a one-line fix with zero downside.

---

### ISSUE-008 · `MEDIUM` · `stall_images` Bucket Has No UPDATE or DELETE Policies

**File:** `012_storage.sql`

**Problem:** The `stall-images` bucket defines only SELECT and INSERT policies. There are no UPDATE or DELETE policies. Once an operator uploads a stall image, they cannot replace or remove it.

**Impact:** Operators cannot update stall images after initial upload. Stale or incorrect images will be permanent.

**Required Fix Before Deployment:** Add UPDATE and DELETE policies for `stall-images` scoped to `auth.uid()::text = (storage.foldername(name))[1]`, mirroring the pattern used for `meal-images`.

---

### ISSUE-009 · `MEDIUM` · `meal_images` INSERT Policy Is Too Permissive

**File:** `012_storage.sql`

**Problem:** The `storage_meal_images_insert` policy allows any authenticated user (including customers) to upload to the `meal-images` bucket. Only stall operators should upload meal images.

**Impact:** Customers could upload arbitrary files to the meal images bucket, cluttering storage and potentially abusing it.

**Required Fix Before Deployment:** Change the INSERT policy to check `get_user_role() IN ('kitchen', 'stall_operator')`. The same applies to `stall-images`.

---

### ISSUE-010 · `LOW` · Geography `SELECT` Policies Use `USING (true)` — Available to Unauthenticated Anon Users

**File:** `011_rls_policies.sql` → `cities_read`, `universities_read`, `colleges_read`

**Problem:** `USING (true)` with RLS means these policies apply to all roles, including `anon` (unauthenticated). While geography data is generally not sensitive, this is an intentional decision that should be documented. If the Supabase project's anon key is ever leaked, geography enumeration is the least of concerns — but it's worth noting.

**Impact:** Low. Unauthenticated clients can enumerate cities, universities, and colleges.

**Note:** This is acceptable for a food ordering platform where college selection happens before login. Document this as intentional.

---

## SECTION 2 — DATABASE REVIEW

### ✅ Strengths

- **Enum completeness:** All 9 enums in `001_enums.sql` exactly mirror `src/constants/enums.ts`. No enum value is missing or misnamed.
- **Cascade rules are sensibly chosen:** `ON DELETE RESTRICT` on high-value FKs (orders→users, orders→stalls) prevents orphaned business records. `ON DELETE CASCADE` on child records (order_items→orders, meal_histories→subscriptions) is correct.
- **JSONB for nutrition:** Using `JSONB` for the `meals.nutrition` column is the right call for an optional, semi-structured field. Avoids schema migration when adding new nutritional fields.
- **Text array for tags:** `TEXT[] NOT NULL DEFAULT '{}'` for `meals.tags` is clean and avoids an unnecessary join table at MVP scale.
- **`TIMESTAMPTZ` everywhere:** All timestamps use `TIMESTAMPTZ` (timezone-aware), not `TIMESTAMP`. This is correct.
- **`NUMERIC(10,2)` for money:** Avoids floating-point precision errors on monetary values.
- **Comments on all tables and key columns:** Excellent practice.

### ⚠️ Issues Found

| # | Severity | Location | Issue |
|---|----------|----------|-------|
| 1 | HIGH | `007_inventory.sql` | No atomicity on inventory deduction — see ISSUE-001 |
| 2 | HIGH | `005_orders.sql` | No `DEFAULT` on `order_number` — see ISSUE-004 |
| 3 | HIGH | `006_subscriptions.sql` | `remaining_meals` not a derived/generated value — see ISSUE-005 |
| 4 | MEDIUM | `009_payments.sql` | No CHECK enforcing at least one FK — see ISSUE-007 |
| 5 | MEDIUM | `004_stalls_meals.sql` | `stalls.rating` uses `NUMERIC(3,2)` which caps at 9.99 — correct, but `meals.rating` has the same type and max is 4.9 in mock data, so this is fine |
| 6 | LOW | `003_users.sql` | `users.email` could drift from `auth.users.email` if a user changes their auth email without an update trigger |
| 7 | LOW | `006_subscriptions.sql` | No `updated_at` on `subscriptions` table — status changes (paused/expired) won't have a timestamp |

### Missing Constraints

- `orders`: No CHECK that `subtotal + tax - discount = total` (prevents arithmetic errors on insert)
- `inventory_items`: No CHECK that `sold_quantity + reserved_quantity + available_quantity = total_quantity`
- `subscriptions`: No CHECK that `end_date > start_date`
- `subscriptions`: No unique constraint on `(user_id, plan_id)` with active status — a user could theoretically have two active subscriptions for the same plan

### Cascade Review

| Table | Rule | Assessment |
|-------|------|-----------|
| `addresses → users` | CASCADE | ✅ Correct — deleting a user removes their addresses |
| `order_items → orders` | CASCADE | ✅ Correct |
| `meal_histories → subscriptions` | CASCADE | ✅ Correct |
| `notifications → users` | CASCADE | ✅ Correct |
| `inventory_items → meals` | CASCADE | ⚠️ Consider — deleting a meal deletes all its inventory records, which may hide historical data |
| `payment_records → orders` | SET NULL | ✅ Correct — preserves payment ledger even if order is deleted |
| `orders → users` | RESTRICT | ✅ Correct |

### Trigger Review

| Trigger | Assessment |
|---------|-----------|
| `on_auth_user_created` | ✅ Correct. Uses `SECURITY DEFINER`. Handles null gracefully with `COALESCE`. |
| `orders_updated_at_trigger` | ✅ Correct. Standard BEFORE UPDATE pattern. |
| `inventory_updated_at_trigger` | ✅ Correct. |
| Missing: `subscriptions_updated_at` | ⚠️ Subscriptions have no `updated_at` column or trigger |

### Realtime Review

- ✅ Only 4 tables are Realtime-enabled (orders, inventory_items, notifications, meal_reservations). Not every table — correct.
- ⚠️ `ALTER PUBLICATION supabase_realtime ADD TABLE ...` affects all columns. For `notifications`, this could broadcast `body` and `data` content to any subscriber who knows the channel name. RLS on Realtime channels should be confirmed to be enabled in the Supabase Dashboard (Database → Replication → Enable RLS for replication). Without this, Realtime bypasses RLS.
- ⚠️ `orders` Realtime broadcasts the entire row on UPDATE, including `payment_status`, `subtotal`, `tax`, `discount`, `total`. This is appropriate for the Customer App but should be filtered at the client subscription level (filter by `user_id`).

### Index Review

- ✅ All foreign key columns are indexed.
- ✅ Partial indexes on boolean columns (`is_available`, `is_featured`, `is_read`) are a good optimization.
- ✅ `created_at DESC` index on orders and notifications supports "latest first" queries.
- ⚠️ Missing: Composite index `(stall_id, status)` on `orders` — the Operations App will most frequently query "active orders for my stall", which needs both conditions efficiently.
- ⚠️ Missing: `(user_id, status)` on `subscriptions` — "find my active subscription" is the most common query.
- ⚠️ `idx_orders_status` is a full-table index on an enum with 7 values — at MVP scale this is fine, but a partial index `WHERE status NOT IN ('delivered', 'cancelled')` would be more efficient for active-order dashboards.

---

## SECTION 3 — RLS REVIEW

### Overall Assessment

The RLS design is **structurally sound** with good use of helper functions (`get_user_role()`, `is_stall_operator()`). There are no trivially open tables. However, several specific policies require changes before going to production.

### Policy-by-Policy Findings

| Table | Policy | Status | Finding |
|-------|--------|--------|---------|
| `cities` | `cities_read` | ⚠️ NOTED | Accessible by `anon` — intentional but document it |
| `universities` | `universities_read` | ⚠️ NOTED | Same as above |
| `colleges` | `colleges_read` | ⚠️ NOTED | Same as above |
| `users` | `users_own_select` | ✅ | Correct — own row only |
| `users` | `users_own_update` | ✅ | Correct — own row only |
| `users` | `users_ops_select` | ❌ CRITICAL | Exposes all user profiles to all ops staff — see ISSUE-006 |
| `addresses` | All 4 policies | ✅ | Well scoped to `user_id = auth.uid()` |
| `stalls` | `stalls_read` | ✅ | Public read — appropriate for customer browsing |
| `stalls` | `stalls_operator_update` | ✅ | Scoped to `operator_id = auth.uid()` |
| `stalls` | Missing INSERT | ⚠️ | No INSERT policy — stalls can only be created via `service_role`. Document this as intentional (admin creates stalls). |
| `meals` | `meals_read` | ✅ | Public read — appropriate |
| `meals` | `meals_operator_*` | ✅ | Uses `is_stall_operator()` helper — correct |
| `orders` | `orders_customer_select/insert` | ✅ | Correctly scoped |
| `orders` | `orders_customer_insert` | ⚠️ MEDIUM | Customer can INSERT an order with any `user_id` value — the WITH CHECK only enforces `user_id = auth.uid()`, which is correct, but there is no validation that the referenced `stall_id` actually belongs to the customer's college. Cross-college order spoofing is possible. |
| `orders` | `orders_ops_update` | ✅ | Scoped via `is_stall_operator()` |
| `orders` | `orders_kitchen_select` | ✅ | Kitchen sees all orders |
| `order_items` | Customer SELECT/INSERT | ✅ | Correctly delegated through parent order check |
| `order_items` | Missing: ops UPDATE | ⚠️ | Operators cannot update order items (e.g., mark item as out of stock). May be intentional but should be documented. |
| `subscription_plans` | `plans_read` | ✅ | Public catalog read |
| `subscriptions` | `subscriptions_own_select/insert` | ✅ | Correctly scoped |
| `subscriptions` | Missing UPDATE | ⚠️ | No UPDATE policy. Pausing/renewing subscription status requires service_role or a new policy. |
| `meal_histories` | Select + insert | ✅ | Correctly delegated through parent subscription |
| `meal_histories` | Missing ops SELECT | ⚠️ | Kitchen staff cannot view subscription meal history for planning |
| `notifications` | `notifications_own_select/update` | ✅ | Correctly scoped |
| `notifications` | Missing INSERT | ✅ | Intentionally absent — only service_role/Edge Functions insert notifications |
| `inventory_items` | All policies | ✅ | Well designed. Public read, operator write. |
| `meal_reservations` | Customer policies | ✅ | Well scoped |
| `meal_reservations` | `reservations_customer_update` | ⚠️ MEDIUM | Customer can UPDATE their own reservation status to `collected` or even `cancelled` for a reservation that the operator has not confirmed. No status-transition guard. |
| `payment_records` | `payments_own_insert` | ❌ CRITICAL | Customers can self-insert paid payment records — see ISSUE-002 |
| `payment_records` | `payments_own_select` | ✅ | Correctly scoped through order/subscription ownership |

### Privilege Escalation Risk

There is **no mechanism preventing a customer from changing their own `role`** column in `users`. The `users_own_update` policy allows updates where `id = auth.uid()` with no `WITH CHECK` on which columns can be changed. A customer could PATCH their user row to set `role = 'kitchen'` and immediately gain kitchen-level access to all orders.

**Severity: CRITICAL**

**Fix:** Add a `WITH CHECK` clause that prevents role escalation:
```sql
WITH CHECK (id = auth.uid() AND role = (SELECT role FROM users WHERE id = auth.uid()))
```
Or restrict the UPDATE policy to only allowed columns using column-level security (grant only specific columns).

---

## SECTION 4 — MVP SIMPLIFICATIONS

Given the current business scale (10–50 orders/day, one city, one or two colleges), the following simplifications are recommended before launch:

### ✅ Simplifications That Are Already Well-Calibrated

1. **Single `subscription_plans` catalog table** — no versioning needed yet. Correct for MVP.
2. **JSONB for nutrition info** — avoids a separate `nutrition` table that would be overkill at this scale.
3. **Text array for meal tags** — avoids a junction table. Correct.
4. **No analytics tables in the migration** — analytics can be derived from `orders` and `order_items` via queries. No premature optimization.
5. **No soft-delete pattern** — using hard deletes with RESTRICT constraints is simpler. Correct for MVP.

### ⚡ Recommended Simplifications

**1. Drop the `universities` table for now**

The `colleges` table already has `city_id` and `address`. `universities` adds a layer of hierarchy that serves no current feature in the Customer or Operations App. No UI references university data directly. Simplify to: `City → College → Stall`. The `university_id` FK can be re-added later when needed.

**Benefit:** Removes one table, one FK, and two indexes. Eliminates a join in college queries.

---

**2. Remove `customer_name` and `stall_name` from `orders` table**

These are denormalized copies of data that already exist in `users.name` and `stalls.name`. At MVP scale with a join query, they're redundant. They will drift if a user changes their name or a stall renames.

**Benefit:** Reduces denormalization risk. `customer_name` is particularly risky — if a user updates their name, historical orders show the new name, not the name at order time. Consider keeping `stall_name` as an intentional snapshot, but `customer_name` should be derived from `users.name`.

---

**3. Consider deferring `meal_reservations` to Phase 2**

The extra-meal reservation system is the most operationally complex feature (inventory race conditions, status transitions, realtime updates, operator confirmation flow). For a 10–50 order/day MVP with a small team, operators can manage extras verbally at the stall. Launching without this feature reduces the highest-risk surface area.

**Benefit:** Eliminates ISSUE-001 (race condition), removes 1 table, 5 indexes, and 5 RLS policies from the initial launch scope.

---

**4. Replace `available_quantity` computed column with a simple formula**

Rather than maintaining 4 quantity columns (`total`, `sold`, `reserved`, `available`) that must all stay in sync, simplify to `total_quantity` and `sold_quantity` only. Compute `available = total - sold` at query time. Reservations can be tracked by a simpler status on `meal_reservations` itself.

---

**5. Defer realtime for `meal_reservations` and `notifications` to Phase 2**

At MVP with 10–50 orders/day, polling every 30 seconds is acceptable for reservations and notifications. Real-time websocket connections add operational complexity (connection management, reconnection logic, RLS on Realtime channels). Defer these to Phase 2.

---

**6. No need for `DailySummary` or `StallAnalytics` tables at MVP**

These were in the architecture doc but correctly not in the migrations. Analytics can be computed from `orders` and `order_items` with simple `GROUP BY` queries at MVP scale. Confirmed: no pre-aggregation tables needed.

---

## SECTION 5 — DEPLOYMENT READINESS SCORES

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| **Schema Design** | 7.5 / 10 | Strong overall. JSONB usage, correct cascade rules, TIMESTAMPTZ throughout. Deductions for missing `order_number` default, derived `remaining_meals`, and denormalized `customer_name`. |
| **Security** | 5.5 / 10 | RLS enabled on all tables — good foundation. However, two CRITICAL security issues (self-insert payments, unconstrained role escalation) and one HIGH issue (ops user sees all profiles) must be resolved before any production traffic. |
| **Scalability** | 8.0 / 10 | 30+ well-targeted indexes. Partial indexes on boolean columns. Schema structure supports horizontal geography expansion with zero schema changes. Deductions for missing `(stall_id, status)` composite index and the inventory denormalization approach. |
| **Maintainability** | 8.5 / 10 | Files are clearly named and ordered. Every table has a comment. Migration files are atomic and logically grouped. Helper functions (`get_user_role`, `is_stall_operator`) centralize policy logic cleanly. Minor deduction for no `updated_at` on subscriptions. |
| **MVP Readiness** | 6.5 / 10 | Core schema is deployment-ready structurally. Blocked by 2 CRITICAL and 3 HIGH issues that must be resolved first. Once those 5 issues are fixed (est. 1–2 days of work), this is a solid MVP backend. |

**Overall: 7.2 / 10** — Good quality backend with a strong foundation. Not deployable as-is due to specific security and data-integrity gaps.

---

## SECTION 6 — EXECUTION APPROVAL

```
╔══════════════════════════════════════════════════════╗
║                                                      ║
║      REQUIRES CHANGES BEFORE DEPLOYMENT              ║
║                                                      ║
╚══════════════════════════════════════════════════════╝
```

### Required Changes (Blocking)

The following issues **must be resolved** in a corrective migration before any Supabase deployment:

---

#### BLOCK-1 · Fix Role Escalation Vulnerability *(ISSUE-006 variant)*
**File:** `011_rls_policies.sql` → `users_own_update`

Add a column-level restriction to the user update policy preventing customers from modifying their `role` field. Without this, any customer can self-promote to `kitchen` or `stall_operator`.

---

#### BLOCK-2 · Remove `payments_own_insert` Policy *(ISSUE-002)*
**File:** `011_rls_policies.sql`

Delete the `payments_own_insert` policy. Payment records must only be written by server-side functions. Customers may only SELECT their own payments.

---

#### BLOCK-3 · Add `order_number` Auto-Generation *(ISSUE-004)*
**File:** `005_orders.sql`

Add a sequence and trigger (or generated column expression) so `order_number` is set automatically by the database on INSERT. The column must have a `DEFAULT` — it cannot be left to the client to supply.

---

#### BLOCK-4 · Fix `remaining_meals` Derived Value *(ISSUE-005)*
**File:** `006_subscriptions.sql`

Make `remaining_meals` a `GENERATED ALWAYS AS (total_meals - consumed_meals) STORED` column, or add a BEFORE UPDATE trigger enforcing `NEW.remaining_meals = NEW.total_meals - NEW.consumed_meals`.

---

#### BLOCK-5 · Add Atomicity to Inventory Reservation *(ISSUE-001)*
**File:** `007_inventory.sql` + application layer

Create a PostgreSQL function (e.g., `reserve_meal_item(p_inventory_id UUID, p_user_id UUID, p_quantity INT, p_pickup_time TIMESTAMPTZ)`) that wraps the inventory decrement and reservation insert in a single transaction with `SELECT ... FOR UPDATE` row locking. Client must call this function, not perform two separate statements.

---

#### BLOCK-6 · Add Orphan Guard to `payment_records` *(ISSUE-007)*
**File:** `009_payments.sql`

Add: `CONSTRAINT payments_requires_source CHECK (order_id IS NOT NULL OR subscription_id IS NOT NULL)`

---

#### BLOCK-7 · Scope `users_ops_select` to College *(ISSUE-006)*
**File:** `011_rls_policies.sql`

Replace the blanket `get_user_role() IN ('kitchen', 'stall_operator')` policy with a scoped version that restricts operators to viewing users from their own college only.

---

#### BLOCK-8 · Add Stall Images Update/Delete Policies *(ISSUE-008)*
**File:** `012_storage.sql`

Add UPDATE and DELETE policies for the `stall-images` bucket mirroring the `meal-images` pattern.

---

#### BLOCK-9 · Restrict Meal/Stall Image Upload to Operators *(ISSUE-009)*
**File:** `012_storage.sql`

Change `meal-images` and `stall-images` INSERT policies from `auth.role() = 'authenticated'` to `get_user_role() IN ('kitchen', 'stall_operator')`.

---

#### BLOCK-10 · Confirm Realtime RLS Is Enabled in Dashboard
**File:** `013_realtime.sql` (Supabase Dashboard setting)

Supabase Realtime has a separate toggle for RLS enforcement on broadcast channels. Verify in the Dashboard under **Database → Replication** that "Enable Row Level Security" is active for the Realtime publication. Without this, Realtime events bypass table-level RLS.

---

### Non-Blocking Recommendations (Should Fix Before First User)

These do not block deployment but should be addressed before accepting real customers:

1. Add `CHECK (end_date > start_date)` to `subscriptions`
2. Add `CHECK (subtotal >= 0 AND tax >= 0 AND discount >= 0)` to `orders`
3. Add `updated_at` column + trigger to `subscriptions`
4. Add composite index `(stall_id, status)` on `orders`
5. Add composite index `(user_id, status)` on `subscriptions`
6. Consider dropping the `universities` table for MVP simplicity

### What Is Solid and Can Be Deployed As-Is

- All 9 enum definitions (`001_enums.sql`) — ✅
- Geography table structure (`002_geography.sql`) — ✅
- Auth trigger and users table (`003_users.sql`) — ✅ (after BLOCK-1 fix)
- Stalls and meals table structure (`004_stalls_meals.sql`) — ✅
- Orders table structure (`005_orders.sql`) — ✅ (after BLOCK-3 fix)
- Subscriptions structure (`006_subscriptions.sql`) — ✅ (after BLOCK-4 fix)
- Notifications table (`008_notifications.sql`) — ✅
- Payment records structure (`009_payments.sql`) — ✅ (after BLOCK-6 fix)
- Index file (`010_indexes.sql`) — ✅ (minor additions recommended)
- Realtime configuration (`013_realtime.sql`) — ✅ (pending BLOCK-10 dashboard confirmation)

---

*End of Pre-Deployment Review. Address all 10 blocking issues and generate a corrective migration `014_fixes.sql` before executing in Supabase.*
