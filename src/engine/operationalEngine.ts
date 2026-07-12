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
  const target = new Date(date);
  const [hours, minutes] = timeStr.split(':').map(Number);
  target.setHours(hours, minutes, 0, 0);
  return target;
}

/**
 * The Central Factual Engine
 * Resolves the operational state purely based on business timings.
 */
export async function resolveOperationalFacts(): Promise<OperationalFacts> {
  const now = new Date();
  
  // 1. The Operational Shift
  const pickupEnd = setTimeOnDate(now, AppConfig.BUSINESS.PICKUP_END_TIME);
  const operationalDateObj = new Date(now);
  
  if (now > pickupEnd) {
    operationalDateObj.setDate(operationalDateObj.getDate() + 1);
  }
  
  const operationalDate = operationalDateObj.toISOString().split('T')[0];

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

  const canPlaceOrders = now <= orderCutoff;
  const isPrepTime = now > orderCutoff && now < pickupStart;
  const pickupWindowOpen = now >= pickupStart && now <= pickupEndForOp;

  let status: OperationalStatus = 'ORDERING_CLOSED';
  if (canPlaceOrders) {
    status = 'ORDERING_OPEN';
  } else if (pickupWindowOpen) {
    status = 'PICKUP_ACTIVE';
  }

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
