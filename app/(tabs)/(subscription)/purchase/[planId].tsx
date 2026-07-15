import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors, Radii, Spacing, Typography } from '@/src/constants/theme';
import { ScreenWrapper } from '@/src/components/layout';
import { Button } from '@/src/components/ui';
import { UpiPaymentPanel } from '@/src/components/payments/UpiPaymentPanel';
import { PaymentScreenshotPicker, SelectedImage } from '@/src/components/payments/PaymentScreenshotPicker';
import { 
  useCreateSubscriptionRequest, 
  useSubmitSubscriptionProof, 
  usePaymentSettings 
} from '@/src/hooks/payments/usePayments';
import { useSubscriptionPlan, useOperationalWindow } from '@/src/hooks';
import { uploadPaymentScreenshot, parsePaymentBackendError } from '@/src/services/payments';
import { useUser } from '@/src/store';
import { Ionicons } from '@expo/vector-icons';
import { SubscriptionRequestStatus } from '@/src/constants/enums';
import { queryKeys } from '@/src/hooks/queryKeys';
import { useQueryClient } from '@tanstack/react-query';

export default function SubscriptionPurchaseScreen() {
  const { planId } = useLocalSearchParams<{ planId: string }>();
  const router = useRouter();
  const user = useUser();
  const queryClient = useQueryClient();

  const [requestId, setRequestId] = useState<string | null>(null);
  const [expectedAmount, setExpectedAmount] = useState<number | null>(null);
  const [selectedImage, setSelectedImage] = useState<SelectedImage | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isCreatingRequest, setIsCreatingRequest] = useState(false);

  const { data: plan, isLoading: isLoadingPlan } = useSubscriptionPlan(planId);
  const { data: opFacts } = useOperationalWindow();
  
  const stallId = opFacts?.activeMenu?.stall_id;
  const { data: paymentSettings, isLoading: isLoadingSettings } = usePaymentSettings(stallId);

  const createRequestMutation = useCreateSubscriptionRequest();
  const submitProofMutation = useSubmitSubscriptionProof();

  useEffect(() => {
    // If the plan and stall are ready, we could optionally pre-create the request.
    // However, it's safer to let the user tap a button or do it immediately on load if this screen represents intent.
    // For safety against ALREADY_PENDING errors if they back out and return, let's just show a button to start,
    // OR create it on mount and handle the error.
    // We will show a "Generate Request" button or handle it automatically.
  }, []);

  const handleStartPurchase = async () => {
    if (!stallId || !planId) return;

    try {
      setIsCreatingRequest(true);
      const res = await createRequestMutation.mutateAsync({
        stallId,
        planId,
      });
      setRequestId(res.requestId);
      setExpectedAmount(res.expectedAmount);
    } catch (error: any) {
      const parsed = parsePaymentBackendError(error);
      if (parsed.code === 'SUBSCRIPTION_REQUEST_ALREADY_PENDING') {
        // Find it in their history and recover
        const reqs = await queryClient.fetchQuery({
          queryKey: queryKeys.subscriptionRequests.list(user?.id || ''),
          queryFn: () => import('@/src/services/payments').then(m => m.fetchSubscriptionPurchaseRequests(user!.id)),
        });
        
        const existing = reqs.find(r => 
          r.planId === planId && 
          r.stallId === stallId && 
          (r.status === SubscriptionRequestStatus.AWAITING_PROOF || r.status === SubscriptionRequestStatus.VERIFICATION_PENDING)
        );

        if (existing) {
          setRequestId(existing.id);
          setExpectedAmount(existing.expectedAmount);
        } else {
          alert('You have a pending request, but we could not locate it. Please check your dashboard.');
        }
      } else {
        alert(parsed.message);
      }
    } finally {
      setIsCreatingRequest(false);
    }
  };

  const handleUploadProof = async () => {
    if (!user || !requestId || !selectedImage) return;

    try {
      setIsUploading(true);
      
      const storagePath = await uploadPaymentScreenshot(
        'subscriptions',
        user.id,
        selectedImage.uri,
        selectedImage.mimeType
      );

      await submitProofMutation.mutateAsync({
        requestId,
        screenshotPath: storagePath,
        mimeType: selectedImage.mimeType,
        size: selectedImage.size,
      });

      // Clear queries and go to dashboard
      alert('Payment proof submitted successfully! Awaiting kitchen verification.');
      router.replace('/(tabs)/(subscription)' as any);
    } catch (error) {
      console.error(error);
      const parsed = parsePaymentBackendError(error);
      alert(parsed.message);
    } finally {
      setIsUploading(false);
    }
  };

  if (isLoadingPlan || isLoadingSettings || !stallId) {
    return (
      <ScreenWrapper>
        <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: Spacing.xl }} />
      </ScreenWrapper>
    );
  }

  if (!paymentSettings || !paymentSettings.isActive) {
    return (
      <ScreenWrapper>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.xl }}>
          <Ionicons name="alert-circle" size={48} color={Colors.warning} />
          <Text style={{ fontSize: Typography.size.lg, fontFamily: Typography.family.bold, color: Colors.textPrimary, marginTop: Spacing.md }}>
            Payments Unavailable
          </Text>
          <Text style={{ fontSize: Typography.size.sm, color: Colors.textSecondary, textAlign: 'center', marginTop: Spacing.sm }}>
            Subscription payments are temporarily unavailable for this stall.
          </Text>
          <Button title="Go Back" onPress={() => router.back()} variant="outline" style={{ marginTop: Spacing.xl }} />
        </View>
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper>
      <View style={styles.header}>
        <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} onPress={() => router.back()} />
        <Text style={styles.title}>Purchase Subscription</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: Spacing['4xl'] }} showsVerticalScrollIndicator={false}>
        <View style={styles.planCard}>
          <Text style={styles.planName}>{plan?.name}</Text>
          <Text style={styles.planDesc}>{plan?.description}</Text>
        </View>

        {!requestId ? (
          <View style={{ marginTop: Spacing.xl }}>
            <Text style={{ fontSize: Typography.size.sm, color: Colors.textSecondary, marginBottom: Spacing.lg }}>
              A new payment request will be created to purchase this subscription plan.
            </Text>
            <Button
              title="Create Payment Request"
              onPress={handleStartPurchase}
              loading={isCreatingRequest}
              disabled={isCreatingRequest}
              fullWidth
            />
          </View>
        ) : (
          <View style={{ marginTop: Spacing.lg }}>
            <UpiPaymentPanel
              amount={expectedAmount || plan?.price || 0}
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
            
            <Button
              title={isUploading ? "Uploading..." : "Submit Payment Proof"}
              onPress={handleUploadProof}
              fullWidth
              size="lg"
              loading={isUploading}
              disabled={!selectedImage || isUploading}
              style={{ marginTop: Spacing.lg }}
            />
          </View>
        )}
      </ScrollView>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: Spacing.xl,
    marginBottom: Spacing.base,
  },
  title: {
    fontSize: Typography.size.lg,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
  },
  planCard: {
    backgroundColor: Colors.surface,
    padding: Spacing.lg,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  planName: {
    fontSize: Typography.size.xl,
    fontFamily: Typography.family.bold,
    color: Colors.primary,
  },
  planDesc: {
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
  },
});
