require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase URL or Key');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function fetchOrders() {
  const { data, error } = await supabase
    .from('orders')
    .select('id, order_type, payment_method, payment_status, payment_verification_status, total, amount_due, subscription_id')
    .order('created_at', { ascending: false })
    .limit(5);

  if (error) {
    console.error('Error fetching orders:', error);
  } else {
    console.log('[SUBSCRIPTION ORDER RAW RESULT]', JSON.stringify(data, null, 2));
  }
}

fetchOrders();
