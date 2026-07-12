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
import { getGreeting, formatFriendlyDate } from '@/src/utils/formatters';
import { MenuStoreState } from '@/src/utils/menuState';
import { Button } from '@/src/components/ui';

export default function HomeScreen() {
  const router = useRouter();
  const user = useUser();
  const addItem = useCartStore((state) => state.addItem);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  // ─── Date Strings ────────────────────────────────────────
  const todayDate = new Date();
  const todayDateString = todayDate.toISOString().split('T')[0];

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowDateString = tomorrow.toISOString().split('T')[0];

  // ─── Menu Queries ─────────────────────────────────────────
  // useActiveMenu now waits for BOTH menu + holiday queries before settling
  const {
    data: activeMenu,
    storeStatus,
    isLoading: isLoadingMenu,
    isError,
    error,
    refetch,
    isHoliday,
    holiday,
    resumeDate,
  } = useActiveMenu(tomorrowDateString);

  const { data: availableMeals = [], isLoading: isLoadingMeals } = useScheduledMeals(activeMenu?.id);

  // Today's Menu (only shown during pickup window)
  const { data: todayMenu, isLoading: isLoadingTodayMenu } = useActiveMenu(todayDateString);
  const { data: todayMeals = [], isLoading: isLoadingTodayMeals } = useScheduledMeals(todayMenu?.id);

  const isLoading = isLoadingMenu || isLoadingMeals || isLoadingTodayMenu || isLoadingTodayMeals;

  // ─── Browse Catalog ───────────────────────────────────────
  const { data: allMeals = [] } = useAllMeals();

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

  // ─── Loading ─────────────────────────────────────────────
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

  // ─── Error ────────────────────────────────────────────────
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

  // ─── HOLIDAY STATE: Highest Priority ─────────────────────
  // When tomorrow is a holiday, replace everything with the Holiday screen.
  // Do NOT render disabled menu items. Do NOT render category chips.
  if (isHoliday) {
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

        {/* Holiday Banner */}
        <View style={styles.holidayBanner}>
          <Ionicons name="close-circle" size={22} color={Colors.error} />
          <View style={styles.statusInfo}>
            <Text style={[styles.statusTitle, { color: Colors.error }]}>Kitchen Closed Tomorrow</Text>
            <Text style={styles.statusSubtitle}>{storeStatus.subtitle}</Text>
          </View>
        </View>

        {/* Holiday Empty State — full-screen, premium */}
        <View style={styles.holidayContainer}>
          <Text style={styles.holidayEmoji}>🏖</Text>
          <Text style={styles.holidayTitle}>Kitchen Closed</Text>
          <Text style={styles.holidayDate}>{formatFriendlyDate(tomorrowDateString)}</Text>

          <View style={styles.holidayCard}>
            <Text style={styles.holidayCardLabel}>Holiday</Text>
            <Text style={styles.holidayCardValue}>{holiday?.title || 'Public Holiday'}</Text>
            {holiday?.description ? (
              <Text style={styles.holidayCardDesc}>{holiday.description}</Text>
            ) : null}
          </View>

          {resumeDate ? (
            <View style={styles.resumeRow}>
              <Ionicons name="checkmark-circle-outline" size={18} color={Colors.success} />
              <Text style={styles.resumeText}>
                Ordering will automatically resume on{' '}
                <Text style={{ fontFamily: Typography.family.bold }}>
                  {formatFriendlyDate(resumeDate)}
                </Text>
              </Text>
            </View>
          ) : null}
        </View>
      </ScreenWrapper>
    );
  }

  // ─── Normal States ────────────────────────────────────────
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
      <View style={[
        styles.statusBanner,
        { backgroundColor: storeStatus.isOrderingOpen ? Colors.successLight : Colors.primaryBg }
      ]}>
        <Ionicons
          name={storeStatus.isOrderingOpen ? 'checkmark-circle' : 'time-outline'}
          size={24}
          color={storeStatus.isOrderingOpen ? Colors.success : Colors.primary}
        />
        <View style={styles.statusInfo}>
          <Text style={[styles.statusTitle, { color: storeStatus.isOrderingOpen ? Colors.success : Colors.primary }]}>
            {storeStatus.title}
          </Text>
          <Text style={styles.statusSubtitle}>{storeStatus.subtitle}</Text>
        </View>
      </View>

      {/* ─── Section: Today's Menu (Pickup Window Only) ─── */}
      {storeStatus.state === MenuStoreState.PICKUP_ACTIVE && todayMeals.length > 0 && (
        <Section title={`Today's Menu (${formatFriendlyDate(todayDateString)})`}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingVertical: Spacing.xs }}>
            {todayMeals.map((meal) => (
              <MealCard
                key={`today-${meal.id}`}
                meal={meal}
                prominent
                onPress={() => router.push(`/(tabs)/(home)/meal/${meal.id}` as any)}
                isOrderable={false}
              />
            ))}
          </ScrollView>
        </Section>
      )}

      {/* ─── Section: Tomorrow's Menu ─── */}
      {availableMeals.length > 0 && (
        <Section title={`Tomorrow's Menu (${formatFriendlyDate(tomorrowDateString)})`}>
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

      {/* ─── Section: Browse Catalog ─── */}
      <SearchBar value={search} onChangeText={setSearch} placeholder="Search the catalog..." />
      <CategoryPills selected={selectedCategory} onSelect={setSelectedCategory} />
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
  holidayBanner: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    padding: Spacing.base, borderRadius: Radii.lg, marginBottom: Spacing.base,
    backgroundColor: Colors.error + '15',
  },
  statusInfo: { flex: 1 },
  statusTitle: { fontSize: Typography.size.base, fontFamily: Typography.family.bold },
  statusSubtitle: { fontSize: Typography.size.sm, color: Colors.textSecondary, marginTop: 2 },

  // ─── Holiday Empty State ───────────────────────────────────
  holidayContainer: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: Spacing.xl, paddingBottom: Spacing['3xl'],
  },
  holidayEmoji: { fontSize: 64, marginBottom: Spacing.lg },
  holidayTitle: {
    fontSize: Typography.size['2xl'], fontFamily: Typography.family.bold,
    color: Colors.textPrimary, marginBottom: Spacing.xs,
  },
  holidayDate: {
    fontSize: Typography.size.base, color: Colors.textSecondary,
    fontFamily: Typography.family.medium, marginBottom: Spacing.xl,
  },
  holidayCard: {
    width: '100%', backgroundColor: Colors.surface, borderRadius: Radii.xl,
    padding: Spacing.lg, marginBottom: Spacing.xl,
    borderWidth: 1, borderColor: Colors.error + '30', ...Shadows.md,
  },
  holidayCardLabel: {
    fontSize: Typography.size.xs, color: Colors.error,
    fontFamily: Typography.family.semiBold, textTransform: 'uppercase',
    letterSpacing: 0.8, marginBottom: Spacing.xs,
  },
  holidayCardValue: {
    fontSize: Typography.size.lg, fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
  },
  holidayCardDesc: {
    fontSize: Typography.size.sm, color: Colors.textSecondary,
    marginTop: Spacing.xs, lineHeight: 20,
  },
  resumeRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
    backgroundColor: Colors.successLight, borderRadius: Radii.lg,
    padding: Spacing.base, width: '100%',
  },
  resumeText: {
    flex: 1, fontSize: Typography.size.sm, color: Colors.success,
    fontFamily: Typography.family.medium, lineHeight: 20,
  },
});
