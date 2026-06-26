# ROLLBOWL_SUPABASE_ARCHITECTURE

## SECTION 1: SYSTEM OVERVIEW

**High-Level Architecture**
The RollBowl platform comprises a centralized Supabase backend serving two distinct client applications: the Customer App and the Operations App. The backend handles authentication, business logic via database triggers and functions, relational data storage, and realtime event broadcasting.

**Customer App Responsibilities**
* Browsing meals and menus based on the selected city and college.
* Managing user profiles and addresses.
* Placing pre-orders and on-stall orders.
* Purchasing and managing subscription plans.
* Reserving extra meals from stall inventory.
* Receiving realtime order updates and notifications.

**Operations App Responsibilities**
* Kitchen Management: Viewing aggregated demand and updating meal preparation statuses.
* Stall Inventory Management: Managing stock of extra meals and updating availability.
* Order Fulfillment: Updating order statuses (e.g., from preparing to ready to delivered).
* Stall Operator analytics and performance tracking.

**Supabase Responsibilities**
* **Database (PostgreSQL):** Relational data storage with strict schema enforcement and referential integrity.
* **Authentication:** Secure user sign-up, login, and session management (JWTs).
* **Storage:** Managing static assets like meal images and university logos.
* **Edge Functions:** Handling complex external integrations (like payment gateways or push notifications).

**Realtime Responsibilities**
* Broadcasting inventory changes to prevent double-booking of extra meals.
* Pushing order status updates instantly to customers.
* Sending system notifications, promotions, and delivery updates.
* Updating kitchen and stall operators instantly when new orders are placed.

---

## SECTION 2: ENTITY ANALYSIS

Based on the existing codebase, the following business entities are required:

1. **Cities** - Supported geographic locations (e.g., Pune, Mumbai).
2. **Universities** - Higher education institutions linked to cities.
3. **Colleges** - Specific campus locations linked to universities and cities.
4. **Users** - Customers, Kitchen Staff, and Stall Operators.
5. **Addresses** - Delivery locations for users (e.g., Hostel, Department).
6. **Stalls** - Vendor locations within colleges where meals are prepared/served.
7. **Meals** - Food items available for order, linked to stalls and categories.
8. **Orders** - Customer purchases (pre-order, on-stall, subscription redemption).
9. **OrderItems** - Specific meals included within an order.
10. **SubscriptionPlans** - Available meal plans (e.g., Basic, Standard, Premium).
11. **Subscriptions** - Active or past user subscriptions.
12. **MealHistories** - Log of meals consumed under a subscription.
13. **Notifications** - System alerts and order updates for users.
14. **InventoryItems** - Real-time tracking of available extra meals at stalls.
15. **MealReservations** - Customer reservations for extra inventory items.
16. **PaymentRecords** - Transaction logs for orders and subscriptions.

---

## SECTION 3: DATABASE DESIGN

### 1. cities
* **Purpose:** Stores operational cities.
* **Columns:** `id` (UUID), `name` (Text), `state` (Text), `is_active` (Boolean).
* **Primary Key:** `id`

### 2. universities
* **Purpose:** Stores parent universities.
* **Columns:** `id` (UUID), `name` (Text), `city_id` (UUID), `logo_url` (Text).
* **Primary Key:** `id`
* **Foreign Keys:** `city_id` -> `cities(id)`

### 3. colleges
* **Purpose:** Specific campuses where RollBowl operates.
* **Columns:** `id` (UUID), `name` (Text), `university_id` (UUID), `city_id` (UUID), `address` (Text), `is_active` (Boolean).
* **Primary Key:** `id`
* **Foreign Keys:** `university_id` -> `universities(id)`, `city_id` -> `cities(id)`

### 4. users
* **Purpose:** Central user table extending Supabase Auth.
* **Columns:** `id` (UUID), `name` (Text), `email` (Text), `phone` (Text), `role` (Enum), `avatar_url` (Text), `college_id` (UUID), `city_id` (UUID), `created_at` (Timestamp).
* **Primary Key:** `id` (References `auth.users`)
* **Foreign Keys:** `college_id` -> `colleges(id)`, `city_id` -> `cities(id)`

### 5. addresses
* **Purpose:** Delivery locations.
* **Columns:** `id` (UUID), `user_id` (UUID), `label` (Text), `full_address` (Text), `landmark` (Text), `is_default` (Boolean).
* **Primary Key:** `id`
* **Foreign Keys:** `user_id` -> `users(id)`

### 6. stalls
* **Purpose:** Kitchen/Stall locations.
* **Columns:** `id` (UUID), `name` (Text), `college_id` (UUID), `operator_id` (UUID), `description` (Text), `image_url` (Text), `is_active` (Boolean), `rating` (Numeric), `total_ratings` (Integer).
* **Primary Key:** `id`
* **Foreign Keys:** `college_id` -> `colleges(id)`, `operator_id` -> `users(id)`

### 7. meals
* **Purpose:** Menu items.
* **Columns:** `id` (UUID), `name` (Text), `description` (Text), `price` (Numeric), `original_price` (Numeric), `category` (Enum), `type` (Enum), `stall_id` (UUID), `image_url` (Text), `is_available` (Boolean), `is_featured` (Boolean), `rating` (Numeric), `total_ratings` (Integer), `preparation_time` (Integer), `nutrition` (JSONB), `tags` (Text Array).
* **Primary Key:** `id`
* **Foreign Keys:** `stall_id` -> `stalls(id)`

### 8. orders
* **Purpose:** Order headers.
* **Columns:** `id` (UUID), `order_number` (Text), `user_id` (UUID), `customer_name` (Text), `stall_id` (UUID), `stall_name` (Text), `status` (Enum), `order_type` (Enum), `payment_status` (Enum), `subtotal` (Numeric), `tax` (Numeric), `discount` (Numeric), `total` (Numeric), `notes` (Text), `estimated_ready_time` (Timestamp), `created_at` (Timestamp), `updated_at` (Timestamp).
* **Primary Key:** `id`
* **Foreign Keys:** `user_id` -> `users(id)`, `stall_id` -> `stalls(id)`

### 9. order_items
* **Purpose:** Specific items in an order.
* **Columns:** `id` (UUID), `order_id` (UUID), `meal_id` (UUID), `meal_name` (Text), `quantity` (Integer), `unit_price` (Numeric), `total_price` (Numeric), `special_instructions` (Text).
* **Primary Key:** `id`
* **Foreign Keys:** `order_id` -> `orders(id)`, `meal_id` -> `meals(id)`

### 10. subscription_plans
* **Purpose:** Available plans.
* **Columns:** `id` (UUID), `name` (Text), `description` (Text), `price` (Numeric), `duration_days` (Integer), `meals_per_day` (Integer), `total_meals` (Integer), `features` (Text Array), `is_popular` (Boolean), `badge` (Text).
* **Primary Key:** `id`

### 11. subscriptions
* **Purpose:** User active subscriptions.
* **Columns:** `id` (UUID), `user_id` (UUID), `plan_id` (UUID), `plan_name` (Text), `status` (Enum), `start_date` (Date), `end_date` (Date), `total_meals` (Integer), `consumed_meals` (Integer), `remaining_meals` (Integer), `meals_per_day` (Integer).
* **Primary Key:** `id`
* **Foreign Keys:** `user_id` -> `users(id)`, `plan_id` -> `subscription_plans(id)`

### 12. meal_histories
* **Purpose:** Subscribed meal consumption logs.
* **Columns:** `id` (UUID), `subscription_id` (UUID), `meal_name` (Text), `date` (Date), `time` (Text), `category` (Enum).
* **Primary Key:** `id`
* **Foreign Keys:** `subscription_id` -> `subscriptions(id)`

### 13. notifications
* **Purpose:** System notifications.
* **Columns:** `id` (UUID), `user_id` (UUID), `title` (Text), `body` (Text), `type` (Enum), `is_read` (Boolean), `data` (JSONB), `created_at` (Timestamp).
* **Primary Key:** `id`
* **Foreign Keys:** `user_id` -> `users(id)`

### 14. inventory_items
* **Purpose:** Live stall inventory tracking.
* **Columns:** `id` (UUID), `meal_id` (UUID), `meal_name` (Text), `stall_id` (UUID), `category` (Enum), `total_quantity` (Integer), `sold_quantity` (Integer), `reserved_quantity` (Integer), `available_quantity` (Integer), `price` (Numeric), `is_available` (Boolean).
* **Primary Key:** `id`
* **Foreign Keys:** `meal_id` -> `meals(id)`, `stall_id` -> `stalls(id)`
* **Constraints:** `available_quantity >= 0`

### 15. meal_reservations
* **Purpose:** Customer holds on extra meals.
* **Columns:** `id` (UUID), `user_id` (UUID), `inventory_item_id` (UUID), `meal_name` (Text), `stall_name` (Text), `quantity` (Integer), `pickup_time` (Timestamp), `status` (Enum), `created_at` (Timestamp).
* **Primary Key:** `id`
* **Foreign Keys:** `user_id` -> `users(id)`, `inventory_item_id` -> `inventory_items(id)`

### 16. payment_records
* **Purpose:** Transaction ledger.
* **Columns:** `id` (UUID), `order_id` (UUID), `subscription_id` (UUID), `amount` (Numeric), `status` (Enum), `method` (Text), `transaction_id` (Text), `created_at` (Timestamp).
* **Primary Key:** `id`
* **Foreign Keys:** `order_id` -> `orders(id)`, `subscription_id` -> `subscriptions(id)`

---

## SECTION 4: RELATIONSHIP DIAGRAM

```text
City (1) → (M) University
City (1) → (M) College

University (1) → (M) College

College (1) → (M) User (Customers)
College (1) → (M) Stall

User (1) → (M) Address
User (1) → (M) Order
User (1) → (M) Subscription
User (1) → (M) Notification
User (1) → (M) MealReservation
User (1) → (M) Stall (as Operator)

Stall (1) → (M) Meal
Stall (1) → (M) Order
Stall (1) → (M) InventoryItem

Meal (1) → (M) OrderItem
Meal (1) → (M) InventoryItem

Order (1) → (M) OrderItem
Order (1) → (M) PaymentRecord

SubscriptionPlan (1) → (M) Subscription

Subscription (1) → (M) MealHistory
Subscription (1) → (M) PaymentRecord

InventoryItem (1) → (M) MealReservation
```

---

## SECTION 5: AUTHENTICATION DESIGN

Authentication relies heavily on Supabase Auth.

* **Sign Up:** Users sign up using Email/Password or Phone (OTP). Upon successful registration in `auth.users`, a database trigger automatically inserts a corresponding row into the public `users` table.
* **Login:** Handled via Supabase client. JWTs are issued to manage sessions securely.
* **User Profiles:** The public `users` table acts as the profile store. Users can only update their own profile information (like `name`, `college_id`, `avatar_url`).
* **Session Management:** Persisted natively by the Supabase React Native library. Custom claims or specific `role` columns in the `users` table will distinguish between Customer, Kitchen, and Stall Operator.

---

## SECTION 6: ROW LEVEL SECURITY DESIGN

All tables will have RLS enabled.

* **users & addresses:** Users can SELECT, UPDATE, and DELETE only their own rows (matching `auth.uid()`).
* **cities, universities, colleges:** Publicly readable (SELECT) by authenticated and anonymous users. Editable only by system admins.
* **stalls & meals:** Publicly readable by all customers. Operators can UPDATE stalls and meals where `operator_id = auth.uid()`.
* **orders & order_items:**
    * Customers can SELECT and INSERT their own orders.
    * Operations App users can SELECT and UPDATE orders associated with their stalls.
* **subscription_plans:** Publicly readable.
* **subscriptions & meal_histories:** Customers can SELECT their own. Operations can SELECT for validation.
* **inventory_items:** Publicly readable. Operators can UPDATE for their specific stalls.
* **meal_reservations:** Customers can manage their own. Operators can view and update statuses for reservations at their stalls.
* **notifications:** Users can read and update (e.g., mark as read) their own notifications.

---

## SECTION 7: REALTIME DESIGN

Supabase Realtime will be enabled for specific tables and operations.

* **Inventory Changes:** The `inventory_items` table will broadcast `UPDATE` events. The Customer App will listen to these to reflect live availability, disabling purchase buttons if an item sells out.
* **Order Status Updates:** Customers will subscribe to `UPDATE` events on the `orders` table filtered by `id=their_order_id`. When operations mark an order as "Ready", the Customer App updates instantly without polling.
* **Extra Meal Availability:** Realtime inserts/updates on `inventory_items` allow customers on campus to see exactly when fresh meals hit the stall.
* **Notifications:** The `notifications` table will broadcast `INSERT` events, triggering in-app toast alerts or pushing local notifications on the device.

---

## SECTION 8: MULTI-COLLEGE SUPPORT

The schema inherently supports cross-college and cross-city scaling.

* **City → Multiple Colleges:** The `colleges` table references `city_id`. This allows the Customer App to filter available colleges strictly by the user's selected city.
* **College → Multiple Menus (Stalls):** Stalls are strictly mapped to `college_id`. Meals are mapped to `stall_id`. Therefore, a user assigned to College A will only query stalls (and subsequently meals) belonging to College A.
* **Expansion:** Adding a new city or college requires zero schema changes. It simply involves inserting a new row in the `cities` and `colleges` tables, followed by assigning new `stalls`.

---

## SECTION 9: MIGRATION PLAN

The current mock data structs in `mockData.ts` and models in `models.ts` map 1:1 with the new Supabase tables.

* `MOCK_CITIES` → `cities` table
* `MOCK_UNIVERSITIES` → `universities` table
* `MOCK_COLLEGES` → `colleges` table
* `MOCK_CURRENT_USER` → `auth.users` & `users` table
* `MOCK_ADDRESSES` → `addresses` table
* `MOCK_STALLS` → `stalls` table
* `MOCK_MEALS` → `meals` table
* `MOCK_ORDERS` → `orders` table
* `OrderItem` array inside mock orders → `order_items` table
* `MOCK_PLANS` → `subscription_plans` table
* `MOCK_SUBSCRIPTION` → `subscriptions` table
* `MOCK_MEAL_HISTORY` → `meal_histories` table
* `MOCK_NOTIFICATIONS` → `notifications` table
* `MOCK_INVENTORY` → `inventory_items` table
* `MOCK_RESERVATIONS` → `meal_reservations` table
* `MOCK_PAYMENTS` → `payment_records` table

The frontend Services layer will be updated to replace hardcoded mock array filters with Supabase Client queries (e.g., `supabase.from('meals').select('*').eq('stall_id', id)`).

---

## SECTION 10: IMPLEMENTATION ROADMAP

### Phase 1: Authentication & Users
* **Dependencies:** Supabase project setup, frontend auth store.
* **Scope:** Setup `users`, `addresses` tables. Implement Supabase Auth, role management, and profile editing.
* **Complexity:** Low
* **Risks:** Handling session expiration gracefully in React Native.

### Phase 2: Core Data (Colleges, Stalls, Meals)
* **Dependencies:** Phase 1.
* **Scope:** Setup `cities`, `universities`, `colleges`, `stalls`, `meals` tables with public read access. Migrate mock catalogs to database.
* **Complexity:** Low
* **Risks:** Asset storage for images.

### Phase 3: Orders & Checkout
* **Dependencies:** Phase 2.
* **Scope:** Setup `orders`, `order_items`, `payment_records`. Implement transaction logic and secure writes.
* **Complexity:** High
* **Risks:** Ensuring data consistency between cart totals and database inserts.

### Phase 4: Inventory & Extra Meals
* **Dependencies:** Phase 3.
* **Scope:** Setup `inventory_items`, `meal_reservations`. Implement logic to hold/deduct inventory accurately.
* **Complexity:** High
* **Risks:** Race conditions when multiple students reserve the last extra meal simultaneously.

### Phase 5: Subscriptions
* **Dependencies:** Phase 3.
* **Scope:** Setup `subscription_plans`, `subscriptions`, `meal_histories`. Logic to deduct daily meal quotas.
* **Complexity:** Medium
* **Risks:** Handling plan expirations and automatic status updates.

### Phase 6: Realtime & Notifications
* **Dependencies:** All previous phases.
* **Scope:** Setup `notifications`. Enable Supabase Realtime for orders, inventory, and notifications. Update frontend hooks to listen to channels.
* **Complexity:** Medium
* **Risks:** Managing WebSocket connection lifecycle when the app goes into the background.
