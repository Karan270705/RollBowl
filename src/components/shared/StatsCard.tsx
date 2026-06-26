import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radii, Shadows } from '@/src/constants/theme';

interface StatsCardProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string | number;
  color?: string;
  trend?: { value: string; positive: boolean };
}

export const StatsCard: React.FC<StatsCardProps> = ({
  icon, label, value, color = Colors.primary, trend,
}) => {
  return (
    <View style={styles.card}>
      <View style={[styles.iconBox, { backgroundColor: color + '15' }]}>
        <Ionicons name={icon} size={22} color={color} />
      </View>
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
      {trend && (
        <View style={styles.trendRow}>
          <Ionicons
            name={trend.positive ? 'trending-up' : 'trending-down'}
            size={14}
            color={trend.positive ? Colors.success : Colors.error}
          />
          <Text style={[styles.trendText, { color: trend.positive ? Colors.success : Colors.error }]}>
            {trend.value}
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    flex: 1, backgroundColor: Colors.surface, borderRadius: Radii.lg,
    padding: Spacing.base, ...Shadows.sm, minWidth: 140,
  },
  iconBox: {
    width: 40, height: 40, borderRadius: Radii.md,
    alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.sm,
  },
  value: { fontSize: Typography.size.xl, fontFamily: Typography.family.bold, color: Colors.textPrimary },
  label: { fontSize: Typography.size.sm, fontFamily: Typography.family.regular, color: Colors.textSecondary, marginTop: 2 },
  trendRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: Spacing.xs },
  trendText: { fontSize: Typography.size.xs, fontFamily: Typography.family.medium },
});
