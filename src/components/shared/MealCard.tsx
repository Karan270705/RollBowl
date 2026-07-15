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
  prominent?: boolean;
  isOrderable?: boolean;
  inventoryStatus?: 'pending' | 'available' | 'low_stock' | 'out_of_stock' | 'not_in_batch';
  availableQuantity?: number;
}

export const MealCard: React.FC<MealCardProps> = ({ meal, onPress, onAddToCart, compact, prominent, isOrderable, inventoryStatus = 'pending', availableQuantity }) => {
  const typeColor = meal.type === MealType.VEG ? Colors.success : meal.type === MealType.VEGAN ? Colors.success : Colors.error;
  
  // Base operational availability
  const isOperationallyAvailable = isOrderable !== false && meal.isAvailable;
  
  // Inventory availability overrides
  const isInventoryAvailable = inventoryStatus !== 'out_of_stock' && inventoryStatus !== 'not_in_batch';
  
  const unavailable = !isOperationallyAvailable || !isInventoryAvailable;

  let unavailableText = 'Not Available';
  if (isOrderable === false) unavailableText = 'Not Available Today';
  else if (inventoryStatus === 'not_in_batch') unavailableText = 'Not on Menu Today';
  else if (inventoryStatus === 'out_of_stock') unavailableText = 'Sold Out';

  const renderInventoryBadge = () => {
    if (unavailable) return null;
    
    if (inventoryStatus === 'low_stock' && availableQuantity !== undefined) {
      return (
        <View style={[styles.tagContainer, { backgroundColor: Colors.warning }]}>
          <Text style={styles.tag}>Only {availableQuantity} left</Text>
        </View>
      );
    }
    
    if (inventoryStatus === 'available' && availableQuantity !== undefined) {
      return (
        <View style={styles.tagContainer}>
          <Text style={styles.tag}>{availableQuantity} Available</Text>
        </View>
      );
    }

    if (inventoryStatus === 'pending') {
      return (
        <View style={[styles.tagContainer, { backgroundColor: Colors.surfaceElevated }]}>
          <Text style={[styles.tag, { color: Colors.textSecondary }]}>Stock Pending</Text>
        </View>
      );
    }
    
    return null;
  };

  // ─── Prominent variant (Today's Menu hero cards) ─────────
  if (prominent) {
    return (
      <TouchableOpacity style={styles.prominentCard} onPress={onPress} activeOpacity={0.8}>
        {meal.imageUrl ? (
          <Image source={{ uri: meal.imageUrl }} style={styles.prominentImage} />
        ) : (
          <View style={styles.prominentImage} />
        )}
        <View style={styles.prominentInfo}>
          <View style={styles.row}>
            <View style={[styles.typeDot, { backgroundColor: typeColor }]} />
            <Text style={styles.prominentName} numberOfLines={1}>{meal.name}</Text>
          </View>
          <Text style={styles.prominentDesc} numberOfLines={2}>{meal.description}</Text>
          <View style={styles.prominentFooter}>
            <View>
              <Text style={styles.prominentPrice}>{formatCurrency(meal.price)}</Text>
              {meal.servingSize && <Text style={styles.prominentServing}>{meal.servingSize}</Text>}
            </View>
            {onAddToCart && (
              <TouchableOpacity style={styles.prominentAddBtn} onPress={onAddToCart} activeOpacity={0.7}>
                <Ionicons name="add" size={18} color={Colors.white} />
                <Text style={styles.prominentAddText}>Add</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  if (compact) {
    return (
      <TouchableOpacity style={styles.compactCard} onPress={onPress} activeOpacity={0.7}>
        {meal.imageUrl ? (
          <Image source={{ uri: meal.imageUrl }} style={[styles.compactImage, unavailable && styles.unavailableImage]} />
        ) : (
          <View style={[styles.compactImage, unavailable && styles.unavailableImage]} />
        )}
        <View style={styles.compactInfo}>
          <Text style={[styles.compactName, unavailable && styles.unavailableText]} numberOfLines={1}>{meal.name}</Text>
          <View style={styles.compactPriceRow}>
            <Text style={[styles.compactPrice, unavailable && styles.unavailableText]}>{formatCurrency(meal.price)}</Text>
            {meal.servingSize && <Text style={styles.compactServing}>{meal.servingSize}</Text>}
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity style={[styles.card, unavailable && styles.unavailableCard]} onPress={onPress} activeOpacity={0.8}>
      {meal.imageUrl ? (
        <Image source={{ uri: meal.imageUrl }} style={[styles.image, unavailable && styles.unavailableImage]} />
      ) : (
        <View style={[styles.image, unavailable && styles.unavailableImage]} />
      )}
      {/* Unavailable overlay badge */}
      {unavailable && (
        <View style={styles.unavailableBadge}>
          <Text style={styles.unavailableBadgeText}>{unavailableText}</Text>
        </View>
      )}
      {/* Tag badge / Inventory Badge */}
      {renderInventoryBadge() || (
        !unavailable && meal.tags.length > 0 && (
          <View style={[styles.tagContainer, { backgroundColor: Colors.primary }]}>
            <Text style={styles.tag}>{meal.tags[0]}</Text>
          </View>
        )
      )}
      <View style={styles.info}>
        <View style={styles.row}>
          <View style={[styles.typeDot, { backgroundColor: typeColor }]} />
          <Text style={[styles.name, unavailable && styles.unavailableText]} numberOfLines={1}>{meal.name}</Text>
        </View>
        <Text style={[styles.description, unavailable && styles.unavailableText]} numberOfLines={2}>{meal.description}</Text>
        <View style={styles.footer}>
          <View style={styles.priceRow}>
            <Text style={[styles.price, unavailable && styles.unavailableText]}>{formatCurrency(meal.price)}</Text>
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
        {/* Only show Add to Cart for available meals */}
        {!unavailable && onAddToCart && (
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
  unavailableCard: { opacity: 0.65 },
  image: { width: '100%', height: 160, backgroundColor: Colors.surfaceElevated },
  unavailableImage: { opacity: 0.5 },
  unavailableBadge: {
    position: 'absolute', top: Spacing.sm, left: Spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: Radii.sm,
    paddingHorizontal: Spacing.sm, paddingVertical: 3,
  },
  unavailableBadgeText: {
    fontSize: Typography.size.xs, fontFamily: Typography.family.semiBold, color: Colors.white,
  },
  unavailableText: { color: Colors.textTertiary },
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
  // Prominent variant (Today's Menu)
  prominentCard: {
    width: 220, backgroundColor: Colors.surface, borderRadius: Radii.lg,
    ...Shadows.md, overflow: 'hidden', marginRight: Spacing.base,
  },
  prominentImage: { width: '100%', height: 150, backgroundColor: Colors.surfaceElevated },
  prominentInfo: { padding: Spacing.md },
  prominentName: {
    fontSize: Typography.size.base, fontFamily: Typography.family.bold, color: Colors.textPrimary,
    flex: 1,
  },
  prominentDesc: {
    fontSize: Typography.size.xs, color: Colors.textSecondary, lineHeight: 16,
    marginTop: Spacing.xs,
  },
  prominentFooter: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: Spacing.sm,
  },
  prominentPrice: {
    fontSize: Typography.size.md, fontFamily: Typography.family.bold, color: Colors.primary,
  },
  prominentServing: {
    fontSize: Typography.size.xs, color: Colors.textSecondary, marginTop: 1,
  },
  prominentAddBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.primary, borderRadius: Radii.full,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs,
  },
  prominentAddText: {
    fontSize: Typography.size.xs, fontFamily: Typography.family.semiBold, color: Colors.white,
  },
});
