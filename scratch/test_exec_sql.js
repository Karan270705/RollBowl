const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);

async function test() {
  const { data, error } = await supabase.rpc('execute_sql', { query: 'SELECT 1 AS test;' });
  console.log("execute_sql:", data, error?.message);
}

test();
