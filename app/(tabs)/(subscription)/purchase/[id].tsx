import { ScreenWrapper, Section } from '@/src/components/layout';
import { Button } from '@/src/components/ui';
import { Colors, Radii, Shadows, Spacing, Typography } from '@/src/constants/theme';
import { usePurchaseSubscription, useSubscriptionPlan } from '@/src/hooks';
import { useUser } from '@/src/store';
import { formatCurrency } from '@/src/utils/formatters';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function SubscriptionPurchaseScreen() {
  const { id, termsVersion } = useLocalSearchParams<{ id: string; termsVersion: string }>();
  const router = useRouter();
  const user = useUser();
  const [selectedPayment, setSelectedPayment] = useState<string>('card-1');

  const { data: plan, isLoading } = useSubscriptionPlan(id);
  const purchaseMutation = usePurchaseSubscription();

  const handlePurchase = () => {
    if (!user || !plan || !termsVersion) return;
    purchaseMutation.mutate({ userId: user.id, plan, termsVersion }, {
      onSuccess: () => {
        router.replace('/(tabs)/(subscription)/success');
      }
    });
  };

  if (isLoading || !plan) {
    return (
      <ScreenWrapper>
        <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: Spacing['2xl'] }} />
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.title}>Review & Confirm</Text>
          <Text style={styles.subtitle}>Complete your subscription</Text>
        </View>

        <Section title="Selected Plan">
          <View style={styles.planCard}>
            <View style={styles.planHeader}>
              <View>
                <Text style={styles.planName}>{plan.name}</Text>
                <Text style={styles.planMeals}>{plan.totalMeals} total credits</Text>
              </View>
              <View style={styles.planPriceContainer}>
                <Text style={styles.planPrice}>{formatCurrency(plan.price)}</Text>
              </View>
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

        <Section title="Payment Method">
          <TouchableOpacity
            style={[styles.paymentCard, selectedPayment === 'card-1' && styles.paymentCardSelected]}
            onPress={() => setSelectedPayment('card-1')}
            activeOpacity={0.7}
          >
            <View style={styles.paymentInfo}>
              <Ionicons name="card" size={24} color={Colors.primary} />
              <View style={styles.paymentText}>
                <Text style={styles.paymentTitle}>Visa ending in 4242</Text>
                <Text style={styles.paymentSubtitle}>Expires 12/28</Text>
              </View>
            </View>
            <View style={styles.radio}>
              {selectedPayment === 'card-1' && <View style={styles.radioInner} />}
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.paymentCard, selectedPayment === 'apple-pay' && styles.paymentCardSelected]}
            onPress={() => setSelectedPayment('apple-pay')}
            activeOpacity={0.7}
          >
            <View style={styles.paymentInfo}>
              <Ionicons name="logo-apple" size={24} color={Colors.textPrimary} />
              <View style={styles.paymentText}>
                <Text style={styles.paymentTitle}>Apple Pay</Text>
              </View>
            </View>
            <View style={styles.radio}>
              {selectedPayment === 'apple-pay' && <View style={styles.radioInner} />}
            </View>
          </TouchableOpacity>
        </Section>

        <Section title="Order Summary">
          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Subscription total</Text>
              <Text style={styles.summaryValue}>{formatCurrency(plan.price)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Taxes & Fees</Text>
              <Text style={styles.summaryValue}>{formatCurrency(2.5)}</Text>
            </View>
            <View style={[styles.summaryRow, styles.totalRow]}>
              <Text style={styles.totalLabel}>Total Due Today</Text>
              <Text style={styles.totalValue}>{formatCurrency(plan.price + 2.5)}</Text>
            </View>
          </View>
        </Section>

      </ScrollView>

      <View style={styles.footer}>
        <Text style={styles.termsText}>
          By confirming, you agree to our Terms of Service and authorize recurring payments.
        </Text>
        <Button
          title={`Subscribe for ${formatCurrency(plan.price + 2.5)}`}
          onPress={handlePurchase}
          loading={purchaseMutation.isPending}
          fullWidth
        />
      </View>
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
  planCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radii.lg,
    padding: Spacing.lg,
    ...Shadows.md,
  },
  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    paddingBottom: Spacing.md,
    marginBottom: Spacing.md,
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
    fontSize: Typography.size.xl,
    fontFamily: Typography.family.bold,
    color: Colors.primary,
  },
  planFrequency: {
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
  },
  planFeatures: {
    gap: Spacing.sm,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  featureText: {
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
    marginLeft: Spacing.sm,
  },
  paymentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    borderRadius: Radii.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  paymentCardSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryBg,
  },
  paymentInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  paymentText: {
    marginLeft: Spacing.md,
  },
  paymentTitle: {
    fontSize: Typography.size.base,
    fontFamily: Typography.family.medium,
    color: Colors.textPrimary,
  },
  paymentSubtitle: {
    fontSize: Typography.size.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.primary,
  },
  summaryCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radii.lg,
    padding: Spacing.md,
    ...Shadows.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
  },
  summaryLabel: {
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
  },
  summaryValue: {
    fontSize: Typography.size.sm,
    fontFamily: Typography.family.medium,
    color: Colors.textPrimary,
  },
  totalRow: {
    marginTop: Spacing.sm,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  totalLabel: {
    fontSize: Typography.size.base,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
  },
  totalValue: {
    fontSize: Typography.size.lg,
    fontFamily: Typography.family.bold,
    color: Colors.primary,
  },
  footer: {
    padding: Spacing.md,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  termsText: {
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
});
