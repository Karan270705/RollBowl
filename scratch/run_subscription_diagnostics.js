const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase URL or Key");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runDiagnostics() {
  console.log("=== ROLLBOWL MIGRATION 047 PRE-EXECUTION DIAGNOSTICS ===");

  try {
    // 1. Check subscriptions table access and duplicate active subscriptions
    const { data: subs, error: subErr } = await supabase
      .from('subscriptions')
      .select('id, user_id, status, created_at')
      .eq('status', 'active');

    if (subErr) {
      console.log("Note: Could not query subscriptions table directly (likely RLS):", subErr.message);
    } else {
      const activeByUser = {};
      subs.forEach(s => {
        activeByUser[s.user_id] = activeByUser[s.user_id] || [];
        activeByUser[s.user_id].push(s.id);
      });
      const dupActive = Object.entries(activeByUser).filter(([uid, ids]) => ids.length > 1);
      console.log("A. Duplicate Active Subscriptions:", dupActive.length === 0 ? "NONE (CLEAN)" : dupActive);
    }

    // 2. Check subscription_purchase_requests table access and duplicate pending requests
    const { data: reqs, error: reqErr } = await supabase
      .from('subscription_purchase_requests')
      .select('id, user_id, plan_id, status, expected_amount')
      .in('status', ['awaiting_proof', 'verification_pending']);

    if (reqErr) {
      console.log("Note: Could not query subscription_purchase_requests table directly (likely RLS):", reqErr.message);
    } else {
      const pendingByUser = {};
      reqs.forEach(r => {
        pendingByUser[r.user_id] = pendingByUser[r.user_id] || [];
        pendingByUser[r.user_id].push(r.id);
      });
      const dupPending = Object.entries(pendingByUser).filter(([uid, ids]) => ids.length > 1);
      console.log("B. Duplicate Pending Purchase Requests:", dupPending.length === 0 ? "NONE (CLEAN)" : dupPending);
      console.log("   Total Pending Requests currently:", reqs ? reqs.length : 0);
    }

    // 3. Check plans
    const { data: plans, error: planErr } = await supabase
      .from('subscription_plans')
      .select('id, name, price, is_active');

    if (planErr) {
      console.log("Note: Could not query subscription_plans:", planErr.message);
    } else {
      console.log("C. Active Subscription Plans found:", plans ? plans.length : 0);
      if (plans) {
        plans.forEach(p => console.log(`  - [${p.id}] ${p.name}: ₹${p.price} (active: ${p.is_active})`));
      }
    }

  } catch (err) {
    console.error("Diagnostic execution error:", err);
  }
}

runDiagnostics();
