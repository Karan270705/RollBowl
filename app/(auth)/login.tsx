import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, KeyboardAvoidingView, Platform, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, Typography, Spacing, Radii } from '@/src/constants/theme';
import { Button } from '@/src/components/ui';
import { Input } from '@/src/components/ui';
import { ScreenWrapper } from '@/src/components/layout';
import { signIn } from '@/src/services/auth';

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleLogin = async () => {
    if (!email || !password) {
      setErrorMsg('Please enter both email and password.');
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    try {
      await signIn({ email, password });
      router.replace('/(tabs)/(home)' as any);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to sign in. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenWrapper>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <Image source={require('@/assets/images/icon.png')} style={styles.logoImage} />
          <Text style={styles.logo}><Text style={{ color: '#C41E24' }}>Roll</Text><Text style={{ color: '#F5A623' }}>|</Text><Text style={{ color: '#C41E24' }}>bowl</Text></Text>
          <Text style={styles.title}>Welcome Back</Text>
          <Text style={styles.subtitle}>Sign in to continue ordering</Text>
        </View>

        <View style={styles.form}>
          <Input
            label="Email"
            placeholder="your@email.com"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            leftIcon="mail-outline"
          />
          <Input
            label="Password"
            placeholder="Enter password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            leftIcon="lock-closed-outline"
          />

          {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}

          <TouchableOpacity onPress={() => router.push('/(auth)/forgot-password')} style={styles.forgotBtn}>
            <Text style={styles.forgotText}>Forgot Password?</Text>
          </TouchableOpacity>

          <Button title="Sign In" onPress={handleLogin} loading={loading} fullWidth size="lg" />
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>{"Don't have an account?"}</Text>
          <TouchableOpacity onPress={() => router.push('/(auth)/signup')}>
            <Text style={styles.footerLink}> Sign Up</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', paddingHorizontal: Spacing.xl },
  header: { alignItems: 'center', marginBottom: Spacing['2xl'] },
  logoImage: { width: 64, height: 64, resizeMode: 'contain', alignSelf: 'center', marginBottom: Spacing.xs },
  logo: { fontSize: 32, fontFamily: Typography.family.bold, marginBottom: Spacing.sm },
  title: { fontSize: Typography.size.xl, fontFamily: Typography.family.bold, color: Colors.textPrimary },
  subtitle: { fontSize: Typography.size.base, color: Colors.textSecondary, marginTop: Spacing.xs },
  form: { gap: Spacing.xs },
  forgotBtn: { alignSelf: 'flex-end', marginBottom: Spacing.md },
  forgotText: { fontSize: Typography.size.sm, color: Colors.primary, fontFamily: Typography.family.medium },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: Spacing['2xl'] },
  footerText: { fontSize: Typography.size.base, color: Colors.textSecondary },
  footerLink: { fontSize: Typography.size.base, fontFamily: Typography.family.semiBold, color: Colors.primary },
  errorText: { color: '#C41E24', fontSize: Typography.size.sm, textAlign: 'center' },
});
