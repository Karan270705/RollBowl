import { ScreenWrapper } from "@/src/components/layout";
import { QuantitySelector } from "@/src/components/shared";
import { Button } from "@/src/components/ui";
import { AppConfig, PICKUP_LOCATION } from "@/src/constants/config";
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
import { processSubscription, isSubscriptionValidForServiceDate } from "@/src/utils/subscriptionEngine";
import { Ionicons } from "@expo/vector-icons";
import type { InventoryMode } from "@/src/engine/availabilityResolver";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/src/lib/supabase";
import { useRouter } from "expo-router";
import React, { useState, useRef, useEffect } from "react";
import { StyleSheet, Text, TouchableOpacity, View, ScrollView } from "react-native";
import { UpiPaymentPanel } from "@/src/components/payments/UpiPaymentPanel";
import { PaymentScreenshotPicker, SelectedImage } from "@/src/components/payments/PaymentScreenshotPicker";
import { usePaymentSettings, useSubmitOrderProof } from "@/src/hooks/payments/usePayments";
import { uploadPaymentScreenshot, parsePaymentBackendError } from "@/src/services/payments";
import { resolveOperationalFacts } from "@/src/engine/operationalEngine";

type CheckoutState =
  | 'REVIEW'
  | 'SUBMITTING'
  | 'ORDER_CREATED'
  | 'AWAITING_PROOF'
  | 'COMPLETED'
  | 'FAILED';

export type CheckoutPaymentMode =
  | 'FULLY_SUBSCRIPTION_COVERED'
  | 'PARTIALLY_SUBSCRIPTION_COVERED'
  | 'DIRECT_PAYMENT';

export default function CheckoutScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { items, cartPickupDate, clearCart, updateQuantity, removeItem } = useCartStore();
  const [payment, setPayment] = useState<PaymentMethod>(PaymentMethod.UPI);
  const user = useUser();
  const [pickupSlot, setPickupSlot] = useState<string>("12:00 PM - 12:30 PM");
  
  // Staged Checkout state
  const [checkoutState, setCheckoutState] = useState<CheckoutState>('REVIEW');
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);
  const [backendTotal, setBackendTotal] = useState<number | null>(null);
  const [selectedImage, setSelectedImage] = useState<SelectedImage | null>(null);

  // Synchronous double-submit guard ref & unmount logging refs
  const submittingRef = useRef(false);
  const checkoutStateRef = useRef<CheckoutState>('REVIEW');
  const hasSubmittedRef = useRef(false);
  const paymentRef = useRef<PaymentMethod>(PaymentMethod.UPI);
  const cartItemCountRef = useRef(items.reduce((sum, i) => sum + i.quantity, 0));
  const createdOrderIdRef = useRef<string | null>(null);
  const requestIdRef = useRef<string | null>(null);

  useEffect(() => {
    checkoutStateRef.current = checkoutState;
  }, [checkoutState]);

  useEffect(() => {
    paymentRef.current = payment;
  }, [payment]);

  useEffect(() => {
    cartItemCountRef.current = items.reduce((sum, i) => sum + i.quantity, 0);
  }, [items]);

  useEffect(() => {
    createdOrderIdRef.current = createdOrderId;
  }, [createdOrderId]);

  // Temporary diagnostic log: [CHECKOUT MOUNT] & [CHECKOUT EXIT]
  useEffect(() => {
    const initialItemCount = items.reduce((sum, i) => sum + i.quantity, 0);
    console.log('[CHECKOUT MOUNT]', JSON.stringify({
      checkoutState: 'REVIEW',
      orderId: null,
      cartItemCount: initialItemCount,
      cartPickupDate: cartPickupDate || null,
    }, null, 2));

    return () => {
      console.log('[CHECKOUT EXIT]', JSON.stringify({
        checkoutState: checkoutStateRef.current,
        hasSubmitted: hasSubmittedRef.current,
        submitting: submittingRef.current,
        selectedPaymentMethod: paymentRef.current,
        cartItemCount: cartItemCountRef.current,
        orderId: createdOrderIdRef.current,
      }, null, 2));
    };
  }, []);

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
  const inventoryMode: InventoryMode = activeBatchId ? 'LIVE_INVENTORY' : 'UNTRACKED';

  console.log('[CHECKOUT INVENTORY CONTEXT]', {
    resolvedDate: opFacts?.operationalDate,
    activeBatchId,
    inventoryMode,
    inventoryLength: inventory.length
  });

  const isCartStaleOrLegacy: boolean = Boolean(
    items.length > 0 &&
    (!cartPickupDate || (opFacts?.operationalDate && cartPickupDate !== opFacts.operationalDate))
  );

  React.useEffect(() => {
    if (opFacts) {
      console.log('[CUSTOMER ROLLOVER CONTEXT]', JSON.stringify({
        nowIST: new Date().toISOString(),
        calendarDate: opFacts.operationalDate,
        resolvedOrderDate: opFacts.operationalDate,
        menuDate: opFacts.activeMenu?.menu_date || null,
        inventoryDate: activeBatch?.inventory_date || null,
        cartPickupDate,
        rolloverTime: AppConfig.BUSINESS.OPERATIONAL_ROLLOVER_TIME,
        resolutionReason: 'Resolved by Customer Engine',
      }, null, 2));
    }
  }, [opFacts, cartPickupDate, activeBatch]);

  // Authoritative Engine calculation & Backend-Aligned Totals
  const engineResult = processSubscription(
    items,
    subscription || null,
    plan || null,
    opFacts?.operationalDate || "",
  );

  const grossSubtotal = items.reduce((sum, item) => sum + (item.meal.price * item.quantity), 0);
  const grossTax = Math.round(grossSubtotal * 0.05);
  const grossOrderAmount = Math.round((grossSubtotal + grossTax) * 100) / 100;

  const subtotal = engineResult.newSubtotal;
  const tax = Math.round(subtotal * 0.05);
  const frontendTotal = Math.round((subtotal + tax) * 100) / 100;
  const displayTotal = backendTotal !== null ? backendTotal : frontendTotal;
  const remainingPayableAmount = Math.round(displayTotal * 100) / 100;

  const isSubscriptionApplied = engineResult.subscriptionUpdates !== null;
  const isSubActiveAndApplied = Boolean(
    isSubscriptionApplied &&
    isSubscriptionValidForServiceDate(subscription || null, opFacts?.operationalDate || '')
  );
  const subscriptionCoveredAmount = isSubActiveAndApplied
    ? Math.round(Math.max(0, grossOrderAmount - remainingPayableAmount) * 100) / 100
    : 0;

  const paymentMode: CheckoutPaymentMode = (() => {
    if (subscriptionCoveredAmount > 0 && remainingPayableAmount === 0) {
      return 'FULLY_SUBSCRIPTION_COVERED';
    }
    if (subscriptionCoveredAmount > 0 && remainingPayableAmount > 0) {
      return 'PARTIALLY_SUBSCRIPTION_COVERED';
    }
    return 'DIRECT_PAYMENT';
  })();

  const isFullyCoveredBySubscription = paymentMode === 'FULLY_SUBSCRIPTION_COVERED';

  useEffect(() => {
    if (paymentMode === 'FULLY_SUBSCRIPTION_COVERED') {
      setPayment('' as PaymentMethod);
      setSelectedImage(null);
    } else if (!payment) {
      setPayment(PaymentMethod.UPI);
    }
  }, [paymentMode, payment]);

  const placeOrderButtonTitle = (() => {
    if (paymentMode === 'FULLY_SUBSCRIPTION_COVERED') {
      return "Place Order • Covered by Subscription";
    }
    if (paymentMode === 'PARTIALLY_SUBSCRIPTION_COVERED') {
      return `Place Order • ${formatCurrency(remainingPayableAmount)}`;
    }
    return `Place Order • ${formatCurrency(displayTotal)}`;
  })();

  const canOrder = 
    opFacts?.status === "ORDERING_OPEN" && 
    opFacts?.isPrepTime !== true && 
    opFacts?.activeMenu?.is_published === true;

  const handleSelectPaymentMethod = (method: PaymentMethod) => {
    if (checkoutState !== 'REVIEW' && checkoutState !== 'FAILED') return;
    setPayment(method);
    console.log('[PAYMENT METHOD SELECTED]', JSON.stringify({
      paymentMethod: method,
      backendMutationTriggered: false,
    }, null, 2));
  };

  const handlePlaceOrder = async () => {
    // 1. synchronous duplicate-submit guard
    if (submittingRef.current) {
      return;
    }

    const currentRequestId = requestIdRef.current || `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    requestIdRef.current = currentRequestId;

    try {
      submittingRef.current = true;
      setCheckoutState('SUBMITTING');

      // 2. confirm cart is non-empty
      if (!user || items.length === 0) {
        setCheckoutState('REVIEW');
        return;
      }

      // 3. confirm cartPickupDate is valid
      if (isCartStaleOrLegacy || !cartPickupDate) {
        alert("Your cart belongs to an earlier menu. Clear it and add items from the current menu before checking out.");
        setCheckoutState('REVIEW');
        return;
      }

      // 9. verify payment selection and authoritative coverage contract
      if (paymentMode === 'FULLY_SUBSCRIPTION_COVERED') {
        if (remainingPayableAmount !== 0) {
          alert("Order payment calculation mismatch. Please review your cart.");
          setCheckoutState('REVIEW');
          return;
        }
      } else {
        if (remainingPayableAmount <= 0) {
          alert("Order payment calculation mismatch. Please review your cart.");
          setCheckoutState('REVIEW');
          return;
        }
        if (!payment) {
          alert("Select a payment method before placing your order.");
          setCheckoutState('REVIEW');
          return;
        }
      }

      // 4. refetch operational facts
      const orderStallId = items[0].meal.stallId;
      if (!orderStallId) {
        alert("We could not place your order. Please try again.");
        setCheckoutState('REVIEW');
        return;
      }

      const freshOpFacts = await resolveOperationalFacts(orderStallId, cartPickupDate);

      // 5. verify ordering is still open & 6. verify menu date matches cartPickupDate
      if (
        !freshOpFacts ||
        freshOpFacts.status !== 'ORDERING_OPEN' ||
        freshOpFacts.isPrepTime === true ||
        freshOpFacts.operationalDate !== cartPickupDate ||
        (freshOpFacts.activeMenu && freshOpFacts.activeMenu.menu_date !== cartPickupDate)
      ) {
        alert("Ordering has closed for this menu.");
        setCheckoutState('REVIEW');
        return;
      }

      // 7. verify inventory batch/date when inventory is active & 8. verify quantities and current stock
      if (inventoryMode === 'LIVE_INVENTORY') {
        const { data: latestInventory, error: fetchError } = await supabase
          .from("customer_safe_inventory")
          .select("*")
          .eq("stall_id", stallId)
          .eq("inventory_date", freshOpFacts.operationalDate);

        const currentActiveBatch = latestInventory?.find((b: any) => b.batch_status === 'active');
        if (fetchError || !currentActiveBatch || currentActiveBatch.batch_id !== activeBatchId) {
          alert("Stock changed while you were checking out. Please review your cart.");
          setCheckoutState('REVIEW');
          return;
        }

        const overLimit = items.filter((cartItem) => {
          const invItem = latestInventory.find((i: any) => i.meal_id === cartItem.meal.id);
          if (!invItem) return true;
          return cartItem.quantity > invItem.customer_available;
        });

        if (overLimit.length > 0) {
          alert("Stock changed while you were checking out. Please review your cart.");
          setCheckoutState('REVIEW');
          return;
        }
      }

      const invalidItems = items.filter((cartItem) => !scheduledMeals.some((m) => m.id === cartItem.meal.id));
      if (invalidItems.length > 0) {
        alert("Stock changed while you were checking out. Please review your cart.");
        setCheckoutState('REVIEW');
        return;
      }

      const resolvedPaymentMethod = isFullyCoveredBySubscription ? PaymentMethod.SUBSCRIPTION : payment;
      const totalCartCount = items.reduce((sum, i) => sum + i.quantity, 0);

      // Diagnostic log: [PLACE ORDER INTENT]
      console.log('[PLACE ORDER INTENT]', JSON.stringify({
        source: 'PLACE_ORDER_BUTTON',
        paymentMethod: resolvedPaymentMethod,
        cartItemCount: totalCartCount,
        pickupDate: freshOpFacts.operationalDate,
      }, null, 2));

      // Diagnostic log: [PLACE ORDER RPC START]
      console.log('[PLACE ORDER RPC START]', JSON.stringify({
        requestId: currentRequestId,
        paymentMethod: resolvedPaymentMethod,
        pickupDate: freshOpFacts.operationalDate,
        inventoryBatchId: activeBatchId || null,
        itemCount: engineResult.processedItems.length,
      }, null, 2));

      // 10. create exactly one order
      const appliedSubscriptionId = (engineResult.subscriptionUpdates && subscription) ? subscription.id : undefined;

      const newOrder = await placeOrder(
        user.id,
        orderStallId,
        engineResult.processedItems,
        freshOpFacts.operationalDate,
        pickupSlot,
        resolvedPaymentMethod,
        appliedSubscriptionId,
        undefined,
        activeBatchId
      );

      // Diagnostic log: [PLACE ORDER RPC SUCCESS]
      console.log('[PLACE ORDER RPC SUCCESS]', JSON.stringify({
        requestId: currentRequestId,
        orderId: newOrder.id,
      }, null, 2));

      // Diagnostic log: [CUSTOMER ORDER COMMITTED]
      console.log('[CUSTOMER ORDER COMMITTED]', JSON.stringify({
        requestId: currentRequestId,
        orderId: newOrder.id,
        stallId: orderStallId,
        pickupDate: freshOpFacts.operationalDate,
        status: newOrder.status || 'pending',
        paymentMethod: resolvedPaymentMethod,
        itemCount: totalCartCount,
        committedAt: new Date().toISOString(),
      }, null, 2));

      setCreatedOrderId(newOrder.id);
      createdOrderIdRef.current = newOrder.id;
      setBackendTotal(newOrder.total);
      hasSubmittedRef.current = true;

      await queryClient.invalidateQueries({ queryKey: queryKeys.orders.list(user.id) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.subscriptions.active(user.id) });

      // 11. handle payment-specific next steps
      if (resolvedPaymentMethod === PaymentMethod.UPI && !isFullyCoveredBySubscription) {
        setCheckoutState('ORDER_CREATED');

        if (selectedImage) {
          try {
            const storagePath = await uploadPaymentScreenshot(
              'orders',
              user.id,
              selectedImage.uri,
              selectedImage.mimeType
            );

            await submitProofMutation.mutateAsync({
              orderId: newOrder.id,
              screenshotPath: storagePath,
              mimeType: selectedImage.mimeType,
              size: selectedImage.size,
            });

            clearCart();
            setCheckoutState('COMPLETED');
            router.replace({ pathname: "/(tabs)/(orders)/confirmation", params: { orderId: newOrder.id } } as any);
          } catch (uploadErr) {
            console.error('[PROOF UPLOAD FAILURE AFTER ORDER CREATION]', uploadErr);
            alert("Your order was created, but the payment proof could not be uploaded. Retry the proof upload for this order.");
            setCheckoutState('AWAITING_PROOF');
          }
        } else {
          setCheckoutState('AWAITING_PROOF');
        }
      } else {
        clearCart();
        setCheckoutState('COMPLETED');
        router.replace({ pathname: "/(tabs)/(orders)/confirmation", params: { orderId: newOrder.id } } as any);
      }
    } catch (error: any) {
      console.error('[PLACE ORDER ERROR]', error);
      setCheckoutState('FAILED');

      let displayMessage = "We could not place your order. Please try again.";
      try {
        if (error.message) {
          const parsed = JSON.parse(error.message);
          if (parsed.code === 'BATCH_REQUIRED' || parsed.code === 'INSUFFICIENT_STOCK') {
            displayMessage = "Stock changed while you were checking out. Please review your cart.";
          } else if (parsed.code === 'WINDOW_MISMATCH' || parsed.code === 'BATCH_NOT_ACTIVE' || parsed.code === 'ORDERING_CLOSED') {
            displayMessage = "Ordering has closed for this menu.";
          } else if (parsed.message) {
            displayMessage = parsed.message;
          }
        } else {
          const paymentErr = parsePaymentBackendError(error);
          if (paymentErr.message) displayMessage = paymentErr.message;
        }
      } catch (parseErr) {
        const paymentErr = parsePaymentBackendError(error);
        if (paymentErr.message) displayMessage = paymentErr.message;
      }

      alert(displayMessage);
      setCheckoutState('REVIEW');
    } finally {
      submittingRef.current = false;
    }
  };

  const handleUploadProof = async () => {
    if (!user || !createdOrderId || !selectedImage) return;

    try {
      setCheckoutState('SUBMITTING');
      
      const storagePath = await uploadPaymentScreenshot(
        'orders',
        user.id,
        selectedImage.uri,
        selectedImage.mimeType
      );

      await submitProofMutation.mutateAsync({
        orderId: createdOrderId,
        screenshotPath: storagePath,
        mimeType: selectedImage.mimeType,
        size: selectedImage.size,
      });

      clearCart();
      setCheckoutState('COMPLETED');
      router.replace({ pathname: "/(tabs)/(orders)/confirmation", params: { orderId: createdOrderId } } as any);

    } catch (error) {
      console.error('[PROOF UPLOAD RETRY ERROR]', error);
      alert("Your order was created, but the payment proof could not be uploaded. Retry the proof upload for this order.");
      setCheckoutState('AWAITING_PROOF');
    }
  };

  const isLocked = checkoutState === 'SUBMITTING' || checkoutState === 'ORDER_CREATED' || checkoutState === 'COMPLETED';
  const isRecovering = checkoutState === 'AWAITING_PROOF' || checkoutState === 'ORDER_CREATED';
  const isUploading = checkoutState === 'SUBMITTING' && !!createdOrderId;

  return (
    <ScreenWrapper>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} disabled={isLocked && !isRecovering}>
          <Ionicons name="arrow-back" size={24} color={isLocked && !isRecovering ? Colors.textTertiary : Colors.textPrimary} />
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
                {isCartStaleOrLegacy && (
                  <View style={[styles.card, { borderColor: Colors.warning, borderWidth: 1, backgroundColor: Colors.warningLight }]}>
                    <Text style={[styles.cardTitle, { color: Colors.warning }]}>Cart Menu Changed</Text>
                    <Text style={{ fontSize: Typography.size.sm, color: Colors.textPrimary, marginBottom: Spacing.sm }}>
                      Your cart belongs to an earlier menu ({cartPickupDate ? formatFriendlyDate(cartPickupDate) : 'Earlier Menu'}), but the current menu is for {opFacts?.operationalDate ? formatFriendlyDate(opFacts.operationalDate) : 'Current Menu'}.
                    </Text>
                    <Text style={{ fontSize: Typography.size.sm, color: Colors.textSecondary, marginBottom: Spacing.base }}>
                      Your cart belongs to an earlier menu. Clear it and add items from the current menu before checking out.
                    </Text>
                    <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                      <Button
                        title="Clear Cart"
                        onPress={() => clearCart()}
                        variant="primary"
                        size="sm"
                      />
                      <Button
                        title="Go to Current Menu"
                        onPress={() => router.replace('/(tabs)/(home)' as any)}
                        variant="outline"
                        size="sm"
                      />
                    </View>
                  </View>
                )}

                <View style={[styles.card, isLocked && { opacity: 0.6 }]}>
                  <Text style={styles.cardTitle}>Expected Pickup Time</Text>
                  <View style={styles.chipContainer}>
                    {[
                      { label: "12:00–12:30", value: "12:00 PM - 12:30 PM" },
                      { label: "12:30–1:00", value: "12:30 PM - 01:00 PM" },
                      { label: "1:00–1:30", value: "01:00 PM - 01:30 PM" },
                      { label: "1:30–2:00", value: "01:30 PM - 02:00 PM" },
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
                            if (inventoryMode === 'LIVE_INVENTORY') {
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

            {paymentMode === 'FULLY_SUBSCRIPTION_COVERED' && !isRecovering && (
              <View style={[styles.card, { backgroundColor: Colors.primaryLight, borderColor: Colors.primary, borderWidth: 1 }, isLocked && { opacity: 0.6 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.xs }}>
                  <Ionicons name="shield-checkmark" size={22} color={Colors.primary} style={{ marginRight: Spacing.sm }} />
                  <Text style={[styles.cardTitle, { color: Colors.primaryDark, marginBottom: 0 }]}>Covered by your subscription</Text>
                </View>
                <Text style={{ fontSize: 14, color: Colors.textSecondary }}>0 additional payment required</Text>
              </View>
            )}

            {paymentMode !== 'FULLY_SUBSCRIPTION_COVERED' && !isRecovering && (
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
                        if (!isLocked && !isUpiDisabled) handleSelectPaymentMethod(p.key);
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
                {subscriptionCoveredAmount > 0 ? (
                  <>
                    <View style={styles.totalRow}>
                      <Text style={styles.totalLabel}>Order Total</Text>
                      <Text style={styles.totalVal}>{formatCurrency(grossOrderAmount)}</Text>
                    </View>
                    <View style={styles.totalRow}>
                      <Text style={[styles.totalLabel, { color: Colors.primary }]}>Subscription Covered</Text>
                      <Text style={[styles.totalVal, { color: Colors.primary }]}>-{formatCurrency(subscriptionCoveredAmount)}</Text>
                    </View>
                    <View style={[styles.totalRow, { borderTopWidth: 1, borderTopColor: Colors.borderLight, paddingTop: Spacing.sm }]}>
                      <Text style={styles.grandLabel}>Amount Payable</Text>
                      <Text style={styles.grandVal}>{formatCurrency(remainingPayableAmount)}</Text>
                    </View>
                  </>
                ) : (
                  <>
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
                  </>
                )}
              </View>
            )}

            {/* Stage 1: UPI Panel & Screenshot selection in REVIEW before Place Order */}
            {!isRecovering &&
              remainingPayableAmount > 0 &&
              payment === PaymentMethod.UPI &&
              paymentSettings && (
              <View style={{ marginTop: Spacing.sm, marginBottom: Spacing.base }}>
                <UpiPaymentPanel
                  amount={remainingPayableAmount}
                  recipientName={paymentSettings.recipientName}
                  upiId={paymentSettings.upiId}
                  qrImagePath={paymentSettings.qrImagePath}
                >
                  {remainingPayableAmount > 0 && payment === PaymentMethod.UPI && (
                    <PaymentScreenshotPicker
                      onImageSelected={setSelectedImage}
                      selectedImage={selectedImage}
                      isUploading={isUploading}
                    />
                  )}
                </UpiPaymentPanel>
              </View>
            )}

            {/* Stage 1: Order Creation Button */}
            {!isRecovering && (
              <Button
                title={placeOrderButtonTitle}
                onPress={handlePlaceOrder}
                fullWidth
                size="lg"
                loading={checkoutState === 'SUBMITTING' || isLoadingOp || isLoadingMeals || isLoadingSettings}
                disabled={isLocked || items.length === 0 || isLoadingOp || isLoadingMeals || isLoadingSettings || isCartStaleOrLegacy}
                style={{ marginBottom: Spacing.xl }}
              />
            )}

            {/* Stage 2: UPI Upload Flow (Order created but needs proof retry/submission) */}
            {(isRecovering) && payment === PaymentMethod.UPI && paymentSettings && (
              <View style={{ marginTop: Spacing.md }}>
                <UpiPaymentPanel
                  amount={remainingPayableAmount}
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
