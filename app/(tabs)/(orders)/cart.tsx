import React from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radii, Shadows } from '@/src/constants/theme';
import { ScreenWrapper } from '@/src/components/layout';
import { Button, EmptyState } from '@/src/components/ui';
import { QuantitySelector } from '@/src/components/shared';
import { useCartStore } from '@/src/store';
import { formatCurrency } from '@/src/utils/formatters';

export default function CartScreen() {
  const router = useRouter();
  const { items, updateQuantity, removeItem, getSubtotal, clearCart } = useCartStore();
  const subtotal = getSubtotal();
  const tax = Math.round(subtotal * 0.05);
  const total = subtotal + tax;

  if (items.length === 0) {
    return (
      <ScreenWrapper>
        <EmptyState
          icon="cart-outline"
          title="Your cart is empty"
          subtitle="Add some delicious meals to get started"
          action={<Button title="Browse Meals" onPress={() => router.push('/(tabs)/(home)' as any)} />}
        />
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Cart ({items.length})</Text>
        <TouchableOpacity onPress={clearCart}><Text style={styles.clearText}>Clear</Text></TouchableOpacity>
      </View>

      {items.map((item) => (
        <View key={item.meal.id} style={styles.cartItem}>
          <Image source={{ uri: item.meal.imageUrl }} style={styles.itemImage} />
          <View style={styles.itemInfo}>
            <Text style={styles.itemName} numberOfLines={1}>{item.meal.name}</Text>
            <Text style={styles.itemPrice}>{formatCurrency(item.meal.price)}</Text>
            <QuantitySelector
              quantity={item.quantity}
              onIncrement={() => updateQuantity(item.meal.id, item.quantity + 1)}
              onDecrement={() => updateQuantity(item.meal.id, item.quantity - 1)}
              min={0}
            />
          </View>
          <TouchableOpacity onPress={() => removeItem(item.meal.id)} style={styles.removeBtn}>
            <Ionicons name="trash-outline" size={18} color={Colors.error} />
          </TouchableOpacity>
        </View>
      ))}

      <View style={styles.summary}>
        <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Subtotal</Text><Text style={styles.summaryValue}>{formatCurrency(subtotal)}</Text></View>
        <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Tax (5%)</Text><Text style={styles.summaryValue}>{formatCurrency(tax)}</Text></View>
        <View style={[styles.summaryRow, styles.totalRow]}><Text style={styles.totalLabel}>Total</Text><Text style={styles.totalValue}>{formatCurrency(total)}</Text></View>
      </View>

      <Button title="Proceed to Checkout" onPress={() => router.push('/(tabs)/(orders)/checkout' as any)} fullWidth size="lg" />
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: Spacing.xl, marginBottom: Spacing.base },
  title: { fontSize: Typography.size.lg, fontFamily: Typography.family.bold, color: Colors.textPrimary },
  clearText: { fontSize: Typography.size.sm, fontFamily: Typography.family.medium, color: Colors.error },
  cartItem: {
    flexDirection: 'row', backgroundColor: Colors.surface, borderRadius: Radii.lg,
    padding: Spacing.md, marginBottom: Spacing.md, ...Shadows.sm, alignItems: 'center',
  },
  itemImage: { width: 70, height: 70, borderRadius: Radii.md, backgroundColor: Colors.surfaceElevated },
  itemInfo: { flex: 1, marginLeft: Spacing.md, gap: Spacing.xs },
  itemName: { fontSize: Typography.size.base, fontFamily: Typography.family.semiBold, color: Colors.textPrimary },
  itemPrice: { fontSize: Typography.size.sm, fontFamily: Typography.family.medium, color: Colors.primary },
  removeBtn: { padding: Spacing.sm },
  summary: {
    backgroundColor: Colors.surface, borderRadius: Radii.lg,
    padding: Spacing.base, marginVertical: Spacing.base, ...Shadows.sm,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.sm },
  summaryLabel: { fontSize: Typography.size.sm, color: Colors.textSecondary },
  summaryValue: { fontSize: Typography.size.sm, fontFamily: Typography.family.medium, color: Colors.textPrimary },
  totalRow: { borderTopWidth: 1, borderTopColor: Colors.borderLight, paddingTop: Spacing.sm, marginBottom: 0 },
  totalLabel: { fontSize: Typography.size.md, fontFamily: Typography.family.bold, color: Colors.textPrimary },
  totalValue: { fontSize: Typography.size.md, fontFamily: Typography.family.bold, color: Colors.primary },
});
