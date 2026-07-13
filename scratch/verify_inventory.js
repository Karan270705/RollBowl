const { createClient } = require('@supabase/supabase-js');

// Required Environment Variables
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const kitchenEmail = process.env.TEST_KITCHEN_EMAIL;
const kitchenPassword = process.env.TEST_KITCHEN_PASSWORD;
const customerEmail = process.env.TEST_CUSTOMER_EMAIL;
const customerPassword = process.env.TEST_CUSTOMER_PASSWORD;

if (!supabaseUrl || !supabaseKey || !kitchenEmail || !kitchenPassword || !customerEmail || !customerPassword) {
  console.error("❌ SKIPPING AUTOMATED TESTS: Missing required environment variables.");
  console.error("Please set EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY, TEST_KITCHEN_EMAIL, TEST_KITCHEN_PASSWORD, TEST_CUSTOMER_EMAIL, TEST_CUSTOMER_PASSWORD");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Test isolation parameters
const TEST_DATE = '2030-01-01'; // Future date for isolation
let TEST_STALL_ID = null;
let TEST_MEAL_ID = null;
let createdBatchId = null;

async function runTests() {
  console.log('--- STARTING INVENTORY VERIFICATION ---');
  
  // Login as Kitchen
  const { data: kitchenAuth, error: kErr } = await supabase.auth.signInWithPassword({ email: kitchenEmail, password: kitchenPassword });
  if (kErr) throw new Error(`Kitchen Login Failed: ${kErr.message}`);
  console.log('✅ Kitchen login successful');

  // Dynamically resolve Stall and Meal to pass RLS
  const { data: stall, error: stallErr } = await supabase.from('stalls').select('id').limit(1).single();
  if (stallErr || !stall) throw new Error('Could not find a stall for this operator to test with. Check operator_id on stalls.');
  TEST_STALL_ID = stall.id;

  const { data: meal, error: mealErr } = await supabase.from('meals').select('id').eq('stall_id', TEST_STALL_ID).limit(1).single();
  if (mealErr || !meal) throw new Error('Could not find a meal for this stall to test with.');
  TEST_MEAL_ID = meal.id;
  console.log(`✅ Dynamically resolved Test Stall (${TEST_STALL_ID}) and Meal (${TEST_MEAL_ID})`);

  // Login as Customer in a separate client instance to simulate concurrent real-world usage
  const customerClient = createClient(supabaseUrl, supabaseKey);
  const { data: custAuth, error: cErr } = await customerClient.auth.signInWithPassword({ email: customerEmail, password: customerPassword });
  if (cErr) throw new Error(`Customer Login Failed: ${cErr.message}`);
  console.log('✅ Customer login successful');

  try {
    // ====================================================================
    // TEST 1: CREATE DRAFT INVENTORY
    // ====================================================================
    console.log('\n[TEST 1] Create Draft Inventory');
    const { data: batch, error: batchErr } = await supabase.from('inventory_batches').insert({
      stall_id: TEST_STALL_ID,
      inventory_date: TEST_DATE,
      window_start: '12:00:00',
      window_end: '14:00:00',
      status: 'draft',
      created_by: kitchenAuth.user.id,
      notes: 'INVENTORY_VERIFY_038'
    }).select().single();
    if (batchErr) throw batchErr;
    createdBatchId = batch.id;
    
    const { error: itemErr } = await supabase.from('inventory_batch_items').insert({
      inventory_batch_id: batch.id,
      meal_id: TEST_MEAL_ID,
      loaded_quantity: 10
    });
    if (itemErr) throw itemErr;
    
    // Verify customer cannot see it
    const { data: custViews, error: cvErr } = await customerClient.from('customer_safe_inventory').select('*').eq('batch_id', batch.id);
    if (custViews && custViews.length > 0) throw new Error('Customer can see draft batch!');
    console.log('✅ PASS: Draft batch created, hidden from customer safe view');

    // ====================================================================
    // TEST 2: EXISTING ORDER RECONCILIATION
    // ====================================================================
    console.log('\n[TEST 2] Existing Order Reconciliation');
    // Pre-create an order for 6 units on the same date BEFORE activation
    const { data: preOrder, error: preOrderErr } = await customerClient.rpc('place_order', {
      p_payload: {
        userId: custAuth.user.id,
        stallId: TEST_STALL_ID,
        items: [{ mealId: TEST_MEAL_ID, quantity: 6 }],
        pickupDate: TEST_DATE,
        expectedPickupSlot: '12:00-12:30',
        paymentMethod: 'cash'
      }
    });
    if (preOrderErr) throw preOrderErr;
    
    // Activate the batch as Kitchen
    const { data: actRes, error: actErr } = await supabase.rpc('activate_inventory_batch', { p_batch_id: batch.id });
    if (actErr) throw actErr;

    // Verify Customer Safe view shows exactly 4 available
    const { data: liveStatus } = await supabase.from('live_inventory_status').select('*').eq('batch_id', batch.id).eq('meal_id', TEST_MEAL_ID).single();
    
    if (liveStatus.loaded_quantity !== 10) throw new Error(`Expected loaded=10, got ${liveStatus.loaded_quantity}`);
    if (liveStatus.active_reserved !== 6) throw new Error(`Expected reserved=6, got ${liveStatus.active_reserved}`);
    if (liveStatus.customer_available !== 4) throw new Error(`Expected customer_available=4, got ${liveStatus.customer_available}`);
    console.log('✅ PASS: Activation reconciled 6 prior reservations. Customer availability is exactly 4.');

    // ====================================================================
    // TEST 3 & 4 & 5: CONCURRENT OVERSALE
    // ====================================================================
    console.log('\n[TEST 3,4,5] Concurrent Oversale');
    // We have 4 available. We will fire two requests simultaneously for 3 items each (total 6 > 4).
    const orderPayload = {
      userId: custAuth.user.id,
      stallId: TEST_STALL_ID,
      items: [{ mealId: TEST_MEAL_ID, quantity: 3 }],
      pickupDate: TEST_DATE,
      expectedPickupSlot: '12:00-12:30',
      inventoryBatchId: batch.id,
      paymentMethod: 'cash'
    };

    const results = await Promise.allSettled([
      customerClient.rpc('place_order', { p_payload: orderPayload }),
      customerClient.rpc('place_order', { p_payload: orderPayload })
    ]);

    let successCount = 0;
    let failCount = 0;
    let insufficientStockDetected = false;

    for (const res of results) {
      if (res.status === 'fulfilled' && res.value.error == null && res.value.data && res.value.data.success) {
        successCount++;
      } else {
        failCount++;
        // PostgREST returns RPC exceptions as errors
        if (res.value && res.value.error && res.value.error.message.includes('INSUFFICIENT_STOCK')) insufficientStockDetected = true;
        if (res.reason && res.reason.message.includes('INSUFFICIENT_STOCK')) insufficientStockDetected = true;
      }
    }

    if (successCount !== 1 || failCount !== 1) {
      throw new Error(`Race condition failure: successes=${successCount}, failures=${failCount}`);
    }
    console.log('✅ PASS: Concurrent oversale prevented safely. Exactly one succeeded.');

    // Current availability should be 1
    const { data: currentStatus } = await supabase.from('live_inventory_status').select('customer_available').eq('batch_id', batch.id).eq('meal_id', TEST_MEAL_ID).single();
    if (currentStatus.customer_available !== 1) throw new Error(`Expected 1 remaining, got ${currentStatus.customer_available}`);
    console.log('✅ PASS: Remaining customer availability is exactly 1.');

    // ====================================================================
    // TEST 8: WALK-IN SALE
    // ====================================================================
    console.log('\n[TEST 8] Walk-in Sale');
    // Get the batch item id
    const { data: itemData } = await supabase.from('inventory_batch_items').select('id').eq('inventory_batch_id', batch.id).single();
    
    const { data: walkInRes, error: walkInErr } = await supabase.rpc('record_inventory_movement', {
      p_batch_item_id: itemData.id,
      p_movement_type: 'walk_in_sale',
      p_quantity: 1,
      p_note: 'Test walk in'
    });
    if (walkInErr) throw walkInErr;
    console.log('✅ PASS: Walk-in sale succeeded.');

    const { data: statusAfterWalkIn } = await supabase.from('live_inventory_status').select('customer_available').eq('batch_id', batch.id).eq('meal_id', TEST_MEAL_ID).single();
    if (statusAfterWalkIn.customer_available !== 0) throw new Error(`Expected 0 remaining after walkin, got ${statusAfterWalkIn.customer_available}`);
    console.log('✅ PASS: Availability is now exactly 0.');

    // Try another walk-in, should fail
    const { error: badWalkInErr } = await supabase.rpc('record_inventory_movement', {
      p_batch_item_id: itemData.id, p_movement_type: 'walk_in_sale', p_quantity: 1
    });
    if (!badWalkInErr || !badWalkInErr.message.includes('INSUFFICIENT_STOCK')) {
      throw new Error('Walk in sale exceeding capacity did not fail correctly!');
    }
    console.log('✅ PASS: Rejected walk-in sale exceeding capacity.');

    // ====================================================================
    // TEST 13 & 14: RLS & BATCH CLOSURE
    // ====================================================================
    console.log('\n[TEST 13 & 14] RLS & Batch Closure');
    
    // Customer tries to close batch
    const { error: custCloseErr } = await customerClient.rpc('close_inventory_batch', { p_batch_id: batch.id });
    if (!custCloseErr) throw new Error('Customer was allowed to close a batch!');
    console.log('✅ PASS: Customer rejected from closing batch.');

    // Kitchen closes batch
    const { error: closeErr } = await supabase.rpc('close_inventory_batch', { p_batch_id: batch.id });
    if (closeErr) throw closeErr;
    console.log('✅ PASS: Kitchen successfully closed batch.');

    // ====================================================================
    // CLEANUP
    // ====================================================================
    console.log('\n[CLEANUP] Removing test data...');
    // We delete the batch, which cascades to items and movements
    await supabase.from('inventory_batches').delete().eq('id', batch.id);
    
    // Clean up test orders
    await supabase.from('orders').delete().eq('pickup_date', TEST_DATE).eq('stall_id', TEST_STALL_ID);
    console.log('✅ PASS: Cleanup complete.');
    
    console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY! 🎉');
  } catch (err) {
    console.error('\n❌ TEST SUITE FAILED:', err);
    if (createdBatchId) {
      console.log('Attempting emergency cleanup...');
      await supabase.from('inventory_batches').delete().eq('id', createdBatchId);
      await supabase.from('orders').delete().eq('pickup_date', TEST_DATE).eq('stall_id', TEST_STALL_ID);
    }
    process.exit(1);
  }
}

runTests();
