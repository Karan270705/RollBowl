import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radii } from '@/src/constants/theme';
import { Button } from '@/src/components/ui';

export default function ConfirmationScreen() {
  const router = useRouter();
  return (
    <View style={styles.container}>
      <View style={styles.iconCircle}>
        <Ionicons name="checkmark-circle" size={72} color={Colors.success} />
      </View>
      <Text style={styles.title}>Order Placed! 🎉</Text>
      <Text style={styles.subtitle}>Your order has been confirmed and is being prepared.</Text>
      <View style={styles.infoCard}>
        <View style={styles.infoRow}><Text style={styles.infoLabel}>Order #</Text><Text style={styles.infoValue}>RB-1008</Text></View>
        <View style={styles.infoRow}><Text style={styles.infoLabel}>Estimated Time</Text><Text style={styles.infoValue}>15-20 min</Text></View>
        <View style={styles.infoRow}><Text style={styles.infoLabel}>Status</Text><Text style={[styles.infoValue, { color: Colors.success }]}>Confirmed</Text></View>
      </View>
      <View style={styles.buttons}>
        <Button title="Track Order" onPress={() => router.push(`/(tabs)/(orders)/track/mock-order-1` as any)} fullWidth />
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
