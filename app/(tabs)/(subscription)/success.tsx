import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radii } from '@/src/constants/theme';
import { ScreenWrapper } from '@/src/components/layout';
import { Button } from '@/src/components/ui';

const { width } = Dimensions.get('window');

export default function SubscriptionSuccessScreen() {
  const router = useRouter();

  return (
    <ScreenWrapper>
      <View style={styles.container}>
        <View style={styles.iconCircle}>
          <Ionicons name="checkmark-circle" size={80} color={Colors.success} />
        </View>

        <Text style={styles.title}>You're Subscribed!</Text>
        <Text style={styles.subtitle}>
          Your subscription is now active. You can manage your items from your profile.
        </Text>

        <View style={styles.infoBox}>
          <View style={styles.infoRow}>
            <Ionicons name="calendar-outline" size={20} color={Colors.primary} />
            <Text style={styles.infoText}>Next billing date: Next Week</Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="restaurant-outline" size={20} color={Colors.primary} />
            <Text style={styles.infoText}>Ready to pick your items?</Text>
          </View>
        </View>
      </View>

      <View style={styles.footer}>
        <Button 
          title="Go to Home" 
          onPress={() => router.replace('/(tabs)/(home)' as any)} 
          fullWidth 
        />
        <Button 
          title="View Subscription Details" 
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
    backgroundColor: Colors.success + '20',
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
    marginLeft: Spacing.sm,
    fontFamily: Typography.family.medium,
  },
  footer: {
    padding: Spacing.xl,
  },
});
