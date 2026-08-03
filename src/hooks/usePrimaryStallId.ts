import { useQuery } from '@tanstack/react-query';
import { getPrimaryStallId } from '../utils/operationalDate';
import { logStartupStage, logStartupError } from '../utils/startupLogger';

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

