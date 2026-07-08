import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radii, Shadows } from '@/src/constants/theme';
import { ScreenWrapper } from '@/src/components/layout';
import { EmptyState, Button } from '@/src/components/ui';
import { useUser } from '@/src/store';
import { useNotifications, useMarkAllNotificationsAsRead, useMarkNotificationAsRead } from '@/src/hooks';
import { formatRelativeTime } from '@/src/utils/formatters';
import { NotificationType } from '@/src/constants/enums';
import { Notification } from '@/src/types/models';

export default function NotificationsScreen() {
  const user = useUser();
  const { data: notifications = [], isLoading, refetch } = useNotifications(user?.id);
  const markAllMutation = useMarkAllNotificationsAsRead();
  const markSingleMutation = useMarkNotificationAsRead();

  const handleMarkAllRead = () => {
    if (user?.id) {
      markAllMutation.mutate(user.id);
    }
  };

  const handleNotificationPress = (notification: Notification) => {
    if (!notification.isRead && user?.id) {
      markSingleMutation.mutate({ notificationId: notification.id, userId: user.id });
    }
    // Future: Handle navigation based on notification.data
    // e.g. if notification.data.orderId => router.push(`/track/${orderId}`)
  };

  const getIconForType = (type: NotificationType) => {
    switch (type) {
      case NotificationType.ORDER_UPDATE: return 'restaurant-outline';
      case NotificationType.SUBSCRIPTION: return 'ticket-outline';
      case NotificationType.PROMOTION: return 'pricetag-outline';
      case NotificationType.SYSTEM: return 'information-circle-outline';
      default: return 'notifications-outline';
    }
  };

  const getColorForType = (type: NotificationType) => {
    switch (type) {
      case NotificationType.ORDER_UPDATE: return Colors.primary;
      case NotificationType.SUBSCRIPTION: return Colors.success;
      case NotificationType.PROMOTION: return Colors.warningDark;
      case NotificationType.SYSTEM: return Colors.textSecondary;
      default: return Colors.primary;
    }
  };

  const getNotificationTitle = (n: Notification) => {
    if (n.title) return n.title;
    switch (n.data?.event) {
      case 'ORDER_PREPARING': return 'Order Preparing';
      case 'ORDER_READY': return 'Order Ready for Pickup';
      case 'ORDER_COLLECTED': return 'Order Collected';
      case 'ORDER_CANCELLED': return 'Order Cancelled';
      default: return 'Notification';
    }
  };

  const getNotificationBody = (n: Notification) => {
    if (n.body) return n.body;
    const orderNum = n.data?.orderNumber || 'your order';
    switch (n.data?.event) {
      case 'ORDER_PREPARING': return `Your item for order ${orderNum} is currently being prepared.`;
      case 'ORDER_READY': return `Your order ${orderNum} is ready for pickup!`;
      case 'ORDER_COLLECTED': return `Order ${orderNum} has been successfully collected. Enjoy your meal!`;
      case 'ORDER_CANCELLED': return `Your order ${orderNum} has been cancelled.`;
      default: return 'You have a new update.';
    }
  };

  const unreadCount = notifications.filter(n => !n.isRead).length;

  return (
    <ScreenWrapper>
      <View style={styles.header}>
        <Text style={styles.title}>Alerts</Text>
        {unreadCount > 0 && (
          <TouchableOpacity onPress={handleMarkAllRead} disabled={markAllMutation.isPending}>
            <Text style={styles.markReadBtn}>Mark all as read</Text>
          </TouchableOpacity>
        )}
      </View>

      {isLoading ? (
        <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: Spacing.xl }} />
      ) : notifications.length === 0 ? (
        <EmptyState 
          icon="notifications-off-outline" 
          title="No Alerts Yet" 
          subtitle="You'll see updates about your orders and subscriptions here." 
        />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.listContainer}>
          {notifications.map(notification => (
            <TouchableOpacity 
              key={notification.id} 
              style={[styles.notificationCard, !notification.isRead && styles.unreadCard]}
              onPress={() => handleNotificationPress(notification)}
              activeOpacity={0.7}
            >
              <View style={[styles.iconContainer, { backgroundColor: getColorForType(notification.type) + '15' }]}>
                <Ionicons name={getIconForType(notification.type)} size={24} color={getColorForType(notification.type)} />
              </View>
              
              <View style={styles.contentContainer}>
                <View style={styles.titleRow}>
                  <Text style={[styles.notificationTitle, !notification.isRead && styles.unreadText]}>
                    {getNotificationTitle(notification)}
                  </Text>
                  {!notification.isRead && <View style={styles.unreadDot} />}
                </View>
                
                <Text style={styles.notificationBody}>{getNotificationBody(notification)}</Text>
                <Text style={styles.timestamp}>{formatRelativeTime(notification.createdAt)}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  header: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center',
    paddingVertical: Spacing.xl, 
    paddingBottom: Spacing.md 
  },
  title: { 
    fontSize: Typography.size.xl, 
    fontFamily: Typography.family.bold, 
    color: Colors.textPrimary 
  },
  markReadBtn: {
    fontSize: Typography.size.sm,
    fontFamily: Typography.family.medium,
    color: Colors.primary,
  },
  listContainer: {
    paddingBottom: Spacing['3xl'],
  },
  notificationCard: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    padding: Spacing.md,
    borderRadius: Radii.lg,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  unreadCard: {
    backgroundColor: Colors.primaryBg,
    borderColor: Colors.primary + '30',
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: Radii.full,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  contentContainer: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  notificationTitle: {
    flex: 1,
    fontSize: Typography.size.base,
    fontFamily: Typography.family.semiBold,
    color: Colors.textPrimary,
  },
  unreadText: {
    fontFamily: Typography.family.bold,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primary,
    marginTop: 6,
    marginLeft: Spacing.sm,
  },
  notificationBody: {
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
    marginBottom: Spacing.xs,
  },
  timestamp: {
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
  },
});
