import { useQuery } from '@tanstack/react-query';
import { resolveOperationalFacts, OperationalFacts } from '@/src/engine/operationalEngine';
import { queryKeys } from './queryKeys';

/**
 * The single source of truth hook for the Customer App's operational state.
 */
export function useOperationalWindow() {
  return useQuery<OperationalFacts>({
    queryKey: ['operationalWindow'],
    queryFn: resolveOperationalFacts,
    refetchInterval: 60 * 1000, // Refresh every minute to catch time-based transitions
  });
}
