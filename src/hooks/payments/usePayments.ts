import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/src/hooks/queryKeys';
import {
  fetchPaymentSettings,
  fetchSubscriptionPurchaseRequests,
  submitOrderPaymentProof,
  createSubscriptionPurchaseRequest,
  submitSubscriptionPaymentProof,
  fetchPaymentProofForOrder,
  fetchPaymentProofForSubscriptionRequest,
  createPaymentProofSignedUrl,
} from '@/src/services/payments';

export function usePaymentSettings(stallId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.payments.settings(stallId || ''),
    queryFn: () => fetchPaymentSettings(stallId!),
    enabled: !!stallId,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

export function useSubmitOrderProof() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: submitOrderPaymentProof,
    onSuccess: (_, variables) => {
      // We don't have the user ID in variables, so we invalidate all order lists,
      // or we can expect the component to invalidate properly.
      // Easiest is to invalidate the specific order detail
      queryClient.invalidateQueries({
        queryKey: queryKeys.orders.detail(variables.orderId),
      });
      // Invalidate the generic orders list
      queryClient.invalidateQueries({
        queryKey: queryKeys.orders.all,
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.payments.proof(variables.orderId),
      });
    },
  });
}

export function useCreateSubscriptionRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createSubscriptionPurchaseRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['subscriptionRequests'],
      });
    },
  });
}

export function useSubmitSubscriptionProof() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: submitSubscriptionPaymentProof,
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.subscriptionRequests.detail(variables.requestId),
      });
      queryClient.invalidateQueries({
        queryKey: ['subscriptionRequests', 'list'],
      });
    },
  });
}

export function useSubscriptionRequests(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.subscriptionRequests.list(userId || ''),
    queryFn: () => fetchSubscriptionPurchaseRequests(userId!),
    enabled: !!userId,
  });
}

export function usePaymentProofForOrder(orderId: string | undefined) {
  return useQuery({
    queryKey: ['payments', 'proof', 'order', orderId || ''],
    queryFn: () => fetchPaymentProofForOrder(orderId!),
    enabled: !!orderId,
  });
}

export function usePaymentProofForSubscriptionRequest(requestId: string | undefined) {
  return useQuery({
    queryKey: ['payments', 'proof', 'subscription_request', requestId || ''],
    queryFn: () => fetchPaymentProofForSubscriptionRequest(requestId!),
    enabled: !!requestId,
  });
}

export function useCreatePaymentProofSignedUrl(screenshotPath: string | undefined) {
  return useQuery({
    queryKey: ['payments', 'signed_url', screenshotPath || ''],
    queryFn: () => createPaymentProofSignedUrl(screenshotPath!),
    enabled: !!screenshotPath,
    staleTime: 1000 * 50,
    gcTime: 1000 * 50,
  });
}
