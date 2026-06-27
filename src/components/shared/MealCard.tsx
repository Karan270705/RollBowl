import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radii, Shadows } from '@/src/constants/theme';
import { MealType } from '@/src/constants/enums';
import type { Meal } from '@/src/types/models';
import { formatCurrency } from '@/src/utils/formatters';

interface MealCardProps {
  meal: Meal;
  onPress: () => void;
  onAddToCart?: () => void;
  compact?: boolean;
}

export const MealCard: React.FC<MealCardProps> = ({ meal, onPress, onAddToCart, compact }) => {
  const typeColor = meal.type === MealType.VEG ? Colors.success : meal.type === MealType.VEGAN ? Colors.success : Colors.error;

  if (compact) {
    return (
      <TouchableOpacity style={styles.compactCard} onPress={onPress} activeOpacity={0.7}>
        <Image source={{ uri: meal.imageUrl }} style={styles.compactImage} />
        <View style={styles.compactInfo}>
          <Text style={styles.compactName} numberOfLines={1}>{meal.name}</Text>
          <View style={styles.compactPriceRow}>
            <Text style={styles.compactPrice}>{formatCurrency(meal.price)}</Text>
            {meal.servingSize && <Text style={styles.compactServing}>{meal.servingSize}</Text>}
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.8}>
      <Image source={{ uri: meal.imageUrl }} style={styles.image} />
      {meal.tags.length > 0 && (
        <View style={styles.tagContainer}>
          <Text style={styles.tag}>{meal.tags[0]}</Text>
        </View>
      )}
      <View style={styles.info}>
        <View style={styles.row}>
          <View style={[styles.typeDot, { backgroundColor: typeColor }]} />
          <Text style={styles.name} numberOfLines={1}>{meal.name}</Text>
        </View>
        <Text style={styles.description} numberOfLines={2}>{meal.description}</Text>
        <View style={styles.footer}>
          <View style={styles.priceRow}>
            <Text style={styles.price}>{formatCurrency(meal.price)}</Text>
            {meal.originalPrice && (
              <Text style={styles.originalPrice}>{formatCurrency(meal.originalPrice)}</Text>
            )}
            {meal.servingSize && <Text style={styles.servingSize}> • {meal.servingSize}</Text>}
          </View>
          <View style={styles.ratingRow}>
            <Ionicons name="star" size={14} color={Colors.warning} />
            <Text style={styles.rating}>{meal.rating}</Text>
          </View>
        </View>
        {onAddToCart && (
          <TouchableOpacity style={styles.addButton} onPress={onAddToCart} activeOpacity={0.7}>
            <Ionicons name="add" size={20} color={Colors.white} />
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface, borderRadius: Radii.lg,
    ...Shadows.md, overflow: 'hidden', marginBottom: Spacing.base,
  },
  image: { width: '100%', height: 160, backgroundColor: Colors.surfaceElevated },
  tagContainer: {
    position: 'absolute', top: Spacing.sm, left: Spacing.sm,
    backgroundColor: Colors.primary, borderRadius: Radii.sm,
    paddingHorizontal: Spacing.sm, paddingVertical: 2,
  },
  tag: { fontSize: Typography.size.xs, fontFamily: Typography.family.semiBold, color: Colors.white },
  info: { padding: Spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  typeDot: { width: 10, height: 10, borderRadius: 2, borderWidth: 1, borderColor: 'transparent' },
  name: { fontSize: Typography.size.base, fontFamily: Typography.family.semiBold, color: Colors.textPrimary, flex: 1 },
  description: { fontSize: Typography.size.sm, color: Colors.textSecondary, marginTop: Spacing.xs, lineHeight: 18 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: Spacing.sm },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  price: { fontSize: Typography.size.md, fontFamily: Typography.family.bold, color: Colors.textPrimary },
  originalPrice: { fontSize: Typography.size.sm, color: Colors.textTertiary, textDecorationLine: 'line-through' },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  rating: { fontSize: Typography.size.sm, fontFamily: Typography.family.medium, color: Colors.textSecondary },
  addButton: {
    position: 'absolute', bottom: Spacing.md, right: Spacing.md,
    backgroundColor: Colors.primary, width: 36, height: 36,
    borderRadius: Radii.full, alignItems: 'center', justifyContent: 'center',
    ...Shadows.sm,
  },
  // Compact variant
  compactCard: {
    width: 150, backgroundColor: Colors.surface, borderRadius: Radii.md,
    ...Shadows.sm, overflow: 'hidden', marginRight: Spacing.md,
  },
  compactImage: { width: '100%', height: 100, backgroundColor: Colors.surfaceElevated },
  compactInfo: { padding: Spacing.sm },
  compactName: { fontSize: Typography.size.sm, fontFamily: Typography.family.medium, color: Colors.textPrimary },
  compactPriceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  compactPrice: { fontSize: Typography.size.sm, fontFamily: Typography.family.bold, color: Colors.primary },
  compactServing: { fontSize: Typography.size.xs, color: Colors.textSecondary },
  servingSize: { fontSize: Typography.size.sm, color: Colors.textSecondary, fontFamily: Typography.family.medium },
});
