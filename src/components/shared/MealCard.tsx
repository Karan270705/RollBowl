import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, AccessibilityInfo } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Colors, Typography, Spacing, Radii, Shadows } from '@/src/constants/theme';
import { MealType } from '@/src/constants/enums';
import type { Meal } from '@/src/types/models';
import { formatCurrency } from '@/src/utils/formatters';
import type { CustomerMealAvailabilityResult } from '@/src/engine/availabilityResolver';

interface MealCardProps {
  meal: Meal;
  onPress: () => void;
  onAddToCart?: () => void | boolean;
  compact?: boolean;
  prominent?: boolean;
  isOrderable?: boolean;
  inventoryStatus?: 'pending' | 'available' | 'low_stock' | 'out_of_stock' | 'not_in_batch';
  availableQuantity?: number;
  availability?: CustomerMealAvailabilityResult;
}

export const MealCard: React.FC<MealCardProps> = ({ meal, onPress, onAddToCart, compact, prominent, isOrderable, inventoryStatus = 'pending', availableQuantity, availability }) => {
  const [isAdded, setIsAdded] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((enabled) => setReduceMotion(enabled))
      .catch(() => {});
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleAddPress = (e: any) => {
    e?.stopPropagation?.();
    if (isAdded) return; // Prevent duplicate rapid taps

    const result = onAddToCart?.();
    if (result === false) return; // Blocked by stock safety check

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      // Ignore on unsupported devices
    }

    setIsAdded(true);

    if (!reduceMotion) {
      Animated.sequence([
        Animated.timing(scaleAnim, {
          toValue: 0.85,
          duration: 100,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 3,
          useNativeDriver: true,
        }),
      ]).start();
    }

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setIsAdded(false);
    }, 1000);
  };

  const typeColor = meal.type === MealType.VEG ? Colors.success : meal.type === MealType.VEGAN ? Colors.success : Colors.error;
  
  // Resolve availability either from structured availability prop or legacy fallback
  const unavailable = availability
    ? !availability.canAdd
    : (!((isOrderable !== false) && meal.isAvailable) || inventoryStatus === 'out_of_stock' || inventoryStatus === 'not_in_batch');

  let unavailableText = 'Not Available';
  if (availability) {
    unavailableText = availability.reason || 'Not Available';
  } else if (inventoryStatus === 'out_of_stock') {
    unavailableText = 'Sold Out';
  } else if (inventoryStatus === 'not_in_batch') {
    unavailableText = 'Not loaded in live stock';
  } else if (isOrderable === false) {
    unavailableText = 'Not Available Today';
  }

  const renderInventoryBadge = () => {
    if (unavailable) return null;
    
    // In UNTRACKED mode, never show fake stock or stock pending
    if (availability && availability.inventoryMode === 'UNTRACKED') {
      return null;
    }
    
    const qty = availability ? availability.availableQuantity : availableQuantity;
    if (qty !== undefined && qty !== null) {
      if (qty <= 5) {
        return (
          <View style={[styles.tagContainer, { backgroundColor: Colors.warning }]}>
            <Text style={styles.tag}>Only {qty} left</Text>
          </View>
        );
      }
      return (
        <View style={[styles.tagContainer, { backgroundColor: Colors.success }]}>
          <Text style={styles.tag}>In stock</Text>
        </View>
      );
    }

    if (!availability && inventoryStatus === 'pending') {
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
      <TouchableOpacity style={[styles.prominentCard, unavailable && styles.unavailableCard]} onPress={onPress} activeOpacity={0.8}>
        {meal.imageUrl ? (
          <Image 
            source={{ uri: meal.imageUrl }} 
            style={[styles.prominentImage, unavailable && styles.unavailableImage]} 
            cachePolicy="memory-disk"
            contentFit="cover"
            recyclingKey={meal.id}
          />
        ) : (
          <View style={[styles.prominentImage, unavailable && styles.unavailableImage]} />
        )}
        {unavailable && (
          <View style={styles.unavailableBadge}>
            <Text style={styles.unavailableBadgeText}>{unavailableText}</Text>
          </View>
        )}
        {renderInventoryBadge() || (
          !unavailable && meal.tags && meal.tags.length > 0 && (
            <View style={[styles.tagContainer, { backgroundColor: Colors.primary }]}>
              <Text style={styles.tag}>{meal.tags[0]}</Text>
            </View>
          )
        )}
        <View style={styles.prominentInfo}>
          <View style={styles.row}>
            <View style={[styles.typeDot, { backgroundColor: typeColor }]} />
            <Text style={[styles.prominentName, unavailable && styles.unavailableText]} numberOfLines={1}>{meal.name}</Text>
          </View>
          <Text style={[styles.prominentDesc, unavailable && styles.unavailableText]} numberOfLines={2}>{meal.description}</Text>
          <View style={styles.prominentFooter}>
            <View>
              <Text style={[styles.prominentPrice, unavailable && styles.unavailableText]}>{formatCurrency(meal.price)}</Text>
              {meal.servingSize && <Text style={styles.prominentServing}>{meal.servingSize}</Text>}
            </View>
            {!unavailable && onAddToCart && (
              <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
                <TouchableOpacity
                  style={[styles.prominentAddBtn, isAdded && styles.prominentAddBtnAdded]}
                  onPress={handleAddPress}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={isAdded ? `${meal.name} added to cart` : `Add ${meal.name} to cart`}
                >
                  <Ionicons name={isAdded ? 'checkmark' : 'add'} size={18} color={Colors.white} />
                  <Text style={styles.prominentAddText}>{isAdded ? 'Added' : 'Add'}</Text>
                </TouchableOpacity>
              </Animated.View>
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
          <Image 
            source={{ uri: meal.imageUrl }} 
            style={[styles.compactImage, unavailable && styles.unavailableImage]}
            cachePolicy="memory-disk"
            contentFit="cover"
            recyclingKey={meal.id}
          />
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
        <Image 
          source={{ uri: meal.imageUrl }} 
          style={[styles.image, unavailable && styles.unavailableImage]}
          cachePolicy="memory-disk"
          contentFit="cover"
          recyclingKey={meal.id}
        />
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
        !unavailable && meal.tags && meal.tags.length > 0 && (
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
          <Animated.View style={[styles.addButtonWrapper, { transform: [{ scale: scaleAnim }] }]}>
            <TouchableOpacity
              style={[styles.addButton, isAdded && styles.addButtonAdded]}
              onPress={handleAddPress}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={isAdded ? `${meal.name} added to cart` : `Add ${meal.name} to cart`}
            >
              <Ionicons name={isAdded ? 'checkmark' : 'add'} size={20} color={Colors.white} />
            </TouchableOpacity>
          </Animated.View>
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
  addButtonWrapper: {
    position: 'absolute', bottom: Spacing.md, right: Spacing.md,
  },
  addButton: {
    backgroundColor: Colors.primary, width: 36, height: 36,
    borderRadius: Radii.full, alignItems: 'center', justifyContent: 'center',
    ...Shadows.sm,
  },
  addButtonAdded: {
    backgroundColor: Colors.success,
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
  prominentAddBtnAdded: {
    backgroundColor: Colors.success,
  },
  prominentAddText: {
    fontSize: Typography.size.xs, fontFamily: Typography.family.semiBold, color: Colors.white,
  },
});
