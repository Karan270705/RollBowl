import { useQuery } from '@tanstack/react-query';
import { resolveSharedOperationalDate, OperationalContextResult, DEFAULT_RESOLVING_CONTEXT } from '../utils/operationalDate';

export function useOperationalContext(stallId?: string): OperationalContextResult {
  const { data } = useQuery({
    queryKey: ['operational-context', stallId],
    queryFn: () => resolveSharedOperationalDate(stallId),
    enabled: !!stallId,
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: 2,
  });

  return data ?? DEFAULT_RESOLVING_CONTEXT;
}
