import { supabase } from '@/src/lib/supabase';
import { NotificationType } from '@/src/constants/enums';
import { Notification } from '@/src/types/models';

export interface CreateNotificationParams {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, any>;
}

/**
 * Generic centralized notification creator.
 * Uses the SECURITY DEFINER RPC to bypass RLS (e.g. for cross-user notifications).
 */
export async function createNotification(params: CreateNotificationParams): Promise<void> {
  try {
    const { error } = await supabase.rpc('create_notification', {
      p_user_id: params.userId,
      p_title: params.title,
      p_body: params.body,
      p_type: params.type,
      p_data: params.data || null,
    });

    if (error) {
      console.error('Failed to create notification via RPC:', error);
    }
  } catch (err) {
    console.error('Error calling create_notification RPC:', err);
  }
}

/** Fetch user notifications */
export async function fetchUserNotifications(userId: string): Promise<Notification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return data.map((n: any) => ({
    id: n.id,
    title: n.title,
    body: n.body,
    type: n.type as NotificationType,
    isRead: n.is_read,
    createdAt: n.created_at,
    data: n.data,
  }));
}

/** Mark all unread notifications as read */
export async function markAllNotificationsAsRead(userId: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', userId)
    .eq('is_read', false);

  if (error) throw error;
}

/** Mark a single notification as read */
export async function markNotificationAsRead(notificationId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', notificationId)
    .eq('user_id', userId);

  if (error) throw error;
}

// ─── Specific Notification Helpers ─────────────────────────────────────────

export const NotificationEvents = {
  // Account
  notifyWelcome: async (userId: string) => {
    return createNotification({
      userId,
      type: NotificationType.SYSTEM,
      title: 'Welcome to RollBowl!',
      body: 'Your account is ready. Start exploring delicious meals now.',
    });
  },

  // Subscription
  notifySubscriptionActivated: async (userId: string, planName: string) => {
    return createNotification({
      userId,
      type: NotificationType.SUBSCRIPTION,
      title: 'Subscription Activated',
      body: `Your ${planName} is now active. Enjoy your meals!`,
    });
  },
  
  notifySubscriptionExpiring: async (userId: string, daysLeft: number, subscriptionId: string) => {
    return createNotification({
      userId,
      type: NotificationType.SUBSCRIPTION,
      title: 'Subscription Expiring Soon',
      body: `Your subscription expires in ${daysLeft} days. Don't forget to renew!`,
      data: { event: 'SUBSCRIPTION_EXPIRING', subscriptionId }
    });
  },
  
  notifySubscriptionExpired: async (userId: string, subscriptionId: string) => {
    return createNotification({
      userId,
      type: NotificationType.SUBSCRIPTION,
      title: 'Subscription Expired',
      body: 'Your subscription has expired. Renew to continue enjoying meals.',
      data: { event: 'SUBSCRIPTION_EXPIRED', subscriptionId }
    });
  },

  // Menu
  notifyMenuPublished: async (userId: string, date: string) => {
    return createNotification({
      userId,
      type: NotificationType.SYSTEM,
      title: "Tomorrow's Menu is Available",
      body: 'The menu for tomorrow has been published. Place your pre-orders now!',
      data: { date }
    });
  },

  // Orders
  notifyOrderPlaced: async (userId: string, orderNumber: string, orderId: string) => {
    return createNotification({
      userId,
      type: NotificationType.ORDER_UPDATE,
      title: 'Order Placed Successfully',
      body: `Your order ${orderNumber} has been placed.`,
      data: { orderId }
    });
  },

  notifyOrderAccepted: async (userId: string, orderNumber: string, orderId: string) => {
    return createNotification({
      userId,
      type: NotificationType.ORDER_UPDATE,
      title: 'Order Accepted',
      body: `The kitchen has accepted your order ${orderNumber}.`,
      data: { orderId }
    });
  },

  notifyOrderPreparing: async (userId: string, orderNumber: string, orderId: string) => {
    return createNotification({
      userId,
      type: NotificationType.ORDER_UPDATE,
      title: 'Order Preparing',
      body: `Your meal for order ${orderNumber} is currently being prepared.`,
      data: { orderId }
    });
  },

  notifyOrderReady: async (userId: string, orderNumber: string, orderId: string) => {
    return createNotification({
      userId,
      type: NotificationType.ORDER_UPDATE,
      title: 'Order Ready for Pickup',
      body: `Your order ${orderNumber} is ready for pickup!`,
      data: { orderId }
    });
  },

  notifyOrderCollected: async (userId: string, orderNumber: string, orderId: string) => {
    return createNotification({
      userId,
      type: NotificationType.ORDER_UPDATE,
      title: 'Order Collected',
      body: `Order ${orderNumber} has been successfully collected. Enjoy your meal!`,
      data: { orderId }
    });
  },

  notifyOrderCancelled: async (userId: string, orderNumber: string, orderId: string) => {
    return createNotification({
      userId,
      type: NotificationType.ORDER_UPDATE,
      title: 'Order Cancelled',
      body: `Your order ${orderNumber} has been cancelled.`,
      data: { orderId }
    });
  }
};
