import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radii } from '@/src/constants/theme';

interface QuantitySelectorProps {
  quantity: number;
  onIncrement: () => void;
  onDecrement: () => void;
  min?: number;
  max?: number;
}

export const QuantitySelector: React.FC<QuantitySelectorProps> = ({
  quantity, onIncrement, onDecrement, min = 0, max = 99,
}) => {
  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.button, quantity <= min && styles.disabled]}
        onPress={onDecrement}
        disabled={quantity <= min}
        activeOpacity={0.7}
      >
        <Ionicons name="remove" size={18} color={quantity <= min ? Colors.textTertiary : Colors.primary} />
      </TouchableOpacity>
      <Text style={styles.count}>{quantity}</Text>
      <TouchableOpacity
        style={[styles.button, quantity >= max && styles.disabled]}
        onPress={onIncrement}
        disabled={quantity >= max}
        activeOpacity={0.7}
      >
        <Ionicons name="add" size={18} color={quantity >= max ? Colors.textTertiary : Colors.primary} />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.primaryBg, borderRadius: Radii.full,
    paddingHorizontal: Spacing.xs, paddingVertical: Spacing.xs,
  },
  button: {
    width: 32, height: 32, borderRadius: Radii.full,
    backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center',
  },
  disabled: { opacity: 0.4 },
  count: { fontSize: Typography.size.base, fontFamily: Typography.family.bold, color: Colors.textPrimary, minWidth: 24, textAlign: 'center' },
});
