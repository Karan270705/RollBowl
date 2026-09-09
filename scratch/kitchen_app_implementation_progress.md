# Kitchen App Multi-Stall Refactor - Implementation Progress

**Last Updated:** 2026-09-06T12:33:25.353Z  
**Status:** Service Layer Complete ✅ | Components Pending ⏸️

---

## ✅ Completed Changes

### 1. StallContext Provider Created
**File:** `F:\RollBowl-Kitchen\src\contexts\StallContext.tsx`

**Features:**
- Fetches authenticated user's `staff_assignments` on mount
- Handles 0, 1, or multiple assignments
- Provides `currentStallId`, `currentStallName`, `assignments`
- Exports `useStallContext()` and `useCurrentStallId()` hooks
- Full error handling and loading states

### 2. Service Layer Updated

#### ✅ `services/orders/index.ts`
- Deprecated `getPrimaryStallId()` with warning
- Made `stallId` required in `FetchOrdersOptions`
- Removed fallback to `getPrimaryStallId()`

#### ✅ `services/menu/index.ts`
- Deprecated `getPrimaryStallId()` with warning
- Updated signatures:
  - `getMenuForDate(stallId, date)` - stallId first, required
  - `createMenuSchedule(stallId, date, ...)` - stallId first, required
  - `getAllMeals(stallId)` - required
  - `copyMenu(stallId, fromDate, toDate)` - stallId first, required
  - `getOperationalMenuStatus(stallId, date)` - stallId first, required

#### ✅ `services/dashboard/index.ts`
- Updated `fetchDashboardMetrics(stallId, calendarDate, ...)` - stallId first, required
- Added stall filter to subscriptions query: `.eq('stall_id', stallId)`
- Updated `useDashboardMetrics(stallId, ...)` - stallId first, required, enabled check
- Updated `fetchOperationalReservationsDetailed(stallId, preparationDate)` - stallId first
- Updated `useOperationalReservationsDetailed(stallId, ...)` - stallId first, enabled check

#### ✅ `services/inventory/index.ts`
- Updated `fetchInventoryBatches(stallId, date)` - stallId first, required
- Updated `createDraftInventoryBatch(stallId, ...)` - stallId first, required
- Note: `fetchWalkInSales()` already has required `stallId` parameter

#### ✅ `services/subscriptions/index.ts`
- Updated `fetchSubscribersList(stallId)` - required parameter
- Added stall filter: `.eq('stall_id', stallId)`
- Updated `useSubscribersList(stallId)` - required, enabled check

#### ✅ `services/holidays/index.ts`
- Updated `fetchHolidays(stallId)` - required
- Updated `addHoliday({ stallId, ... })` - stallId required in params
- Updated `getHolidayForDate(date, stallId)` - stallId required

#### ⚠️ `services/payments/index.ts`
- Not yet reviewed - needs audit for stall filtering

#### ⚠️ `services/reports/orderExport.ts`
- Not yet reviewed - likely needs stallId parameter

---

## ⏸️ Pending Changes

### 3. Component Layer Updates

**Need to:**
1. Find the app root and wrap with `<StallContextProvider>`
2. Update all screens to use `useStallContext()` or `useCurrentStallId()`
3. Pass `stallId` to all service function calls
4. Update React Query keys to include `stallId`

**Affected Screens/Components:**
- Dashboard screen
- Orders screen
- Menu screen
- Inventory screen
- Subscriptions screen
- Holidays screen
- Reports screen (if exists)

### 4. Realtime Subscriptions

**Need to:**
- Find all `supabase.channel()` or `.on('postgres_changes'` calls
- Add `.filter('stall_id=eq.${stallId}')` to operational tables

**Tables needing filtering:**
- `orders`
- `menu_schedules`
- `inventory_batches`
- `inventory_movements`
- `subscription_purchase_requests`

### 5. Testing & Verification

**Need to:**
- Run TypeScript compilation: `npx tsc --noEmit`
- Test with operator having 1 assignment
- Test unauthorized user (0 assignments)
- Verify RLS blocks cross-stall queries
- Test all CRUD operations

---

## Breaking Changes

### Service Function Signatures Changed

**Before:**
```typescript
fetchOrders({ date: '2026-09-06' })
getMenuForDate('2026-09-06')
getAllMeals()
fetchDashboardMetrics(calendarDate, operationalDate, preparationDate)
```

**After:**
```typescript
fetchOrders({ stallId: '...', date: '2026-09-06' })
getMenuForDate(stallId, '2026-09-06')
getAllMeals(stallId)
fetchDashboardMetrics(stallId, calendarDate, operationalDate, preparationDate)
```

### Optional Parameters Now Required

All service functions that previously had optional `stallId?: string` now require it as the first parameter.

---

## Migration Guide for Components

### Step 1: Wrap App Root

```typescript
import { StallContextProvider } from '@/src/contexts/StallContext';

export default function RootLayout() {
  return (
    <StallContextProvider>
      {/* existing app */}
    </StallContextProvider>
  );
}
```

### Step 2: Use Hook in Components

```typescript
import { useCurrentStallId } from '@/src/contexts/StallContext';

export default function OrdersScreen() {
  const stallId = useCurrentStallId();
  
  const { data: orders } = useQuery(
    ['orders', stallId, date],
    () => fetchOrders({ stallId, date }),
    { enabled: !!stallId }
  );
  
  // ...
}
```

### Step 3: Handle Loading/Error States

```typescript
import { useStallContext } from '@/src/contexts/StallContext';

export default function DashboardScreen() {
  const { currentStallId, isLoading, error } = useStallContext();
  
  if (isLoading) return <LoadingScreen />;
  if (error) return <ErrorScreen message={error} />;
  if (!currentStallId) return <ErrorScreen message="No stall assigned" />;
  
  // Use currentStallId safely
}
```

---

## Files Modified

**Created:**
- `F:\RollBowl-Kitchen\src\contexts\StallContext.tsx`

**Modified:**
- `F:\RollBowl-Kitchen\src\services\orders\index.ts`
- `F:\RollBowl-Kitchen\src\services\menu\index.ts`
- `F:\RollBowl-Kitchen\src\services\dashboard\index.ts`
- `F:\RollBowl-Kitchen\src\services\inventory\index.ts`
- `F:\RollBowl-Kitchen\src\services\subscriptions\index.ts`
- `F:\RollBowl-Kitchen\src\services\holidays\index.ts`

**Total:** 1 created, 6 modified

---

## Next Steps

1. ✅ **Service layer complete** - All major services updated
2. ⏸️ **Find app root** - Locate main layout/entry point
3. ⏸️ **Wrap with StallContextProvider**
4. ⏸️ **Update components** - Add useStallContext to screens
5. ⏸️ **Update realtime subscriptions** - Add stall filtering
6. ⏸️ **Run TypeScript check**
7. ⏸️ **Test with real operator account**

---

## Estimated Remaining Work

- **App root integration:** 15 minutes
- **Component updates:** 1-2 hours (8-10 screens)
- **Realtime subscriptions:** 30 minutes
- **Testing:** 30 minutes

**Total Remaining:** ~2.5-3 hours

---

## Notes

- `getPrimaryStallId()` kept as deprecated for gradual migration
- All service functions now require explicit `stallId`
- StallContext handles all assignment scenarios (0, 1, multiple)
- Phase 2.5 will add multi-stall selector UI
- Current implementation uses first assignment for multi-stall operators
