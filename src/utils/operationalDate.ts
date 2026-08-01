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

// Helper to get today's date string in IST without toLocaleString
export function getTodayISTDateString(): string {
  const istDate = new Date(Date.now() + 19800000); // UTC+05:30 offset in ms
  return istDate.toISOString().split('T')[0];
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
  const tomorrowStr = getTomorrowISTDateString(calendarDate);

  const rolloverTimeStr = AppConfig.BUSINESS.OPERATIONAL_ROLLOVER_TIME || '15:00';
  const rolloverCutoff = parseTimeToDateIST(calendarDate, rolloverTimeStr);
  const beforeOrAfterRollover = currentIST <= rolloverCutoff ? 'BEFORE_ROLLOVER' : 'AFTER_ROLLOVER';

  // Find next upcoming published menu date for preparationDate (independent of inventory batches)
  let menuQuery = supabase
    .from('menu_schedules')
    .select('id, menu_date')
    .eq('is_published', true)
    .gt('menu_date', calendarDate)
    .order('menu_date', { ascending: true })
    .limit(1);

  if (stallId) {
    menuQuery = menuQuery.eq('stall_id', stallId);
  }

  const { data: upcomingMenus } = await menuQuery;

  let nextValidServiceDate: string | null = null;
  if (upcomingMenus && upcomingMenus.length > 0) {
    nextValidServiceDate = upcomingMenus[0].menu_date;
  }

  const preparationDate = nextValidServiceDate || tomorrowStr;

  const logAndReturn = (
    resolvedDate: string | null,
    reasonText: string
  ): OperationalContextResult => {
    const result: OperationalContextResult = {
      calendarDate,
      resolvedOperationalDate: resolvedDate,
      preparationDate,
      reason: reasonText,
      resolutionReason: reasonText,
      isResolving: false,
    };

    console.log('[OPERATIONAL ROLLOVER]', JSON.stringify({
      nowIST: currentIST.toISOString(),
      calendarDate,
      rolloverTime: rolloverTimeStr,
      beforeOrAfterRollover,
      previousOperationsDate: calendarDate,
      resolvedOperationsDate: resolvedDate,
      preparationDate,
      resolutionReason: reasonText,
      activeMenuDate: nextValidServiceDate,
    }, null, 2));

    return result;
  };

  if (!stallId) {
    return logAndReturn(calendarDate, 'No stallId provided');
  }

  // Before rollover (<= 15:00 IST): today is active operations
  if (beforeOrAfterRollover === 'BEFORE_ROLLOVER') {
    return logAndReturn(calendarDate, 'Before rollover cutoff');
  }

  // After rollover (> 15:00 IST): today's operational window is completed
  // Check if there is an upcoming valid service date
  if (nextValidServiceDate) {
    return logAndReturn(nextValidServiceDate, 'After rollover: next valid service date found');
  }

  // After rollover and no upcoming published menu or batch: return null for resolvedOperationalDate
  return logAndReturn(null, 'After rollover: no active or upcoming service date');
}
