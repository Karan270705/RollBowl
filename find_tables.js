require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase.rpc('get_tables'); // Or try to query information_schema if we can, but postgrest doesn't expose it by default.
  // We can just query `operational_windows` if it exists. But it didn't.
  // Maybe the table name is `stall_schedules`?
  const tables = ['stall_schedules', 'service_windows', 'delivery_windows', 'operational_schedules', 'kitchen_schedules', 'daily_schedules'];
  for (const t of tables) {
    const { data } = await supabase.from(t).select('*').limit(1);
    if (data) {
      console.log('Found table:', t, data);
    }
  }
}
run();
