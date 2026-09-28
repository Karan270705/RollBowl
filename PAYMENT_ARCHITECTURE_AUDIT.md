# RollBowl Payment Architecture Audit

## 1. Executive Summary
The current RollBowl payment system relies on a manual screenshot-verification process for online (UPI) payments and a cash-collection process for offline payments. The system is multi-stall aware, allowing each stall to configure its own payment receiver (UPI ID and QR code). 
When customers place orders or purchase subscriptions, they are shown a QR code. They make the payment externally, take a screenshot, and upload it as a "payment proof". Kitchen operators then review these proofs on their dashboard and manually accept or reject them, triggering the confirmation of the order or the activation of the subscription. 

The goal of integrating Razorpay is to replace this manual, high-friction flow with an automated webhook-driven payment gateway, while preserving the complex multi-stall and subscription state management logic.

---

## 2. Database Schema Overview
The payment architecture spans across several interrelated tables to maintain auditability and separate contexts (orders vs. subscriptions).

### Core Payment Tables
- **`payment_settings`**: Stores the UPI ID, recipient name, and QR code image path per stall.
- **`payment_proofs`**: Stores uploaded screenshot metadata (path, size, mime type), the snapshot of the UPI ID paid to, and the verification status (`pending`, `verified`, `rejected`, `superseded`). Polymorphically links to either an `order_id` or `subscription_request_id`.
- **`payment_records`**: A ledger of confirmed payments, storing `amount`, `status` (`paid`), and `method` (`upi`, `cash`). Links to `order_id` or `subscription_id`.

### Entity Tables
- **`orders`**: Contains payment state tracking via `payment_verification_status` (`not_required`, `awaiting_proof`, `pending`, `verified`, `rejected`, `expired`), `payment_method` (`upi`, `cash`), `payment_status` (`pending`, `paid`), and `payment_proof_deadline`.
- **`subscription_purchase_requests`**: Acts as a holding area for subscription purchases before payment is verified. Tracks `plan_id`, `expected_amount`, `status` (`awaiting_proof`, `verification_pending`, `approved`, `rejected`), and links to the `current_payment_proof_id`.
- **`subscriptions`**: The final activated subscription entity.
- **`subscription_credit_reservations`**: A durable ledger that handles complex partial-payment flows (mixed subscription credits and cash/UPI) by reserving credits idempotently during the `place_order` phase and converting them to `consumed` during order acceptance.

---

## 3. Payment Flow Diagrams

### Flow A: Regular UPI Order
1. **Initiation**: Customer selects items and chooses UPI. `place_order` RPC is called.
2. **Order Created**: Order is created with `payment_verification_status = 'awaiting_proof'` and a 15-minute `payment_proof_deadline`.
3. **Proof Submission**: Customer uploads screenshot. `submit_order_payment_proof` RPC is called. Order becomes `pending`.
4. **Verification**: Kitchen operator calls `verify_order_payment` RPC.
5. **Confirmation**: Order `status` becomes `confirmed`, `payment_verification_status` becomes `verified`, `payment_status` becomes `paid`. A `payment_record` is inserted.

### Flow B: Subscription Purchase
1. **Initiation**: Customer selects plan. `create_subscription_purchase_request` RPC creates request.
2. **Proof Submission**: Customer uploads screenshot. `submit_subscription_payment_proof` RPC is called. Request becomes `verification_pending`.
3. **Verification**: Kitchen operator calls `approve_subscription_purchase` RPC.
4. **Confirmation**: A new `subscription` row is created (`active`). Request is marked `approved`. A `payment_record` is inserted.

### Flow C: Mixed Order (Subscription Credits + UPI/Cash)
1. **Initiation**: `place_order` detects subscription item usage and computes partial cost.
2. **Reservation**: `subscription_credit_reservations` creates a `reserved` ledger entry.
3. **Payment**: The remaining amount goes through Flow A (UPI) or Cash flow.
4. **Acceptance**: `accept_order` RPC converts the reservation to `consumed` and strictly updates the subscription balances without double-counting.

---

## 4. Supabase Functions/RPCs

| RPC Name | Purpose | Action Performed |
|----------|---------|------------------|
| `place_order` | Core ordering engine | Calculates totals, determines if payment is required, reserves subscription credits, sets initial payment status (`awaiting_proof` or `not_required`). |
| `submit_order_payment_proof` | Link screenshot to order | Inserts into `payment_proofs`, marks old proofs `superseded`, updates order status to `pending`. Triggers notification. |
| `verify_order_payment` | Manual Kitchen verification | Validates operator auth, marks proof `verified`, updates order to `paid`/`confirmed`, creates `payment_records`. |
| `reject_order_payment` | Manual Kitchen rejection | Marks proof `rejected`, sets order back to `rejected` state to allow retry. |
| `mark_cash_collected` | Cash handling | Sets order to `paid`, creates `payment_records` for cash payments. |
| `expire_unverified_upi_orders` | Cron/Trigger cleanup | Cancels orders where `payment_proof_deadline` has passed and status is still `awaiting_proof`. |
| `accept_order` | Kitchen order acceptance | Primarily for subscription logic, converts `reserved` credits to `consumed` upon order confirmation. |
| `create_subscription_purchase_request` | Init sub purchase | Creates request in `awaiting_proof` state. |
| `submit_subscription_payment_proof` | Link screenshot to sub | Inserts into `payment_proofs` for subscriptions. |
| `approve_subscription_purchase` | Verify sub payment | Creates the active subscription, logs payment, marks request approved. |
| `reject_subscription_purchase` | Reject sub payment | Marks request rejected. |

---

## 5. Security Model & RLS Policies

- **`payment_settings`**: Public read for `is_active = true`. Operators can manage their own stall's settings.
- **`payment_proofs` & `subscription_purchase_requests`**: 
  - **Customers**: Can only `SELECT` their own records (`user_id = auth.uid()`).
  - **Operators**: Can `SELECT` records for their assigned stall (`is_stall_operator(stall_id)`).
- **Storage Bucket (`payment-proofs`)**:
  - Customers can `INSERT` and `SELECT` their own images in paths like `orders/{user_id}/...` or `subscriptions/{user_id}/...`.
  - Operators can `SELECT` images linked to their stall's `payment_proofs`.
- **RPCs**: All RPCs use `SECURITY DEFINER` with strict internal checks for `auth.uid()`, `is_stall_operator()`, and status matching to prevent unauthorized state transitions or access.

---

## 6. Multi-Stall Considerations

The current architecture is highly multi-stall aware:
- Payments are bound to a specific `stall_id`.
- `payment_settings` enforce that a customer pays the specific UPI ID configured for that stall.
- Kitchen operators can only verify/reject payments belonging to stalls they manage.
- Any Razorpay integration must route funds correctly to different stalls (e.g., using **Razorpay Route** for linked accounts or dynamic merchant credentials per stall).

---

## 7. Razorpay Integration Points

To transition to Razorpay, the architecture should be modified at the following injection points:

1. **Pre-Checkout (Backend)**: 
   - Expose a new edge function (e.g., `create_razorpay_order`) that creates an Order on Razorpay's API and returns the Razorpay `order_id`.
   - The `orders` table and `subscription_purchase_requests` table will need new columns: `razorpay_order_id`, `razorpay_payment_id`, `razorpay_signature`.

2. **Frontend Checkout**:
   - Replace the `UpiPaymentPanel` and `PaymentScreenshotPicker` components with the Razorpay SDK trigger (`RazorpayCheckout.open(options)`).

3. **Webhook/Callback Handling**:
   - Instead of the Kitchen Operator calling `verify_order_payment`, a secure webhook endpoint (Supabase Edge Function) will listen for `payment.captured` or `order.paid` events from Razorpay.
   - The webhook will verify the signature and securely execute the logic inside `verify_order_payment` (for orders) or `approve_subscription_purchase` (for subscriptions).

4. **Deprecation**:
   - The `payment_proofs` table, `payment-proofs` storage bucket, and screenshot upload RPCs will become obsolete.
   - `expire_unverified_upi_orders` should be replaced or adapted to sync expired Razorpay orders.

---

## 8. Migration & Implementation Considerations

- **Data Migration**: Existing `payment_proofs` and `payment_settings` should be kept as legacy data for auditing purposes. Do not drop these tables immediately.
- **In-Flight Orders**: Orders in `awaiting_proof` or `pending` states when the deployment happens must be allowed to complete via the old manual flow, or forcefully expired.
- **Razorpay Route**: Because RollBowl has multiple stalls (franchises/kitchens), you must decide whether to use a single Razorpay merchant account and handle payouts manually, or use Razorpay Route to split payments to stall-specific linked accounts automatically.

---

## 9. Risk Assessment

1. **Webhook Failures**: Network issues might drop Razorpay webhooks. 
   *Mitigation*: Implement a polling fallback on the frontend post-payment, or a cron job that checks the status of pending Razorpay orders against the Razorpay API.
2. **Double Fulfillment**: A user might trigger payment confirmation twice (via webhook and frontend callback).
   *Mitigation*: Ensure the webhook and verification RPCs are strictly idempotent (e.g., `IF order.payment_status = 'paid' THEN RETURN`).
3. **Mixed Orders & Capacity Limits**: `place_order` reserves inventory capacity. If a user drops out of the Razorpay checkout, the order sits in `pending` and locks inventory.
   *Mitigation*: Ensure `expire_unverified_upi_orders` (or its equivalent) reliably releases `subscription_credit_reservations` and inventory after 15 minutes. The new `release_subscription_reservation` idempotency logic handles this well, but it must be wired correctly to Razorpay cancellations.
4. **Security**: Edge functions processing webhooks must validate the `x-razorpay-signature` header to prevent malicious confirmation of unpaid orders.
