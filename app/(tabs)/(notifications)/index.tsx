import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radii, Shadows } from '@/src/constants/theme';
import { ScreenWrapper } from '@/src/components/layout';
import { EmptyState } from '@/src/components/ui';
import { MOCK_NOTIFICATIONS } from '@/src/constants/mockData';
import { NotificationType } from '@/src/constants/enums';
import { formatRelativeTime } from '@/src/utils/formatters';

const ICON_MAP: Record<NotificationType, keyof typeof Ionicons.glyphMap> = {
  [NotificationType.ORDER_UPDATE]: 'receipt-outline',
  [NotificationType.PROMOTION]: 'gift-outline',
  [NotificationType.SUBSCRIPTION]: 'card-outline',
  [NotificationType.SYSTEM]: 'information-circle-outline',
};

const TABS = ['All', 'Orders', 'Promos'] as const;

export default function NotificationsScreen() {
  const [tab, setTab] = useState<typeof TABS[number]>('All');
  const [readIds, setReadIds] = useState<string[]>([]);

  const filtered = tab === 'All' ? MOCK_NOTIFICATIONS
    : tab === 'Orders' ? MOCK_NOTIFICATIONS.filter(n => n.type === NotificationType.ORDER_UPDATE)
    : MOCK_NOTIFICATIONS.filter(n => n.type === NotificationType.PROMOTION);

  return (
    <ScreenWrapper>
      <Text style={styles.title}>Notifications</Text>
      <View style={styles.tabs}>
        {TABS.map((t) => (
          <TouchableOpacity key={t} style={[styles.tab, tab === t && styles.tabActive]} onPress={() => setTab(t)}>
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {filtered.length === 0 ? (
        <EmptyState icon="notifications-off-outline" title="No notifications" subtitle="You're all caught up!" />
      ) : (
        filtered.map((n) => {
          const isRead = n.isRead || readIds.includes(n.id);
          return (
          <TouchableOpacity 
            key={n.id} 
            style={[styles.notifCard, !isRead && styles.unread]}
            onPress={() => {
              if (!isRead) {
                setReadIds([...readIds, n.id]);
              }
            }}
            activeOpacity={0.7}
          >
            <View style={[styles.notifIcon, !isRead && styles.notifIconUnread]}>
              <Ionicons name={ICON_MAP[n.type]} size={20} color={!isRead ? Colors.primary : Colors.textTertiary} />
            </View>
            <View style={styles.notifContent}>
              <Text style={[styles.notifTitle, !isRead && styles.notifTitleUnread]}>{n.title}</Text>
              <Text style={styles.notifBody} numberOfLines={2}>{n.body}</Text>
              <Text style={styles.notifTime}>{formatRelativeTime(n.createdAt)}</Text>
            </View>
            {!isRead && <View style={styles.unreadDot} />}
          </TouchableOpacity>
          );
        })
      )}
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: Typography.size.xl, fontFamily: Typography.family.bold, color: Colors.textPrimary, paddingTop: Spacing.xl },
  tabs: { flexDirection: 'row', gap: Spacing.sm, marginVertical: Spacing.base },
  tab: { paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm, borderRadius: Radii.full, backgroundColor: Colors.surfaceElevated },
  tabActive: { backgroundColor: Colors.primary },
  tabText: { fontSize: Typography.size.sm, fontFamily: Typography.family.medium, color: Colors.textSecondary },
  tabTextActive: { color: Colors.white },
  notifCard: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, padding: Spacing.base, borderRadius: Radii.lg, marginBottom: Spacing.sm, backgroundColor: Colors.surface },
  unread: { backgroundColor: Colors.primaryBg },
  notifIcon: { width: 40, height: 40, borderRadius: Radii.md, backgroundColor: Colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' },
  notifIconUnread: { backgroundColor: Colors.white },
  notifContent: { flex: 1 },
  notifTitle: { fontSize: Typography.size.sm, fontFamily: Typography.family.medium, color: Colors.textPrimary },
  notifTitleUnread: { fontFamily: Typography.family.semiBold },
  notifBody: { fontSize: Typography.size.sm, color: Colors.textSecondary, marginTop: 2, lineHeight: 18 },
  notifTime: { fontSize: Typography.size.xs, color: Colors.textTertiary, marginTop: Spacing.xs },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.primary, marginTop: 4 },
});
