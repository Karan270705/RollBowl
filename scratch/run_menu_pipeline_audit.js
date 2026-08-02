const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://xhyojkqsgpvjctmdqxzq.supabase.co';
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_DHsHOnpcix8PRVuIt3BqIA_A1uq-YQG';

const supabase = createClient(supabaseUrl, supabaseKey);

function getTodayISTDateString() {
  const istDate = new Date(Date.now() + 19800000); // UTC+05:30 offset in ms
  return istDate.toISOString().split('T')[0];
}

function getTomorrowISTDateString(baseDateStr) {
  if (baseDateStr) {
    const [year, month, day] = baseDateStr.split('-').map(Number);
    const d = new Date(Date.UTC(year, month - 1, day + 1));
    return d.toISOString().split('T')[0];
  }
  const tomorrowIst = new Date(Date.now() + 19800000 + 86400000);
  return tomorrowIst.toISOString().split('T')[0];
}

function getCurrentISTTime() {
  return new Date();
}

function parseTimeToDateIST(dateStr, timeStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const timeParts = timeStr.split(':').map(Number);
  const hours = timeParts[0] || 0;
  const minutes = timeParts[1] || 0;
  const seconds = timeParts[2] || 0;
  const utcMs = Date.UTC(year, month - 1, day, hours, minutes, seconds) - 19800000;
  return new Date(utcMs);
}

async function runAudit() {
  console.log('==================================================================');
  console.log('🧪 STARTING CUSTOMER MENU PIPELINE AUDIT');
  console.log('==================================================================');

  // 0. Primary Stall
  const { data: stall, error: stallError } = await supabase
    .from('stalls')
    .select('id, name')
    .eq('is_active', true)
    .limit(1)
    .single();

  if (stallError || !stall) {
    console.error('Failed to resolve primary stall:', stallError);
    return;
  }
  const stallId = stall.id;
  console.log('0️⃣ [PRIMARY STALL]', { id: stall.id, name: stall.name });

  // 1. List all menu schedules in Supabase for this stall
  const { data: allSchedules } = await supabase
    .from('menu_schedules')
    .select('*')
    .eq('stall_id', stallId)
    .order('menu_date', { ascending: true });

  console.log('\n1️⃣ [ALL MENU SCHEDULES IN SUPABASE]');
  console.table(allSchedules);

  // 2. Operational Context resolution step-by-step
  const calendarDate = getTodayISTDateString();
  const currentIST = getCurrentISTTime();
  const tomorrowStr = getTomorrowISTDateString(calendarDate);

  const rolloverTimeStr = '15:00';
  const rolloverCutoff = parseTimeToDateIST(calendarDate, rolloverTimeStr);
  const beforeOrAfterRollover = currentIST <= rolloverCutoff ? 'BEFORE_ROLLOVER' : 'AFTER_ROLLOVER';

  console.log('\n2️⃣ [STEP 1: OPERATIONAL CONTEXT COMPUTED DATES/TIMES]');
  console.log(JSON.stringify({
    nowUTC: new Date().toISOString(),
    nowIST_String: new Date(Date.now() + 19800000).toISOString().replace('Z', '+05:30'),
    calendarDate,
    tomorrowStr,
    rolloverTimeStr,
    rolloverCutoff_UTC: rolloverCutoff.toISOString(),
    beforeOrAfterRollover,
  }, null, 2));

  // Query in resolveSharedOperationalDate
  console.log('\n3️⃣ [STEP 2: SUPABASE QUERY FOR UPCOMING PUBLISHED MENUS (resolveSharedOperationalDate)]');
  console.log(JSON.stringify({
    table: 'menu_schedules',
    filter_stall_id: stallId,
    filter_is_published: true,
    filter_gt_menu_date: calendarDate,
  }, null, 2));

  const { data: upcomingMenus, error: menuQueryError } = await supabase
    .from('menu_schedules')
    .select('id, menu_date, is_published, visible_from, order_cutoff')
    .eq('is_published', true)
    .eq('stall_id', stallId)
    .gt('menu_date', calendarDate)
    .order('menu_date', { ascending: true })
    .limit(1);

  let nextValidServiceDate = null;
  if (upcomingMenus && upcomingMenus.length > 0) {
    nextValidServiceDate = upcomingMenus[0].menu_date;
  }
  const preparationDate = nextValidServiceDate || tomorrowStr;

  let resolvedOperationalDate = null;
  let reasonText = '';
  if (beforeOrAfterRollover === 'BEFORE_ROLLOVER') {
    resolvedOperationalDate = calendarDate;
    reasonText = 'Before rollover cutoff';
  } else if (nextValidServiceDate) {
    resolvedOperationalDate = nextValidServiceDate;
    reasonText = 'After rollover: next valid service date found';
  } else {
    resolvedOperationalDate = null;
    reasonText = 'After rollover: no active or upcoming service date';
  }

  console.log(JSON.stringify({
    upcomingMenusResult: upcomingMenus || [],
    error: menuQueryError || null,
    nextValidServiceDate,
    preparationDate,
    resolvedOperationalDate,
    reasonText,
  }, null, 2));

  // 4. What is targetDate in useOperationalWindow?
  const targetDate = resolvedOperationalDate || preparationDate || calendarDate;
  console.log('\n4️⃣ [STEP 3: TARGET DATE COMPUTED FOR useOperationalWindow]');
  console.log(JSON.stringify({
    resolvedOperationalDate,
    preparationDate,
    calendarDate,
    finalTargetDate: targetDate,
  }, null, 2));

  // 5. Query in resolveOperationalFacts
  console.log('\n5️⃣ [STEP 4: SUPABASE MENU QUERY IN resolveOperationalFacts]');
  console.log(JSON.stringify({
    table: 'menu_schedules',
    filter_menu_date: targetDate,
    filter_is_published: true,
    stallId,
  }, null, 2));

  const { data: menuData, error: menuDataError } = await supabase
    .from('menu_schedules')
    .select('*')
    .eq('menu_date', targetDate)
    .eq('is_published', true)
    .maybeSingle();

  console.log(JSON.stringify({
    targetDate,
    foundMenuData: menuData || null,
    error: menuDataError || null,
  }, null, 2));

  // 6. Timing checks in resolveOperationalFacts
  let status = 'ORDERING_CLOSED';
  let canPlaceOrders = false;
  let pickupWindowOpen = false;
  if (menuData) {
    const orderCutoffDate = parseTimeToDateIST(targetDate, '10:00');
    const pickupStartDate = parseTimeToDateIST(targetDate, '12:00');
    const pickupEndDate = parseTimeToDateIST(targetDate, '14:00');

    const nowMs = Date.now();
    const orderCutoffMs = orderCutoffDate.getTime();
    const pickupStartMs = pickupStartDate.getTime();
    const pickupEndMs = pickupEndDate.getTime();

    const isBeforeOrAtCutoff = nowMs <= orderCutoffMs;
    const isPrepTime = nowMs > orderCutoffMs && nowMs < pickupStartMs;
    pickupWindowOpen = nowMs >= pickupStartMs && nowMs <= pickupEndMs;

    if (isBeforeOrAtCutoff) {
      status = 'ORDERING_OPEN';
    } else if (pickupWindowOpen) {
      status = 'PICKUP_ACTIVE';
    }
    canPlaceOrders = isBeforeOrAtCutoff;

    console.log('\n6️⃣ [STEP 5: TIMING CHECKS COMPUTED IN resolveOperationalFacts]');
    console.log(JSON.stringify({
      targetDate,
      nowUTC: new Date(nowMs).toISOString(),
      orderCutoffDate: orderCutoffDate.toISOString(),
      pickupStartDate: pickupStartDate.toISOString(),
      pickupEndDate: pickupEndDate.toISOString(),
      isBeforeOrAtCutoff,
      isPrepTime,
      pickupWindowOpen,
      computedStatus: status,
      canPlaceOrders,
    }, null, 2));
  }

  console.log('==================================================================');
  console.log('🏁 AUDIT COMPLETE');
  console.log('==================================================================');
}

runAudit().catch(console.error);
