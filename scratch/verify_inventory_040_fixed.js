const { createClient } = require('@supabase/supabase-js');

const {
  EXPO_PUBLIC_SUPABASE_URL: SUPABASE_URL,
  EXPO_PUBLIC_SUPABASE_ANON_KEY: SUPABASE_ANON_KEY,
  TEST_KITCHEN_EMAIL: KITCHEN_EMAIL,
  TEST_KITCHEN_PASSWORD: KITCHEN_PASSWORD,
  TEST_CUSTOMER_EMAIL: CUSTOMER_EMAIL,
  TEST_CUSTOMER_PASSWORD: CUSTOMER_PASSWORD,
  TEST_INVENTORY_DATE = '2030-01-01',
} = process.env;

const requiredEnv = {
  EXPO_PUBLIC_SUPABASE_URL: SUPABASE_URL,
  EXPO_PUBLIC_SUPABASE_ANON_KEY: SUPABASE_ANON_KEY,
  TEST_KITCHEN_EMAIL: KITCHEN_EMAIL,
  TEST_KITCHEN_PASSWORD: KITCHEN_PASSWORD,
  TEST_CUSTOMER_EMAIL: CUSTOMER_EMAIL,
  TEST_CUSTOMER_PASSWORD: CUSTOMER_PASSWORD,
};

const missingEnv = Object.entries(requiredEnv)
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (missingEnv.length > 0) {
  console.error(
    `Missing required environment variables: ${missingEnv.join(', ')}`,
  );
  process.exit(1);
}

const TEST_DATE = TEST_INVENTORY_DATE;
const TEST_NOTES = 'INVENTORY_VERIFY_040';

const kitchen = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

const customer = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

class VerificationFailure extends Error {
  constructor(testName, expected, actual) {
    super(`${testName}: expected ${expected}`);
    this.name = 'VerificationFailure';
    this.testName = testName;
    this.expected = expected;
    this.actual = actual;
  }
}

const cleanupIds = {
  orders: new Set(),
  batches: new Set(),
  subscriptions: new Set(),
  plans: new Set(),
  meals: new Set(),
};

function pass(name) {
  console.log(`✅ [PASS] ${name}`);
}

function skip(name, reason) {
  console.log(`⏭️ [SKIP] ${name}: ${reason}`);
}

function fail(name, expected, actual) {
  throw new VerificationFailure(name, expected, actual);
}

function parseRpcError(error) {
  if (!error) {
    return null;
  }

  const candidates = [
    error.message,
    error.details,
    error.hint,
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (typeof candidate !== 'string') {
      continue;
    }

    try {
      return JSON.parse(candidate);
    } catch {
      const firstBrace = candidate.indexOf('{');
      const lastBrace = candidate.lastIndexOf('}');

      if (firstBrace >= 0 && lastBrace > firstBrace) {
        try {
          return JSON.parse(
            candidate.slice(firstBrace, lastBrace + 1),
          );
        } catch {
          // Continue to next candidate.
        }
      }
    }
  }

  return null;
}

function errorCode(result) {
  return (
    result?.error?.parsed?.code ??
    parseRpcError(result?.error)?.code ??
    null
  );
}

function hasErrorCode(result, expectedCode) {
  const parsedCode = errorCode(result);

  return Boolean(
    parsedCode === expectedCode ||
    result?.error?.message?.includes(expectedCode) ||
    result?.error?.details?.includes?.(expectedCode) ||
    result?.error?.hint?.includes?.(expectedCode),
  );
}

function describeError(error) {
  if (!error) {
    return 'Unknown error';
  }

  const parsed = parseRpcError(error);

  return parsed
    ? JSON.stringify(parsed)
    : error.message ?? JSON.stringify(error);
}

async function expectNoError(label, result) {
  if (result.error) {
    throw new Error(
      `${label}: ${describeError(result.error)}`,
    );
  }

  return result.data;
}

async function placeOrder(payload) {
  const result = await customer.rpc('place_order', {
    p_payload: payload,
  });

  if (result.error) {
    result.error.parsed = parseRpcError(result.error);
  }

  return result;
}

async function deleteIn(
  client,
  table,
  column,
  ids,
  label,
) {
  const cleanIds = [
    ...new Set(ids.filter(Boolean)),
  ];

  if (cleanIds.length === 0) {
    return;
  }

  const result = await client
    .from(table)
    .delete()
    .in(column, cleanIds);

  if (result.error) {
    throw new Error(
      `${label}: ${result.error.message}`,
    );
  }
}

async function preCleanOldTestData() {
  console.log('--- PRE-CLEANING OLD TEST DATA ---');

  const oldOrders = await kitchen
    .from('orders')
    .select('id')
    .eq('notes', TEST_NOTES);

  await expectNoError(
    'Fetch old test orders',
    oldOrders,
  );

  const oldOrderIds = (oldOrders.data ?? [])
    .map((row) => row.id)
    .filter(Boolean);

  await deleteIn(
    kitchen,
    'order_items',
    'order_id',
    oldOrderIds,
    'Delete old order items',
  );

  await deleteIn(
    kitchen,
    'orders',
    'id',
    oldOrderIds,
    'Delete old orders',
  );

  const oldBatches = await kitchen
    .from('inventory_batches')
    .select('id')
    .eq('notes', TEST_NOTES);

  await expectNoError(
    'Fetch old test batches',
    oldBatches,
  );

  const oldBatchIds = (oldBatches.data ?? [])
    .map((row) => row.id)
    .filter(Boolean);

  if (oldBatchIds.length > 0) {
    const oldBatchItems = await kitchen
      .from('inventory_batch_items')
      .select('id')
      .in('inventory_batch_id', oldBatchIds);

    await expectNoError(
      'Fetch old test batch items',
      oldBatchItems,
    );

    const oldBatchItemIds = (oldBatchItems.data ?? [])
      .map((row) => row.id)
      .filter(Boolean);

    await deleteIn(
      kitchen,
      'inventory_movements',
      'inventory_batch_item_id',
      oldBatchItemIds,
      'Delete old inventory movements',
    );

    await deleteIn(
      kitchen,
      'inventory_batch_items',
      'inventory_batch_id',
      oldBatchIds,
      'Delete old inventory batch items',
    );

    await deleteIn(
      kitchen,
      'inventory_batches',
      'id',
      oldBatchIds,
      'Delete old inventory batches',
    );
  }

  const oldPlans = await kitchen
    .from('subscription_plans')
    .select('id')
    .like('name', 'TEST_PLAN_040%');

  await expectNoError(
    'Fetch old test plans',
    oldPlans,
  );

  const oldPlanIds = (oldPlans.data ?? [])
    .map((row) => row.id)
    .filter(Boolean);

  if (oldPlanIds.length > 0) {
    await deleteIn(
      kitchen,
      'subscriptions',
      'plan_id',
      oldPlanIds,
      'Delete subscriptions belonging to old test plans',
    );

    await deleteIn(
      kitchen,
      'subscription_plans',
      'id',
      oldPlanIds,
      'Delete old test plans',
    );
  }

  console.log(
    `Pre-cleaned ${oldOrderIds.length} orders and ` +
    `${oldBatchIds.length} batches.`,
  );
}

async function createBatch({
  stallId,
  kitchenId,
  start,
  end,
  status = 'active',
}) {
  const payload = {
    stall_id: stallId,
    inventory_date: TEST_DATE,
    window_start: start,
    window_end: end,
    status,
    notes: TEST_NOTES,
    created_by: kitchenId,
  };

  if (status === 'active') {
    payload.activated_at = new Date().toISOString();
  }

  const result = await kitchen
    .from('inventory_batches')
    .insert(payload)
    .select()
    .single();

  const batch = await expectNoError(
    `Create ${status} inventory batch`,
    result,
  );

  if (!batch?.id) {
    throw new Error(
      'Created batch did not return an id',
    );
  }

  cleanupIds.batches.add(batch.id);

  return batch;
}

async function addBatchItem(
  batchId,
  mealId,
  loadedQuantity,
) {
  const result = await kitchen
    .from('inventory_batch_items')
    .insert({
      inventory_batch_id: batchId,
      meal_id: mealId,
      loaded_quantity: loadedQuantity,
    })
    .select()
    .single();

  const item = await expectNoError(
    'Create inventory batch item',
    result,
  );

  if (!item?.id) {
    throw new Error(
      'Created batch item did not return an id',
    );
  }

  if (item.loaded_quantity !== loadedQuantity) {
    throw new Error(
      `loaded_quantity mismatch: expected ` +
      `${loadedQuantity}, got ${item.loaded_quantity}`,
    );
  }

  return item;
}

async function createSubscription({
  client,
  userId,
  planId,
  remainingMeals,
  dailyCreditsUsed = 0,
  lastUsageDate = null,
}) {
  const result = await client
    .from('subscriptions')
    .insert({
      user_id: userId,
      plan_id: planId,
      status: 'active',
      start_date: '2029-01-01',
      end_date: '2031-01-01',
      remaining_meals: remainingMeals,
      consumed_meals: 0,
      daily_credits_used: dailyCreditsUsed,
      last_usage_date: lastUsageDate,
    })
    .select()
    .single();

  const subscription = await expectNoError(
    'Create test subscription',
    result,
  );

  if (!subscription?.id) {
    throw new Error(
      'Created subscription did not return an id',
    );
  }

  cleanupIds.subscriptions.add(subscription.id);

  return subscription;
}

async function cleanupTrackedData() {
  console.log('\n--- STARTING CLEANUP ---');

  const orderIds = [
    ...cleanupIds.orders,
  ].filter(Boolean);

  const batchIds = [
    ...cleanupIds.batches,
  ].filter(Boolean);

  const subscriptionIds = [
    ...cleanupIds.subscriptions,
  ].filter(Boolean);

  const planIds = [
    ...cleanupIds.plans,
  ].filter(Boolean);

  const mealIds = [
    ...cleanupIds.meals,
  ].filter(Boolean);

  await deleteIn(
    kitchen,
    'order_items',
    'order_id',
    orderIds,
    'Cleanup order items',
  );

  await deleteIn(
    kitchen,
    'orders',
    'id',
    orderIds,
    'Cleanup orders',
  );

  if (batchIds.length > 0) {
    const batchItemsResult = await kitchen
      .from('inventory_batch_items')
      .select('id')
      .in('inventory_batch_id', batchIds);

    await expectNoError(
      'Fetch tracked batch items for cleanup',
      batchItemsResult,
    );

    const batchItemIds = (
      batchItemsResult.data ?? []
    )
      .map((row) => row.id)
      .filter(Boolean);

    await deleteIn(
      kitchen,
      'inventory_movements',
      'inventory_batch_item_id',
      batchItemIds,
      'Cleanup inventory movements',
    );

    await deleteIn(
      kitchen,
      'inventory_batch_items',
      'inventory_batch_id',
      batchIds,
      'Cleanup inventory batch items',
    );

    await deleteIn(
      kitchen,
      'inventory_batches',
      'id',
      batchIds,
      'Cleanup inventory batches',
    );
  }

  await deleteIn(
    kitchen,
    'subscriptions',
    'id',
    subscriptionIds,
    'Cleanup subscriptions',
  );

  await deleteIn(
    kitchen,
    'subscription_plans',
    'id',
    planIds,
    'Cleanup subscription plans',
  );

  await deleteIn(
    kitchen,
    'meals',
    'id',
    mealIds,
    'Cleanup generated meals',
  );

  console.log(
    `Cleaned up ${orderIds.length} orders, ` +
    `${batchIds.length} batches, ` +
    `${subscriptionIds.length} subscriptions, ` +
    `${planIds.length} plans, ` +
    `${mealIds.length} meals.`,
  );
}

async function runTests() {
  let allPassed = false;
  let executionError = null;

  console.log(
    '--- STARTING INVENTORY VERIFICATION ---',
  );

  try {
    const kitchenLogin =
      await kitchen.auth.signInWithPassword({
        email: KITCHEN_EMAIL,
        password: KITCHEN_PASSWORD,
      });

    if (
      kitchenLogin.error ||
      !kitchenLogin.data?.user
    ) {
      throw new Error(
        `Kitchen login failed: ${kitchenLogin.error?.message ??
        'No user returned'
        }`,
      );
    }

    console.log('✅ Kitchen login successful');

    const customerLogin =
      await customer.auth.signInWithPassword({
        email: CUSTOMER_EMAIL,
        password: CUSTOMER_PASSWORD,
      });

    if (
      customerLogin.error ||
      !customerLogin.data?.user
    ) {
      throw new Error(
        `Customer login failed: ${customerLogin.error?.message ??
        'No user returned'
        }`,
      );
    }

    console.log('✅ Customer login successful');

    const kitchenId =
      kitchenLogin.data.user.id;

    const customerId =
      customerLogin.data.user.id;

    await preCleanOldTestData();

    const stallsResult = await customer
      .from('stalls')
      .select('*')
      .limit(1);

    const stalls = await expectNoError(
      'Fetch stall',
      stallsResult,
    );

    const stall = stalls?.[0];

    if (!stall) {
      throw new Error('No stall found');
    }

    const mealsResult = await customer
      .from('meals')
      .select('*')
      .eq('stall_id', stall.id)
      .eq('is_available', true)
      .order('id', { ascending: true });

    const availableMeals =
      await expectNoError(
        'Fetch available meals',
        mealsResult,
      );

    if (
      !availableMeals ||
      availableMeals.length < 3
    ) {
      throw new Error(
        'Need at least 3 available meals for this verification suite',
      );
    }

    const unavailableResult = await customer
      .from('meals')
      .select('*')
      .eq('stall_id', stall.id)
      .eq('is_available', false)
      .limit(1);

    const unavailableMeals =
      await expectNoError(
        'Fetch unavailable meals',
        unavailableResult,
      );

    const plansResult = await customer
      .from('subscription_plans')
      .select('*')
      .limit(50);

    const plans = await expectNoError(
      'Fetch subscription plans',
      plansResult,
    );

    const plan = (plans ?? []).find(
      (candidate) => {
        const costs =
          candidate.category_credit_costs;

        return (
          costs &&
          typeof costs === 'object' &&
          Number(candidate.meals_per_day) > 0 &&
          availableMeals.some((meal) => {
            const cost = Number(
              costs[meal.category],
            );

            return (
              Number.isInteger(cost) &&
              cost > 0
            );
          })
        );
      },
    );

    if (!plan) {
      throw new Error(
        'No subscription plan covers an available meal category',
      );
    }

    const categoryCosts =
      plan.category_credit_costs;

    const subscriptionMeal =
      availableMeals.find((meal) => {
        const cost = Number(
          categoryCosts[meal.category],
        );

        return (
          Number.isInteger(cost) &&
          cost > 0
        );
      });

    if (!subscriptionMeal) {
      throw new Error(
        'No eligible subscription meal found',
      );
    }

    const reservedMealRow =
      availableMeals.find(
        (meal) =>
          meal.id !== subscriptionMeal.id,
      );

    const notInBatchRow =
      availableMeals.find(
        (meal) =>
          meal.id !== subscriptionMeal.id &&
          meal.id !== reservedMealRow?.id,
      );

    if (
      !reservedMealRow ||
      !notInBatchRow
    ) {
      throw new Error(
        'Could not select three distinct meal fixtures',
      );
    }

    const testMeals = {
      reservedMeal: {
        mealId: reservedMealRow.id,
        mealName: reservedMealRow.name,
        category: reservedMealRow.category,
        price: Number(reservedMealRow.price),
        loadedQuantity: 10,
      },

      successMeal: {
        mealId: subscriptionMeal.id,
        mealName: subscriptionMeal.name,
        category: subscriptionMeal.category,
        price: Number(subscriptionMeal.price),
        loadedQuantity: 20,
        creditCost: Number(
          categoryCosts[
          subscriptionMeal.category
          ],
        ),
      },

      notInBatch: {
        mealId: notInBatchRow.id,
        mealName: notInBatchRow.name,
      },

      unavailable:
        unavailableMeals?.[0]
          ? {
            mealId:
              unavailableMeals[0].id,
            mealName:
              unavailableMeals[0].name,
          }
          : null,
    };

    // Test 1: invalid payload
    let result = await placeOrder(null);

    if (
      hasErrorCode(
        result,
        'INVALID_PAYLOAD',
      )
    ) {
      pass('invalid payload');
    } else {
      fail(
        'invalid payload',
        'INVALID_PAYLOAD',
        result.error,
      );
    }

    // Test 2: invalid UUID
    result = await placeOrder({
      stallId: 'invalid-uuid',
      pickupDate: TEST_DATE,
      items: [
        {
          mealId:
            testMeals.successMeal.mealId,
          quantity: 1,
        },
      ],
    });

    if (
      hasErrorCode(
        result,
        'INVALID_PAYLOAD',
      )
    ) {
      pass('invalid UUID (stallId)');
    } else {
      fail(
        'invalid UUID',
        'INVALID_PAYLOAD',
        result.error,
      );
    }

    // Test 3: invalid quantity
    result = await placeOrder({
      stallId: stall.id,
      pickupDate: TEST_DATE,
      expectedPickupSlot:
        '10:00-11:00',
      items: [
        {
          mealId:
            testMeals.successMeal.mealId,
          quantity: -5,
        },
      ],
    });

    if (
      hasErrorCode(
        result,
        'INVALID_QUANTITY',
      )
    ) {
      pass('invalid quantity (-5)');
    } else {
      fail(
        'invalid quantity',
        'INVALID_QUANTITY',
        result.error,
      );
    }

    // Test 4: invalid pickup slot
    result = await placeOrder({
      stallId: stall.id,
      pickupDate: TEST_DATE,
      expectedPickupSlot:
        '11:00-10:00',
      items: [
        {
          mealId:
            testMeals.successMeal.mealId,
          quantity: 1,
        },
      ],
    });

    if (
      hasErrorCode(
        result,
        'INVALID_PAYLOAD',
      )
    ) {
      pass(
        'invalid pickup slot',
      );
    } else {
      fail(
        'invalid pickup slot',
        'INVALID_PAYLOAD',
        result.error,
      );
    }
    // Test 5: meal not found
    result = await placeOrder({
      stallId: stall.id,
      pickupDate: TEST_DATE,
      expectedPickupSlot: '10:00-11:00',
      items: [
        {
          mealId:
            '00000000-0000-0000-0000-000000000000',
          quantity: 1,
        },
      ],
    });

    if (
      hasErrorCode(
        result,
        'MEAL_NOT_FOUND',
      )
    ) {
      pass('meal not found');
    } else {
      fail(
        'meal not found',
        'MEAL_NOT_FOUND',
        result.error,
      );
    }

    // Test 6: unavailable meal
    if (testMeals.unavailable) {
      result = await placeOrder({
        stallId: stall.id,
        pickupDate: TEST_DATE,
        expectedPickupSlot:
          '10:00-11:00',
        items: [
          {
            mealId:
              testMeals.unavailable.mealId,
            quantity: 1,
          },
        ],
      });

      if (
        hasErrorCode(
          result,
          'MEAL_NOT_AVAILABLE',
        )
      ) {
        pass('meal unavailable');
      } else {
        fail(
          'meal unavailable',
          'MEAL_NOT_AVAILABLE',
          result.error,
        );
      }
    } else {
      skip(
        'meal unavailable',
        'No unavailable meal exists for this stall',
      );
    }

    // Test 7: preorder before inventory activation
    result = await placeOrder({
      stallId: stall.id,
      pickupDate: TEST_DATE,
      paymentMethod: 'cash',
      notes: TEST_NOTES,
      expectedPickupSlot:
        '10:00-11:00',
      items: [
        {
          mealId:
            testMeals.reservedMeal.mealId,
          quantity: 1,
        },
      ],
    });

    if (result.error) {
      fail(
        'preorder with no active batch',
        'Success',
        result.error,
      );
    }

    cleanupIds.orders.add(
      result.data?.order_id,
    );

    pass(
      'preorder with no active batch',
    );

    // Create main active inventory batch
    const batch = await createBatch({
      stallId: stall.id,
      kitchenId,
      start: '12:00:00',
      end: '13:00:00',
      status: 'active',
    });

    const reservedBatchItem =
      await addBatchItem(
        batch.id,
        testMeals.reservedMeal.mealId,
        testMeals.reservedMeal
          .loadedQuantity,
      );

    testMeals.reservedMeal.batchItemId =
      reservedBatchItem.id;

    const successBatchItem =
      await addBatchItem(
        batch.id,
        testMeals.successMeal.mealId,
        testMeals.successMeal
          .loadedQuantity,
      );

    testMeals.successMeal.batchItemId =
      successBatchItem.id;

    const liveFixturesResult =
      await kitchen
        .from('live_inventory_status')
        .select('*')
        .in(
          'inventory_batch_item_id',
          [
            reservedBatchItem.id,
            successBatchItem.id,
          ],
        );

    const liveFixtures =
      await expectNoError(
        'Read test inventory fixtures',
        liveFixturesResult,
      );

    if (
      !liveFixtures ||
      liveFixtures.length !== 2
    ) {
      throw new Error(
        'Live inventory rows not found for both test items',
      );
    }

    console.log(
      '=> VERIFIED TEST BATCH FIXTURES:',
    );

    for (const state of liveFixtures) {
      const meal =
        state.inventory_batch_item_id ===
          reservedBatchItem.id
          ? testMeals.reservedMeal
          : testMeals.successMeal;

      console.log(
        `   Batch: ${batch.id} | ` +
        `Meal: ${meal.mealName}`,
      );

      console.log(
        `   > Loaded: ${state.loaded_quantity}, ` +
        `Reserved: ${state.active_reserved}, ` +
        `Fulfilled: ${state.fulfilled}, ` +
        `Remaining Phys: ${state.remaining_physical}, ` +
        `Extra Avail: ${state.extra_available}, ` +
        `Customer Avail: ${state.customer_available}, ` +
        `Status: ${state.stock_status}`,
      );
    }

    const reservedState =
      liveFixtures.find(
        (state) =>
          state.inventory_batch_item_id ===
          reservedBatchItem.id,
      );

    if (
      Number(
        reservedState?.active_reserved,
      ) >= 1
    ) {
      pass(
        'preorder reservation reflected after inventory activation',
      );
    } else {
      fail(
        'preorder reservation after activation',
        'active_reserved >= 1',
        reservedState,
      );
    }

    // Test 8: batch required
    result = await placeOrder({
      stallId: stall.id,
      pickupDate: TEST_DATE,
      paymentMethod: 'cash',
      notes: TEST_NOTES,
      expectedPickupSlot:
        '10:00-11:00',
      items: [
        {
          mealId:
            testMeals.successMeal.mealId,
          quantity: 1,
        },
      ],
    });

    if (
      hasErrorCode(
        result,
        'BATCH_REQUIRED',
      )
    ) {
      pass(
        'BATCH_REQUIRED when active batch exists',
      );
    } else {
      fail(
        'BATCH_REQUIRED',
        'BATCH_REQUIRED',
        result.error,
      );
    }

    // Test 9: batch date mismatch
    result = await placeOrder({
      stallId: stall.id,
      pickupDate: '2030-01-02',
      paymentMethod: 'cash',
      notes: TEST_NOTES,
      inventoryBatchId: batch.id,
      items: [
        {
          mealId:
            testMeals.successMeal.mealId,
          quantity: 1,
        },
      ],
    });

    if (
      hasErrorCode(
        result,
        'WINDOW_MISMATCH',
      )
    ) {
      pass(
        'invalid batch date mismatch',
      );
    } else {
      fail(
        'invalid batch date mismatch',
        'WINDOW_MISMATCH',
        result.error,
      );
    }

    // Test 10: successful inventory-backed order
    const beforeSuccessResult =
      await kitchen
        .from('live_inventory_status')
        .select('*')
        .eq(
          'inventory_batch_item_id',
          testMeals.successMeal
            .batchItemId,
        )
        .single();

    const beforeSuccess =
      await expectNoError(
        'Read success meal state',
        beforeSuccessResult,
      );

    if (
      Number(
        beforeSuccess.extra_available,
      ) < 1 ||
      Number(
        beforeSuccess.customer_available,
      ) < 1
    ) {
      throw new Error(
        `Fixture failure: ` +
        `${testMeals.successMeal.mealName} ` +
        `has insufficient stock before test`,
      );
    }

    result = await placeOrder({
      stallId: stall.id,
      pickupDate: TEST_DATE,
      paymentMethod: 'cash',
      notes: TEST_NOTES,
      inventoryBatchId: batch.id,
      items: [
        {
          mealId:
            testMeals.successMeal.mealId,
          quantity: 1,
        },
      ],
    });

    if (result.error) {
      fail(
        'successful inventory-backed order',
        'Success',
        result.error,
      );
    }

    cleanupIds.orders.add(
      result.data?.order_id,
    );

    pass(
      'successful inventory-backed order',
    );

    // Test 11: item not in batch
    result = await placeOrder({
      stallId: stall.id,
      pickupDate: TEST_DATE,
      paymentMethod: 'cash',
      notes: TEST_NOTES,
      inventoryBatchId: batch.id,
      items: [
        {
          mealId:
            testMeals.notInBatch.mealId,
          quantity: 1,
        },
      ],
    });

    if (
      hasErrorCode(
        result,
        'ITEM_NOT_IN_BATCH',
      )
    ) {
      pass('item not in batch');
    } else {
      fail(
        'item not in batch',
        'ITEM_NOT_IN_BATCH',
        result.error,
      );
    }

    // Test 12: insufficient stock
    result = await placeOrder({
      stallId: stall.id,
      pickupDate: TEST_DATE,
      paymentMethod: 'cash',
      notes: TEST_NOTES,
      inventoryBatchId: batch.id,
      items: [
        {
          mealId:
            testMeals.successMeal.mealId,
          quantity: 100,
        },
      ],
    });

    if (
      hasErrorCode(
        result,
        'INSUFFICIENT_STOCK',
      )
    ) {
      pass('insufficient stock');
    } else {
      fail(
        'insufficient stock',
        'INSUFFICIENT_STOCK',
        result.error,
      );
    }

    // Test 13: mixed paid and subscription order
    const mixedSubscription =
      await createSubscription({
        client: customer,
        userId: customerId,
        planId: plan.id,
        remainingMeals: 100,
      });

    result = await placeOrder({
      stallId: stall.id,
      pickupDate: TEST_DATE,
      paymentMethod: 'cash',
      notes: TEST_NOTES,
      inventoryBatchId: batch.id,
      subscriptionId:
        mixedSubscription.id,
      items: [
        {
          mealId:
            testMeals.successMeal.mealId,
          quantity: 1,
          useSubscription: true,
        },
        {
          mealId:
            testMeals.successMeal.mealId,
          quantity: 1,
          useSubscription: false,
        },
      ],
    });

    if (result.error) {
      fail(
        'mixed paid and subscription order',
        'Success',
        result.error,
      );
    }

    cleanupIds.orders.add(
      result.data?.order_id,
    );

    if (
      result.data?.payment_status !==
      'pending'
    ) {
      fail(
        'mixed paid and subscription order',
        'pending payment status',
        result.data,
      );
    }

    pass(
      'mixed paid and subscription order',
    );

    // Test 14: fully subscription-covered order
    const fullSubscription =
      await createSubscription({
        client: customer,
        userId: customerId,
        planId: plan.id,
        remainingMeals: 100,
      });

    result = await placeOrder({
      stallId: stall.id,
      pickupDate: TEST_DATE,
      notes: TEST_NOTES,
      inventoryBatchId: batch.id,
      subscriptionId:
        fullSubscription.id,
      items: [
        {
          mealId:
            testMeals.successMeal.mealId,
          quantity: 1,
          useSubscription: true,
        },
      ],
    });

    if (result.error) {
      fail(
        'fully subscription-covered order',
        'Success',
        result.error,
      );
    }

    cleanupIds.orders.add(
      result.data?.order_id,
    );

    if (
      result.data?.payment_status !==
      'paid' ||
      result.data?.order_type !==
      'subscription'
    ) {
      fail(
        'fully subscription-covered order',
        'paid status and subscription order type',
        result.data,
      );
    }

    pass(
      'fully subscription-covered order',
    );

    // Test 15: ineligible subscription category
    const ineligibleMeal =
      availableMeals.find(
        (meal) =>
          !Object.prototype
            .hasOwnProperty.call(
              categoryCosts,
              meal.category,
            ),
      );

    if (ineligibleMeal) {
      const ineligibleBatchItem =
        await addBatchItem(
          batch.id,
          ineligibleMeal.id,
          10,
        );

      result = await placeOrder({
        stallId: stall.id,
        pickupDate: TEST_DATE,
        notes: TEST_NOTES,
        inventoryBatchId: batch.id,
        subscriptionId:
          fullSubscription.id,
        items: [
          {
            mealId:
              ineligibleMeal.id,
            quantity: 1,
            useSubscription: true,
          },
        ],
      });

      const removeResult =
        await kitchen
          .from(
            'inventory_batch_items',
          )
          .delete()
          .eq(
            'id',
            ineligibleBatchItem.id,
          );

      await expectNoError(
        'Remove ineligible test item',
        removeResult,
      );

      if (
        hasErrorCode(
          result,
          'SUBSCRIPTION_ITEM_NOT_ELIGIBLE',
        )
      ) {
        pass(
          'ineligible subscription category',
        );
      } else {
        fail(
          'ineligible subscription category',
          'SUBSCRIPTION_ITEM_NOT_ELIGIBLE',
          result.error,
        );
      }
    } else {
      skip(
        'ineligible subscription category',
        'Every available meal category is covered by the selected plan',
      );
    }

    // Test 16: insufficient subscription credits
    const emptySubscription =
      await createSubscription({
        client: customer,
        userId: customerId,
        planId: plan.id,
        remainingMeals: 0,
      });

    result = await placeOrder({
      stallId: stall.id,
      pickupDate: TEST_DATE,
      notes: TEST_NOTES,
      inventoryBatchId: batch.id,
      subscriptionId:
        emptySubscription.id,
      items: [
        {
          mealId:
            testMeals.successMeal.mealId,
          quantity: 1,
          useSubscription: true,
        },
      ],
    });

    if (
      hasErrorCode(
        result,
        'INSUFFICIENT_CREDITS',
      )
    ) {
      pass(
        'insufficient total credits',
      );
    } else {
      fail(
        'insufficient total credits',
        'INSUFFICIENT_CREDITS',
        result.error,
      );
    }

    // Test 17: daily credit limit exceeded
    const dailyLimit =
      Number(plan.meals_per_day);

    const dailySubscription =
      await createSubscription({
        client: customer,
        userId: customerId,
        planId: plan.id,
        remainingMeals: 100,
        dailyCreditsUsed:
          dailyLimit,
        lastUsageDate: TEST_DATE,
      });

    result = await placeOrder({
      stallId: stall.id,
      pickupDate: TEST_DATE,
      notes: TEST_NOTES,
      inventoryBatchId: batch.id,
      subscriptionId:
        dailySubscription.id,
      items: [
        {
          mealId:
            testMeals.successMeal.mealId,
          quantity: 1,
          useSubscription: true,
        },
      ],
    });

    if (
      hasErrorCode(
        result,
        'DAILY_CREDIT_LIMIT_EXCEEDED',
      )
    ) {
      pass(
        'daily credit limit exceeded',
      );
    } else {
      fail(
        'daily credit limit exceeded',
        'DAILY_CREDIT_LIMIT_EXCEEDED',
        result.error,
      );
    }

    // Test 18 and 19: lifecycle authorization
    const lifecycleBatch =
      await createBatch({
        stallId: stall.id,
        kitchenId,
        start: '20:00:00',
        end: '21:00:00',
        status: 'draft',
      });

    await addBatchItem(
      lifecycleBatch.id,
      testMeals.successMeal.mealId,
      5,
    );

    const unauthorizedActivation =
      await customer.rpc(
        'activate_inventory_batch',
        {
          p_batch_id:
            lifecycleBatch.id,
        },
      );

    if (
      unauthorizedActivation.error &&
      (
        unauthorizedActivation.error
          .message.includes(
            'UNAUTHORIZED',
          ) ||
        unauthorizedActivation.error
          .message.includes(
            'permission denied',
          )
      )
    ) {
      pass(
        'unauthorized lifecycle RPC access',
      );
    } else {
      fail(
        'unauthorized lifecycle RPC access',
        'UNAUTHORIZED',
        unauthorizedActivation.error ??
        unauthorizedActivation.data,
      );
    }

    const authorizedActivation =
      await kitchen.rpc(
        'activate_inventory_batch',
        {
          p_batch_id:
            lifecycleBatch.id,
        },
      );

    await expectNoError(
      'Authorized activation',
      authorizedActivation,
    );

    pass(
      'authorized lifecycle RPC access (activate)',
    );

    const authorizedClose =
      await kitchen.rpc(
        'close_inventory_batch',
        {
          p_batch_id:
            lifecycleBatch.id,
          p_note: TEST_NOTES,
        },
      );

    await expectNoError(
      'Authorized close',
      authorizedClose,
    );

    pass(
      'authorized lifecycle RPC access (close)',
    );

    // Test 20 and 21: inventory movement bounds
    const movementBatch =
      await createBatch({
        stallId: stall.id,
        kitchenId,
        start: '14:00:00',
        end: '15:00:00',
        status: 'active',
      });

    const movementBatchItem =
      await addBatchItem(
        movementBatch.id,
        testMeals.successMeal.mealId,
        10,
      );

    const walkInResult =
      await kitchen.rpc(
        'record_inventory_movement',
        {
          p_batch_item_id:
            movementBatchItem.id,
          p_movement_type:
            'walk_in_sale',
          p_quantity: 20,
          p_note: TEST_NOTES,
          p_reference_order_id:
            null,
        },
      );

    if (
      walkInResult.error?.message
        ?.includes(
          'INSUFFICIENT_STOCK',
        )
    ) {
      pass(
        'walk-in movement bounds',
      );
    } else {
      fail(
        'walk-in movement bounds',
        'INSUFFICIENT_STOCK',
        walkInResult,
      );
    }

    const wasteResult =
      await kitchen.rpc(
        'record_inventory_movement',
        {
          p_batch_item_id:
            movementBatchItem.id,
          p_movement_type:
            'wasted',
          p_quantity: 15,
          p_note: TEST_NOTES,
          p_reference_order_id:
            null,
        },
      );

    if (
      wasteResult.error?.message
        ?.includes(
          'INSUFFICIENT_STOCK',
        )
    ) {
      pass(
        'waste physical-stock bounds',
      );
    } else {
      fail(
        'waste physical-stock bounds',
        'INSUFFICIENT_STOCK',
        wasteResult,
      );
    }
    // Inventory concurrency: 10 attempts for 5 units
    console.log(
      '--- STARTING CONCURRENCY TESTS ---',
    );

    const concurrencyBatch =
      await createBatch({
        stallId: stall.id,
        kitchenId,
        start: '16:00:00',
        end: '17:00:00',
        status: 'active',
      });

    const concurrencyBatchItem =
      await addBatchItem(
        concurrencyBatch.id,
        testMeals.successMeal.mealId,
        5,
      );

    const inventoryResults =
      await Promise.allSettled(
        Array.from(
          { length: 10 },
          () =>
            placeOrder({
              stallId: stall.id,
              pickupDate: TEST_DATE,
              paymentMethod: 'cash',
              notes: TEST_NOTES,
              inventoryBatchId:
                concurrencyBatch.id,
              items: [
                {
                  mealId:
                    testMeals.successMeal
                      .mealId,
                  quantity: 1,
                },
              ],
            }),
        ),
      );

    let inventorySuccesses = 0;
    let inventoryStockFailures = 0;
    let inventoryDeadlocks = 0;

    const unexpectedInventoryErrors = [];

    for (
      const settled of inventoryResults
    ) {
      if (settled.status === 'rejected') {
        unexpectedInventoryErrors.push(
          settled.reason,
        );
        continue;
      }

      const rpcResult = settled.value;

      if (!rpcResult.error) {
        inventorySuccesses += 1;

        cleanupIds.orders.add(
          rpcResult.data?.order_id,
        );
      } else if (
        hasErrorCode(
          rpcResult,
          'INSUFFICIENT_STOCK',
        )
      ) {
        inventoryStockFailures += 1;
      } else if (
        rpcResult.error.message?.includes(
          'deadlock detected',
        )
      ) {
        inventoryDeadlocks += 1;
      } else {
        unexpectedInventoryErrors.push(
          rpcResult.error,
        );
      }
    }

    if (
      inventorySuccesses === 5 &&
      inventoryStockFailures === 5 &&
      inventoryDeadlocks === 0 &&
      unexpectedInventoryErrors.length === 0
    ) {
      pass(
        'Inventory concurrency: 5 successes, 5 stock failures, 0 deadlocks',
      );
    } else {
      fail(
        'Inventory concurrency',
        '5 successes, 5 stock failures, 0 deadlocks',
        {
          inventorySuccesses,
          inventoryStockFailures,
          inventoryDeadlocks,
          unexpectedInventoryErrors,
        },
      );
    }

    const concurrencyStateResult =
      await kitchen
        .from('live_inventory_status')
        .select('extra_available')
        .eq(
          'inventory_batch_item_id',
          concurrencyBatchItem.id,
        )
        .single();

    const concurrencyState =
      await expectNoError(
        'Read inventory concurrency state',
        concurrencyStateResult,
      );

    if (
      Number(
        concurrencyState.extra_available,
      ) === 0
    ) {
      pass(
        'Inventory concurrency state: exactly 0 extra available',
      );
    } else {
      fail(
        'Inventory concurrency state',
        '0 extra available',
        concurrencyState,
      );
    }

    // Subscription concurrency uses a separate stocked batch
    const subscriptionConcurrencyBatch =
      await createBatch({
        stallId: stall.id,
        kitchenId,
        start: '18:00:00',
        end: '19:00:00',
        status: 'active',
      });

    await addBatchItem(
      subscriptionConcurrencyBatch.id,
      testMeals.successMeal.mealId,
      20,
    );

    const creditCost =
      testMeals.successMeal.creditCost;

    const intendedCredits =
      creditCost * 3;

    const subscriptionConcurrency =
      await createSubscription({
        client: customer,
        userId: customerId,
        planId: plan.id,
        remainingMeals:
          intendedCredits,
      });

    const subscriptionResults =
      await Promise.allSettled(
        Array.from(
          { length: 5 },
          () =>
            placeOrder({
              stallId: stall.id,
              pickupDate: TEST_DATE,
              notes: TEST_NOTES,
              inventoryBatchId:
                subscriptionConcurrencyBatch.id,
              subscriptionId:
                subscriptionConcurrency.id,
              items: [
                {
                  mealId:
                    testMeals.successMeal
                      .mealId,
                  quantity: 1,
                  useSubscription: true,
                },
              ],
            }),
        ),
      );

    let subscriptionSuccesses = 0;
    let subscriptionLimitFailures = 0;

    const unexpectedSubscriptionErrors = [];

    for (
      const settled of subscriptionResults
    ) {
      if (settled.status === 'rejected') {
        unexpectedSubscriptionErrors.push(
          settled.reason,
        );
        continue;
      }

      const rpcResult = settled.value;

      if (!rpcResult.error) {
        subscriptionSuccesses += 1;

        cleanupIds.orders.add(
          rpcResult.data?.order_id,
        );
      } else if (
        hasErrorCode(
          rpcResult,
          'INSUFFICIENT_CREDITS',
        ) ||
        hasErrorCode(
          rpcResult,
          'DAILY_CREDIT_LIMIT_EXCEEDED',
        )
      ) {
        subscriptionLimitFailures += 1;
      } else {
        unexpectedSubscriptionErrors.push(
          rpcResult.error,
        );
      }
    }

    const expectedSubscriptionSuccesses =
      Math.min(
        3,
        5,
        Math.floor(
          Number(plan.meals_per_day) /
          creditCost,
        ),
      );

    const expectedSubscriptionFailures =
      5 -
      expectedSubscriptionSuccesses;

    if (
      subscriptionSuccesses ===
      expectedSubscriptionSuccesses &&
      subscriptionLimitFailures ===
      expectedSubscriptionFailures &&
      unexpectedSubscriptionErrors.length === 0
    ) {
      pass(
        `Subscription concurrency: ` +
        `${subscriptionSuccesses} successes, ` +
        `${subscriptionLimitFailures} limit failures`,
      );
    } else {
      fail(
        'Subscription concurrency',
        {
          expectedSubscriptionSuccesses,
          expectedSubscriptionFailures,
        },
        {
          subscriptionSuccesses,
          subscriptionLimitFailures,
          unexpectedSubscriptionErrors,
        },
      );
    }

    const finalSubscriptionResult =
      await customer
        .from('subscriptions')
        .select('remaining_meals')
        .eq(
          'id',
          subscriptionConcurrency.id,
        )
        .single();

    const finalSubscription =
      await expectNoError(
        'Read final subscription state',
        finalSubscriptionResult,
      );

    const expectedRemaining =
      intendedCredits -
      expectedSubscriptionSuccesses *
      creditCost;

    if (
      Number(
        finalSubscription.remaining_meals,
      ) === expectedRemaining
    ) {
      pass(
        `Subscription concurrency state: ` +
        `${expectedRemaining} credits remaining`,
      );
    } else {
      fail(
        'Subscription concurrency state',
        `${expectedRemaining} remaining`,
        finalSubscription,
      );
    }

    allPassed = true;
  } catch (error) {
    executionError = error;

    console.error(
      '\n❌ VERIFICATION FAILED',
    );

    if (
      error instanceof
      VerificationFailure
    ) {
      console.error(
        `Test: ${error.testName}`,
      );

      console.error(
        'Expected:',
        error.expected,
      );

      console.error(
        'Actual:',
        error.actual,
      );
    } else {
      console.error(error);
    }
  }

  let cleanupError = null;

  try {
    await cleanupTrackedData();
  } catch (error) {
    cleanupError = error;

    console.error(
      '\n❌ CLEANUP FAILED',
    );

    console.error(error);
  }

  if (
    allPassed &&
    !cleanupError
  ) {
    console.log(
      '✅ ALL VERIFICATIONS COMPLETED SUCCESSFULLY',
    );

    process.exitCode = 0;
    return;
  }

  if (
    !executionError &&
    cleanupError
  ) {
    executionError = cleanupError;
  }

  console.log(
    '❌ VERIFICATION SUITE FAILED OR INCOMPLETE',
  );

  process.exitCode = 1;
}

runTests().catch((error) => {
  console.error(
    'Fatal runtime error:',
    error,
  );

  process.exitCode = 1;
});