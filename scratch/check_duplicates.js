const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase URL or Key");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log("Checking for duplicate inventory batch items...");
  try {
    const { data: duplicates, error: err } = await supabase.rpc('execute_sql_query', {
      query_text: `
        SELECT
          inventory_batch_id,
          meal_id,
          count(*) AS rows,
          array_agg(id) AS batch_item_ids,
          sum(loaded_quantity) AS total_loaded
        FROM inventory_batch_items
        GROUP BY inventory_batch_id, meal_id
        HAVING count(*) > 1;
      `
    });
    // Wait, the RPC 'execute_sql_query' might not exist.
    // If it doesn't, let's query the table directly using postgrest client
    if (err) {
      console.log("RPC query failed (expected if RPC not present), querying via postgrest...");
      const { data: items, error: iErr } = await supabase
        .from('inventory_batch_items')
        .select('id, inventory_batch_id, meal_id, loaded_quantity');
      
      if (iErr) throw iErr;
      
      const counts = {};
      items.forEach(item => {
        const key = `${item.inventory_batch_id}_${item.meal_id}`;
        if (!counts[key]) {
          counts[key] = [];
        }
        counts[key].push(item);
      });
      
      let dupCount = 0;
      Object.keys(counts).forEach(key => {
        if (counts[key].length > 1) {
          console.log(`Duplicate found for key ${key}:`, counts[key]);
          dupCount++;
        }
      });
      console.log(`Total duplicate groups: ${dupCount}`);
    } else {
      console.log("Duplicates via SQL:", duplicates);
    }
  } catch (e) {
    console.error("Check failed:", e);
  }
}

run();
