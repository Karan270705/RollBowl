import React, { useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, Typography, Spacing, Radii, Shadows } from '@/src/constants/theme';
import { ScreenWrapper, Section } from '@/src/components/layout';
import { StatusBadge, EmptyState, LoadingSpinner } from '@/src/components/ui';
import { PaymentStatusBadge } from '@/src/components/payments/PaymentStatusBadge';
import { StickyCartBar } from '@/src/components/shared';
import { useUser } from '@/src/store';
import { useUserOrders } from '@/src/hooks';
import { formatCurrency, formatRelativeTime } from '@/src/utils/formatters';
import type { Order } from '@/src/types/models';
import { OrderStatus, PaymentMethod } from '@/src/constants/enums';

export default function OrdersScreen() {
  const router = useRouter();
  const user = useUser();
  const { data: orders = [], isLoading, isError } = useUserOrders(user?.id);

  // Group orders
  const { activeOrders, recentOrders } = useMemo(() => {
    const active: Order[] = [];
    const recent: Order[] = [];

    const activeStatuses = [
      OrderStatus.PENDING,
      OrderStatus.CONFIRMED,
      OrderStatus.PREPARING,
      OrderStatus.READY,
    ];

    const recentStatuses = [
      OrderStatus.PICKED_UP,
      OrderStatus.CANCELLED,
    ];

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    orders.forEach((order) => {
      if (activeStatuses.includes(order.status)) {
        active.push(order);
      } else if (recentStatuses.includes(order.status)) {
        const orderDate = new Date(order.createdAt);
        if (orderDate >= sevenDaysAgo) {
          recent.push(order);
        }
      }
    });

    return { activeOrders: active, recentOrders: recent };
  }, [orders]);

  if (isLoading) {
    return (
      <ScreenWrapper>
        <View style={styles.header}>
          <Text style={styles.title}>My Orders</Text>
        </View>
        <LoadingSpinner fullScreen message="Loading orders..." />
      </ScreenWrapper>
    );
  }

  if (isError) {
    return (
      <ScreenWrapper>
        <View style={styles.header}>
          <Text style={styles.title}>My Orders</Text>
        </View>
        <EmptyState icon="cloud-offline-outline" title="Error" subtitle="Failed to load orders." />
      </ScreenWrapper>
    );
  }

  const hasNoOrders = activeOrders.length === 0 && recentOrders.length === 0;

  const renderOrderCard = (order: Order) => (
    <TouchableOpacity 
      key={order.id} 
      style={styles.orderCard}
      onPress={() => router.push(`/(tabs)/(orders)/${order.id}` as any)}
      activeOpacity={0.7}
    >
      <View style={styles.orderHeader}>
        <Text style={styles.orderNumber}>{order.orderNumber}</Text>
        <StatusBadge status={order.status} />
      </View>
      <Text style={styles.stallName}>{order.stallName}</Text>
      <Text style={styles.items} numberOfLines={1}>
        {order.items.map((i) => `${i.quantity}x ${i.mealName}`).join(', ')}
      </Text>
      <View style={styles.orderFooter}>
        <View>
          <Text style={styles.total}>{formatCurrency(order.total)}</Text>
          {order.paymentMethod === PaymentMethod.UPI && (
            <PaymentStatusBadge status={order.paymentVerificationStatus} style={{ marginTop: Spacing.xs }} />
          )}
        </View>
        <Text style={styles.time}>{formatRelativeTime(order.createdAt)}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <ScreenWrapper scroll={false}>
      <View style={styles.header}>
        <Text style={styles.title}>My Orders</Text>
      </View>

      {hasNoOrders ? (
        <EmptyState 
          icon="receipt-outline" 
          title="No orders yet" 
          subtitle="Your placed orders will appear here." 
        />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {activeOrders.length > 0 && (
            <Section title="Active Orders">
              {activeOrders.map(renderOrderCard)}
            </Section>
          )}

          {recentOrders.length > 0 && (
            <Section title="Recent Orders">
              {recentOrders.map(renderOrderCard)}
            </Section>
          )}
        </ScrollView>
      )}
      <StickyCartBar />
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  header: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    paddingTop: Spacing.xl, 
    marginBottom: Spacing.base 
  },
  title: { fontSize: Typography.size.xl, fontFamily: Typography.family.bold, color: Colors.textPrimary },
  scrollContent: { paddingBottom: Spacing['3xl'] },
  orderCard: {
    backgroundColor: Colors.surface, borderRadius: Radii.lg,
    padding: Spacing.base, marginBottom: Spacing.md, ...Shadows.sm,
  },
  orderHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  orderNumber: { fontSize: Typography.size.base, fontFamily: Typography.family.bold, color: Colors.textPrimary },
  stallName: { fontSize: Typography.size.sm, color: Colors.textSecondary, marginTop: Spacing.xs },
  items: { fontSize: Typography.size.sm, color: Colors.textTertiary, marginTop: Spacing.xs },
  orderFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.md, paddingTop: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.borderLight },
  total: { fontSize: Typography.size.base, fontFamily: Typography.family.bold, color: Colors.textPrimary },
  time: { fontSize: Typography.size.sm, color: Colors.textTertiary },
});
