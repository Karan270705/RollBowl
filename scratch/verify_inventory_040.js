const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const KITCHEN_EMAIL = process.env.TEST_KITCHEN_EMAIL;
const KITCHEN_PASSWORD = process.env.TEST_KITCHEN_PASSWORD;
const CUSTOMER_EMAIL = process.env.TEST_CUSTOMER_EMAIL;
const CUSTOMER_PASSWORD = process.env.TEST_CUSTOMER_PASSWORD;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !KITCHEN_EMAIL || !CUSTOMER_EMAIL) {
  console.error("Missing required environment variables.");
  process.exit(1);
}

const TEST_DATE = '2030-01-01';
const TEST_NOTES = 'INVENTORY_VERIFY_040';

const kitchen = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const customer = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let cleanupIds = {
  orders: [],
  batches: [],
  subscriptions: [],
  plans: []
};

function pass(name) {
  console.log(`✅ [PASS] ${name}`);
}

function fail(name, expected, actual) {
  console.log(`❌ [FAIL] ${name}`);
  console.log(`   Expected: ${expected}`);
  console.log(`   Actual:`, actual);
  process.exit(1);
}

async function runTests() {
  let allPassed = false;
  console.log("--- STARTING INVENTORY VERIFICATION ---");

  try {
    // 1. Authenticate
    const { data: kData, error: kErr } = await kitchen.auth.signInWithPassword({ email: KITCHEN_EMAIL, password: KITCHEN_PASSWORD });
    if (kErr) throw new Error(`Kitchen Login Failed: ${kErr.message}`);
    console.log("✅ Kitchen login successful");

    const { data: cData, error: cErr } = await customer.auth.signInWithPassword({ email: CUSTOMER_EMAIL, password: CUSTOMER_PASSWORD });
    if (cErr) throw new Error(`Customer Login Failed: ${cErr.message}`);
    console.log("✅ Customer login successful");
    
    const customerId = cData.user.id;
    const kitchenId = kData.user.id;

    // 2. Pre-cleanup aborted runs
    console.log("--- PRE-CLEANING OLD TEST DATA ---");
    const { data: oldOrders } = await kitchen.from('orders').select('id').eq('notes', TEST_NOTES);
    if (oldOrders && oldOrders.length > 0) {
      const oldOrderIds = oldOrders.map(x => x.id);
      await kitchen.from('order_items').delete().in('order_id', oldOrderIds);
      await kitchen.from('orders').delete().in('id', oldOrderIds);
    }

    const { data: oldBatches } = await kitchen.from('inventory_batches').select('id').eq('notes', TEST_NOTES);
    if (oldBatches && oldBatches.length > 0) {
      const oldBatchIds = oldBatches.map(x => x.id);
      const { data: oldBi } = await kitchen.from('inventory_batch_items').select('id').in('inventory_batch_id', oldBatchIds);
      if (oldBi && oldBi.length > 0) {
        await kitchen.from('inventory_movements').delete().in('inventory_batch_item_id', oldBi.map(x => x.id));
      }
      await kitchen.from('inventory_batch_items').delete().in('inventory_batch_id', oldBatchIds);
      await kitchen.from('inventory_batches').delete().in('id', oldBatchIds);
    }

    const { data: oldPlans } = await kitchen.from('subscription_plans').select('id').like('name', 'TEST_PLAN_040%');
    if (oldPlans && oldPlans.length > 0) {
      const oldPlanIds = oldPlans.map(x => x.id);
      await kitchen.from('subscriptions').delete().in('plan_id', oldPlanIds);
      await kitchen.from('subscription_plans').delete().in('id', oldPlanIds);
    }

    // 3. Fetch Base Data (Stall and Meals)
    const { data: stalls } = await customer.from('stalls').select('*').limit(1);
    const stall = stalls[0];
    if (!stall) throw new Error("No stall found");

    const { data: availableMeals } = await customer.from('meals').select('*').eq('stall_id', stall.id).eq('is_available', true).limit(3);
    const { data: unavailableMeals } = await customer.from('meals').select('*').eq('stall_id', stall.id).eq('is_available', false).limit(1);
    
    if (availableMeals.length < 3) throw new Error("Need at least 3 available meals for tests.");
    
    let unavailableMeal = unavailableMeals?.[0];
    if (!unavailableMeal) {
      const { data: newU, error: uErr } = await kitchen.from('meals').insert({ stall_id: stall.id, name: 'Test Unavailable', price: 100, is_available: false, is_veg: true }).select().single();
      if (uErr) throw new Error("Failed to mock unavailable meal: " + uErr.message);
      unavailableMeal = newU;
    }

    const testMeals = {
      primary: { mealId: availableMeals[0].id, mealName: availableMeals[0].name, category: availableMeals[0].category || 'default', price: availableMeals[0].price, loadedQuantity: 10 },
      secondary: { mealId: availableMeals[1].id, mealName: availableMeals[1].name, category: availableMeals[1].category || 'default', price: availableMeals[1].price, loadedQuantity: 10 },
      notInBatch: { mealId: availableMeals[2].id, mealName: availableMeals[2].name, category: availableMeals[2].category || 'default', price: availableMeals[2].price },
      unavailable: { mealId: unavailableMeal.id, mealName: unavailableMeal.name }
    };

    // Helper to place order
    const placeOrder = async (payload) => {
      const res = await customer.rpc('place_order', { p_payload: payload });
      if (res.error) {
        try { res.error.parsed = JSON.parse(res.error.message); } catch(e) {}
      }
      return res;
    };
    
    const checkErr = (res, code) => {
      return (res.error && res.error.parsed && res.error.parsed.code === code) || (res.error && res.error.message.includes(code));
    };

    // ---------------------------------------------------------
    // TEST 1: Invalid Payload
    // ---------------------------------------------------------
    let res = await placeOrder(null);
    if (checkErr(res, 'INVALID_PAYLOAD')) pass('invalid payload');
    else fail('invalid payload', 'INVALID_PAYLOAD', res.error);

    // ---------------------------------------------------------
    // TEST 2: Invalid UUID
    // ---------------------------------------------------------
    res = await placeOrder({ stallId: 'invalid-uuid', pickupDate: TEST_DATE, items: [{ mealId: testMeals.primary.mealId, quantity: 1 }] });
    if (checkErr(res, 'INVALID_PAYLOAD')) pass('invalid UUID (stallId)');
    else fail('invalid UUID', 'INVALID_PAYLOAD (Invalid stallId format)', res.error);

    // ---------------------------------------------------------
    // TEST 3: Invalid quantity
    // ---------------------------------------------------------
    res = await placeOrder({ stallId: stall.id, pickupDate: TEST_DATE, items: [{ mealId: testMeals.primary.mealId, quantity: -5 }], expectedPickupSlot: '10:00-11:00' });
    if (checkErr(res, 'INVALID_QUANTITY')) pass('invalid quantity (-5)');
    else fail('invalid quantity', 'INVALID_QUANTITY', res.error);

    // ---------------------------------------------------------
    // TEST 4: Invalid pickup slot
    // ---------------------------------------------------------
    res = await placeOrder({ stallId: stall.id, pickupDate: TEST_DATE, items: [{ mealId: testMeals.primary.mealId, quantity: 1 }], expectedPickupSlot: '11:00-10:00' });
    if (checkErr(res, 'INVALID_PAYLOAD')) pass('invalid pickup slot (time travel)');
    else fail('invalid pickup slot', 'INVALID_PAYLOAD', res.error);

    // ---------------------------------------------------------
    // TEST 5: Meal not found
    // ---------------------------------------------------------
    const fakeId = '00000000-0000-0000-0000-000000000000';
    res = await placeOrder({ stallId: stall.id, pickupDate: TEST_DATE, items: [{ mealId: fakeId, quantity: 1 }], expectedPickupSlot: '10:00-11:00' });
    if (checkErr(res, 'MEAL_NOT_FOUND')) pass('meal not found');
    else fail('meal not found', 'MEAL_NOT_FOUND', res.error);

    // ---------------------------------------------------------
    // TEST 6: Meal unavailable
    // ---------------------------------------------------------
    res = await placeOrder({ stallId: stall.id, pickupDate: TEST_DATE, items: [{ mealId: testMeals.unavailable.mealId, quantity: 1 }], expectedPickupSlot: '10:00-11:00' });
    if (checkErr(res, 'MEAL_NOT_AVAILABLE')) pass('meal unavailable');
    else fail('meal unavailable', 'MEAL_NOT_AVAILABLE', res.error);

    // ---------------------------------------------------------
    // TEST 7: Preorder with no active batch
    // ---------------------------------------------------------
    res = await placeOrder({ 
      stallId: stall.id, pickupDate: TEST_DATE, paymentMethod: 'cash', notes: TEST_NOTES,
      items: [{ mealId: testMeals.primary.mealId, quantity: 1 }], expectedPickupSlot: '10:00-11:00' 
    });
    if (res.error) fail('preorder with no active batch', 'Success', res.error);
    else {
      if (res.data?.order_id) cleanupIds.orders.push(res.data.order_id);
      pass('preorder with no active batch (successful creation)');
    }

    // --- SETUP: Create active inventory batch ---
    const { data: batch, error: batchErr } = await kitchen.from('inventory_batches').insert({
      stall_id: stall.id,
      inventory_date: TEST_DATE,
      window_start: '12:00:00',
      window_end: '13:00:00',
      status: 'active',
      notes: TEST_NOTES,
      created_by: kitchenId
    }).select().single();
    if (batchErr || !batch) throw new Error("Failed to create test batch: " + (batchErr?.message || 'Unknown error'));
    if (batch?.id) cleanupIds.batches.push(batch.id);

    // Create batch items
    const { data: batchItem1, error: bi1Err } = await kitchen.from('inventory_batch_items').insert({
      inventory_batch_id: batch.id, meal_id: testMeals.primary.mealId, loaded_quantity: testMeals.primary.loadedQuantity
    }).select().single();
    if (bi1Err || !batchItem1) throw new Error("Failed to create primary batch item: " + (bi1Err?.message || 'Unknown error'));
    if (batchItem1.loaded_quantity !== testMeals.primary.loadedQuantity) throw new Error("Primary loaded_quantity mismatch");
    testMeals.primary.batchItemId = batchItem1.id;

    const { data: batchItem2, error: bi2Err } = await kitchen.from('inventory_batch_items').insert({
      inventory_batch_id: batch.id, meal_id: testMeals.secondary.mealId, loaded_quantity: testMeals.secondary.loadedQuantity
    }).select().single();
    if (bi2Err || !batchItem2) throw new Error("Failed to create secondary batch item: " + (bi2Err?.message || 'Unknown error'));
    if (batchItem2.loaded_quantity !== testMeals.secondary.loadedQuantity) throw new Error("Secondary loaded_quantity mismatch");
    testMeals.secondary.batchItemId = batchItem2.id;

    // Verify batch setup
    const { data: checkLive } = await kitchen.from('live_inventory_status').select('*').in('inventory_batch_item_id', [batchItem1.id, batchItem2.id]);
    console.log("=> VERIFIED TEST BATCH FIXTURES:");
    for (const st of checkLive) {
       const meal = st.inventory_batch_item_id === batchItem1.id ? testMeals.primary : testMeals.secondary;
       console.log(`   Batch: ${batch.id} | Meal: ${meal.mealName}`);
       console.log(`   > Loaded: ${st.loaded_quantity}, Reserved: ${st.active_reserved}, Fulfilled: ${st.fulfilled}, Remaining Phys: ${st.remaining_physical}, Extra Avail: ${st.extra_available}, Customer Avail: ${st.customer_available}, Status: ${st.stock_status}`);
    }
    if (!checkLive || checkLive.length !== 2) throw new Error("Live inventory status rows not found for fixtures!");

    // ---------------------------------------------------------
    // TEST 8: BATCH_REQUIRED when active batch exists
    // ---------------------------------------------------------
    res = await placeOrder({ 
      stallId: stall.id, pickupDate: TEST_DATE, paymentMethod: 'cash', notes: TEST_NOTES,
      items: [{ mealId: testMeals.primary.mealId, quantity: 1 }], expectedPickupSlot: '10:00-11:00' 
    });
    if (checkErr(res, 'BATCH_REQUIRED')) pass('BATCH_REQUIRED when batch exists but omitted');
    else fail('BATCH_REQUIRED when batch exists but omitted', 'BATCH_REQUIRED', res.error);

    // ---------------------------------------------------------
    // TEST 9: Invalid batch/stall/date mismatch
    // ---------------------------------------------------------
    res = await placeOrder({ 
      stallId: stall.id, pickupDate: '2030-01-02', paymentMethod: 'cash', notes: TEST_NOTES, inventoryBatchId: batch.id,
      items: [{ mealId: testMeals.primary.mealId, quantity: 1 }]
    });
    if (checkErr(res, 'WINDOW_MISMATCH')) pass('invalid batch date mismatch');
    else fail('invalid batch date mismatch', 'WINDOW_MISMATCH', res.error);

    // ---------------------------------------------------------
    // TEST 10: Successful inventory-backed order
    // ---------------------------------------------------------
    res = await placeOrder({ 
      stallId: stall.id, pickupDate: TEST_DATE, paymentMethod: 'cash', notes: TEST_NOTES, inventoryBatchId: batch.id,
      items: [{ mealId: testMeals.primary.mealId, quantity: 1 }]
    });
    if (res.error) fail('successful inventory-backed order', 'Success', res.error);
    else {
      if (res.data?.order_id) cleanupIds.orders.push(res.data.order_id);
      pass('successful inventory-backed order');
    }

    // ---------------------------------------------------------
    // TEST 11: Item not in batch
    // ---------------------------------------------------------
    res = await placeOrder({ 
      stallId: stall.id, pickupDate: TEST_DATE, paymentMethod: 'cash', notes: TEST_NOTES, inventoryBatchId: batch.id,
      items: [{ mealId: testMeals.notInBatch.mealId, quantity: 1 }]
    });
    if (checkErr(res, 'ITEM_NOT_IN_BATCH')) pass('item not in batch');
    else fail('item not in batch', 'ITEM_NOT_IN_BATCH', res.error);

    // ---------------------------------------------------------
    // TEST 12: Insufficient stock
    // ---------------------------------------------------------
    res = await placeOrder({ 
      stallId: stall.id, pickupDate: TEST_DATE, paymentMethod: 'cash', notes: TEST_NOTES, inventoryBatchId: batch.id,
      items: [{ mealId: testMeals.secondary.mealId, quantity: 100 }]
    });
    if (checkErr(res, 'INSUFFICIENT_STOCK')) pass('insufficient stock');
    else fail('insufficient stock', 'INSUFFICIENT_STOCK', res.error);

    // --- SETUP: Subscriptions ---
    const planName = `TEST_PLAN_040_${Date.now()}`;
    const { data: plan, error: pErr } = await kitchen.from('subscription_plans').insert({
      stall_id: stall.id, name: planName, meals_per_day: 5, total_meals: 20, price: 1000, 
      category_credit_costs: { [testMeals.primary.category]: 1, [testMeals.secondary.category]: 2 }
    }).select().single();
    if (pErr || !plan) throw new Error("Failed to create subscription plan: " + (pErr?.message || 'Unknown error'));
    if (plan?.id) cleanupIds.plans.push(plan.id);

    const { data: sub, error: sErr } = await kitchen.from('subscriptions').insert({
      user_id: customerId, plan_id: plan.id, status: 'active',
      start_date: '2029-01-01', end_date: '2031-01-01', remaining_meals: 20, daily_credits_used: 0
    }).select().single();
    if (sErr || !sub) throw new Error("Failed to create subscription: " + (sErr?.message || 'Unknown error'));
    if (sub?.id) cleanupIds.subscriptions.push(sub.id);

    // ---------------------------------------------------------
    // TEST 13: Mixed paid and subscription order
    // ---------------------------------------------------------
    res = await placeOrder({ 
      stallId: stall.id, pickupDate: TEST_DATE, paymentMethod: 'cash', notes: TEST_NOTES, inventoryBatchId: batch.id, subscriptionId: sub?.id ?? null,
      items: [
        { mealId: testMeals.primary.mealId, quantity: 1, useSubscription: true },
        { mealId: testMeals.secondary.mealId, quantity: 1, useSubscription: false }
      ]
    });
    if (res.error) fail('mixed paid and subscription order', 'Success', res.error);
    else {
      if (res.data?.order_id) cleanupIds.orders.push(res.data.order_id);
      if (res.data.payment_status === 'pending') pass('mixed paid and subscription order (pending)');
      else fail('mixed paid and subscription order', 'pending status', res.data);
    }

    // ---------------------------------------------------------
    // TEST 14: Fully subscription-covered order
    // ---------------------------------------------------------
    res = await placeOrder({ 
      stallId: stall.id, pickupDate: TEST_DATE, paymentMethod: 'subscription', notes: TEST_NOTES, inventoryBatchId: batch.id, subscriptionId: sub?.id ?? null,
      items: [
        { mealId: testMeals.primary.mealId, quantity: 1, useSubscription: true }
      ]
    });
    if (res.error) fail('fully subscription-covered order', 'Success', res.error);
    else {
      if (res.data?.order_id) cleanupIds.orders.push(res.data.order_id);
      if (res.data.payment_status === 'paid' && res.data.order_type === 'subscription') pass('fully subscription-covered order (paid)');
      else fail('fully subscription-covered order', 'paid status & subscription type', res.data);
    }

    // ---------------------------------------------------------
    // TEST 15: Ineligible subscription category
    // ---------------------------------------------------------
    const { data: planBad, error: pbErr } = await kitchen.from('subscription_plans').insert({
      stall_id: stall.id, name: `${planName}_BAD`, meals_per_day: 5, total_meals: 20, price: 1000, 
      category_credit_costs: { 'non_existent_category': 1 }
    }).select().single();
    if (pbErr || !planBad) throw new Error("Failed to create bad subscription plan: " + (pbErr?.message || 'Unknown error'));
    if (planBad?.id) cleanupIds.plans.push(planBad.id);

    const { data: subBad, error: sbErr } = await kitchen.from('subscriptions').insert({
      user_id: customerId, plan_id: planBad.id, status: 'active',
      start_date: '2029-01-01', end_date: '2031-01-01', remaining_meals: 20, daily_credits_used: 0
    }).select().single();
    if (sbErr || !subBad) throw new Error("Failed to create bad subscription: " + (sbErr?.message || 'Unknown error'));
    if (subBad?.id) cleanupIds.subscriptions.push(subBad.id);

    res = await placeOrder({ 
      stallId: stall.id, pickupDate: TEST_DATE, paymentMethod: 'subscription', notes: TEST_NOTES, inventoryBatchId: batch.id, subscriptionId: subBad?.id ?? null,
      items: [{ mealId: testMeals.primary.mealId, quantity: 1, useSubscription: true }]
    });
    if (checkErr(res, 'SUBSCRIPTION_ITEM_NOT_ELIGIBLE')) pass('ineligible subscription category');
    else fail('ineligible subscription category', 'SUBSCRIPTION_ITEM_NOT_ELIGIBLE', res.error);

    // ---------------------------------------------------------
    // TEST 16: Insufficient total credits
    // ---------------------------------------------------------
    const { data: subEmpty, error: seErr } = await kitchen.from('subscriptions').insert({
      user_id: customerId, plan_id: plan.id, status: 'active',
      start_date: '2029-01-01', end_date: '2031-01-01', remaining_meals: 0, daily_credits_used: 0
    }).select().single();
    if (seErr || !subEmpty) throw new Error("Failed to create empty subscription: " + (seErr?.message || 'Unknown error'));
    if (subEmpty?.id) cleanupIds.subscriptions.push(subEmpty.id);

    res = await placeOrder({ 
      stallId: stall.id, pickupDate: TEST_DATE, paymentMethod: 'subscription', notes: TEST_NOTES, inventoryBatchId: batch.id, subscriptionId: subEmpty?.id ?? null,
      items: [{ mealId: testMeals.primary.mealId, quantity: 1, useSubscription: true }]
    });
    if (checkErr(res, 'INSUFFICIENT_CREDITS')) pass('insufficient total credits');
    else fail('insufficient total credits', 'INSUFFICIENT_CREDITS', res.error);

    // ---------------------------------------------------------
    // TEST 17: Daily credit limit exceeded
    // ---------------------------------------------------------
    res = await placeOrder({ 
      stallId: stall.id, pickupDate: TEST_DATE, paymentMethod: 'subscription', notes: TEST_NOTES, inventoryBatchId: batch.id, subscriptionId: sub?.id ?? null,
      items: [{ mealId: testMeals.primary.mealId, quantity: 10, useSubscription: true }] // Plan has max 5
    });
    if (checkErr(res, 'DAILY_CREDIT_LIMIT_EXCEEDED')) pass('daily credit limit exceeded');
    else fail('daily credit limit exceeded', 'DAILY_CREDIT_LIMIT_EXCEEDED', res.error);

    // ---------------------------------------------------------
    // TEST 18: Unauthorized lifecycle RPC access
    // ---------------------------------------------------------
    const rpcRes = await customer.rpc('activate_inventory_batch', { p_batch_id: batch.id });
    if (rpcRes.error && (rpcRes.error.message.includes('UNAUTHORIZED_STALL_ACCESS') || rpcRes.error.message.includes('permission denied'))) pass('unauthorized lifecycle RPC access');
    else fail('unauthorized lifecycle RPC access', 'UNAUTHORIZED_STALL_ACCESS', rpcRes.error);

    // ---------------------------------------------------------
    // TEST 19: Authorized lifecycle RPC access
    // ---------------------------------------------------------
    const { data: batchClosed, error: closeErr } = await kitchen.rpc('close_inventory_batch', { p_batch_id: batch.id, p_notes: TEST_NOTES });
    if (closeErr) fail('authorized lifecycle RPC access', 'Success', closeErr);
    else pass('authorized lifecycle RPC access (close_inventory_batch)');

    // ---------------------------------------------------------
    // TEST 20: Walk-in movement bounds
    // ---------------------------------------------------------
    const { data: batch2, error: b2Err } = await kitchen.from('inventory_batches').insert({
      stall_id: stall.id, inventory_date: TEST_DATE, window_start: '14:00:00', window_end: '15:00:00', status: 'active', notes: TEST_NOTES, created_by: kitchenId
    }).select().single();
    if (b2Err || !batch2) throw new Error("Failed to create test batch2: " + (b2Err?.message || 'Unknown error'));
    if (batch2?.id) cleanupIds.batches.push(batch2.id);

    const { data: bi3, error: bi3Err } = await kitchen.from('inventory_batch_items').insert({
      inventory_batch_id: batch2.id, meal_id: testMeals.primary.mealId, loaded_quantity: 10
    }).select().single();
    if (bi3Err || !bi3) throw new Error("Failed to create primary batch item 3: " + (bi3Err?.message || 'Unknown error'));
    
    const movRes = await kitchen.rpc('record_inventory_movement', { p_batch_item_id: bi3.id, p_movement_type: 'walkin', p_quantity: 20, p_notes: TEST_NOTES });
    if (movRes.error && movRes.error.message.includes('INSUFFICIENT_STOCK')) pass('walk-in movement bounds (prevent oversell)');
    else fail('walk-in movement bounds', 'INSUFFICIENT_STOCK', movRes.error);

    // ---------------------------------------------------------
    // TEST 21: Waste/damage bounds
    // ---------------------------------------------------------
    const wasteRes = await kitchen.rpc('record_inventory_movement', { p_batch_item_id: bi3.id, p_movement_type: 'waste', p_quantity: 15, p_notes: TEST_NOTES });
    if (wasteRes.error && wasteRes.error.message.includes('INSUFFICIENT_STOCK')) pass('waste physical-stock bounds (prevent over-waste)');
    else fail('waste physical-stock bounds', 'INSUFFICIENT_STOCK', wasteRes.error);

    // ---------------------------------------------------------
    // CONCURRENCY TEST: 10 orders for 5 items
    // ---------------------------------------------------------
    console.log("--- STARTING CONCURRENCY TESTS ---");
    const { data: batchConc, error: bcErr } = await kitchen.from('inventory_batches').insert({
      stall_id: stall.id, inventory_date: TEST_DATE, window_start: '16:00:00', window_end: '17:00:00', status: 'active', notes: TEST_NOTES, created_by: kitchenId
    }).select().single();
    if (bcErr || !batchConc) throw new Error("Failed to create concurrency batch: " + (bcErr?.message || 'Unknown error'));
    if (batchConc?.id) cleanupIds.batches.push(batchConc.id);

    const { data: biConc, error: bicErr } = await kitchen.from('inventory_batch_items').insert({
      inventory_batch_id: batchConc.id, meal_id: testMeals.primary.mealId, loaded_quantity: 5
    }).select().single();
    if (bicErr || !biConc) throw new Error("Failed to create concurrency batch item: " + (bicErr?.message || 'Unknown error'));

    const orderPromises = [];
    for(let i = 0; i < 10; i++) {
      orderPromises.push(placeOrder({
        stallId: stall.id, pickupDate: TEST_DATE, paymentMethod: 'cash', notes: TEST_NOTES, inventoryBatchId: batchConc.id,
        items: [{ mealId: testMeals.primary.mealId, quantity: 1 }]
      }));
    }

    const results = await Promise.allSettled(orderPromises);
    let successCount = 0;
    let failCount = 0;
    let dbDeadlocks = 0;

    for (let r of results) {
      if (r.status === 'fulfilled') {
        const payload = r.value;
        if (payload.error) {
          if (payload.error.message.includes('INSUFFICIENT_STOCK')) failCount++;
          else if (payload.error.message.includes('deadlock detected')) dbDeadlocks++;
          else console.error("Unexpected concurrency error:", payload.error);
        } else {
          successCount++;
          if (payload.data?.order_id) cleanupIds.orders.push(payload.data.order_id);
        }
      } else {
        console.error("Promise rejected:", r.reason);
      }
    }

    if (successCount === 5 && failCount === 5 && dbDeadlocks === 0) {
      pass(`Inventory Concurrency: 5 successes, 5 INSUFFICIENT_STOCK, 0 deadlocks`);
    } else {
      fail('Inventory Concurrency', '5 successes, 5 INSUFFICIENT_STOCK', { successCount, failCount, dbDeadlocks });
    }

    const { data: liveState } = await kitchen.from('live_inventory_status').select('extra_available').eq('inventory_batch_item_id', biConc.id).single();
    if (liveState.extra_available === 0) pass('Inventory Concurrency State: 0 extra available');
    else fail('Inventory Concurrency State', '0 extra available', liveState);

    // ---------------------------------------------------------
    // SUBSCRIPTION CONCURRENCY TEST
    // ---------------------------------------------------------
    const { data: subConc, error: sccErr } = await kitchen.from('subscriptions').insert({
      user_id: customerId, plan_id: plan.id, status: 'active',
      start_date: '2029-01-01', end_date: '2031-01-01', remaining_meals: 3, daily_credits_used: 0
    }).select().single();
    if (sccErr || !subConc) throw new Error("Failed to create concurrency subscription: " + (sccErr?.message || 'Unknown error'));
    if (subConc?.id) cleanupIds.subscriptions.push(subConc.id);

    const subOrderPromises = [];
    for(let i = 0; i < 5; i++) {
      subOrderPromises.push(placeOrder({
        stallId: stall.id, pickupDate: TEST_DATE, paymentMethod: 'subscription', notes: TEST_NOTES, inventoryBatchId: batchConc.id, subscriptionId: subConc.id,
        items: [{ mealId: testMeals.primary.mealId, quantity: 1, useSubscription: true }] // each costs 1 credit
      }));
    }

    const subResults = await Promise.allSettled(subOrderPromises);
    let subSuccess = 0, subFail = 0;
    for (let r of subResults) {
      if (r.status === 'fulfilled' && r.value.error) {
        if (r.value.error.message.includes('INSUFFICIENT_CREDITS') || r.value.error.message.includes('DAILY_CREDIT_LIMIT_EXCEEDED')) subFail++;
      } else if (r.status === 'fulfilled' && !r.value.error) {
        subSuccess++;
        if (r.value.data?.order_id) cleanupIds.orders.push(r.value.data.order_id);
      }
    }

    // the plan allows 5 per day, but remaining_meals is 3. So only 3 should succeed.
    if (subSuccess === 3 && subFail === 2) {
      pass(`Subscription Concurrency: 3 successes, 2 limits exceeded`);
    } else {
      fail('Subscription Concurrency', '3 successes, 2 limits exceeded', { subSuccess, subFail });
    }

    const { data: finalSub } = await customer.from('subscriptions').select('remaining_meals').eq('id', subConc.id).single();
    if (finalSub.remaining_meals === 0) pass('Subscription Concurrency State: exactly 0 remaining, never negative');
    else fail('Subscription Concurrency State', '0 remaining', finalSub);

    allPassed = true;

  } catch (err) {
    console.error(`\n❌ SCRIPT CRASHED DURING EXECUTION:`);
    console.error(err);
  } finally {
    // ---------------------------------------------------------
    // CLEANUP
    // ---------------------------------------------------------
    console.log("\n--- STARTING CLEANUP ---");
    let oIds = cleanupIds.orders.filter(Boolean);
    let bIds = cleanupIds.batches.filter(Boolean);
    let sIds = cleanupIds.subscriptions.filter(Boolean);
    let pIds = cleanupIds.plans.filter(Boolean);

    try {
      if (oIds.length > 0) {
        await kitchen.from('order_items').delete().in('order_id', oIds);
        await kitchen.from('orders').delete().in('id', oIds);
      }
      if (bIds.length > 0) {
        const { data: biAll } = await kitchen.from('inventory_batch_items').select('id').in('inventory_batch_id', bIds);
        if (biAll && biAll.length > 0) {
          const biAllIds = biAll.map(x=>x.id).filter(Boolean);
          if (biAllIds.length > 0) {
            await kitchen.from('inventory_movements').delete().in('inventory_batch_item_id', biAllIds);
          }
        }
        await kitchen.from('inventory_batch_items').delete().in('inventory_batch_id', bIds);
        await kitchen.from('inventory_batches').delete().in('id', bIds);
      }
      if (sIds.length > 0) {
        await kitchen.from('subscriptions').delete().in('id', sIds);
      }
      if (pIds.length > 0) {
        await kitchen.from('subscription_plans').delete().in('id', pIds);
      }
      console.log(`Cleaned up ${oIds.length} orders, ${bIds.length} batches, ${sIds.length} subs, ${pIds.length} plans.`);
    } catch (cleanupErr) {
      console.error(`\n❌ ERROR DURING CLEANUP:`);
      console.error(cleanupErr);
      process.exit(1);
    }
    
    if (allPassed) {
      console.log("✅ ALL VERIFICATIONS COMPLETED SUCCESSFULLY");
      process.exit(0);
    } else {
      console.log("❌ VERIFICATION SUITE FAILED OR INCOMPLETE");
      process.exit(1);
    }
  }
}

runTests().catch(err => {
  console.error("Fatal Runtime Error:", err);
  process.exit(1);
});
