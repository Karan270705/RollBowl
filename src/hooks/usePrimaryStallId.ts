import { useQuery } from '@tanstack/react-query';
import { getPrimaryStallId } from '../utils/operationalDate';

export function usePrimaryStallId() {
  return useQuery({
    queryKey: ['primary-stall'],
    queryFn: getPrimaryStallId,
    staleTime: 1000 * 60 * 60, // 1 hour
  });
}
