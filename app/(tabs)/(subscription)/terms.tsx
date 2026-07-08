import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radii } from '@/src/constants/theme';
import { ScreenWrapper } from '@/src/components/layout';
import { Button } from '@/src/components/ui';
import { MEMBERSHIP_TERMS_CONTENT, MEMBERSHIP_TERMS_VERSION } from '@/src/constants/terms';

export default function MembershipTermsScreen() {
  const { planId } = useLocalSearchParams<{ planId: string }>();
  const router = useRouter();
  const [accepted, setAccepted] = useState(false);

  const handleContinue = () => {
    if (accepted && planId) {
      router.push({
        pathname: '/(tabs)/(subscription)/purchase/[id]',
        params: { id: planId, termsVersion: MEMBERSHIP_TERMS_VERSION }
      });
    }
  };

  return (
    <ScreenWrapper>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.title}>Membership Terms & Conditions</Text>
          <Text style={styles.subtitle}>Please read and accept the terms below to continue.</Text>
        </View>

        <View style={styles.documentContainer}>
          <Text style={styles.documentTitle}>Membership Plan – Terms & Conditions</Text>
          
          {MEMBERSHIP_TERMS_CONTENT.map((section, index) => (
            <View key={index} style={styles.section}>
              <Text style={styles.sectionHeading}>{section.heading}</Text>
              <Text style={styles.sectionBody}>{section.body}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity 
          style={styles.checkboxContainer} 
          activeOpacity={0.7} 
          onPress={() => setAccepted(!accepted)}
        >
          <View style={[styles.checkbox, accepted && styles.checkboxChecked]}>
            {accepted && <Ionicons name="checkmark" size={16} color={Colors.white} />}
          </View>
          <Text style={styles.checkboxLabel}>
            I have read, understood, and agree to the Rollbowl Membership Terms & Conditions.
          </Text>
        </TouchableOpacity>

        <Button 
          title="Accept & Continue" 
          onPress={handleContinue} 
          disabled={!accepted}
          fullWidth 
        />
      </View>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: Spacing.xl,
  },
  header: {
    paddingVertical: Spacing.xl,
    paddingBottom: Spacing.md,
  },
  title: {
    fontSize: Typography.size.xl,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
  },
  subtitle: {
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
  },
  documentContainer: {
    backgroundColor: Colors.surface,
    borderRadius: Radii.lg,
    padding: Spacing.lg,
    marginTop: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  documentTitle: {
    fontSize: Typography.size.lg,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    marginBottom: Spacing.lg,
    textAlign: 'center',
  },
  section: {
    marginBottom: Spacing.lg,
  },
  sectionHeading: {
    fontSize: Typography.size.base,
    fontFamily: Typography.family.semiBold,
    color: Colors.primary,
    marginBottom: Spacing.sm,
  },
  sectionBody: {
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
    lineHeight: 22,
  },
  footer: {
    padding: Spacing.lg,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: Spacing.lg,
    paddingRight: Spacing.md,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Colors.border,
    marginRight: Spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  checkboxChecked: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  checkboxLabel: {
    flex: 1,
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
    lineHeight: 20,
    fontFamily: Typography.family.medium,
  },
});
