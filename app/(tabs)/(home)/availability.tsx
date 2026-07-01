import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Typography, Spacing } from '@/src/constants/theme';
import { ScreenWrapper } from '@/src/components/layout';
import { EmptyState } from '@/src/components/ui';

export default function AvailabilityScreen() {
  return (
    <ScreenWrapper>
      <View style={styles.header}>
        <Text style={styles.title}>Extra Meals</Text>
        <Text style={styles.subtitle}>Reserve available meals from campus stalls</Text>
      </View>
      <EmptyState icon="construct-outline" title="Coming Soon" subtitle="Live stall availability and reservations are in development." />
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  header: { paddingTop: Spacing.xl, marginBottom: Spacing.base },
  title: { fontSize: Typography.size.xl, fontFamily: Typography.family.bold, color: Colors.textPrimary },
  subtitle: { fontSize: Typography.size.sm, color: Colors.textSecondary, marginTop: 2 },
});
