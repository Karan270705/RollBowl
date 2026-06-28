import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radii, Shadows } from '@/src/constants/theme';
import { ScreenWrapper } from '@/src/components/layout';
import { Button } from '@/src/components/ui';
import { useCartStore, useUser } from '@/src/store';
import { formatCurrency } from '@/src/utils/formatters';
import { placeOrder } from '@/src/services/orders';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/src/hooks/queryKeys';

export default function CheckoutScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { items, getSubtotal, clearCart } = useCartStore();
  const [payment, setPayment] = useState('upi');
  const user = useUser();
  const [isPlacing, setIsPlacing] = useState(false);
  const subtotal = getSubtotal();
  const tax = Math.round(subtotal * 0.05);
  const total = subtotal + tax;

  const handlePlaceOrder = async () => {
    if (!user || items.length === 0) return;
    try {
      setIsPlacing(true);
      const stallId = items[0].meal.stallId;
      const stallName = 'RollBowl Main Stall'; // Typically fetched or associated with items
      await placeOrder(user.id, user.name, stallId, stallName, items, subtotal, tax, total);
      
      // Invalidate the orders cache so the new order shows up immediately
      await queryClient.invalidateQueries({ queryKey: queryKeys.orders.list(user.id) });
      
      clearCart();
      router.replace('/(tabs)/(orders)/confirmation' as any);
    } catch (error) {
      console.error('Failed to place order:', error);
      alert('Failed to place order. Please try again.');
    } finally {
      setIsPlacing(false);
    }
  };

  return (
    <ScreenWrapper>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color={Colors.textPrimary} /></TouchableOpacity>
        <Text style={styles.title}>Checkout</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Pickup Information */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Pickup Information</Text>
        <View style={styles.pickupRow}>
          <Ionicons name="storefront-outline" size={20} color={Colors.textSecondary} />
          <View>
            <Text style={styles.pickupLabel}>Pickup Location</Text>
            <Text style={styles.cardValue}>RollBowl Main Stall</Text>
          </View>
        </View>
        <View style={[styles.pickupRow, { marginTop: Spacing.sm }]}>
          <Ionicons name="time-outline" size={20} color={Colors.textSecondary} />
          <View>
            <Text style={styles.pickupLabel}>Pickup Time</Text>
            <Text style={styles.cardValue}>Ready in approx. 15 minutes</Text>
          </View>
        </View>
      </View>

      {/* Order Items */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Order Summary</Text>
        {items.map((item) => (
          <View key={item.meal.id} style={styles.itemRow}>
            <Text style={styles.itemText}>{item.quantity}x {item.meal.name}</Text>
            <Text style={styles.itemPrice}>{formatCurrency(item.meal.price * item.quantity)}</Text>
          </View>
        ))}
      </View>

      {/* Payment */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Payment Method</Text>
        {[{ key: 'upi', label: 'UPI', icon: 'phone-portrait-outline' as const }, { key: 'card', label: 'Card', icon: 'card-outline' as const }, { key: 'cash', label: 'Cash', icon: 'cash-outline' as const }].map((p) => (
          <TouchableOpacity key={p.key} style={[styles.payOption, payment === p.key && styles.payActive]} onPress={() => setPayment(p.key)}>
            <Ionicons name={p.icon} size={20} color={payment === p.key ? Colors.primary : Colors.textSecondary} />
            <Text style={[styles.payText, payment === p.key && styles.payTextActive]}>{p.label}</Text>
            {payment === p.key && <Ionicons name="checkmark-circle" size={20} color={Colors.primary} style={{ marginLeft: 'auto' }} />}
          </TouchableOpacity>
        ))}
      </View>

      {/* Total */}
      <View style={styles.totalCard}>
        <View style={styles.totalRow}><Text style={styles.totalLabel}>Subtotal</Text><Text style={styles.totalVal}>{formatCurrency(subtotal)}</Text></View>
        <View style={styles.totalRow}><Text style={styles.totalLabel}>Tax</Text><Text style={styles.totalVal}>{formatCurrency(tax)}</Text></View>
        <View style={[styles.totalRow, { borderTopWidth: 1, borderTopColor: Colors.borderLight, paddingTop: Spacing.sm }]}>
          <Text style={styles.grandLabel}>Total</Text><Text style={styles.grandVal}>{formatCurrency(total)}</Text>
        </View>
      </View>

      <Button 
        title={`Place Order • ${formatCurrency(total)}`} 
        onPress={handlePlaceOrder} 
        fullWidth 
        size="lg" 
        loading={isPlacing} 
        disabled={isPlacing || items.length === 0} 
      />
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: Spacing.xl, marginBottom: Spacing.base },
  title: { fontSize: Typography.size.lg, fontFamily: Typography.family.bold, color: Colors.textPrimary },
  card: { backgroundColor: Colors.surface, borderRadius: Radii.lg, padding: Spacing.base, marginBottom: Spacing.md, ...Shadows.sm },
  cardTitle: { fontSize: Typography.size.base, fontFamily: Typography.family.semiBold, color: Colors.textPrimary, marginBottom: Spacing.sm },
  pickupRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  pickupLabel: { fontSize: Typography.size.xs, color: Colors.textTertiary, marginBottom: 2 },
  cardValue: { fontSize: Typography.size.sm, fontFamily: Typography.family.medium, color: Colors.textPrimary },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: Spacing.xs },
  itemText: { fontSize: Typography.size.sm, color: Colors.textSecondary },
  itemPrice: { fontSize: Typography.size.sm, fontFamily: Typography.family.medium, color: Colors.textPrimary },
  payOption: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.sm, borderRadius: Radii.sm, marginBottom: Spacing.xs },
  payActive: { backgroundColor: Colors.primaryBg },
  payText: { fontSize: Typography.size.sm, color: Colors.textSecondary },
  payTextActive: { color: Colors.primary, fontFamily: Typography.family.semiBold },
  totalCard: { backgroundColor: Colors.surface, borderRadius: Radii.lg, padding: Spacing.base, marginBottom: Spacing.base, ...Shadows.sm },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.xs },
  totalLabel: { fontSize: Typography.size.sm, color: Colors.textSecondary },
  totalVal: { fontSize: Typography.size.sm, fontFamily: Typography.family.medium, color: Colors.textPrimary },
  grandLabel: { fontSize: Typography.size.md, fontFamily: Typography.family.bold, color: Colors.textPrimary },
  grandVal: { fontSize: Typography.size.md, fontFamily: Typography.family.bold, color: Colors.primary },
});
