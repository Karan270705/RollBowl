const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://xhyojkqsgpvjctmdqxzq.supabase.co';
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_DHsHOnpcix8PRVuIt3BqIA_A1uq-YQG';

const supabase = createClient(supabaseUrl, supabaseKey);

async function listTables() {
  const { data, error } = await supabase.rpc('calculate_subscription_expiry', {
    p_start_date: '2026-08-01',
    p_duration_days: 30,
    p_stall_id: '57a11000-0000-0000-0000-000000000001'
  });
  console.log('rpc test:', data, error);
}

listTables();
