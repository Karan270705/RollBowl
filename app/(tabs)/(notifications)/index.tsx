import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radii, Shadows } from '@/src/constants/theme';
import { ScreenWrapper } from '@/src/components/layout';
import { EmptyState } from '@/src/components/ui';

export default function NotificationsScreen() {
  return (
    <ScreenWrapper>
      <View style={styles.header}>
        <Text style={styles.title}>Notifications</Text>
      </View>
      <EmptyState icon="notifications-off-outline" title="Coming Soon" subtitle="Notifications will be supported in a future update." />
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  header: { paddingVertical: Spacing.xl, paddingBottom: Spacing.md },
  title: { fontSize: Typography.size.xl, fontFamily: Typography.family.bold, color: Colors.textPrimary },
});
