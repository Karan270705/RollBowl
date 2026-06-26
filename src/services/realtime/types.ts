/**
 * Realtime subscription types.
 * Designed for Supabase Realtime — mock implementation now, swap later.
 */

import type { RealtimeEvent } from '@/src/types/models';

export type RealtimeCallback<T> = (event: RealtimeEvent<T>) => void;

export interface RealtimeSubscription {
  id: string;
  channel: string;
  unsubscribe: () => void;
}

export interface RealtimeConfig {
  /** Supabase table name to subscribe to */
  table: string;
  /** Row-level filter (e.g., 'stall_id=eq.stall-1') */
  filter?: string;
  /** Event types to listen for */
  events?: ('INSERT' | 'UPDATE' | 'DELETE')[];
}
