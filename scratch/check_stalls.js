require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
);

async function checkData() {
  console.log("Checking stalls...");
  const { data: stalls, error: stallErr } = await supabase.from('stalls').select('id, name, operator_id');
  if (stallErr) console.error("Stalls error:", stallErr);
  else console.log("Stalls:", stalls);
  
  // Kitchen users? Can't query users from anon key directly unless there's an RPC or view.
  // Wait, let's see if there is an RPC we can use, or if users are public (unlikely).
  // Let's check subscriptions if they are public? No, RLS restricts to operator or user.
  
}
checkData();
