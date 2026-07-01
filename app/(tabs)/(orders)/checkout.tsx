import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radii, Shadows } from '@/src/constants/theme';
import { ScreenWrapper } from '@/src/components/layout';
import { Button } from '@/src/components/ui';
import { QuantitySelector } from '@/src/components/shared';
import { useCartStore, useUser } from '@/src/store';
import { formatCurrency } from '@/src/utils/formatters';
import { placeOrder } from '@/src/services/orders';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/src/hooks/queryKeys';
import { useActiveMenu, useScheduledMeals, useActiveSubscription, useSubscriptionPlan } from '@/src/hooks';
import { processSubscription } from '@/src/utils/subscriptionEngine';

export default function CheckoutScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { items, getSubtotal, clearCart, updateQuantity, removeItem } = useCartStore();
  const [payment, setPayment] = useState('upi');
  const user = useUser();
  const [isPlacing, setIsPlacing] = useState(false);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowDateString = tomorrow.toISOString().split('T')[0];
  
  const { data: activeMenu, storeStatus, isLoading: isLoadingMenu } = useActiveMenu(tomorrowDateString);
  const { data: scheduledMeals = [], isLoading: isLoadingMeals } = useScheduledMeals(activeMenu?.id);
  const { data: subscription, isLoading: isLoadingSub } = useActiveSubscription(user?.id);
  const { data: plan, isLoading: isLoadingPlan } = useSubscriptionPlan(subscription?.planId);

  const engineResult = processSubscription(items, subscription || null, plan || null, tomorrowDateString);
  const subtotal = engineResult.newSubtotal;
  const tax = Math.round(subtotal * 0.05);
  const total = subtotal + tax;
  const isSubscriptionApplied = engineResult.subscriptionUpdates !== null;

  const handlePlaceOrder = async () => {
    if (!user || items.length === 0) return;
    
    // Store Status Validation
    if (!storeStatus?.isOrderingOpen) {
      alert(storeStatus?.subtitle || 'Ordering is currently closed.');
      return;
    }

    // Cart Validation
    const invalidItems = items.filter(cartItem => 
      !scheduledMeals.some(meal => meal.id === cartItem.meal.id)
    );

    if (invalidItems.length > 0) {
      alert('One or more items in your cart are no longer available on tomorrow\'s menu. Please remove them to continue.');
      return;
    }

    try {
      setIsPlacing(true);
      const stallId = items[0].meal.stallId;
      const stallName = 'RollBowl Main Stall'; // Typically fetched or associated with items
      
      const subUpdates = engineResult.subscriptionUpdates && subscription ? { id: subscription.id, updates: engineResult.subscriptionUpdates } : undefined;
      
      const newOrder = await placeOrder(user.id, user.name, stallId, stallName, engineResult.processedItems, subtotal, tax, total, tomorrowDateString, subUpdates, undefined);
      
      // Invalidate the orders cache so the new order shows up immediately
      await queryClient.invalidateQueries({ queryKey: queryKeys.orders.list(user.id) });
      
      clearCart();
      router.replace({ pathname: '/(tabs)/(orders)/confirmation', params: { orderId: newOrder.id } } as any);
    } catch (error) {
      console.error('Failed to place order:', error);
      alert('Failed to place order. Please try again.');
    } finally {
      setIsPlacing(false);
    }
  };

  return (
    <ScreenWrapper>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color={Colors.textPrimary} /></TouchableOpacity>
        <Text style={styles.title}>Checkout</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Pickup Information */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Pickup Information</Text>
        <View style={styles.pickupRow}>
          <Ionicons name="storefront-outline" size={20} color={Colors.textSecondary} />
          <View>
            <Text style={styles.pickupLabel}>Pickup Location</Text>
            <Text style={styles.cardValue}>RollBowl Main Stall</Text>
          </View>
        </View>
        <View style={[styles.pickupRow, { marginTop: Spacing.sm }]}>
          <Ionicons name="time-outline" size={20} color={Colors.textSecondary} />
          <View>
            <Text style={styles.pickupLabel}>Pickup Time</Text>
            <Text style={styles.cardValue}>Ready in approx. 15 minutes</Text>
          </View>
        </View>
      </View>

      {/* Order Items */}
      <View style={styles.card}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm }}>
          <Text style={styles.cardTitle}>Order Summary</Text>
          {items.length > 0 && (
            <TouchableOpacity onPress={clearCart}>
              <Text style={{ color: Colors.error, fontSize: Typography.size.sm, fontFamily: Typography.family.medium }}>Empty Cart</Text>
            </TouchableOpacity>
          )}
        </View>
        
        {engineResult.processedItems.map((item, index) => (
          <View key={`${item.meal.id}-${index}`} style={styles.itemRow}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginBottom: Spacing.sm }}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.itemText, { fontFamily: Typography.family.medium }]}>{item.meal.name}</Text>
                {item.subscriptionId && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                    <Ionicons name="ticket" size={12} color={Colors.primary} style={{ marginRight: 4 }} />
                    <Text style={{ fontSize: Typography.size.xs, color: Colors.primary }}>Subscription Applied</Text>
                  </View>
                )}
              </View>
              <Text style={styles.itemPrice}>
                {item.quantity} × {item.unitPrice === 0 ? '₹0' : formatCurrency(Number(item.meal.price))} = {formatCurrency(item.totalPrice)}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
              <QuantitySelector 
                quantity={item.quantity} 
                onIncrement={() => updateQuantity(item.meal.id, item.quantity + 1)} 
                onDecrement={() => updateQuantity(item.meal.id, Math.max(1, item.quantity - 1))} 
                min={1} 
              />
              {/* Only show delete on the first visual chunk for an item to prevent duplicate buttons */}
              {index === engineResult.processedItems.findIndex(i => i.meal.id === item.meal.id) && (
                <TouchableOpacity onPress={() => removeItem(item.meal.id)}>
                  <Ionicons name="trash-outline" size={20} color={Colors.error} />
                </TouchableOpacity>
              )}
            </View>
          </View>
        ))}

        {isSubscriptionApplied && subscription && engineResult.subscriptionUpdates && (
          <View style={{ marginTop: Spacing.md, padding: Spacing.sm, backgroundColor: Colors.primaryBg, borderRadius: Radii.md }}>
            <Text style={{ fontSize: Typography.size.sm, fontFamily: Typography.family.semiBold, color: Colors.primary, marginBottom: 4 }}>
              Subscription Summary
            </Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
              <Text style={{ fontSize: Typography.size.xs, color: Colors.textSecondary }}>Credits Consumed:</Text>
              <Text style={{ fontSize: Typography.size.xs, fontFamily: Typography.family.bold, color: Colors.textPrimary }}>
                {engineResult.subscriptionUpdates.consumedMeals - subscription.consumedMeals}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: Typography.size.xs, color: Colors.textSecondary }}>Remaining Credits After Order:</Text>
              <Text style={{ fontSize: Typography.size.xs, fontFamily: Typography.family.bold, color: Colors.textPrimary }}>
                {engineResult.subscriptionUpdates.remainingMeals}
              </Text>
            </View>
          </View>
        )}
      </View>

      {/* Payment */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Payment Method</Text>
        {[{ key: 'upi', label: 'UPI', icon: 'phone-portrait-outline' as const }, { key: 'card', label: 'Card', icon: 'card-outline' as const }, { key: 'cash', label: 'Cash', icon: 'cash-outline' as const }].map((p) => (
          <TouchableOpacity key={p.key} style={[styles.payOption, payment === p.key && styles.payActive]} onPress={() => setPayment(p.key)}>
            <Ionicons name={p.icon} size={20} color={payment === p.key ? Colors.primary : Colors.textSecondary} />
            <Text style={[styles.payText, payment === p.key && styles.payTextActive]}>{p.label}</Text>
            {payment === p.key && <Ionicons name="checkmark-circle" size={20} color={Colors.primary} style={{ marginLeft: 'auto' }} />}
          </TouchableOpacity>
        ))}
      </View>

      {/* Total */}
      <View style={styles.totalCard}>
        <View style={styles.totalRow}><Text style={styles.totalLabel}>Subtotal</Text><Text style={styles.totalVal}>{formatCurrency(subtotal)}</Text></View>
        <View style={styles.totalRow}><Text style={styles.totalLabel}>Tax</Text><Text style={styles.totalVal}>{formatCurrency(tax)}</Text></View>
        <View style={[styles.totalRow, { borderTopWidth: 1, borderTopColor: Colors.borderLight, paddingTop: Spacing.sm }]}>
          <Text style={styles.grandLabel}>Total</Text><Text style={styles.grandVal}>{formatCurrency(total)}</Text>
        </View>
      </View>

      <Button 
        title={`Place Order • ${formatCurrency(total)}`} 
        onPress={handlePlaceOrder} 
        fullWidth 
        size="lg" 
        loading={isPlacing || isLoadingMenu || isLoadingMeals || isLoadingSub || isLoadingPlan} 
        disabled={isPlacing || items.length === 0 || isLoadingMenu || isLoadingMeals || isLoadingSub || isLoadingPlan} 
      />
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: Spacing.xl, marginBottom: Spacing.base },
  title: { fontSize: Typography.size.lg, fontFamily: Typography.family.bold, color: Colors.textPrimary },
  card: { backgroundColor: Colors.surface, borderRadius: Radii.lg, padding: Spacing.base, marginBottom: Spacing.md, ...Shadows.sm },
  cardTitle: { fontSize: Typography.size.base, fontFamily: Typography.family.semiBold, color: Colors.textPrimary, marginBottom: Spacing.sm },
  pickupRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  pickupLabel: { fontSize: Typography.size.xs, color: Colors.textTertiary, marginBottom: 2 },
  cardValue: { fontSize: Typography.size.sm, fontFamily: Typography.family.medium, color: Colors.textPrimary },
  itemRow: { flexDirection: 'column', alignItems: 'flex-start', paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  itemText: { fontSize: Typography.size.sm, color: Colors.textSecondary },
  itemPrice: { fontSize: Typography.size.sm, fontFamily: Typography.family.medium, color: Colors.textPrimary },
  payOption: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.sm, borderRadius: Radii.sm, marginBottom: Spacing.xs },
  payActive: { backgroundColor: Colors.primaryBg },
  payText: { fontSize: Typography.size.sm, color: Colors.textSecondary },
  payTextActive: { color: Colors.primary, fontFamily: Typography.family.semiBold },
  totalCard: { backgroundColor: Colors.surface, borderRadius: Radii.lg, padding: Spacing.base, marginBottom: Spacing.base, ...Shadows.sm },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.xs },
  totalLabel: { fontSize: Typography.size.sm, color: Colors.textSecondary },
  totalVal: { fontSize: Typography.size.sm, fontFamily: Typography.family.medium, color: Colors.textPrimary },
  grandLabel: { fontSize: Typography.size.md, fontFamily: Typography.family.bold, color: Colors.textPrimary },
  grandVal: { fontSize: Typography.size.md, fontFamily: Typography.family.bold, color: Colors.primary },
});
