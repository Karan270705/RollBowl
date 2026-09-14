import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchActiveStalls,
  fetchStallById,
  updateUserPreferredStall,
  fetchUserPreferredStall,
  fetchStallsWithMeal,
} from '@/src/services/stalls';
import { Stall } from '@/src/types/models';

export function useActiveStalls(collegeId?: string) {
  return useQuery<Stall[], Error>({
    queryKey: ['stalls', 'active', collegeId],
    queryFn: () => fetchActiveStalls(collegeId),
    staleTime: 1000 * 60 * 30, // 30 minutes
  });
}

export function useStallById(stallId: string | null) {
  return useQuery<Stall | null, Error>({
    queryKey: ['stalls', stallId],
    queryFn: () => stallId ? fetchStallById(stallId) : Promise.resolve(null),
    enabled: !!stallId,
    staleTime: 1000 * 60 * 30, // 30 minutes
  });
}

export function useUserPreferredStall(userId: string | undefined) {
  return useQuery<string | null, Error>({
    queryKey: ['users', userId, 'preferred-stall'],
    queryFn: () => userId ? fetchUserPreferredStall(userId) : Promise.resolve(null),
    enabled: !!userId,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

export function useUpdatePreferredStall() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, stallId }: { userId: string; stallId: string }) =>
      updateUserPreferredStall(userId, stallId),
    onSuccess: (_, variables) => {
      // Invalidate user's preferred stall query
      queryClient.invalidateQueries({
        queryKey: ['users', variables.userId, 'preferred-stall']
      });
      // Invalidate operational window to refetch with new stall
      queryClient.invalidateQueries({
        queryKey: ['operationalWindow']
      });
      queryClient.invalidateQueries({
        queryKey: ['primary-stall']
      });
    },
  });
}

export function useStallsWithMeal(mealId: string | null, serviceDate: string | null) {
  return useQuery<string[], Error>({
    queryKey: ['stalls', 'with-meal', mealId, serviceDate],
    queryFn: () =>
      mealId && serviceDate
        ? fetchStallsWithMeal(mealId, serviceDate)
        : Promise.resolve([]),
    enabled: !!mealId && !!serviceDate,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}
