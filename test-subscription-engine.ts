import { supabase } from './src/lib/supabase';
import { v4 as uuidv4 } from 'uuid';

const stallId = '57a11000-0000-0000-0000-000000000001';

async function runTests() {
  console.log('🧪 Starting Subscription Engine RPC Tests...');

  // Helper to run the deterministic RPC
  const calcExpiry = async (startDate: string, durationDays: number) => {
    const { data, error } = await supabase.rpc('calculate_subscription_expiry', {
      p_start_date: startDate,
      p_duration_days: durationDays,
      p_stall_id: stallId
    });
    if (error) throw error;
    return data[0] as { new_end_date: string; extended_days: number };
  };

  // Helper to create a temp holiday
  const createTempHoliday = async (date: string, active: boolean = true) => {
    const id = uuidv4();
    const { error } = await supabase.from('kitchen_holidays').insert({
      id,
      stall_id: stallId,
      holiday_date: date,
      title: 'Test Holiday ' + date,
      is_active: active
    });
    if (error) throw error;
    return id;
  };

  // Helper to delete temp holidays
  const deleteTempHolidays = async (ids: string[]) => {
    if (ids.length === 0) return;
    await supabase.from('kitchen_holidays').delete().in('id', ids);
  };

  let tempHolidays: string[] = [];

  try {
    console.log('\n--- Test 1: Purchase before holidays exist ---');
    let res = await calcExpiry('2026-08-01', 30);
    console.log(`Start: 2026-08-01, Duration: 30`);
    console.log(`Expected End: 2026-08-30, Actual: ${res.new_end_date}`);
    console.log(`Expected Extensions: 0, Actual: ${res.extended_days}`);

    console.log('\n--- Test 2: Purchase after holidays already exist ---');
    tempHolidays.push(await createTempHoliday('2026-08-05'));
    tempHolidays.push(await createTempHoliday('2026-08-10'));
    res = await calcExpiry('2026-08-01', 30);
    console.log(`Added holidays on 08-05 and 08-10`);
    console.log(`Expected End: 2026-09-01, Actual: ${res.new_end_date}`);
    console.log(`Expected Extensions: 2, Actual: ${res.extended_days}`);

    console.log('\n--- Test 3: Consecutive holidays ---');
    tempHolidays.push(await createTempHoliday('2026-08-11'));
    tempHolidays.push(await createTempHoliday('2026-08-12'));
    res = await calcExpiry('2026-08-01', 30);
    console.log(`Added consecutive holidays on 08-11 and 08-12`);
    console.log(`Expected End: 2026-09-03, Actual: ${res.new_end_date}`);
    console.log(`Expected Extensions: 4, Actual: ${res.extended_days}`);

    console.log('\n--- Test 4: Holiday on final day (Iterative Expansion) ---');
    // If current end is 09-03, adding a holiday ON 09-03 should push it to 09-04
    tempHolidays.push(await createTempHoliday('2026-09-03'));
    res = await calcExpiry('2026-08-01', 30);
    console.log(`Added holiday exactly on the final day (09-03)`);
    console.log(`Expected End: 2026-09-04, Actual: ${res.new_end_date}`);
    console.log(`Expected Extensions: 5, Actual: ${res.extended_days}`);

    console.log('\n--- Test 5: Infinite loop prevention / Multiple extensions ---');
    // Pushing to 09-04. Let's add a holiday on 09-04 too!
    tempHolidays.push(await createTempHoliday('2026-09-04'));
    res = await calcExpiry('2026-08-01', 30);
    console.log(`Added holiday on the NEW final day (09-04) to test loop`);
    console.log(`Expected End: 2026-09-05, Actual: ${res.new_end_date}`);
    console.log(`Expected Extensions: 6, Actual: ${res.extended_days}`);

    console.log('\n--- Test 6: Inactive holidays are ignored ---');
    tempHolidays.push(await createTempHoliday('2026-08-20', false));
    res = await calcExpiry('2026-08-01', 30);
    console.log(`Added inactive holiday on 08-20`);
    console.log(`Expected End: 2026-09-05, Actual: ${res.new_end_date}`);
    console.log(`Expected Extensions: 6, Actual: ${res.extended_days}`);

    console.log('\n✅ All tests executed. If actuals match expected, the algorithm is flawless.');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    console.log('\n🧹 Cleaning up test holidays...');
    await deleteTempHolidays(tempHolidays);
    console.log('Cleanup complete.');
  }
}

runTests();
