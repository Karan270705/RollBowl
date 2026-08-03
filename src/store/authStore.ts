import { create } from 'zustand';
import { User } from '@/src/types/models';
import { Session } from '@supabase/supabase-js';
import { logStartupStage } from '@/src/utils/startupLogger';

export type AuthStatus = 'BOOTING' | 'AUTHENTICATED' | 'UNAUTHENTICATED' | 'ERROR';

interface AuthState {
  user: User | null;
  token: string | null;
  session: Session | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isInitializing: boolean;
  authStatus: AuthStatus;
  authError: string | null;
  setSession: (session: Session | null, user: User | null) => void;
  setInitializing: (isInit: boolean) => void;
  setAuthError: (error: string | null) => void;
  login: (user: User, token: string) => void;
  logout: () => void;
  setLoading: (loading: boolean) => void;
  updateUser: (updates: Partial<User>) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  session: null,
  isAuthenticated: false,
  isLoading: false,
  isInitializing: true,
  authStatus: 'BOOTING',
  authError: null,
  setSession: (session, user) => {
    console.log('ZUSTAND setSession', session?.user?.id || 'null', user?.id || 'null');
    logStartupStage('07_ZUSTAND_SESSION_SYNCHRONIZED', {
      userId: user?.id || session?.user?.id || null,
    });
    const status: AuthStatus = session ? 'AUTHENTICATED' : 'UNAUTHENTICATED';
    set({ 
      session, 
      user, 
      isAuthenticated: !!session, 
      token: session?.access_token || null,
      authStatus: status,
      isInitializing: false,
      authError: null,
    });
  },
  setInitializing: (isInitializing) => set({ isInitializing }),
  setAuthError: (authError) => set({
    authStatus: 'ERROR',
    authError,
    isInitializing: false,
  }),
  login: (user, token) => set({ user, token, isAuthenticated: true, authStatus: 'AUTHENTICATED', authError: null }),
  logout: () => set({ user: null, token: null, session: null, isAuthenticated: false, authStatus: 'UNAUTHENTICATED', authError: null }),
  setLoading: (isLoading) => set({ isLoading }),
  updateUser: (updates) => set((state) => ({
    user: state.user ? { ...state.user, ...updates } : null,
  })),
}));

// Selector hooks
export const useUser = () => useAuthStore((s) => s.user);
export const useIsAuthenticated = () => useAuthStore((s) => s.isAuthenticated);
export const useAuthStatus = () => useAuthStore((s) => s.authStatus);
export const useAuthError = () => useAuthStore((s) => s.authError);

