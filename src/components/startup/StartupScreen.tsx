import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Image, ActivityIndicator, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  useReducedMotion,
  Easing,
} from 'react-native-reanimated';
import { Colors, Typography, Spacing, Radii } from '@/src/constants/theme';
import { Button } from '@/src/components/ui/Button';

interface StartupScreenProps {
  error?: boolean;
  onRetry?: () => void;
  onSignOut?: () => void;
  showSignOut?: boolean;
  style?: ViewStyle;
}

export const StartupScreen: React.FC<StartupScreenProps> = ({
  error = false,
  onRetry,
  onSignOut,
  showSignOut = false,
  style,
}) => {
  const opacity = useSharedValue(error ? 1 : 0.7);
  const scale = useSharedValue(1);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion || error) {
      opacity.value = 1;
      scale.value = 1;
      return;
    }
    opacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.7, { duration: 1000, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, [error, reducedMotion]);

  const logoAnimatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <View style={[styles.container, style]}>
      <Animated.View style={[styles.logoContainer, logoAnimatedStyle]}>
        <Image
          source={require('@/assets/images/icon.png')}
          style={styles.logoImage}
          resizeMode="contain"
        />
      </Animated.View>

      <Text style={styles.brandTitle}>RollBowl</Text>

      {!error ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={Colors.primary} />
        </View>
      ) : (
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>RollBowl is taking longer than expected</Text>
          <Text style={styles.errorBody}>
            {"We couldn't finish loading the app. Check your connection and try again."}
          </Text>

          <View style={styles.actions}>
            {onRetry ? (
              <Button
                title="Try Again"
                onPress={onRetry}
                variant="primary"
                size="md"
                fullWidth
                style={styles.retryButton}
              />
            ) : null}

            {showSignOut && onSignOut ? (
              <Button
                title="Sign Out"
                onPress={onSignOut}
                variant="ghost"
                size="md"
                fullWidth
                style={styles.signOutButton}
              />
            ) : null}
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background, // '#FAFAF8' warm off-white
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing['2xl'],
  },
  logoContainer: {
    width: 96,
    height: 96,
    borderRadius: Radii['2xl'],
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  logoImage: {
    width: 64,
    height: 64,
  },
  brandTitle: {
    fontSize: Typography.size['2xl'],
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    marginBottom: Spacing.lg,
  },
  loadingContainer: {
    marginTop: Spacing.sm,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorContainer: {
    alignItems: 'center',
    marginTop: Spacing.md,
    maxWidth: 320,
  },
  errorTitle: {
    fontSize: Typography.size.lg,
    fontFamily: Typography.family.semiBold,
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  errorBody: {
    fontSize: Typography.size.sm,
    fontFamily: Typography.family.regular,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: Spacing.xl,
    lineHeight: 20,
  },
  actions: {
    width: '100%',
    gap: Spacing.sm,
    alignItems: 'center',
  },
  retryButton: {
    minHeight: 44,
  },
  signOutButton: {
    minHeight: 44,
  },
});

export default StartupScreen;
