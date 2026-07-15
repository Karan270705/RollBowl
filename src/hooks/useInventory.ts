import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { supabase } from "@/src/lib/supabase";
import { queryKeys } from "./queryKeys";

export interface CustomerInventoryItem {
  batch_id: string;
  stall_id: string;
  inventory_date: string;
  window_start: string;
  window_end: string;
  meal_id: string;
  item_name: string;
  customer_available: number;
  stock_status: "available" | "low_stock" | "out_of_stock";
  batch_status: string;
}

export function useLiveInventory(
  stallId: string | undefined,
  date: string | undefined,
) {
  const queryClient = useQueryClient();

  const queryKey =
    stallId && date
      ? queryKeys.inventory.stall(stallId, date)
      : queryKeys.inventory.stall("", "");

  const queryResult = useQuery({
    queryKey,
    queryFn: async (): Promise<CustomerInventoryItem[]> => {
      if (!stallId || !date) {
        return [];
      }

      const { data, error } = await supabase
        .from("customer_safe_inventory")
        .select("*")
        .eq("stall_id", stallId)
        .eq("inventory_date", date);

      if (error) {
        throw error;
      }

      return (data ?? []) as CustomerInventoryItem[];
    },
    enabled: Boolean(stallId && date),
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (!stallId || !date) {
      return;
    }

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const inventoryQueryKey = queryKeys.inventory.stall(stallId, date);

    const invalidateInventory = () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }

      debounceTimer = setTimeout(() => {
        void queryClient.invalidateQueries({
          queryKey: inventoryQueryKey,
        });
      }, 250);
    };

    const channelName = `customer-inventory:${stallId}:${date}`;

    let channel = supabase.getChannels().find(c => c.topic === `realtime:${channelName}`);

    if (!channel) {
      channel = supabase.channel(channelName);

      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "inventory_batches",
          filter: `stall_id=eq.${stallId}`,
        },
        invalidateInventory,
      );

      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "inventory_batch_items",
        },
        invalidateInventory,
      );

      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "inventory_movements",
        },
        invalidateInventory,
      );

      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `stall_id=eq.${stallId}`,
        },
        invalidateInventory,
      );

      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "order_items",
        },
        invalidateInventory,
      );

      channel.subscribe((status) => {
        if (__DEV__) {
          console.log("[Customer Inventory Realtime]", {
            channelName,
            status,
            stallId,
            date,
          });
        }
      });
    }

    return () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      
      // We only remove the channel if it's specifically requested to be cleaned up,
      // but in Strict Mode we let it survive the immediate unmount/remount cycle.
      // Given the prompt instruction for a stable channel name, we will leave it
      // managed by Supabase's internal connection pool, or we can just remove it asynchronously.
      if (channel) {
         void supabase.removeChannel(channel);
      }
    };
  }, [stallId, date, queryClient]);

  return queryResult;
}
