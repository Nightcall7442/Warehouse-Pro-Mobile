// ═══════════════════════════════════════════════════════════════════════════════
// Warehouse Pro — EXACT Web Design Tokens for Mobile
// Copy of web CSS variables + component styles for React Native
// ═══════════════════════════════════════════════════════════════════════════════

import { StyleSheet, TextStyle, ViewStyle } from "react-native";

// ── EXACT Web Colors (from :root and .dark in index.css) ──────────────────────
export const C = {
  light: {
    // Backgrounds
    canvas: "#f2f0ec",
    surface: "#f6f4f0",
    surfaceLight: "#fbfaf8",
    surfaceHover: "#ede9e2",
    // Borders
    border: "#e4e0d8",
    borderSubtle: "#ebe7e0",
    // Text
    textPrimary: "#2b2a28",
    textSecondary: "#6b675f",
    textTertiary: "#9a968c",
    // Accent
    primary: "#4b6cf6",
    primaryHover: "#3a5be5",
    primarySubtle: "rgba(75,108,246,0.12)",
    success: "#34c473",
    successSubtle: "rgba(52,196,115,0.12)",
    danger: "#e85050",
    dangerSubtle: "rgba(232,80,80,0.12)",
    warning: "#e8a830",
    warningSubtle: "rgba(232,168,48,0.12)",
    info: "#4a9de8",
  },
  dark: {
    canvas: "#1c1a17",
    surface: "#221f1c",
    surfaceLight: "#2a2622",
    surfaceHover: "#2e2a25",
    border: "#322e28",
    borderSubtle: "#2a2622",
    textPrimary: "#ede9e3",
    textSecondary: "#a39d92",
    textTertiary: "#8a8478",
    primary: "#00d4ff",
    primaryHover: "#33ddff",
    primarySubtle: "rgba(0,212,255,0.12)",
    success: "#00e68a",
    successSubtle: "rgba(0,230,138,0.12)",
    danger: "#ff4d6a",
    dangerSubtle: "rgba(255,77,106,0.12)",
    warning: "#ffb020",
    warningSubtle: "rgba(255,176,32,0.12)",
    info: "#00b4ff",
  },
};

// ── EXACT Web Shadows ─────────────────────────────────────────────────────────
export const S = {
  light: {
    xs: { shadowColor: "#b4ac9e", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.15, shadowRadius: 3, elevation: 1 },
    sm: { shadowColor: "#b4ac9e", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.16, shadowRadius: 8, elevation: 2 },
    md: { shadowColor: "#b4ac9e", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.18, shadowRadius: 16, elevation: 4 },
    lg: { shadowColor: "#b4ac9e", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.2, shadowRadius: 28, elevation: 8 },
  },
  dark: {
    xs: { shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.3, shadowRadius: 3, elevation: 1 },
    sm: { shadowColor: "#000", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 2 },
    md: { shadowColor: "#000", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.5, shadowRadius: 16, elevation: 4 },
    lg: { shadowColor: "#000", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.5, shadowRadius: 28, elevation: 8 },
  },
};

// ── EXACT Web Typography ──────────────────────────────────────────────────────
export const T = {
  family: "DM Sans" as TextStyle["fontFamily"],
  xs: 11 as TextStyle["fontSize"],
  sm: 13 as TextStyle["fontSize"],
  base: 14 as TextStyle["fontSize"],
  md: 15 as TextStyle["fontSize"],
  lg: 17 as TextStyle["fontSize"],
  xl: 20 as TextStyle["fontSize"],
  xxl: 24 as TextStyle["fontSize"],
  "2xl": 28 as TextStyle["fontSize"],
  xxxl: 32 as TextStyle["fontSize"],
};

// ── EXACT Web Spacing ─────────────────────────────────────────────────────────
export const SP = {
  xxs: 2, xs: 4, sm: 8, md: 12, base: 14, lg: 16, xl: 20, "2xl": 24, xxl: 32, "3xl": 40, xxxl: 48,
};

// ── EXACT Web Border Radius ───────────────────────────────────────────────────
export const R = {
  sm: 10, md: 14, lg: 16, xl: 20, xxl: 24, full: 999,
};

// ── Web Component Styles (exact copy from DashboardLayout.tsx + index.css) ─────
export const webStyles = (isDark: boolean) => {
  const c = isDark ? C.dark : C.light;
  const s = isDark ? S.dark : S.light;

  return StyleSheet.create({
    // ── kpi-hero (from web .kpi-hero) ──
    kpiHero: {
      backgroundColor: c.surface,
      borderRadius: R.xxl,
      borderWidth: 1,
      borderColor: c.border,
      padding: 20,
      ...s.sm,
    } as ViewStyle,
    kpiLabel: {
      fontFamily: T.family,
      fontSize: T.xs,
      fontWeight: "600" as TextStyle["fontWeight"],
      color: c.textTertiary,
      letterSpacing: 0.08,
      textTransform: "uppercase",
    } as TextStyle,
    kpiValue: {
      fontFamily: T.family,
      fontSize: 28,
      fontWeight: "700" as TextStyle["fontWeight"],
      color: c.textPrimary,
      marginTop: 8,
    } as TextStyle,
    kpiSub: {
      fontFamily: T.family,
      fontSize: T.sm,
      color: c.textSecondary,
      marginTop: 4,
    } as TextStyle,

    // ── neo-card (from web .neo-card) ──
    card: {
      backgroundColor: c.surface,
      borderRadius: R.xxl,
      borderWidth: 1,
      borderColor: c.border,
      padding: 16,
      ...s.md,
    } as ViewStyle,
    cardSm: {
      backgroundColor: c.surface,
      borderRadius: R.lg,
      borderWidth: 1,
      borderColor: c.borderSubtle,
      padding: 14,
      ...s.sm,
    } as ViewStyle,

    // ── neo-btn-primary (from web .neo-btn-primary) ──
    btnPrimary: {
      backgroundColor: c.primary,
      borderRadius: R.md,
      paddingVertical: 12,
      paddingHorizontal: 20,
      alignItems: "center" as ViewStyle["alignItems"],
      justifyContent: "center" as ViewStyle["justifyContent"],
      flexDirection: "row" as ViewStyle["flexDirection"],
      ...s.xs,
    } as ViewStyle,
    btn: {
      backgroundColor: c.surface,
      borderRadius: R.md,
      borderWidth: 1,
      borderColor: c.border,
      paddingVertical: 12,
      paddingHorizontal: 20,
      alignItems: "center" as ViewStyle["alignItems"],
      justifyContent: "center" as ViewStyle["justifyContent"],
      flexDirection: "row" as ViewStyle["flexDirection"],
      ...s.xs,
    } as ViewStyle,
    btnDanger: {
      backgroundColor: c.dangerSubtle,
      borderRadius: R.md,
      paddingVertical: 12,
      paddingHorizontal: 20,
      alignItems: "center" as ViewStyle["alignItems"],
      justifyContent: "center" as ViewStyle["justifyContent"],
      flexDirection: "row" as ViewStyle["flexDirection"],
      ...s.xs,
    } as ViewStyle,

    // ── Input (from web .neo-input) ──
    input: {
      backgroundColor: c.surfaceLight,
      borderRadius: R.md,
      borderWidth: 1.5,
      borderColor: "transparent",
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: T.sm,
      fontFamily: T.family,
      color: c.textPrimary,
    } as TextStyle,

    // ── Badge ──
    badge: {
      backgroundColor: c.primary,
      borderRadius: R.sm,
      paddingHorizontal: 10,
      paddingVertical: 4,
      alignItems: "center" as ViewStyle["alignItems"],
    } as ViewStyle,
    badgeSuccess: {
      backgroundColor: c.success,
      borderRadius: R.sm,
      paddingHorizontal: 10,
      paddingVertical: 4,
      alignItems: "center" as ViewStyle["alignItems"],
    } as ViewStyle,
    badgeDanger: {
      backgroundColor: c.danger,
      borderRadius: R.sm,
      paddingHorizontal: 10,
      paddingVertical: 4,
      alignItems: "center" as ViewStyle["alignItems"],
    } as ViewStyle,
    badgeWarning: {
      backgroundColor: c.warning,
      borderRadius: R.sm,
      paddingHorizontal: 10,
      paddingVertical: 4,
      alignItems: "center" as ViewStyle["alignItems"],
    } as ViewStyle,

    // ── Avatar ──
    avatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: c.primarySubtle,
      borderWidth: 2,
      borderColor: c.primary + "40",
    } as ViewStyle,

    // ── Divider ──
    divider: {
      height: 1,
      backgroundColor: c.border,
    } as ViewStyle,

    // ── Status dot ──
    statusDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    } as ViewStyle,
  });
};

// ── Helper: get colors for role ───────────────────────────────────────────────
export const ROLE_COLORS: Record<string, string> = {
  ceo: "#e8a830",
  operator: "#4a9de8",
  agent: "#34c473",
  supervisor: "#e8a830",
  merchandiser: "#8b7cf6",
  courier: "#2ec4b0",
};

// ── Helper: get status color ──────────────────────────────────────────────────
export const STATUS_COLORS: Record<string, string> = {
  new: "#4b6cf6",
  processing: "#e8a830",
  completed: "#34c473",
  cancelled: "#e85050",
  active: "#34c473",
  inactive: "#e85050",
};
