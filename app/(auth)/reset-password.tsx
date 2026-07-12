import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter, usePathname, useSegments, useLocalSearchParams } from 'expo-router';
import { useRoute } from '@react-navigation/native';
import * as Linking from 'expo-linking';
import { Colors, Typography, Spacing } from '@/src/constants/theme';
import { Button, Input } from '@/src/components/ui';
import { ScreenWrapper } from '@/src/components/layout';
import { supabase } from '@/src/lib/supabase';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const url = Linking.useURL();
  const pathname = usePathname();
  const segments = useSegments();
  const searchParams = useLocalSearchParams();
  const route = useRoute();
  
  const [sessionSet, setSessionSet] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    Linking.getInitialURL().then(initial => {
      console.log('\n===== DEEP LINK DIAGNOSTICS =====');
      console.log('Initial URL:', initial);
      console.log('Live URL:', url);
      console.log('Pathname:', pathname);
      console.log('Segments:', JSON.stringify(segments));
      console.log('Search Params:', JSON.stringify(searchParams));
      console.log('Route Object:', JSON.stringify(route));
      console.log('===============================\n');
    });
    
    // Check if session was already set manually via fallback
    supabase.auth.getSession().then(({ data }) => {
      console.log('Initial getSession() Check:', data.session ? `Found user ${data.session.user.id}` : 'No session');
      if (data.session) {
        setSessionSet(true);
      }
    });

    if (url) {
      try {
        const urlObj = new URL(url);
        const fragment = url.includes('#') ? url.split('#')[1] : null;
        console.log('Parsed fragment:', fragment);
        
        if (fragment) {
          const params = new URLSearchParams(fragment);
          const accessToken = params.get('access_token');
          const refreshToken = params.get('refresh_token');
          const type = params.get('type');

          console.log('Tokens Found:');
          console.log('  type:', type);
          console.log('  access_token present:', !!accessToken, accessToken ? `(starts with ${accessToken.substring(0, 10)})` : '');
          console.log('  refresh_token present:', !!refreshToken, refreshToken ? `(starts with ${refreshToken.substring(0, 10)})` : '');

          if (accessToken && refreshToken) {
             console.log('Executing setSession()...');
             supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            }).then(async ({ data, error }) => {
              console.log('setSession result:');
              console.log('  success:', !error);
              console.log('  error:', error?.message || 'None');
              
              if (!error) {
                // Immediately test getSession
                const sessionCheck = await supabase.auth.getSession();
                console.log('Current Session (immediately after setSession):');
                console.log('  user id:', sessionCheck.data.session?.user?.id || 'NULL');
                console.log('  expires:', sessionCheck.data.session?.expires_at);
                console.log('  access token exists?', !!sessionCheck.data.session?.access_token);
              }
              
              if (error) {
                setErrorMsg('Recovery link expired or invalid.');
              } else {
                setSessionSet(true);
              }
            });
          } else {
             console.log('Error: Invalid recovery link format');
             setErrorMsg('Invalid recovery link format.');
          }
        } else {
           console.log('Error: Missing recovery tokens in link (no fragment)');
           setErrorMsg('Missing recovery tokens in link.');
        }
      } catch (err) {
        console.log('Error parsing URL:', err);
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
      console.log('Executing updateUser() for password reset...');
      
      // Grab email before update to test sign in later
      const currentSession = await supabase.auth.getSession();
      const testEmail = currentSession.data.session?.user?.email;
      
      const { data, error } = await supabase.auth.updateUser({ password });
      
      console.log('updateUser result:');
      console.log('  success:', !error);
      console.log('  error:', error?.message || 'None');
      console.log('  returned user:', data?.user?.id || 'NULL');
      
      if (error) throw error;
      
      // Test signInWithPassword as requested
      console.log('Executing signInWithPassword test...');
      if (testEmail) {
        const signinTest = await supabase.auth.signInWithPassword({
          email: testEmail,
          password: password
        });
        console.log('signInWithPassword test result:');
        console.log('  success:', !signinTest.error);
        console.log('  error:', signinTest.error?.message || 'None');
      } else {
        console.log('signInWithPassword test skipped: no email found in session.');
      }
      
      console.log('==================================================\n');
      
      setSuccess(true);
    } catch (err: any) {
      console.log('updateUser exception:', err);
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
