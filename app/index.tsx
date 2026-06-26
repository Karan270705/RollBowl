import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useAuthStore, useIsAuthenticated } from '@/src/store';

/**
 * Entry point — auth redirect.
 * No UI. Routes to auth flow or main app based on auth state.
 */
export default function EntryRedirect() {
  const router = useRouter();
  const isAuthenticated = useIsAuthenticated();
  const isInitializing = useAuthStore((s) => s.isInitializing);

  useEffect(() => {
    if (isInitializing) return;

    const timer = setTimeout(() => {
      if (isAuthenticated) {
        router.replace('/(tabs)/(home)' as any);
      } else {
        router.replace('/(auth)/login' as any);
      }
    }, 100); // Small delay for navigation readiness
    return () => clearTimeout(timer);
  }, [isAuthenticated, isInitializing]);

  return null; // No UI — splash screen stays visible
}
