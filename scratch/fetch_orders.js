require('dotenv').config({ path: '.env' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function fetchOrders() {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(2);

  if (error) {
    console.error('Error fetching orders:', error);
  } else {
    console.log('[SUBSCRIPTION ORDER RAW RESULT]', JSON.stringify(data, null, 2));
  }
}

fetchOrders();
