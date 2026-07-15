import { supabase } from '@/src/lib/supabase';
import { LoginRequest, SignupRequest } from '@/src/types/api';
import { User } from '@/src/types/models';
import * as Linking from 'expo-linking';

export const signIn = async ({ email, password }: LoginRequest) => {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
};

import { NotificationEvents } from '@/src/services/notifications';

export const signUp = async ({ name, email, phone, password }: SignupRequest) => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        name,
        phone,
      },
    },
  });

  if (error) throw error;
  
  if (data.user) {
    await NotificationEvents.notifyWelcome(data.user.id);
  }
  
  return data;
};

export const signOut = async () => {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
};

export const resetPassword = async (email: string) => {
  const redirectUrl = Linking.createURL('reset-password');

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: redirectUrl,
  });

  if (error) {
    throw error;
  }
};


export const fetchUserProfile = async (userId: string): Promise<User | null> => {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  // Map Supabase snake_case columns to camelCase User model
  return {
    id: data.id,
    name: data.name,
    email: data.email,
    phone: data.phone,
    role: data.role,
    avatarUrl: data.avatar_url,
    collegeId: data.college_id,
    cityId: data.city_id,
    createdAt: data.created_at,
  };
};
