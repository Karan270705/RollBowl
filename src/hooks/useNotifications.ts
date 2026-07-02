import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchUserNotifications, markAllNotificationsAsRead, markNotificationAsRead } from '@/src/services/notifications';

const NOTIFICATIONS_KEY = 'notifications';

export function useNotifications(userId: string | undefined) {
  return useQuery({
    queryKey: [NOTIFICATIONS_KEY, userId],
    queryFn: () => fetchUserNotifications(userId!),
    enabled: !!userId,
  });
}

export function useMarkAllNotificationsAsRead() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (userId: string) => markAllNotificationsAsRead(userId),
    onSuccess: (_, userId) => {
      queryClient.invalidateQueries({ queryKey: [NOTIFICATIONS_KEY, userId] });
    },
  });
}

export function useMarkNotificationAsRead() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ notificationId, userId }: { notificationId: string, userId: string }) => markNotificationAsRead(notificationId, userId),
    onSuccess: (_, { userId }) => {
      queryClient.invalidateQueries({ queryKey: [NOTIFICATIONS_KEY, userId] });
    },
  });
}
