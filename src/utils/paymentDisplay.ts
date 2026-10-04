/**
 * Authoritative Payment Display Resolver for RollBowl Customer App.
 * Governs UI labels, amount due, and verification copy across checkout confirmation,
 * order history, and order detail screens.
 * 
 * Rules:
 * - Fully subscription-covered orders must never show cash fallbacks or "Cash due at pickup".
 * - Direct cash orders display "Cash due at pickup".
 * - UPI orders display proof-required or verification-pending states accurately.
 */

import { Order } from '@/src/types/models';
import { OrderType, PaymentMethod, PaymentStatus, PaymentVerificationStatus } from '@/src/constants/enums';

export type OrderPaymentDisplay =
  | {
      type: 'SUBSCRIPTION';
      label: 'Covered by subscription';
      amountDue: 0;
    }
  | {
      type: 'CASH';
      label: 'Cash due at pickup';
      amountDue: number;
    }
  | {
      type: 'UPI_PENDING_PROOF';
      label: 'UPI payment proof required';
      amountDue: number;
    }
  | {
      type: 'UPI_VERIFICATION_PENDING';
      label: 'UPI verification pending';
      amountDue: number;
    }
  | {
      type: 'PAID';
      label: 'Paid';
      amountDue: 0;
    }
  | {
      type: 'UNKNOWN';
      label: 'Payment Pending';
      amountDue: number;
    };

/**
 * Derives the unified payment display state from an authoritative order.
 */
export function resolveOrderPaymentDisplay(order: Order): OrderPaymentDisplay {
  // Check if order is covered by subscription
  // A subscription order has items with subscriptionId and creditsUsed > 0
  const hasSubscriptionItems = order.items && order.items.some(i => !!i.subscriptionId && (i.creditsUsed ?? 0) > 0);
  const isSubscriptionCovered =
    order.orderType === OrderType.SUBSCRIPTION ||
    hasSubscriptionItems ||
    (!!(order as any).subscription_id && order.total === 0);

  // 1. Fully subscription-covered orders (total is 0 because subscription paid)
  if (isSubscriptionCovered && order.total === 0) {
    return {
      type: 'SUBSCRIPTION',
      label: 'Covered by subscription',
      amountDue: 0,
    };
  }

  // 2. Paid orders (that are not UPI awaiting verification)
  if (order.paymentStatus === PaymentStatus.PAID) {
    return {
      type: 'PAID',
      label: 'Paid',
      amountDue: 0,
    };
  }

  // 3. Subscription payment method (explicit)
  if (order.paymentMethod === PaymentMethod.SUBSCRIPTION) {
    return {
      type: 'SUBSCRIPTION',
      label: 'Covered by subscription',
      amountDue: 0,
    };
  }

  // 4. Cash orders with remaining balance due (but NOT subscription-covered orders)
  if (order.paymentMethod === PaymentMethod.CASH && order.total > 0 && !hasSubscriptionItems) {
    return {
      type: 'CASH',
      label: 'Cash due at pickup',
      amountDue: order.total,
    };
  }

  // 5. UPI orders
  if (order.paymentMethod === PaymentMethod.UPI) {
    if (order.paymentVerificationStatus === PaymentVerificationStatus.AWAITING_PROOF) {
      return {
        type: 'UPI_PENDING_PROOF',
        label: 'UPI payment proof required',
        amountDue: order.total,
      };
    }
    if (order.paymentVerificationStatus === PaymentVerificationStatus.PENDING) {
      return {
        type: 'UPI_VERIFICATION_PENDING',
        label: 'UPI verification pending',
        amountDue: order.total,
      };
    }
    if (order.paymentVerificationStatus === PaymentVerificationStatus.VERIFIED) {
      return {
        type: 'PAID',
        label: 'Paid',
        amountDue: 0,
      };
    }
    return {
      type: 'UPI_VERIFICATION_PENDING',
      label: 'UPI verification pending',
      amountDue: order.total,
    };
  }

  // 6. Razorpay orders
  if (order.paymentMethod === PaymentMethod.RAZORPAY) {
    if (order.paymentStatus === PaymentStatus.PENDING) {
      return {
        type: 'UNKNOWN',
        label: 'Payment Pending',
        amountDue: order.total,
      };
    }
  }

  // 7. Fallback without using cash as a generic fallback
  return {
    type: 'UNKNOWN',
    label: 'Payment Pending',
    amountDue: order.total,
  };
}
