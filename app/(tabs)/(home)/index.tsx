import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, FlatList, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Typography, Spacing, Radii, Shadows } from '@/src/constants/theme';
import { ScreenWrapper, Section } from '@/src/components/layout';
import { SearchBar } from '@/src/components/ui';
import { MealCard, CategoryPills } from '@/src/components/shared';
import { useUser, useCartStore } from '@/src/store';
import { MOCK_MEALS, MOCK_SUBSCRIPTION, MOCK_NOTIFICATIONS, MOCK_INVENTORY } from '@/src/constants/mockData';
import { getGreeting, formatCurrency, pickRandomFeatured } from '@/src/utils/formatters';

export default function HomeScreen() {
  const router = useRouter();
  const user = useUser();
  const addItem = useCartStore((state) => state.addItem);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  // MVP: is_featured is false for all seeded meals. Randomly pick 3 once per mount
  // so the Featured section is stable across re-renders until the app reloads.
  // Future migration: replace the line below with:
  //   const featuredMeals = meals.filter(meal => meal.is_featured);
  const featuredMeals = useMemo(() => pickRandomFeatured(MOCK_MEALS, 3), []);
  const filteredMeals = MOCK_MEALS.filter((m) => {
    const matchesCategory = selectedCategory === 'all' || m.category === selectedCategory;
    const matchesSearch = search.trim() === '' || 
      m.name.toLowerCase().includes(search.toLowerCase()) || 
      m.description.toLowerCase().includes(search.toLowerCase());
    return m.isAvailable && matchesCategory && matchesSearch;
  });

  const unreadNotifs = MOCK_NOTIFICATIONS.filter((n) => !n.isRead).length;
  const availableExtras = MOCK_INVENTORY.filter((i) => i.isAvailable && i.availableQuantity > 0);

  return (
    <ScreenWrapper>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>{getGreeting()} 👋</Text>
          <Text style={styles.userName}>{user?.name ?? 'Student'}</Text>
        </View>
        <TouchableOpacity style={styles.notifButton} onPress={() => router.push('/(tabs)/(notifications)' as any)}>
          <Ionicons name="notifications-outline" size={24} color={Colors.textPrimary} />
          {unreadNotifs > 0 && <View style={styles.notifDot} />}
        </TouchableOpacity>
      </View>

      {/* Search */}
      <SearchBar value={search} onChangeText={setSearch} placeholder="Search meals, stalls..." />

      {/* Subscription Banner */}
      <TouchableOpacity
        style={styles.subBanner}
        onPress={() => router.push('/(tabs)/(subscription)' as any)}
        activeOpacity={0.85}
      >
        <LinearGradient colors={['#C41E24', '#E04040']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.subGradient}>
          <View style={styles.subInfo}>
            <Text style={styles.subTitle}>🎫 {MOCK_SUBSCRIPTION.planName} Plan Active</Text>
            <Text style={styles.subDetail}>
              {MOCK_SUBSCRIPTION.remainingMeals} meals remaining • Expires {MOCK_SUBSCRIPTION.endDate}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.8)" />
        </LinearGradient>
      </TouchableOpacity>
      {/* Extra Meals Available */}
      {availableExtras.length > 0 && (
        <TouchableOpacity
          style={styles.extraBanner}
          onPress={() => router.push('/(tabs)/(home)/availability' as any)}
          activeOpacity={0.8}
        >
          <View style={styles.extraIcon}>
            <Ionicons name="flash" size={18} color={Colors.secondary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.extraTitle}>{availableExtras.length} Extra Meals Available</Text>
            <Text style={styles.extraSubtitle}>Reserve before they're gone</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />
        </TouchableOpacity>
      )}

      {/* Featured */}
      <Section title="Featured Today" actionLabel="See all">
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {featuredMeals.map((meal) => (
            <MealCard
              key={meal.id}
              meal={meal}
              compact
              onPress={() => router.push(`/(tabs)/(home)/meal/${meal.id}` as any)}
              onAddToCart={() => addItem(meal, 1)}
            />
          ))}
        </ScrollView>
      </Section>

      {/* Categories */}
      <CategoryPills selected={selectedCategory} onSelect={setSelectedCategory} />

      {/* Meals Grid */}
      <Section title="Today's Menu">
        {filteredMeals.map((meal) => (
          <MealCard
            key={meal.id}
            meal={meal}
            onPress={() => router.push(`/(tabs)/(home)/meal/${meal.id}` as any)}
            onAddToCart={() => addItem(meal, 1)}
          />
        ))}
      </Section>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: Spacing.xl, marginBottom: Spacing.base,
  },
  greeting: { fontSize: Typography.size.sm, color: Colors.textSecondary, fontFamily: Typography.family.regular },
  userName: { fontSize: Typography.size.xl, fontFamily: Typography.family.bold, color: Colors.textPrimary },
  notifButton: { position: 'relative', padding: Spacing.sm },
  notifDot: {
    position: 'absolute', top: 8, right: 8,
    width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.error,
  },
  subBanner: { borderRadius: Radii.lg, overflow: 'hidden', marginVertical: Spacing.base, ...Shadows.md },
  subGradient: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: Spacing.base,
  },
  subInfo: { flex: 1 },
  subTitle: { fontSize: Typography.size.base, fontFamily: Typography.family.bold, color: Colors.white },
  subDetail: { fontSize: Typography.size.sm, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  extraBanner: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.secondaryLight, borderRadius: Radii.lg,
    padding: Spacing.base, marginBottom: Spacing.sm,
  },
  extraIcon: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.white, alignItems: 'center', justifyContent: 'center',
  },
  extraTitle: { fontSize: Typography.size.sm, fontFamily: Typography.family.semiBold, color: Colors.textPrimary },
  extraSubtitle: { fontSize: Typography.size.xs, color: Colors.textSecondary, marginTop: 1 },
});
