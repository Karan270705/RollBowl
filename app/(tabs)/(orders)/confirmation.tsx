import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radii } from '@/src/constants/theme';
import { Button } from '@/src/components/ui';
import { fetchOrderById } from '@/src/services/orders';
import { Order } from '@/src/types/models';
import { PaymentMethod, PaymentVerificationStatus, PaymentStatus } from '@/src/constants/enums';

export default function ConfirmationScreen() {
  const router = useRouter();
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (orderId) {
      fetchOrderById(orderId)
        .then(setOrder)
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [orderId]);

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  let statusText = 'Pending';
  let isAwaitingProof = false;
  let statusColor: string = Colors.primary;

  if (order) {
    if (order.paymentMethod === PaymentMethod.CASH && order.paymentStatus === PaymentStatus.PENDING) {
      statusText = 'Cash due at pickup';
    } else if (order.paymentMethod === PaymentMethod.UPI) {
      if (order.paymentVerificationStatus === PaymentVerificationStatus.AWAITING_PROOF) {
        statusText = 'Payment screenshot required';
        isAwaitingProof = true;
        statusColor = Colors.warning;
      } else if (order.paymentVerificationStatus === PaymentVerificationStatus.PENDING) {
        statusText = 'Payment verification pending';
      }
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.iconCircle}>
        <Ionicons name={isAwaitingProof ? "time-outline" : "checkmark-circle"} size={72} color={isAwaitingProof ? Colors.warning : Colors.success} />
      </View>
      <Text style={styles.title}>Order Placed! 🎉</Text>
      <Text style={styles.subtitle}>Your order has been saved.</Text>
      <View style={styles.infoCard}>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Status</Text>
          <Text style={[styles.infoValue, { color: statusColor }]}>{statusText}</Text>
        </View>
      </View>
      <View style={styles.buttons}>
        <Button title={isAwaitingProof ? "Complete Payment Proof" : "View Order"} onPress={() => router.push(`/(tabs)/(orders)/${orderId}` as any)} fullWidth />
        <Button title="Back to Home" onPress={() => router.replace('/(tabs)/(home)' as any)} variant="outline" fullWidth />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xl },
  iconCircle: { marginBottom: Spacing.xl },
  title: { fontSize: Typography.size['2xl'], fontFamily: Typography.family.bold, color: Colors.textPrimary },
  subtitle: { fontSize: Typography.size.base, color: Colors.textSecondary, textAlign: 'center', marginTop: Spacing.sm, maxWidth: 300 },
  infoCard: { backgroundColor: Colors.surface, borderRadius: Radii.lg, padding: Spacing.xl, marginTop: Spacing['2xl'], width: '100%' },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.sm },
  infoLabel: { fontSize: Typography.size.sm, color: Colors.textSecondary },
  infoValue: { fontSize: Typography.size.sm, fontFamily: Typography.family.semiBold, color: Colors.textPrimary },
  buttons: { gap: Spacing.md, marginTop: Spacing['2xl'], width: '100%' },
});
