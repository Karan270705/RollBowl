import React, { useEffect } from 'react';
import { supabase } from '@/src/lib/supabase';
import { useAuthStore } from '@/src/store';
import { fetchUserProfile } from '@/src/services/auth';
import { useQueryClient } from '@tanstack/react-query';

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const setSession = useAuthStore((s) => s.setSession);
  const setInitializing = useAuthStore((s) => s.setInitializing);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        fetchUserProfile(session.user.id)
          .then((user) => {
            if (!user) {
              console.warn('Profile missing. Clearing stale session.');
              supabase.auth.signOut();
              setSession(null, null);
              queryClient.clear();
            } else {
              setSession(session, user);
            }
          })
          .catch((error) => {
            console.error('Error fetching user profile:', error);
            setSession(session, null);
          })
          .finally(() => {
            setInitializing(false);
          });
      } else {
        setSession(null, null);
        queryClient.clear();
        setInitializing(false);
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session) {
        try {
          const user = await fetchUserProfile(session.user.id);
          if (!user) {
            console.warn('Profile missing. Clearing stale session.');
            await supabase.auth.signOut();
            setSession(null, null);
            queryClient.clear();
          } else {
            setSession(session, user);
          }
        } catch (error) {
          console.error('Error fetching user profile:', error);
          setSession(session, null);
        }
      } else {
        setSession(null, null);
        queryClient.clear();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [setSession, setInitializing]);

  return <>{children}</>;
}
