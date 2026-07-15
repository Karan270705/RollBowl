import 'react-native-url-polyfill/auto';
import { AppState } from 'react-native';
import { createClient } from '@supabase/supabase-js';
import { Database } from './database.types';
import { largeSecureStore } from './LargeSecureStore';

// Custom SecureStore adapter for Supabase session persistence
const ExpoSecureStoreAdapter = {
  getItem: (key: string) => {
    return largeSecureStore.getItem(key);
  },
  setItem: (key: string, value: string) => {
    return largeSecureStore.setItem(key, value);
  },
  removeItem: (key: string) => {
    return largeSecureStore.removeItem(key);
  },
};

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: ExpoSecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
