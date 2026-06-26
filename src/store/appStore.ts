import { create } from 'zustand';

/**
 * App-level state — city/college selection & onboarding.
 * Role selection removed — this is a customer-only app.
 * Shared backend roles are defined in enums.ts for schema compatibility.
 */
interface AppState {
  selectedCityId: string | null;
  selectedCollegeId: string | null;
  hasOnboarded: boolean;
  setCity: (cityId: string) => void;
  setCollege: (collegeId: string) => void;
  setOnboarded: (val: boolean) => void;
  resetApp: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  selectedCityId: 'city-1',
  selectedCollegeId: 'col-1',
  hasOnboarded: false,
  setCity: (selectedCityId) => set({ selectedCityId }),
  setCollege: (selectedCollegeId) => set({ selectedCollegeId }),
  setOnboarded: (hasOnboarded) => set({ hasOnboarded }),
  resetApp: () => set({ selectedCityId: null, selectedCollegeId: null, hasOnboarded: false }),
}));

export const useSelectedCity = () => useAppStore((s) => s.selectedCityId);
export const useSelectedCollege = () => useAppStore((s) => s.selectedCollegeId);
