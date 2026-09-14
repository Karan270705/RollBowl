import React, { useEffect, useRef } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import * as SplashScreen from 'expo-splash-screen';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppConfig } from '@/src/constants/config';
import { useAuthStore, useUser } from '@/src/store';
import { SessionProvider } from '@/src/components/providers/SessionProvider';
import { AuthDeepLinkProvider } from '@/src/components/providers/AuthDeepLinkProvider';
import { CustomerStallProvider, useCustomerStall } from '@/src/contexts/CustomerStallContext';
import { StartupScreen, RootErrorBoundary } from '@/src/components/startup';
import { logStartupStage } from '@/src/utils/startupLogger';
import { StallSelectionModal } from '@/src/components/StallSelectionModal';
logStartupStage('02_SPLASH_PREVENTION_COMPLETED');
SplashScreen.preventAutoHideAsync().catch(() => {});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: AppConfig.QUERY_STALE_TIME || 1000 * 60 * 5,
      gcTime: 1000 * 60 * 15,
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
  },
});

export default function RootLayout() {
  logStartupStage('01_ROOT_MOUNTED');
  logStartupStage('03_FONT_LOADING_STARTED');

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  if (fontsLoaded) {
    logStartupStage('04_FONT_LOADING_COMPLETED');
  }

  const isInitializing = useAuthStore((s) => s.isInitializing);
  const splashHiddenRef = useRef(false);

  useEffect(() => {
    const hideSplashSafely = async () => {
      if (splashHiddenRef.current) return;
      splashHiddenRef.current = true;
      logStartupStage('13_SPLASH_HIDE_REQUESTED');
      try {
        await SplashScreen.hideAsync();
      } catch {
        // Ignored
      }
    };

    if (fontsLoaded && !isInitializing) {
      hideSplashSafely();
    }

    // Safety fallback: prevent splash from hanging permanently if initialization takes longer
    const timer = setTimeout(() => {
      hideSplashSafely();
    }, 4000);

    return () => clearTimeout(timer);
  }, [fontsLoaded, isInitializing]);

  if (!fontsLoaded) {
    // Never return null: if native splash hides early, display controlled StartupScreen
    return <StartupScreen />;
  }

function AppContent() {
  const user = useUser();
  const { selectedStall, availableStalls, isLoading, selectStall } = useCustomerStall();
  const [showMigrationModal, setShowMigrationModal] = React.useState(false);

  // Check if user needs stall selection (migration fallback)
  React.useEffect(() => {
    // Only check for logged-in customers
    if (!user || user.role !== 'customer') return;

    // Wait for loading to complete
    if (isLoading) return;

    // If no stall selected and stalls are available, show modal
    if (!selectedStall && availableStalls.length > 0) {
      console.log('[Migration] User has no preferred stall, showing selection modal');
      setShowMigrationModal(true);
    }
  }, [user, selectedStall, availableStalls, isLoading]);

  const handleMigrationStallSelection = async (stallId: string) => {
    try {
      await selectStall(stallId);
      setShowMigrationModal(false);
    } catch (error) {
      console.error('[Migration] Failed to set stall:', error);
      alert('Failed to set your preferred stall. Please try again.');
    }
  };

  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="(tabs)" />
      </Stack>

      <StallSelectionModal
        visible={showMigrationModal}
        stalls={availableStalls}
        isLoading={isLoading}
        onSelectStall={handleMigrationStallSelection}
        title="Welcome Back!"
        subtitle="We've updated the app! Please select your preferred food stall to continue."
        isRequired={true}
      />
    </>
  );
}

  return (
    <RootErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <AuthDeepLinkProvider>
            <CustomerStallProvider>
              <AppContent />
            </CustomerStallProvider>
          </AuthDeepLinkProvider>
        </SessionProvider>
      </QueryClientProvider>
    </RootErrorBoundary>
  );
}
