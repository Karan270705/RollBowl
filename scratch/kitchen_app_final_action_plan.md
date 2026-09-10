# Kitchen App Multi-Stall - Final Action Plan

**Generated:** 2026-09-09T15:25:03Z  
**Status:** Phase 2.5 Complete ✅ | Final Review & Testing Needed  
**Estimated Time to Production:** 2-3 hours

---

## ✅ What's DONE (Phase 1, 2, 2.5)

### 1. StallContext Provider - COMPLETE
- ✅ Created `src/contexts/StallContext.tsx`
- ✅ SecureStore persistence implemented
- ✅ Deterministic fallback (alphabetical sort)
- ✅ `switchStall()` API with validation
- ✅ Logout isolation (clears context + SecureStore)
- ✅ Wrapped in `app/(app)/_layout.tsx`

### 2. Service Layer - COMPLETE
All services updated to require explicit `stallId`:
- ✅ `src/services/orders/index.ts`
- ✅ `src/services/menu/index.ts`
- ✅ `src/services/dashboard/index.ts`
- ✅ `src/services/inventory/index.ts`
- ✅ `src/services/subscriptions/index.ts`
- ✅ `src/services/holidays/index.ts`

### 3. StallSelector UI - COMPLETE
- ✅ Created `src/components/stall/StallSelector.tsx`
- ✅ Integrated in Dashboard header
- ✅ Native Modal implementation (no extra deps)
- ✅ TypeScript compilation passes

### 4. Core Hooks Integration - COMPLETE
- ✅ `src/hooks/useOperationalContext.ts` - Uses `useCurrentStallId()`
- ✅ `src/hooks/useHolidays.ts` - Uses `useCurrentStallId()`
- ✅ `src/hooks/useInventory.ts` - Uses `useCurrentStallId()`

### 5. Realtime Subscriptions - VERIFIED ✅
**Dashboard Realtime (`useDashboardRealtime.ts`):**
- ✅ Orders: `filter: 'stall_id=eq.${stallId}'` ✓
- ✅ Order items: No filter needed (joins to orders via order_id)
- ✅ Inventory movements: No filter needed (filtered by date context)

**Inventory Realtime (`useInventory.ts`):**
- ✅ Inventory batches: `filter: 'stall_id=eq.${stallId}'` ✓
- ✅ Orders: `filter: 'stall_id=eq.${stallId}'` ✓

**Payments Realtime (`usePayments.ts`):**
- 🔍 Needs verification (see below)

---

## 🔍 NEEDS VERIFICATION (30 minutes)

### 1. Payment Proofs Realtime Filtering
**File:** `src/hooks/usePayments.ts`

**Action Required:**
```bash
cd "F:/RollBowl-Kitchen"
# Read the file to check if payment_proofs realtime has stall filtering
cat src/hooks/usePayments.ts
```

**Expected Fix (if needed):**
```typescript
// Should have:
.on('postgres_changes', {
  event: '*',
  schema: 'public',
  table: 'payment_proofs',
  filter: `stall_id=eq.${stallId}` // ← Must include this
})
```

### 2. Additional Screens Using StallContext
**Files to Verify:**

#### ✅ Already Integrated:
- `app/(app)/(dashboard)/index.tsx` ✓
- `app/(app)/(orders)/index.tsx` ✓
- `app/(app)/(menu)/index.tsx` ✓ (indirect via hooks)
- `app/(app)/(inventory)/[id].tsx` ✓
- `app/(app)/(subscriptions)/index.tsx` ✓

#### 🔍 Need Manual Check:
1. **`app/(app)/(inventory)/create.tsx`**
   - Should use `useCurrentStallId()` when creating draft batch
   
2. **`app/(app)/(inventory)/index.tsx`**
   - Should use `useOperationalContext()` for stallId

3. **`app/(app)/(more)/export.tsx`**
   - Should scope exports to current stall

4. **`app/(app)/(dashboard)/reservations.tsx`**
   - Should use `useOperationalContext()` for stallId

5. **`app/(app)/(subscriptions)/[id].tsx`**
   - Should use `useCurrentStallId()` for subscription details

**Verification Script:**
```bash
cd "F:/RollBowl-Kitchen"
# Check each file for stall context usage
grep -n "useCurrentStallId\|useStallContext\|useOperationalContext" \
  app/\(app\)/\(inventory\)/create.tsx \
  app/\(app\)/\(inventory\)/index.tsx \
  app/\(app\)/\(more\)/export.tsx \
  app/\(app\)/\(dashboard\)/reservations.tsx \
  app/\(app\)/\(subscriptions\)/\[id\].tsx
```

---

## 🧪 TESTING CHECKLIST (2-3 hours)

### Pre-Deployment Testing

#### 1. TypeScript Compilation ✅
```bash
cd "F:/RollBowl-Kitchen"
npx tsc --noEmit
```
**Status:** Reported passing ✅

#### 2. Functional Testing - Single Stall Operator
**Test Account:** Kitchen staff assigned to ONE stall

**Tests:**
- [ ] Login successful
- [ ] StallContext loads single stall automatically
- [ ] StallSelector shows stall name (non-interactive)
- [ ] Dashboard loads metrics for correct stall
- [ ] Orders screen shows only current stall's orders
- [ ] Menu management works for current stall
- [ ] Inventory operations scoped to current stall
- [ ] Holidays screen works
- [ ] Export screen generates report for current stall
- [ ] Realtime updates work (create test order in customer app)
- [ ] Logout clears context and SecureStore

#### 3. Functional Testing - Multi-Stall Operator
**Test Account:** Kitchen staff assigned to MULTIPLE stalls

**Tests:**
- [ ] Login successful
- [ ] StallContext loads first stall (alphabetical)
- [ ] StallSelector is interactive (tappable)
- [ ] Tap selector → modal opens with all assigned stalls
- [ ] Select different stall → context switches
- [ ] Dashboard reloads with new stall's metrics
- [ ] Orders screen updates to new stall
- [ ] Menu screen loads new stall's menu
- [ ] SecureStore persists selection
- [ ] Close app → reopen → selected stall remembered
- [ ] Switch back to first stall → works correctly
- [ ] Realtime updates filtered by current stall
- [ ] Logout clears context and SecureStore

#### 4. Security Testing - Unauthorized User
**Test Account:** User with NO staff_assignments

**Tests:**
- [ ] Login successful
- [ ] StallContext shows error: "No stall assigned"
- [ ] Dashboard shows error screen
- [ ] Cannot access any operational screens
- [ ] Logout works

#### 5. Cross-Stall Isolation Testing
**Requires:** Two test operators on different stalls

**Tests:**
- [ ] Operator A cannot see Operator B's orders
- [ ] Operator A cannot see Operator B's inventory
- [ ] Operator A cannot edit Operator B's menu
- [ ] Realtime updates don't leak between stalls
- [ ] RLS blocks cross-stall queries in database

#### 6. Edge Cases
- [ ] Stall deactivated while operator using app → should show error
- [ ] Staff assignment revoked while app open → refetch shows error
- [ ] Network offline → graceful error handling
- [ ] Switch stalls rapidly → no race conditions
- [ ] App backgrounded during stall switch → resumes correctly

---

## 🚀 DEPLOYMENT CHECKLIST

### 1. Code Review
- [ ] Review all service layer changes
- [ ] Review StallContext implementation
- [ ] Review realtime subscription filters
- [ ] Review component integrations

### 2. Database Migration
**File:** `supabase/migrations/053_multi_stall_architecture.sql`

**Actions:**
```bash
cd "F:/RollBowl"
# Review migration
cat supabase/migrations/053_multi_stall_architecture.sql

# Deploy to staging first
supabase db push --db-url <STAGING_URL>

# Verify RLS policies
psql <STAGING_URL> -c "SELECT * FROM pg_policies WHERE tablename = 'orders';"

# Test with staging Kitchen app
# ... run full test suite ...

# Deploy to production
supabase db push --db-url <PRODUCTION_URL>
```

### 3. App Deployment
```bash
cd "F:/RollBowl-Kitchen"

# Build production Android APK
eas build --platform android --profile production

# Or internal testing
eas build --platform android --profile preview

# Deploy to Play Store internal testing
eas submit --platform android
```

### 4. Rollback Plan
**If issues found in production:**

```sql
-- Rollback RLS policies (revert to single-stall mode)
-- Keep staff_assignments table but disable new policies
-- Re-enable old policies

-- Emergency: Allow all queries temporarily
ALTER POLICY orders_staff_all ON orders USING (true);
```

---

## 📝 POST-DEPLOYMENT MONITORING

### 1. Error Monitoring
**Watch for:**
- StallContext errors (no assignments found)
- RLS policy blocks (unauthorized queries)
- Realtime subscription failures
- Cross-stall data leakage

### 2. User Feedback
**Gather feedback on:**
- Stall selector usability
- Performance (query speed)
- Multi-stall workflow clarity
- Any data inconsistencies

### 3. Analytics
**Track:**
- % of operators with multiple stalls
- Stall switching frequency
- StallContext load time
- Query performance by stall count

---

## 🎯 SUCCESS CRITERIA

### Must Have (Blocker if Missing)
- [x] StallContext provider created
- [x] Service layer requires stallId
- [x] TypeScript compiles without errors
- [ ] All screens use StallContext or OperationalContext
- [ ] Realtime subscriptions filtered by stall
- [ ] RLS policies prevent cross-stall access
- [ ] Single-stall operators work without issues
- [ ] Multi-stall operators can switch stalls
- [ ] Unauthorized users cannot access data

### Nice to Have (Future Enhancements)
- [ ] Stall switching animation
- [ ] Stall-specific color themes
- [ ] Performance metrics per stall
- [ ] Multi-stall comparison dashboard
- [ ] Stall favorites/pinning

---

## ⏱️ TIME ESTIMATES

### Verification Phase (30 min)
- Check payment proofs realtime filtering: 10 min
- Verify remaining 5 screens use context: 20 min

### Testing Phase (2-3 hours)
- Single-stall operator testing: 30 min
- Multi-stall operator testing: 45 min
- Security/isolation testing: 30 min
- Edge cases: 30 min
- Regression testing: 30 min

### Deployment (30 min)
- Deploy migration to staging: 10 min
- Deploy migration to production: 10 min
- Build and deploy app: 10 min

**Total: 3-4 hours to full production**

---

## 🐛 KNOWN ISSUES / NOTES

### Resolved
- ✅ getPrimaryStallId() deprecated (backward compatible)
- ✅ TypeScript compilation errors fixed
- ✅ StallContext logout isolation implemented

### Open Questions
- ❓ Should we add stall switching analytics?
- ❓ Should stall preference persist per user account (backend) vs per device (SecureStore)?
- ❓ Do we need stall-level permissions (kitchen vs manager roles)?

### Future Work
- Add stall performance comparison dashboard
- Add multi-stall bulk operations (e.g., copy menu to all stalls)
- Add stall-level staff management UI
- Add stall onboarding flow

---

## 📞 CONTACTS & RESOURCES

**Documentation:**
- Architecture Audit: `scratch/kitchen_app_audit_report.md`
- Implementation Log: `scratch/kitchen_app_implementation_progress.md`
- Migration Script: `supabase/migrations/053_multi_stall_architecture.sql`

**Key Files:**
- StallContext: `F:/RollBowl-Kitchen/src/contexts/StallContext.tsx`
- StallSelector: `F:/RollBowl-Kitchen/src/components/stall/StallSelector.tsx`
- OperationalContext: `F:/RollBowl-Kitchen/src/hooks/useOperationalContext.ts`

**Git Status:**
```bash
cd "F:/RollBowl"
git status
# M package-lock.json
# M package.json
# ?? scratch/*.md
# ?? supabase/migrations/053_multi_stall_architecture.sql
```

---

## ✅ NEXT IMMEDIATE ACTION

**Start Here (30 minutes):**

1. **Verify Payment Proofs Filtering**
   ```bash
   cd "F:/RollBowl-Kitchen"
   cat src/hooks/usePayments.ts | grep -A 10 "postgres_changes"
   ```

2. **Check Remaining 5 Screens**
   ```bash
   # Run verification script
   grep -n "useCurrentStallId\|useStallContext\|useOperationalContext" \
     app/\(app\)/\(inventory\)/create.tsx \
     app/\(app\)/\(inventory\)/index.tsx \
     app/\(app\)/\(more\)/export.tsx \
     app/\(app\)/\(dashboard\)/reservations.tsx \
     app/\(app\)/\(subscriptions\)/\[id\].tsx
   ```

3. **If All Clear → Start Testing**
   - Create test accounts (single/multi-stall operators)
   - Run functional test suite
   - Document any issues found

4. **If Issues Found → Fix First**
   - Add missing stall context usage
   - Add missing realtime filters
   - Re-run TypeScript compilation

---

**Report End** | Ready for final verification and testing phase 🚀
