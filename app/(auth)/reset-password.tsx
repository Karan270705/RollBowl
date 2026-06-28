import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { Colors, Typography, Spacing } from '@/src/constants/theme';
import { Button, Input } from '@/src/components/ui';
import { ScreenWrapper } from '@/src/components/layout';
import { supabase } from '@/src/lib/supabase';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const url = Linking.useURL();
  
  const [sessionSet, setSessionSet] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    console.log('DIAGNOSTIC: Linking.useURL() returned:', url);
    
    // Check if session was already set manually via fallback
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setSessionSet(true);
      }
    });

    if (url) {
      // url might be rollbowl://reset-password#access_token=...&refresh_token=...&type=recovery
      try {
        const urlObj = new URL(url);
        // React Native URL polyfill doesn't always handle custom schemes well with hash
        // So we split manually if needed
        const fragment = url.includes('#') ? url.split('#')[1] : null;
        console.log('DIAGNOSTIC: Parsed fragment:', fragment);
        if (fragment) {
          const params = new URLSearchParams(fragment);
          const accessToken = params.get('access_token');
          const refreshToken = params.get('refresh_token');

          console.log('DIAGNOSTIC: access_token present:', !!accessToken);
          console.log('DIAGNOSTIC: refresh_token present:', !!refreshToken);

          if (accessToken && refreshToken) {
             supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            }).then(({ error }) => {
              console.log('DIAGNOSTIC: setSession error?', !!error, error?.message);
              if (error) {
                setErrorMsg('Recovery link expired or invalid.');
              } else {
                setSessionSet(true);
                console.log('DIAGNOSTIC: Session successfully set.');
              }
            });
          } else {
             setErrorMsg('Invalid recovery link format.');
          }
        } else {
           setErrorMsg('Missing recovery tokens in link.');
        }
      } catch (err) {
        setErrorMsg('Failed to parse recovery link.');
      }
    }
  }, [url]);

  const handleUpdatePassword = async () => {
    if (!password || password.length < 6) {
      setErrorMsg('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }
    
    setLoading(true);
    setErrorMsg(null);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setSuccess(true);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenWrapper>
      <View style={styles.container}>
        <Text style={styles.title}>{success ? 'Password Reset!' : 'Create New Password'}</Text>
        
        {success ? (
          <>
            <Text style={styles.subtitle}>Your password has been successfully updated.</Text>
            <Button title="Go to Login" onPress={() => router.replace('/(auth)/login')} fullWidth size="lg" />
          </>
        ) : (
          <>
            <Text style={styles.subtitle}>
              {!sessionSet && !url ? 'Waiting for recovery link...' : 
               !sessionSet && !errorMsg ? 'Authenticating...' : 
               'Enter your new password below.'}
            </Text>
            
            <Input 
              label="New Password" 
              placeholder="••••••••" 
              value={password} 
              onChangeText={setPassword} 
              secureTextEntry 
              leftIcon="lock-closed-outline" 
              editable={sessionSet && !loading}
            />
            <Input 
              label="Confirm Password" 
              placeholder="••••••••" 
              value={confirmPassword} 
              onChangeText={setConfirmPassword} 
              secureTextEntry 
              leftIcon="lock-closed-outline" 
              editable={sessionSet && !loading}
            />
            
            {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}
            
            <Button 
              title="Update Password" 
              onPress={handleUpdatePassword} 
              loading={loading} 
              disabled={!sessionSet || loading}
              fullWidth 
              size="lg" 
              style={{ marginTop: Spacing.sm }}
            />
          </>
        )}
      </View>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', paddingHorizontal: Spacing.xl, gap: Spacing.base },
  title: { fontSize: Typography.size['2xl'], fontFamily: Typography.family.bold, color: Colors.textPrimary, textAlign: 'center' },
  subtitle: { fontSize: Typography.size.base, color: Colors.textSecondary, textAlign: 'center', marginBottom: Spacing.base },
  errorText: { color: Colors.error, fontSize: Typography.size.sm, textAlign: 'center', marginTop: Spacing.xs },
});
