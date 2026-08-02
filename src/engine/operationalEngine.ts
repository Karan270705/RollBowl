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

  // 3. Timing Checks using epoch milliseconds in IST
  const orderCutoffDate = setTimeOnDateIST(operationalDate, AppConfig.BUSINESS.ORDER_CUTOFF_TIME);
  const pickupStartDate = setTimeOnDateIST(operationalDate, AppConfig.BUSINESS.PICKUP_START_TIME);
  const pickupEndDate = setTimeOnDateIST(operationalDate, AppConfig.BUSINESS.PICKUP_END_TIME);

  const nowMs = Date.now();
  const visibleFromMs = (menuData as any).visible_from ? new Date((menuData as any).visible_from).getTime() : 0;

  if (Number.isFinite(visibleFromMs) && nowMs < visibleFromMs) {
    return {
      operationalDate,
      status: 'MENU_SCHEDULED',
      isHoliday: false,
      holidayDetails: null,
      hasPublishedMenu: false,
      activeMenu: menuData as MenuSchedule,
      canPlaceOrders: false,
      pickupWindowOpen: false,
      isPrepTime: false,
      orderCutoff: (menuData as any).order_cutoff || '',
    };
  }

  const orderCutoffMs = orderCutoffDate.getTime();
  const pickupStartMs = pickupStartDate.getTime();
  const pickupEndMs = pickupEndDate.getTime();

  const isBeforeOrAtCutoff = Number.isFinite(orderCutoffMs) && nowMs <= orderCutoffMs;
  const isPrepTime = Number.isFinite(orderCutoffMs) && Number.isFinite(pickupStartMs) && nowMs > orderCutoffMs && nowMs < pickupStartMs;
  const pickupWindowOpen = Number.isFinite(pickupStartMs) && Number.isFinite(pickupEndMs) && nowMs >= pickupStartMs && nowMs <= pickupEndMs;

  let status: OperationalStatus = 'ORDERING_CLOSED';
  if (isBeforeOrAtCutoff) {
    status = 'ORDERING_OPEN';
  } else if (pickupWindowOpen) {
    status = 'PICKUP_ACTIVE';
  }

  const canPlaceOrders = isBeforeOrAtCutoff;

  if (!isBeforeOrAtCutoff && status !== 'ORDERING_OPEN') {
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
    activeMenu: menuData as MenuSchedule,
    canPlaceOrders,
    pickupWindowOpen,
    isPrepTime,
    orderCutoff: orderCutoffDate.toISOString(),
  };
}
