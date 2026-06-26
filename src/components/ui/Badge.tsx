import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Colors, Typography, Radii, Spacing } from '@/src/constants/theme';

interface BadgeProps {
  count?: number;
  label?: string;
  color?: string;
  backgroundColor?: string;
  size?: 'sm' | 'md';
  style?: ViewStyle;
}

export const Badge: React.FC<BadgeProps> = ({
  count, label, color = Colors.white,
  backgroundColor = Colors.error, size = 'sm', style,
}) => {
  const text = label ?? (count !== undefined ? (count > 99 ? '99+' : String(count)) : '');
  if (!text && count === undefined) {
    return <View style={[styles.dot, { backgroundColor }, style]} />;
  }
  return (
    <View style={[styles.base, styles[size], { backgroundColor }, style]}>
      <Text style={[styles.text, styles[`text_${size}`], { color }]}>{text}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  dot: { width: 8, height: 8, borderRadius: Radii.full },
  base: { borderRadius: Radii.full, alignItems: 'center', justifyContent: 'center' },
  sm: { minWidth: 18, height: 18, paddingHorizontal: Spacing.xs },
  md: { minWidth: 24, height: 24, paddingHorizontal: Spacing.sm },
  text: { fontFamily: Typography.family.bold, textAlign: 'center' },
  text_sm: { fontSize: 10 },
  text_md: { fontSize: Typography.size.xs },
});
