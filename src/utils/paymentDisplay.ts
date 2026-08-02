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
  const isSubscriptionCovered =
    order.orderType === OrderType.SUBSCRIPTION ||
    order.paymentMethod === PaymentMethod.SUBSCRIPTION ||
    ((order.items && order.items.some(i => !!i.subscriptionId)) && order.total === 0) ||
    (!!(order as any).subscription_id && order.total === 0);

  // 1. Fully subscription-covered orders
  if (isSubscriptionCovered && (order.total === 0 || order.orderType === OrderType.SUBSCRIPTION || order.paymentMethod === PaymentMethod.SUBSCRIPTION)) {
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

  // 3. Cash orders with remaining balance due
  if (order.paymentMethod === PaymentMethod.CASH && order.total > 0) {
    return {
      type: 'CASH',
      label: 'Cash due at pickup',
      amountDue: order.total,
    };
  }

  // 4. UPI orders
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

  // 5. Fallback without using cash as a generic fallback
  return {
    type: 'UNKNOWN',
    label: 'Payment Pending',
    amountDue: order.total,
  };
}
