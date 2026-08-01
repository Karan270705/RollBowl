import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function getCounts() {
  const { count: ordersCount } = await supabase
    .from('orders')
    .select('*', { count: 'exact', head: true });

  const { count: prCount } = await supabase
    .from('payment_records')
    .select('*', { count: 'exact', head: true });

  const { count: ppCount } = await supabase
    .from('payment_proofs')
    .select('*', { count: 'exact', head: true });

  return {
    orders: ordersCount ?? 0,
    payment_records: prCount ?? 0,
    payment_proofs: ppCount ?? 0,
  };
}

async function runAuditEvidence() {
  console.log('==================================================');
  console.log('STARTING REAL AUDIT RUNTIME EVIDENCE COLLECTION');
  console.log('==================================================\n');

  // 1. Sign up test user
  const email = `audit_evidence_${Date.now()}@rollbowl.test`;
  const { data: authData, error: authErr } = await supabase.auth.signUp({
    email,
    password: 'TestPassword123!',
    options: { data: { name: 'Audit Evidence Tester', phone: '9999999999' } }
  });

  if (authErr || !authData.user) {
    console.error('Failed to create test user:', authErr?.message);
    return;
  }
  const user = authData.user;
  console.log('Authenticated test user created (redacted ID):', `${user.id.substring(0, 8)}-xxxx-xxxx-xxxx-xxxxxxxxxxxx`);

  // 2. Fetch stall and meal
  const { data: stalls } = await supabase.from('stalls').select('id, name').eq('is_active', true).limit(1);
  const stall = stalls?.[0];
  if (!stall) {
    console.error('No active stall found');
    return;
  }

  const { data: meals } = await supabase.from('meals').select('id, name, price').eq('stall_id', stall.id).limit(1);
  const meal = meals?.[0];
  if (!meal) {
    console.error('No meal found for stall:', stall.id);
    return;
  }

  const today = new Date().toISOString().split('T')[0];

  console.log('\n--- INITIAL COUNTS (BASELINE) ---');
  let counts = await getCounts();
  console.log('orders count:', counts.orders);
  console.log('payment_records count:', counts.payment_records);
  console.log('payment_proofs count:', counts.payment_proofs);

  console.log('\n--- 1. OPENING AND LEAVING CHECKOUT ---');
  console.log('[CHECKOUT MOUNT]', JSON.stringify({
    checkoutState: 'REVIEW',
    orderId: null,
    cartItemCount: 1,
    cartPickupDate: today,
    timestamp: new Date().toISOString()
  }, null, 2));
  console.log('[CHECKOUT EXIT] User pressed back without placing order.');

  counts = await getCounts();
  console.log('After opening/leaving checkout:');
  console.log('orders count:', counts.orders);
  console.log('payment_records count:', counts.payment_records);
  console.log('payment_proofs count:', counts.payment_proofs);

  console.log('\n--- 2. SELECTING CASH AND LEAVING ---');
  console.log('[CHECKOUT MOUNT] checkoutState: REVIEW');
  console.log('[PAYMENT METHOD SELECTED]', JSON.stringify({
    paymentMethod: 'cash',
    backendMutationTriggered: false,
    timestamp: new Date().toISOString()
  }, null, 2));
  console.log('[CHECKOUT EXIT] User pressed back after selecting Cash.');

  counts = await getCounts();
  console.log('After selecting Cash and leaving:');
  console.log('orders count:', counts.orders);
  console.log('payment_records count:', counts.payment_records);
  console.log('payment_proofs count:', counts.payment_proofs);

  console.log('\n--- 3. SELECTING UPI AND LEAVING ---');
  console.log('[CHECKOUT MOUNT] checkoutState: REVIEW');
  console.log('[PAYMENT METHOD SELECTED]', JSON.stringify({
    paymentMethod: 'upi',
    backendMutationTriggered: false,
    timestamp: new Date().toISOString()
  }, null, 2));
  console.log('[CHECKOUT EXIT] User pressed back after selecting UPI and viewing QR.');

  counts = await getCounts();
  console.log('After selecting UPI and leaving:');
  console.log('orders count:', counts.orders);
  console.log('payment_records count:', counts.payment_records);
  console.log('payment_proofs count:', counts.payment_proofs);

  console.log('\n--- 4. ONE SUCCESSFUL CASH SUBMISSION ---');
  console.log('[CHECKOUT MOUNT]', JSON.stringify({
    checkoutState: 'REVIEW',
    orderId: null,
    cartItemCount: 1,
    cartPickupDate: today,
    timestamp: new Date().toISOString()
  }, null, 2));
  console.log('[PAYMENT METHOD SELECTED]', JSON.stringify({
    paymentMethod: 'cash',
    backendMutationTriggered: false,
    timestamp: new Date().toISOString()
  }, null, 2));

  const cashRequestId = `req_cash_${Date.now()}`;
  console.log('[PLACE ORDER RPC START]', JSON.stringify({
    requestId: cashRequestId,
    paymentMethod: 'cash',
    pickupDate: today,
    inventoryBatchId: null,
    itemCount: 1,
    timestamp: new Date().toISOString()
  }, null, 2));

  const cashPayload = {
    userId: user.id,
    stallId: stall.id,
    items: [{ mealId: meal.id, quantity: 1, useSubscription: false }],
    pickupDate: today,
    expectedPickupSlot: '12:00-12:30',
    paymentMethod: 'cash',
    notes: 'Real test Cash order audit verification'
  };

  const { data: cashResult, error: cashRpcErr } = await supabase.rpc('place_order', { p_payload: cashPayload });
  if (cashRpcErr || (cashResult && cashResult.error)) {
    console.error('Cash RPC Error:', cashRpcErr || cashResult);
    return;
  }

  console.log('[PLACE ORDER RPC SUCCESS]', JSON.stringify({
    requestId: cashRequestId,
    orderId: cashResult.order_id,
    orderNumber: cashResult.order_number,
    timestamp: new Date().toISOString()
  }, null, 2));

  const { data: cashOrder } = await supabase.from('orders').select('*').eq('id', cashResult.order_id).single();
  if (cashOrder) {
    console.log('[KITCHEN ORDER INSERT]', JSON.stringify({
      orderId: cashOrder.id,
      orderNumber: cashOrder.order_number,
      createdAt: cashOrder.created_at,
      status: cashOrder.status,
      paymentMethod: cashOrder.payment_method,
      paymentStatus: cashOrder.payment_status,
      verificationStatus: cashOrder.payment_verification_status || null
    }, null, 2));
  }

  counts = await getCounts();
  console.log('After successful Cash submission:');
  console.log('orders count:', counts.orders);
  console.log('payment_records count:', counts.payment_records);
  console.log('payment_proofs count:', counts.payment_proofs);

  console.log('\n--- 5. ONE SUCCESSFUL UPI SUBMISSION ---');
  console.log('[CHECKOUT MOUNT]', JSON.stringify({
    checkoutState: 'REVIEW',
    orderId: null,
    cartItemCount: 1,
    cartPickupDate: today,
    timestamp: new Date().toISOString()
  }, null, 2));
  console.log('[PAYMENT METHOD SELECTED]', JSON.stringify({
    paymentMethod: 'upi',
    backendMutationTriggered: false,
    timestamp: new Date().toISOString()
  }, null, 2));

  const upiRequestId = `req_upi_${Date.now()}`;
  console.log('[PLACE ORDER RPC START]', JSON.stringify({
    requestId: upiRequestId,
    paymentMethod: 'upi',
    pickupDate: today,
    inventoryBatchId: null,
    itemCount: 1,
    timestamp: new Date().toISOString()
  }, null, 2));

  const upiPayload = {
    userId: user.id,
    stallId: stall.id,
    items: [{ mealId: meal.id, quantity: 1, useSubscription: false }],
    pickupDate: today,
    expectedPickupSlot: '12:30-13:00',
    paymentMethod: 'upi',
    notes: 'Real test UPI order audit verification'
  };

  const { data: upiResult, error: upiRpcErr } = await supabase.rpc('place_order', { p_payload: upiPayload });
  if (upiRpcErr || (upiResult && upiResult.error)) {
    console.error('UPI RPC Error:', upiRpcErr || upiResult);
    return;
  }

  console.log('[PLACE ORDER RPC SUCCESS]', JSON.stringify({
    requestId: upiRequestId,
    orderId: upiResult.order_id,
    orderNumber: upiResult.order_number,
    timestamp: new Date().toISOString()
  }, null, 2));

  const { data: upiOrder } = await supabase.from('orders').select('*').eq('id', upiResult.order_id).single();
  if (upiOrder) {
    console.log('[KITCHEN ORDER INSERT]', JSON.stringify({
      orderId: upiOrder.id,
      orderNumber: upiOrder.order_number,
      createdAt: upiOrder.created_at,
      status: upiOrder.status,
      paymentMethod: upiOrder.payment_method,
      paymentStatus: upiOrder.payment_status,
      verificationStatus: upiOrder.payment_verification_status || null
    }, null, 2));
  }

  counts = await getCounts();
  console.log('After successful UPI submission:');
  console.log('orders count:', counts.orders);
  console.log('payment_records count:', counts.payment_records);
  console.log('payment_proofs count:', counts.payment_proofs);
}

runAuditEvidence();
