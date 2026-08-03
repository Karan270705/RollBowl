import React, { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useAuthStore, useIsAuthenticated, useAuthStatus } from '@/src/store';
import { StartupScreen } from '@/src/components/startup';
import { logStartupStage } from '@/src/utils/startupLogger';

/**
 * Entry point — auth redirect.
 * Controlled StartupScreen instead of null to prevent blank white screens.
 */
export default function EntryRedirect() {
  const router = useRouter();
  const isAuthenticated = useIsAuthenticated();
  const isInitializing = useAuthStore((s) => s.isInitializing);
  const authStatus = useAuthStatus();
  const setAuthError = useAuthStore((s) => s.setAuthError);
  const setInitializing = useAuthStore((s) => s.setInitializing);
  const logout = useAuthStore((s) => s.logout);

  useEffect(() => {
    if (isInitializing || authStatus === 'BOOTING' || authStatus === 'ERROR') return;

    const targetRoute = isAuthenticated ? '/(tabs)/(home)' : '/(auth)/login';
    logStartupStage('12_ROUTE_DECISION_COMPLETED', {
      pathname: targetRoute,
    });

    const timer = setTimeout(() => {
      if (isAuthenticated) {
        router.replace('/(tabs)/(home)' as any);
      } else {
        router.replace('/(auth)/login' as any);
      }
    }, 10);
    return () => clearTimeout(timer);
  }, [isAuthenticated, isInitializing, authStatus, router]);

  const handleRetry = () => {
    setAuthError(null);
    setInitializing(true);
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

