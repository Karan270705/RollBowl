# Razorpay UX Issues & Fixes Required

## Summary
The Razorpay integration is working functionally, but several UX issues remain related to the old manual screenshot verification system. These need to be cleaned up to provide a seamless experience.

---

## Issues to Fix

### 1. Subscription Success Screen Shows Screenshot Language
**File:** `app/(tabs)/(subscription)/success.tsx`

**Problem:** After Razorpay payment, users see "Your screenshot has been received" and "kitchen verifies and approves the payment" messages.

**Fix:** Update the screen to detect Razorpay payments and show appropriate messaging.

```typescript
// Line 11-22, replace with:
export default function SubscriptionSuccessScreen() {
  const router = useRouter();
  const { isReplacement, paymentGateway } = useLocalSearchParams<{ 
    isReplacement?: string;
    paymentGateway?: string;
  }>();

  const isRazorpay = paymentGateway === 'razorpay';

  const titleText = isRazorpay 
    ? 'Payment Successful!'
    : (isReplacement === 'true'
      ? 'New payment proof submitted'
      : 'Payment proof submitted');

  const bodyText = isRazorpay
    ? 'Your payment was successful and your subscription is now active. You can start placing orders immediately!'
    : (isReplacement === 'true'
      ? 'New payment proof submitted. Your request is waiting for kitchen verification.'
      : 'Your screenshot has been received. Your subscription will be activated after the kitchen verifies and approves the payment.');
```

**Also update the icon and info box:**
```typescript
// Line 26-28, replace icon logic:
<View style={styles.iconCircle}>
  <Ionicons 
    name={isRazorpay ? "checkmark-circle" : "time-outline"} 
    size={80} 
    color={isRazorpay ? Colors.success : Colors.primary} 
  />
</View>

// Line 33-42, conditionally show info box:
{!isRazorpay && (
  <View style={styles.infoBox}>
    <View style={styles.infoRow}>
      <Ionicons name="shield-checkmark-outline" size={20} color={Colors.primary} />
      <Text style={styles.infoText}>Status: Pending Verification</Text>
    </View>
    <View style={styles.infoRow}>
      <Ionicons name="information-circle-outline" size={20} color={Colors.primary} />
      <Text style={styles.infoText}>You will be notified once verified by Kitchen</Text>
    </View>
  </View>
)}
```

**Update navigation from purchase screen:**
```typescript
// In purchase/[id].tsx, line 342-345:
router.replace({
  pathname: '/(tabs)/(subscription)/success',
  params: { 
    isReplacement: isRejected ? 'true' : 'false',
    paymentGateway: 'razorpay' // Add this
  },
} as any);
```

---

### 2. Subscription List Shows "Awaiting Screenshot" for Razorpay
**File:** `app/(tabs)/(subscription)/index.tsx`

**Problem:** Pending Razorpay subscriptions show "Awaiting Screenshot" status.

**Fix:** Already partially fixed on line 171, but the PaymentStatusBadge component needs updating.

**Find:** `src/components/payments/PaymentStatusBadge.tsx`

**Update it to:**
```typescript
export function PaymentStatusBadge({ status, paymentGateway }: { 
  status: string; 
  paymentGateway?: string;
}) {
  const isRazorpay = paymentGateway === 'razorpay';

  let label = '';
  let bgColor = '';
  let textColor = '';

  switch (status) {
    case 'awaiting_proof':
      if (isRazorpay) {
        label = 'Payment Pending';
        bgColor = Colors.warning + '20';
        textColor = Colors.warningDark;
      } else {
        label = 'Awaiting Screenshot';
        bgColor = Colors.warning + '20';
        textColor = Colors.warningDark;
      }
      break;
    case 'verification_pending':
      if (isRazorpay) {
        label = 'Processing Payment';
        bgColor = Colors.info + '20';
        textColor = Colors.infoDark;
      } else {
        label = 'Pending Verification';
        bgColor = Colors.info + '20';
        textColor = Colors.infoDark;
      }
      break;
    // ... rest of cases
  }

  return (
    <View style={{ backgroundColor: bgColor, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 }}>
      <Text style={{ color: textColor, fontSize: 11, fontWeight: '600' }}>{label}</Text>
    </View>
  );
}
```

---

### 3. Delete Failed/Cancelled Razorpay Requests Automatically
**Problem:** When Razorpay payment fails or is cancelled, the request stays in "Pending Requests" forcing users to click it to retry.

**Solution:** Delete the subscription request when payment fails/cancels so users see the clean subscription screen.

**File:** `app/(tabs)/(subscription)/purchase/[id].tsx`

**Add delete function:**
```typescript
import { supabase } from '@/src/lib/supabase';

// Add near the top of the component:
const deleteSubscriptionRequest = async (requestId: string) => {
  try {
    await supabase
      .from('subscription_purchase_requests')
      .delete()
      .eq('id', requestId);
  } catch (error) {
    console.error('Failed to delete subscription request:', error);
  }
};
```

**Update failure handlers (line 352-363):**
```typescript
onFailure={(reason) => {
  handlePaymentFailure(
    async (error) => {
      // Delete the failed request
      if (authoritativeData?.requestId) {
        await deleteSubscriptionRequest(authoritativeData.requestId);
      }
      setErrorMessage(error);
      Alert.alert(
        'Payment Failed',
        'Your payment could not be completed. Please try again.',
        [
          {
            text: 'OK',
            onPress: () => router.replace('/(tabs)/(subscription)' as any)
          }
        ]
      );
    },
    reason
  );
}}
onCancel={() => {
  handlePaymentFailure(
    async (error) => {
      // Delete the cancelled request
      if (authoritativeData?.requestId) {
        await deleteSubscriptionRequest(authoritativeData.requestId);
      }
      setErrorMessage(error);
      Alert.alert(
        'Payment Cancelled',
        'You cancelled the payment.',
        [
          {
            text: 'OK',
            onPress: () => router.replace('/(tabs)/(subscription)' as any)
          }
        ]
      );
    },
    'User cancelled payment'
  );
}}
```

---

### 4. Navigate Directly to Success/Home After Razorpay Payment
**Problem:** After successful payment, users shouldn't land on "pending requests" screen.

**Solution:** Navigate directly to active subscription view or home.

**File:** `app/(tabs)/(subscription)/purchase/[id].tsx` line 341-346

**Replace with:**
```typescript
() => {
  // For Razorpay, subscription is immediately active
  // Navigate to main subscription screen which will show active subscription
  router.replace('/(tabs)/(subscription)' as any);
}
```

---

### 5. Hide Pending Requests Section When Using Razorpay
**File:** `app/(tabs)/(subscription)/index.tsx`

**Problem:** "Pending Requests" section shows even for Razorpay (brief flash before approval).

**Fix:** Filter out Razorpay requests from pending display:

```typescript
// Line 70-93, update filter:
const pendingRequests = requests.filter(request => {
  // 1. Hide when request.status is APPROVED
  if (request.status === SubscriptionRequestStatus.APPROVED) {
    return false;
  }
  // 2. Hide any stale local/cache copy once created_subscription_id exists
  if (request.createdSubscriptionId) {
    return false;
  }
  // 3. Hide Razorpay requests (they're processed immediately)
  if (request.paymentGateway === 'razorpay' || request.payment_gateway === 'razorpay') {
    return false;
  }
  // 4. Hide rejected when an active subscription now exists for that approved request
  if (
    request.status === SubscriptionRequestStatus.REJECTED &&
    subscription &&
    isSubscriptionActive
  ) {
    return false;
  }
  // 5. Show unresolved UPI requests (awaiting_proof, verification_pending) or rejected when still unresolved
  return (
    request.status === SubscriptionRequestStatus.AWAITING_PROOF ||
    request.status === SubscriptionRequestStatus.VERIFICATION_PENDING ||
    request.status === SubscriptionRequestStatus.REJECTED
  );
});
```

---

## Summary of User Flow After Fixes

### Razorpay Subscription Purchase (New Flow):
1. User clicks "Subscribe" on a plan
2. Sees loading overlay "Initiating payment..."
3. Razorpay WebView opens
4. User completes payment
5. Immediately navigates to main subscription screen showing **active subscription**
6. No "pending requests", no "awaiting screenshot", no manual verification

### Failed/Cancelled Payment:
1. Payment fails or user cancels
2. Request is automatically deleted
3. User returns to clean subscription screen
4. Can retry by clicking Subscribe again
5. No leftover "pending request" visible

### Legacy UPI Flow (Backward Compatible):
1. User clicks "Subscribe"
2. Sees UPI QR code
3. Uploads screenshot
4. Goes to "Pending Requests"
5. Shows "Awaiting Screenshot" → "Pending Verification"
6. Kitchen manually verifies
7. Subscription activates

---

## Testing Checklist

After implementing all fixes:

- [ ] Subscribe with Razorpay → Payment success → Shows active subscription immediately
- [ ] Subscribe with Razorpay → Cancel payment → Returns to clean screen, no pending request
- [ ] Subscribe with Razorpay → Payment fails → Returns to clean screen, can retry
- [ ] No "screenshot" or "kitchen verification" text appears for Razorpay flow
- [ ] "Pending Requests" section never shows Razorpay requests
- [ ] Legacy UPI flow still works (backward compatibility)
- [ ] Order payment with Razorpay doesn't show screenshot prompt
- [ ] Cart clears after successful order/subscription

---

## Files to Modify

1. `app/(tabs)/(subscription)/success.tsx` - Update success messaging
2. `app/(tabs)/(subscription)/index.tsx` - Filter Razorpay from pending
3. `app/(tabs)/(subscription)/purchase/[id].tsx` - Delete failed requests, update navigation
4. `src/components/payments/PaymentStatusBadge.tsx` - Update status labels
5. Checkout screen (for cart clearing) - Already has fixes documented

---

## Priority Order

1. **HIGH:** Delete failed/cancelled Razorpay requests (prevents confusion)
2. **HIGH:** Navigate directly after success (better UX)
3. **MEDIUM:** Update success screen messaging (removes screenshot language)
4. **MEDIUM:** Filter Razorpay from pending requests (cleaner UI)
5. **LOW:** Update status badge labels (polish)

---

## Notes

- All changes preserve backward compatibility with UPI screenshot flow
- No database changes needed
- No Edge Function changes needed
- Pure frontend UX improvements
