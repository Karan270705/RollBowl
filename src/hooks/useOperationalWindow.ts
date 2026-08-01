import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { resolveOperationalFacts, OperationalFacts } from '@/src/engine/operationalEngine';
import { usePrimaryStallId } from './usePrimaryStallId';
import { useOperationalContext } from './useOperationalContext';
import { supabase } from '@/src/lib/supabase';

/**
 * The single source of truth hook for the Customer App's operational state.
 */
export function useOperationalWindow() {
  const { data: primaryStallId } = usePrimaryStallId();
  const { resolvedOperationalDate, preparationDate, calendarDate, isResolving } = useOperationalContext(primaryStallId);
  const targetDate = resolvedOperationalDate || preparationDate || calendarDate;
  const queryClient = useQueryClient();

  useEffect(() => {
    const channelName = `customer-menu-schedules:${primaryStallId || 'default'}`;
    let channel = supabase.getChannels().find(c => c.topic === `realtime:${channelName}`);

    if (!channel) {
      channel = supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'menu_schedules' },
          () => {
            void queryClient.invalidateQueries({ queryKey: ['operationalWindow'] });
            void queryClient.invalidateQueries({ queryKey: ['scheduledMeals'] });
            void queryClient.invalidateQueries({ queryKey: ['operational-context'] });
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'menu_schedule_items' },
          () => {
            void queryClient.invalidateQueries({ queryKey: ['operationalWindow'] });
            void queryClient.invalidateQueries({ queryKey: ['scheduledMeals'] });
          }
        )
        .subscribe();
    }

    return () => {
      void supabase.removeChannel(channel!);
    };
  }, [primaryStallId, queryClient]);

  return useQuery<OperationalFacts>({
    queryKey: ['operationalWindow', primaryStallId, targetDate],
    queryFn: () => resolveOperationalFacts(primaryStallId!, targetDate!),
    enabled: !!primaryStallId && !!targetDate && !isResolving,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });
}

