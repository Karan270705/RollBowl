import { useQuery } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';
import { getHolidays, getHolidayByDate } from '@/src/services/holidays';
import { AppConfig } from '@/src/constants/config';

export function useAllHolidays() {
  return useQuery({
    queryKey: queryKeys.holidays.all(),
    queryFn: getHolidays,
    staleTime: AppConfig.QUERY_STALE_TIME,
  });
}

export function useHoliday(dateString: string) {
  return useQuery({
    queryKey: queryKeys.holidays.active(dateString),
    queryFn: () => getHolidayByDate(dateString),
    staleTime: AppConfig.QUERY_STALE_TIME,
    enabled: !!dateString,
  });
}
