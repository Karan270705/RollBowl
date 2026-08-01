import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkCoupling() {
  console.log('--- 1. ACTIVE STALL ---');
  const { data: stall } = await supabase.from('stalls').select('*').eq('is_active', true).limit(1).single();
  console.log('Stall:', stall?.id, stall?.name);

  console.log('\n--- 2. MENU SCHEDULES ---');
  const { data: menus, error: menusErr } = await supabase
    .from('menu_schedules')
    .select('*')
    .order('menu_date', { ascending: false })
    .limit(5);
  console.log('Menus:', menus, 'Error:', menusErr?.message);

  console.log('\n--- 3. INVENTORY BATCHES ---');
  const { data: batches, error: batchesErr } = await supabase
    .from('inventory_batches')
    .select('*')
    .order('inventory_date', { ascending: false })
    .limit(5);
  console.log('Batches:', batches, 'Error:', batchesErr?.message);

  console.log('\n--- 4. TEST RPC or FUNCTIONS ---');
  // Check if there are any database triggers on inventory_batches or menu_schedules
  const { data: rpcTest, error: rpcErr } = await supabase.rpc('get_current_operational_date');
  console.log('get_current_operational_date RPC:', rpcTest, rpcErr?.message);
}

checkCoupling();
