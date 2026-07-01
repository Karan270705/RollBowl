import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radii, Shadows } from '@/src/constants/theme';
import { ScreenWrapper } from '@/src/components/layout';
import { useUser, useAuthStore } from '@/src/store';
import { MOCK_COLLEGES, MOCK_CITIES } from '@/src/constants/mockData';
import { getInitials } from '@/src/utils/formatters';

const MENU_ITEMS = [
  { icon: 'location-outline' as const, label: 'Saved Addresses', route: '/(tabs)/(profile)/addresses' },
  { icon: 'card-outline' as const, label: 'Payment History', route: '/(tabs)/(profile)/payment-history' },
  { icon: 'settings-outline' as const, label: 'Settings', route: '/(tabs)/(profile)/settings' },
  { icon: 'help-circle-outline' as const, label: 'Help & Support', route: '/(tabs)/(profile)/help' },
  { icon: 'document-text-outline' as const, label: 'Terms & Privacy', route: '/(tabs)/(profile)/terms' },
];

export default function ProfileScreen() {
  const router = useRouter();
  const user = useUser();
  const logout = useAuthStore((s) => s.logout);
  const college = MOCK_COLLEGES.find((c) => c.id === user?.collegeId);
  const city = MOCK_CITIES.find((c) => c.id === user?.cityId);

  return (
    <ScreenWrapper>
      <Text style={styles.title}>Profile</Text>

      {/* User Card */}
      <TouchableOpacity 
        style={styles.userCard} 
        onPress={() => router.push('/(tabs)/(profile)/edit' as any)}
        activeOpacity={0.8}
      >
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{getInitials(user?.name ?? 'U')}</Text>
        </View>
        <View style={styles.userInfo}>
          <Text style={styles.userName}>{user?.name}</Text>
          <Text style={styles.userEmail}>{user?.email}</Text>
          <Text style={styles.userCollege}>{college?.name} • {city?.name}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={Colors.textTertiary} />
      </TouchableOpacity>

      {/* Menu */}
      <View style={styles.menuCard}>
        {MENU_ITEMS.map((item, i) => (
          <TouchableOpacity 
            key={i} 
            style={[styles.menuItem, i < MENU_ITEMS.length - 1 && styles.menuBorder]}
            onPress={() => router.push(item.route as any)}
          >
            <Ionicons name={item.icon} size={22} color={Colors.textSecondary} />
            <Text style={styles.menuLabel}>{item.label}</Text>
            <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity style={styles.logoutBtn} onPress={() => { logout(); router.replace('/(auth)/login'); }}>
        <Ionicons name="log-out-outline" size={22} color={Colors.error} />
        <Text style={styles.logoutText}>Logout</Text>
      </TouchableOpacity>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: Typography.size.xl, fontFamily: Typography.family.bold, color: Colors.textPrimary, paddingTop: Spacing.xl, marginBottom: Spacing.base },
  userCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.base, backgroundColor: Colors.surface, borderRadius: Radii.xl, padding: Spacing.xl, ...Shadows.md, marginBottom: Spacing.base },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.primaryBg, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: Typography.size.lg, fontFamily: Typography.family.bold, color: Colors.primary },
  userInfo: { flex: 1 },
  userName: { fontSize: Typography.size.md, fontFamily: Typography.family.bold, color: Colors.textPrimary },
  userEmail: { fontSize: Typography.size.sm, color: Colors.textSecondary, marginTop: 2 },
  userCollege: { fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: 2 },
  subCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.primaryBg, borderRadius: Radii.lg, padding: Spacing.base, marginBottom: Spacing.base },
  subInfo: { flex: 1 },
  subName: { fontSize: Typography.size.sm, fontFamily: Typography.family.semiBold, color: Colors.textPrimary },
  subDetail: { fontSize: Typography.size.xs, color: Colors.textSecondary },
  manageText: { fontSize: Typography.size.sm, fontFamily: Typography.family.semiBold, color: Colors.primary },
  menuCard: { backgroundColor: Colors.surface, borderRadius: Radii.xl, ...Shadows.sm, marginBottom: Spacing.xl },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.base },
  menuBorder: { borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  menuLabel: { flex: 1, fontSize: Typography.size.base, fontFamily: Typography.family.regular, color: Colors.textPrimary },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, padding: Spacing.base },
  logoutText: { fontSize: Typography.size.base, fontFamily: Typography.family.medium, color: Colors.error },
});
