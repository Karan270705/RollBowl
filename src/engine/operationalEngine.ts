import { supabase } from '@/src/lib/supabase';
import { MenuSchedule } from '@/src/services/menu';
import { KitchenHoliday } from '@/src/types/models';
import { AppConfig } from '@/src/constants/config';
import { parseTimeToDateIST } from '@/src/utils/operationalDate';

export type OperationalStatus = 'HOLIDAY' | 'MENU_COMING_SOON' | 'MENU_SCHEDULED' | 'ORDERING_OPEN' | 'ORDERING_CLOSED' | 'PICKUP_ACTIVE';

export interface OperationalFacts {
  operationalDate: string;
  status: OperationalStatus;
  isHoliday: boolean;
  holidayDetails: KitchenHoliday | null;
  hasPublishedMenu: boolean;
  activeMenu: MenuSchedule | null;
  canPlaceOrders: boolean;
  pickupWindowOpen: boolean;
  isPrepTime: boolean;
  orderCutoff: string;
  orderingStart?: string;
  orderingEnd?: string;
  deliveryStart?: string;
  deliveryEnd?: string;
}

/**
 * Helper to parse a time string "HH:mm" and set it on a target date string in IST.
 */
function setTimeOnDateIST(dateStr: string, timeStr: string): Date {
  return parseTimeToDateIST(dateStr, timeStr);
}

/**
 * The Central Factual Engine
 * Resolves the operational state purely based on business timings and the resolved order date.
 */
export async function resolveOperationalFacts(stallId: string, resolvedOperationalDate: string): Promise<OperationalFacts> {
  const operationalDate = resolvedOperationalDate;

  console.log('[INSTRUMENTATION: resolveOperationalFacts - INPUT]', JSON.stringify({
    stallId,
    resolvedOperationalDate,
    operationalDate,
    timestamp: new Date().toISOString(),
  }, null, 2));

  // 1. Holiday Check
  const { data: holidayData } = await supabase
    .from('kitchen_holidays')
    .select('*')
    .eq('holiday_date', operationalDate)
    .eq('is_active', true)
    .maybeSingle();

  if (holidayData) {
    return {
      operationalDate,
      status: 'HOLIDAY',
      isHoliday: true,
      holidayDetails: holidayData as KitchenHoliday,
      hasPublishedMenu: false,
      activeMenu: null,
      canPlaceOrders: false,
      pickupWindowOpen: false,
      isPrepTime: false,
      orderCutoff: '',
    };
  }

  // 2. Menu Check
  console.log('[INSTRUMENTATION: resolveOperationalFacts - SUPABASE QUERY]', JSON.stringify({
    table: 'menu_schedules',
    filter_menu_date: operationalDate,
    filter_is_published: true,
    stallId,
  }, null, 2));

  const { data: menuData, error: menuDataError } = await supabase
    .from('menu_schedules')
    .select('*')
    .eq('menu_date', operationalDate)
    .eq('is_published', true)
    .maybeSingle();

  console.log('[INSTRUMENTATION: resolveOperationalFacts - SUPABASE RESULT]', JSON.stringify({
    operationalDate,
    menuData: menuData || null,
    error: menuDataError || null,
  }, null, 2));

  if (!menuData) {
    return {
      operationalDate,
      status: 'MENU_COMING_SOON',
      isHoliday: false,
      holidayDetails: null,
      hasPublishedMenu: false,
      activeMenu: null,
      canPlaceOrders: false,
      pickupWindowOpen: false,
      isPrepTime: false,
      orderCutoff: '',
    };
  }

  // 3. Timing Checks using explicit DB timestamps
  const nowMs = Date.now();
  
  const menu = menuData as MenuSchedule;
  const visibleFromMs = new Date(menu.visible_from).getTime();
  const orderCutoffMs = new Date(menu.order_cutoff).getTime();
  const deliveryStartMs = new Date(menu.delivery_start_at).getTime();
  const deliveryEndMs = new Date(menu.delivery_end_at).getTime();

  let status: OperationalStatus = 'ORDERING_CLOSED';
  
  if (nowMs < visibleFromMs) {
    status = 'MENU_SCHEDULED';
  } else if (nowMs >= visibleFromMs && nowMs <= orderCutoffMs) {
    status = 'ORDERING_OPEN';
  } else if (nowMs >= deliveryStartMs && nowMs <= deliveryEndMs) {
    status = 'PICKUP_ACTIVE';
  } else {
    // If it's between order_cutoff and delivery_start_at, or after delivery_end_at
    status = 'ORDERING_CLOSED';
  }

  const isBeforeOrAtCutoff = nowMs <= orderCutoffMs;
  const canPlaceOrders = status === 'ORDERING_OPEN';
  const pickupWindowOpen = status === 'PICKUP_ACTIVE';
  const isPrepTime = nowMs > orderCutoffMs && nowMs < deliveryStartMs;

  if (status !== 'ORDERING_OPEN') {
    console.log('[ORDER STATUS INFO] After cutoff or closed', {
      now: new Date(nowMs).toISOString(),
      cutoff: new Date(orderCutoffMs).toISOString(),
      status,
    });
  }

  console.log('[DevLog] resolveOperationalFacts', {
    operationalDate,
    status,
    isBeforeOrAtCutoff,
    isPrepTime,
    canPlaceOrders,
  });

  return {
    operationalDate,
    status,
    isHoliday: false,
    holidayDetails: null,
    hasPublishedMenu: true,
    activeMenu: menu,
    canPlaceOrders,
    pickupWindowOpen,
    isPrepTime,
    orderCutoff: menu.order_cutoff,
    orderingStart: menu.visible_from,
    orderingEnd: menu.order_cutoff,
    deliveryStart: menu.delivery_start_at,
    deliveryEnd: menu.delivery_end_at,
  };
}
