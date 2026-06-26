import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radii, Shadows } from '@/src/constants/theme';
import { ScreenWrapper, Section } from '@/src/components/layout';
import { Button, Card } from '@/src/components/ui';
import { MOCK_SUBSCRIPTION, MOCK_MEAL_HISTORY } from '@/src/constants/mockData';
import { formatCurrency, formatDate } from '@/src/utils/formatters';

export default function SubscriptionScreen() {
  const router = useRouter();
  const sub = MOCK_SUBSCRIPTION;
  const progress = sub.consumedMeals / sub.totalMeals;

  return (
    <ScreenWrapper>
      <Text style={styles.title}>My Subscription</Text>

      {/* Active Plan Card */}
      <View style={styles.planCard}>
        <View style={styles.planHeader}>
          <View style={styles.planBadge}><Text style={styles.planBadgeText}>Active</Text></View>
          <Text style={styles.planName}>{sub.planName} Plan</Text>
        </View>
        <View style={styles.progressContainer}>
          <View style={styles.progressBg}>
            <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
          </View>
          <Text style={styles.progressText}>{sub.consumedMeals} / {sub.totalMeals} meals consumed</Text>
        </View>
        <View style={styles.statsRow}>
          <View style={styles.stat}><Text style={styles.statValue}>{sub.remainingMeals}</Text><Text style={styles.statLabel}>Remaining</Text></View>
          <View style={styles.statDivider} />
          <View style={styles.stat}><Text style={styles.statValue}>{sub.mealsPerDay}</Text><Text style={styles.statLabel}>Per Day</Text></View>
          <View style={styles.statDivider} />
          <View style={styles.stat}><Text style={styles.statValue}>{formatDate(sub.endDate)}</Text><Text style={styles.statLabel}>Expires</Text></View>
        </View>
      </View>

      <Button title="View Plans" variant="outline" onPress={() => router.push('/(tabs)/(subscription)/plans' as any)} fullWidth />

      {/* Meal History */}
      <Section title="Recent Meals">
        {MOCK_MEAL_HISTORY.map((mh) => (
          <View key={mh.id} style={styles.historyItem}>
            <View style={styles.historyIcon}><Ionicons name="restaurant-outline" size={18} color={Colors.primary} /></View>
            <View style={styles.historyInfo}>
              <Text style={styles.historyName}>{mh.mealName}</Text>
              <Text style={styles.historyMeta}>{mh.date} • {mh.time}</Text>
            </View>
          </View>
        ))}
      </Section>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: Typography.size.xl, fontFamily: Typography.family.bold, color: Colors.textPrimary, paddingTop: Spacing.xl, marginBottom: Spacing.base },
  planCard: { backgroundColor: Colors.surface, borderRadius: Radii.xl, padding: Spacing.xl, ...Shadows.md, marginBottom: Spacing.base },
  planHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.base },
  planBadge: { backgroundColor: Colors.successLight, paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: Radii.full },
  planBadgeText: { fontSize: Typography.size.xs, fontFamily: Typography.family.semiBold, color: Colors.successDark },
  planName: { fontSize: Typography.size.lg, fontFamily: Typography.family.bold, color: Colors.textPrimary },
  progressContainer: { marginBottom: Spacing.base },
  progressBg: { height: 8, backgroundColor: Colors.surfaceElevated, borderRadius: Radii.full, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: Colors.primary, borderRadius: Radii.full },
  progressText: { fontSize: Typography.size.xs, color: Colors.textSecondary, marginTop: Spacing.xs },
  statsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  stat: { alignItems: 'center' },
  statValue: { fontSize: Typography.size.md, fontFamily: Typography.family.bold, color: Colors.textPrimary },
  statLabel: { fontSize: Typography.size.xs, color: Colors.textSecondary, marginTop: 2 },
  statDivider: { width: 1, height: 30, backgroundColor: Colors.borderLight },
  historyItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.sm },
  historyIcon: { width: 36, height: 36, borderRadius: Radii.sm, backgroundColor: Colors.primaryBg, alignItems: 'center', justifyContent: 'center' },
  historyInfo: { flex: 1 },
  historyName: { fontSize: Typography.size.sm, fontFamily: Typography.family.medium, color: Colors.textPrimary },
  historyMeta: { fontSize: Typography.size.xs, color: Colors.textTertiary },
});
