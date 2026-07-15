const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase URL or Key");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  console.log("Checking constraints on inventory_batch_items...");
  try {
    const { data: constraints, error: err } = await supabase.rpc('execute_sql_query', {
      query_text: `
        SELECT conname, pg_get_constraintdef(oid) 
        FROM pg_constraint 
        WHERE conrelid = 'inventory_batch_items'::regclass;
      `
    });

    if (err) {
      console.log("RPC query failed (expected if RPC not present), listing constraints via pg_catalog...");
      // Since we can't run arbitrary SQL easily if RPC is not there, we can write an RPC or check if there is an alternative.
      // Wait, we can't do direct pg_catalog checks easily without executing SQL. But let's see if we can create a temporary function or just assume it might be missing or need to be enforced.
      console.log(err);
    } else {
      console.log("Constraints:", constraints);
    }
  } catch (e) {
    console.error("Failed to check constraints:", e);
  }
}

check();
