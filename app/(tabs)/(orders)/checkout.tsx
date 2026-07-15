import { ScreenWrapper } from "@/src/components/layout";
import { QuantitySelector } from "@/src/components/shared";
import { Button } from "@/src/components/ui";
import { PICKUP_LOCATION } from "@/src/constants/config";
import { PaymentMethod } from "@/src/constants/enums";
import {
  Colors,
  Radii,
  Shadows,
  Spacing,
  Typography,
} from "@/src/constants/theme";
import {
  useActiveSubscription,
  useLiveInventory,
  useOperationalWindow,
  useScheduledMeals,
  useSubscriptionPlan,
} from "@/src/hooks";
import { queryKeys } from "@/src/hooks/queryKeys";
import { placeOrder } from "@/src/services/orders";
import { useCartStore, useUser } from "@/src/store";
import { formatCurrency, formatFriendlyDate } from "@/src/utils/formatters";
import { processSubscription } from "@/src/utils/subscriptionEngine";
import { Ionicons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/src/lib/supabase";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View, ScrollView } from "react-native";
import { UpiPaymentPanel } from "@/src/components/payments/UpiPaymentPanel";
import { PaymentScreenshotPicker, SelectedImage } from "@/src/components/payments/PaymentScreenshotPicker";
import { usePaymentSettings, useSubmitOrderProof } from "@/src/hooks/payments/usePayments";
import { uploadPaymentScreenshot, parsePaymentBackendError } from "@/src/services/payments";

type CheckoutState = 'idle' | 'creating_order' | 'order_created' | 'uploading_proof' | 'linking_proof' | 'proof_submitted' | 'recovery_required';

export default function CheckoutScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { items, clearCart, updateQuantity, removeItem } = useCartStore();
  const [payment, setPayment] = useState<PaymentMethod>(PaymentMethod.UPI);
  const user = useUser();
  const [pickupSlot, setPickupSlot] = useState<string>("12:00-12:30");
  
  // Staged UPI state
  const [checkoutState, setCheckoutState] = useState<CheckoutState>('idle');
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);
  const [backendTotal, setBackendTotal] = useState<number | null>(null);
  const [selectedImage, setSelectedImage] = useState<SelectedImage | null>(null);

  const { data: opFacts, isLoading: isLoadingOp } = useOperationalWindow();
  const { data: scheduledMeals = [], isLoading: isLoadingMeals } = useScheduledMeals(opFacts?.activeMenu?.id);
  
  const stallId = opFacts?.activeMenu?.stall_id;
  
  // Payment Settings
  const { data: paymentSettings, isLoading: isLoadingSettings } = usePaymentSettings(stallId);
  const submitProofMutation = useSubmitOrderProof();

  const { data: inventory = [], isLoading: isLoadingInventory } = useLiveInventory(stallId, opFacts?.operationalDate);
  const { data: subscription, isLoading: isLoadingSub } = useActiveSubscription(user?.id);
  const { data: plan, isLoading: isLoadingPlan } = useSubscriptionPlan(subscription?.planId);

  // Active Batch resolution
  const activeBatch = inventory.find(
    (b) => b.batch_status === 'active' && b.stall_id === stallId && b.inventory_date === opFacts?.operationalDate
  );
  const activeBatchId = activeBatch ? activeBatch.batch_id : null;
  const orderMode = activeBatchId ? 'LIVE_INVENTORY' : 'PREORDER';

  console.log('[CHECKOUT INVENTORY CONTEXT]', {
    resolvedDate: opFacts?.operationalDate,
    activeBatchId,
    inventoryLength: inventory.length
  });

  // Engine logic
  const engineResult = processSubscription(
    items,
    subscription || null,
    plan || null,
    opFacts?.operationalDate || "",
  );
  const subtotal = engineResult.newSubtotal;
  const tax = Math.round(subtotal * 0.05);
  const frontendTotal = subtotal + tax;
  const isSubscriptionApplied = engineResult.subscriptionUpdates !== null;
  const isFullyCoveredBySubscription = items.length > 0 && frontendTotal === 0 && isSubscriptionApplied;

  const displayTotal = backendTotal !== null ? backendTotal : frontendTotal;

  const canOrder = 
    opFacts?.status === "ORDERING_OPEN" && 
    opFacts?.isPrepTime !== true && 
    opFacts?.activeMenu?.is_published === true;

  const handlePlaceOrderClick = async () => {
    if (!user || items.length === 0) return;

    if (!canOrder || !opFacts?.operationalDate) {
      alert("Ordering is currently closed or cannot determine date.");
      return;
    }

    // Validation
    const invalidItems = items.filter((cartItem) => !scheduledMeals.some((m) => m.id === cartItem.meal.id));
    if (invalidItems.length > 0) {
      alert("Some items are no longer available on today's menu.");
      return;
    }

    if (orderMode === 'LIVE_INVENTORY') {
      // Pre-submit cart validation
      const { data: latestInventory, error: fetchError } = await supabase
        .from("customer_safe_inventory")
        .select("*")
        .eq("stall_id", stallId)
        .eq("inventory_date", opFacts.operationalDate);

      const currentActiveBatch = latestInventory?.find((b: any) => b.batch_status === 'active');
      
      if (fetchError || !currentActiveBatch || currentActiveBatch.batch_id !== activeBatchId) {
        alert("Stock changed while you were checking out. Please review your cart.");
        return;
      }

      const overLimit = items.filter((cartItem) => {
        const invItem = latestInventory.find((i: any) => i.meal_id === cartItem.meal.id);
        if (!invItem) return true;
        return cartItem.quantity > invItem.customer_available;
      });

      if (overLimit.length > 0) {
        alert("Stock changed while you were checking out. Please review your cart.");
        return;
      }
    }

    // Fully subscription covered bypasses UPI logic
    const resolvedPaymentMethod = isFullyCoveredBySubscription ? PaymentMethod.CASH : payment;

    try {
      setCheckoutState('creating_order');
      const orderStallId = items[0].meal.stallId;
      if (!orderStallId) throw new Error("Cannot determine stall for this order.");

      const appliedSubscriptionId = (engineResult.subscriptionUpdates && subscription) ? subscription.id : undefined;

      console.log('[PLACE ORDER PAYLOAD]', {
        pickupDate: opFacts.operationalDate,
        inventoryBatchId: activeBatchId,
        itemCount: engineResult.processedItems.length,
        paymentMethod: resolvedPaymentMethod,
        pickupSlot
      });

      const newOrder = await placeOrder(
        user.id,
        orderStallId,
        engineResult.processedItems,
        opFacts.operationalDate,
        pickupSlot,
        resolvedPaymentMethod,
        appliedSubscriptionId,
        undefined,
        activeBatchId
      );

      setCreatedOrderId(newOrder.id);
      setBackendTotal(newOrder.total);

      // Invalidate relevant queries
      await queryClient.invalidateQueries({ queryKey: queryKeys.orders.list(user.id) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.subscriptions.active(user.id) });

      if (resolvedPaymentMethod === PaymentMethod.UPI && !isFullyCoveredBySubscription) {
        // Stop here, require proof upload
        setCheckoutState('order_created');
      } else {
        // Cash or fully covered
        clearCart();
        setCheckoutState('idle');
        router.replace({ pathname: "/(tabs)/(orders)/confirmation", params: { orderId: newOrder.id } } as any);
      }
    } catch (error: any) {
      console.error(error);
      
      let displayMessage = "An error occurred placing your order.";
      
      try {
        if (error.message) {
          const parsed = JSON.parse(error.message);
          if (parsed.code === 'BATCH_REQUIRED') {
            displayMessage = "We found live inventory for this pickup date but could not attach it to your order. Please retry.";
          } else if (parsed.code) {
            displayMessage = "Live inventory changed. Please refresh and try again.";
          } else {
             const paymentErr = parsePaymentBackendError(error);
             displayMessage = paymentErr.message;
          }
        } else {
          const paymentErr = parsePaymentBackendError(error);
          displayMessage = paymentErr.message;
        }
      } catch (parseErr) {
        const paymentErr = parsePaymentBackendError(error);
        displayMessage = paymentErr.message;
      }

      alert(displayMessage);
      setCheckoutState('idle');
    }
  };

  const handleUploadProof = async () => {
    if (!user || !createdOrderId || !selectedImage) return;

    try {
      setCheckoutState('uploading_proof');
      
      const storagePath = await uploadPaymentScreenshot(
        'orders',
        user.id,
        selectedImage.uri,
        selectedImage.mimeType
      );

      setCheckoutState('linking_proof');

      await submitProofMutation.mutateAsync({
        orderId: createdOrderId,
        screenshotPath: storagePath,
        mimeType: selectedImage.mimeType,
        size: selectedImage.size,
      });

      setCheckoutState('proof_submitted');
      clearCart();
      router.replace({ pathname: "/(tabs)/(orders)/confirmation", params: { orderId: createdOrderId } } as any);

    } catch (error) {
      console.error(error);
      const parsed = parsePaymentBackendError(error);
      alert(parsed.message);
      setCheckoutState('recovery_required');
    }
  };

  const isLocked = checkoutState !== 'idle';
  const isRecovering = checkoutState === 'recovery_required' || checkoutState === 'order_created';
  const isUploading = checkoutState === 'uploading_proof' || checkoutState === 'linking_proof';

  return (
    <ScreenWrapper>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} disabled={isLocked && checkoutState !== 'recovery_required'}>
          <Ionicons name="arrow-back" size={24} color={isLocked && checkoutState !== 'recovery_required' ? Colors.textTertiary : Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Checkout</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: Spacing['4xl'] }} showsVerticalScrollIndicator={false}>
        {opFacts?.isHoliday ? (
          <View style={styles.holidayBlock}>
            <Ionicons name="close-circle" size={48} color={Colors.error} />
            <Text style={styles.holidayBlockTitle}>Kitchen Closed</Text>
            <Text style={styles.holidayBlockDate}>{formatFriendlyDate(opFacts.operationalDate || "")}</Text>
          </View>
        ) : (
          <>
            {isRecovering && (
              <View style={[styles.card, { borderColor: Colors.warning, borderWidth: 1, backgroundColor: Colors.warningLight }]}>
                <Text style={[styles.cardTitle, { color: Colors.warning }]}>Action Required</Text>
                <Text style={{ fontSize: Typography.size.sm, color: Colors.warning }}>
                  Your order has been created, but the payment screenshot still needs to be submitted. Please upload the screenshot below to complete your order.
                </Text>
              </View>
            )}

            {!isRecovering && (
              <>
                <View style={[styles.card, isLocked && { opacity: 0.6 }]}>
                  <Text style={styles.cardTitle}>Expected Pickup Time</Text>
                  <View style={styles.chipContainer}>
                    {[
                      { label: "12:00–12:30", value: "12:00-12:30" },
                      { label: "12:30–1:00", value: "12:30-13:00" },
                      { label: "1:00–1:30", value: "13:00-13:30" },
                      { label: "1:30–2:00", value: "13:30-14:00" },
                    ].map((slot) => (
                      <TouchableOpacity
                        key={slot.value}
                        style={[styles.chip, pickupSlot === slot.value && styles.chipActive]}
                        onPress={() => !isLocked && setPickupSlot(slot.value)}
                        activeOpacity={0.7}
                        disabled={isLocked}
                      >
                        <Text style={[styles.chipText, pickupSlot === slot.value && styles.chipTextActive]}>
                          {slot.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <View style={[styles.card, isLocked && { opacity: 0.6 }]}>
                  <Text style={styles.cardTitle}>Order Summary</Text>
                  {engineResult.processedItems.map((item, index) => (
                    <View key={`${item.meal.id}-${index}`} style={styles.itemRow}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between", width: "100%", marginBottom: Spacing.sm }}>
                        <Text style={[styles.itemText, { fontFamily: Typography.family.medium, flex: 1 }]}>
                          {item.meal.name}
                        </Text>
                        <Text style={styles.itemPrice}>
                          {item.quantity} × {item.unitPrice === 0 ? "₹0" : formatCurrency(item.unitPrice)} = {formatCurrency(item.totalPrice)}
                        </Text>
                      </View>
                      <View style={{ flexDirection: "row", justifyContent: "space-between", width: "100%", alignItems: "center" }}>
                        <QuantitySelector
                          quantity={item.quantity}
                          onIncrement={() => {
                            if (isLocked) return;
                            if (orderMode === 'LIVE_INVENTORY') {
                               const invItem = inventory.find(i => i.meal_id === item.meal.id);
                               if (invItem && item.quantity >= invItem.customer_available) {
                                  alert(`Only ${invItem.customer_available} available.`);
                                  return;
                               }
                            }
                            updateQuantity(item.meal.id, item.quantity + 1);
                          }}
                          onDecrement={() => !isLocked && updateQuantity(item.meal.id, Math.max(1, item.quantity - 1))}
                          min={1}
                        />
                        {index === engineResult.processedItems.findIndex(i => i.meal.id === item.meal.id) && (
                          <TouchableOpacity onPress={() => !isLocked && removeItem(item.meal.id)} disabled={isLocked}>
                            <Ionicons name="trash-outline" size={20} color={isLocked ? Colors.textTertiary : Colors.error} />
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  ))}
                </View>
              </>
            )}

            {!isFullyCoveredBySubscription && !isRecovering && (
              <View style={[styles.card, isLocked && { opacity: 0.6 }]}>
                <Text style={styles.cardTitle}>Payment Method</Text>
                {[
                  { key: PaymentMethod.UPI, label: "UPI", icon: "phone-portrait-outline" as const },
                  { key: PaymentMethod.CASH, label: "Cash on Pickup", icon: "cash-outline" as const },
                ].map((p) => {
                  const isUpiDisabled = p.key === PaymentMethod.UPI && (!paymentSettings || !paymentSettings.isActive);
                  return (
                    <TouchableOpacity
                      key={p.key}
                      style={[styles.payOption, payment === p.key && styles.payActive, (isLocked || isUpiDisabled) && { opacity: 0.5 }]}
                      onPress={() => {
                        if (!isLocked && !isUpiDisabled) setPayment(p.key);
                      }}
                      disabled={isLocked || isUpiDisabled}
                    >
                      <Ionicons name={p.icon} size={20} color={payment === p.key ? Colors.primary : Colors.textSecondary} />
                      <Text style={[styles.payText, payment === p.key && styles.payTextActive]}>
                        {p.label} {isUpiDisabled ? '(Unavailable)' : ''}
                      </Text>
                      {payment === p.key && <Ionicons name="checkmark-circle" size={20} color={Colors.primary} style={{ marginLeft: "auto" }} />}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {!isRecovering && (
              <View style={[styles.totalCard, isLocked && { opacity: 0.6 }]}>
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Subtotal</Text>
                  <Text style={styles.totalVal}>{formatCurrency(subtotal)}</Text>
                </View>
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Tax</Text>
                  <Text style={styles.totalVal}>{formatCurrency(tax)}</Text>
                </View>
                <View style={[styles.totalRow, { borderTopWidth: 1, borderTopColor: Colors.borderLight, paddingTop: Spacing.sm }]}>
                  <Text style={styles.grandLabel}>Total</Text>
                  <Text style={styles.grandVal}>{formatCurrency(displayTotal)}</Text>
                </View>
              </View>
            )}

            {/* Stage 1: Order Creation Button */}
            {!isRecovering && (
              <Button
                title={`Place Order • ${formatCurrency(displayTotal)}`}
                onPress={handlePlaceOrderClick}
                fullWidth
                size="lg"
                loading={checkoutState === 'creating_order' || isLoadingOp || isLoadingMeals || isLoadingSettings}
                disabled={isLocked || items.length === 0 || isLoadingOp || isLoadingMeals || isLoadingSettings}
                style={{ marginBottom: Spacing.xl }}
              />
            )}

            {/* Stage 2: UPI Upload Flow (Order created but needs proof) */}
            {(isRecovering) && payment === PaymentMethod.UPI && paymentSettings && (
              <View style={{ marginTop: Spacing.md }}>
                <UpiPaymentPanel
                  amount={displayTotal}
                  recipientName={paymentSettings.recipientName}
                  upiId={paymentSettings.upiId}
                  qrImagePath={paymentSettings.qrImagePath}
                >
                  <PaymentScreenshotPicker
                    onImageSelected={setSelectedImage}
                    selectedImage={selectedImage}
                    isUploading={isUploading}
                  />
                </UpiPaymentPanel>
                
                <Button
                  title={isUploading ? "Uploading..." : "Submit Payment Proof"}
                  onPress={handleUploadProof}
                  fullWidth
                  size="lg"
                  loading={isUploading}
                  disabled={!selectedImage || isUploading}
                  style={{ marginTop: Spacing.lg }}
                />

                <Button
                  title="View Order Status"
                  variant="ghost"
                  fullWidth
                  onPress={() => {
                    // Navigate to confirmation even if proof wasn't submitted yet
                    router.replace({ pathname: "/(tabs)/(orders)/confirmation", params: { orderId: createdOrderId } } as any);
                  }}
                  disabled={isUploading}
                  style={{ marginTop: Spacing.sm }}
                />
              </View>
            )}
          </>
        )}
      </ScrollView>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: Spacing.xl,
    marginBottom: Spacing.base,
  },
  title: {
    fontSize: Typography.size.lg,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radii.lg,
    padding: Spacing.base,
    marginBottom: Spacing.md,
    ...Shadows.sm,
  },
  cardTitle: {
    fontSize: Typography.size.base,
    fontFamily: Typography.family.semiBold,
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
  },
  itemRow: {
    flexDirection: "column",
    alignItems: "flex-start",
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  itemText: { fontSize: Typography.size.sm, color: Colors.textSecondary },
  itemPrice: {
    fontSize: Typography.size.sm,
    fontFamily: Typography.family.medium,
    color: Colors.textPrimary,
  },
  payOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radii.sm,
    marginBottom: Spacing.xs,
  },
  payActive: { backgroundColor: Colors.primaryBg },
  payText: { fontSize: Typography.size.sm, color: Colors.textSecondary },
  payTextActive: {
    color: Colors.primary,
    fontFamily: Typography.family.semiBold,
  },
  totalCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radii.lg,
    padding: Spacing.base,
    marginBottom: Spacing.base,
    ...Shadows.sm,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: Spacing.xs,
  },
  totalLabel: { fontSize: Typography.size.sm, color: Colors.textSecondary },
  totalVal: {
    fontSize: Typography.size.sm,
    fontFamily: Typography.family.medium,
    color: Colors.textPrimary,
  },
  grandLabel: {
    fontSize: Typography.size.md,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
  },
  grandVal: {
    fontSize: Typography.size.md,
    fontFamily: Typography.family.bold,
    color: Colors.primary,
  },
  chipContainer: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.sm },
  chip: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Radii.full,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  chipActive: {
    backgroundColor: Colors.primaryBg,
    borderColor: Colors.primary,
  },
  chipText: {
    fontSize: Typography.size.sm,
    fontFamily: Typography.family.medium,
    color: Colors.textSecondary,
  },
  chipTextActive: { color: Colors.primary, fontFamily: Typography.family.bold },
  holidayBlock: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing["3xl"],
  },
  holidayBlockTitle: {
    fontSize: Typography.size.xl,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    marginTop: Spacing.lg,
    marginBottom: Spacing.xs,
    textAlign: "center",
  },
  holidayBlockDate: {
    fontSize: Typography.size.base,
    color: Colors.textSecondary,
    fontFamily: Typography.family.medium,
    marginBottom: Spacing.xl,
    textAlign: "center",
  },
});
