import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radii, Shadows } from '@/src/constants/theme';
import { ScreenWrapper } from '@/src/components/layout';
import { Button } from '@/src/components/ui';
import { useCartStore } from '@/src/store';
import { formatCurrency } from '@/src/utils/formatters';
import { MOCK_ADDRESSES } from '@/src/constants/mockData';

export default function CheckoutScreen() {
  const router = useRouter();
  const { items, getSubtotal, clearCart } = useCartStore();
  const [mode, setMode] = useState<'pickup' | 'delivery'>('pickup');
  const [payment, setPayment] = useState('upi');
  const subtotal = getSubtotal();
  const tax = Math.round(subtotal * 0.05);
  const total = subtotal + tax;

  const handlePlaceOrder = () => {
    clearCart();
    router.replace('/(tabs)/(orders)/confirmation' as any);
  };

  return (
    <ScreenWrapper>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color={Colors.textPrimary} /></TouchableOpacity>
        <Text style={styles.title}>Checkout</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Mode Toggle */}
      <View style={styles.modeRow}>
        {(['pickup', 'delivery'] as const).map((m) => (
          <TouchableOpacity key={m} style={[styles.modeBtn, mode === m && styles.modeActive]} onPress={() => setMode(m)}>
            <Ionicons name={m === 'pickup' ? 'walk-outline' : 'bicycle-outline'} size={18} color={mode === m ? Colors.white : Colors.textSecondary} />
            <Text style={[styles.modeText, mode === m && styles.modeTextActive]}>{m === 'pickup' ? 'Pickup' : 'Delivery'}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {mode === 'delivery' && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Delivery Address</Text>
          <Text style={styles.cardValue}>{MOCK_ADDRESSES[0].fullAddress}</Text>
        </View>
      )}

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

      <Button title={`Place Order • ${formatCurrency(total)}`} onPress={handlePlaceOrder} fullWidth size="lg" />
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: Spacing.xl, marginBottom: Spacing.base },
  title: { fontSize: Typography.size.lg, fontFamily: Typography.family.bold, color: Colors.textPrimary },
  modeRow: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.base },
  modeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingVertical: Spacing.md, borderRadius: Radii.md, backgroundColor: Colors.surfaceElevated },
  modeActive: { backgroundColor: Colors.primary },
  modeText: { fontSize: Typography.size.sm, fontFamily: Typography.family.semiBold, color: Colors.textSecondary },
  modeTextActive: { color: Colors.white },
  card: { backgroundColor: Colors.surface, borderRadius: Radii.lg, padding: Spacing.base, marginBottom: Spacing.md, ...Shadows.sm },
  cardTitle: { fontSize: Typography.size.base, fontFamily: Typography.family.semiBold, color: Colors.textPrimary, marginBottom: Spacing.sm },
  cardValue: { fontSize: Typography.size.sm, color: Colors.textSecondary },
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
