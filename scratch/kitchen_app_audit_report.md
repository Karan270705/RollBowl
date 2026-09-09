# Kitchen App Multi-Stall Refactor - Audit Report

**Generated:** 2026-09-06T12:05:22.980Z  
**Migration 053 Status:** ✅ Successfully executed  
**Database Architecture:** Multi-stall with staff_assignments authorization

---

## Executive Summary

The Kitchen App currently uses `getPrimaryStallId()` pattern throughout, which:
- Queries the database on every service call: `.from('stalls').select('id').eq('is_active', true).limit(1).single()`
- Assumes single-stall operation
- Does not leverage the new `staff_assignments` table
- Has 72+ references to stall ID fetching and realtime

**Required Changes:**
- Create StallContext provider to fetch user's assigned stall(s) once on mount
- Update 9 service files to accept explicit `stallId` parameter
- Update all components to use StallContext
- Add stall filtering to realtime subscriptions
- Maintain backward compatibility for single-stall operators

---

## Detailed Audit

### 1. Service Layer Files Requiring Changes

#### ✅ `services/orders/index.ts`
- **Current:** Uses `getPrimaryStallId()` fallback in `fetchOrders()`
- **Status:** Already has `stallId?` parameter - PARTIAL ✓
- **Issue:** Still uses `getPrimaryStallId()` as fallback instead of requiring stallId
- **Fix:** Make `stallId` required, remove fallback

#### ✅ `services/menu/index.ts`
- **Current:** Exports `getPrimaryStallId()`, uses it in all functions
- **Functions using it:**
  - `getMenuForDate()`
  - `createMenuSchedule()`
  - `getAllMeals()`
  - `copyMenu()`
- **Fix:** Add required `stallId` parameter to all functions

#### ✅ `services/dashboard/index.ts`
- **Current:** Imports `getPrimaryStallId` from menu service
- **Functions using it:**
  - `fetchDashboardMetrics()`
  - `fetchOperationalReservationsDetailed()`
- **Fix:** Make `stallId` required in both functions

#### ✅ `services/inventory/index.ts`
- **Current:** Imports `getPrimaryStallId` from menu service
- **Functions using it:**
  - `fetchInventoryBatches()`
  - `createDraftInventoryBatch()`
  - `fetchWalkInSales()`
- **Fix:** Make `stallId` required in all functions

#### ✅ `services/subscriptions/index.ts`
- **Current:** Queries subscriptions without stall filtering
- **Functions:**
  - `fetchSubscribersList()` - Missing `.eq('stall_id', stallId)`
  - `fetchSubscriberDetails()` - Missing stall validation
- **Fix:** Add stall filtering to all subscription queries

#### ✅ `services/payments/index.ts`
- **Current:** Uses `getPrimaryStallId` from orders service
- **Functions:**
  - Payment proofs likely need stall context
- **Fix:** Review and add stallId where needed

#### ⚠️ `services/holidays/index.ts`
- **Current:** Not reviewed yet
- **Fix:** Audit for stall filtering needs

#### ⚠️ `services/auth/index.ts`
- **Current:** Not reviewed yet
- **Fix:** May not need changes (auth is global)

#### ⚠️ `services/reports/orderExport.ts`
- **Current:** Not reviewed yet
- **Fix:** Audit for stall filtering needs

---

### 2. Realtime Subscriptions Audit

**Search Pattern:** `supabase.channel(` or `.on('postgres_changes'`

**Expected locations:**
- Dashboard screen (orders realtime)
- Orders screen (order updates)
- Inventory screen (batch/movement updates)
- Subscriptions screen (purchase request updates)

**Required Changes:**
- Add `.filter('stall_id=eq.${stallId}')` to all operational table subscriptions
- Tables needing filtering:
  - `orders`
  - `menu_schedules`
  - `inventory_batches`
  - `inventory_movements`
  - `subscription_purchase_requests`
  - `payment_proofs`

---

### 3. Component Layer Dependencies

**Pattern:** Components using `getPrimaryStallId()` or service functions

**Affected Screens:**
- `app/dashboard` - Uses dashboard metrics, needs StallContext
- `app/orders` - Uses fetchOrders, needs StallContext
- `app/menu` - Uses menu services, needs StallContext
- `app/inventory` - Uses inventory services, needs StallContext
- `app/subscriptions` - Uses subscription services, needs StallContext
- `app/reports` - Likely uses filtered queries, needs StallContext

---

### 4. Authorization Validation

**New RLS Policies (from Migration 053):**
- `orders_staff_all` - Uses `is_staff_of_stall(stall_id)`
- `subscriptions_staff_all` - Uses `is_staff_of_stall(stall_id)`
- `menu_schedules_staff_all` - Uses `is_staff_of_stall(stall_id)`
- `inventory_batches_staff_all` - Uses `is_staff_of_stall(stall_id)`
- `payment_settings_staff_all` - Uses `is_staff_of_stall(stall_id)`
- `meals_staff_insert/update/delete` - Uses `is_staff_of_stall(stall_id)`

**Expected Behavior:**
- Kitchen staff without `staff_assignments` → RLS blocks all queries (returns 0 rows)
- Kitchen staff with assignment to Stall A → Can only query Stall A data
- Queries without stall filtering → Returns 0 rows (RLS prevents cross-stall leakage)

---

## Implementation Plan

### Phase 1: Create StallContext Provider ✅
**File:** `F:\RollBowl-Kitchen\src\contexts\StallContext.tsx`

**Responsibilities:**
1. Fetch authenticated user's `staff_assignments` on mount
2. Determine current operating stall:
   - 0 assignments → Show error (unauthorized)
   - 1 assignment → Use that stall
   - Multiple assignments → Use first (Phase 2.5 will add selector)
3. Provide `currentStallId` to all children
4. Handle loading/error states

### Phase 2: Update Service Layer ✅
**For each service file:**
1. Remove `getPrimaryStallId()` function or make it deprecated
2. Add required `stallId: string` parameter to all functions
3. Ensure all queries filter by `stallId`
4. Update TypeScript signatures

### Phase 3: Update Components ✅
**For each screen:**
1. Wrap app with `<StallContextProvider>`
2. Use `const { currentStallId } = useStallContext()` in components
3. Pass `stallId: currentStallId` to service functions
4. Update React Query keys to include `stallId`

### Phase 4: Update Realtime Subscriptions ✅
**For each realtime channel:**
1. Add stall filtering: `.filter('stall_id=eq.${stallId}')`
2. Ensure channels are recreated when stall changes (for Phase 2.5)

### Phase 5: Testing & Verification ✅
1. TypeScript compilation: `npx tsc --noEmit`
2. Test operator with single assignment
3. Test unauthorized user (no assignments)
4. Verify RLS prevents cross-stall access
5. Test all CRUD operations

---

## Risk Assessment

### High Risk
- ❌ Breaking existing single-stall operators if context not initialized
- ❌ RLS blocking legitimate queries if stallId missing
- ❌ Realtime subscriptions not receiving updates without filters

### Medium Risk
- ⚠️ TypeScript compilation errors from signature changes
- ⚠️ React Query cache invalidation issues
- ⚠️ Loading states not handled properly

### Low Risk
- ✓ Performance improvement (no more per-query stall lookups)
- ✓ Backward compatible (existing operators continue working)

---

## Estimated Scope

**Files to Create:** 1 (StallContext)  
**Files to Modify:** ~15-20  
**Service Functions to Update:** ~25  
**Components to Update:** ~10  
**Realtime Channels to Update:** ~5  

**Estimated Time:** 2-3 hours for full implementation + testing

---

## Next Steps

1. ✅ Review and approve audit report
2. Create StallContext provider
3. Update service layer (orders → menu → dashboard → inventory → subscriptions)
4. Update components
5. Update realtime subscriptions
6. Run TypeScript compilation
7. Test with operator account
8. Document breaking changes

---

## Notes

- Keep `getPrimaryStallId()` as deprecated helper for gradual migration
- Maintain optional `stallId?` parameters during transition
- Add clear error messages for missing stall context
- Log stall context initialization for debugging
