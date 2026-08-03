import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radii, Shadows } from '@/src/constants/theme';
import { ScreenWrapper } from '@/src/components/layout';
import { EmptyState } from '@/src/components/ui';
import { formatCurrency, formatRelativeTime } from '@/src/utils/formatters';
import { useUser } from '@/src/store';
import { useSubscriptionRequests } from '@/src/hooks/payments/usePayments';
import { PaymentStatusBadge } from '@/src/components/payments/PaymentStatusBadge';
import { CustomerPaymentProofModal } from '@/src/components/payments/CustomerPaymentProofModal';

export default function PaymentHistoryScreen() {
  const router = useRouter();
  const user = useUser();
  const { data: requests = [], isLoading } = useSubscriptionRequests(user?.id);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [isProofModalVisible, setIsProofModalVisible] = useState(false);

  return (
    <ScreenWrapper>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Payment & Request History</Text>
      </View>

      {isLoading ? (
        <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: Spacing['2xl'] }} />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          {requests.length === 0 ? (
            <EmptyState icon="receipt-outline" title="No History Found" subtitle="Your past subscription purchase requests and payment attempts will appear here." />
          ) : (
            requests.map((req) => (
              <View key={req.id} style={styles.paymentCard}>
                <View style={styles.iconContainer}>
                  <Ionicons name="card-outline" size={20} color={Colors.primary} />
                </View>
                <View style={styles.detailsContainer}>
                  <Text style={styles.description}>Subscription Request</Text>
                  <Text style={styles.methodText}>{formatRelativeTime(req.requestedAt)}</Text>
                  {req.rejectionReason ? (
                    <Text style={{ fontSize: Typography.size.xs, color: Colors.error, marginTop: 4 }}>
                      Reason: {req.rejectionReason}
                    </Text>
                  ) : null}
                  <View style={{ marginTop: 6, alignSelf: 'flex-start' }}>
                    <PaymentStatusBadge status={req.status} />
                  </View>
                </View>
                <View style={styles.amountContainer}>
                  <Text style={styles.amount}>{formatCurrency(req.expectedAmount)}</Text>
                  <TouchableOpacity
                    style={{ marginTop: Spacing.xs }}
                    onPress={() => {
                      setSelectedRequestId(req.id);
                      setIsProofModalVisible(true);
                    }}
                  >
                    <Text style={{ fontSize: Typography.size.xs, color: Colors.primary, fontFamily: Typography.family.medium }}>
                      View Proof
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}

      <CustomerPaymentProofModal
        visible={isProofModalVisible}
        onClose={() => setIsProofModalVisible(false)}
        subscriptionRequestId={selectedRequestId || undefined}
      />
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    paddingBottom: Spacing.md,
  },
  backButton: {
    marginRight: Spacing.md,
  },
  title: {
    fontSize: Typography.size.xl,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
  },
  content: {
    paddingBottom: Spacing['3xl'],
  },
  paymentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radii.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    ...Shadows.sm,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: Radii.md,
    backgroundColor: Colors.primaryBg,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  detailsContainer: {
    flex: 1,
  },
  description: {
    fontSize: Typography.size.base,
    fontFamily: Typography.family.semiBold,
    color: Colors.textPrimary,
  },
  methodText: {
    fontSize: Typography.size.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  amountContainer: {
    alignItems: 'flex-end',
  },
  amount: {
    fontSize: Typography.size.base,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
  },
  status: {
    fontSize: Typography.size.xs,
    textTransform: 'capitalize',
    marginTop: 2,
  },
});
