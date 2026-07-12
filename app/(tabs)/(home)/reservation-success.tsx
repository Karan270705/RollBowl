import { ScreenWrapper } from '@/src/components/layout';
import { Button } from '@/src/components/ui';
import { Colors, Radii, Shadows, Spacing, Typography } from '@/src/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';

import { formatFriendlyDate } from '@/src/utils/formatters';

const { width } = Dimensions.get('window');

export default function ReservationSuccessScreen() {
  const router = useRouter();

  return (
    <ScreenWrapper>
      <View style={styles.container}>
        <View style={styles.iconCircle}>
          <Ionicons name="checkmark-done-circle" size={80} color={Colors.primary} />
        </View>

        <Text style={styles.title}>Reservation Confirmed!</Text>
        <Text style={styles.subtitle}>
          Your extra item has been successfully reserved. Please present this QR code at the stall to collect your item.
        </Text>

        <View style={styles.qrCard}>
          {/* Mock QR Code */}
          <Ionicons name="qr-code" size={150} color={Colors.textPrimary} />
          <Text style={styles.qrText}>Reservation #RM-7829</Text>
        </View>

        <View style={styles.infoBox}>
          <View style={styles.infoRow}>
            <Ionicons name="time-outline" size={20} color={Colors.textSecondary} />
            <Text style={styles.infoText}>Valid for {formatFriendlyDate(new Date())} only</Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="location-outline" size={20} color={Colors.textSecondary} />
            <Text style={styles.infoText}>Collect at Main Cafeteria</Text>
          </View>
        </View>
      </View>

      <View style={styles.footer}>
        <Button
          title="Back to Home"
          onPress={() => router.replace('/(tabs)/(home)' as any)}
          fullWidth
        />
      </View>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    padding: Spacing.xl,
    paddingTop: Spacing.xl,
  },
  iconCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: Colors.primaryBg,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  title: {
    fontSize: Typography.size.xl,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: Typography.size.base,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: Spacing.xl,
    paddingHorizontal: Spacing.md,
  },
  qrCard: {
    backgroundColor: Colors.surface,
    padding: Spacing.xl,
    borderRadius: Radii.lg,
    alignItems: 'center',
    marginBottom: Spacing.xl,
    ...Shadows.md,
  },
  qrText: {
    marginTop: Spacing.md,
    fontSize: Typography.size.base,
    fontFamily: Typography.family.semiBold,
    color: Colors.textPrimary,
  },
  infoBox: {
    width: '100%',
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radii.lg,
    padding: Spacing.lg,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  infoText: {
    fontSize: Typography.size.base,
    color: Colors.textPrimary,
    marginLeft: Spacing.md,
  },
  footer: {
    padding: Spacing.xl,
  },
});
