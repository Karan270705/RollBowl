import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Colors, Typography, Spacing, Radii } from '@/src/constants/theme';
import { MealCategory } from '@/src/constants/enums';

const CATEGORIES = [
  { key: 'all' as const, label: 'All', icon: '🍽️' },
  { key: MealCategory.BREAKFAST, label: 'Breakfast', icon: '🥞' },
  { key: MealCategory.LUNCH, label: 'Lunch', icon: '🍛' },
  { key: MealCategory.DINNER, label: 'Dinner', icon: '🍲' },
  { key: MealCategory.SNACKS, label: 'Snacks', icon: '🍟' },
  { key: MealCategory.BEVERAGES, label: 'Drinks', icon: '☕' },
  { key: MealCategory.COMBOS, label: 'Combos', icon: '🎁' },
];

interface CategoryPillsProps {
  selected: string;
  onSelect: (category: string) => void;
}

export const CategoryPills: React.FC<CategoryPillsProps> = ({ selected, onSelect }) => {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}>
      {CATEGORIES.map((cat) => {
        const isActive = selected === cat.key;
        return (
          <TouchableOpacity
            key={cat.key}
            style={[styles.pill, isActive && styles.active]}
            onPress={() => onSelect(cat.key)}
            activeOpacity={0.7}
          >
            <Text style={styles.emoji}>{cat.icon}</Text>
            <Text style={[styles.label, isActive && styles.activeLabel]}>{cat.label}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  scroll: { paddingVertical: Spacing.sm, gap: Spacing.sm },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.xs,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderRadius: Radii.full, backgroundColor: Colors.surfaceElevated,
    borderWidth: 1, borderColor: Colors.border,
  },
  active: { backgroundColor: Colors.primaryBg, borderColor: Colors.primary },
  emoji: { fontSize: 16 },
  label: { fontSize: Typography.size.sm, fontFamily: Typography.family.medium, color: Colors.textSecondary },
  activeLabel: { color: Colors.primary, fontFamily: Typography.family.semiBold },
});
