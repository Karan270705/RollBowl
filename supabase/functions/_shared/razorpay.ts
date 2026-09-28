import { createHmac } from 'node:crypto';

export interface RazorpayConfig {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
}

export function verifyPaymentSignature(
  orderId: string,
  paymentId: string,
  signature: string,
  secret: string
): boolean {
  const generated = createHmac('sha256', secret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  return generated === signature;
}

export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const generated = createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  return generated === signature;
}

export async function createRazorpayOrder(
  amount: number, // in paise
  currency: string,
  receipt: string,
  notes: Record<string, string>,
  config: RazorpayConfig
) {
  const auth = Buffer.from(`${config.keyId}:${config.keySecret}`).toString('base64');

  const response = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount,
      currency,
      receipt,
      notes,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Razorpay API error: ${error}`);
  }

  return await response.json();
}

export async function fetchPaymentDetails(
  paymentId: string,
  config: RazorpayConfig
) {
  const auth = Buffer.from(`${config.keyId}:${config.keySecret}`).toString('base64');

  const response = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}`, {
    method: 'GET',
    headers: {
      'Authorization': `Basic ${auth}`,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Razorpay API error: ${error}`);
  }

  return await response.json();
}

// Type definitions
export interface RazorpayOrder {
  id: string;
  entity: 'order';
  amount: number;
  amount_paid: number;
  amount_due: number;
  currency: string;
  receipt: string;
  status: 'created' | 'attempted' | 'paid';
  notes: Record<string, string>;
  created_at: number;
}

export interface RazorpayPayment {
  id: string;
  entity: 'payment';
  amount: number;
  currency: string;
  status: 'created' | 'authorized' | 'captured' | 'refunded' | 'failed';
  order_id: string;
  method: string;
  captured: boolean;
  created_at: number;
}

export interface RazorpayWebhookEvent {
  entity: string;
  account_id: string;
  event: string;
  contains: string[];
  payload: {
    payment?: {
      entity: RazorpayPayment;
    };
    order?: {
      entity: RazorpayOrder;
    };
  };
  created_at: number;
}
