import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radii, Shadows } from '@/src/constants/theme';
import { ScreenWrapper, Section } from '@/src/components/layout';
import { Button, Badge } from '@/src/components/ui';
import { MOCK_INVENTORY, MOCK_RESERVATIONS } from '@/src/constants/mockData';
import type { InventoryItem } from '@/src/types/models';
import { formatCurrency } from '@/src/utils/formatters';

export default function AvailabilityScreen() {
  const [inventory, setInventory] = useState<InventoryItem[]>(MOCK_INVENTORY.filter(i => i.isAvailable));

  const handleReserve = (item: InventoryItem) => {
    if (item.availableQuantity <= 0) {
      Alert.alert('Sold Out', 'This meal is no longer available for reservation.');
      return;
    }
    Alert.alert(
      'Confirm Reservation',
      'Would you like to reserve this extra meal? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Confirm', 
          style: 'default',
          onPress: () => router.push('/(tabs)/(home)/reservation-success' as any)
        },
      ]
    );
  };

  const getStockLevel = (item: InventoryItem): 'high' | 'medium' | 'low' | 'out' => {
    if (item.availableQuantity === 0) return 'out';
    const ratio = item.availableQuantity / item.totalQuantity;
    if (ratio > 0.3) return 'high';
    if (ratio > 0.1) return 'medium';
    return 'low';
  };

  const stockColors = {
    high: Colors.success,
    medium: Colors.warning,
    low: Colors.error,
    out: Colors.textTertiary,
  };

  const stockLabels = {
    high: 'In Stock',
    medium: 'Limited',
    low: 'Few Left',
    out: 'Sold Out',
  };

  const renderItem = ({ item }: { item: InventoryItem }) => {
    const level = getStockLevel(item);
    const color = stockColors[level];
    const barWidth = item.totalQuantity > 0
      ? `${(item.availableQuantity / item.totalQuantity) * 100}%`
      : '0%';

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.mealName}>{item.mealName}</Text>
            <Text style={styles.price}>{formatCurrency(item.price)}</Text>
          </View>
          <View style={[styles.stockBadge, { backgroundColor: color + '18' }]}>
            <View style={[styles.stockDot, { backgroundColor: color }]} />
            <Text style={[styles.stockText, { color }]}>{stockLabels[level]}</Text>
          </View>
        </View>

        {/* Availability bar */}
        <View style={styles.barContainer}>
          <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: barWidth as any, backgroundColor: color }]} />
          </View>
          <Text style={styles.barLabel}>
            {item.availableQuantity} of {item.totalQuantity} available
          </Text>
        </View>

        {/* Reserve button */}
        {level !== 'out' ? (
          <TouchableOpacity
            style={[styles.reserveBtn, { borderColor: Colors.primary }]}
            onPress={() => handleReserve(item)}
            activeOpacity={0.7}
          >
            <Ionicons name="bookmark-outline" size={16} color={Colors.primary} />
            <Text style={[styles.reserveBtnText, { color: Colors.primary }]}>Reserve</Text>
          </TouchableOpacity>
        ) : (
          <View style={[styles.reserveBtn, { borderColor: Colors.textTertiary, opacity: 0.5 }]}>
            <Text style={[styles.reserveBtnText, { color: Colors.textTertiary }]}>Unavailable</Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <ScreenWrapper>
      <View style={styles.header}>
        <Text style={styles.title}>Extra Meals</Text>
        <Text style={styles.subtitle}>Reserve available meals from campus stalls</Text>
      </View>

      {/* Live indicator */}
      <View style={styles.liveBar}>
        <View style={styles.liveDot} />
        <Text style={styles.liveText}>Live availability • Updates automatically</Text>
      </View>

      {/* My Reservations Summary */}
      {MOCK_RESERVATIONS.length > 0 && (
        <View style={styles.reservationsCard}>
          <Ionicons name="bookmark" size={20} color={Colors.secondary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.resTitle}>My Reservations</Text>
            <Text style={styles.resSubtitle}>{MOCK_RESERVATIONS.length} active reservations</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />
        </View>
      )}

      <FlatList
        data={MOCK_INVENTORY}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ gap: Spacing.md, paddingBottom: Spacing['3xl'] }}
        showsVerticalScrollIndicator={false}
      />
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  header: { paddingTop: Spacing.xl, marginBottom: Spacing.base },
  title: { fontSize: Typography.size.xl, fontFamily: Typography.family.bold, color: Colors.textPrimary },
  subtitle: { fontSize: Typography.size.sm, color: Colors.textSecondary, marginTop: 2 },
  liveBar: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.successLight, borderRadius: Radii.sm,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, marginBottom: Spacing.base,
  },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.success },
  liveText: { fontSize: Typography.size.xs, fontFamily: Typography.family.medium, color: Colors.success },
  reservationsCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.secondaryLight, borderRadius: Radii.lg,
    padding: Spacing.base, marginBottom: Spacing.base,
  },
  resTitle: { fontSize: Typography.size.sm, fontFamily: Typography.family.semiBold, color: Colors.textPrimary },
  resSubtitle: { fontSize: Typography.size.xs, color: Colors.textSecondary },
  card: {
    backgroundColor: Colors.surface, borderRadius: Radii.lg,
    padding: Spacing.base, ...Shadows.sm, gap: Spacing.md,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  mealName: { fontSize: Typography.size.base, fontFamily: Typography.family.semiBold, color: Colors.textPrimary },
  price: { fontSize: Typography.size.sm, fontFamily: Typography.family.bold, color: Colors.primary, marginTop: 2 },
  stockBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: Radii.full,
  },
  stockDot: { width: 6, height: 6, borderRadius: 3 },
  stockText: { fontSize: Typography.size.xs, fontFamily: Typography.family.semiBold },
  barContainer: { gap: 4 },
  barTrack: { height: 6, backgroundColor: Colors.borderLight, borderRadius: 3, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 3 },
  barLabel: { fontSize: Typography.size.xs, color: Colors.textTertiary },
  reserveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1.5, borderRadius: Radii.md,
    paddingVertical: Spacing.sm, paddingHorizontal: Spacing.base,
  },
  reserveBtnText: { fontSize: Typography.size.sm, fontFamily: Typography.family.semiBold },
});
