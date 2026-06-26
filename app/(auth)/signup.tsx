import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, Typography, Spacing } from '@/src/constants/theme';
import { Button, Input } from '@/src/components/ui';
import { ScreenWrapper } from '@/src/components/layout';
import { signUp } from '@/src/services/auth';

export default function SignupScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSignup = async () => {
    if (!name || !email || !phone || !password) {
      setErrorMsg('Please fill out all fields.');
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    try {
      const { user, session } = await signUp({ name, email, phone, password });
      
      // If Email Confirmation is ON, session will be null
      if (user && !session) {
        Alert.alert(
          'Check your email', 
          'We sent you a confirmation link. Please verify your email to continue.',
          [{ text: 'OK', onPress: () => router.replace('/(auth)/login' as any) }]
        );
      } else if (session) {
        router.replace('/(tabs)/(home)' as any);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to sign up.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenWrapper>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <Text style={styles.title}>Create Account</Text>
          <Text style={styles.subtitle}>Join RollBowl for campus meals</Text>
        </View>

        <View style={styles.form}>
          <Input label="Full Name" placeholder="John Doe" value={name} onChangeText={setName} leftIcon="person-outline" />
          <Input label="Email" placeholder="your@email.com" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" leftIcon="mail-outline" />
          <Input label="Phone" placeholder="+91 98765 43210" value={phone} onChangeText={setPhone} keyboardType="phone-pad" leftIcon="call-outline" />
          <Input label="Password" placeholder="Min 8 characters" value={password} onChangeText={setPassword} secureTextEntry leftIcon="lock-closed-outline" />
          
          {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}
          
          <Button title="Create Account" onPress={handleSignup} loading={loading} fullWidth size="lg" />
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Already have an account?</Text>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.footerLink}> Sign In</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', paddingHorizontal: Spacing.xl },
  header: { alignItems: 'center', marginBottom: Spacing['2xl'] },
  title: { fontSize: Typography.size['2xl'], fontFamily: Typography.family.bold, color: Colors.textPrimary },
  subtitle: { fontSize: Typography.size.base, color: Colors.textSecondary, marginTop: Spacing.xs },
  form: { gap: Spacing.xs },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: Spacing['2xl'] },
  footerText: { fontSize: Typography.size.base, color: Colors.textSecondary },
  footerLink: { fontSize: Typography.size.base, fontFamily: Typography.family.semiBold, color: Colors.primary },
  errorText: { color: '#C41E24', fontSize: Typography.size.sm, textAlign: 'center' },
});
