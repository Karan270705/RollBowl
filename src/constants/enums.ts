/**
 * Application enumerations.
 * Used across all modules for type-safe status tracking.
 */

export enum UserRole {
  CUSTOMER = 'customer',
  KITCHEN = 'kitchen',
  STALL_OPERATOR = 'stall_operator',
}

export enum OrderStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  PREPARING = 'preparing',
  READY = 'ready',
  PICKED_UP = 'picked_up',
  CANCELLED = 'cancelled',
}

export enum PaymentStatus {
  PENDING = 'pending',
  PAID = 'paid',
  FAILED = 'failed',
  REFUNDED = 'refunded',
}

export enum PaymentMethod {
  UPI = 'upi',
  CARD = 'card',
  CASH = 'cash',
}

export enum SubscriptionStatus {
  ACTIVE = 'active',
  PAUSED = 'paused',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
}

export enum MealCategory {
  BREAKFAST = 'breakfast',
  BOWL = 'bowl',
  DINNER = 'dinner',
  ROLL = 'roll',
  BEVERAGES = 'beverages',
  COMBO = 'combo',
}

export enum NotificationType {
  ORDER_UPDATE = 'order_update',
  PROMOTION = 'promotion',
  SUBSCRIPTION = 'subscription',
  SYSTEM = 'system',
}

export enum MealType {
  VEG = 'veg',
  NON_VEG = 'non_veg',
  VEGAN = 'vegan',
}

export enum OrderType {
  PRE_ORDER = 'pre_order',
  ON_STALL = 'on_stall',
  SUBSCRIPTION = 'subscription',
}

export const OrderStatusLabels: Record<OrderStatus, string> = {
  [OrderStatus.PENDING]: 'Pending',
  [OrderStatus.CONFIRMED]: 'Confirmed',
  [OrderStatus.PREPARING]: 'Preparing',
  [OrderStatus.READY]: 'Ready',
  [OrderStatus.PICKED_UP]: 'Picked Up',
  [OrderStatus.CANCELLED]: 'Cancelled',
};

export const OrderStatusColors: Record<OrderStatus, string> = {
  [OrderStatus.PENDING]: '#F5A623',     // Brand amber
  [OrderStatus.CONFIRMED]: '#1565C0',   // Info blue
  [OrderStatus.PREPARING]: '#E87A1E',   // Brand orange
  [OrderStatus.READY]: '#2E7D32',       // Brand green
  [OrderStatus.PICKED_UP]: '#7B1FA2',   // Purple (distinct)
  [OrderStatus.CANCELLED]: '#C41E24',   // Brand red
};

export const PaymentMethodLabels: Record<PaymentMethod, string> = {
  [PaymentMethod.UPI]: 'UPI',
  [PaymentMethod.CARD]: 'Debit/Credit Card',
  [PaymentMethod.CASH]: 'Cash on Pickup',
};
