import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function testAuthUser() {
  // Let's try signing up a test user
  const email = `test_audit_${Date.now()}@rollbowl.test`;
  const password = 'TestPassword123!';
  const { data: authData, error: authErr } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name: 'Audit Tester', phone: '9999999999' }
    }
  });

  if (authErr) {
    console.error('Auth error:', authErr.message);
    return;
  }

  const user = authData.user;
  console.log('Created auth user:', user?.id, user?.email);

  // Check if profile exists in users
  const { data: profile, error: profErr } = await supabase.from('users').select('*').eq('id', user?.id).maybeSingle();
  console.log('Profile in public.users:', profile, 'error:', profErr);
}

testAuthUser();
