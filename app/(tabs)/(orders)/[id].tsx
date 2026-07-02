import { ScreenWrapper, Section } from '@/src/components/layout';
import { Button, LoadingSpinner, StatusBadge } from '@/src/components/ui';
import { OrderStatus } from '@/src/constants/enums';
import { Colors, Radii, Shadows, Spacing, Typography } from '@/src/constants/theme';
import { useOrder } from '@/src/hooks';
import { formatCurrency, formatRelativeTime } from '@/src/utils/formatters';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

export default function OrderDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const { data: order, isLoading } = useOrder(id);

  if (isLoading) {
    return (
      <ScreenWrapper>
        <LoadingSpinner fullScreen message="Loading order details..." />
      </ScreenWrapper>
    );
  }

  if (!order) {
    return (
      <ScreenWrapper>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={48} color={Colors.error} />
          <Text style={styles.errorTitle}>Order Not Found</Text>
          <Text style={styles.errorText}>We couldn't find the details for this order.</Text>
          <Button title="Back to Orders" onPress={() => router.back()} style={{ marginTop: Spacing.xl }} />
        </View>
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.orderNumber}>{order.orderNumber}</Text>
            <Text style={styles.date}>{formatRelativeTime(order.createdAt)}</Text>
          </View>
          <StatusBadge status={order.status} />
        </View>

        {/* Tracking Action (Only for active orders) */}
        {order.status !== OrderStatus.PICKED_UP && order.status !== OrderStatus.CANCELLED && (
          <View style={styles.trackCard}>
            <View style={styles.trackInfo}>
              <Ionicons name="location" size={24} color={Colors.primary} />
              <View style={styles.trackTextContainer}>
                <Text style={styles.trackTitle}>Track your order</Text>
                <Text style={styles.trackSubtitle}>See real-time status updates</Text>
              </View>
            </View>
            <Button
              title="Track"
              onPress={() => router.push(`/(tabs)/(orders)/track/${order.id}` as any)}
              size="sm"
            />
          </View>
        )}

        {/* Stall Info */}
        <Section title="Stall Details">
          <View style={styles.stallCard}>
            <Ionicons name="storefront-outline" size={20} color={Colors.textSecondary} style={styles.stallIcon} />
            <Text style={styles.stallName}>{order.stallName}</Text>
          </View>
        </Section>

        {/* Order Items */}
        <Section title="Order Items">
          <View style={styles.itemsCard}>
            {order.items.map((item, index) => (
              <View
                key={item.id}
                style={[
                  styles.itemRow,
                  index < order.items.length - 1 && styles.borderBottom
                ]}
              >
                <View style={styles.itemQuantity}>
                  <Text style={styles.quantityText}>{item.quantity}x</Text>
                </View>
                <View style={styles.itemDetails}>
                  <Text style={styles.itemName}>{item.mealName}</Text>
                  {/* Add-ons unsupported in current DB schema for order items, omitting */}
                </View>
                <Text style={styles.itemPrice}>{formatCurrency(item.totalPrice)}</Text>
              </View>
            ))}
          </View>
        </Section>

        {/* Payment Summary */}
        <Section title="Payment Summary">
          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Subtotal</Text>
              <Text style={styles.summaryValue}>{formatCurrency(order.subtotal)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Taxes & Fees</Text>
              <Text style={styles.summaryValue}>{formatCurrency(order.tax)}</Text>
            </View>
            <View style={[styles.summaryRow, styles.totalRow]}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>{formatCurrency(order.total)}</Text>
            </View>
          </View>
        </Section>
      </ScrollView>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  errorTitle: {
    fontSize: Typography.size.xl,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    marginTop: Spacing.md,
  },
  errorText: {
    fontSize: Typography.size.base,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: Spacing.sm,
  },
  scrollContent: {
    paddingBottom: Spacing.xl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: Spacing.xl,
  },
  orderNumber: {
    fontSize: Typography.size.xl,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
  },
  date: {
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
  },
  trackCard: {
    backgroundColor: Colors.primaryBg,
    borderRadius: Radii.lg,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.primary + '30',
  },
  trackInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  trackTextContainer: {
    marginLeft: Spacing.md,
  },
  trackTitle: {
    fontSize: Typography.size.base,
    fontFamily: Typography.family.semiBold,
    color: Colors.primary,
  },
  trackSubtitle: {
    fontSize: Typography.size.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  stallCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radii.md,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    ...Shadows.sm,
  },
  stallIcon: {
    marginRight: Spacing.sm,
  },
  stallName: {
    fontSize: Typography.size.base,
    fontFamily: Typography.family.medium,
    color: Colors.textPrimary,
  },
  itemsCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radii.lg,
    paddingHorizontal: Spacing.md,
    ...Shadows.sm,
  },
  itemRow: {
    flexDirection: 'row',
    paddingVertical: Spacing.md,
  },
  borderBottom: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  itemQuantity: {
    backgroundColor: Colors.surfaceElevated,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radii.sm,
    height: 28,
    marginRight: Spacing.md,
    justifyContent: 'center',
  },
  quantityText: {
    fontSize: Typography.size.sm,
    fontFamily: Typography.family.bold,
    color: Colors.primary,
  },
  itemDetails: {
    flex: 1,
  },
  itemName: {
    fontSize: Typography.size.base,
    fontFamily: Typography.family.medium,
    color: Colors.textPrimary,
  },
  itemAddons: {
    fontSize: Typography.size.xs,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  itemPrice: {
    fontSize: Typography.size.base,
    fontFamily: Typography.family.medium,
    color: Colors.textPrimary,
    marginLeft: Spacing.md,
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
});
