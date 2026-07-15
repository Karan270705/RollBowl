import { supabase } from '@/src/lib/supabase';
import { PaymentSettings, SubscriptionPurchaseRequest } from '@/src/types/models';
import { File } from 'expo-file-system';
import { SubmitPaymentProofRequest, SubmitSubscriptionPaymentProofRequest, CreateSubscriptionPurchaseRequest } from '@/src/types/api';
import { SubscriptionRequestStatus } from '@/src/constants/enums';

// ─── Error Parser ──────────────────────────────────────────────

export function parsePaymentBackendError(error: any): { code?: string; message: string; details?: unknown } {
  if (!error) return { message: 'An unknown error occurred.' };

  if (typeof error.message === 'string') {
    try {
      const parsed = JSON.parse(error.message);
      if (parsed.message) {
        return {
          code: parsed.code,
          message: parsed.message,
          details: parsed,
        };
      }
    } catch (e) {
      // Not JSON, just return the message
      return { message: error.message };
    }
  }

  return { message: error.message || 'An unknown error occurred.' };
}

// ─── Fetch Settings ───────────────────────────────────────────

export async function fetchPaymentSettings(stallId: string): Promise<PaymentSettings | null> {
  const { data, error } = await supabase
    .from('payment_settings')
    .select('*')
    .eq('stall_id', stallId)
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    throw new Error(parsePaymentBackendError(error).message);
  }

  if (!data) return null;

  return {
    id: data.id,
    stallId: data.stall_id,
    recipientName: data.recipient_name,
    upiId: data.upi_id,
    qrImagePath: data.qr_image_path,
    isActive: data.is_active,
  };
}

export function getPaymentQrPublicUrl(qrImagePath: string): string {
  return supabase.storage.from('payment-assets').getPublicUrl(qrImagePath).data.publicUrl;
}

// ─── Screenshots ──────────────────────────────────────────────

export async function uploadPaymentScreenshot(bucket: 'orders' | 'subscriptions', userId: string, uri: string, mimeType: string): Promise<string> {
  const fileExtension = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
  const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExtension}`;
  const filePath = `${bucket}/${userId}/${fileName}`;

  try {
    const file = new File(uri);
    const buffer = await file.arrayBuffer();
    
    const { data, error } = await supabase.storage
      .from('payment-proofs')
      .upload(filePath, buffer, {
        contentType: mimeType,
        upsert: false,
      });

    if (error) {
      throw error;
    }

    return data.path;
  } catch (err) {
    throw new Error(`Upload failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ─── Order Proofs ─────────────────────────────────────────────

export async function submitOrderPaymentProof(req: SubmitPaymentProofRequest): Promise<void> {
  const { data, error } = await supabase.rpc('submit_order_payment_proof', {
    p_order_id: req.orderId,
    p_screenshot_path: req.screenshotPath,
    p_mime_type: req.mimeType,
    p_size: req.size,
  });

  if (error) {
    throw new Error(parsePaymentBackendError(error).message);
  }
  
  if (data && (data as any).error) {
    throw new Error((data as any).message);
  }
}

// ─── Subscriptions ────────────────────────────────────────────

export async function createSubscriptionPurchaseRequest(req: CreateSubscriptionPurchaseRequest): Promise<{ requestId: string; expectedAmount: number }> {
  const { data, error } = await supabase.rpc('create_subscription_purchase_request', {
    p_stall_id: req.stallId,
    p_plan_id: req.planId,
  });

  if (error) {
    const parsed = parsePaymentBackendError(error);
    throw new Error(parsed.message, { cause: parsed.code });
  }

  // Handle successful structured response if applicable
  if (data && (data as any).error) {
    throw new Error((data as any).message, { cause: (data as any).error });
  }

  return {
    requestId: data.request_id,
    expectedAmount: Number(data.expected_amount),
  };
}

export async function submitSubscriptionPaymentProof(req: SubmitSubscriptionPaymentProofRequest): Promise<void> {
  const { data, error } = await supabase.rpc('submit_subscription_payment_proof', {
    p_request_id: req.requestId,
    p_screenshot_path: req.screenshotPath,
    p_mime_type: req.mimeType,
    p_size: req.size,
  });

  if (error) {
    throw new Error(parsePaymentBackendError(error).message);
  }
  
  if (data && (data as any).error) {
    throw new Error((data as any).message);
  }
}

export async function fetchSubscriptionPurchaseRequests(userId: string): Promise<SubscriptionPurchaseRequest[]> {
  const { data, error } = await supabase
    .from('subscription_purchase_requests')
    .select('*')
    .eq('user_id', userId)
    .order('requested_at', { ascending: false });

  if (error) {
    throw new Error(parsePaymentBackendError(error).message);
  }

  if (!data) return [];

  return data.map((row) => ({
    id: row.id,
    userId: row.user_id,
    stallId: row.stall_id,
    planId: row.plan_id,
    expectedAmount: Number(row.expected_amount),
    status: row.status as SubscriptionRequestStatus,
    currentPaymentProofId: row.current_payment_proof_id ?? undefined,
    requestedAt: row.requested_at,
    approvedAt: row.approved_at ?? undefined,
    rejectedAt: row.rejected_at ?? undefined,
    rejectionReason: row.rejection_reason ?? undefined,
    createdSubscriptionId: row.created_subscription_id ?? undefined,
  }));
}

export interface CustomerPaymentProof {
  id: string;
  userId: string;
  stallId: string;
  orderId?: string;
  subscriptionRequestId?: string;
  paymentContext: 'order' | 'subscription';
  expectedAmount: number;
  upiIdSnapshot: string;
  recipientNameSnapshot: string;
  screenshotPath: string;
  screenshotMimeType?: string;
  screenshotSizeBytes?: number;
  status: 'pending' | 'verified' | 'rejected' | 'superseded';
  submittedAt: string;
  verifiedAt?: string;
  rejectedAt?: string;
  rejectionReason?: string;
}

export async function fetchPaymentProofForOrder(orderId: string): Promise<CustomerPaymentProof | null> {
  const { data, error } = await supabase
    .from('payment_proofs')
    .select('*')
    .eq('order_id', orderId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(parsePaymentBackendError(error).message);
  if (!data) return null;

  return {
    id: data.id,
    userId: data.user_id,
    stallId: data.stall_id,
    orderId: data.order_id,
    subscriptionRequestId: data.subscription_request_id,
    paymentContext: data.payment_context,
    expectedAmount: Number(data.expected_amount),
    upiIdSnapshot: data.upi_id_snapshot,
    recipientNameSnapshot: data.recipient_name_snapshot,
    screenshotPath: data.screenshot_path,
    screenshotMimeType: data.screenshot_mime_type,
    screenshotSizeBytes: Number(data.screenshot_size_bytes),
    status: data.status,
    submittedAt: data.submitted_at,
    verifiedAt: data.verified_at,
    rejectedAt: data.rejected_at,
    rejectionReason: data.rejection_reason,
  };
}

export async function fetchPaymentProofForSubscriptionRequest(requestId: string): Promise<CustomerPaymentProof | null> {
  const { data, error } = await supabase
    .from('payment_proofs')
    .select('*')
    .eq('subscription_request_id', requestId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(parsePaymentBackendError(error).message);
  if (!data) return null;

  return {
    id: data.id,
    userId: data.user_id,
    stallId: data.stall_id,
    orderId: data.order_id,
    subscriptionRequestId: data.subscription_request_id,
    paymentContext: data.payment_context,
    expectedAmount: Number(data.expected_amount),
    upiIdSnapshot: data.upi_id_snapshot,
    recipientNameSnapshot: data.recipient_name_snapshot,
    screenshotPath: data.screenshot_path,
    screenshotMimeType: data.screenshot_mime_type,
    screenshotSizeBytes: Number(data.screenshot_size_bytes),
    status: data.status,
    submittedAt: data.submitted_at,
    verifiedAt: data.verified_at,
    rejectedAt: data.rejected_at,
    rejectionReason: data.rejection_reason,
  };
}

export async function createPaymentProofSignedUrl(screenshotPath: string): Promise<{ signedUrl: string; expiresIn: number }> {
  const { data, error } = await supabase.storage
    .from('payment-proofs')
    .createSignedUrl(screenshotPath, 120); // 120 seconds expiry

  if (error) throw error;
  if (!data || !data.signedUrl) throw new Error('SIGNED_URL_FAILED');

  return {
    signedUrl: data.signedUrl,
    expiresIn: 120,
  };
}

