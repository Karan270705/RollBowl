import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getActiveSubscription, getSubscriptionPlan, getAllSubscriptionPlans, simulatePurchase, getSubscriptionUsageHistory } from '@/src/services/subscriptions';
import { SubscriptionPlan } from '@/src/types/models';
import { queryKeys } from './queryKeys';
import { supabase } from '@/src/lib/supabase';

const subscriptionChannelRefs = new Map<string, { count: number; channel: any }>();

export function useActiveSubscription(userId: string | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId) return;

    const channelName = `customer-subscriptions:${userId}`;
    let ref = subscriptionChannelRefs.get(userId);

    if (ref) {
      ref.count++;
    } else {
      let channel = supabase.getChannels().find(c => c.topic === `realtime:${channelName}`);
      if (!channel) {
        channel = supabase
          .channel(channelName)
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'subscriptions', filter: `user_id=eq.${userId}` },
            () => {
              void queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
            }
          )
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'subscription_credit_reservations', filter: `user_id=eq.${userId}` },
            () => {
              void queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
            }
          )
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'orders', filter: `user_id=eq.${userId}` },
            () => {
              void queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
              void queryClient.invalidateQueries({ queryKey: ['orders'] });
            }
          )
          .subscribe();
      }
      subscriptionChannelRefs.set(userId, { count: 1, channel });
    }

    return () => {
      const existing = subscriptionChannelRefs.get(userId);
      if (existing) {
        existing.count--;
        if (existing.count <= 0) {
          supabase.removeChannel(existing.channel);
          subscriptionChannelRefs.delete(userId);
        }
      }
    };
  }, [userId, queryClient]);

  return useQuery({
    queryKey: queryKeys.subscriptions?.active(userId) || ['subscriptions', 'active', userId],
    queryFn: () => getActiveSubscription(userId!),
    enabled: !!userId,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}

export function useSubscriptionPlan(planId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.subscriptions?.plan(planId) || ['subscriptions', 'plan', planId],
    queryFn: () => getSubscriptionPlan(planId!),
    enabled: !!planId,
  });
}

export function useSubscriptionPlans() {
  return useQuery({
    queryKey: queryKeys.subscriptions?.plans() || ['subscriptions', 'plans'],
    queryFn: getAllSubscriptionPlans,
  });
}

export function usePurchaseSubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, plan, termsVersion }: { userId: string, plan: SubscriptionPlan, termsVersion: string }) => simulatePurchase(userId, plan, termsVersion),
    onSuccess: (_, { userId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.subscriptions?.active(userId) || ['subscriptions', 'active', userId] });
    },
  });
}

export function useSubscriptionUsageHistory(subscriptionId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.subscriptions.history(subscriptionId),
    queryFn: () => getSubscriptionUsageHistory(subscriptionId!),
    enabled: !!subscriptionId,
  });
}
