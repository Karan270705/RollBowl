import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { Colors, Radii, Shadows, Spacing } from '@/src/constants/theme';

interface CardProps {
  children: React.ReactNode;
  variant?: 'elevated' | 'outlined' | 'flat';
  padding?: number;
  style?: ViewStyle;
}

export const Card: React.FC<CardProps> = ({ children, variant = 'elevated', padding, style }) => {
  return (
    <View style={[styles.base, styles[variant], padding !== undefined && { padding }, style]}>
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  base: {
    borderRadius: Radii.lg,
    padding: Spacing.base,
    backgroundColor: Colors.surface,
  },
  elevated: {
    ...Shadows.md,
  },
  outlined: {
    borderWidth: 1,
    borderColor: Colors.border,
  },
  flat: {
    backgroundColor: Colors.surfaceElevated,
  },
});
