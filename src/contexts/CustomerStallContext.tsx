import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useActiveStalls, useUserPreferredStall, useUpdatePreferredStall, useStallById } from '@/src/hooks';
import { useUser } from '@/src/store';
import { Stall } from '@/src/types/models';

interface CustomerStallContextValue {
  selectedStall: Stall | null;
  selectedStallId: string | null;
  availableStalls: Stall[];
  isLoading: boolean;
  selectStall: (stallId: string) => Promise<void>;
  error: Error | null;
}

const CustomerStallContext = createContext<CustomerStallContextValue | undefined>(undefined);

export function CustomerStallProvider({ children }: { children: ReactNode }) {
  const user = useUser();
  const { data: availableStalls = [], isLoading: isLoadingStalls } = useActiveStalls(user?.collegeId);
  const { data: preferredStallId, isLoading: isLoadingPreferred } = useUserPreferredStall(user?.id);
  const updatePreferredMutation = useUpdatePreferredStall();

  const [selectedStallId, setSelectedStallId] = useState<string | null>(null);
  const { data: selectedStall, isLoading: isLoadingStall } = useStallById(selectedStallId);

  // Initialize selected stall on mount or when user/stalls change
  useEffect(() => {
    if (isLoadingStalls || isLoadingPreferred || !availableStalls.length) {
      return;
    }

    // If already selected and still valid, keep it
    if (selectedStallId && availableStalls.some(s => s.id === selectedStallId)) {
      return;
    }

    // Priority 1: Use user's preferred stall if valid
    if (preferredStallId && availableStalls.some(s => s.id === preferredStallId)) {
      console.log('[CustomerStallContext] Using preferred stall:', preferredStallId);
      setSelectedStallId(preferredStallId);
      return;
    }

    // Priority 2: Fallback to first available stall
    const firstStall = availableStalls[0];
    if (firstStall) {
      console.log('[CustomerStallContext] Fallback to first available stall:', firstStall.id);
      setSelectedStallId(firstStall.id);
    }
  }, [availableStalls, preferredStallId, selectedStallId, isLoadingStalls, isLoadingPreferred]);

  const selectStall = async (stallId: string) => {
    // Verify stall exists and is active
    const stall = availableStalls.find(s => s.id === stallId);
    if (!stall) {
      throw new Error('Selected stall is not available');
    }

    console.log('[CustomerStallContext] Stall selected:', stallId, stall.name);
    setSelectedStallId(stallId);

    // Persist to user preferences
    if (user?.id) {
      try {
        await updatePreferredMutation.mutateAsync({
          userId: user.id,
          stallId
        });
        console.log('[CustomerStallContext] Preferred stall updated in DB');
      } catch (error) {
        console.error('[CustomerStallContext] Failed to update preferred stall:', error);
        // Don't throw - the stall is still selected in local state
      }
    }
  };

  const isLoading = isLoadingStalls || isLoadingPreferred || isLoadingStall;

  return (
    <CustomerStallContext.Provider
      value={{
        selectedStall,
        selectedStallId,
        availableStalls,
        isLoading,
        selectStall,
        error: null,
      }}
    >
      {children}
    </CustomerStallContext.Provider>
  );
}

export function useCustomerStall() {
  const context = useContext(CustomerStallContext);
  if (context === undefined) {
    throw new Error('useCustomerStall must be used within CustomerStallProvider');
  }
  return context;
}
