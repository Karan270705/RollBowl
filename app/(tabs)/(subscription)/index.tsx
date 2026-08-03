import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, Typography, Spacing, Radii, Shadows } from '@/src/constants/theme';
import { ScreenWrapper } from '@/src/components/layout';
import { Button } from '@/src/components/ui';
import { Ionicons } from '@expo/vector-icons';
import { useUser } from '@/src/store';
import { useActiveSubscription, useSubscriptionPlans, useSubscriptionUsageHistory, useOperationalWindow } from '@/src/hooks';
import { useSubscriptionRequests } from '@/src/hooks/payments/usePayments';
import { formatCurrency, formatFriendlyDate, formatRelativeTime } from '@/src/utils/formatters';
import { PaymentStatusBadge } from '@/src/components/payments/PaymentStatusBadge';
import { CustomerPaymentProofModal } from '@/src/components/payments/CustomerPaymentProofModal';
import { SubscriptionRequestStatus } from '@/src/constants/enums';

export default function SubscriptionScreen() {
  const router = useRouter();
  const user = useUser();
  const { data: subscription, isLoading: isLoadingSub } = useActiveSubscription(user?.id);
  const { data: plans, isLoading: isLoadingPlans } = useSubscriptionPlans();
  const { data: history = [], isLoading: isLoadingHistory } = useSubscriptionUsageHistory(subscription?.id);
  const { data: requests = [], isLoading: isLoadingRequests } = useSubscriptionRequests(user?.id);
  const { targetDate: resolvedServiceDate } = useOperationalWindow();
  const currentServiceDate = resolvedServiceDate || new Date().toISOString().split('T')[0];

  const storedDailyCreditsUsed = subscription?.dailyCreditsUsed || 0;
  const effectiveDailyCreditsUsed =
    subscription && subscription.lastUsageDate === currentServiceDate
      ? storedDailyCreditsUsed
      : 0;
  const leftToday = subscription
    ? Math.max(0, (subscription.mealsPerDay || 0) - effectiveDailyCreditsUsed)
    : 0;

  useEffect(() => {
    if (__DEV__ && subscription) {
      console.log('[SUBSCRIPTION DAILY CREDIT DISPLAY]', {
        subscriptionId: subscription.id,
        resolvedServiceDate: currentServiceDate,
        lastUsageDate: subscription.lastUsageDate || null,
        storedDailyCreditsUsed,
        effectiveDailyCreditsUsed,
        mealsPerDay: subscription.mealsPerDay,
        leftToday,
        consumedMeals: subscription.consumedMeals,
        remainingMeals: subscription.remainingMeals,
      });
    }
  }, [subscription, currentServiceDate, storedDailyCreditsUsed, effectiveDailyCreditsUsed, leftToday]);

  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [isProofModalVisible, setIsProofModalVisible] = useState(false);

  const pendingRequests = requests.filter(request => {
    // 1. Hide when request.status is APPROVED
    if (request.status === SubscriptionRequestStatus.APPROVED) {
      return false;
    }
    // 2. Hide any stale local/cache copy once created_subscription_id exists
    if (request.createdSubscriptionId) {
      return false;
    }
    // 3. Hide rejected when an active subscription now exists for that approved request
    if (
      request.status === SubscriptionRequestStatus.REJECTED &&
      subscription &&
      subscription.status === 'active'
    ) {
      return false;
    }
    // 4. Show unresolved requests (awaiting_proof, verification_pending) or rejected when still unresolved
    return (
      request.status === SubscriptionRequestStatus.AWAITING_PROOF ||
      request.status === SubscriptionRequestStatus.VERIFICATION_PENDING ||
      request.status === SubscriptionRequestStatus.REJECTED
    );
  });

  const handlePurchase = (plan: any) => {
    if (!user) return;
    router.push({
      pathname: '/(tabs)/(subscription)/purchase/[id]',
      params: { id: plan.id }
    } as any);
  };

  const handleRequestPress = (req: any) => {
    switch (req.status) {
      case SubscriptionRequestStatus.AWAITING_PROOF:
        router.push({
          pathname: '/(tabs)/(subscription)/purchase/[id]',
          params: { id: req.planId, requestId: req.id }
        } as any);
        break;
      case SubscriptionRequestStatus.VERIFICATION_PENDING:
        router.push({
          pathname: '/(tabs)/(subscription)/success',
          params: { isReplacement: 'false' }
        } as any);
        break;
      case SubscriptionRequestStatus.REJECTED:
        router.push({
          pathname: '/(tabs)/(subscription)/purchase/[id]',
          params: {
            id: req.planId,
            requestId: req.id,
            rejected: 'true',
            rejectionReason: req.rejectionReason || 'The kitchen could not verify your payment.'
          }
        } as any);
        break;
      case SubscriptionRequestStatus.APPROVED:
        // Active subscription dashboard is displayed on this tab
        break;
      case SubscriptionRequestStatus.CANCELLED:
        Alert.alert('Request Cancelled', 'This subscription request was cancelled.');
        break;
      default:
        break;
    }
  };

  if (isLoadingSub || isLoadingPlans || isLoadingRequests) {
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
        
        {/* Pending Requests */}
        {pendingRequests.length > 0 && (
          <View style={{ marginBottom: Spacing.xl }}>
            <Text style={styles.sectionTitle}>Pending Requests</Text>
            {pendingRequests.map(req => {
              const plan = plans?.find(p => p.id === req.planId);
              return (
                <View key={req.id} style={styles.requestContainer}>
                  <TouchableOpacity 
                    style={styles.requestCard}
                    onPress={() => handleRequestPress(req)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.requestPlanName}>{plan?.name || 'Subscription Plan'}</Text>
                      <Text style={styles.requestDate}>{formatRelativeTime(req.requestedAt)}</Text>
                      <View style={{ marginTop: Spacing.sm }}>
                        <PaymentStatusBadge status={req.status} />
                      </View>
                    </View>
                    <View style={{ alignItems: 'flex-end', justifyContent: 'center' }}>
                      <Text style={styles.requestAmount}>{formatCurrency(req.expectedAmount)}</Text>
                      <Ionicons name="chevron-forward" size={20} color={Colors.textTertiary} style={{ marginTop: Spacing.xs }} />
                    </View>
                  </TouchableOpacity>

                  {(req.status === SubscriptionRequestStatus.VERIFICATION_PENDING || 
                    req.status === SubscriptionRequestStatus.REJECTED) && (
                    <TouchableOpacity 
                      style={styles.viewProofRequestBtn} 
                      onPress={() => {
                        setSelectedRequestId(req.id);
                        setIsProofModalVisible(true);
                      }}
                    >
                      <Ionicons name="image-outline" size={16} color={Colors.primary} style={{ marginRight: Spacing.xs }} />
                      <Text style={styles.viewProofRequestBtnText}>View Uploaded Screenshot</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* Active Dashboard */}
        {subscription ? (
          <View style={styles.dashboardCard}>
            <View style={styles.planHeader}>
              <View>
                <Text style={styles.planName}>{subscription.planName}</Text>
                <View style={[styles.statusBadge, subscription.status !== 'active' && styles.statusBadgeInactive]}>
                  <Text style={styles.statusText}>{subscription.status.toUpperCase()}</Text>
                </View>
              </View>
              <Ionicons name="ticket" size={40} color={subscription.status === 'active' ? Colors.primary : Colors.textTertiary} />
            </View>

            {subscription.status !== 'active' && (
              <View style={styles.expiryMessage}>
                <Ionicons name="warning" size={20} color={Colors.warningDark} />
                <Text style={styles.expiryText}>
                  {subscription.status === 'expired' ? 'Your subscription has expired. Renew to continue enjoying items.' : 
                   subscription.status === 'paused' ? 'Your subscription is currently paused.' : 
                   'Your subscription has been cancelled.'}
                </Text>
              </View>
            )}

            <View style={styles.progressContainer}>
              <View style={styles.progressRow}>
                <Text style={styles.progressLabel}>Credits Consumed</Text>
                <Text style={styles.progressValue}>{subscription.consumedMeals} / {subscription.totalMeals}</Text>
              </View>
              <View style={styles.progressBarBg}>
                <View style={[styles.progressBarFill, { width: `${Math.min(100, (subscription.consumedMeals / subscription.totalMeals) * 100)}%`, backgroundColor: subscription.status === 'active' ? Colors.primary : Colors.textTertiary }]} />
              </View>
            </View>

            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Remaining Credits</Text>
                <Text style={styles.statValue}>{subscription.remainingMeals}</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Left Today</Text>
                <Text style={styles.statValue}>{leftToday}</Text>
              </View>
            </View>

            <View style={styles.datesBox}>
              <View style={styles.dateRow}>
                <Ionicons name="calendar-outline" size={16} color={Colors.textSecondary} />
                <Text style={styles.dateText}>Started: {formatFriendlyDate(subscription.startDate)}</Text>
              </View>
              <View style={styles.dateRow}>
                <Ionicons name="time-outline" size={16} color={Colors.error} />
                <Text style={styles.dateText}>Expires: {formatFriendlyDate(subscription.endDate)}</Text>
              </View>
            </View>

            {/* Usage History */}
            <View style={{ marginTop: Spacing.xl }}>
              <Text style={[styles.sectionTitle, { fontSize: Typography.size.base, marginBottom: Spacing.sm }]}>Usage History</Text>
              {isLoadingHistory ? (
                <ActivityIndicator color={Colors.primary} style={{ marginTop: Spacing.md }} />
              ) : history.length === 0 ? (
                <Text style={styles.emptyText}>No credits consumed yet.</Text>
              ) : (
                history.map((entry) => (
                  <View key={entry.id} style={styles.historyRow}>
                    <View>
                      <Text style={styles.historyMeal}>{entry.mealName}</Text>
                      <Text style={styles.historyDate}>{new Date(entry.date).toLocaleDateString()} • {entry.orderNumber}</Text>
                    </View>
                    <Text style={styles.historyCredits}>-{entry.creditsUsed} Credits</Text>
                  </View>
                ))
              )}
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
                  {plan.categoryCreditCosts && (
                    <View style={styles.featureItem}>
                      <Ionicons name="checkmark-circle" size={16} color={Colors.primary} />
                      <Text style={styles.featureText}>Valid for: {Object.keys(plan.categoryCreditCosts).map(c => c.charAt(0).toUpperCase() + c.slice(1)).join(', ')}</Text>
                    </View>
                  )}
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
                />
              </View>
            ))}
          </View>
        )}

        {/* View History Link */}
        <View style={{ alignItems: 'center', marginTop: Spacing.md }}>
          <TouchableOpacity
            style={styles.historyButton}
            onPress={() => router.push('/(tabs)/(subscription)/payment-history' as any)}
          >
            <Ionicons name="time-outline" size={16} color={Colors.primary} style={{ marginRight: Spacing.xs }} />
            <Text style={styles.historyButtonText}>View Request & Payment History</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <CustomerPaymentProofModal
        visible={isProofModalVisible}
        onClose={() => setIsProofModalVisible(false)}
        subscriptionRequestId={selectedRequestId || undefined}
      />
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
  statusBadgeInactive: { backgroundColor: Colors.textTertiary },
  expiryMessage: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.warningLight, padding: Spacing.md, borderRadius: Radii.md, marginTop: Spacing.sm },
  expiryText: { flex: 1, fontSize: Typography.size.sm, color: Colors.warningDark, fontFamily: Typography.family.medium },
  progressContainer: { marginTop: Spacing.lg },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.xs },
  progressLabel: { fontSize: Typography.size.sm, color: Colors.textSecondary, fontFamily: Typography.family.medium },
  progressValue: { fontSize: Typography.size.sm, color: Colors.textPrimary, fontFamily: Typography.family.bold },
  progressBarBg: { height: 8, backgroundColor: Colors.border, borderRadius: Radii.full, overflow: 'hidden' },
  progressBarFill: { height: '100%', borderRadius: Radii.full },
  emptyText: { fontSize: Typography.size.sm, color: Colors.textSecondary, fontStyle: 'italic' },
  historyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  historyMeal: { fontSize: Typography.size.sm, fontFamily: Typography.family.medium, color: Colors.textPrimary },
  historyDate: { fontSize: Typography.size.xs, color: Colors.textSecondary, marginTop: 2 },
  historyCredits: { fontSize: Typography.size.sm, fontFamily: Typography.family.bold, color: Colors.primary },

  requestCard: {
    flexDirection: 'row',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xs,
    borderLeftWidth: 4,
    borderLeftColor: Colors.primary,
  },
  requestPlanName: {
    fontSize: Typography.size.base,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
  },
  requestDate: {
    fontSize: Typography.size.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  requestAmount: {
    fontSize: Typography.size.base,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
  },
  requestContainer: {
    backgroundColor: Colors.surface,
    borderRadius: Radii.md,
    marginBottom: Spacing.sm,
    padding: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.sm,
  },
  viewProofRequestBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.xs,
    paddingVertical: 6,
    backgroundColor: Colors.primaryBg,
    borderRadius: Radii.sm,
    borderWidth: 1,
    borderColor: Colors.primary + '30',
  },
  viewProofRequestBtnText: {
    fontSize: Typography.size.xs,
    fontFamily: Typography.family.medium,
    color: Colors.primary,
  },
  historyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: Radii.full,
    backgroundColor: Colors.primaryBg,
    borderWidth: 1,
    borderColor: Colors.primaryLight,
  },
  historyButtonText: {
    fontSize: Typography.size.sm,
    fontFamily: Typography.family.medium,
    color: Colors.primary,
  },
});
