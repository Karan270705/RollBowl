import { useQuery } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';
import { fetchActiveMenuSchedule, fetchScheduledMeals } from '@/src/services/menu';
import { getMenuState } from '@/src/utils/menuState';
import { useHoliday } from './useHolidays';

/**
 * Fetch the active published menu schedule for a target date.
 */
export function useActiveMenu(targetDate: string) {
  const menuQuery = useQuery({
    queryKey: ['activeMenu', targetDate],
    queryFn: () => fetchActiveMenuSchedule(targetDate),
  });

  const holidayQuery = useHoliday(targetDate);

  // Wait for BOTH queries to finish before evaluating state.
  // This prevents the "Menu Coming Soon" flash while holiday data is still loading.
  const isLoading = menuQuery.isLoading || holidayQuery.isLoading;
  const holiday = holidayQuery.data ?? null;

  // Compute the day after the holiday so UI can tell users when ordering resumes
  let resumeDate = '';
  if (holiday) {
    const d = new Date(holiday.holidayDate);
    d.setDate(d.getDate() + 1);
    resumeDate = d.toISOString().split('T')[0];
  }

  const storeStatus = getMenuState(menuQuery.data, !!holiday, holiday?.title, resumeDate);

  return {
    ...menuQuery,
    isLoading,
    storeStatus,
    isHoliday: !!holiday,
    holiday,
    resumeDate,
  };
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
