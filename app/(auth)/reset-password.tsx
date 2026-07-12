import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, Typography, Spacing } from '@/src/constants/theme';
import { Button, Input } from '@/src/components/ui';
import { ScreenWrapper } from '@/src/components/layout';
import { supabase } from '@/src/lib/supabase';

export default function ResetPasswordScreen() {
  const router = useRouter();
  
  const [sessionReady, setSessionReady] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  // ── Check for an existing recovery session ──────────────────
  // The AuthDeepLinkProvider has already established the session
  // before navigating here. This screen only needs to verify it.
  useEffect(() => {
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        setSessionReady(true);
      }
    };
    checkSession();

    // Also listen for session changes in case the deep link handler
    // sets the session slightly after this screen mounts.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) {
        setSessionReady(true);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

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

  const handleGoToLogin = async () => {
    // Sign out of the recovery session before navigating to login
    await supabase.auth.signOut();
    router.replace('/(auth)/login');
  };

  return (
    <ScreenWrapper>
      <View style={styles.container}>
        <Text style={styles.title}>{success ? 'Password Reset!' : 'Create New Password'}</Text>
        
        {success ? (
          <>
            <Text style={styles.subtitle}>
              Your password has been successfully updated. You can now log in with your new password.
            </Text>
            <Button title="Go to Login" onPress={handleGoToLogin} fullWidth size="lg" />
          </>
        ) : (
          <>
            <Text style={styles.subtitle}>
              {!sessionReady ? 'Authenticating recovery session...' : 'Enter your new password below.'}
            </Text>
            
            <Input 
              label="New Password" 
              placeholder="••••••••" 
              value={password} 
              onChangeText={setPassword} 
              secureTextEntry 
              leftIcon="lock-closed-outline" 
              editable={sessionReady && !loading}
            />
            <Input 
              label="Confirm Password" 
              placeholder="••••••••" 
              value={confirmPassword} 
              onChangeText={setConfirmPassword} 
              secureTextEntry 
              leftIcon="lock-closed-outline" 
              editable={sessionReady && !loading}
            />
            
            {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}
            
            <Button 
              title="Update Password" 
              onPress={handleUpdatePassword} 
              loading={loading} 
              disabled={!sessionReady || loading}
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
