const fs = require('fs');
const data = JSON.parse(fs.readFileSync('f:/RollBowl/scratch/schema_dump.json', 'utf8'));

const { schema, policies, rpcs } = data;

console.log("=== TABLE AUDIT ===");
const relevantTables = [
  'stalls', 'meals', 'menu_schedules', 'menu_schedule_items', 'orders', 'order_items', 
  'inventory_batches', 'inventory_batch_items', 'inventory_movements', 'subscriptions', 
  'subscription_purchase_requests', 'meal_histories', 'payment_settings'
];

for (const t of relevantTables) {
  const table = schema[t];
  if (!table) {
    console.log(`- ${t}: NOT FOUND`);
    continue;
  }
  
  const hasStallId = table.columns.some(c => c.includes('stall_id')) || table.addedColumns.some(c => c.includes('stall_id'));
  const hasOperatorId = table.columns.some(c => c.includes('operator_id')) || table.addedColumns.some(c => c.includes('operator_id'));
  
  console.log(`- ${t}: stall_id=${hasStallId}, operator_id=${hasOperatorId}`);
  if (!hasStallId && !hasOperatorId) {
    console.log(`  Columns: ${table.columns.join(' | ')}`);
    console.log(`  Added: ${table.addedColumns.join(' | ')}`);
  }
}

console.log("\n=== POLICY AUDIT ===");
for (const p of policies) {
  if (relevantTables.includes(p.table)) {
    console.log(`[${p.table}] ${p.name}:`);
    if (p.using) console.log(`  USING (${p.using})`);
    if (p.withCheck) console.log(`  WITH CHECK (${p.withCheck})`);
  }
}

console.log("\n=== RPC AUDIT ===");
const relevantRPCs = [
  'get_user_role', 'is_stall_operator', 'create_subscription_purchase_request', 
  'approve_subscription_purchase', 'purchase_subscription', 'place_order', 'accept_order',
  'release_subscription_reservation', 'reject_order_payment', 'verify_order_payment'
];
for (const r of rpcs) {
  if (relevantRPCs.includes(r)) {
    console.log(`- ${r}`);
  }
}
