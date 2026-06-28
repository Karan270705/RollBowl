import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, Typography, Spacing } from '@/src/constants/theme';
import { Button, Input } from '@/src/components/ui';
import { ScreenWrapper } from '@/src/components/layout';
import { resetPassword } from '@/src/services/auth';
import { supabase } from '@/src/lib/supabase';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [showFallback, setShowFallback] = useState(false);
  const [fallbackLink, setFallbackLink] = useState('');
  
  const handleFallback = async () => {
    if (!fallbackLink.includes('#access_token=')) {
      setErrorMsg('Invalid link. Make sure to copy the entire URL.');
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    try {
      const fragment = fallbackLink.split('#')[1];
      const params = new URLSearchParams(fragment);
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');

      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (error) throw error;
        router.push('/(auth)/reset-password');
      } else {
        throw new Error('Missing tokens in the link.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to parse link.');
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    if (!email) {
      setErrorMsg('Please enter your email.');
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    try {
      await resetPassword(email);
      setSent(true);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to send reset link.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenWrapper>
      <View style={styles.container}>
        <Text style={styles.title}>{sent ? 'Check Your Email' : 'Forgot Password'}</Text>
        <Text style={styles.subtitle}>
          {sent ? 'We\'ve sent a reset link to your email.' : 'Enter your email to receive a reset link.'}
        </Text>
        {!sent ? (
          <>
            {showFallback ? (
              <>
                <Input label="Paste Recovery Link" placeholder="http://localhost:3000/#access_token=..." value={fallbackLink} onChangeText={setFallbackLink} autoCapitalize="none" />
                {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}
                <Button title="Verify Link" onPress={handleFallback} loading={loading} fullWidth size="lg" />
                <Button title="Cancel" onPress={() => setShowFallback(false)} variant="ghost" fullWidth size="md" />
              </>
            ) : (
              <>
                <Input label="Email" placeholder="your@email.com" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" leftIcon="mail-outline" />
                {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}
                <Button title="Send Reset Link" onPress={handleSend} loading={loading} fullWidth size="lg" />
                <Button title="Already have a link?" onPress={() => { setShowFallback(true); setErrorMsg(null); }} variant="ghost" fullWidth size="md" />
              </>
            )}
          </>
        ) : (
          <>
            <Button title="Back to Login" onPress={() => router.back()} variant="outline" fullWidth size="lg" />
            <Button title="Paste link instead" onPress={() => { setShowFallback(true); setSent(false); setErrorMsg(null); }} variant="ghost" fullWidth size="md" style={{ marginTop: Spacing.sm }} />
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
  errorText: { color: '#C41E24', fontSize: Typography.size.sm, textAlign: 'center' },
});
