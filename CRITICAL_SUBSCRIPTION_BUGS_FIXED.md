# Critical Subscription Bug Fixes

## Date: October 2, 2026

---

## Bugs Reported

### Bug 1: Subscription Credits Not Being Deducted ❌ CRITICAL
**Symptom:**
- User places order with subscription (1 credit should be used)
- Order completes successfully
- User tries to place another order
- System still shows "Covered by subscription" 
- Credits remaining shows same count (e.g., still shows "1 left today")
- Subscription credits are NOT being updated in the database

**Root Cause:**
The `subscriptionUpdates` object from the subscription engine was NOT being passed to the backend RPC function. The frontend calculated the updates but never sent them.

**Files Involved:**
1. `app\(tabs)\(orders)\checkout.tsx` - Calls placeOrder but didn't pass subscriptionUpdates
2. `src\services\orders\index.ts` - placeOrder function didn't accept subscriptionUpdates parameter
3. Backend RPC expects `subscriptionUpdates` in payload to update subscription credits

**Fix Applied:**
1. ✅ Added `subscriptionUpdates` parameter to `placeOrder` function signature
2. ✅ Added `subscriptionUpdates` to payload sent to backend RPC
3. ✅ Updated checkout.tsx to pass `engineResult.subscriptionUpdates` wrapped in proper format:
```typescript
subscriptionUpdates: engineResult.subscriptionUpdates ? {
  id: subscription!.id,
  updates: engineResult.subscriptionUpdates
} : undefined
```

---

### Bug 2: Subscription Orders Show "Cash Due at Pickup" ❌ CRITICAL
**Symptom:**
- User places order covered by subscription (total = ₹0)
- Order details page shows:
  - Payment Method: "Cash on Pickup"
  - Payment Status: "Cash due at pickup"
- This is confusing and incorrect for subscription orders

**Root Cause:**
When we changed subscription-covered orders to use `PaymentMethod.CASH` (to fix backend compatibility), the payment display logic still checked for the old `PaymentMethod.SUBSCRIPTION` enum value.

**Files Involved:**
1. `src\utils\paymentDisplay.ts` - Detection logic was outdated
2. `app\(tabs)\(orders)\checkout.tsx` - Sends CASH as payment method for subscription orders

**Fix Applied:**
Updated `resolveOrderPaymentDisplay` function to properly detect subscription orders:

```typescript
// OLD (broken):
const isSubscriptionCovered = 
  order.paymentMethod === PaymentMethod.SUBSCRIPTION || // This never matches anymore!
  ...

// NEW (fixed):
const hasSubscriptionItems = order.items && order.items.some(i => 
  !!i.subscriptionId && (i.creditsUsed ?? 0) > 0
);
const isSubscriptionCovered = 
  order.orderType === OrderType.SUBSCRIPTION ||
  hasSubscriptionItems || // Check actual order items, not payment method
  (!!(order as any).subscription_id && order.total === 0);
```

Also updated cash detection to exclude subscription orders:
```typescript
// Only show "Cash due at pickup" for ACTUAL cash orders, not subscription
if (order.paymentMethod === PaymentMethod.CASH && order.total > 0 && !hasSubscriptionItems) {
  return { type: 'CASH', label: 'Cash due at pickup', amountDue: order.total };
}
```

---

## Impact of Bugs

### Before Fixes:
1. **Subscription credits never decreased** - Users could place unlimited "free" orders
2. **Subscription tracking broken** - No way to know how many credits used
3. **Confusing payment display** - Subscription orders showed as "Cash"
4. **Data integrity issues** - Subscription table not updating
5. **Business logic broken** - Entire subscription system non-functional

### After Fixes:
1. ✅ Subscription credits properly deducted after each order
2. ✅ `daily_credits_used`, `consumed_meals`, `remaining_meals` update correctly
3. ✅ `last_usage_date` tracks when subscription was last used
4. ✅ Payment display shows "Covered by subscription" correctly
5. ✅ Order details page shows proper payment status

---

## Testing Required

### Test Case 1: Basic Subscription Order
1. Customer has active subscription (e.g., 2 credits left today)
2. Place order worth 1 credit
3. **Expected:**
   - Order total: ₹0
   - Order places successfully
   - Subscription updates:
     - `daily_credits_used`: 0 → 1
     - `consumed_meals`: N → N+1
     - `remaining_meals`: N → N-1
     - `last_usage_date`: today's date
   - Order details show: "Covered by subscription"
   - Credits left today: 2 → 1

### Test Case 2: Second Order Same Day
1. After test case 1, place another 1-credit order
2. **Expected:**
   - Subscription updates:
     - `daily_credits_used`: 1 → 2
     - `consumed_meals`: N+1 → N+2
     - `remaining_meals`: N-1 → N-2
   - Credits left today: 1 → 0

### Test Case 3: Exceeding Daily Limit
1. After using all daily credits, try to place another order
2. **Expected:**
   - Order NOT covered by subscription
   - Shows payment options (Razorpay/UPI/Cash)
   - Total shows actual meal price

### Test Case 4: Order Details Display
1. View any subscription-covered order
2. **Expected:**
   - Payment Method: Shows appropriate label (not "Cash on Pickup")
   - Payment Status: "Covered by subscription"
   - Amount Due: ₹0

---

## Files Modified

1. **`src\services\orders\index.ts`**
   - Added `subscriptionUpdates` parameter to `placeOrder` function
   - Added `subscriptionUpdates` to RPC payload

2. **`app\(tabs)\(orders)\checkout.tsx`**
   - Pass `engineResult.subscriptionUpdates` to `placeOrder` function
   - Wrapped in proper format: `{ id: subscription.id, updates: {...} }`

3. **`src\utils\paymentDisplay.ts`**
   - Updated subscription detection logic
   - Check `subscriptionId` and `creditsUsed` on order items
   - Exclude subscription orders from cash display logic

---

## Root Cause Analysis

### Why Did This Happen?

1. **Incomplete Backend Integration**
   - Frontend calculated subscription updates correctly
   - But forgot to send them to backend
   - Backend RPC was waiting for data that never arrived

2. **Payment Method Enum Change Side Effect**
   - Changed `SUBSCRIPTION` → `CASH` to fix backend compatibility
   - Didn't update dependent display logic
   - Created a mismatch between internal representation and UI

3. **Missing Integration Testing**
   - End-to-end subscription flow not tested after backend changes
   - Would have caught both bugs immediately

---

## Prevention Measures

1. **Add Integration Tests**
   - Test full subscription order flow
   - Verify database updates after order
   - Check payment display logic

2. **Add Validation Logging**
   - Log subscription updates being sent to backend
   - Log database changes after order placement
   - Alert if credits don't update

3. **Code Review Checklist**
   - When changing enums, search for all references
   - When adding RPC parameters, verify frontend passes them
   - When modifying payment logic, test all payment types

---

## Deployment Notes

- **No database migrations needed** - tables and columns exist
- **Backward compatible** - doesn't break existing orders
- **Immediate deployment safe** - fixes critical bugs only
- **Rollback easy** - revert Git commits if issues

---

## Priority: CRITICAL 🔴

These bugs completely break subscription functionality. Without these fixes:
- Subscriptions are unlimited (fraud risk)
- No credit tracking (business intelligence broken)
- Confusing UX (customer support burden)

**Deploy immediately after testing!**
