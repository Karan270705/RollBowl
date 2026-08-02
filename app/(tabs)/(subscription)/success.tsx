import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radii } from '@/src/constants/theme';
import { ScreenWrapper } from '@/src/components/layout';
import { Button } from '@/src/components/ui';

const { width } = Dimensions.get('window');

export default function SubscriptionSuccessScreen() {
  const router = useRouter();
  const { isReplacement } = useLocalSearchParams<{ isReplacement?: string }>();

  const titleText = isReplacement === 'true'
    ? 'New payment proof submitted'
    : 'Payment proof submitted';

  const bodyText = isReplacement === 'true'
    ? 'New payment proof submitted. Your request is waiting for kitchen verification.'
    : 'Your screenshot has been received. Your subscription will be activated after the kitchen verifies and approves the payment.';

  return (
    <ScreenWrapper>
      <View style={styles.container}>
        <View style={styles.iconCircle}>
          <Ionicons name="time-outline" size={80} color={Colors.primary} />
        </View>

        <Text style={styles.title}>{titleText}</Text>
        <Text style={styles.subtitle}>{bodyText}</Text>

        <View style={styles.infoBox}>
          <View style={styles.infoRow}>
            <Ionicons name="shield-checkmark-outline" size={20} color={Colors.primary} />
            <Text style={styles.infoText}>Status: Pending Verification</Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="information-circle-outline" size={20} color={Colors.primary} />
            <Text style={styles.infoText}>You will be notified once verified by Kitchen</Text>
          </View>
        </View>
      </View>

      <View style={styles.footer}>
        <Button 
          title="View Request Status" 
          onPress={() => router.replace('/(tabs)/(subscription)' as any)} 
          fullWidth 
        />
        <Button 
          title="Back to Subscriptions" 
          variant="outline"
          onPress={() => router.replace('/(tabs)/(subscription)' as any)} 
          fullWidth 
          style={{ marginTop: Spacing.md }}
        />
      </View>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  iconCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: Colors.primary + '15',
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
    paddingHorizontal: Spacing.lg,
  },
  infoBox: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radii.lg,
    padding: Spacing.lg,
    width: width - Spacing.xl * 2,
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
    flex: 1,
  },
  footer: {
    padding: Spacing.xl,
  },
});
