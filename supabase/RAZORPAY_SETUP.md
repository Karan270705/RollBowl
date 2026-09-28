# Razorpay Setup for RollBowl

## 1. Get Test Credentials from Razorpay

1. Sign up at https://razorpay.com (if not already done)
2. Go to Settings → API Keys → **Test Mode**
3. Generate/Copy:
   - Key ID (starts with `rzp_test_`)
   - Key Secret
4. Go to Settings → Webhooks → Create Webhook
5. Set URL: `https://<your-supabase-project>.functions.supabase.co/razorpay-webhook`
6. Select events: `payment.captured`, `payment.failed`, `order.paid`
7. Copy the Webhook Secret

## 2. Configure Supabase Secrets

In Supabase Dashboard → Edge Functions → Secrets, add:

```bash
RAZORPAY_KEY_ID=rzp_test_XXXXXXXXXXXXXXXX
RAZORPAY_KEY_SECRET=YOUR_TEST_SECRET_HERE
RAZORPAY_WEBHOOK_SECRET=YOUR_WEBHOOK_SECRET_HERE
```

## 3. Deploy Edge Functions

```bash
supabase functions deploy create-razorpay-order
supabase functions deploy verify-razorpay-payment
supabase functions deploy razorpay-webhook
```

## 4. Test the Setup

Use Razorpay Test Mode with test cards:
- Success: 4111 1111 1111 1111
- Failure: 4111 1111 1111 1234

Check `razorpay_events` table to verify webhook events are being received.
