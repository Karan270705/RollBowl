import React, { useEffect, useRef } from 'react';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { supabase } from '@/src/lib/supabase';

/**
 * Global Auth Deep Link Provider
 *
 * Mounted in app/_layout.tsx ABOVE all route screens.
 * Intercepts recovery deep links from both cold-start and warm-start scenarios,
 * establishes the Supabase recovery session, and THEN navigates to the reset screen.
 *
 * Supports:
 *   - Implicit flow: rollbowl://reset-password#access_token=...&refresh_token=...&type=recovery
 *   - PKCE flow:     rollbowl://reset-password?code=...
 */
export function AuthDeepLinkProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const lastProcessedUrl = useRef<string | null>(null);
  const processing = useRef(false);

  const handleRecoveryUrl = async (incomingUrl: string) => {
    // ── Duplicate protection ──────────────────────────────────
    if (!incomingUrl || incomingUrl === lastProcessedUrl.current || processing.current) {
      return;
    }

    // Only handle recovery-related URLs
    if (!incomingUrl.includes('reset-password') && !incomingUrl.includes('type=recovery')) {
      return;
    }

    processing.current = true;
    lastProcessedUrl.current = incomingUrl;

    try {
      // ── Check for URL-level errors from Supabase ─────────────
      const errorMatch = incomingUrl.match(/[?#&]error=([^&]*)/);
      const errorDescMatch = incomingUrl.match(/[?#&]error_description=([^&]*)/);
      if (errorMatch) {
        const errorMsg = decodeURIComponent(errorDescMatch?.[1] || errorMatch[1] || 'Unknown error');
        console.error('[AuthDeepLink] Recovery link error:', errorMsg);
        processing.current = false;
        return;
      }

      // ── Attempt 1: PKCE code (query parameter) ──────────────
      const codeMatch = incomingUrl.match(/[?&]code=([^&#]+)/);
      if (codeMatch) {
        const code = codeMatch[1];
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          console.error('[AuthDeepLink] PKCE exchange failed:', error.message);
          processing.current = false;
          return;
        }
        await verifyAndNavigate();
        return;
      }

      // ── Attempt 2: Implicit flow (hash fragment) ────────────
      const fragment = incomingUrl.includes('#') ? incomingUrl.split('#')[1] : null;
      if (fragment) {
        const params = new URLSearchParams(fragment);
        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');

        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (error) {
            console.error('[AuthDeepLink] setSession failed:', error.message);
            processing.current = false;
            return;
          }

          await verifyAndNavigate();
          return;
        }
      }
    } catch (err) {
      console.error('[AuthDeepLink] Unexpected error processing recovery URL');
    } finally {
      processing.current = false;
    }
  };

  const verifyAndNavigate = async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      router.replace('/(auth)/reset-password');
    } else {
      console.warn('[AuthDeepLink] Session not found after credential exchange');
    }
  };

  useEffect(() => {
    // ── Cold start: check initial URL ─────────────────────────
    Linking.getInitialURL().then((initialUrl) => {
      if (initialUrl) {
        handleRecoveryUrl(initialUrl);
      }
    });

    // ── Warm start: listen for incoming URLs ──────────────────
    const subscription = Linking.addEventListener('url', (event) => {
      handleRecoveryUrl(event.url);
    });

    return () => {
      subscription.remove();
    };
  }, []);

  return <>{children}</>;
}
