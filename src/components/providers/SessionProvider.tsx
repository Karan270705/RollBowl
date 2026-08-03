import React, { useEffect, useRef } from 'react';
import { supabase } from '@/src/lib/supabase';
import { useAuthStore } from '@/src/store';
import { fetchUserProfile } from '@/src/services/auth';
import { useQueryClient } from '@tanstack/react-query';
import { logStartupStage, logStartupError } from '@/src/utils/startupLogger';

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const setSession = useAuthStore((s) => s.setSession);
  const setInitializing = useAuthStore((s) => s.setInitializing);
  const setAuthError = useAuthStore((s) => s.setAuthError);
  const isInitialRestoreDone = useRef(false);

  useEffect(() => {
    let isMounted = true;
    logStartupStage('05_SESSION_RESTORATION_STARTED');

    // 8-second watchdog: never leave app stuck in BOOTING forever
    const watchdog = setTimeout(() => {
      if (!isInitialRestoreDone.current && isMounted) {
        const errMsg = 'Session restoration timed out after 8 seconds.';
        logStartupError('05_SESSION_RESTORATION', new Error(errMsg));
        setAuthError(errMsg);
      }
    }, 8000);

    // Initial session restoration via getSession()
    supabase.auth.getSession()
      .then(async ({ data: { session }, error }) => {
        if (!isMounted) return;
        if (error) {
          throw error;
        }
        logStartupStage('06_SESSION_RESTORATION_COMPLETED', {
          userId: session?.user?.id || null,
        });

        if (session) {
          logStartupStage('08_PROFILE_FETCH_STARTED', { userId: session.user.id });
          try {
            const user = await fetchUserProfile(session.user.id);
            if (!isMounted) return;
            logStartupStage('09_PROFILE_FETCH_COMPLETED', { userId: session.user.id });
            if (!user) {
              console.warn('Profile missing. Clearing stale session.');
              await supabase.auth.signOut();
              setSession(null, null);
              queryClient.clear();
            } else {
              setSession(session, user);
            }
          } catch (profileError) {
            if (!isMounted) return;
            logStartupError('08_PROFILE_FETCH', profileError, { userId: session.user.id });
            setSession(session, null);
          }
        } else {
          setSession(null, null);
          queryClient.clear();
        }
      })
      .catch((error) => {
        if (!isMounted) return;
        logStartupError('05_SESSION_RESTORATION', error);
        setAuthError(error?.message || 'Failed to restore authentication session.');
      })
      .finally(() => {
        if (!isMounted) return;
        isInitialRestoreDone.current = true;
        clearTimeout(watchdog);
        setInitializing(false);
      });

    // Listen for auth changes after initial boot
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!isMounted) return;
      // Ignore INITIAL_SESSION event so onAuthStateChange doesn't race getSession() on boot
      if (event === 'INITIAL_SESSION') {
        return;
      }
      if (session) {
        try {
          const user = await fetchUserProfile(session.user.id);
          if (!isMounted) return;
          if (!user) {
            console.warn('Profile missing. Clearing stale session.');
            await supabase.auth.signOut();
            setSession(null, null);
            queryClient.clear();
          } else {
            setSession(session, user);
          }
        } catch (error) {
          if (!isMounted) return;
          console.error('Error fetching user profile:', error);
          setSession(session, null);
        }
      } else {
        setSession(null, null);
        queryClient.clear();
      }
    });

    return () => {
      isMounted = false;
      clearTimeout(watchdog);
      subscription.unsubscribe();
    };
  }, []);

  return <>{children}</>;
}
