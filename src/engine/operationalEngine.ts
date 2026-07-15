import { supabase } from '@/src/lib/supabase';
import { MenuSchedule } from '@/src/services/menu';
import { KitchenHoliday } from '@/src/types/models';
import { AppConfig } from '@/src/constants/config';

export type OperationalStatus = 'HOLIDAY' | 'MENU_COMING_SOON' | 'ORDERING_OPEN' | 'ORDERING_CLOSED' | 'PICKUP_ACTIVE';

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
}

/**
 * Helper to parse a time string "HH:mm" and set it on a target date object.
 */
function setTimeOnDate(date: Date | string, timeStr: string): Date {
  const dateStr = typeof date === 'string' ? date : date.toISOString().split('T')[0];
  return parseTimeToDateIST(dateStr, timeStr);
}

import { getCurrentISTTime, parseTimeToDateIST } from '@/src/utils/operationalDate';

/**
 * The Central Factual Engine
 * Resolves the operational state purely based on business timings.
 */
export async function resolveOperationalFacts(stallId: string, resolvedOperationalDate: string): Promise<OperationalFacts> {
  const operationalDate = resolvedOperationalDate;
  
  const now = getCurrentISTTime();

  // 2. State Evaluation: Holiday Check
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
    };
  }

  // 3. State Evaluation: Menu Check
  const { data: menuData } = await supabase
    .from('menu_schedules')
    .select('*')
    .eq('menu_date', operationalDate)
    .eq('is_published', true)
    .maybeSingle();

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
    };
  }

  // 4. State Evaluation: Timing Checks
  const orderCutoff = setTimeOnDate(operationalDate, AppConfig.BUSINESS.ORDER_CUTOFF_TIME);
  const pickupStart = setTimeOnDate(operationalDate, AppConfig.BUSINESS.PICKUP_START_TIME);
  const pickupEndForOp = setTimeOnDate(operationalDate, AppConfig.BUSINESS.PICKUP_END_TIME);

  const nowMs = Date.now();
  const orderCutoffMs = orderCutoff.getTime();
  const pickupStartMs = pickupStart.getTime();
  const pickupEndMs = pickupEndForOp.getTime();

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
    console.error('[ORDER STATUS BUG] Before cutoff but status is closed', {
      now: new Date(nowMs).toISOString(),
      cutoff: new Date(orderCutoffMs).toISOString(),
      status,
    });
  }

  console.log('[ORDER COMPARISON]', {
    nowISO: new Date(nowMs).toISOString(),
    cutoffISO: new Date(orderCutoffMs).toISOString(),
    nowMs,
    orderCutoffMs,
    differenceMinutes: (orderCutoffMs - nowMs) / 60000,
    isBeforeOrAtCutoff,
    status,
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
  };
}
