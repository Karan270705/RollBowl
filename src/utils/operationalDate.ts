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

// Helper to get today's date string in IST safely across all JS engines (e.g. Hermes)
export function getTodayISTDateString(): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  if (!year || !month || !day) {
    throw new Error('Unable to resolve current IST date');
  }

  return `${year}-${month}-${day}`;
}

// Helper to get tomorrow's date string in IST without toLocaleString
export function getTomorrowISTDateString(baseDateStr?: string): string {
  if (baseDateStr) {
    const [year, month, day] = baseDateStr.split('-').map(Number);
    const d = new Date(Date.UTC(year, month - 1, day + 1));
    return d.toISOString().split('T')[0];
  }
  const tomorrowIst = new Date(Date.now() + 19800000 + 86400000);
  return tomorrowIst.toISOString().split('T')[0];
}

// Helper to get current Date object in standard epoch milliseconds
export function getCurrentISTTime(): Date {
  return new Date();
}

// Helper to construct a UTC Date object representing IST time without locale-string parsing
export function parseTimeToDateIST(dateStr: string, timeStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  const timeParts = timeStr.split(':').map(Number);
  const hours = timeParts[0] || 0;
  const minutes = timeParts[1] || 0;
  const seconds = timeParts[2] || 0;
  const utcMs = Date.UTC(year, month - 1, day, hours, minutes, seconds) - 19800000;
  return new Date(utcMs);
}

export interface OperationalContextResult {
  calendarDate: string;
  resolvedOperationalDate: string | null;
  preparationDate: string;
  activeMenuDeliveryEndMs?: number;
  reason: string;
  resolutionReason: string;
  isResolving: boolean;
  stallId?: string;
}

export const DEFAULT_RESOLVING_CONTEXT: OperationalContextResult = {
  calendarDate: getTodayISTDateString(),
  resolvedOperationalDate: getTodayISTDateString(),
  preparationDate: getTomorrowISTDateString(),
  reason: 'Resolving',
  resolutionReason: 'Resolving',
  isResolving: true,
};

export async function resolveSharedOperationalDate(stallId?: string): Promise<OperationalContextResult> {
  const calendarDate = getTodayISTDateString();
  const currentIST = getCurrentISTTime();
  const nowMs = Date.now();
  const tomorrowStr = getTomorrowISTDateString(calendarDate);

  const logAndReturn = (
    resolvedDate: string | null,
    prepDate: string,
    reasonText: string,
    deliveryEndMs?: number
  ): OperationalContextResult => {
    const result: OperationalContextResult = {
      calendarDate,
      resolvedOperationalDate: resolvedDate,
      preparationDate: prepDate,
      activeMenuDeliveryEndMs: deliveryEndMs,
      reason: reasonText,
      resolutionReason: reasonText,
      isResolving: false,
    };

    console.log('[INSTRUMENTATION: resolveSharedOperationalDate - RESULT]', JSON.stringify({
      nowIST: new Date(nowMs).toISOString(),
      calendarDate,
      resolvedOperationsDate: resolvedDate,
      preparationDate: prepDate,
      resolutionReason: reasonText,
    }, null, 2));

    return result;
  };

  if (!stallId) {
    return logAndReturn(calendarDate, tomorrowStr, 'No stallId provided');
  }

  // Fetch upcoming menus starting from today to determine which is active based on explicit delivery end time
  const { data: upcomingMenus, error: upcomingMenusError } = await supabase
    .from('menu_schedules')
    .select('id, menu_date, delivery_end_at')
    .eq('stall_id', stallId)
    .eq('is_published', true)
    .gte('menu_date', calendarDate)
    .order('menu_date', { ascending: true })
    .limit(3);

  console.log('[INSTRUMENTATION: resolveSharedOperationalDate - SUPABASE RESULT]', JSON.stringify({
    calendarDate,
    tomorrowStr,
    upcomingMenus: upcomingMenus || [],
    error: upcomingMenusError || null,
  }, null, 2));

  let activeDate: string | null = null;
  let activeDeliveryEndMs: number | undefined;
  let firstUpcomingDate: string | null = null;

  if (upcomingMenus && upcomingMenus.length > 0) {
    firstUpcomingDate = upcomingMenus[0].menu_date;
    
    // The active menu is the first one where the delivery window hasn't fully expired
    for (const menu of upcomingMenus) {
      if (menu.delivery_end_at) {
        const endMs = new Date(menu.delivery_end_at).getTime();
        if (nowMs <= endMs) {
          activeDate = menu.menu_date;
          activeDeliveryEndMs = endMs;
          break;
        }
      }
    }
  }

  const preparationDate = activeDate || firstUpcomingDate || tomorrowStr;

  if (activeDate) {
    return logAndReturn(activeDate, preparationDate, 'Found active menu based on explicit delivery_end_at', activeDeliveryEndMs);
  }

  return logAndReturn(null, preparationDate, 'All fetched menus have expired and no future menus found');
}
