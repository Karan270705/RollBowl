import { Subscription, SubscriptionPlan, CartItem, OrderItem } from '@/src/types/models';

export interface ProcessedItem {
  meal: CartItem['meal'];
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  specialInstructions?: string;
  subscriptionId?: string;
  creditsUsed?: number;
}

export interface EngineResult {
  processedItems: ProcessedItem[];
  subscriptionUpdates: {
    lastUsageDate: string;
    dailyCreditsUsed: number;
    consumedMeals: number;
    remainingMeals: number;
  } | null;
  newSubtotal: number;
}

/**
 * Executes the core subscription consumption rules against a cart.
 * Credits are consumed strictly per quantity in cart-order.
 */
export function processSubscription(
  cart: CartItem[],
  subscription: Subscription | null,
  plan: SubscriptionPlan | null,
  todayString: string // e.g. '2026-07-02'
): EngineResult {
  
  let newSubtotal = 0;
  const processedItems: ProcessedItem[] = [];

  // If no active sub or missing plan, everything is charged normally
  if (!subscription || !plan || subscription.status !== 'active' || subscription.remainingMeals <= 0) {
    cart.forEach(item => {
      const price = item.meal.price;
      processedItems.push({
        meal: item.meal,
        quantity: item.quantity,
        unitPrice: price,
        totalPrice: price * item.quantity,
        specialInstructions: item.specialInstructions,
      });
      newSubtotal += price * item.quantity;
    });
    return { processedItems, subscriptionUpdates: null, newSubtotal };
  }

  // 1. Daily Reset Logic
  let dailyUsed = subscription.dailyCreditsUsed;
  if (!subscription.lastUsageDate || subscription.lastUsageDate < todayString) {
    dailyUsed = 0;
  }

  // 2. Calculate Available Credits
  let availableDaily = Math.min(
    subscription.remainingMeals,
    subscription.mealsPerDay - dailyUsed
  );

  let totalCreditsConsumed = 0;

  // 3. Process Cart Items sequentially
  cart.forEach(item => {
    const category = item.meal.category;
    const creditCostPerUnit = plan.categoryCreditCosts[category];

    // If item category is not eligible for this plan, charge normally
    if (creditCostPerUnit === undefined) {
      const price = item.meal.price;
      processedItems.push({
        meal: item.meal,
        quantity: item.quantity,
        unitPrice: price,
        totalPrice: price * item.quantity,
        specialInstructions: item.specialInstructions,
      });
      newSubtotal += price * item.quantity;
      return;
    }

    // Determine how many units of this item we can cover
    let coveredQuantity = 0;
    while (coveredQuantity < item.quantity && availableDaily >= creditCostPerUnit) {
      coveredQuantity++;
      availableDaily -= creditCostPerUnit;
      totalCreditsConsumed += creditCostPerUnit;
    }

    const uncoveredQuantity = item.quantity - coveredQuantity;

    // Create the covered order item
    if (coveredQuantity > 0) {
      processedItems.push({
        meal: item.meal,
        quantity: coveredQuantity,
        unitPrice: 0,
        totalPrice: 0,
        specialInstructions: item.specialInstructions,
        subscriptionId: subscription.id,
        creditsUsed: coveredQuantity * creditCostPerUnit,
      });
    }

    // Create the uncovered order item
    if (uncoveredQuantity > 0) {
      const price = item.meal.price;
      processedItems.push({
        meal: item.meal,
        quantity: uncoveredQuantity,
        unitPrice: price,
        totalPrice: price * uncoveredQuantity,
        specialInstructions: item.specialInstructions,
      });
      newSubtotal += price * uncoveredQuantity;
    }
  });

  // 4. Return Updates
  let subscriptionUpdates = null;
  if (totalCreditsConsumed > 0) {
    subscriptionUpdates = {
      lastUsageDate: todayString,
      dailyCreditsUsed: dailyUsed + totalCreditsConsumed,
      consumedMeals: subscription.consumedMeals + totalCreditsConsumed,
      remainingMeals: subscription.remainingMeals - totalCreditsConsumed,
    };
  }

  return { processedItems, subscriptionUpdates, newSubtotal };
}
