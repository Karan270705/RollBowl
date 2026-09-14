import { useQuery } from '@tanstack/react-query';
import { getPrimaryStallId, getCustomerStallId } from '../utils/operationalDate';
import { logStartupStage, logStartupError } from '../utils/startupLogger';
import { useUser } from '../store';

// Existing hook - keep as is
export function usePrimaryStallId() {
  return useQuery({
    queryKey: ['primary-stall'],
    queryFn: async () => {
      logStartupStage('10_PRIMARY_STALL_RESOLUTION_STARTED');
      try {
        const stallId = await getPrimaryStallId();
        logStartupStage('11_PRIMARY_STALL_RESOLUTION_COMPLETED', {
          primaryStallId: stallId,
        });
        return stallId;
      } catch (err) {
        logStartupError('10_PRIMARY_STALL_RESOLUTION', err);
        throw err;
      }
    },
    staleTime: 1000 * 60 * 60, // 1 hour
    retry: 1,
  });
}

// NEW: Customer-aware hook
export function useCustomerPrimaryStallId() {
  const user = useUser();

  return useQuery({
    queryKey: ['primary-stall', user?.id],
    queryFn: async () => {
      try {
        const stallId = await getCustomerStallId(user?.id);
        console.log('[useCustomerPrimaryStallId] Resolved stall:', stallId);
        return stallId;
      } catch (err) {
        console.error('[useCustomerPrimaryStallId] Error:', err);
        throw err;
      }
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 5, // 5 minutes (shorter since it can change)
    retry: 1,
  });
}

