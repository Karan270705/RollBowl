import { useQuery } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';
import { fetchUserOrders, fetchOrderById } from '@/src/services/orders';

/**
 * Fetch all orders for a specific user.
 */
export function useUserOrders(userId?: string) {
  return useQuery({
    queryKey: queryKeys.orders.list(userId ?? ''),
    queryFn: () => fetchUserOrders(userId!),
    enabled: Boolean(userId),
  });
}

/**
 * Fetch a single order by its ID.
 */
export function useOrder(id?: string) {
  return useQuery({
    queryKey: queryKeys.orders.detail(id ?? ''),
    queryFn: () => fetchOrderById(id!),
    enabled: Boolean(id),
  });
}
