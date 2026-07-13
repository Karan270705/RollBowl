import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/src/lib/supabase';
import { queryKeys } from './queryKeys';

export interface CustomerInventoryItem {
  batch_id: string;
  stall_id: string;
  inventory_date: string;
  window_start: string;
  window_end: string;
  meal_id: string;
  item_name: string;
  customer_available: number;
  stock_status: 'available' | 'low_stock' | 'out_of_stock';
  batch_status: string;
}

export function useLiveInventory(stallId: string | undefined, date: string | undefined) {
  const queryClient = useQueryClient();

  const queryResult = useQuery({
    queryKey: queryKeys.inventory.stall(stallId!, date!),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customer_safe_inventory')
        .select('*')
        .eq('stall_id', stallId!)
        .eq('inventory_date', date!);

      if (error) throw error;
      return data as CustomerInventoryItem[];
    },
    enabled: Boolean(stallId && date),
    refetchOnWindowFocus: true,
  });

  // Realtime subscription
  useEffect(() => {
    if (!stallId || !date) return;

    // Listen for changes on batches, items, and orders
    const channel = supabase
      .channel(`inventory_sync_${stallId}_${date}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_batches', filter: `stall_id=eq.${stallId}` }, () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.inventory.stall(stallId, date) });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_batch_items' }, () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.inventory.stall(stallId, date) });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `stall_id=eq.${stallId}` }, () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.inventory.stall(stallId, date) });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [stallId, date, queryClient]);

  return queryResult;
}
