import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radii, Shadows } from '@/src/constants/theme';
import { ScreenWrapper } from '@/src/components/layout';
import { Button } from '@/src/components/ui';
import { useSubscriptionPlans } from '@/src/hooks';
import { formatCurrency } from '@/src/utils/formatters';

export default function PlansScreen() {
  const router = useRouter();
  const { data: plans, isLoading, error, refetch } = useSubscriptionPlans();

  return (
    <ScreenWrapper>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color={Colors.textPrimary} /></TouchableOpacity>
        <Text style={styles.title}>Subscription Plans</Text>
        <View style={{ width: 24 }} />
      </View>

      {isLoading ? (
        <View style={styles.centerContainer}>
          <Text style={styles.loadingText}>Loading plans...</Text>
        </View>
      ) : error ? (
        <View style={styles.centerContainer}>
          <Text style={styles.errorText}>Failed to load plans</Text>
          <Button title="Retry" onPress={() => refetch()} variant="outline" />
        </View>
      ) : !plans || plans.length === 0 ? (
        <View style={styles.centerContainer}>
          <Text style={styles.emptyText}>No active plans available</Text>
        </View>
      ) : (
        plans.map((plan) => (
        <View key={plan.id} style={[styles.planCard, plan.isPopular && styles.popularCard]}>
          {plan.badge && <View style={styles.badge}><Text style={styles.badgeText}>{plan.badge}</Text></View>}
          <Text style={styles.planName}>{plan.name}</Text>
          <Text style={styles.planDesc}>{plan.description}</Text>
          <Text style={styles.planPrice}>{formatCurrency(plan.price)}<Text style={styles.planDuration}>/month</Text></Text>
          <View style={styles.features}>
            {plan.features.map((f, i) => (
              <View key={i} style={styles.featureRow}>
                <Ionicons name="checkmark-circle" size={16} color={plan.isPopular ? Colors.primary : Colors.success} />
                <Text style={styles.featureText}>{f}</Text>
              </View>
            ))}
          </View>
          <Button 
            title={plan.isPopular ? 'Get Started' : 'Choose Plan'} 
            onPress={() => router.push(`/(tabs)/(subscription)/purchase/${plan.id}` as any)} 
            variant={plan.isPopular ? 'primary' : 'outline'} 
            fullWidth 
          />
        </View>
      )))}
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: Spacing.xl, marginBottom: Spacing.xl },
  title: { fontSize: Typography.size.lg, fontFamily: Typography.family.bold, color: Colors.textPrimary },
  planCard: { backgroundColor: Colors.surface, borderRadius: Radii.xl, padding: Spacing.xl, marginBottom: Spacing.base, ...Shadows.sm, borderWidth: 1, borderColor: Colors.border },
  popularCard: { borderColor: Colors.primary, borderWidth: 2, ...Shadows.md },
  badge: { backgroundColor: Colors.primaryBg, alignSelf: 'flex-start', paddingHorizontal: Spacing.md, paddingVertical: 2, borderRadius: Radii.full, marginBottom: Spacing.sm },
  badgeText: { fontSize: Typography.size.xs, fontFamily: Typography.family.bold, color: Colors.primary },
  planName: { fontSize: Typography.size.xl, fontFamily: Typography.family.bold, color: Colors.textPrimary },
  planDesc: { fontSize: Typography.size.sm, color: Colors.textSecondary, marginTop: Spacing.xs },
  planPrice: { fontSize: Typography.size['2xl'], fontFamily: Typography.family.bold, color: Colors.primary, marginTop: Spacing.md },
  planDuration: { fontSize: Typography.size.sm, fontFamily: Typography.family.regular, color: Colors.textSecondary },
  features: { marginVertical: Spacing.base, gap: Spacing.sm },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  featureText: { fontSize: Typography.size.sm, color: Colors.textSecondary },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.xl },
  loadingText: { fontSize: Typography.size.base, color: Colors.textSecondary, fontFamily: Typography.family.medium },
  errorText: { fontSize: Typography.size.base, color: Colors.error, marginBottom: Spacing.md, fontFamily: Typography.family.medium },
  emptyText: { fontSize: Typography.size.base, color: Colors.textSecondary, fontFamily: Typography.family.medium },
});
