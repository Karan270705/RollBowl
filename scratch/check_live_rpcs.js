import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function inspect() {
  console.log('--- 1. Testing table columns for subscription_purchase_requests ---');
  const { data: subReqs, error: subReqsErr } = await supabase
    .from('subscription_purchase_requests')
    .select('*')
    .limit(1);
  console.log('subscription_purchase_requests select error:', subReqsErr);
  console.log('subscription_purchase_requests row sample keys:', subReqs && subReqs.length > 0 ? Object.keys(subReqs[0]) : 'No rows returned');

  console.log('\n--- 2. Testing RPC signatures via PostgREST error reflection ---');
  const rpcs = [
    'create_subscription_purchase_request',
    'submit_subscription_payment_proof',
    'approve_subscription_purchase',
    'reject_subscription_purchase'
  ];

  for (const rpcName of rpcs) {
    const { data, error } = await supabase.rpc(rpcName, {});
    console.log(`RPC [${rpcName}] call with empty args -> Error:`, error ? `${error.code}: ${error.message} (${error.details})` : 'Success');
  }
}

inspect().catch(console.error);
