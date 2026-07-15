const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase URL or Key");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function trace() {
  console.log("Tracing live inventory data...");
  try {
    // 1. Find an active or draft inventory batch
    const { data: batches, error: bErr } = await supabase
      .from('inventory_batches')
      .select('*')
      .limit(5);

    if (bErr) throw bErr;
    console.log("Batches:", JSON.stringify(batches, null, 2));

    if (batches.length === 0) {
      console.log("No batches found.");
      return;
    }

    const batch = batches[0];
    
    // 2. Find batch items
    const { data: items, error: iErr } = await supabase
      .from('inventory_batch_items')
      .select('*')
      .eq('inventory_batch_id', batch.id);

    if (iErr) throw iErr;
    console.log("Batch Items:", JSON.stringify(items, null, 2));

    if (items.length === 0) {
      console.log("No batch items found.");
      return;
    }

    const item = items[0];

    // 3. Get live status
    const { data: status, error: sErr } = await supabase
      .from('live_inventory_status')
      .select('*')
      .eq('inventory_batch_item_id', item.id)
      .maybeSingle();

    if (sErr) throw sErr;
    console.log("Live Inventory Status:", JSON.stringify(status, null, 2));

  } catch (err) {
    console.error("Trace failed:", err);
  }
}

trace();
