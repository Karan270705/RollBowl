# Razorpay Edge Functions Testing Guide

## Local Testing Setup

1. **Install Supabase CLI** (if not already):
   ```bash
   npm install -g supabase
   ```

2. **Start local functions**:
   ```bash
   supabase functions serve --env-file supabase/.env.local
   ```

3. **Create `.env.local`** with test credentials:
   ```bash
   RAZORPAY_KEY_ID=rzp_test_XXXXXXXXXXXXXXXX
   RAZORPAY_KEY_SECRET=your_test_secret
   RAZORPAY_WEBHOOK_SECRET=your_webhook_secret
   ```

## Test Scenarios

### 1. Test Order Creation

Request:
```bash
curl -X POST http://localhost:54321/functions/v1/create-razorpay-order \
  -H "Authorization: Bearer <user-jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "order",
    "entity_id": "<order-uuid>",
    "stall_id": "<stall-uuid>"
  }'
```

Expected Response:
```json
{
  "success": true,
  "data": {
    "razorpay_order_id": "order_XXXXXXXXXXXXXXX",
    "amount": 15000,
    "currency": "INR",
    "key_id": "rzp_test_XXXXXXXXXXXXXXXX"
  }
}
```

### 2. Test Payment Verification

Use Razorpay Test Cards:
- **Success**: 4111 1111 1111 1111
- **Failure**: 4111 1111 1111 1234

After payment via Razorpay Checkout, call:
```bash
curl -X POST http://localhost:54321/functions/v1/verify-razorpay-payment \
  -H "Authorization: Bearer <user-jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "razorpay_order_id": "order_XXXXXXXXXXXXXXX",
    "razorpay_payment_id": "pay_XXXXXXXXXXXXXXX",
    "razorpay_signature": "generated_signature_from_razorpay"
  }'
```

### 3. Test Webhook

Use Razorpay Webhook Simulator or simulate with curl:
```bash
curl -X POST http://localhost:54321/functions/v1/razorpay-webhook \
  -H "x-razorpay-signature: <generated-signature>" \
  -H "Content-Type: application/json" \
  -d @webhook_payload.json
```

## Edge Cases to Test

- [ ] Double verification (call verify twice with same payment)
- [ ] Invalid signature (tampered data)
- [ ] Mismatched amount (payment amount ≠ order amount)
- [ ] Payment for already-paid order
- [ ] User trying to verify someone else's payment
- [ ] Webhook arriving before client callback
- [ ] Client callback arriving before webhook
- [ ] Network timeout during Razorpay API call
- [ ] Razorpay API returning 500 error
- [ ] Order expired (past 15-minute deadline)
- [ ] Subscription request that doesn't exist
- [ ] Zero-amount order (should not create Razorpay order)

## Database Verification

After each test, verify:

```sql
-- Check order status
SELECT id, payment_status, payment_verification_status, razorpay_order_id, razorpay_payment_id
FROM orders WHERE id = '<order-uuid>';

-- Check payment records
SELECT * FROM payment_records WHERE order_id = '<order-uuid>';

-- Check webhook events
SELECT * FROM razorpay_events WHERE razorpay_order_id = '<razorpay-order-id>';
```
