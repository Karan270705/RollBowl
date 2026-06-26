import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Typography, Radii, Spacing, Shadows } from '@/src/constants/theme';
import { OrderStatusColors, OrderStatusLabels } from '@/src/constants/enums';
import type { OrderStatus } from '@/src/constants/enums';

interface StatusBadgeProps {
  status: OrderStatus;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const color = OrderStatusColors[status];
  return (
    <View style={[styles.badge, { backgroundColor: color + '18' }]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.label, { color }]}>{OrderStatusLabels[status]}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.xs,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs,
    borderRadius: Radii.full, alignSelf: 'flex-start',
  },
  dot: { width: 6, height: 6, borderRadius: Radii.full },
  label: { fontSize: Typography.size.xs, fontFamily: Typography.family.semiBold },
});
