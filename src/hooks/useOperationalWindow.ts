import { useQuery } from '@tanstack/react-query';
import { resolveOperationalFacts, OperationalFacts } from '@/src/engine/operationalEngine';
import { usePrimaryStallId } from './usePrimaryStallId';
import { useOperationalContext } from './useOperationalContext';

/**
 * The single source of truth hook for the Customer App's operational state.
 */
export function useOperationalWindow() {
  const { data: primaryStallId } = usePrimaryStallId();
  const { resolvedOperationalDate, isResolving } = useOperationalContext(primaryStallId);

  return useQuery<OperationalFacts>({
    queryKey: ['operationalWindow', primaryStallId, resolvedOperationalDate],
    queryFn: () => resolveOperationalFacts(primaryStallId!, resolvedOperationalDate!),
    enabled: !!primaryStallId && !!resolvedOperationalDate && !isResolving,
    refetchInterval: 60 * 1000, // Refresh every minute to catch time-based transitions
  });
}
