import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radii, Shadows } from '@/src/constants/theme';
import { ScreenWrapper } from '@/src/components/layout';
import { EmptyState } from '@/src/components/ui';
import { formatCurrency, formatRelativeTime } from '@/src/utils/formatters';

const MOCK_PAYMENTS = [
  { id: '1', date: new Date().toISOString(), amount: 15.50, method: 'Visa •••• 4242', status: 'completed', description: 'Order #RB-9823' },
  { id: '2', date: new Date(Date.now() - 86400000).toISOString(), amount: 25.00, method: 'Apple Pay', status: 'completed', description: 'Weekly Subscription' },
  { id: '3', date: new Date(Date.now() - 86400000 * 5).toISOString(), amount: 8.50, method: 'Visa •••• 4242', status: 'completed', description: 'Order #RB-8734' },
];

export default function PaymentHistoryScreen() {
  const router = useRouter();

  return (
    <ScreenWrapper>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Payment History</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {MOCK_PAYMENTS.length === 0 ? (
          <EmptyState icon="card-outline" title="No payments yet" subtitle="Your payment history will appear here." />
        ) : (
          MOCK_PAYMENTS.map((payment) => (
            <View key={payment.id} style={styles.paymentCard}>
              <View style={styles.iconContainer}>
                <Ionicons 
                  name={payment.method.includes('Apple') ? 'logo-apple' : 'card'} 
                  size={20} 
                  color={Colors.primary} 
                />
              </View>
              <View style={styles.detailsContainer}>
                <Text style={styles.description}>{payment.description}</Text>
                <Text style={styles.methodText}>{payment.method} • {formatRelativeTime(payment.date)}</Text>
              </View>
              <View style={styles.amountContainer}>
                <Text style={styles.amount}>{formatCurrency(payment.amount)}</Text>
                <Text style={[styles.status, { color: payment.status === 'completed' ? Colors.success : Colors.textSecondary }]}>
                  {payment.status}
                </Text>
              </View>
            </View>
          ))
        )}
      </ScrollView>
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
    paddingBottom: Spacing.xxl,
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
