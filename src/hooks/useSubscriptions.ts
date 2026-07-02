import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getActiveSubscription, getSubscriptionPlan, getAllSubscriptionPlans, simulatePurchase, getSubscriptionUsageHistory } from '@/src/services/subscriptions';
import { SubscriptionPlan } from '@/src/types/models';
import { queryKeys } from './queryKeys';

export function useActiveSubscription(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.subscriptions?.active(userId) || ['subscriptions', 'active', userId],
    queryFn: () => getActiveSubscription(userId!),
    enabled: !!userId,
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
    mutationFn: ({ userId, plan }: { userId: string, plan: SubscriptionPlan }) => simulatePurchase(userId, plan),
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
