import { useState } from 'react';
import { supabase } from '../lib/supabase';

interface RazorpayOptions {
  type: 'order' | 'subscription';
  entityId: string;
  stallId: string;
  amount: number; // For display only
  onSuccess: () => void;
  onError: (error: string) => void;
}

interface RazorpayCheckoutData {
  razorpay_order_id: string;
  amount: number;
  currency: string;
  key_id: string;
}

export function useRazorpayPayment() {
  const [checkoutData, setCheckoutData] = useState<RazorpayCheckoutData | null>(null);
  const [showWebView, setShowWebView] = useState(false);

  const initiatePayment = async (options: RazorpayOptions) => {
    try {
      // Step 1: Create Razorpay order via Edge Function
      const { data, error } = await supabase.functions.invoke('create-razorpay-order', {
        body: {
          type: options.type,
          entity_id: options.entityId,
          stall_id: options.stallId,
        },
      });

      if (error || !data?.success) {
        throw new Error(error?.message || data?.error || 'Failed to create order');
      }

      const { razorpay_order_id, amount, currency, key_id } = data.data;

      // Step 2: Store checkout data and show WebView
      setCheckoutData({
        razorpay_order_id,
        amount,
        currency,
        key_id,
      });
      setShowWebView(true);

      // The WebView component will handle the rest
      // Success/failure callbacks will be triggered from there
      return { razorpay_order_id, showWebView: true };

    } catch (error: any) {
      console.error('Razorpay payment error:', error);
      options.onError(error.message || 'Payment failed');
      return { error: error.message, showWebView: false };
    }
  };

  const handlePaymentSuccess = async (
    razorpay_order_id: string,
    razorpay_payment_id: string,
    razorpay_signature: string,
    onSuccess: () => void,
    onError: (error: string) => void
  ) => {
    try {
      // Verify payment via Edge Function
      const { data: verifyData, error: verifyError } = await supabase.functions.invoke(
        'verify-razorpay-payment',
        {
          body: {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
          },
        }
      );

      if (verifyError || !verifyData?.success) {
        throw new Error('Payment verification failed');
      }

      // Success!
      setShowWebView(false);
      setCheckoutData(null);
      onSuccess();
    } catch (error: any) {
      console.error('Payment verification error:', error);
      setShowWebView(false);
      setCheckoutData(null);
      onError(error.message || 'Payment verification failed');
    }
  };

  const handlePaymentFailure = (onError: (error: string) => void, reason?: string) => {
    setShowWebView(false);
    setCheckoutData(null);
    onError(reason || 'Payment cancelled or failed');
  };

  return {
    initiatePayment,
    handlePaymentSuccess,
    handlePaymentFailure,
    checkoutData,
    showWebView,
  };
}
