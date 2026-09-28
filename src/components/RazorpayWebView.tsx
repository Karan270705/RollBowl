import React, { useRef } from 'react';
import { Modal, View, StyleSheet, ActivityIndicator, TouchableOpacity, Text } from 'react-native';
import { WebView } from 'react-native-webview';

interface RazorpayWebViewProps {
  visible: boolean;
  razorpayOrderId: string;
  amount: number;
  currency: string;
  keyId: string;
  onSuccess: (paymentId: string, orderId: string, signature: string) => void;
  onFailure: (reason?: string) => void;
  onCancel: () => void;
}

export default function RazorpayWebView({
  visible,
  razorpayOrderId,
  amount,
  currency,
  keyId,
  onSuccess,
  onFailure,
  onCancel,
}: RazorpayWebViewProps) {
  const webViewRef = useRef<WebView>(null);

  const razorpayHTML = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
    </head>
    <body>
      <script>
        const options = {
          key: "${keyId}",
          amount: ${amount},
          currency: "${currency}",
          order_id: "${razorpayOrderId}",
          name: "RollBowl",
          description: "Order Payment",
          handler: function(response) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'success',
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_signature: response.razorpay_signature
            }));
          },
          modal: {
            ondismiss: function() {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'cancel'
              }));
            }
          }
        };

        const rzp = new Razorpay(options);

        rzp.on('payment.failed', function(response) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'failed',
            error: response.error
          }));
        });

        // Auto-open checkout
        rzp.open();
      </script>
    </body>
    </html>
  `;

  const handleMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);

      if (data.type === 'success') {
        onSuccess(
          data.razorpay_payment_id,
          data.razorpay_order_id,
          data.razorpay_signature
        );
      } else if (data.type === 'failed') {
        onFailure(data.error?.description || 'Payment failed');
      } else if (data.type === 'cancel') {
        onCancel();
      }
    } catch (error) {
      console.error('Error parsing WebView message:', error);
      onFailure('Payment processing error');
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onCancel} style={styles.closeButton}>
            <Text style={styles.closeText}>✕ Close</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Complete Payment</Text>
        </View>

        <WebView
          ref={webViewRef}
          source={{ html: razorpayHTML }}
          onMessage={handleMessage}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          startInLoadingState={true}
          renderLoading={() => (
            <View style={styles.loading}>
              <ActivityIndicator size="large" color="#3b82f6" />
              <Text style={styles.loadingText}>Loading payment...</Text>
            </View>
          )}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  closeButton: {
    padding: 8,
  },
  closeText: {
    fontSize: 16,
    color: '#6b7280',
  },
  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    marginRight: 40, // Balance the close button
  },
  loading: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6b7280',
  },
});
