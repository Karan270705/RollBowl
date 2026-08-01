/**
 * Availability Resolver for RollBowl Customer App
 * 
 * Implements strict separation of Menu Publication and Inventory Tracking:
 * - A published menu must be visible and orderable even when no inventory batch exists.
 * - Inventory is used to track and limit quantities only when an active inventory batch has been created.
 */

export type InventoryMode = 'UNTRACKED' | 'LIVE_INVENTORY';

export interface ResolveCustomerMealAvailabilityInput {
  mealId: string;
  serviceDate?: string;
  isPublished: boolean;
  mealIsAvailable: boolean;
  inventoryMode: InventoryMode;
  customerAvailable: number | null | undefined;
  activeBatchId?: string | null;
  canPlaceOrders: boolean;
  logDiagnostic?: boolean;
}

export interface CustomerMealAvailabilityResult {
  canAdd: boolean;
  isSoldOut: boolean;
  reason: string | null;
  inventoryMode: InventoryMode;
  availableQuantity: number | null;
}

/**
 * Resolves availability for a meal on the customer side across Menu Cards, Catalog, Meal Details, and Cart.
 */
export function resolveCustomerMealAvailability(
  input: ResolveCustomerMealAvailabilityInput
): CustomerMealAvailabilityResult {
  let canAdd = false;
  let isSoldOut = false;
  let reason: string | null = null;
  let availableQuantity: number | null = null;

  // 1. Check Menu Publication Layer
  if (!input.isPublished) {
    canAdd = false;
    isSoldOut = false;
    reason = 'Not available today';
    availableQuantity = null;
  }
  // 2. Check Base Meal Availability Layer
  else if (!input.mealIsAvailable) {
    canAdd = false;
    isSoldOut = false;
    reason = 'Currently unavailable';
    availableQuantity = null;
  }
  // 3. Check Operational Window Layer
  else if (!input.canPlaceOrders) {
    canAdd = false;
    isSoldOut = false;
    reason = 'Ordering is closed';
    availableQuantity = null;
  }
  // 4. Check Inventory Layer based on explicit InventoryMode
  else if (input.inventoryMode === 'UNTRACKED') {
    // No active batch exists for this stall/date -> published menu meals remain orderable
    canAdd = true;
    isSoldOut = false;
    reason = null;
    availableQuantity = null;
  }
  // 5. LIVE_INVENTORY mode
  else {
    // Active batch exists -> customer availability comes from batch item
    if (input.customerAvailable === null || input.customerAvailable === undefined) {
      // Configuration mismatch: active batch exists but this meal is missing from the batch
      canAdd = false;
      isSoldOut = false;
      reason = 'Not loaded in live stock';
      availableQuantity = null;
    } else if (input.customerAvailable <= 0) {
      // Zero quantity means sold out
      canAdd = false;
      isSoldOut = true;
      reason = 'Sold Out';
      availableQuantity = 0;
    } else {
      // Available with stock
      canAdd = true;
      isSoldOut = false;
      reason = null;
      availableQuantity = input.customerAvailable;
    }
  }

  const result: CustomerMealAvailabilityResult = {
    canAdd,
    isSoldOut,
    reason,
    inventoryMode: input.inventoryMode,
    availableQuantity,
  };

  // Customer-side diagnostic log
  if (__DEV__ && input.logDiagnostic) {
    console.log('[CUSTOMER MEAL AVAILABILITY]', {
      mealId: input.mealId,
      serviceDate: input.serviceDate ?? '',
      published: input.isPublished,
      mealEnabled: input.mealIsAvailable,
      activeBatchId: input.activeBatchId ?? null,
      inventoryRowFound: input.customerAvailable !== null && input.customerAvailable !== undefined,
      inventoryMode: input.inventoryMode,
      customerAvailable: input.customerAvailable ?? null,
      canAdd: result.canAdd,
      reason: result.reason,
    });
  }

  return result;
}
