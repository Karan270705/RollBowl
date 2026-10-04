import { ScreenWrapper, Section } from '@/src/components/layout';
import { Button } from '@/src/components/ui';
import { Colors, Radii, Shadows, Spacing, Typography } from '@/src/constants/theme';
import { useSubscriptionPlan, usePrimaryStallId } from '@/src/hooks';
import { usePaymentSettings, useCreateSubscriptionRequest, useSubmitSubscriptionProof } from '@/src/hooks/payments/usePayments';
import { UpiPaymentPanel } from '@/src/components/payments/UpiPaymentPanel';
import { PaymentScreenshotPicker, SelectedImage } from '@/src/components/payments/PaymentScreenshotPicker';
import { uploadPaymentScreenshot } from '@/src/services/payments';
import { useUser } from '@/src/store';
import { useRazorpayPayment } from '@/src/hooks/useRazorpayPayment';
import RazorpayWebView from '@/src/components/RazorpayWebView';
import { PAYMENT_CONFIG } from '@/src/config/payment';
import { formatCurrency } from '@/src/utils/formatters';
import { supabase } from '@/src/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, useNavigation } from 'expo-router';
import React, { useState, useRef, useEffect } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View, Alert, BackHandler } from 'react-native';

interface AuthoritativeFinancials {
  requestId: string;
  baseAmount: number;
  convenienceFeePercent: number;
  convenienceFee: number;
  expectedAmount: number;
  currency: string;
}

export default function SubscriptionPurchaseScreen() {
  const {
    id,
    requestId: initialRequestId,
    rejected: isRejectedParam,
    rejectionReason: paramRejectionReason,
  } = useLocalSearchParams<{
    id: string;
    requestId?: string;
    rejected?: string;
    rejectionReason?: string;
  }>();
  const isRejected = isRejectedParam === 'true';
  const router = useRouter();
  const user = useUser();
  const { data: stallId } = usePrimaryStallId();

  const { data: plan, isLoading: isLoadingPlan } = useSubscriptionPlan(id);
  const { data: paymentSettings, isLoading: isLoadingSettings } = usePaymentSettings(stallId);

  const createReqMutation = useCreateSubscriptionRequest();
  const submitProofMutation = useSubmitSubscriptionProof();
  const { 
    initiatePayment, 
    handlePaymentSuccess, 
    handlePaymentFailure, 
    checkoutData, 
    showWebView 
  } = useRazorpayPayment();

  const [selectedImage, setSelectedImage] = useState<SelectedImage | null>(null);
  const [authoritativeData, setAuthoritativeData] = useState<AuthoritativeFinancials | null>(
    initialRequestId ? { requestId: initialRequestId, baseAmount: 0, convenienceFeePercent: 2, convenienceFee: 0, expectedAmount: 0, currency: 'INR' } : null
  );
  const [isUploading, setIsUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isInitiatingPayment, setIsInitiatingPayment] = useState(false);
  const navigation = useNavigation();

  const submittingRef = useRef(false);

  // Delete subscription request helper
  const deleteSubscriptionRequest = async (requestId: string) => {
    try {
      await supabase
        .from('subscription_purchase_requests')
        .delete()
        .eq('id', requestId);
    } catch (error) {
      console.error('Failed to delete subscription request:', error);
    }
  };

  // Prevent navigation during payment
  useEffect(() => {
    if (isInitiatingPayment || showWebView) {
      const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
        Alert.alert(
          'Payment in Progress',
          'Please complete or cancel the payment before going back.',
          [{ text: 'OK' }]
        );
        return true;
      });
      return () => backHandler.remove();
    }
  }, [isInitiatingPayment, showWebView]);

  useEffect(() => {
    if (isInitiatingPayment || showWebView) {
      navigation.setOptions({ gestureEnabled: false });
    } else {
      navigation.setOptions({ gestureEnabled: true });
    }
  }, [isInitiatingPayment, showWebView, navigation]);

  // Preview Calculations
  const previewBaseAmount = plan?.price ?? 0;
  const previewFeePercent = 2.00;
  const previewFeeAmount = Math.round((previewBaseAmount * previewFeePercent / 100) * 100) / 100;
  const previewExpectedAmount = Math.round((previewBaseAmount + previewFeeAmount) * 100) / 100;

  // Display Authoritative or Preview values
  const baseAmount = (authoritativeData && authoritativeData.baseAmount > 0) ? authoritativeData.baseAmount : previewBaseAmount;
  const feePercent = (authoritativeData && authoritativeData.convenienceFeePercent > 0) ? authoritativeData.convenienceFeePercent : previewFeePercent;
  const feeAmount = (authoritativeData && authoritativeData.convenienceFee > 0) ? authoritativeData.convenienceFee : previewFeeAmount;
  const totalAmount = (authoritativeData && authoritativeData.expectedAmount > 0) ? authoritativeData.expectedAmount : previewExpectedAmount;
  const currency = authoritativeData?.currency || 'INR';

  const handleSubmitSubscription = async () => {
    if (submittingRef.current) return;
    if (!PAYMENT_CONFIG.razorpay.enabled && !selectedImage) {
      setErrorMessage('Please select your UPI payment screenshot first.');
      return;
    }
    if (!user || !stallId || !plan) {
      setErrorMessage('Missing user, stall, or plan information.');
      return;
    }

    setErrorMessage(null);
    submittingRef.current = true;
    setIsUploading(true);

    try {
      let currentRequestId = authoritativeData?.requestId;
      let authoritativeExpectedAmount = totalAmount;

      if (!currentRequestId) {
        // Step 1: Create request (no proof upload if request creation fails)
        const created = await createReqMutation.mutateAsync({
          stallId: stallId,
          planId: plan.id,
        });

        currentRequestId = created.requestId;
        authoritativeExpectedAmount = created.expectedAmount;

        setAuthoritativeData({
          requestId: created.requestId,
          baseAmount: created.baseAmount,
          convenienceFeePercent: created.convenienceFeePercent,
          convenienceFee: created.convenienceFee,
          expectedAmount: created.expectedAmount,
          currency: created.currency,
        });
      }

      if (PAYMENT_CONFIG.razorpay.enabled) {
        setIsInitiatingPayment(true);
        await initiatePayment({
          type: 'subscription',
          entityId: currentRequestId,
          stallId: stallId,
          amount: authoritativeExpectedAmount,
          onSuccess: () => {}, // Handled by RazorpayWebView
          onError: (err) => {
            setErrorMessage(err);
          }
        });
        setIsInitiatingPayment(false);
      } else {
        // Step 2: Upload screenshot (preserve requestId if upload/linking fails)
        const uploadedPath = await uploadPaymentScreenshot(
          'subscriptions',
          user.id,
          selectedImage!.uri,
          selectedImage!.mimeType
        );

        // Step 3: Call submit_subscription_payment_proof
        await submitProofMutation.mutateAsync({
          requestId: currentRequestId,
          screenshotPath: uploadedPath,
          mimeType: selectedImage!.mimeType,
          size: selectedImage!.size,
        });

        // Step 4: Navigate to success
        router.replace({
          pathname: '/(tabs)/(subscription)/success',
          params: {
            isReplacement: isRejected ? 'true' : 'false',
            paymentGateway: 'upi' // For legacy UPI flow
          },
        } as any);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'An error occurred while submitting your subscription request.');
    } finally {
      submittingRef.current = false;
      setIsUploading(false);
    }
  };

  if (isLoadingPlan || isLoadingSettings || !plan) {
    return (
      <ScreenWrapper>
        <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: Spacing['2xl'] }} />
      </ScreenWrapper>
    );
  }

  const eligibleCategoriesList = plan.categoryCreditCosts
    ? Object.keys(plan.categoryCreditCosts).join(', ')
    : 'All Standard Meals';

  return (
    <ScreenWrapper>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.title}>{isRejected ? 'Payment proof rejected' : 'Review & Confirm'}</Text>
          <Text style={styles.subtitle}>{isRejected ? 'The payment could not be processed.' : 'Complete your subscription via UPI'}</Text>
        </View>

        {isRejected ? (
          <View style={styles.rejectionBox}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.xs }}>
              <Ionicons name="close-circle" size={20} color={Colors.error} style={{ marginRight: Spacing.sm }} />
              <Text style={styles.rejectionReasonTitle}>Reason: {paramRejectionReason || 'Payment could not be verified'}</Text>
            </View>
            <Text style={styles.rejectionInstruction}>Upload a corrected payment screenshot to continue.</Text>
          </View>
        ) : null}

        {errorMessage ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={20} color={Colors.error} style={{ marginRight: Spacing.sm }} />
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : null}

        <Section title="Plan Terms">
          <View style={styles.planCard}>
            <View style={styles.planHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.planName}>{plan.name}</Text>
                <Text style={styles.planMeals}>{plan.totalMeals} Total Credits • {plan.mealsPerDay} Credits / Day</Text>
              </View>
              <View style={styles.planPriceContainer}>
                <Text style={styles.planPrice}>{formatCurrency(plan.price)}</Text>
              </View>
            </View>

            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Validity:</Text>
              <Text style={styles.metaValue}>{plan.durationDays} Days (Inclusive)</Text>
            </View>

            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Eligible Categories:</Text>
              <Text style={styles.metaValue}>{eligibleCategoriesList}</Text>
            </View>

            <View style={styles.planFeatures}>
              {plan.features?.map((feature, index) => (
                <View key={index} style={styles.featureRow}>
                  <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
                  <Text style={styles.featureText}>{feature}</Text>
                </View>
              ))}
            </View>
          </View>
        </Section>

        <Section title="Payment Details">
          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Base Subscription Amount</Text>
              <Text style={styles.summaryValue}>{formatCurrency(baseAmount)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Convenience Fee ({feePercent}%)</Text>
              <Text style={styles.summaryValue}>{formatCurrency(feeAmount)}</Text>
            </View>
            <View style={[styles.summaryRow, styles.totalRow]}>
              <Text style={styles.totalLabel}>Final Payable Amount ({currency})</Text>
              <Text style={styles.totalValue}>{formatCurrency(totalAmount)}</Text>
            </View>
          </View>
        </Section>

        <Section title={PAYMENT_CONFIG.razorpay.enabled ? "Online Payment" : "UPI Payment Proof"}>
          {PAYMENT_CONFIG.razorpay.enabled ? (
            <View style={{ padding: Spacing.xl, backgroundColor: Colors.surfaceElevated, borderRadius: Radii.md, alignItems: 'center' }}>
              <Ionicons name="card" size={48} color={Colors.primary} />
              <Text style={{ marginTop: Spacing.sm, fontSize: Typography.size.md, fontFamily: Typography.family.medium, color: Colors.textPrimary }}>Pay securely with Razorpay</Text>
            </View>
          ) : paymentSettings ? (
            <UpiPaymentPanel
              amount={totalAmount}
              recipientName={paymentSettings.recipientName}
              upiId={paymentSettings.upiId}
              qrImagePath={paymentSettings.qrImagePath}
            >
              <PaymentScreenshotPicker
                onImageSelected={setSelectedImage}
                selectedImage={selectedImage}
                isUploading={isUploading}
              />
            </UpiPaymentPanel>
          ) : (
            <View style={styles.missingSettingsCard}>
              <Text style={styles.missingSettingsText}>UPI payment details are currently unavailable for this stall.</Text>
            </View>
          )}
        </Section>
      </ScrollView>

      <View style={styles.footer}>
        <Text style={styles.termsText}>
          {isRejected
            ? 'Upload a corrected payment screenshot to continue.'
            : `By submitting, you confirm payment of ${formatCurrency(totalAmount)}. Subscription activates after payment confirmation.`}
        </Text>
        <Button
          title={isRejected ? (PAYMENT_CONFIG.razorpay.enabled ? 'Pay Now' : 'Upload New Screenshot') : (PAYMENT_CONFIG.razorpay.enabled ? `Proceed to Payment • ${formatCurrency(totalAmount)}` : `Submit Subscription Request • ${formatCurrency(totalAmount)}`)}
          onPress={handleSubmitSubscription}
          loading={createReqMutation.isPending || submitProofMutation.isPending || isUploading || isInitiatingPayment}
          disabled={(!PAYMENT_CONFIG.razorpay.enabled && !selectedImage) || isUploading || createReqMutation.isPending || submitProofMutation.isPending || isInitiatingPayment}
          fullWidth
        />
      </View>

      {/* Loading overlay while initiating Razorpay */}
      {isInitiatingPayment && !showWebView && (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loadingText}>Initiating payment...</Text>
            <Text style={styles.loadingSubtext}>Please wait</Text>
          </View>
        </View>
      )}

      {/* Razorpay WebView */}
      {showWebView && checkoutData && (
        <RazorpayWebView
          visible={showWebView}
          razorpayOrderId={checkoutData.razorpay_order_id}
          amount={checkoutData.amount}
          currency={checkoutData.currency}
          keyId={checkoutData.key_id}
          onSuccess={(paymentId, paymentOrderId, signature) => {
            handlePaymentSuccess(
              paymentOrderId,
              paymentId,
              signature,
              () => {
                // For Razorpay, subscription is immediately active
                // Navigate to main subscription screen which will show active subscription
                router.replace('/(tabs)/(subscription)' as any);
              },
              (error) => {
                setErrorMessage(error);
              }
            );
          }}
          onFailure={(reason) => {
            handlePaymentFailure(
              async (error) => {
                // Delete the failed request
                if (authoritativeData?.requestId) {
                  await deleteSubscriptionRequest(authoritativeData.requestId);
                }
                setErrorMessage(error);
                Alert.alert(
                  'Payment Failed',
                  'Your payment could not be completed. Please try again.',
                  [
                    {
                      text: 'OK',
                      onPress: () => router.replace('/(tabs)/(subscription)' as any)
                    }
                  ]
                );
              },
              reason
            );
          }}
          onCancel={() => {
            handlePaymentFailure(
              async (error) => {
                // Delete the cancelled request
                if (authoritativeData?.requestId) {
                  await deleteSubscriptionRequest(authoritativeData.requestId);
                }
                setErrorMessage(error);
                Alert.alert(
                  'Payment Cancelled',
                  'You cancelled the payment.',
                  [
                    {
                      text: 'OK',
                      onPress: () => router.replace('/(tabs)/(subscription)' as any)
                    }
                  ]
                );
              },
              'User cancelled payment'
            );
          }}
        />
      )}
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: Spacing.xl,
  },
  header: {
    paddingVertical: Spacing.xl,
  },
  title: {
    fontSize: Typography.size.xl,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
  },
  subtitle: {
    fontSize: Typography.size.base,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.errorLight,
    padding: Spacing.md,
    borderRadius: Radii.md,
    marginBottom: Spacing.lg,
  },
  errorText: {
    color: Colors.error,
    fontFamily: Typography.family.medium,
    fontSize: Typography.size.sm,
    flex: 1,
  },
  rejectionBox: {
    backgroundColor: Colors.error + '15',
    borderRadius: Radii.md,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.error + '30',
  },
  rejectionReasonTitle: {
    fontSize: Typography.size.base,
    fontFamily: Typography.family.bold,
    color: Colors.error,
    flex: 1,
  },
  rejectionInstruction: {
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
    marginLeft: 28,
  },
  planCard: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radii.lg,
    padding: Spacing.lg,
    ...Shadows.sm,
  },
  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    paddingBottom: Spacing.md,
  },
  planName: {
    fontSize: Typography.size.lg,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
  },
  planMeals: {
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  planPriceContainer: {
    alignItems: 'flex-end',
  },
  planPrice: {
    fontSize: Typography.size.lg,
    fontFamily: Typography.family.bold,
    color: Colors.primary,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.xs,
  },
  metaLabel: {
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
    fontFamily: Typography.family.medium,
  },
  metaValue: {
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
    fontFamily: Typography.family.semiBold,
  },
  planFeatures: {
    gap: Spacing.sm,
    marginTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
    paddingTop: Spacing.md,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  featureText: {
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
  },
  summaryCard: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radii.lg,
    padding: Spacing.lg,
    ...Shadows.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  summaryLabel: {
    fontSize: Typography.size.base,
    color: Colors.textSecondary,
  },
  summaryValue: {
    fontSize: Typography.size.base,
    color: Colors.textPrimary,
    fontFamily: Typography.family.medium,
  },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
    paddingTop: Spacing.sm,
    marginTop: Spacing.xs,
    marginBottom: 0,
  },
  totalLabel: {
    fontSize: Typography.size.lg,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
  },
  totalValue: {
    fontSize: Typography.size.lg,
    fontFamily: Typography.family.bold,
    color: Colors.primary,
  },
  missingSettingsCard: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radii.md,
    padding: Spacing.lg,
    alignItems: 'center',
  },
  missingSettingsText: {
    color: Colors.textSecondary,
    fontSize: Typography.size.sm,
    textAlign: 'center',
  },
  footer: {
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
    backgroundColor: Colors.background,
  },
  termsText: {
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  loadingCard: {
    backgroundColor: '#fff',
    borderRadius: Radii.md,
    padding: Spacing['3xl'],
    alignItems: 'center',
    minWidth: 200,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  loadingText: {
    fontSize: Typography.size.base,
    fontFamily: Typography.family.semiBold,
    color: Colors.textPrimary,
    marginTop: Spacing.md,
  },
  loadingSubtext: {
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
    marginTop: 4,
  },
});
