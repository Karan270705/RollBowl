import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Image,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radii, Shadows } from '@/src/constants/theme';
import { Button, Input } from '@/src/components/ui';
import { ScreenWrapper } from '@/src/components/layout';
import { signUp } from '@/src/services/auth';
import { supabase } from '@/src/lib/supabase';
import { useActiveStalls } from '@/src/hooks';
import { Stall } from '@/src/types/models';

export default function SignupScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Stall selection state
  const [showStallSelection, setShowStallSelection] = useState(false);
  const [selectedStallId, setSelectedStallId] = useState<string | null>(null);
  const { data: availableStalls = [], isLoading: isLoadingStalls } = useActiveStalls();

  // Auto-select if only 1 stall
  useEffect(() => {
    if (availableStalls.length === 1 && !selectedStallId) {
      setSelectedStallId(availableStalls[0].id);
    }
  }, [availableStalls, selectedStallId]);

  const handleContinueToStallSelection = () => {
    if (!name || !email || !phone || !password) {
      setErrorMsg('Please fill out all fields.');
      return;
    }
    if (password.length < 8) {
      setErrorMsg('Password must be at least 8 characters.');
      return;
    }
    setErrorMsg(null);
    setShowStallSelection(true);
  };

  const handleBackToForm = () => {
    setShowStallSelection(false);
    setErrorMsg(null);
  };

  const handleCompleteSignup = async () => {
    if (!selectedStallId) {
      Alert.alert('Error', 'Please select a stall');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    try {
      console.log('[Signup] Starting signup for:', email);
      console.log('[Signup] Selected stall ID:', selectedStallId);

      const { user, session } = await signUp({ name, email, phone, password });
      console.log('[Signup] Auth signup successful, user ID:', user?.id);

      // After the trigger creates the user profile, update with college_id and preferred_stall_id
      if (user) {
        // Get the selected stall's college_id
        const selectedStall = availableStalls.find(s => s.id === selectedStallId);
        console.log('[Signup] Selected stall data:', selectedStall);

        if (!selectedStall) {
          throw new Error('Selected stall not found');
        }

        console.log('[Signup] Updating user with college_id:', selectedStall.collegeId, 'stall_id:', selectedStallId);

        const { error: updateError } = await supabase
          .from('users')
          .update({
            college_id: selectedStall.collegeId,
            preferred_stall_id: selectedStallId
          })
          .eq('id', user.id);

        if (updateError) {
          console.error('[Signup] Failed to set college and stall:', updateError);
          throw new Error(`Database error: ${updateError.message}`);
        } else {
          console.log('[Signup] ✅ College and preferred stall set successfully');
        }
      }

      // If Email Confirmation is ON, session will be null
      if (user && !session) {
        Alert.alert(
          'Check your email',
          'We sent you a confirmation link. Please verify your email to continue.',
          [{ text: 'OK', onPress: () => router.replace('/(auth)/login' as any) }]
        );
      } else if (session) {
        console.log('[Signup] ✅ Signup complete, navigating to home');
        router.replace('/(tabs)/(home)' as any);
      }
    } catch (err: any) {
      console.error('[Signup] Error during signup:', err);
      setErrorMsg(err.message || 'Failed to sign up.');
    } finally {
      setLoading(false);
    }
  };

  // ─── Stall Selection Screen ──────────────────────────────────
  if (showStallSelection) {
    return (
      <ScreenWrapper>
        <View style={styles.container}>
          {/* Header with back button */}
          <View style={styles.stallHeader}>
            <TouchableOpacity onPress={handleBackToForm} style={styles.backButton}>
              <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
            </TouchableOpacity>
            <View style={styles.stallHeaderText}>
              <Text style={styles.title}>Choose Your Stall</Text>
              <Text style={styles.subtitle}>
                Select the food stall you'll order from most often. You can change this later.
              </Text>
            </View>
          </View>

          {/* Stall list */}
          {isLoadingStalls ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={styles.loadingText}>Loading stalls…</Text>
            </View>
          ) : availableStalls.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="storefront-outline" size={48} color={Colors.textTertiary} />
              <Text style={styles.emptyTitle}>No Stalls Available</Text>
              <Text style={styles.emptySubtitle}>
                No food stalls are currently available for your college. Please contact support.
              </Text>
            </View>
          ) : (
            <ScrollView
              style={styles.stallList}
              contentContainerStyle={styles.stallListContent}
              showsVerticalScrollIndicator={false}
            >
              {availableStalls.map((stall) => (
                <TouchableOpacity
                  key={stall.id}
                  style={[
                    styles.stallCard,
                    selectedStallId === stall.id && styles.stallCardSelected,
                  ]}
                  onPress={() => setSelectedStallId(stall.id)}
                  activeOpacity={0.7}
                >
                  <View style={styles.stallCardContent}>
                    {stall.imageUrl ? (
                      <Image source={{ uri: stall.imageUrl }} style={styles.stallImage} />
                    ) : (
                      <View style={styles.stallImagePlaceholder}>
                        <Ionicons name="storefront" size={28} color={Colors.primary} />
                      </View>
                    )}
                    <View style={styles.stallInfo}>
                      <Text style={styles.stallName}>{stall.name}</Text>
                      {stall.location && (
                        <View style={styles.stallLocationRow}>
                          <Ionicons name="location-outline" size={14} color={Colors.textSecondary} />
                          <Text style={styles.stallLocation}>{stall.location}</Text>
                        </View>
                      )}
                      {stall.description ? (
                        <Text style={styles.stallDescription} numberOfLines={2}>
                          {stall.description}
                        </Text>
                      ) : null}
                    </View>
                    {selectedStallId === stall.id ? (
                      <Ionicons name="checkmark-circle" size={26} color={Colors.success} />
                    ) : (
                      <View style={styles.radioUnselected} />
                    )}
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {/* Error message */}
          {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}

          {/* Continue button */}
          <View style={styles.stallFooter}>
            <Button
              title="Create Account"
              onPress={handleCompleteSignup}
              loading={loading}
              fullWidth
              size="lg"
              disabled={!selectedStallId || availableStalls.length === 0}
            />
          </View>
        </View>
      </ScreenWrapper>
    );
  }

  // ─── Signup Form ─────────────────────────────────────────────
  return (
    <ScreenWrapper>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <Image source={require('@/assets/images/icon.png')} style={styles.logoImage} />
          <Text style={styles.title}>Create Account</Text>
          <Text style={styles.subtitle}>Join RollBowl for campus meals</Text>
        </View>

        <View style={styles.form}>
          <Input label="Full Name" placeholder="John Doe" value={name} onChangeText={setName} leftIcon="person-outline" />
          <Input label="Email" placeholder="your@email.com" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" leftIcon="mail-outline" />
          <Input label="Phone" placeholder="+91 98765 43210" value={phone} onChangeText={setPhone} keyboardType="phone-pad" leftIcon="call-outline" />
          <Input label="Password" placeholder="Min 8 characters" value={password} onChangeText={setPassword} secureTextEntry leftIcon="lock-closed-outline" />

          {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}

          <Button title="Next: Choose Your Stall" onPress={handleContinueToStallSelection} fullWidth size="lg" />
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
  logoImage: { width: 56, height: 56, resizeMode: 'contain', alignSelf: 'center', marginBottom: Spacing.xs },
  title: { fontSize: Typography.size['2xl'], fontFamily: Typography.family.bold, color: Colors.textPrimary },
  subtitle: { fontSize: Typography.size.base, color: Colors.textSecondary, marginTop: Spacing.xs, textAlign: 'center' },
  form: { gap: Spacing.xs },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: Spacing['2xl'] },
  footerText: { fontSize: Typography.size.base, color: Colors.textSecondary },
  footerLink: { fontSize: Typography.size.base, fontFamily: Typography.family.semiBold, color: Colors.primary },
  errorText: { color: '#C41E24', fontSize: Typography.size.sm, textAlign: 'center', marginVertical: Spacing.sm },

  // Stall Selection
  stallHeader: { marginBottom: Spacing.lg },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: Radii.full,
    backgroundColor: Colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  stallHeaderText: { alignItems: 'center' },

  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md },
  loadingText: { fontSize: Typography.size.base, color: Colors.textSecondary },

  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.xl },
  emptyTitle: { fontSize: Typography.size.lg, fontFamily: Typography.family.semiBold, color: Colors.textPrimary },
  emptySubtitle: { fontSize: Typography.size.base, color: Colors.textSecondary, textAlign: 'center' },

  stallList: { flex: 1 },
  stallListContent: { gap: Spacing.md, paddingBottom: Spacing.md },

  stallCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radii.lg,
    borderWidth: 2,
    borderColor: Colors.borderLight,
    padding: Spacing.base,
    ...Shadows.subtleCard,
  },
  stallCardSelected: {
    borderColor: Colors.success,
    backgroundColor: '#F0FDF4',
  },
  stallCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  stallImage: {
    width: 56,
    height: 56,
    borderRadius: Radii.md,
  },
  stallImagePlaceholder: {
    width: 56,
    height: 56,
    borderRadius: Radii.md,
    backgroundColor: Colors.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stallInfo: { flex: 1, gap: 2 },
  stallName: {
    fontSize: Typography.size.md,
    fontFamily: Typography.family.semiBold,
    color: Colors.textPrimary,
  },
  stallLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  stallLocation: {
    fontSize: Typography.size.sm,
    fontFamily: Typography.family.medium,
    color: Colors.textSecondary,
  },
  stallDescription: {
    fontSize: Typography.size.sm,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  radioUnselected: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.border,
  },
  stallFooter: {
    paddingTop: Spacing.base,
    paddingBottom: Spacing.md,
  },
});
