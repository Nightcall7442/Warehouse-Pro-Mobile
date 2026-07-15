// ═══════════════════════════════════════════════════════════════════════════════
// Warehouse Pro — Neumorphic Design System v2
// Matches web neumorphic soft UI exactly.
// ═══════════════════════════════════════════════════════════════════════════════

import { StyleSheet, Platform } from "react-native";

// ── Colors ────────────────────────────────────────────────────────────────────
export const Colors = {
  // Light mode — warm beige canvas
  light: {
    bg: {
      primary: "#f2f0ec",
      secondary: "#fbfaf8",
      card: "#f6f4f0",
      elevated: "#f8f6f2",
      input: "#f6f4f0",
    },
    border: {
      default: "#e4e0d8",
      subtle: "#ebe7e0",
    },
    text: {
      primary: "#2b2a28",
      secondary: "#6b675f",
      tertiary: "#9a968c",
    },
    accent: {
      primary: "#4b6cf6",
      success: "#34c473",
      danger: "#e85050",
      warning: "#e8a830",
    },
  },
  // Dark mode — charcoal canvas with cyan accent
  dark: {
    bg: {
      primary: "#1c1a17",
      secondary: "#221f1c",
      card: "#221f1c",
      elevated: "#262320",
      input: "#221f1c",
    },
    border: {
      default: "#322e28",
      subtle: "#2a2622",
    },
    text: {
      primary: "#ede9e3",
      secondary: "#a39d92",
      tertiary: "#756f64",
    },
    accent: {
      primary: "#00d4ff",
      success: "#00e68a",
      danger: "#ff4d6a",
      warning: "#ffb020",
    },
  },
};

// ── Neumorphic Shadows ────────────────────────────────────────────────────────
// Light mode: warm dual-tone shadows
// Dark mode: deep shadows with subtle highlights
export const NeuShadows = {
  light: {
    // Raised card — the classic neumorphic look
    raised: {
      shadowColor: "#a3b1c6",
      shadowOffset: { width: 8, height: 8 },
      shadowOpacity: 0.35,
      shadowRadius: 16,
      elevation: 8,
    },
    // Subtle raised
    sm: {
      shadowColor: "#a3b1c6",
      shadowOffset: { width: 3, height: 3 },
      shadowOpacity: 0.25,
      shadowRadius: 8,
      elevation: 3,
    },
    // Pressed/inset effect
    inset: {
      shadowColor: "#a3b1c6",
      shadowOffset: { width: -3, height: -3 },
      shadowOpacity: 0.2,
      shadowRadius: 6,
      elevation: -1,
    },
  },
  dark: {
    raised: {
      shadowColor: "#000000",
      shadowOffset: { width: 8, height: 8 },
      shadowOpacity: 0.5,
      shadowRadius: 16,
      elevation: 8,
    },
    sm: {
      shadowColor: "#000000",
      shadowOffset: { width: 3, height: 3 },
      shadowOpacity: 0.4,
      shadowRadius: 8,
      elevation: 3,
    },
    inset: {
      shadowColor: "#000000",
      shadowOffset: { width: -3, height: -3 },
      shadowOpacity: 0.3,
      shadowRadius: 6,
      elevation: -1,
    },
  },
};

// ── Typography ────────────────────────────────────────────────────────────────
export const Typography = {
  // Font families
  regular: Platform.select({ ios: "DM Sans", android: "DMSans-Regular", default: "System" }),
  medium: Platform.select({ ios: "DM Sans", android: "DMSans-Medium", default: "System" }),
  semibold: Platform.select({ ios: "DM Sans", android: "DMSans-SemiBold", default: "System" }),
  bold: Platform.select({ ios: "DM Sans", android: "DMSans-Bold", default: "System" }),
  
  // Font sizes
  size: {
    xs: 11,
    sm: 13,
    base: 14,
    md: 15,
    lg: 17,
    xl: 20,
    xxl: 24,
    "2xl": 28,
    xxxl: 32,
    display: 36,
  },
  
  // Line heights
  lineHeight: {
    tight: 1.2,
    snug: 1.35,
    normal: 1.5,
    relaxed: 1.65,
  },
};

// ── Spacing ───────────────────────────────────────────────────────────────────
export const Spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  base: 14,
  lg: 16,
  xl: 20,
  "2xl": 24,
  xxl: 32,
  "3xl": 40,
  xxxl: 48,
};

// ── Border Radius ─────────────────────────────────────────────────────────────
export const Radii = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 16,
  xl: 20,
  xxl: 24,
  full: 999,
};

// ── Neumorphic Styles ─────────────────────────────────────────────────────────
export const createNeuStyles = (isDark: boolean) => {
  const colors = isDark ? Colors.dark : Colors.light;
  const shadows = isDark ? NeuShadows.dark : NeuShadows.light;

  return StyleSheet.create({
    // Card styles
    card: {
      backgroundColor: colors.bg.card,
      borderRadius: Radii.xl,
      borderWidth: 1,
      borderColor: colors.border.default,
      ...shadows.raised,
    },
    cardSm: {
      backgroundColor: colors.bg.card,
      borderRadius: Radii.lg,
      borderWidth: 1,
      borderColor: colors.border.default,
      ...shadows.sm,
    },
    cardInset: {
      backgroundColor: colors.bg.input,
      borderRadius: Radii.lg,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      ...shadows.inset,
    },
    
    // Button styles
    btn: {
      backgroundColor: colors.bg.card,
      borderRadius: Radii.xl,
      borderWidth: 1,
      borderColor: colors.border.default,
      paddingVertical: 14,
      paddingHorizontal: 24,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      ...shadows.sm,
    },
    btnPrimary: {
      backgroundColor: colors.accent.primary,
      borderRadius: Radii.xl,
      paddingVertical: 14,
      paddingHorizontal: 24,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      ...shadows.sm,
    },
    btnDanger: {
      backgroundColor: colors.accent.danger,
      borderRadius: Radii.xl,
      paddingVertical: 14,
      paddingHorizontal: 24,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      ...shadows.sm,
    },
    
    // Input styles
    input: {
      backgroundColor: colors.bg.input,
      borderRadius: Radii.xl,
      borderWidth: 1,
      borderColor: colors.border.subtle,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: Typography.size.base,
      color: colors.text.primary,
      ...shadows.inset,
    },
    inputFocused: {
      backgroundColor: colors.bg.input,
      borderRadius: Radii.xl,
      borderWidth: 2,
      borderColor: colors.accent.primary,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: Typography.size.base,
      color: colors.text.primary,
      ...shadows.inset,
    },
    
    // Badge styles
    badge: {
      backgroundColor: colors.accent.primary,
      borderRadius: Radii.full,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    badgeSuccess: {
      backgroundColor: colors.accent.success,
      borderRadius: Radii.full,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    badgeDanger: {
      backgroundColor: colors.accent.danger,
      borderRadius: Radii.full,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    badgeWarning: {
      backgroundColor: colors.accent.warning,
      borderRadius: Radii.full,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    
    // Tab styles
    tab: {
      backgroundColor: colors.bg.secondary,
      borderRadius: Radii.lg,
      padding: 4,
    },
    tabActive: {
      backgroundColor: colors.bg.card,
      borderRadius: Radii.lg,
      padding: 4,
      ...shadows.sm,
    },
    
    // Avatar styles
    avatar: {
      width: 48,
      height: 48,
      borderRadius: Radii.full,
      backgroundColor: colors.accent.primary + "20",
      borderWidth: 2,
      borderColor: colors.accent.primary + "40",
    },
    avatarLg: {
      width: 80,
      height: 80,
      borderRadius: Radii.full,
      backgroundColor: colors.accent.primary + "20",
      borderWidth: 3,
      borderColor: colors.accent.primary + "40",
    },
    
    // Divider
    divider: {
      height: 1,
      backgroundColor: colors.border.default,
      marginVertical: Spacing.md,
    },
    
    // Section header
    sectionHeader: {
      fontSize: Typography.size.xs,
      fontWeight: "600" as const,
      color: colors.text.tertiary,
      letterSpacing: 1.5,
      textTransform: "uppercase" as const,
      marginBottom: Spacing.sm,
    },
  });
};

// ── Helper: Get color for status ──────────────────────────────────────────────
export const getStatusColor = (isDark: boolean, status: string): string => {
  const colors = isDark ? Colors.dark : Colors.light;
  switch (status) {
    case "active":
    case "completed":
    case "success":
      return colors.accent.success;
    case "inactive":
    case "cancelled":
    case "danger":
      return colors.accent.danger;
    case "processing":
    case "warning":
      return colors.accent.warning;
    default:
      return colors.accent.primary;
  }
};

// ── Helper: Get badge variant ─────────────────────────────────────────────────
export const getBadgeVariant = (isDark: boolean, status: string): "success" | "danger" | "warning" | "primary" => {
  switch (status) {
    case "active":
    case "completed":
    case "success":
      return "success";
    case "inactive":
    case "cancelled":
    case "danger":
      return "danger";
    case "processing":
    case "warning":
      return "warning";
    default:
      return "primary";
  }
};
