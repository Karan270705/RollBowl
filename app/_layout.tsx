import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import * as SplashScreen from 'expo-splash-screen';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppConfig } from '@/src/constants/config';
import { useAuthStore } from '@/src/store';
import { SessionProvider } from '@/src/components/providers/SessionProvider';
import { AuthDeepLinkProvider } from '@/src/components/providers/AuthDeepLinkProvider';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: AppConfig.QUERY_STALE_TIME,
      gcTime: AppConfig.QUERY_CACHE_TIME,
      retry: 2,
    },
  },
});

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  const isInitializing = useAuthStore((s) => s.isInitializing);

  useEffect(() => {
    if (fontsLoaded && !isInitializing) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, isInitializing]);

  if (!fontsLoaded) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <AuthDeepLinkProvider>
          <StatusBar style="dark" />
          <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)" options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen name="(tabs)" />
          </Stack>
        </AuthDeepLinkProvider>
      </SessionProvider>
    </QueryClientProvider>
  );
}
