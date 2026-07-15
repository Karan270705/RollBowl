import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, Typography, Spacing } from '@/src/constants/theme';
import { Button, Input } from '@/src/components/ui';
import { ScreenWrapper } from '@/src/components/layout';
import { resetPassword } from '@/src/services/auth';
import { supabase } from '@/src/lib/supabase';
import { 
  loadRateLimitState, 
  saveRateLimitState, 
  RateLimitState, 
  RESET_COOLDOWN_MS, 
  MAX_RESET_ATTEMPTS 
} from '@/src/utils/rateLimitHelper';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Rate Limiting State
  const [rlState, setRlState] = useState<RateLimitState>({ attempts: [], cooldownUntil: 0 });
  const [countdown, setCountdown] = useState(0);
  const submittingRef = useRef(false);

  const [showFallback, setShowFallback] = useState(false);
  const [fallbackLink, setFallbackLink] = useState('');

  // Load RL state whenever the normalized email changes
  useEffect(() => {
    let isMounted = true;
    const fetchState = async () => {
      const normalizedEmail = email.trim().toLowerCase();
      if (!normalizedEmail) {
        if (isMounted) {
          setRlState({ attempts: [], cooldownUntil: 0 });
          setCountdown(0);
        }
        return;
      }

      const state = await loadRateLimitState(normalizedEmail);
      if (isMounted) {
        setRlState(state);
      }
    };

    // Debounce the read slightly to avoid spamming storage while typing
    const timeout = setTimeout(fetchState, 300);
    return () => {
      isMounted = false;
      clearTimeout(timeout);
    };
  }, [email]);

  // Countdown timer logic
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    const updateCountdown = () => {
      const remaining = Math.max(0, Math.ceil((rlState.cooldownUntil - Date.now()) / 1000));
      setCountdown(remaining);
      if (remaining === 0) {
        clearInterval(interval);
      }
    };

    updateCountdown();
    interval = setInterval(updateCountdown, 1000);
    
    return () => clearInterval(interval);
  }, [rlState.cooldownUntil]);

  const handleFallback = async () => {
    if (!fallbackLink.includes('#access_token=')) {
      setErrorMsg('Invalid link. Make sure to copy the entire URL.');
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
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
    const normalizedEmail = email.trim().toLowerCase();
    
    // 1. Format Validation
    if (!normalizedEmail || !/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }

    // 2. Double-tap guard
    if (submittingRef.current || loading) return;

    // 3. Rate Limit Local Checks
    if (countdown > 0) {
      setErrorMsg(`Please wait before requesting another reset link.`);
      return;
    }

    // Reload state right before checking to ensure we have the absolute latest for the window
    const freshRlState = await loadRateLimitState(normalizedEmail);
    if (freshRlState.attempts.length >= MAX_RESET_ATTEMPTS) {
      setErrorMsg('Too many reset requests. Please wait before trying again.');
      setRlState(freshRlState);
      return;
    }

    submittingRef.current = true;
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    let wasApiAttempted = false;

    try {
      wasApiAttempted = true; // We are about to hit the API
      await resetPassword(normalizedEmail);
      
      setSent(true);
      setSuccessMsg('If an account exists for this email, a password reset link has been sent.');
    } catch (err: any) {
      // Supabase rate limiting checks
      const isRateLimit = err?.status === 429 || err?.message?.toLowerCase().includes('rate limit');
      
      if (isRateLimit) {
        setErrorMsg('Too many reset requests. Please wait before trying again.');
      } else {
        // Keep raw error only in logs, show generic to user
        console.warn('[Forgot Password] Auth API Error:', err);
        setErrorMsg('We could not process the reset request right now. Please try again later.');
      }
    } finally {
      // 4. Record Actual API Attempt (even on error)
      if (wasApiAttempted) {
        const now = Date.now();
        const updatedState: RateLimitState = {
          attempts: [...freshRlState.attempts, now],
          cooldownUntil: now + RESET_COOLDOWN_MS,
        };
        setRlState(updatedState);
        await saveRateLimitState(normalizedEmail, updatedState);
      }
      
      submittingRef.current = false;
      setLoading(false);
    }
  };

  return (
    <ScreenWrapper>
      <View style={styles.container}>
        <Text style={styles.title}>{sent ? 'Check Your Email' : 'Forgot Password'}</Text>
        
        {successMsg ? (
          <View style={styles.successBox}>
            <Text style={styles.successText}>{successMsg}</Text>
          </View>
        ) : (
          <Text style={styles.subtitle}>
            {sent ? 'We\'ve sent a reset link to your email.' : 'Enter your email to receive a reset link.'}
          </Text>
        )}

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
                <Input 
                  label="Email" 
                  placeholder="your@email.com" 
                  value={email} 
                  onChangeText={(val) => {
                    setEmail(val);
                    setErrorMsg(null);
                  }} 
                  keyboardType="email-address" 
                  autoCapitalize="none" 
                  leftIcon="mail-outline" 
                />
                
                {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}
                
                <Button 
                  title={countdown > 0 ? `Resend available in ${countdown}s` : "Send Reset Link"} 
                  onPress={handleSend} 
                  loading={loading} 
                  disabled={countdown > 0 || loading}
                  fullWidth 
                  size="lg" 
                />
                <Button title="Already have a link?" onPress={() => { setShowFallback(true); setErrorMsg(null); }} variant="ghost" fullWidth size="md" />
              </>
            )}
          </>
        ) : (
          <>
            {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}
            <Button 
              title={countdown > 0 ? `Resend available in ${countdown}s` : "Resend Email"} 
              onPress={handleSend} 
              loading={loading}
              disabled={countdown > 0 || loading}
              variant="primary" 
              fullWidth 
              size="lg" 
            />
            <Button title="Back to Login" onPress={() => router.back()} variant="outline" fullWidth size="lg" style={{ marginTop: Spacing.sm }} />
            <Button title="Paste link instead" onPress={() => { setShowFallback(true); setSent(false); setErrorMsg(null); setSuccessMsg(null); }} variant="ghost" fullWidth size="md" style={{ marginTop: Spacing.sm }} />
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
  errorText: { color: Colors.error, fontSize: Typography.size.sm, textAlign: 'center' },
  successBox: { backgroundColor: Colors.successLight, padding: Spacing.base, borderRadius: 8, marginBottom: Spacing.base },
  successText: { color: Colors.successDark, fontSize: Typography.size.sm, textAlign: 'center', fontFamily: Typography.family.medium },
});
