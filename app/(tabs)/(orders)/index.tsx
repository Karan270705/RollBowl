import React from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radii, Shadows } from '@/src/constants/theme';
import { ScreenWrapper, Section } from '@/src/components/layout';
import { Button, StatusBadge, EmptyState } from '@/src/components/ui';
import { MOCK_ORDERS } from '@/src/constants/mockData';
import { useCartItemCount } from '@/src/store';
import { formatCurrency, formatRelativeTime } from '@/src/utils/formatters';

export default function OrdersScreen() {
  const router = useRouter();
  const cartCount = useCartItemCount();
  const userOrders = MOCK_ORDERS.filter((o) => o.userId === 'user-1');

  return (
    <ScreenWrapper>
      <View style={styles.header}>
        <Text style={styles.title}>My Orders</Text>
        <Button
          title={`Cart${cartCount > 0 ? ` (${cartCount})` : ''}`}
          variant="secondary"
          size="sm"
          onPress={() => router.push('/(tabs)/(orders)/cart' as any)}
          leftIcon={<Ionicons name="cart-outline" size={16} color={Colors.primary} />}
        />
      </View>

      {userOrders.length === 0 ? (
        <EmptyState icon="receipt-outline" title="No orders yet" subtitle="Your order history will appear here" />
      ) : (
        userOrders.map((order) => (
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
              <Text style={styles.total}>{formatCurrency(order.total)}</Text>
              <Text style={styles.time}>{formatRelativeTime(order.createdAt)}</Text>
            </View>
          </TouchableOpacity>
        ))
      )}
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: Spacing.xl, marginBottom: Spacing.base },
  title: { fontSize: Typography.size.xl, fontFamily: Typography.family.bold, color: Colors.textPrimary },
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
