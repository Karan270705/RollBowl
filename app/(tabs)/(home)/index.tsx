import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radii, Shadows } from '@/src/constants/theme';
import { ScreenWrapper, Section } from '@/src/components/layout';
import { SearchBar, LoadingSpinner, EmptyState, Button } from '@/src/components/ui';
import { MealCard, CategoryPills } from '@/src/components/shared';
import { useUser, useCartStore } from '@/src/store';
import { useAllMeals, useScheduledMeals, useOperationalWindow, useLiveInventory } from '@/src/hooks';
import { getGreeting, formatFriendlyDate, formatTimeSlot } from '@/src/utils/formatters';

export default function HomeScreen() {
  const router = useRouter();
  const user = useUser();
  const addItem = useCartStore((state) => state.addItem);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  // ─── Operational Engine ─────────────────────────────────────────
  const { data: opFacts, isLoading: isLoadingOp, isError, error, refetch } = useOperationalWindow();
  
  const { data: availableMeals = [], isLoading: isLoadingMeals } = useScheduledMeals(opFacts?.activeMenu?.id);

  // ─── Live Inventory ─────────────────────────────────────────────
  const stallId = opFacts?.activeMenu?.stall_id;
  const { data: inventory = [], isLoading: isLoadingInventory } = useLiveInventory(stallId, opFacts?.operationalDate);

  const isLoading = isLoadingOp || isLoadingMeals || isLoadingInventory;

  // Helper to get inventory status for a meal
  const getInventoryInfo = (mealId: string) => {
    // If no active inventory batches exist, it returns empty array -> fallback to 'pending' (preorder logic)
    if (!inventory || inventory.length === 0) return { status: 'pending' as const, quantity: undefined };
    
    const item = inventory.find(i => i.meal_id === mealId);
    if (!item) return { status: 'not_in_batch' as const, quantity: 0 };
    return { status: item.stock_status, quantity: item.customer_available };
  };

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
  if (isError || !opFacts) {
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
          title="Couldn't load menu"
          subtitle={error?.message ?? 'We could not fetch the operational status.'}
          action={
            <Button title="Retry" onPress={() => refetch()} variant="primary" size="sm" />
          }
        />
      </ScreenWrapper>
    );
  }

  // ─── STATUS SWITCH ─────────────────────────────────────────

  // MENU COMING SOON
  if (opFacts.status === 'MENU_COMING_SOON') {
    return (
      <ScreenWrapper>
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>{getGreeting()} 👋</Text>
            <Text style={styles.userName}>{user?.name ?? 'Student'}</Text>
          </View>
        </View>
        <EmptyState
          icon="calendar-outline"
          title="Menu Coming Soon"
          subtitle="The kitchen has not published the upcoming menu yet. Please check back later!"
        />
      </ScreenWrapper>
    );
  }

  // HOLIDAY
  if (opFacts.status === 'HOLIDAY') {
    // If it's a holiday, we can safely compute resumeDate manually for UI just as an estimation (e.g. operationalDate + 1)
    // Or we rely entirely on the fact. Let's just show standard holiday UI.
    const d = new Date(opFacts.operationalDate);
    d.setDate(d.getDate() + 1);
    const resumeDate = d.toISOString().split('T')[0];

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

        {/* Holiday Empty State */}
        <View style={styles.holidayContainer}>
          <Text style={styles.holidayEmoji}>🏖</Text>
          <Text style={styles.holidayTitle}>Kitchen Closed</Text>
          <Text style={styles.holidayDate}>{formatFriendlyDate(opFacts.operationalDate)}</Text>

          <View style={styles.holidayCard}>
            <Text style={styles.holidayCardLabel}>Holiday</Text>
            <Text style={styles.holidayCardValue}>{opFacts.holidayDetails?.title || 'Public Holiday'}</Text>
            {opFacts.holidayDetails?.description ? (
              <Text style={styles.holidayCardDesc}>{opFacts.holidayDetails.description}</Text>
            ) : null}
          </View>

          <View style={styles.resumeRow}>
            <Ionicons name="checkmark-circle-outline" size={18} color={Colors.success} />
            <Text style={styles.resumeText}>
              Ordering will automatically resume on{' '}
              <Text style={{ fontFamily: Typography.family.bold }}>
                {formatFriendlyDate(resumeDate)}
              </Text>
            </Text>
          </View>
        </View>
      </ScreenWrapper>
    );
  }

  // ─── Compute Banner Status ────────────────────────────────
  let statusTitle = '';
  let statusSubtitle = '';
  let statusColor: string = Colors.primary;
  let statusIcon: React.ComponentProps<typeof Ionicons>['name'] = 'time-outline';

  if (opFacts.status === 'ORDERING_OPEN') {
    statusTitle = `Menu Available`;
    statusSubtitle = `Place your order before the cutoff.`;
    statusColor = Colors.success;
    statusIcon = 'checkmark-circle';
  } else if (opFacts.status === 'ORDERING_CLOSED' || opFacts.isPrepTime) {
    statusTitle = 'Orders Closed';
    statusSubtitle = 'We are preparing the meals. Pickup starts soon.';
    statusColor = Colors.warning;
    statusIcon = 'restaurant-outline';
  } else if (opFacts.status === 'PICKUP_ACTIVE') {
    statusTitle = 'Pickup Window Active';
    statusSubtitle = 'Head to the stall to collect your order.';
    statusColor = Colors.primary;
    statusIcon = 'basket-outline';
  } else {
    // Catch-all
    statusTitle = 'Kitchen Closed';
    statusSubtitle = 'Ordering is currently closed.';
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
        { backgroundColor: opFacts.canPlaceOrders ? Colors.successLight : Colors.primaryBg }
      ]}>
        <Ionicons name={statusIcon} size={24} color={statusColor} />
        <View style={styles.statusInfo}>
          <Text style={[styles.statusTitle, { color: statusColor }]}>{statusTitle}</Text>
          <Text style={styles.statusSubtitle}>{statusSubtitle}</Text>
        </View>
      </View>

      {/* ─── Section: Operational Menu ─── */}
      {availableMeals.length > 0 && (
        <Section title={`Menu for ${formatFriendlyDate(opFacts.operationalDate)}`}>
          {(!inventory || inventory.length === 0) && (opFacts.status === 'PICKUP_ACTIVE' || opFacts.status === 'ORDERING_CLOSED') && (
            <View style={styles.noBatchBanner}>
              <Ionicons name="information-circle-outline" size={16} color={Colors.textSecondary} style={{ marginRight: Spacing.xs }} />
              <Text style={styles.noBatchText}>Live pickup stock has not been loaded yet.</Text>
            </View>
          )}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingVertical: Spacing.xs }}>
            {availableMeals.map((meal) => {
              const inv = getInventoryInfo(meal.id);
              const isOrderable = opFacts.canPlaceOrders && inv.status !== 'out_of_stock' && inv.status !== 'not_in_batch';
              return (
                <MealCard
                  key={meal.id}
                  meal={meal}
                  prominent
                  onPress={() => router.push(`/(tabs)/(home)/meal/${meal.id}` as any)}
                  onAddToCart={isOrderable ? () => addItem(meal, 1) : undefined}
                  isOrderable={opFacts.canPlaceOrders}
                  inventoryStatus={inv.status}
                  availableQuantity={inv.quantity}
                />
              );
            })}
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
            const isOrderable = opFacts.canPlaceOrders && isScheduled;
            const inv = getInventoryInfo(meal.id);
            const isActuallyOrderable = isOrderable && inv.status !== 'out_of_stock' && inv.status !== 'not_in_batch';
            return (
              <MealCard
                key={meal.id}
                meal={meal}
                onPress={() => router.push(`/(tabs)/(home)/meal/${meal.id}` as any)}
                onAddToCart={isActuallyOrderable ? () => addItem(meal, 1) : undefined}
                isOrderable={isOrderable}
                inventoryStatus={inv.status}
                availableQuantity={inv.quantity}
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
  statusBanner: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    padding: Spacing.base, borderRadius: Radii.lg, marginBottom: Spacing.base,
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
  noBatchBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primaryBg,
    padding: Spacing.sm,
    borderRadius: Radii.md,
    marginBottom: Spacing.sm,
  },
  noBatchText: {
    fontFamily: Typography.family.medium,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
  },
});
