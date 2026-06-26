import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radii, Shadows } from '@/src/constants/theme';
import { ScreenWrapper, Section } from '@/src/components/layout';

const FAQS = [
  { question: 'How do I cancel my subscription?', answer: 'You can cancel your subscription at any time from the Subscription tab. Your plan will remain active until the end of the current billing cycle.' },
  { question: 'What happens if I miss a meal pickup?', answer: 'Unclaimed meals will expire at the end of the service period and cannot be rolled over to the next day.' },
  { question: 'How can I change my dietary preferences?', answer: 'You can update your dietary preferences in the Edit Profile screen.' },
];

export default function HelpScreen() {
  const router = useRouter();

  return (
    <ScreenWrapper>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Help & Support</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        
        <Section title="Contact Us">
          <View style={styles.contactContainer}>
            <TouchableOpacity style={styles.contactCard}>
              <View style={styles.iconCircle}>
                <Ionicons name="chatbubbles-outline" size={24} color={Colors.primary} />
              </View>
              <Text style={styles.contactTitle}>Live Chat</Text>
              <Text style={styles.contactSubtitle}>Typical reply in 5m</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.contactCard}>
              <View style={styles.iconCircle}>
                <Ionicons name="mail-outline" size={24} color={Colors.primary} />
              </View>
              <Text style={styles.contactTitle}>Email Us</Text>
              <Text style={styles.contactSubtitle}>support@rollbowl.com</Text>
            </TouchableOpacity>
          </View>
        </Section>

        <Section title="Frequently Asked Questions">
          <View style={styles.faqCard}>
            {FAQS.map((faq, index) => (
              <View key={index}>
                <View style={styles.faqItem}>
                  <Text style={styles.question}>{faq.question}</Text>
                  <Text style={styles.answer}>{faq.answer}</Text>
                </View>
                {index < FAQS.length - 1 && <View style={styles.divider} />}
              </View>
            ))}
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
    paddingBottom: Spacing.xxl,
  },
  contactContainer: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  contactCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: Radii.lg,
    padding: Spacing.lg,
    alignItems: 'center',
    ...Shadows.sm,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.primaryBg,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  contactTitle: {
    fontSize: Typography.size.base,
    fontFamily: Typography.family.semiBold,
    color: Colors.textPrimary,
  },
  contactSubtitle: {
    fontSize: Typography.size.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  faqCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radii.lg,
    paddingHorizontal: Spacing.lg,
    ...Shadows.sm,
  },
  faqItem: {
    paddingVertical: Spacing.md,
  },
  question: {
    fontSize: Typography.size.base,
    fontFamily: Typography.family.medium,
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  answer: {
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.borderLight,
  },
});
