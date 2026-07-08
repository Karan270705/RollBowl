import { ScreenWrapper } from '@/src/components/layout';
import { Timeline, TimelineStep } from '@/src/components/shared';
import { Button, EmptyState, LoadingSpinner } from '@/src/components/ui';
import { OrderStatus } from '@/src/constants/enums';
import { Colors, Radii, Shadows, Spacing, Typography } from '@/src/constants/theme';
import { useOrder } from '@/src/hooks';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

export default function TrackOrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: order, isLoading } = useOrder(id);

  if (isLoading) {
    return (
      <ScreenWrapper>
        <LoadingSpinner fullScreen message="Loading tracking details..." />
      </ScreenWrapper>
    );
  }

  if (!order) {
    return (
      <ScreenWrapper>
        <EmptyState icon="alert-circle-outline" title="Order Not Found" subtitle="Could not load tracking information." />
      </ScreenWrapper>
    );
  }

  // Generate timeline steps based on order status
  const getSteps = (status: OrderStatus): TimelineStep[] => {
    const isPending = status === OrderStatus.PENDING;
    const isConfirmed = status === OrderStatus.CONFIRMED;
    const isPreparing = status === OrderStatus.PREPARING;
    const isReady = status === OrderStatus.READY;
    const isPickedUp = status === OrderStatus.PICKED_UP;

    // Determine active steps based on standard progression
    const pendingActive = isPending;
    const confirmedActive = isConfirmed;
    const preparingActive = isPreparing;
    const readyActive = isReady;

    // Determine completed steps
    const confirmedCompleted = isConfirmed || isPreparing || isReady || isPickedUp;
    const preparingCompleted = isPreparing || isReady || isPickedUp;
    const readyCompleted = isReady || isPickedUp;
    const pickedUpCompleted = isPickedUp;

    return [
      {
        id: '1',
        title: 'Order Placed',
        description: 'We have received your order.',
        time: new Date(order.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
        isCompleted: true,
        isActive: pendingActive,
        icon: 'document-text',
      },
      {
        id: '2',
        title: 'Order Confirmed',
        description: 'The kitchen has accepted your order.',
        isCompleted: confirmedCompleted,
        isActive: confirmedActive,
        icon: 'restaurant',
      },
      {
        id: '3',
        title: 'Preparing',
        description: 'Your food is being prepared with care.',
        isCompleted: preparingCompleted,
        isActive: preparingActive,
        icon: 'flame',
      },
      {
        id: '4',
        title: 'Ready',
        description: 'Your order is ready for pickup.',
        isCompleted: readyCompleted,
        isActive: readyActive,
        icon: 'checkmark-circle',
      },
      {
        id: '5',
        title: 'Picked Up',
        description: 'Enjoy your meal!',
        isCompleted: pickedUpCompleted,
        isActive: false, // terminal state
        icon: 'home',
      }
    ];
  };

  const steps = getSteps(order.status);

  return (
    <ScreenWrapper>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.title}>Track Order</Text>
          <Text style={styles.orderNumber}>{order.orderNumber}</Text>
        </View>

        <View style={styles.mapPlaceholder}>
          <Text style={styles.mapText}>Live Tracking Map</Text>
          <Text style={styles.mapSubText}>(Coming Soon)</Text>
        </View>

        <View style={styles.timelineCard}>
          <Text style={styles.cardTitle}>Order Status</Text>
          <Timeline steps={steps} />
        </View>

      </ScrollView>

      <View style={styles.footer}>
        <Button
          title="Back to Orders"
          variant="outline"
          onPress={() => router.navigate('/(tabs)/(orders)')}
          fullWidth
        />
      </View>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: Spacing.xl,
  },
  header: {
    paddingVertical: Spacing.xl,
  },
  title: {
    fontSize: Typography.size.xl,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
  },
  orderNumber: {
    fontSize: Typography.size.base,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
  },
  mapPlaceholder: {
    height: 200,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radii.lg,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.xl,
    ...Shadows.sm,
  },
  mapText: {
    fontSize: Typography.size.lg,
    fontFamily: Typography.family.semiBold,
    color: Colors.textSecondary,
  },
  mapSubText: {
    fontSize: Typography.size.sm,
    color: Colors.textTertiary,
    marginTop: Spacing.xs,
  },
  timelineCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radii.lg,
    padding: Spacing.lg,
    ...Shadows.sm,
  },
  cardTitle: {
    fontSize: Typography.size.lg,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    marginBottom: Spacing.md,
  },
  footer: {
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
});
