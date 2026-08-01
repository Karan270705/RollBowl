import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in environment.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkCounts() {
  const { count: ordersCount, error: ordersErr } = await supabase
    .from('orders')
    .select('*', { count: 'exact', head: true });

  const { count: paymentRecordsCount, error: prErr } = await supabase
    .from('payment_records')
    .select('*', { count: 'exact', head: true });

  const { count: paymentProofsCount, error: ppErr } = await supabase
    .from('payment_proofs')
    .select('*', { count: 'exact', head: true });

  const { data: storageFiles, error: stErr } = await supabase
    .storage
    .from('orders')
    .list();

  console.log('--- DATABASE & STORAGE COUNTS ---');
  console.log('1. orders_count:', ordersCount ?? 0);
  console.log('2. payment_records_count:', paymentRecordsCount ?? 0);
  console.log('3. payment_proofs_count:', paymentProofsCount ?? 0);
  console.log('4. storage_objects_count:', storageFiles ? storageFiles.length : 0);
}

checkCounts();

