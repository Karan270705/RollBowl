import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radii } from '@/src/constants/theme';
import {
  usePaymentProofForOrder,
  usePaymentProofForSubscriptionRequest,
  useCreatePaymentProofSignedUrl,
} from '@/src/hooks/payments/usePayments';

interface CustomerPaymentProofModalProps {
  visible: boolean;
  onClose: () => void;
  orderId?: string;
  subscriptionRequestId?: string;
}

export const CustomerPaymentProofModal: React.FC<CustomerPaymentProofModalProps> = ({
  visible,
  onClose,
  orderId,
  subscriptionRequestId,
}) => {
  const [imageError, setImageError] = useState(false);

  // 1. Fetch Proof Data
  const {
    data: orderProof,
    isLoading: isLoadingOrderProof,
    error: orderProofError,
    refetch: refetchOrderProof,
  } = usePaymentProofForOrder(orderId || '');

  const {
    data: subProof,
    isLoading: isLoadingSubProof,
    error: subProofError,
    refetch: refetchSubProof,
  } = usePaymentProofForSubscriptionRequest(subscriptionRequestId || '');

  const proof = orderId ? orderProof : subProof;
  const isLoadingProof = orderId ? isLoadingOrderProof : isLoadingSubProof;
  const proofError = orderId ? orderProofError : subProofError;

  // 2. Fetch Signed URL
  const {
    data: signedUrlData,
    isLoading: isLoadingSignedUrl,
    error: signedUrlError,
    refetch: refetchSignedUrl,
  } = useCreatePaymentProofSignedUrl(proof?.screenshotPath);

  const handleRetry = () => {
    setImageError(false);
    if (orderId) refetchOrderProof();
    else refetchSubProof();
    refetchSignedUrl();
  };

  const renderContent = () => {
    if (isLoadingProof || isLoadingSignedUrl) {
      return (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Fetching payment proof safely...</Text>
        </View>
      );
    }

    if (proofError || signedUrlError || !proof) {
      return (
        <View style={styles.centerContainer}>
          <Ionicons name="cloud-offline-outline" size={48} color={Colors.textTertiary} />
          <Text style={styles.errorText}>Payment screenshot is no longer available.</Text>
          <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }

    const formattedDate = new Date(proof.submittedAt).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    return (
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Metadata Details */}
        <View style={styles.metadataCard}>
          <Text style={styles.metadataTitle}>Payment Information</Text>
          
          <View style={styles.metadataRow}>
            <Text style={styles.metadataLabel}>Expected Amount:</Text>
            <Text style={[styles.metadataValue, { color: Colors.primary, fontWeight: 'bold' }]}>
              ₹{proof.expectedAmount.toFixed(2)}
            </Text>
          </View>
          
          <View style={styles.metadataRow}>
            <Text style={styles.metadataLabel}>Recipient UPI ID:</Text>
            <Text style={styles.metadataValue}>{proof.upiIdSnapshot}</Text>
          </View>

          <View style={styles.metadataRow}>
            <Text style={styles.metadataLabel}>Recipient Name:</Text>
            <Text style={styles.metadataValue}>{proof.recipientNameSnapshot}</Text>
          </View>

          <View style={styles.metadataRow}>
            <Text style={styles.metadataLabel}>Submitted At:</Text>
            <Text style={styles.metadataValue}>{formattedDate}</Text>
          </View>

          <View style={styles.metadataRow}>
            <Text style={styles.metadataLabel}>Status:</Text>
            <View style={[styles.statusBadge, { backgroundColor: getStatusColor(proof.status) + '15' }]}>
              <Text style={[styles.statusText, { color: getStatusColor(proof.status) }]}>
                {proof.status.toUpperCase()}
              </Text>
            </View>
          </View>

          {proof.rejectionReason && (
            <View style={styles.rejectionReasonBox}>
              <Text style={styles.rejectionLabel}>Rejection Reason:</Text>
              <Text style={styles.rejectionText}>{proof.rejectionReason}</Text>
            </View>
          )}
        </View>

        {/* Screenshot Image Frame */}
        <View style={styles.imageCard}>
          <Text style={styles.imageTitle}>Submitted Receipt Screenshot</Text>
          
          <View style={styles.imageContainer}>
            {imageError ? (
              <View style={styles.imageErrorContainer}>
                <Ionicons name="alert-circle-outline" size={40} color={Colors.error} />
                <Text style={styles.imageErrorText}>Failed to load receipt image</Text>
                <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
                  <Text style={styles.retryButtonText}>Reload Image</Text>
                </TouchableOpacity>
              </View>
            ) : signedUrlData?.signedUrl ? (
              <Image
                source={{ uri: signedUrlData.signedUrl }}
                style={styles.screenshot}
                contentFit="contain"
                onError={() => setImageError(true)}
              />
            ) : (
              <View style={styles.imageErrorContainer}>
                <ActivityIndicator size="small" color={Colors.primary} />
                <Text style={styles.imageErrorText}>Validating URL...</Text>
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <Text style={styles.modalHeaderTitle}>Uploaded Payment Proof</Text>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Ionicons name="close" size={24} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {renderContent()}
        </View>
      </View>
    </Modal>
  );
};

const getStatusColor = (status: string) => {
  switch (status) {
    case 'pending':
      return Colors.warningDark;
    case 'verified':
      return Colors.successDark;
    case 'rejected':
      return Colors.errorDark;
    default:
      return Colors.textSecondary;
  }
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'flex-end',
  },
  modalContent: {
    height: '80%',
    backgroundColor: Colors.background,
    borderTopLeftRadius: Radii.lg,
    borderTopRightRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radii.lg,
    borderTopRightRadius: Radii.lg,
  },
  modalHeaderTitle: {
    fontWeight: 'bold',
    fontSize: Typography.size.base,
    color: Colors.textPrimary,
  },
  closeButton: {
    padding: Spacing.xs,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  loadingText: {
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
    marginTop: Spacing.md,
  },
  errorText: {
    fontSize: Typography.size.base,
    color: Colors.textSecondary,
    marginTop: Spacing.md,
    textAlign: 'center',
    paddingHorizontal: Spacing.lg,
  },
  retryButton: {
    marginTop: Spacing.base,
    backgroundColor: Colors.surfaceElevated,
    borderColor: Colors.border,
    borderWidth: 1,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radii.sm,
  },
  retryButtonText: {
    fontWeight: 'bold',
    color: Colors.primary,
    fontSize: Typography.size.sm,
  },
  scrollContent: {
    padding: Spacing.base,
    paddingBottom: Spacing.xl,
  },
  metadataCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.base,
    marginBottom: Spacing.base,
  },
  metadataTitle: {
    fontWeight: 'bold',
    fontSize: Typography.size.base,
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
  },
  metadataRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.xs,
  },
  metadataLabel: {
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
  },
  metadataValue: {
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radii.xs,
  },
  statusText: {
    fontWeight: 'bold',
    fontSize: Typography.size.xs,
  },
  rejectionReasonBox: {
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  rejectionLabel: {
    fontWeight: 'bold',
    fontSize: Typography.size.xs,
    color: Colors.error,
    marginBottom: 2,
  },
  rejectionText: {
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
  },
  imageCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.base,
    marginBottom: Spacing.base,
  },
  imageTitle: {
    fontWeight: 'bold',
    fontSize: Typography.size.base,
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
  },
  imageContainer: {
    height: 380,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radii.sm,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  screenshot: {
    width: '100%',
    height: '100%',
  },
  imageErrorContainer: {
    padding: Spacing.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageErrorText: {
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
    marginTop: Spacing.sm,
  },
});
