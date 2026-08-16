import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, FlatList } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radii, Shadows } from '@/src/constants/theme';
import { ScreenWrapper, Section } from '@/src/components/layout';
import { SearchBar, LoadingSpinner, EmptyState, Button } from '@/src/components/ui';
import { MealCard, CategoryPills, StickyCartBar } from '@/src/components/shared';
import { useUser, useCartStore } from '@/src/store';
import { useAllMeals, useScheduledMeals, useOperationalWindow, useLiveInventory } from '@/src/hooks';
import { useQueryClient } from '@tanstack/react-query';
import { getGreeting, formatFriendlyDate, formatTime, formatScheduleWindow } from '@/src/utils/formatters';
import { resolveCustomerMealAvailability, type InventoryMode } from '@/src/engine/availabilityResolver';

export default function HomeScreen() {
  const router = useRouter();
  const user = useUser();
  const addItem = useCartStore((state) => state.addItem);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const queryClient = useQueryClient();

  // ─── Operational Engine ─────────────────────────────────────────
  const {
    data: opFacts,
    isLoading: isLoadingOp,
    isError,
    error,
    refetch,
    operationalContext,
    targetDate,
    primaryStallId,
  } = useOperationalWindow();
  
  const { data: availableMeals = [], isLoading: isLoadingMeals } = useScheduledMeals(opFacts?.activeMenu?.id);

  // ─── Live Inventory ─────────────────────────────────────────────
  const stallId = primaryStallId || opFacts?.activeMenu?.stall_id;
  const { data: inventory = [], isLoading: isLoadingInventory } = useLiveInventory(stallId, targetDate);

  const { data: allMeals = [] } = useAllMeals();

  const isLoading = isLoadingOp || isLoadingMeals || isLoadingInventory;

  // Active batch / mode resolution
  const activeBatch = inventory.find(
    (b) => b.batch_status === 'active' && b.stall_id === stallId && b.inventory_date === targetDate
  );
  const activeBatchId = activeBatch ? activeBatch.batch_id : null;
  const inventoryMode: InventoryMode = activeBatchId ? 'LIVE_INVENTORY' : 'UNTRACKED';
  const orderMode = inventoryMode;

  const inventoryByMealId = useMemo(() => {
    return new Map(inventory.map(item => [item.meal_id, item]));
  }, [inventory]);

  useEffect(() => {
    if (targetDate) {
      console.log('[INVENTORY MODE]', JSON.stringify({
        serviceDate: targetDate,
        mode: inventoryMode,
        batchId: activeBatchId || null,
        customerAvailableCount: inventory.length,
        timestamp: new Date().toISOString(),
      }, null, 2));
    }

    console.log('[INSTRUMENTATION: HOME SCREEN PIPELINE]', JSON.stringify({
      primaryStallId: primaryStallId || 'none',
      operationalContext: {
        calendarDate: operationalContext.calendarDate,
        resolvedOperationalDate: operationalContext.resolvedOperationalDate,
        preparationDate: operationalContext.preparationDate,
        reason: operationalContext.reason,
        resolutionReason: operationalContext.resolutionReason,
        isResolving: operationalContext.isResolving,
      },
      opFacts: opFacts ? {
        operationalDate: opFacts.operationalDate,
        status: opFacts.status,
        hasPublishedMenu: opFacts.hasPublishedMenu,
        activeMenuDate: opFacts.activeMenu?.menu_date || null,
        activeMenuId: opFacts.activeMenu?.id || null,
        canPlaceOrders: opFacts.canPlaceOrders,
        pickupWindowOpen: opFacts.pickupWindowOpen,
      } : null,
      targetDate,
      availableMealsCount: availableMeals.length,
      inventoryCount: inventory.length,
      inventoryMode,
      activeBatchId: activeBatchId || null,
      timestamp: new Date().toISOString(),
    }, null, 2));
  }, [
    targetDate,
    inventoryMode,
    activeBatchId,
    inventory.length,
    primaryStallId,
    operationalContext.calendarDate,
    operationalContext.resolvedOperationalDate,
    operationalContext.preparationDate,
    operationalContext.reason,
    operationalContext.resolutionReason,
    operationalContext.isResolving,
    opFacts,
    availableMeals.length,
  ]);


  // ─── Browse Catalog ───────────────────────────────────────

  const filteredCatalog = useMemo(() => {
    const baseFiltered = allMeals.filter((m) => {
      const matchesCategory = selectedCategory === 'all' || m.category === selectedCategory;
      const matchesSearch =
        search.trim() === '' ||
        m.name.toLowerCase().includes(search.toLowerCase()) ||
        m.description.toLowerCase().includes(search.toLowerCase());
      return matchesCategory && matchesSearch;
    });

    const scheduledMealIds = new Set(availableMeals.map(m => m.id));

    return [...baseFiltered].sort((a, b) => {
      const isAvailableA = a.isAvailable === true && scheduledMealIds.has(a.id);
      const isAvailableB = b.isAvailable === true && scheduledMealIds.has(b.id);
      
      if (isAvailableA !== isAvailableB) {
        return isAvailableA ? -1 : 1;
      }
      
      // Preserve existing meaningful order (stable sort)
      return 0;
    });
  }, [allMeals, selectedCategory, search, availableMeals]);

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

  // MENU SCHEDULED (Published but before visible_from boundary)
  if (opFacts.status === 'MENU_SCHEDULED') {
    return (
      <ScreenWrapper>
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>{getGreeting()} 👋</Text>
            <Text style={styles.userName}>{user?.name ?? 'Student'}</Text>
          </View>
        </View>
        <EmptyState
          icon="time-outline"
          title="Menu Scheduled"
          subtitle={opFacts.orderingStart ? `Menu will be available at ${formatTime(opFacts.orderingStart)}` : "Menu will be available later"}
        />
      </ScreenWrapper>
    );
  }

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
  const canOrder = 
    opFacts?.activeMenu?.is_published === true &&
    opFacts?.status === "ORDERING_OPEN" && 
    opFacts?.isPrepTime !== true;

  const orderStateFinal = {
    nowISO: new Date().toISOString(),
    resolvedDate: operationalContext?.resolvedOperationalDate,
    opFactsStatus: opFacts?.status,
    isPrepTime: opFacts?.isPrepTime,
    orderCutoff: opFacts?.activeMenu?.order_cutoff,
    menuDate: opFacts?.activeMenu?.menu_date,
    menuPublished: Boolean(opFacts?.activeMenu?.is_published),
    inventoryLength: inventory?.length ?? 0,
    activeBatchId,
    orderMode,
    canOrder,
  };

  console.log("[ORDER STATE FINAL]", JSON.stringify(orderStateFinal, null, 2));

  let statusTitle = '';
  let statusSubtitle = '';
  let statusColor: string = Colors.primary;
  let statusIcon: React.ComponentProps<typeof Ionicons>['name'] = 'time-outline';

  if (canOrder) {
    statusTitle = `Menu Available`;
    statusSubtitle = opFacts?.orderingEnd ? `Ordering closes at ${formatTime(opFacts.orderingEnd)}` : `Place your order before the cutoff.`;
    statusColor = Colors.success;
    statusIcon = 'checkmark-circle';
  } else if (opFacts.status === 'ORDERING_CLOSED' || opFacts.isPrepTime) {
    statusTitle = 'Orders Closed';
    statusSubtitle = opFacts?.deliveryStart ? `Pickup starts at ${formatTime(opFacts.deliveryStart)}` : 'The kitchen is getting ready for service. Pickup starts soon.';
    statusColor = Colors.warning;
    statusIcon = 'restaurant-outline';
  } else if (opFacts.status === 'PICKUP_ACTIVE') {
    statusTitle = 'Pickup Window Active';
    statusSubtitle = (opFacts?.deliveryStart && opFacts?.deliveryEnd) ? `Pickup window: ${formatTime(opFacts.deliveryStart)} - ${formatTime(opFacts.deliveryEnd)}` : 'Head to the stall to collect your order.';
    statusColor = Colors.primary;
    statusIcon = 'basket-outline';
  } else {
    // Catch-all
    statusTitle = 'Kitchen Closed';
    statusSubtitle = 'Ordering is currently closed.';
  }

  const renderHeader = () => (
    <>
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
        { backgroundColor: canOrder ? Colors.successLight : Colors.primaryBg }
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
              const invItem = inventoryByMealId.get(meal.id);
              const availability = resolveCustomerMealAvailability({
                mealId: meal.id,
                serviceDate: opFacts?.operationalDate,
                isPublished: true,
                mealIsAvailable: meal.isAvailable,
                inventoryMode,
                customerAvailable: invItem ? invItem.customer_available : null,
                activeBatchId,
                canPlaceOrders: Boolean(canOrder),
                logDiagnostic: true,
              });

              const handleAdd = availability.canAdd ? (): boolean => {
                if (inventoryMode === 'LIVE_INVENTORY' && availability.availableQuantity !== null) {
                  const currentQty = useCartStore.getState().items.find(i => i.meal.id === meal.id)?.quantity || 0;
                  if (currentQty >= availability.availableQuantity) {
                    alert(`Only ${availability.availableQuantity} available.`);
                    return false;
                  }
                }
                addItem(meal, opFacts?.operationalDate, 1);
                return true;
              } : undefined;

              return (
                <MealCard
                  key={meal.id}
                  meal={meal}
                  prominent
                  onPress={() => router.push(`/(tabs)/(home)/meal/${meal.id}` as any)}
                  onAddToCart={handleAdd}
                  isOrderable={availability.canAdd}
                  availability={availability}
                />
              );
            })}
          </ScrollView>
        </Section>
      )}

      {/* ─── Section: Browse Catalog ─── */}
      <SearchBar value={search} onChangeText={setSearch} placeholder="Search the catalog..." />
      <CategoryPills selected={selectedCategory} onSelect={setSelectedCategory} />
      
      <Text style={styles.catalogTitle}>Browse Catalog</Text>
      
      {filteredCatalog.length === 0 && (
        <EmptyState
          icon="restaurant-outline"
          title="No items found"
          subtitle={
            search.trim()
              ? `No results for "${search}". Try a different search.`
              : 'No items in this category.'
          }
        />
      )}
    </>
  );

  const renderMealItem = ({ item: meal }: { item: any }) => {
    const isScheduled = availableMeals.some(m => m.id === meal.id);
    const invItem = inventoryByMealId.get(meal.id);
    const availability = resolveCustomerMealAvailability({
      mealId: meal.id,
      serviceDate: opFacts?.operationalDate,
      isPublished: isScheduled,
      mealIsAvailable: meal.isAvailable,
      inventoryMode,
      customerAvailable: invItem ? invItem.customer_available : null,
      activeBatchId,
      canPlaceOrders: Boolean(canOrder),
      logDiagnostic: true,
    });
    
    const handleAdd = availability.canAdd ? (): boolean => {
      if (inventoryMode === 'LIVE_INVENTORY' && availability.availableQuantity !== null) {
        const currentQty = useCartStore.getState().items.find(i => i.meal.id === meal.id)?.quantity || 0;
        if (currentQty >= availability.availableQuantity) {
          alert(`Only ${availability.availableQuantity} available.`);
          return false;
        }
      }
      addItem(meal, opFacts?.operationalDate, 1);
      return true;
    } : undefined;

    return (
      <MealCard
        meal={meal}
        onPress={() => router.push(`/(tabs)/(home)/meal/${meal.id}` as any)}
        onAddToCart={handleAdd}
        isOrderable={availability.canAdd}
        availability={availability}
      />
    );
  };

  // ─── Normal States ────────────────────────────────────────
  return (
    <ScreenWrapper scroll={false}>
      <FlatList
        data={filteredCatalog}
        keyExtractor={(meal) => meal.id}
        renderItem={renderMealItem}
        ListHeaderComponent={renderHeader}
        showsVerticalScrollIndicator={false}
        initialNumToRender={6}
        maxToRenderPerBatch={6}
        windowSize={5}
        contentContainerStyle={{ paddingBottom: Spacing['3xl'] }}
      />
      <StickyCartBar />
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
  catalogTitle: {
    fontSize: Typography.size.lg,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
  },
});
