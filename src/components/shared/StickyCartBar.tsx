import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radii, Shadows } from '@/src/constants/theme';
import { useCartItemCount, useCartItems } from '@/src/store';
import { formatCurrency } from '@/src/utils/formatters';

export const StickyCartBar: React.FC = () => {
  const router = useRouter();
  const cartCount = useCartItemCount();
  const items = useCartItems();
  const cartTotal = items.reduce((sum, item) => sum + (item.meal.price * item.quantity), 0);

  if (cartCount === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.cartInfo}>
        <View style={styles.iconContainer}>
          <Ionicons name="cart" size={20} color={Colors.white} />
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{cartCount}</Text>
          </View>
        </View>
        <View>
          <Text style={styles.totalText}>{formatCurrency(cartTotal)}</Text>
          <Text style={styles.subText}>Plus taxes</Text>
        </View>
      </View>
      <TouchableOpacity 
        style={styles.actionButton}
        onPress={() => router.push('/(tabs)/(orders)/checkout' as any)}
        activeOpacity={0.8}
      >
        <Text style={styles.actionText}>View Cart</Text>
        <Ionicons name="chevron-forward" size={18} color={Colors.white} />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: Spacing.md,
    left: Spacing.base,
    right: Spacing.base,
    backgroundColor: Colors.primary,
    borderRadius: Radii.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
    ...Shadows.lg,
    zIndex: 50, // ensures it sits above lists/scrollviews
  },
  cartInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  iconContainer: {
    position: 'relative',
    backgroundColor: 'rgba(255,255,255,0.2)',
    padding: Spacing.sm,
    borderRadius: Radii.md,
  },
  badge: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: Colors.white,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    fontSize: Typography.size.xs,
    fontFamily: Typography.family.bold,
    color: Colors.primary,
  },
  totalText: {
    fontSize: Typography.size.md,
    fontFamily: Typography.family.bold,
    color: Colors.white,
  },
  subText: {
    fontSize: Typography.size.xs,
    color: 'rgba(255,255,255,0.8)',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionText: {
    fontSize: Typography.size.sm,
    fontFamily: Typography.family.bold,
    color: Colors.white,
  },
});
