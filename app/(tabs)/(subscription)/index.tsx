import React from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { Colors, Typography, Spacing, Radii, Shadows } from '@/src/constants/theme';
import { ScreenWrapper } from '@/src/components/layout';
import { Button } from '@/src/components/ui';
import { Ionicons } from '@expo/vector-icons';
import { useUser } from '@/src/store';
import { useActiveSubscription, useSubscriptionPlans, usePurchaseSubscription } from '@/src/hooks';
import { formatCurrency } from '@/src/utils/formatters';

export default function SubscriptionScreen() {
  const user = useUser();
  const { data: subscription, isLoading: isLoadingSub } = useActiveSubscription(user?.id);
  const { data: plans, isLoading: isLoadingPlans } = useSubscriptionPlans();
  const purchaseMutation = usePurchaseSubscription();

  const handlePurchase = (plan: any) => {
    if (!user) return;
    Alert.alert(
      'Confirm Purchase',
      `Simulate purchase of ${plan.name} for ${formatCurrency(plan.price)}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Purchase', 
          onPress: () => purchaseMutation.mutate({ userId: user.id, plan })
        }
      ]
    );
  };

  if (isLoadingSub || isLoadingPlans) {
    return (
      <ScreenWrapper>
        <View style={styles.header}><Text style={styles.title}>My Subscription</Text></View>
        <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: Spacing['2xl'] }} />
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper>
      <View style={styles.header}>
        <Text style={styles.title}>My Subscription</Text>
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: Spacing['3xl'] }}>
        
        {/* Active Dashboard */}
        {subscription && subscription.status === 'active' ? (
          <View style={styles.dashboardCard}>
            <View style={styles.planHeader}>
              <View>
                <Text style={styles.planName}>{subscription.planName}</Text>
                <View style={styles.statusBadge}>
                  <Text style={styles.statusText}>ACTIVE</Text>
                </View>
              </View>
              <Ionicons name="ticket" size={40} color={Colors.primary} />
            </View>

            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Remaining Credits</Text>
                <Text style={styles.statValue}>{subscription.remainingMeals} / {subscription.totalMeals}</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Left Today</Text>
                <Text style={styles.statValue}>
                  {subscription.lastUsageDate && subscription.lastUsageDate >= new Date().toISOString().split('T')[0] 
                    ? Math.max(0, subscription.mealsPerDay - subscription.dailyCreditsUsed) 
                    : subscription.mealsPerDay}
                </Text>
              </View>
            </View>

            <View style={styles.datesBox}>
              <View style={styles.dateRow}>
                <Ionicons name="calendar-outline" size={16} color={Colors.textSecondary} />
                <Text style={styles.dateText}>Started: {new Date(subscription.startDate).toLocaleDateString()}</Text>
              </View>
              <View style={styles.dateRow}>
                <Ionicons name="time-outline" size={16} color={Colors.error} />
                <Text style={styles.dateText}>Expires: {new Date(subscription.endDate).toLocaleDateString()}</Text>
              </View>
            </View>
          </View>
        ) : (
          <View>
            <Text style={styles.sectionTitle}>Available Plans</Text>
            {plans?.map((plan) => (
              <View key={plan.id} style={[styles.planCard, plan.isPopular && styles.popularCard]}>
                {plan.isPopular && (
                  <View style={styles.popularBadge}>
                    <Text style={styles.popularBadgeText}>Most Popular</Text>
                  </View>
                )}
                <View style={styles.planHeader}>
                  <Text style={styles.planName}>{plan.name}</Text>
                  <Text style={styles.planPrice}>{formatCurrency(plan.price)}</Text>
                </View>
                <Text style={styles.planDesc}>{plan.description}</Text>
                
                <View style={styles.featuresList}>
                  <View style={styles.featureItem}>
                    <Ionicons name="checkmark-circle" size={16} color={Colors.primary} />
                    <Text style={styles.featureText}>{plan.totalMeals} Total Credits</Text>
                  </View>
                  <View style={styles.featureItem}>
                    <Ionicons name="checkmark-circle" size={16} color={Colors.primary} />
                    <Text style={styles.featureText}>{plan.durationDays} Days Validity</Text>
                  </View>
                  <View style={styles.featureItem}>
                    <Ionicons name="checkmark-circle" size={16} color={Colors.primary} />
                    <Text style={styles.featureText}>{plan.mealsPerDay} Credits / Day</Text>
                  </View>
                  {plan.features.map((feature, i) => (
                    <View key={i} style={styles.featureItem}>
                      <Ionicons name="checkmark-circle" size={16} color={Colors.primary} />
                      <Text style={styles.featureText}>{feature}</Text>
                    </View>
                  ))}
                </View>

                <Button 
                  title={`Subscribe • ${formatCurrency(plan.price)}`} 
                  onPress={() => handlePurchase(plan)} 
                  fullWidth
                  loading={purchaseMutation.isPending}
                />
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  header: { paddingVertical: Spacing.xl, paddingBottom: Spacing.md },
  title: { fontSize: Typography.size.xl, fontFamily: Typography.family.bold, color: Colors.textPrimary },
  sectionTitle: { fontSize: Typography.size.lg, fontFamily: Typography.family.semiBold, color: Colors.textPrimary, marginBottom: Spacing.md },
  
  dashboardCard: { backgroundColor: Colors.primaryBg, borderRadius: Radii.lg, padding: Spacing.lg, marginBottom: Spacing.xl, borderWidth: 1, borderColor: Colors.primaryLight },
  statusBadge: { backgroundColor: Colors.primary, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radii.full, marginTop: Spacing.xs },
  statusText: { color: Colors.white, fontSize: Typography.size.xs, fontFamily: Typography.family.bold },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: Spacing.lg, gap: Spacing.md },
  statBox: { flex: 1, backgroundColor: Colors.surface, padding: Spacing.md, borderRadius: Radii.md, ...Shadows.sm },
  statLabel: { fontSize: Typography.size.xs, color: Colors.textSecondary, marginBottom: 4 },
  statValue: { fontSize: Typography.size.xl, fontFamily: Typography.family.bold, color: Colors.primary },
  datesBox: { backgroundColor: Colors.surface, padding: Spacing.md, borderRadius: Radii.md, gap: Spacing.sm },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  dateText: { fontSize: Typography.size.sm, color: Colors.textSecondary, fontFamily: Typography.family.medium },
  
  planCard: { backgroundColor: Colors.surface, borderRadius: Radii.lg, padding: Spacing.lg, marginBottom: Spacing.lg, ...Shadows.sm, position: 'relative' },
  popularCard: { borderWidth: 2, borderColor: Colors.primary },
  popularBadge: { position: 'absolute', top: -12, right: 16, backgroundColor: Colors.primary, paddingHorizontal: 12, paddingVertical: 4, borderRadius: Radii.full },
  popularBadgeText: { color: Colors.white, fontSize: Typography.size.xs, fontFamily: Typography.family.bold },
  planHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.xs },
  planName: { fontSize: Typography.size.lg, fontFamily: Typography.family.bold, color: Colors.textPrimary },
  planPrice: { fontSize: Typography.size.xl, fontFamily: Typography.family.bold, color: Colors.primary },
  planDesc: { fontSize: Typography.size.sm, color: Colors.textSecondary, marginBottom: Spacing.md },
  featuresList: { marginBottom: Spacing.lg, gap: Spacing.sm },
  featureItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  featureText: { fontSize: Typography.size.sm, color: Colors.textPrimary },
});
