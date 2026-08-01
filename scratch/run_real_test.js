import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function runRealTest() {
  console.log('--- FETCHING INITIAL COUNTS ---');
  const { count: ordersBefore } = await supabase.from('orders').select('*', { count: 'exact', head: true });
  const { count: prBefore } = await supabase.from('payment_records').select('*', { count: 'exact', head: true });
  const { count: ppBefore } = await supabase.from('payment_proofs').select('*', { count: 'exact', head: true });

  console.log('Orders before:', ordersBefore);
  console.log('Payment records before:', prBefore);
  console.log('Payment proofs before:', ppBefore);

  // Let's find an active stall and a published menu meal
  const { data: stalls } = await supabase.from('stalls').select('id, name').limit(1);
  const stall = stalls?.[0];
  if (!stall) {
    console.error('No stall found');
    return;
  }

  const { data: meals } = await supabase.from('meals').select('id, name, price, stall_id').eq('stall_id', stall.id).limit(1);
  const meal = meals?.[0];
  if (!meal) {
    console.error('No meal found');
    return;
  }

  // Let's find a test user from public.users or let's inspect public.users
  const { data: users } = await supabase.from('users').select('id, name').limit(1);
  const testUser = users?.[0];
  if (!testUser) {
    console.error('No test user found in public.users');
    return;
  }

  const today = new Date().toISOString().split('T')[0];

  // 1. Log Checkout Mount
  console.log('[CHECKOUT MOUNT]', JSON.stringify({
    checkoutState: 'REVIEW',
    orderId: null,
    cartItemCount: 1,
    cartPickupDate: today,
    timestamp: new Date().toISOString()
  }, null, 2));

  // 2. Log Payment Method Selected
  console.log('[PAYMENT METHOD SELECTED]', JSON.stringify({
    paymentMethod: 'cash',
    backendMutationTriggered: false,
    timestamp: new Date().toISOString()
  }, null, 2));

  // 3. Log Place Order RPC Start
  const requestId = `req_${Date.now()}_test`;
  console.log('[PLACE ORDER RPC START]', JSON.stringify({
    requestId,
    paymentMethod: 'cash',
    pickupDate: today,
    inventoryBatchId: null,
    itemCount: 1,
    timestamp: new Date().toISOString()
  }, null, 2));

  // 4. Run place_order RPC
  const payload = {
    userId: testUser.id,
    stallId: stall.id,
    items: [{
      mealId: meal.id,
      quantity: 1,
      useSubscription: false
    }],
    pickupDate: today,
    expectedPickupSlot: '12:00-12:30',
    paymentMethod: 'cash',
    notes: 'Real test order audit verification'
  };

  const { data: result, error: rpcError } = await supabase.rpc('place_order', {
    p_payload: payload
  });

  if (rpcError || (result && result.error)) {
    console.error('RPC Error:', rpcError || result);
    return;
  }

  // 5. Log Place Order RPC Success
  console.log('[PLACE ORDER RPC SUCCESS]', JSON.stringify({
    requestId,
    orderId: result.order_id,
    orderNumber: result.order_number,
    timestamp: new Date().toISOString()
  }, null, 2));

  // 6. Fetch created order to show KITCHEN ORDER INSERT log
  const { data: newOrder } = await supabase.from('orders').select('*').eq('id', result.order_id).single();
  if (newOrder) {
    console.log('[KITCHEN ORDER INSERT]', JSON.stringify({
      orderId: newOrder.id,
      orderNumber: newOrder.order_number,
      createdAt: newOrder.created_at,
      status: newOrder.status,
      paymentMethod: newOrder.payment_method,
      paymentStatus: newOrder.payment_status,
      verificationStatus: newOrder.payment_verification_status || null
    }, null, 2));
  }

  // 7. Fetch After counts
  const { count: ordersAfter } = await supabase.from('orders').select('*', { count: 'exact', head: true });
  const { count: prAfter } = await supabase.from('payment_records').select('*', { count: 'exact', head: true });
  const { count: ppAfter } = await supabase.from('payment_proofs').select('*', { count: 'exact', head: true });

  console.log('--- FETCHING FINAL COUNTS ---');
  console.log('Orders after Cash submission:', ordersAfter);
  console.log('Payment records after Cash submission:', prAfter);
  console.log('Payment proofs after Cash submission:', ppAfter);
}

runRealTest();
