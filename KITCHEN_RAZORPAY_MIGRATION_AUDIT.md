# Kitchen App Razorpay Migration Audit

## Executive Summary
The kitchen/operator functionality is embedded in the same codebase via RPC functions and database tables. The system currently assumes all payments require manual screenshot verification. With Razorpay integration, payments are auto-verified by the gateway, making manual verification obsolete for online payments.

---

## Current Architecture Overview

### Database Tables (Manual Payment System)
1. **`payment_proofs`** - Stores uploaded payment screenshots
2. **`payment_settings`** - Stores UPI QR codes and recipient details per stall
3. **`subscription_purchase_requests`** - Tracks subscription purchase lifecycle
4. **`payment_records`** - Final payment records after verification

### Key RPC Functions (Kitchen Operators Use These)
1. **`verify_order_payment(p_proof_id)`** - Approve order payment
2. **`reject_order_payment(p_proof_id, p_reason)`** - Reject order payment
3. **`approve_subscription_purchase(p_request_id)`** - Approve subscription payment
4. **`reject_subscription_purchase(p_request_id, p_reason)`** - Reject subscription payment
5. **`mark_cash_collected(p_order_id)`** - Mark cash orders as paid

---

## Migration Strategy

### Phase 1: Database Schema Updates ✅ (Already Done)
- ✅ `payment_gateway` column added to track payment method (Razorpay vs UPI)
- ✅ `razorpay_order_id`, `razorpay_payment_id`, `razorpay_signature` columns added
- ✅ Razorpay webhook infrastructure in place

### Phase 2: Backend RPC Updates (NEEDED)

#### A. Order Payment Verification
**Current Flow:**
1. Customer uploads screenshot
2. Kitchen operator views screenshot
3. Operator clicks Approve/Reject
4. RPC: `verify_order_payment()` or `reject_order_payment()`

**New Flow:**
- **Razorpay Orders:** Auto-verified by webhook, skip manual verification entirely
- **UPI Orders (Legacy):** Keep existing manual verification flow

**Required Changes:**
1. Update `place_order` RPC to set `payment_verification_status = 'not_required'` for Razorpay
2. Razorpay webhook already handles auto-verification
3. Kitchen UI should hide Razorpay orders from "Pending Verification" queue

#### B. Subscription Payment Verification
**Current Flow:**
1. Customer uploads screenshot
2. Creates `subscription_purchase_request` with status `awaiting_proof`
3. Kitchen operator views screenshot
4. Operator clicks Approve/Reject
5. RPC: `approve_subscription_purchase()` creates subscription
6. RPC: `reject_subscription_purchase()` rejects request

**New Flow:**
- **Razorpay Subscriptions:** Auto-approved by webhook, subscription created immediately
- **UPI Subscriptions (Legacy):** Keep existing manual verification flow

**Required Changes:**
1. Razorpay webhook already handles auto-approval (migration 063)
2. Kitchen UI should filter out Razorpay requests from verification queue
3. Keep legacy RPCs for UPI backward compatibility

---

## Kitchen UI Components to Update

### 1. Payment Verification Dashboard (CRITICAL)
**Location:** Unknown - needs to be found (likely web-based admin panel or separate app)

**Current Behavior:**
- Shows all pending payment proofs (orders + subscriptions)
- Displays screenshot for manual verification
- Approve/Reject buttons

**Required Changes:**
- Filter out `payment_gateway = 'razorpay'` from pending queue
- Only show UPI payments requiring manual verification
- Add indicator showing payment method (Razorpay vs UPI)
- Show "Auto-verified by Razorpay" status for completed Razorpay payments

### 2. Order Management Screen
**Current:**
- All orders show payment verification status
- Kitchen sees "Awaiting Proof" → "Pending Verification" → "Verified"

**Required:**
- Razorpay orders: Show "Paid via Razorpay" badge
- UPI orders: Show existing verification workflow
- Cash orders: Show "Cash on Pickup"

### 3. Subscription Approval Queue
**Current:**
- All subscription requests require manual approval
- Kitchen views screenshot and approves/rejects

**Required:**
- Filter Razorpay subscriptions from queue (auto-approved)
- Show only UPI subscriptions needing manual verification
- Display payment method clearly

---

## Database Query Updates Needed

### Pending Payment Proofs Query
**Old Query:**
```sql
SELECT * FROM payment_proofs 
WHERE status = 'pending';
```

**New Query:**
```sql
SELECT p.* FROM payment_proofs p
LEFT JOIN orders o ON p.order_id = o.id
LEFT JOIN subscription_purchase_requests spr ON p.subscription_request_id = spr.id
WHERE p.status = 'pending'
  AND (
    (o.id IS NOT NULL AND o.payment_gateway != 'razorpay')
    OR (spr.id IS NOT NULL AND spr.payment_gateway != 'razorpay')
  );
```

### Pending Subscription Requests Query
**Old Query:**
```sql
SELECT * FROM subscription_purchase_requests 
WHERE status = 'verification_pending';
```

**New Query:**
```sql
SELECT * FROM subscription_purchase_requests 
WHERE status = 'verification_pending'
  AND payment_gateway != 'razorpay';
```

---

## Files to Locate and Update

### Priority 1: Find Kitchen UI
**Unknown locations - need to search:**
- [ ] Separate kitchen web app?
- [ ] Admin panel in same codebase?
- [ ] Expo Go app with role-based views?
- [ ] External dashboard?

**Search Strategy:**
1. Look for admin/kitchen routes in `app/` directory
2. Search for RPC calls: `verify_order_payment`, `approve_subscription_purchase`
3. Check for role-based screens using `UserRole.KITCHEN` or `UserRole.STALL_OPERATOR`
4. Look for web-based admin in separate folder

### Priority 2: Update Backend RPCs (If Needed)
**Files:**
- `supabase/migrations/041_manual_payments.sql`
- `supabase/migrations/063_fix_subscription_payment_check.sql`

**Potential Updates:**
- Add `payment_gateway` filtering to RPC functions
- Prevent manual approval/rejection of Razorpay payments
- Add validation checks

### Priority 3: Update Notification Messages
**Current notifications mention:**
- "Payment proof submitted"
- "Awaiting verification"
- "Kitchen verification"

**Update to:**
- "Payment received via Razorpay"
- "Payment confirmed"
- "Payment processing"

---

## Testing Checklist

### Razorpay Flow (New)
- [ ] Customer pays via Razorpay for order → Auto-verified, kitchen never sees it in queue
- [ ] Customer pays via Razorpay for subscription → Auto-approved, subscription activates immediately
- [ ] Kitchen dashboard shows only manual verification items (UPI/screenshots)

### UPI Flow (Legacy - Must Still Work)
- [ ] Customer uploads UPI screenshot for order → Kitchen sees it in queue
- [ ] Kitchen approves order payment → Order confirmed
- [ ] Kitchen rejects order payment → Customer can retry
- [ ] Customer uploads UPI screenshot for subscription → Kitchen sees it
- [ ] Kitchen approves subscription → Subscription activates
- [ ] Kitchen rejects subscription → Customer can retry

### Cash Flow (Unchanged)
- [ ] Customer selects cash → Kitchen marks as paid on pickup

---

## Next Steps

1. **Locate Kitchen UI** - Search codebase for admin/kitchen interface
2. **Identify all screens showing payment verification**
3. **Update queries to filter by payment_gateway**
4. **Test both Razorpay and UPI flows**
5. **Update notification messages**
6. **Remove "screenshot" language from kitchen UI**

---

## Key Principle
**Razorpay = Trust the Gateway, No Manual Verification Needed**
- Kitchen operators should NEVER see Razorpay payment proofs in their queue
- Only UPI/manual payments require kitchen verification
- This reduces kitchen workload and speeds up order processing
