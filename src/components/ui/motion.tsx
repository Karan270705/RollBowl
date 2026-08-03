import React, { useEffect, useRef } from 'react';
import { ViewStyle, Pressable, PressableProps } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  useReducedMotion,
  Easing,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/src/constants/theme';

interface MotionWrapperProps {
  children: React.ReactNode;
  style?: ViewStyle;
  duration?: number;
  delay?: number;
  once?: boolean;
}

export const FadeIn: React.FC<MotionWrapperProps> = ({
  children,
  style,
  duration = 250,
  delay = 0,
}) => {
  const opacity = useSharedValue(0);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) {
      opacity.value = 1;
      return;
    }
    const timer = setTimeout(() => {
      opacity.value = withTiming(1, {
        duration,
        easing: Easing.out(Easing.ease),
      });
    }, delay);
    return () => clearTimeout(timer);
  }, [reducedMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return <Animated.View style={[animatedStyle, style]}>{children}</Animated.View>;
};

export const FadeUp: React.FC<MotionWrapperProps> = ({
  children,
  style,
  duration = 300,
  delay = 0,
}) => {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(12);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) {
      opacity.value = 1;
      translateY.value = 0;
      return;
    }
    const timer = setTimeout(() => {
      opacity.value = withTiming(1, { duration });
      translateY.value = withTiming(0, {
        duration,
        easing: Easing.out(Easing.cubic),
      });
    }, delay);
    return () => clearTimeout(timer);
  }, [reducedMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return <Animated.View style={[animatedStyle, style]}>{children}</Animated.View>;
};

export const ScaleIn: React.FC<MotionWrapperProps> = ({
  children,
  style,
  duration = 250,
  delay = 0,
}) => {
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.95);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) {
      opacity.value = 1;
      scale.value = 1;
      return;
    }
    const timer = setTimeout(() => {
      opacity.value = withTiming(1, { duration });
      scale.value = withTiming(1, { duration, easing: Easing.out(Easing.cubic) });
    }, delay);
    return () => clearTimeout(timer);
  }, [reducedMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return <Animated.View style={[animatedStyle, style]}>{children}</Animated.View>;
};

interface PressableScaleProps extends PressableProps {
  children: React.ReactNode;
  style?: ViewStyle;
  activeScale?: number;
}

export const PressableScale: React.FC<PressableScaleProps> = ({
  children,
  style,
  activeScale = 0.97,
  onPressIn,
  onPressOut,
  ...rest
}) => {
  const scale = useSharedValue(1);
  const reducedMotion = useReducedMotion();

  const handlePressIn = (e: any) => {
    if (!reducedMotion) {
      scale.value = withTiming(activeScale, { duration: 100 });
    }
    if (onPressIn) onPressIn(e);
  };

  const handlePressOut = (e: any) => {
    if (!reducedMotion) {
      scale.value = withTiming(1, { duration: 150 });
    }
    if (onPressOut) onPressOut(e);
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Pressable onPressIn={handlePressIn} onPressOut={handlePressOut} {...rest}>
      <Animated.View style={[animatedStyle, style]}>{children}</Animated.View>
    </Pressable>
  );
};

export const CardEntrance: React.FC<MotionWrapperProps> = ({
  children,
  style,
  duration = 280,
  delay = 0,
}) => {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(8);
  const hasAnimated = useRef(false);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion || hasAnimated.current) {
      opacity.value = 1;
      translateY.value = 0;
      return;
    }
    hasAnimated.current = true;
    const timer = setTimeout(() => {
      opacity.value = withTiming(1, { duration });
      translateY.value = withTiming(0, {
        duration,
        easing: Easing.out(Easing.cubic),
      });
    }, delay);
    return () => clearTimeout(timer);
  }, [reducedMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return <Animated.View style={[animatedStyle, style]}>{children}</Animated.View>;
};

interface SuccessCheckEntranceProps {
  size?: number;
  color?: string;
  style?: ViewStyle;
}

export const SuccessCheckEntrance: React.FC<SuccessCheckEntranceProps> = ({
  size = 48,
  color = Colors.success,
  style,
}) => {
  const scale = useSharedValue(0.4);
  const opacity = useSharedValue(0);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) {
      scale.value = 1;
      opacity.value = 1;
      return;
    }
    opacity.value = withTiming(1, { duration: 200 });
    scale.value = withSpring(1, {
      damping: 12,
      stiffness: 140,
    });
  }, [reducedMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={[animatedStyle, style]}>
      <Ionicons name="checkmark-circle" size={size} color={color} />
    </Animated.View>
  );
};
