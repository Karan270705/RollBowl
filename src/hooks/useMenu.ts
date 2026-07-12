import { useQuery } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';
import { fetchScheduledMeals } from '@/src/services/menu';

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
