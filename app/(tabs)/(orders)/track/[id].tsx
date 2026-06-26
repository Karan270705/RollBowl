import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors, Typography, Spacing, Radii, Shadows } from '@/src/constants/theme';
import { ScreenWrapper } from '@/src/components/layout';
import { Button } from '@/src/components/ui';
import { Timeline, TimelineStep } from '@/src/components/shared';
import { MOCK_ORDERS } from '@/src/constants/mockData';

export default function TrackOrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  
  const order = MOCK_ORDERS.find(o => o.id === id) || MOCK_ORDERS[0]; // fallback for mock purposes

  // Generate timeline steps based on order status
  const getSteps = (status: string): TimelineStep[] => {
    const isCompleted = status === 'completed';
    const isPreparing = status === 'preparing';
    const isPending = status === 'pending';
    
    return [
      {
        id: '1',
        title: 'Order Placed',
        description: 'We have received your order.',
        time: '10:00 AM', // Mock time
        isCompleted: true,
        isActive: false,
        icon: 'document-text',
      },
      {
        id: '2',
        title: 'Order Confirmed',
        description: 'The kitchen has accepted your order.',
        time: '10:02 AM',
        isCompleted: !isPending,
        isActive: isPending,
        icon: 'restaurant',
      },
      {
        id: '3',
        title: 'Preparing',
        description: 'Your food is being prepared with care.',
        isCompleted: isCompleted,
        isActive: isPreparing,
        icon: 'flame',
      },
      {
        id: '4',
        title: 'Ready for Pickup / Delivered',
        description: 'Your order is ready!',
        isCompleted: isCompleted,
        isActive: isCompleted,
        icon: 'checkmark-circle',
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
    paddingBottom: Spacing.xxl,
  },
  header: {
    paddingVertical: Spacing.xl,
  },
  title: {
    fontSize: Typography.size.xxl,
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
