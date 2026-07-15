import { supabase } from '@/src/lib/supabase';
import { AppConfig } from '@/src/constants/config';

export async function getPrimaryStallId(): Promise<string> {
  const { data, error } = await supabase
    .from('stalls')
    .select('id')
    .eq('is_active', true)
    .limit(1)
    .single();
  if (error || !data) throw new Error('No active stall found.');
  return data.id;
}

// Helper to get today's date string in IST
export function getTodayISTDateString(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

// Helper to get current Date object in IST
export function getCurrentISTTime(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
}

export function parseTimeToDateIST(
  dateString: string,
  timeString: string
): Date {
  const normalizedTime =
    timeString.length === 5
      ? `${timeString}:00`
      : timeString;

  const result = new Date(
    `${dateString}T${normalizedTime}+05:30`
  );

  if (Number.isNaN(result.getTime())) {
    throw new Error(
      `Invalid IST date/time: ${dateString} ${timeString}`
    );
  }

  return result;
}

export interface OperationalContextResult {
  calendarDate: string;
  resolvedOperationalDate: string;
  reason: string;
  activeBatchId: string | null;
  activeBatchDate: string | null;
  windowStart: string | null;
  windowEnd: string | null;
  phase: string;
  isResolving: boolean;
}

export const DEFAULT_RESOLVING_CONTEXT: OperationalContextResult = {
  calendarDate: getTodayISTDateString(),
  resolvedOperationalDate: getTodayISTDateString(),
  reason: 'Resolving',
  activeBatchId: null,
  activeBatchDate: null,
  windowStart: null,
  windowEnd: null,
  phase: 'RESOLVING',
  isResolving: true,
};

export async function resolveSharedOperationalDate(stallId?: string): Promise<OperationalContextResult> {
  const calendarDate = getTodayISTDateString();
  const currentIST = getCurrentISTTime();
  
  const defaultResult = (
    resolvedDate: string,
    reason: string,
    phase: string,
    activeBatchId: string | null = null,
    activeBatchDate: string | null = null,
    windowStart: string | null = null,
    windowEnd: string | null = null
  ): OperationalContextResult => {
    const result = {
      calendarDate,
      resolvedOperationalDate: resolvedDate,
      reason,
      activeBatchId,
      activeBatchDate,
      windowStart,
      windowEnd,
      phase: 'RESOLVING',
      isResolving: false,
    };
    console.log(JSON.stringify(result, null, 2));
    return result;
  };

  if (!stallId) {
    return defaultResult(calendarDate, 'No stallId provided', 'ORDERING_CLOSED');
  }

  // 1. Get today's batches
  const { data: todayBatches } = await supabase
    .from('inventory_batches')
    .select('id, inventory_date, window_start, window_end, status')
    .eq('stall_id', stallId)
    .eq('inventory_date', calendarDate)
    .neq('status', 'cancelled');

  if (todayBatches && todayBatches.length > 0) {
    // 2. Check for active batch
    const activeBatch = todayBatches.find(b => b.status === 'active');
    if (activeBatch) {
      return defaultResult(calendarDate, 'Active batch found for today', 'PICKUP_ACTIVE', activeBatch.id, activeBatch.inventory_date, activeBatch.window_start, activeBatch.window_end);
    }
    
    // 3. Check for non-expired batches
    const nonExpiredBatch = todayBatches.find(b => {
      const endTime = parseTimeToDateIST(b.inventory_date, b.window_end);
      endTime.setMinutes(endTime.getMinutes() + 60); // 60 mins grace period
      return Date.now() <= endTime.getTime();
    });

    if (nonExpiredBatch) {
      return defaultResult(calendarDate, 'Non-expired batch found for today', 'ORDERING_OPEN', nonExpiredBatch.id, nonExpiredBatch.inventory_date, nonExpiredBatch.window_start, nonExpiredBatch.window_end);
    }
  }

  // 4. Check today's published menu
  const { data: todayMenu } = await supabase
    .from('menu_schedules')
    .select('id, is_published')
    .eq('stall_id', stallId)
    .eq('menu_date', calendarDate)
    .eq('is_published', true)
    .maybeSingle();

  if (todayMenu) {
    const menuEndTime = parseTimeToDateIST(calendarDate, '14:00:00'); // default 14:00
    menuEndTime.setMinutes(menuEndTime.getMinutes() + 60);
    if (Date.now() <= menuEndTime.getTime()) {
      return defaultResult(calendarDate, 'Published menu found for today and not expired', 'ORDERING_OPEN');
    }
  }

  // 5. Check next calendar date with scheduled menus or active batches
  const { data: upcomingBatches } = await supabase
    .from('inventory_batches')
    .select('id, inventory_date')
    .eq('stall_id', stallId)
    .gt('inventory_date', calendarDate)
    .neq('status', 'cancelled')
    .order('inventory_date', { ascending: true })
    .limit(1);

  const { data: upcomingMenus } = await supabase
    .from('menu_schedules')
    .select('id, menu_date')
    .eq('stall_id', stallId)
    .eq('is_published', true)
    .gt('menu_date', calendarDate)
    .order('menu_date', { ascending: true })
    .limit(1);
    
  let nextDate = null;
  if (upcomingBatches && upcomingBatches.length > 0) nextDate = upcomingBatches[0].inventory_date;
  if (upcomingMenus && upcomingMenus.length > 0) {
    const menuDate = upcomingMenus[0].menu_date;
    if (!nextDate || menuDate < nextDate) nextDate = menuDate;
  }
  
  if (nextDate) {
    return defaultResult(nextDate, 'Next scheduled menu/batch date found', 'RESOLVING');
  }

  // 6. Fallback logic: roll over to tomorrow if past fallback cutoff
  const fallbackCutoff = parseTimeToDateIST(calendarDate, AppConfig.BUSINESS.ORDER_CUTOFF_TIME);
  if (Date.now() > fallbackCutoff.getTime()) {
    const tomorrow = new Date(Date.now());
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    
    return defaultResult(tomorrowStr, 'Past cutoff fallback', 'RESOLVING');
  }

  return defaultResult(calendarDate, 'Before cutoff fallback', 'RESOLVING');
}
