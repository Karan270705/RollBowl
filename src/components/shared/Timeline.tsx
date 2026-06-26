import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radii } from '@/src/constants/theme';

export interface TimelineStep {
  id: string;
  title: string;
  description?: string;
  time?: string;
  isCompleted: boolean;
  isActive: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
}

interface TimelineProps {
  steps: TimelineStep[];
}

export const Timeline: React.FC<TimelineProps> = ({ steps }) => {
  return (
    <View style={styles.container}>
      {steps.map((step, index) => {
        const isLast = index === steps.length - 1;
        
        return (
          <View key={step.id} style={styles.stepContainer}>
            {/* Left side: Icon & Line */}
            <View style={styles.indicatorContainer}>
              <View 
                style={[
                  styles.iconContainer, 
                  step.isCompleted ? styles.iconCompleted : step.isActive ? styles.iconActive : styles.iconPending
                ]}
              >
                {step.isCompleted ? (
                  <Ionicons name="checkmark" size={16} color={Colors.white} />
                ) : step.icon ? (
                  <Ionicons 
                    name={step.icon} 
                    size={16} 
                    color={step.isActive ? Colors.primary : Colors.textTertiary} 
                  />
                ) : (
                  <View style={[styles.dot, step.isActive && styles.dotActive]} />
                )}
              </View>
              
              {!isLast && (
                <View 
                  style={[
                    styles.line, 
                    step.isCompleted ? styles.lineCompleted : styles.linePending
                  ]} 
                />
              )}
            </View>

            {/* Right side: Content */}
            <View style={styles.contentContainer}>
              <View style={styles.titleRow}>
                <Text 
                  style={[
                    styles.title, 
                    step.isActive && styles.titleActive,
                    !step.isCompleted && !step.isActive && styles.titlePending
                  ]}
                >
                  {step.title}
                </Text>
                {step.time && (
                  <Text style={styles.time}>{step.time}</Text>
                )}
              </View>
              {step.description && (
                <Text style={styles.description}>{step.description}</Text>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: Spacing.base,
  },
  stepContainer: {
    flexDirection: 'row',
    minHeight: 80,
  },
  indicatorContainer: {
    alignItems: 'center',
    width: 40,
    marginRight: Spacing.md,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: Radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  iconCompleted: {
    backgroundColor: Colors.success,
  },
  iconActive: {
    backgroundColor: Colors.primaryBg,
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  iconPending: {
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.textTertiary,
  },
  dotActive: {
    backgroundColor: Colors.primary,
  },
  line: {
    width: 2,
    flex: 1,
    marginTop: -4,
    marginBottom: -4,
  },
  lineCompleted: {
    backgroundColor: Colors.success,
  },
  linePending: {
    backgroundColor: Colors.border,
  },
  contentContainer: {
    flex: 1,
    paddingTop: 4,
    paddingBottom: Spacing.xl,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  title: {
    fontSize: Typography.size.base,
    fontFamily: Typography.family.semiBold,
    color: Colors.textPrimary,
  },
  titleActive: {
    color: Colors.primary,
  },
  titlePending: {
    color: Colors.textSecondary,
    fontFamily: Typography.family.medium,
  },
  time: {
    fontSize: Typography.size.xs,
    color: Colors.textTertiary,
  },
  description: {
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
});
