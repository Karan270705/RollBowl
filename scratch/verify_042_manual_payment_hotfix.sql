-- ============================================================
-- scratch/verify_042_manual_payment_hotfix.sql
-- Read-only verification queries
-- ============================================================

-- 1. Verify place_order definition contains trusted server-side meal pricing and NOT subtotal/tax/total from payload
SELECT 
  proname, 
  prosecdef,
  CASE WHEN prosrc ILIKE '%p_payload->>''subtotal''%' THEN 'FAIL (Reads subtotal)' ELSE 'PASS' END AS subtotal_check,
  CASE WHEN prosrc ILIKE '%p_payload->>''tax''%' THEN 'FAIL (Reads tax)' ELSE 'PASS' END AS tax_check,
  CASE WHEN prosrc ILIKE '%p_payload->>''total''%' THEN 'FAIL (Reads total)' ELSE 'PASS' END AS total_check,
  CASE WHEN prosrc ILIKE '%v_payment_verification_status payment_verification_status%' THEN 'PASS' ELSE 'FAIL (Missing verification status)' END AS verification_status_check
FROM pg_proc 
WHERE proname = 'place_order';

-- 2. Verify all functions are SECURITY DEFINER
SELECT proname, prosecdef
FROM pg_proc
WHERE proname IN (
  'place_order', 'submit_order_payment_proof', 'verify_order_payment', 
  'reject_order_payment', 'mark_cash_collected', 'expire_unverified_upi_orders',
  'create_subscription_purchase_request', 'submit_subscription_payment_proof',
  'approve_subscription_purchase', 'reject_subscription_purchase'
);

-- 3. Verify ACLs (anon has NO execute, authenticated has execute EXCEPT for expire_unverified_upi_orders)
SELECT 
  proname,
  has_function_privilege('anon', oid, 'EXECUTE') AS anon_can_execute,
  has_function_privilege('authenticated', oid, 'EXECUTE') AS auth_can_execute
FROM pg_proc
WHERE proname IN (
  'place_order', 'submit_order_payment_proof', 'verify_order_payment', 
  'reject_order_payment', 'mark_cash_collected', 'expire_unverified_upi_orders',
  'create_subscription_purchase_request', 'submit_subscription_payment_proof',
  'approve_subscription_purchase', 'reject_subscription_purchase'
);

-- 4. Enums check
SELECT enumlabel AS order_status_values FROM pg_enum WHERE enumtypid = 'order_status'::regtype;
SELECT enumlabel AS payment_status_values FROM pg_enum WHERE enumtypid = 'payment_status'::regtype;

-- 5. Validate tables exist
SELECT tablename 
FROM pg_tables 
WHERE tablename IN ('payment_settings', 'payment_proofs', 'subscription_purchase_requests');

-- 6. Storage bucket private check
SELECT id, public FROM storage.buckets WHERE id = 'payment-proofs';

-- 7. Invalid proof target rows
SELECT count(*) AS invalid_proofs
FROM payment_proofs
WHERE (payment_context = 'order' AND order_id IS NULL)
   OR (payment_context = 'subscription' AND subscription_request_id IS NULL);

-- 8. Duplicate active payment settings
SELECT stall_id, count(*)
FROM payment_settings
WHERE is_active = true
GROUP BY stall_id
HAVING count(*) > 1;

-- 9. Check for invalid states (upi + not_required)
SELECT count(*) AS invalid_upi_orders 
FROM orders 
WHERE payment_method = 'upi' AND payment_verification_status = 'not_required'
  AND created_at > (now() - interval '1 hour'); -- Ignore historical backfill

-- 10. Check for invalid states (cash + awaiting_proof)
SELECT count(*) AS invalid_cash_orders
FROM orders
WHERE payment_method = 'cash' AND payment_verification_status = 'awaiting_proof';

-- 11. Verify expire_unverified_upi_orders credit restoration logic
SELECT 
  proname, 
  CASE WHEN prosrc ILIKE '%payment_method = ''upi''%' THEN 'PASS' ELSE 'FAIL (Missing upi filter)' END AS filter_upi_check,
  CASE WHEN prosrc ILIKE '%payment_status != ''paid''%' THEN 'PASS' ELSE 'FAIL (Missing paid filter)' END AS filter_paid_check,
  CASE WHEN prosrc ILIKE '%subscription_id IS NOT NULL%' AND prosrc ILIKE '%credits_used > 0%' THEN 'PASS' ELSE 'FAIL (Missing order_items check)' END AS order_items_check,
  CASE WHEN prosrc ILIKE '%remaining_meals = %' THEN 'PASS' ELSE 'FAIL (Missing remaining_meals update)' END AS update_remaining_check,
  CASE WHEN prosrc ILIKE '%consumed_meals = %' THEN 'PASS' ELSE 'FAIL (Missing consumed_meals update)' END AS update_consumed_check,
  CASE WHEN prosrc ILIKE '%GREATEST(0, %' THEN 'PASS' ELSE 'FAIL (Missing GREATEST protection)' END AS bounds_protection_check
FROM pg_proc 
WHERE proname = 'expire_unverified_upi_orders';
