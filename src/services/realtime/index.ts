/**
 * Realtime service abstraction layer.
 *
 * Mock implementation that simulates realtime updates.
 * Replace with Supabase realtime when backend is ready:
 *
 *   import { createClient } from '@supabase/supabase-js';
 *   const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
 *   supabase.channel('orders').on('postgres_changes', { ... }, callback).subscribe();
 */

import type { RealtimeEvent, InventoryItem, Order } from '@/src/types/models';
import type { RealtimeCallback, RealtimeSubscription, RealtimeConfig } from './types';

const activeSubscriptions = new Map<string, ReturnType<typeof setInterval>>();

let subCounter = 0;

/**
 * Subscribe to order status changes.
 * In production: Supabase realtime on `orders` table filtered by order ID.
 */
export function subscribeToOrderStatus(
  orderId: string,
  callback: RealtimeCallback<Order>,
): RealtimeSubscription {
  const id = `order-${orderId}-${++subCounter}`;

  // Mock: simulate periodic status updates
  const interval = setInterval(() => {
    const mockEvent: RealtimeEvent<Order> = {
      type: 'UPDATE',
      table: 'orders',
      data: { id: orderId } as Order,
      timestamp: new Date().toISOString(),
    };
    callback(mockEvent);
  }, 30000); // Every 30s in mock

  activeSubscriptions.set(id, interval);

  return {
    id,
    channel: `orders:id=eq.${orderId}`,
    unsubscribe: () => {
      clearInterval(interval);
      activeSubscriptions.delete(id);
    },
  };
}

/**
 * Subscribe to inventory/availability changes for a stall.
 * In production: Supabase realtime on `inventory` table filtered by stall ID.
 *
 * This powers the live availability feature — when a stall operator
 * updates inventory, customers see the change immediately.
 */
export function subscribeToAvailability(
  stallId: string,
  callback: RealtimeCallback<InventoryItem>,
): RealtimeSubscription {
  const id = `availability-${stallId}-${++subCounter}`;

  // Mock: simulate periodic availability updates
  const interval = setInterval(() => {
    const mockEvent: RealtimeEvent<InventoryItem> = {
      type: 'UPDATE',
      table: 'inventory',
      data: { stallId } as InventoryItem,
      timestamp: new Date().toISOString(),
    };
    callback(mockEvent);
  }, 15000); // Every 15s in mock

  activeSubscriptions.set(id, interval);

  return {
    id,
    channel: `inventory:stall_id=eq.${stallId}`,
    unsubscribe: () => {
      clearInterval(interval);
      activeSubscriptions.delete(id);
    },
  };
}

/**
 * Unsubscribe from a specific channel.
 */
export function unsubscribe(subscriptionId: string): void {
  const interval = activeSubscriptions.get(subscriptionId);
  if (interval) {
    clearInterval(interval);
    activeSubscriptions.delete(subscriptionId);
  }
}

/**
 * Unsubscribe from all active channels.
 * Call on logout or app background.
 */
export function unsubscribeAll(): void {
  activeSubscriptions.forEach((interval) => clearInterval(interval));
  activeSubscriptions.clear();
}

export type { RealtimeCallback, RealtimeSubscription, RealtimeConfig } from './types';
