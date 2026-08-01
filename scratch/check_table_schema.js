import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const res = await supabase.from('inventory_reservations').select('*').limit(1);
  console.log('Result for inventory_reservations:', JSON.stringify(res, null, 2));

  // Also check orders table for comparison
  const resOrders = await supabase.from('orders').select('id').limit(1);
  console.log('Result for orders:', JSON.stringify(resOrders, null, 2));

  // Also check a definitely non-existent table for comparison
  const resFake = await supabase.from('definitely_non_existent_table_xyz').select('*').limit(1);
  console.log('Result for fake table:', JSON.stringify(resFake, null, 2));
}

run();
