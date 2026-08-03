import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radii, Shadows } from '@/src/constants/theme';
import { ScreenWrapper, Section } from '@/src/components/layout';

const SUPPORT_PHONE = '+91 XXXXX XXXXX';
const SUPPORT_EMAIL = 'support@rollbowl.in';

export default function HelpScreen() {
  const router = useRouter();

  const copyToClipboard = async (text: string, label: string) => {
    await Clipboard.setStringAsync(text);
    Alert.alert('Copied', `${label} copied to clipboard.`);
  };

  const openDialer = () => {
    Linking.openURL('tel:+91XXXXXXXXXX').catch(() => {
      Alert.alert('Error', 'Could not open phone dialer.');
    });
  };

  const openEmail = () => {
    Linking.openURL(`mailto:${SUPPORT_EMAIL}`).catch(() => {
      Alert.alert('Error', 'Could not open email app.');
    });
  };

  return (
    <ScreenWrapper>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Help & Support</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.infoCard}>
          <Text style={styles.headingText}>Need help?</Text>
          <Text style={styles.bodyText}>
            For support regarding orders, subscriptions or payments, contact us.
          </Text>
        </View>

        <Section title="Contact Information">
          <View style={styles.card}>
            <View style={styles.row}>
              <View style={styles.iconCircle}>
                <Ionicons name="call-outline" size={20} color={Colors.primary} />
              </View>
              <View style={styles.details}>
                <Text style={styles.label}>Phone</Text>
                <Text style={styles.value}>{SUPPORT_PHONE}</Text>
              </View>
              <View style={styles.actions}>
                <TouchableOpacity onPress={openDialer} style={styles.actionBtn}>
                  <Ionicons name="call" size={18} color={Colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => copyToClipboard(SUPPORT_PHONE, 'Phone number')} style={styles.actionBtn}>
                  <Ionicons name="copy-outline" size={18} color={Colors.textSecondary} />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.row}>
              <View style={styles.iconCircle}>
                <Ionicons name="mail-outline" size={20} color={Colors.primary} />
              </View>
              <View style={styles.details}>
                <Text style={styles.label}>Email</Text>
                <Text style={styles.value}>{SUPPORT_EMAIL}</Text>
              </View>
              <View style={styles.actions}>
                <TouchableOpacity onPress={openEmail} style={styles.actionBtn}>
                  <Ionicons name="mail" size={18} color={Colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => copyToClipboard(SUPPORT_EMAIL, 'Email address')} style={styles.actionBtn}>
                  <Ionicons name="copy-outline" size={18} color={Colors.textSecondary} />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.row}>
              <View style={styles.iconCircle}>
                <Ionicons name="time-outline" size={20} color={Colors.primary} />
              </View>
              <View style={styles.details}>
                <Text style={styles.label}>Working Hours</Text>
                <Text style={styles.value}>Mon–Sat</Text>
                <Text style={styles.subValue}>9:00 AM – 8:00 PM</Text>
              </View>
            </View>
          </View>
        </Section>
      </ScrollView>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    paddingBottom: Spacing.md,
  },
  backButton: {
    marginRight: Spacing.md,
  },
  title: {
    fontSize: Typography.size.xl,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
  },
  content: {
    paddingBottom: Spacing.xl,
  },
  infoCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radii.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    ...Shadows.sm,
  },
  headingText: {
    fontSize: Typography.size.lg,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  bodyText: {
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radii.lg,
    padding: Spacing.lg,
    ...Shadows.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primaryBg,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  details: {
    flex: 1,
  },
  label: {
    fontSize: Typography.size.xs,
    fontFamily: Typography.family.medium,
    color: Colors.textSecondary,
  },
  value: {
    fontSize: Typography.size.base,
    fontFamily: Typography.family.semiBold,
    color: Colors.textPrimary,
    marginTop: 2,
  },
  subValue: {
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionBtn: {
    padding: Spacing.sm,
    marginLeft: Spacing.xs,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.borderLight,
    marginVertical: Spacing.sm,
  },
});
