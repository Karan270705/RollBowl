import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, Typography, Spacing, Radii } from '@/src/constants/theme';
import { Button } from '@/src/components/ui';
import { ScreenWrapper } from '@/src/components/layout';

export default function OtpVerificationScreen() {
  const router = useRouter();
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const inputs = useRef<(TextInput | null)[]>([]);

  const handleChange = (text: string, index: number) => {
    const newOtp = [...otp];
    newOtp[index] = text;
    setOtp(newOtp);
    if (text && index < 5) inputs.current[index + 1]?.focus();
  };

  const handleVerify = () => {
    router.replace('/(tabs)/(home)' as any);
  };

  return (
    <ScreenWrapper>
      <View style={styles.container}>
        <Text style={styles.title}>Verify OTP</Text>
        <Text style={styles.subtitle}>Enter the 6-digit code sent to your phone</Text>

        <View style={styles.otpRow}>
          {otp.map((digit, i) => (
            <TextInput
              key={i}
              ref={(ref) => { inputs.current[i] = ref; }}
              style={[styles.otpInput, digit ? styles.otpFilled : undefined]}
              value={digit}
              onChangeText={(t) => handleChange(t, i)}
              keyboardType="numeric"
              maxLength={1}
              selectTextOnFocus
            />
          ))}
        </View>

        <Button title="Verify" onPress={handleVerify} fullWidth size="lg" />

        <View style={styles.resendRow}>
          <Text style={styles.resendText}>Didn't receive code? </Text>
          <Text style={styles.resendLink}>Resend</Text>
        </View>
      </View>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', paddingHorizontal: Spacing.xl, gap: Spacing.xl },
  title: { fontSize: Typography.size['2xl'], fontFamily: Typography.family.bold, color: Colors.textPrimary, textAlign: 'center' },
  subtitle: { fontSize: Typography.size.base, color: Colors.textSecondary, textAlign: 'center' },
  otpRow: { flexDirection: 'row', justifyContent: 'center', gap: Spacing.sm },
  otpInput: {
    width: 48, height: 56, borderRadius: Radii.md,
    borderWidth: 1.5, borderColor: Colors.border,
    fontSize: Typography.size.xl, fontFamily: Typography.family.bold,
    textAlign: 'center', color: Colors.textPrimary,
    backgroundColor: Colors.surface,
  },
  otpFilled: { borderColor: Colors.primary, backgroundColor: Colors.primaryBg },
  resendRow: { flexDirection: 'row', justifyContent: 'center' },
  resendText: { fontSize: Typography.size.sm, color: Colors.textSecondary },
  resendLink: { fontSize: Typography.size.sm, fontFamily: Typography.family.semiBold, color: Colors.primary },
});
