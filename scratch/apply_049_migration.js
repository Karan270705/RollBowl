const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://xhyojkqsgpvjctmdqxzq.supabase.co';
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_DHsHOnpcix8PRVuIt3BqIA_A1uq-YQG';

const kitchenEmail = process.env.TEST_KITCHEN_EMAIL || 'operator@test.com';
const kitchenPassword = process.env.TEST_KITCHEN_PASSWORD || 'password123';

const supabase = createClient(supabaseUrl, supabaseKey);

function getPreviousCalendarDayStr(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1, day - 1));
  return d.toISOString().split('T')[0];
}

async function applyMigration() {
  console.log('🔄 Applying Migration 049 (Aligning historical menu_schedules with 15:00 IST rollover)...');

  // 0. Sign in as operator to satisfy RLS for UPDATE
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: kitchenEmail,
    password: kitchenPassword,
  });

  if (authErr || !authData?.user) {
    console.error('❌ Login failed for kitchen operator:', authErr?.message || 'No user');
    return;
  }
  console.log('✅ Signed in as operator:', authData.user.email);

  // 1. Fetch all published menu schedules
  const { data: schedules, error: selectError } = await supabase
    .from('menu_schedules')
    .select('id, menu_date, is_published, visible_from, order_cutoff')
    .eq('is_published', true);

  if (selectError) {
    console.error('Failed to select menu_schedules:', selectError);
    return;
  }

  let updatedCount = 0;
  for (const schedule of schedules) {
    const prevDay = getPreviousCalendarDayStr(schedule.menu_date);
    // 15:00:00+05:30 in UTC is 09:30:00.000Z
    const newVisibleFrom = `${prevDay}T09:30:00.000Z`;
    // 10:00:00+05:30 in UTC is 04:30:00.000Z
    const newOrderCutoff = `${schedule.menu_date}T04:30:00.000Z`;

    if (schedule.visible_from !== newVisibleFrom || schedule.order_cutoff !== newOrderCutoff) {
      const { error: updateError } = await supabase
        .from('menu_schedules')
        .update({
          visible_from: newVisibleFrom,
          order_cutoff: newOrderCutoff,
        })
        .eq('id', schedule.id);

      if (updateError) {
        console.error(`Failed to update schedule ${schedule.id} (${schedule.menu_date}):`, updateError.message);
      } else {
        updatedCount++;
        console.log(`✅ Updated schedule ${schedule.menu_date} -> visible_from: ${newVisibleFrom}, order_cutoff: ${newOrderCutoff}`);
      }
    }
  }

  console.log(`\n🎉 Migration 049 complete! Updated ${updatedCount} historical rows.`);

  // 2. Verify all rows in Supabase
  const { data: verifiedSchedules } = await supabase
    .from('menu_schedules')
    .select('id, menu_date, is_published, visible_from, order_cutoff')
    .eq('is_published', true)
    .order('menu_date', { ascending: true });

  console.log('\n📊 VERIFICATION: Aligned Published menu_schedules in Supabase:');
  console.table(verifiedSchedules);
}

applyMigration().catch(console.error);
