import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SectionList, Modal, ScrollView, Alert } from 'react-native';
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
import { useCustomerStall } from '@/src/contexts/CustomerStallContext';

export default function HomeScreen() {
  const router = useRouter();
  const user = useUser();
  const addItem = useCartStore((state) => state.addItem);
  const cartStallId = useCartStore((state) => state.cartStallId);
  const cartStallName = useCartStore((state) => state.cartStallName);
  const cartItems = useCartStore((state) => state.items);
  const clearCart = useCartStore((state) => state.clearCart);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const queryClient = useQueryClient();

  // ─── Customer Stall Context ────────────────────────────────────
  const {
    selectedStall,
    availableStalls,
    selectStall,
    isLoading: isLoadingStallContext
  } = useCustomerStall();
  
  const [showStallModal, setShowStallModal] = useState(false);

  const handleStallChange = async (stallId: string) => {
    if (stallId === selectedStall?.id) {
      setShowStallModal(false);
      return;
    }

    const doSwitch = async () => {
      try {
        console.log('[Home] Switching stall to:', stallId);
        await selectStall(stallId);
        setShowStallModal(false);
      } catch (error) {
        console.error('[Home] Failed to switch stall:', error);
        Alert.alert('Error', 'Failed to switch stall. Please try again.');
      }
    };

    // If cart has items from a different stall, confirm before clearing
    if (cartItems.length > 0 && cartStallId && cartStallId !== stallId) {
      const newStall = availableStalls.find(s => s.id === stallId);
      const oldStallLabel = cartStallName || selectedStall?.name || 'another stall';
      const newStallLabel = newStall?.name || 'this stall';
      Alert.alert(
        'Switch Stall?',
        `Your cart has items from ${oldStallLabel}. Switching to ${newStallLabel} will clear your cart.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Clear Cart & Switch',
            style: 'destructive',
            onPress: () => {
              clearCart();
              doSwitch();
            },
          },
        ]
      );
      return;
    }

    // No conflict — switch directly
    await doSwitch();
  };

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
  } = useOperationalWindow(selectedStall?.id);
  
  const { data: availableMeals = [], isLoading: isLoadingMeals } = useScheduledMeals(opFacts?.activeMenu?.id);

  // ─── Live Inventory ─────────────────────────────────────────────
  const stallId = primaryStallId || opFacts?.activeMenu?.stall_id;
  const { data: inventory = [], isLoading: isLoadingInventory } = useLiveInventory(stallId, targetDate);

  const { data: allMeals = [] } = useAllMeals();

  const isLoading = isLoadingOp || isLoadingMeals || isLoadingInventory || isLoadingStallContext;

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


  // ─── Daily Menu Ordering ──────────────────────────────────
  const getComboPriority = (meal: any) => {
    const name = meal.name?.toLowerCase() || '';
    if (name.includes('2') && name.includes('roll')) {
      return 1;
    }
    if (name.includes('roll') && name.includes('bowl')) {
      return 2;
    }
    return 3;
  };

  const groupedDailyMenu = useMemo(() => {
    const rolls = availableMeals.filter((m: any) => m.category === 'roll');
    const bowls = availableMeals.filter((m: any) => m.category === 'bowl');
    const combos = availableMeals.filter((m: any) => m.category === 'combo');
    
    // Sort combos by priority
    combos.sort((a: any, b: any) => getComboPriority(a) - getComboPriority(b));

    return { rolls, bowls, combos };
  }, [availableMeals]);

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

  const listSections = useMemo(() => {
    const s: any[] = [];
    if (availableMeals.length > 0) {
      if (groupedDailyMenu.rolls.length > 0) {
        s.push({ title: '🥙 ROLLS', data: groupedDailyMenu.rolls, type: 'daily' });
      }
      if (groupedDailyMenu.bowls.length > 0) {
        s.push({ title: '🥣 BOWLS', data: groupedDailyMenu.bowls, type: 'daily' });
      }
      if (groupedDailyMenu.combos.length > 0) {
        s.push({ title: '🎁 COMBOS', data: groupedDailyMenu.combos, type: 'daily' });
      }
    }
    
    s.push({ title: 'Browse Catalog', data: filteredCatalog, type: 'catalog' });
    return s;
  }, [groupedDailyMenu, filteredCatalog, availableMeals.length]);

  // ─── Reusable Stall Selector Components ───────────────────
  const StallSelectorBar = () => {
    if (availableStalls.length === 0) return null;
    return (
      <View style={styles.stallSelectorContainer}>
        <Text style={styles.stallSelectorLabel}>Ordering from:</Text>
        {availableStalls.length > 1 ? (
          <TouchableOpacity
            style={styles.stallSelector}
            onPress={() => setShowStallModal(true)}
          >
            <Text style={styles.stallSelectorText}>
              {selectedStall?.name || 'Select Stall'}
            </Text>
            <Ionicons name="chevron-down" size={20} color={Colors.textSecondary} />
          </TouchableOpacity>
        ) : (
          <View style={styles.stallSelector}>
            <Text style={styles.stallSelectorText}>
              {selectedStall?.name || 'Loading...'}
            </Text>
          </View>
        )}
      </View>
    );
  };

  const renderStallModal = () => (
    <Modal
      visible={showStallModal}
      animationType="slide"
      transparent={true}
      onRequestClose={() => setShowStallModal(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select Stall</Text>
            <TouchableOpacity onPress={() => setShowStallModal(false)}>
              <Ionicons name="close" size={24} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.stallList}>
            {availableStalls.map((stall) => (
              <TouchableOpacity
                key={stall.id}
                style={[
                  styles.stallModalItem,
                  selectedStall?.id === stall.id && styles.stallModalItemActive
                ]}
                onPress={() => handleStallChange(stall.id)}
              >
                <View style={styles.stallModalInfo}>
                  <Text style={styles.stallModalName}>{stall.name}</Text>
                  {stall.description && (
                    <Text style={styles.stallModalDescription}>
                      {stall.description}
                    </Text>
                  )}
                </View>
                {selectedStall?.id === stall.id && (
                  <Ionicons name="checkmark-circle" size={24} color={Colors.success} />
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );

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
        <StallSelectorBar />
        <EmptyState
          icon="time-outline"
          title="Menu Scheduled"
          subtitle={opFacts.orderingStart ? `Menu will be available at ${formatTime(opFacts.orderingStart)}` : "Menu will be available later"}
        />
        {renderStallModal()}
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
        <StallSelectorBar />
        <EmptyState
          icon="calendar-outline"
          title="Menu Coming Soon"
          subtitle="The kitchen has not published the upcoming menu yet. Please check back later!"
        />
        {renderStallModal()}
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

        <StallSelectorBar />

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
        {renderStallModal()}
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

  const renderListHeader = () => {
    return (
      <View style={{ paddingBottom: Spacing.sm }}>
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

        {/* Stall Selector */}
        <StallSelectorBar />

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

        {/* Daily Menu Title */}
        {availableMeals.length > 0 && (
          <View style={{ marginTop: Spacing.sm, marginBottom: Spacing.xs }}>
            <Text style={styles.catalogTitle}>{`Menu for ${formatFriendlyDate(opFacts.operationalDate)}`}</Text>
            {(!inventory || inventory.length === 0) && (opFacts.status === 'PICKUP_ACTIVE' || opFacts.status === 'ORDERING_CLOSED') && (
              <View style={[styles.noBatchBanner, { marginTop: Spacing.sm }]}>
                <Ionicons name="information-circle-outline" size={16} color={Colors.textSecondary} style={{ marginRight: Spacing.xs }} />
                <Text style={styles.noBatchText}>Live pickup stock has not been loaded yet.</Text>
              </View>
            )}
          </View>
        )}
      </View>
    );
  };

  const renderSectionHeader = ({ section }: { section: any }) => {
    if (section.type === 'catalog') {
      return (
        <View style={{ paddingTop: Spacing.md, paddingBottom: Spacing.sm, backgroundColor: Colors.background }}>
          <View style={styles.sectionDivider} />
          <Text style={styles.catalogTitle}>Browse Catalog</Text>
          <SearchBar value={search} onChangeText={setSearch} placeholder="Search the catalog..." />
          <CategoryPills selected={selectedCategory} onSelect={setSelectedCategory} />
          {section.data.length === 0 && (
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
        </View>
      );
    }

    return (
      <View style={styles.dailyMenuCategoryContainer}>
        <Text style={styles.dailyMenuCategoryTitle}>{section.title}</Text>
      </View>
    );
  };

  const renderMealItem = ({ item: meal, section }: { item: any, section: any }) => {
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
      addItem(meal, opFacts?.operationalDate, 1, selectedStall?.id, selectedStall?.name);
      return true;
    } : undefined;

    return (
      <MealCard
        meal={meal}
        verticalList={section.type === 'daily'}
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
      <SectionList
        sections={listSections}
        keyExtractor={(meal) => meal.id}
        renderItem={renderMealItem}
        renderSectionHeader={renderSectionHeader}
        ListHeaderComponent={renderListHeader}
        showsVerticalScrollIndicator={false}
        initialNumToRender={6}
        maxToRenderPerBatch={6}
        windowSize={5}
        contentContainerStyle={{ paddingBottom: Spacing['3xl'] }}
        stickySectionHeadersEnabled={false}
      />
      <StickyCartBar />

      {/* Stall Selection Modal */}
      {renderStallModal()}
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: Spacing.md, marginBottom: Spacing.xs,
  },
  greeting: { fontSize: Typography.size.sm, color: Colors.textSecondary, fontFamily: Typography.family.regular },
  userName: { fontSize: Typography.size.lg, fontFamily: Typography.family.bold, color: Colors.textPrimary },
  notifButton: { position: 'relative', padding: Spacing.sm },
  statusBanner: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md,
    borderRadius: Radii.lg, marginBottom: Spacing.sm,
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
    fontSize: Typography.size.xl,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    marginBottom: Spacing.md,
    paddingHorizontal: Spacing.base,
    letterSpacing: -0.5,
  },
  dailyMenuCategoryContainer: {
    paddingVertical: 6,
    paddingHorizontal: Spacing.base,
    backgroundColor: Colors.borderLight,
    marginBottom: Spacing.sm,
  },
  dailyMenuCategoryTitle: {
    fontSize: Typography.size.md,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionDivider: {
    height: 8,
    backgroundColor: Colors.surfaceElevated,
    marginHorizontal: -Spacing.base, // bleed to edge
    marginBottom: Spacing.lg,
  },
  
  // ─── Stall Selector & Modal Styles ─────────────────────────
  stallSelectorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    marginBottom: Spacing.md,
    ...Shadows.subtleCard,
  },
  stallSelectorLabel: {
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
    fontFamily: Typography.family.medium,
  },
  stallSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  stallSelectorText: {
    fontSize: Typography.size.base,
    color: Colors.textPrimary,
    fontFamily: Typography.family.semiBold,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radii.xl,
    borderTopRightRadius: Radii.xl,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing['3xl'],
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  modalTitle: {
    fontSize: Typography.size.lg,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
  },
  stallList: {
    marginTop: Spacing.md,
  },
  stallModalItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  stallModalItemActive: {
    backgroundColor: Colors.successLight,
    borderRadius: Radii.md,
    borderBottomWidth: 0,
    marginVertical: 4,
  },
  stallModalInfo: {
    flex: 1,
  },
  stallModalName: {
    fontSize: Typography.size.base,
    fontFamily: Typography.family.semiBold,
    color: Colors.textPrimary,
  },
  stallModalDescription: {
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
});
