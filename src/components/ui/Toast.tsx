import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, AccessibilityInfo } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radii, Shadows } from '@/src/constants/theme';
import { useCartStore } from '@/src/store';
import { AddedMealEvent } from '@/src/store/cartStore';

export const CartToast: React.FC = () => {
  const router = useRouter();
  const lastAddedMeal = useCartStore((s) => s.lastAddedMeal);
  const clearLastAddedMeal = useCartStore((s) => s.clearLastAddedMeal);

  const [currentEvent, setCurrentEvent] = useState<AddedMealEvent | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);
  const translateY = useRef(new Animated.Value(24)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((enabled) => setReduceMotion(enabled))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!lastAddedMeal) return;

    setCurrentEvent(lastAddedMeal);

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    if (reduceMotion) {
      opacity.setValue(1);
      translateY.setValue(0);
    } else {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.spring(translateY, {
          toValue: 0,
          friction: 7,
          tension: 60,
          useNativeDriver: true,
        }),
      ]).start();
    }

    timerRef.current = setTimeout(() => {
      dismissToast();
    }, 3200);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [lastAddedMeal, reduceMotion]);

  const dismissToast = () => {
    if (reduceMotion) {
      opacity.setValue(0);
      translateY.setValue(24);
      setCurrentEvent(null);
      clearLastAddedMeal();
    } else {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 24,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setCurrentEvent(null);
        clearLastAddedMeal();
      });
    }
  };

  const handlePress = () => {
    dismissToast();
    router.push('/(tabs)/(orders)' as any);
  };

  if (!currentEvent) return null;

  const titleText = `${currentEvent.meal.name} added to cart`;
  const secondaryText = currentEvent.wasEmpty
    ? 'Added to cart — open Orders to review'
    : 'View your cart in Orders';

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity,
          transform: [{ translateY }],
        },
      ]}
      pointerEvents="box-none"
    >
      <TouchableOpacity
        style={styles.toast}
        onPress={handlePress}
        activeOpacity={0.9}
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        accessibilityLabel={`${titleText}. ${secondaryText}`}
      >
        <View style={styles.leftContent}>
          <View style={styles.iconCircle}>
            <Ionicons name="checkmark" size={16} color={Colors.white} />
          </View>
          <View style={styles.textContainer}>
            <Text style={styles.title} numberOfLines={1}>
              {titleText}
            </Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              {secondaryText}
            </Text>
          </View>
        </View>

        <View style={styles.actionContainer}>
          <Text style={styles.actionText}>Orders</Text>
          <Ionicons name="arrow-forward" size={14} color={Colors.white} />
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 74,
    left: Spacing.base,
    right: Spacing.base,
    zIndex: 1000,
    elevation: 10,
  },
  toast: {
    backgroundColor: '#1E293B',
    borderRadius: Radii.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    ...Shadows.lg,
  },
  leftContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: Spacing.sm,
  },
  iconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textContainer: {
    flex: 1,
    marginRight: Spacing.sm,
  },
  title: {
    fontSize: Typography.size.sm,
    fontFamily: Typography.family.semiBold,
    color: Colors.white,
  },
  subtitle: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.75)',
    marginTop: 2,
  },
  actionContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: Radii.full,
    gap: 4,
  },
  actionText: {
    fontSize: Typography.size.xs,
    fontFamily: Typography.family.semiBold,
    color: Colors.white,
  },
});
