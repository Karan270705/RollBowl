/**
 * RollBowl Design System
 * Centralized theme tokens for consistent UI across all modules.
 */

export const Colors = {
  // Brand — extracted from RollBowl logo
  primary: '#C41E24',       // Brand Crimson Red (main logo text)
  primaryLight: '#F9D4D5',
  primaryDark: '#9B1B20',
  primaryBg: '#FEF2F2',

  secondary: '#F5A623',     // Brand Amber/Gold (the "ll" accent bar)
  secondaryLight: '#FDE68A',
  secondaryDark: '#D97706',

  accent: '#2E7D32',        // Brand Green (tagline: "Healthy Choice")
  accentLight: '#C8E6C9',

  // Supporting
  brandOrange: '#E87A1E',   // Logo circle ring
  brandOrangeBg: '#FFF4E6',

  // Semantic
  success: '#2E7D32',       // Aligned with brand green
  successLight: '#E8F5E9',
  successDark: '#1B5E20',

  warning: '#F5A623',       // Aligned with brand amber
  warningLight: '#FFF8E1',
  warningDark: '#E65100',

  error: '#C41E24',         // Aligned with brand red
  errorLight: '#FFEBEE',
  errorDark: '#9B1B20',

  info: '#1565C0',
  infoLight: '#E3F2FD',
  infoDark: '#0D47A1',

  // Neutrals
  white: '#FFFFFF',
  black: '#000000',
  background: '#FAFAF8',    // Warm off-white
  surface: '#FFFFFF',
  surfaceElevated: '#F5F4F0',

  // Text
  textPrimary: '#1A1A1A',
  textSecondary: '#5F6368',
  textTertiary: '#9AA0A6',
  textInverse: '#FFFFFF',
  textLink: '#C41E24',

  // Borders & Dividers
  border: '#E0E0E0',
  borderLight: '#F0EFEB',
  divider: '#EEEDE9',

  // Overlay
  overlay: 'rgba(0, 0, 0, 0.5)',
  overlayLight: 'rgba(0, 0, 0, 0.08)',
} as const;

export const Typography = {
  family: {
    regular: 'Inter_400Regular',
    medium: 'Inter_500Medium',
    semiBold: 'Inter_600SemiBold',
    bold: 'Inter_700Bold',
  },
  size: {
    xs: 11,
    sm: 13,
    base: 15,
    md: 17,
    lg: 20,
    xl: 24,
    '2xl': 30,
    '3xl': 36,
  },
  lineHeight: {
    xs: 16,
    sm: 18,
    base: 22,
    md: 24,
    lg: 28,
    xl: 32,
    '2xl': 38,
    '3xl': 44,
  },
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  '2xl': 32,
  '3xl': 40,
  '4xl': 48,
  '5xl': 64,
} as const;

export const Radii = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  full: 9999,
} as const;

export const Shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 6,
  },
} as const;

export const IconSizes = {
  xs: 14,
  sm: 18,
  md: 22,
  lg: 28,
  xl: 36,
} as const;

const theme = { Colors, Typography, Spacing, Radii, Shadows, IconSizes };
export default theme;
