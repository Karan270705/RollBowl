import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Typography, Spacing, Radii, Shadows } from '@/src/constants/theme';
import { ScreenWrapper, Section } from '@/src/components/layout';
import { SearchBar, LoadingSpinner, EmptyState } from '@/src/components/ui';
import { MealCard, CategoryPills } from '@/src/components/shared';
import { useUser, useCartStore } from '@/src/store';
import { useAllMeals, useActiveMenu, useScheduledMeals } from '@/src/hooks';
import { getGreeting } from '@/src/utils/formatters';
import { MenuStoreState } from '@/src/utils/menuState';
import { Button } from '@/src/components/ui';

export default function HomeScreen() {
  const router = useRouter();
  const user = useUser();
  const addItem = useCartStore((state) => state.addItem);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  // ─── Menu Schedules ────────────────────────────────────
  const todayDate = new Date();
  const todayDateString = todayDate.toISOString().split('T')[0];
  
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowDateString = tomorrow.toISOString().split('T')[0];
  
  // Tomorrow's Menu
  const { data: activeMenu, storeStatus, isLoading: isLoadingMenu } = useActiveMenu(tomorrowDateString);
  const { data: availableMeals = [], isLoading: isLoadingMeals, isError, error, refetch } = useScheduledMeals(activeMenu?.id);
  
  // Today's Menu (mostly for reference during pickup)
  const { data: todayMenu, isLoading: isLoadingTodayMenu } = useActiveMenu(todayDateString);
  const { data: todayMeals = [], isLoading: isLoadingTodayMeals } = useScheduledMeals(todayMenu?.id);

  const isLoading = isLoadingMenu || isLoadingMeals || isLoadingTodayMenu || isLoadingTodayMeals;

  // ─── Browse Catalog: full catalog (available + unavailable) ─
  const { data: allMeals = [] } = useAllMeals();

  // Filter the catalog by category and search
  const filteredCatalog = useMemo(() => {
    return allMeals.filter((m) => {
      const matchesCategory = selectedCategory === 'all' || m.category === selectedCategory;
      const matchesSearch =
        search.trim() === '' ||
        m.name.toLowerCase().includes(search.toLowerCase()) ||
        m.description.toLowerCase().includes(search.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [allMeals, selectedCategory, search]);

  // ─── Loading state ─────────────────────────────────────────
  if (isLoading) {
    return (
      <ScreenWrapper>
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>{getGreeting()} 👋</Text>
            <Text style={styles.userName}>{user?.name ?? 'Student'}</Text>
          </View>
        </View>
        <LoadingSpinner fullScreen message="Loading items..." />
      </ScreenWrapper>
    );
  }

  // ─── Error state ───────────────────────────────────────────
  if (isError) {
    return (
      <ScreenWrapper>
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>{getGreeting()} 👋</Text>
            <Text style={styles.userName}>{user?.name ?? 'Student'}</Text>
          </View>
        </View>
        <EmptyState
          icon="cloud-offline-outline"
          title="Couldn't load items"
          subtitle={error?.message ?? 'Something went wrong. Please try again.'}
          action={
            <Button title="Retry" onPress={() => refetch()} variant="primary" size="sm" />
          }
        />
      </ScreenWrapper>
    );
  }

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
        </TouchableOpacity>
      </View>

      {/* Store Status Banner */}
      <View style={[styles.statusBanner, { backgroundColor: storeStatus.isOrderingOpen ? Colors.successLight : Colors.primaryBg }]}>
        <Ionicons name={storeStatus.isOrderingOpen ? "checkmark-circle" : "time-outline"} size={24} color={storeStatus.isOrderingOpen ? Colors.success : Colors.primary} />
        <View style={styles.statusInfo}>
          <Text style={[styles.statusTitle, { color: storeStatus.isOrderingOpen ? Colors.success : Colors.primary }]}>{storeStatus.title}</Text>
          <Text style={styles.statusSubtitle}>{storeStatus.subtitle}</Text>
        </View>
      </View>

      {/* ─── Section: Today's Menu (Only shown during Pickup) ─── */}
      {storeStatus.state === MenuStoreState.PICKUP_ACTIVE && todayMeals.length > 0 && (
        <Section title={`Today's Menu (Pickup Active)`}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingVertical: Spacing.xs }}>
            {todayMeals.map((meal) => (
              <MealCard
                key={`today-${meal.id}`}
                meal={meal}
                prominent
                onPress={() => router.push(`/(tabs)/(home)/meal/${meal.id}` as any)}
                isOrderable={false} // Can't order today's menu now
              />
            ))}
          </ScrollView>
        </Section>
      )}

      {/* ─── Section 1: Tomorrow's Menu (horizontal scroll, scheduled only) ─── */}
      {availableMeals.length > 0 && (
        <Section title={`Tomorrow's Menu  (${availableMeals.length})`}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingVertical: Spacing.xs }}>
            {availableMeals.map((meal) => (
              <MealCard
                key={meal.id}
                meal={meal}
                prominent
                onPress={() => router.push(`/(tabs)/(home)/meal/${meal.id}` as any)}
                onAddToCart={storeStatus.isOrderingOpen ? () => addItem(meal, 1) : undefined}
                isOrderable={storeStatus.isOrderingOpen}
              />
            ))}
          </ScrollView>
        </Section>
      )}

      {/* ─── Section 2: Browse Catalog (full grid with filters) ─── */}
      {/* Search */}
      <SearchBar value={search} onChangeText={setSearch} placeholder="Search the catalog..." />

      {/* Category filters */}
      <CategoryPills selected={selectedCategory} onSelect={setSelectedCategory} />

      {/* Catalog Grid */}
      <Section title="Browse Catalog">
        {filteredCatalog.length === 0 ? (
          <EmptyState
            icon="restaurant-outline"
            title="No items found"
            subtitle={
              search.trim()
                ? `No results for "${search}". Try a different search.`
                : 'No items in this category.'
            }
          />
        ) : (
          filteredCatalog.map((meal) => {
            const isScheduled = availableMeals.some(m => m.id === meal.id);
            const isOrderable = storeStatus.isOrderingOpen && isScheduled;
            
            return (
              <MealCard
                key={meal.id}
                meal={meal}
                onPress={() => router.push(`/(tabs)/(home)/meal/${meal.id}` as any)}
                onAddToCart={isOrderable ? () => addItem(meal, 1) : undefined}
                isOrderable={isOrderable}
              />
            );
          })
        )}
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
  statusBanner: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    padding: Spacing.base, borderRadius: Radii.lg, marginBottom: Spacing.base,
  },
  statusInfo: { flex: 1 },
  statusTitle: { fontSize: Typography.size.base, fontFamily: Typography.family.bold },
  statusSubtitle: { fontSize: Typography.size.sm, color: Colors.textSecondary, marginTop: 2 },
});
