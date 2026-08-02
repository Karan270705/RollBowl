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

  const query = useQuery<OperationalFacts>({
    queryKey: ['operationalWindow', primaryStallId, targetDate],
    queryFn: () => resolveOperationalFacts(primaryStallId!, targetDate!),
    enabled: !!primaryStallId && !!targetDate && !isResolving,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });

  // Schedule a single one-time refresh at visible_from boundary when future published menu exists
  useEffect(() => {
    const activeMenu = query.data?.activeMenu;
    const status = query.data?.status;

    if (status === 'MENU_SCHEDULED' && activeMenu?.visible_from) {
      const visibleFromMs = new Date(activeMenu.visible_from).getTime();
      const nowMs = Date.now();
      const delayMs = visibleFromMs - nowMs;

      if (delayMs > 0 && delayMs <= 86400000) { // Schedule if within 24h
        console.log(`[MENU VISIBILITY TIMER] Scheduling boundary refetch in ${delayMs}ms at ${new Date(visibleFromMs).toISOString()}`);
        const timerId = setTimeout(() => {
          console.log('[MENU VISIBILITY TIMER] Boundary reached! Refetching operationalWindow...');
          void queryClient.invalidateQueries({ queryKey: ['operationalWindow'] });
          void queryClient.invalidateQueries({ queryKey: ['scheduledMeals'] });
          void queryClient.invalidateQueries({ queryKey: ['operational-context'] });
        }, delayMs + 50); // add 50ms buffer to cross time boundary cleanly

        return () => clearTimeout(timerId);
      }
    }
  }, [query.data?.status, query.data?.activeMenu, queryClient]);

  return query;
}

