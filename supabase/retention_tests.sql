-- ============================================================
-- SQL Integration Tests for Screenshot Retention Eligibility
-- ============================================================
-- Run this script in the Supabase SQL Editor.
-- It executes inside a transaction and ROLLS BACK at the end,
-- ensuring zero pollution of your database.
-- ============================================================

BEGIN;

DO $$
DECLARE
  v_user_id UUID;
  v_stall_id UUID;
  v_college_id UUID;
  v_plan_id UUID;
  
  -- Mock orders & requests
  v_resolved_order UUID;
  v_unresolved_order UUID;
  v_resolved_sub_req UUID;
  v_unresolved_sub_req UUID;
  
  -- Mock payment proofs
  v_proof_pending_fresh UUID;
  v_proof_rejected_old UUID;
  v_proof_verified_fresh UUID;
  v_proof_verified_old UUID;
  v_proof_superseded_fresh UUID;
  v_proof_superseded_old UUID;
  v_proof_unresolved_order UUID;
  v_proof_unresolved_sub UUID;
  
  -- Verification assertions
  v_scanned_count INTEGER;
  v_is_eligible BOOLEAN;
BEGIN
  RAISE NOTICE 'Starting retention policy database validation tests...';

  -- 1. Retrieve or create reference entities
  SELECT id, college_id INTO v_user_id, v_college_id FROM users LIMIT 1;
  SELECT id INTO v_stall_id FROM stalls LIMIT 1;
  SELECT id INTO v_plan_id FROM subscription_plans LIMIT 1;

  IF v_user_id IS NULL OR v_stall_id IS NULL THEN
    RAISE EXCEPTION 'Prerequisite check failed: Test requires at least one user and one stall to exist in the database.';
  END IF;

  -- 2. Setup mock orders
  -- Resolved Order (payment verification status 'verified')
  INSERT INTO orders (
    id, order_number, user_id, customer_name, stall_id, stall_name,
    status, order_type, payment_status, payment_method,
    subtotal, tax, discount, total, notes,
    pickup_date, expected_pickup_slot, payment_verification_status
  ) VALUES (
    gen_random_uuid(), 'TEST-RES-1', v_user_id, 'Test Customer', v_stall_id, 'Test Stall',
    'confirmed', 'on_stall', 'paid', 'upi',
    100.00, 5.00, 0.00, 105.00, 'Resolved order test',
    CURRENT_DATE, '12:00-14:00', 'verified'
  ) RETURNING id INTO v_resolved_order;

  -- Unresolved Order (awaiting_proof)
  INSERT INTO orders (
    id, order_number, user_id, customer_name, stall_id, stall_name,
    status, order_type, payment_status, payment_method,
    subtotal, tax, discount, total, notes,
    pickup_date, expected_pickup_slot, payment_verification_status
  ) VALUES (
    gen_random_uuid(), 'TEST-UNRES-1', v_user_id, 'Test Customer', v_stall_id, 'Test Stall',
    'pending', 'on_stall', 'pending', 'upi',
    100.00, 5.00, 0.00, 105.00, 'Unresolved order test',
    CURRENT_DATE, '12:00-14:00', 'awaiting_proof'
  ) RETURNING id INTO v_unresolved_order;

  -- 3. Setup mock subscription requests
  -- Resolved Subscription Request (status approved)
  INSERT INTO subscription_purchase_requests (
    id, user_id, stall_id, plan_id, expected_amount, status
  ) VALUES (
    gen_random_uuid(), v_user_id, v_stall_id, v_plan_id, 199.00, 'approved'
  ) RETURNING id INTO v_resolved_sub_req;

  -- Unresolved Subscription Request (status verification_pending)
  INSERT INTO subscription_purchase_requests (
    id, user_id, stall_id, plan_id, expected_amount, status
  ) VALUES (
    gen_random_uuid(), v_user_id, v_stall_id, v_plan_id, 199.00, 'verification_pending'
  ) RETURNING id INTO v_unresolved_sub_req;

  -- 4. Setup mock payment proofs matching all retention criteria scenarios
  
  -- Case 1: Pending proof (should NOT be deleted, even if old)
  INSERT INTO payment_proofs (
    id, user_id, stall_id, order_id, payment_context, expected_amount, 
    upi_id_snapshot, recipient_name_snapshot, screenshot_path, status, submitted_at
  ) VALUES (
    gen_random_uuid(), v_user_id, v_stall_id, v_resolved_order, 'order', 105.00,
    'upi@test', 'Test Recipient', 'orders/test-uid/pending-fresh.png', 'pending', now() - interval '10 days'
  ) RETURNING id INTO v_proof_pending_fresh;

  -- Case 2: Rejected proof (should NOT be deleted)
  INSERT INTO payment_proofs (
    id, user_id, stall_id, order_id, payment_context, expected_amount, 
    upi_id_snapshot, recipient_name_snapshot, screenshot_path, status, submitted_at, rejected_at
  ) VALUES (
    gen_random_uuid(), v_user_id, v_stall_id, v_resolved_order, 'order', 105.00,
    'upi@test', 'Test Recipient', 'orders/test-uid/rejected-old.png', 'rejected', now() - interval '10 days', now() - interval '9 days'
  ) RETURNING id INTO v_proof_rejected_old;

  -- Case 3: Verified proof < 7 days old (should NOT be deleted)
  INSERT INTO payment_proofs (
    id, user_id, stall_id, order_id, payment_context, expected_amount, 
    upi_id_snapshot, recipient_name_snapshot, screenshot_path, status, submitted_at, verified_at
  ) VALUES (
    gen_random_uuid(), v_user_id, v_stall_id, v_resolved_order, 'order', 105.00,
    'upi@test', 'Test Recipient', 'orders/test-uid/verified-fresh.png', 'verified', now() - interval '4 days', now() - interval '3 days'
  ) RETURNING id INTO v_proof_verified_fresh;

  -- Case 4: Verified proof > 7 days old (should BE DELETED)
  INSERT INTO payment_proofs (
    id, user_id, stall_id, order_id, payment_context, expected_amount, 
    upi_id_snapshot, recipient_name_snapshot, screenshot_path, status, submitted_at, verified_at
  ) VALUES (
    gen_random_uuid(), v_user_id, v_stall_id, v_resolved_order, 'order', 105.00,
    'upi@test', 'Test Recipient', 'orders/test-uid/verified-old.png', 'verified', now() - interval '10 days', now() - interval '8 days'
  ) RETURNING id INTO v_proof_verified_old;

  -- Case 5: Superseded proof < 7 days old (should NOT be deleted)
  INSERT INTO payment_proofs (
    id, user_id, stall_id, order_id, payment_context, expected_amount, 
    upi_id_snapshot, recipient_name_snapshot, screenshot_path, status, submitted_at
  ) VALUES (
    gen_random_uuid(), v_user_id, v_stall_id, v_resolved_order, 'order', 105.00,
    'upi@test', 'Test Recipient', 'orders/test-uid/superseded-fresh.png', 'superseded', now() - interval '3 days'
  ) RETURNING id INTO v_proof_superseded_fresh;

  -- Case 6: Superseded proof > 7 days old (should BE DELETED)
  INSERT INTO payment_proofs (
    id, user_id, stall_id, order_id, payment_context, expected_amount, 
    upi_id_snapshot, recipient_name_snapshot, screenshot_path, status, submitted_at
  ) VALUES (
    gen_random_uuid(), v_user_id, v_stall_id, v_resolved_order, 'order', 105.00,
    'upi@test', 'Test Recipient', 'orders/test-uid/superseded-old.png', 'superseded', now() - interval '10 days'
  ) RETURNING id INTO v_proof_superseded_old;

  -- Case 7: Unresolved order proof (should NOT be deleted even if verified/old)
  INSERT INTO payment_proofs (
    id, user_id, stall_id, order_id, payment_context, expected_amount, 
    upi_id_snapshot, recipient_name_snapshot, screenshot_path, status, submitted_at, verified_at
  ) VALUES (
    gen_random_uuid(), v_user_id, v_stall_id, v_unresolved_order, 'order', 105.00,
    'upi@test', 'Test Recipient', 'orders/test-uid/unresolved-order.png', 'verified', now() - interval '10 days', now() - interval '8 days'
  ) RETURNING id INTO v_proof_unresolved_order;

  -- Case 8: Unresolved subscription request proof (should NOT be deleted even if verified/old)
  INSERT INTO payment_proofs (
    id, user_id, stall_id, subscription_request_id, payment_context, expected_amount, 
    upi_id_snapshot, recipient_name_snapshot, screenshot_path, status, submitted_at, verified_at
  ) VALUES (
    gen_random_uuid(), v_user_id, v_stall_id, v_unresolved_sub_req, 'subscription', 199.00,
    'upi@test', 'Test Recipient', 'subscriptions/test-uid/unresolved-sub.png', 'verified', now() - interval '10 days', now() - interval '8 days'
  ) RETURNING id INTO v_proof_unresolved_sub;


  -- 5. RUN ASSERSTIONS AGAINST THE VIEW

  -- Count total eligible records returned by the view (Should be exactly 2: v_proof_verified_old and v_proof_superseded_old)
  SELECT COUNT(*) INTO v_scanned_count FROM eligible_payment_proofs_cleanup;
  IF v_scanned_count != 2 THEN
    RAISE EXCEPTION 'Assertion Failed: Expected exactly 2 eligible records in view, got %', v_scanned_count;
  END IF;

  -- Assert verified_old IS eligible
  SELECT EXISTS(SELECT 1 FROM eligible_payment_proofs_cleanup WHERE id = v_proof_verified_old) INTO v_is_eligible;
  IF NOT v_is_eligible THEN
    RAISE EXCEPTION 'Assertion Failed: Verified old proof (Case 4) should be eligible for deletion.';
  END IF;

  -- Assert superseded_old IS eligible
  SELECT EXISTS(SELECT 1 FROM eligible_payment_proofs_cleanup WHERE id = v_proof_superseded_old) INTO v_is_eligible;
  IF NOT v_is_eligible THEN
    RAISE EXCEPTION 'Assertion Failed: Superseded old proof (Case 6) should be eligible for deletion.';
  END IF;

  -- Assert pending proof is NOT eligible
  SELECT EXISTS(SELECT 1 FROM eligible_payment_proofs_cleanup WHERE id = v_proof_pending_fresh) INTO v_is_eligible;
  IF v_is_eligible THEN
    RAISE EXCEPTION 'Assertion Failed: Pending proof (Case 1) must NOT be eligible.';
  END IF;

  -- Assert rejected proof is NOT eligible
  SELECT EXISTS(SELECT 1 FROM eligible_payment_proofs_cleanup WHERE id = v_proof_rejected_old) INTO v_is_eligible;
  IF v_is_eligible THEN
    RAISE EXCEPTION 'Assertion Failed: Rejected proof (Case 2) must NOT be eligible.';
  END IF;

  -- Assert verified fresh proof is NOT eligible
  SELECT EXISTS(SELECT 1 FROM eligible_payment_proofs_cleanup WHERE id = v_proof_verified_fresh) INTO v_is_eligible;
  IF v_is_eligible THEN
    RAISE EXCEPTION 'Assertion Failed: Verified fresh proof (Case 3) must NOT be eligible.';
  END IF;

  -- Assert superseded fresh proof is NOT eligible
  SELECT EXISTS(SELECT 1 FROM eligible_payment_proofs_cleanup WHERE id = v_proof_superseded_fresh) INTO v_is_eligible;
  IF v_is_eligible THEN
    RAISE EXCEPTION 'Assertion Failed: Superseded fresh proof (Case 5) must NOT be eligible.';
  END IF;

  -- Assert unresolved order proof is NOT eligible
  SELECT EXISTS(SELECT 1 FROM eligible_payment_proofs_cleanup WHERE id = v_proof_unresolved_order) INTO v_is_eligible;
  IF v_is_eligible THEN
    RAISE EXCEPTION 'Assertion Failed: Unresolved order proof (Case 7) must NOT be eligible.';
  END IF;

  -- Assert unresolved subscription proof is NOT eligible
  SELECT EXISTS(SELECT 1 FROM eligible_payment_proofs_cleanup WHERE id = v_proof_unresolved_sub) INTO v_is_eligible;
  IF v_is_eligible THEN
    RAISE EXCEPTION 'Assertion Failed: Unresolved subscription proof (Case 8) must NOT be eligible.';
  END IF;

  RAISE NOTICE 'SUCCESS: All retention policy eligibility assertions passed!';
END $$;

ROLLBACK;
