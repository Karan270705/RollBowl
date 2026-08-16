import React, { useEffect } from 'react';
import { useRouter, useRootNavigationState } from 'expo-router';
import { useAuthStore, useIsAuthenticated, useAuthStatus } from '@/src/store';
import { StartupScreen } from '@/src/components/startup';
import { logStartupStage } from '@/src/utils/startupLogger';

/**
 * Entry point — auth redirect.
 * Controlled StartupScreen instead of null to prevent blank white screens.
 */
export default function EntryRedirect() {
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();
  const isAuthenticated = useIsAuthenticated();
  const isInitializing = useAuthStore((s) => s.isInitializing);
  const authStatus = useAuthStatus();
  const retryInitialization = useAuthStore((s) => s.retryInitialization);
  const logout = useAuthStore((s) => s.logout);

  useEffect(() => {
    if (isInitializing || authStatus === 'BOOTING' || authStatus === 'ERROR') return;
    if (!rootNavigationState?.key) return;

    const targetRoute = isAuthenticated ? '/(tabs)/(home)' : '/(auth)/login';
    logStartupStage('12_ROUTE_DECISION_COMPLETED', {
      pathname: targetRoute,
    });

    if (isAuthenticated) {
      router.replace('/(tabs)/(home)' as any);
    } else {
      router.replace('/(auth)/login' as any);
    }
  }, [isAuthenticated, isInitializing, authStatus, router, rootNavigationState?.key]);

  const handleRetry = () => {
    retryInitialization();
  };

  const handleSignOut = () => {
    logout();
    router.replace('/(auth)/login' as any);
  };

  if (authStatus === 'ERROR') {
    return (
      <StartupScreen
        error={true}
        onRetry={handleRetry}
        onSignOut={handleSignOut}
        showSignOut={true}
      />
    );
  }

  return <StartupScreen />;
}

