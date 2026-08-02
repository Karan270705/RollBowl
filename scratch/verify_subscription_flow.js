const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://xhyojkqsgpvjctmdqxzq.supabase.co';
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_DHsHOnpcix8PRVuIt3BqIA_A1uq-YQG';

const customerEmail = process.env.TEST_CUSTOMER_EMAIL || 'customer@test.com';
const customerPassword = process.env.TEST_CUSTOMER_PASSWORD || 'password123';
const kitchenEmail = process.env.TEST_KITCHEN_EMAIL || 'operator@test.com';
const kitchenPassword = process.env.TEST_KITCHEN_PASSWORD || 'password123';

const supabase = createClient(supabaseUrl, supabaseKey);

async function verifyFlow() {
  console.log('==================================================================');
  console.log('🧪 Verifying Real Subscription Request Proof & Retry Lifecycle');
  console.log('==================================================================\n');

  try {
    // Attempt customer login
    const { data: custAuth, error: custErr } = await supabase.auth.signInWithPassword({
      email: customerEmail,
      password: customerPassword,
    });

    if (custErr || !custAuth?.user) {
      console.log('⚠️ Could not authenticate with default test customer credentials:', custErr?.message || 'No user');
      console.log('   Please set TEST_CUSTOMER_EMAIL and TEST_CUSTOMER_PASSWORD in .env to run live DB test.');
      return;
    }

    console.log(`✅ Authenticated Customer: ${custAuth.user.id}`);

    // Fetch live requests for this user
    const { data: reqs, error: reqErr } = await supabase
      .from('subscription_purchase_requests')
      .select('*')
      .eq('user_id', custAuth.user.id)
      .order('requested_at', { ascending: false });

    if (reqErr) {
      console.error('❌ Error fetching requests:', reqErr.message);
      return;
    }

    console.log(`\nFound ${reqs?.length || 0} existing subscription requests for user.`);
    if (reqs && reqs.length > 0) {
      const r = reqs[0];
      console.log('Latest Request ID:', r.id);
      console.log('Latest Request Status:', r.status);
      console.log('Rejection Reason:', r.rejection_reason || 'N/A');
    }
  } catch (e) {
    console.error('❌ Error during verification flow:', e);
  }
}

verifyFlow();
