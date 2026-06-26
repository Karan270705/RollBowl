import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, Typography, Spacing } from '@/src/constants/theme';
import { Button, Input } from '@/src/components/ui';
import { ScreenWrapper } from '@/src/components/layout';
import { resetPassword } from '@/src/services/auth';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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
            <Input label="Email" placeholder="your@email.com" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" leftIcon="mail-outline" />
            {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}
            <Button title="Send Reset Link" onPress={handleSend} loading={loading} fullWidth size="lg" />
          </>
        ) : (
          <Button title="Back to Login" onPress={() => router.back()} variant="outline" fullWidth size="lg" />
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
