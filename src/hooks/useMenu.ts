import { useQuery } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';
import { fetchActiveMenuSchedule, fetchScheduledMeals } from '@/src/services/menu';

/**
 * Fetch the active published menu schedule for a target date.
 */
export function useActiveMenu(targetDate: string) {
  return useQuery({
    queryKey: ['activeMenu', targetDate],
    queryFn: () => fetchActiveMenuSchedule(targetDate),
  });
}

/**
 * Fetch the meals associated with a specific schedule ID.
 */
export function useScheduledMeals(scheduleId: string | undefined) {
  return useQuery({
    queryKey: ['scheduledMeals', scheduleId],
    queryFn: () => fetchScheduledMeals(scheduleId!),
    enabled: Boolean(scheduleId),
  });
}
