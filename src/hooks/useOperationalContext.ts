import { useEffect, useRef, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  resolveSharedOperationalDate,
  OperationalContextResult,
  DEFAULT_RESOLVING_CONTEXT,
  parseTimeToDateIST,
  getTodayISTDateString,
  getTomorrowISTDateString,
} from '../utils/operationalDate';
import { AppConfig } from '../constants/config';

// Calculate milliseconds until next rollover time (default 15:00 IST) using explicit epoch math
function calculateMsUntilNextRollover(rolloverTimeStr = '15:00'): { delayMs: number; targetIST: string } {
  const nowMs = Date.now();
  const todayStr = getTodayISTDateString();
  const todayRolloverDate = parseTimeToDateIST(todayStr, rolloverTimeStr);
  const todayRolloverMs = todayRolloverDate.getTime();

  let targetMs: number;
  let targetDate: Date;

  if (nowMs < todayRolloverMs) {
    targetMs = todayRolloverMs;
    targetDate = todayRolloverDate;
  } else {
    const tomorrowStr = getTomorrowISTDateString(todayStr);
    const tomorrowRolloverDate = parseTimeToDateIST(tomorrowStr, rolloverTimeStr);
    targetMs = tomorrowRolloverDate.getTime();
    targetDate = tomorrowRolloverDate;
  }

  return {
    delayMs: targetMs - nowMs,
    targetIST: targetDate.toISOString(),
  };
}

export function useOperationalContext(stallId?: string): OperationalContextResult & { stallId?: string; refetch: () => void } {
  const queryClient = useQueryClient();
  const rolloverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data, refetch } = useQuery({
    queryKey: ['operational-context', stallId],
    queryFn: async () => {
      return resolveSharedOperationalDate(stallId);
    },
    enabled: true,
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: 2,
  });

  const refetchRef = useRef(refetch);
  useEffect(() => {
    refetchRef.current = refetch;
  }, [refetch]);

  const scheduleNextBoundary = useCallback(() => {
    if (rolloverTimerRef.current) {
      clearTimeout(rolloverTimerRef.current);
      rolloverTimerRef.current = null;
    }

    const rolloverTimeStr = AppConfig.BUSINESS.OPERATIONAL_ROLLOVER_TIME || '15:00';
    let { delayMs, targetIST } = calculateMsUntilNextRollover(rolloverTimeStr);

    // Minimum safety guard
    if (!Number.isFinite(delayMs) || delayMs < 1000) {
      console.warn('[ROLLOVER TIMER SAFETY GUARD] delayMs < 1000, forcing tomorrow boundary', { delayMs });
      const todayStr = getTodayISTDateString();
      const tomorrowStr = getTomorrowISTDateString(todayStr);
      const tomorrowRolloverDate = parseTimeToDateIST(tomorrowStr, rolloverTimeStr);
      delayMs = Math.max(1000, tomorrowRolloverDate.getTime() - Date.now());
      targetIST = tomorrowRolloverDate.toISOString();
    }

    console.log('[ROLLOVER TIMER SCHEDULE]', JSON.stringify({
      nowISO: new Date().toISOString(),
      nowIST: new Date(Date.now() + 19800000).toISOString().replace('Z', '+05:30'),
      targetIST,
      delayMs,
      existingTimerPresent: !!rolloverTimerRef.current,
    }, null, 2));

    rolloverTimerRef.current = setTimeout(() => {
      console.log('[OPERATIONAL ROLLOVER] Timeout reached, refetching context...');
      rolloverTimerRef.current = null;
      refetchRef.current?.();
      if (stallId) {
        queryClient.invalidateQueries({ queryKey: ['dashboard_summary', stallId] });
        queryClient.invalidateQueries({ queryKey: ['orders', 'list', stallId] });
      }
      scheduleNextBoundary();
    }, delayMs);
  }, [stallId, queryClient]);

  useEffect(() => {
    scheduleNextBoundary();
    return () => {
      if (rolloverTimerRef.current) {
        clearTimeout(rolloverTimerRef.current);
        rolloverTimerRef.current = null;
      }
    };
  }, [scheduleNextBoundary]);

  // Recompute on AppState foreground exactly once per transition
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        console.log('[OPERATIONAL ROLLOVER] App foregrounded, refetching context...');
        if (rolloverTimerRef.current) {
          clearTimeout(rolloverTimerRef.current);
          rolloverTimerRef.current = null;
        }
        refetchRef.current?.();
        if (stallId) {
          queryClient.invalidateQueries({ queryKey: ['dashboard_summary', stallId] });
          queryClient.invalidateQueries({ queryKey: ['orders', 'list', stallId] });
        }
        scheduleNextBoundary();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [scheduleNextBoundary, stallId, queryClient]);

  return {
    ...(data ?? DEFAULT_RESOLVING_CONTEXT),
    stallId: data?.stallId || stallId,
    refetch: () => {
      refetchRef.current?.();
      scheduleNextBoundary();
    },
  };
}
