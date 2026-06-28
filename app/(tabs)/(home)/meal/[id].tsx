import React from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radii, Shadows } from '@/src/constants/theme';
import { Button, LoadingSpinner, EmptyState } from '@/src/components/ui';
import { QuantitySelector } from '@/src/components/shared';
import { useMeal, useActiveMenu, useScheduledMeals } from '@/src/hooks';
import { useCartStore } from '@/src/store';
import { formatCurrency } from '@/src/utils/formatters';
import { MealType } from '@/src/constants/enums';

export default function MealDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: meal, isLoading, isError, error } = useMeal(id);
  const addItem = useCartStore((s) => s.addItem);
  const [qty, setQty] = React.useState(1);

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowDateString = tomorrow.toISOString().split('T')[0];
  const { data: activeMenu, isLoading: isLoadingMenu } = useActiveMenu(tomorrowDateString);
  const { data: availableMeals = [], isLoading: isLoadingMeals } = useScheduledMeals(activeMenu?.id);

  if (isLoading || isLoadingMenu || isLoadingMeals) {
    return (
      <View style={styles.container}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <LoadingSpinner fullScreen message="Loading meal..." />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.container}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <EmptyState
          icon="cloud-offline-outline"
          title="Couldn't load meal"
          subtitle={error?.message ?? 'Something went wrong.'}
          action={<Button title="Go Back" onPress={() => router.back()} variant="primary" size="sm" />}
        />
      </View>
    );
  }

  if (!meal) {
    return (
      <View style={styles.container}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <EmptyState icon="restaurant-outline" title="Meal not found" subtitle="This meal may no longer be available." />
      </View>
    );
  }

  const typeColor = meal.type === MealType.VEG ? Colors.success : Colors.error;
  const isScheduled = availableMeals.some(m => m.id === meal.id);
  const isOrderable = meal.isAvailable && isScheduled;

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Image source={{ uri: meal.imageUrl }} style={styles.image} />
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>

        <View style={styles.content}>
          <View style={styles.row}>
            <View style={[styles.typeDot, { backgroundColor: typeColor }]} />
            <Text style={styles.type}>{meal.type === MealType.VEG ? 'Veg' : meal.type === MealType.VEGAN ? 'Vegan' : 'Non-Veg'}</Text>
          </View>
          <Text style={styles.name}>{meal.name}</Text>
          <Text style={styles.description}>{meal.description}</Text>

          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <Ionicons name="star" size={16} color={Colors.warning} />
              <Text style={styles.metaText}>{meal.rating} ({meal.totalRatings})</Text>
            </View>
            <View style={styles.metaItem}>
              <Ionicons name="time-outline" size={16} color={Colors.textSecondary} />
              <Text style={styles.metaText}>{meal.preparationTime} min</Text>
            </View>
            {meal.servingSize && (
              <View style={styles.metaItem}>
                <Ionicons name="restaurant-outline" size={16} color={Colors.textSecondary} />
                <Text style={styles.metaText}>{meal.servingSize}</Text>
              </View>
            )}
          </View>

          {/* Unavailable banner */}
          {!isOrderable && (
            <View style={styles.unavailableBanner}>
              <Ionicons name="time-outline" size={18} color={Colors.error} />
              <Text style={styles.unavailableBannerText}>Not available for tomorrow's menu</Text>
            </View>
          )}

          {meal.tags.length > 0 && (
            <View style={styles.tags}>
              {meal.tags.map((tag) => (
                <View key={tag} style={styles.tag}><Text style={styles.tagText}>{tag}</Text></View>
              ))}
            </View>
          )}

          {meal.nutrition && (
            <View style={styles.nutritionCard}>
              <Text style={styles.nutritionTitle}>Nutrition Info</Text>
              <View style={styles.nutritionRow}>
                {[
                  { label: 'Calories', value: `${meal.nutrition.calories}` },
                  { label: 'Protein', value: meal.nutrition.protein },
                  { label: 'Carbs', value: meal.nutrition.carbs },
                  { label: 'Fat', value: meal.nutrition.fat },
                ].map((n) => (
                  <View key={n.label} style={styles.nutritionItem}>
                    <Text style={styles.nutritionValue}>{n.value}</Text>
                    <Text style={styles.nutritionLabel}>{n.label}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Bottom Bar */}
      {isOrderable ? (
        <View style={styles.bottomBar}>
          <View>
            <Text style={styles.price}>{formatCurrency(meal.price * qty)}</Text>
            {meal.originalPrice && <Text style={styles.originalPrice}>{formatCurrency(meal.originalPrice * qty)}</Text>}
          </View>
          <QuantitySelector quantity={qty} onIncrement={() => setQty(qty + 1)} onDecrement={() => setQty(Math.max(1, qty - 1))} min={1} />
          <Button
            title="Add to Cart"
            onPress={() => { addItem(meal, qty); router.back(); }}
            leftIcon={<Ionicons name="cart-outline" size={18} color={Colors.white} />}
          />
        </View>
      ) : (
        <View style={styles.bottomBarDisabled}>
          <Ionicons name="close-circle-outline" size={22} color={Colors.textTertiary} />
          <Text style={styles.disabledText}>This item is not available for tomorrow</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  image: { width: '100%', height: 280, backgroundColor: Colors.surfaceElevated },
  backBtn: {
    position: 'absolute', top: 50, left: 16,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.white, alignItems: 'center', justifyContent: 'center',
    ...Shadows.md,
  },
  content: { padding: Spacing.xl },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginBottom: Spacing.xs },
  typeDot: { width: 12, height: 12, borderRadius: 2 },
  type: { fontSize: Typography.size.sm, fontFamily: Typography.family.medium, color: Colors.textSecondary },
  name: { fontSize: Typography.size['2xl'], fontFamily: Typography.family.bold, color: Colors.textPrimary },
  description: { fontSize: Typography.size.base, color: Colors.textSecondary, lineHeight: 22, marginTop: Spacing.sm },
  metaRow: { flexDirection: 'row', gap: Spacing.xl, marginTop: Spacing.base },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  metaText: { fontSize: Typography.size.sm, color: Colors.textSecondary, fontFamily: Typography.family.medium },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.base },
  tag: { backgroundColor: Colors.primaryBg, paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs, borderRadius: Radii.full },
  tagText: { fontSize: Typography.size.xs, color: Colors.primary, fontFamily: Typography.family.medium },
  nutritionCard: { backgroundColor: Colors.surfaceElevated, borderRadius: Radii.lg, padding: Spacing.base, marginTop: Spacing.xl },
  nutritionTitle: { fontSize: Typography.size.base, fontFamily: Typography.family.semiBold, color: Colors.textPrimary, marginBottom: Spacing.md },
  nutritionRow: { flexDirection: 'row', justifyContent: 'space-between' },
  nutritionItem: { alignItems: 'center' },
  nutritionValue: { fontSize: Typography.size.md, fontFamily: Typography.family.bold, color: Colors.textPrimary },
  nutritionLabel: { fontSize: Typography.size.xs, color: Colors.textSecondary, marginTop: 2 },
  bottomBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: Spacing.base, paddingBottom: Spacing['2xl'],
    backgroundColor: Colors.surface, borderTopWidth: 1, borderTopColor: Colors.borderLight,
    ...Shadows.lg,
  },
  price: { fontSize: Typography.size.lg, fontFamily: Typography.family.bold, color: Colors.textPrimary },
  originalPrice: { fontSize: Typography.size.sm, color: Colors.textTertiary, textDecorationLine: 'line-through' },
  unavailableBanner: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.errorLight, borderRadius: Radii.md,
    padding: Spacing.md, marginTop: Spacing.base,
  },
  unavailableBannerText: {
    fontSize: Typography.size.sm, fontFamily: Typography.family.semiBold, color: Colors.error,
  },
  bottomBarDisabled: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm,
    padding: Spacing.base, paddingBottom: Spacing['2xl'],
    backgroundColor: Colors.surfaceElevated, borderTopWidth: 1, borderTopColor: Colors.borderLight,
  },
  disabledText: {
    fontSize: Typography.size.base, fontFamily: Typography.family.medium, color: Colors.textTertiary,
  },
});
