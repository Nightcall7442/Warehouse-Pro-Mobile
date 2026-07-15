// ═══════════════════════════════════════════════════════════════════════════════
// Warehouse Pro — Theme EXACTLY matching Web Design
// Copied from web: DashboardLayout.tsx, index.css, components
// ═══════════════════════════════════════════════════════════════════════════════

import { StyleSheet } from "react-native";

// ── Web Colors (exact copy from CSS variables) ────────────────────────────────
export const WebColors = {
  light: {
    // From :root CSS variables
    canvas: "#f2f0ec",
    canvasAlt: "#ece9e3",
    surface: "#f6f4f0",
    surfaceRaised: "#f8f6f2",
    surfaceLight: "#fbfaf8",
    surfaceHover: "#ede9e2",
    border: "#e4e0d8",
    borderSubtle: "#ebe7e0",
    textPrimary: "#2b2a28",
    textSecondary: "#6b675f",
    textTertiary: "#9a968c",  // WCAG AA: 4.5:1 on #f2f0ec
    textInverse: "#ffffff",
    primary: "#4b6cf6",
    primaryHover: "#3a5be5",
    primarySubtle: "rgba(75,108,246,0.12)",
    success: "#34c473",
    successSubtle: "rgba(52,196,115,0.12)",
    danger: "#e85050",
    dangerSubtle: "rgba(232,80,80,0.12)",
    warning: "#e8a830",
    warningSubtle: "rgba(232,168,48,0.12)",
  },
  dark: {
    // From .dark CSS variables
    canvas: "#1c1a17",
    canvasAlt: "#211f1b",
    surface: "#221f1c",
    surfaceRaised: "#262320",
    surfaceLight: "#2a2622",
    surfaceHover: "#2e2a25",
    border: "#322e28",
    borderSubtle: "#2a2622",
    textPrimary: "#ede9e3",
    textSecondary: "#a39d92",
    textTertiary: "#8a8478",
    textInverse: "#1c1a17",
    primary: "#00d4ff",
    primaryHover: "#33ddff",
    primarySubtle: "rgba(0,212,255,0.12)",
    success: "#00e68a",
    successSubtle: "rgba(0,230,138,0.12)",
    danger: "#ff4d6a",
    dangerSubtle: "rgba(255,77,106,0.12)",
    warning: "#ffb020",
    warningSubtle: "rgba(255,176,32,0.12)",
  },
};

// ── Web Shadows (exact copy from CSS) ─────────────────────────────────────────
export const WebShadows = {
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

// ── Web Typography (exact copy) ───────────────────────────────────────────────
export const WebTypography = {
  fontFamily: "'DM Sans', -apple-system, sans-serif",
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
  weight: {
    normal: "400",
    medium: "500",
    semibold: "600",
    bold: "700",
    extrabold: "800",
  },
};

// ── Web Spacing ───────────────────────────────────────────────────────────────
export const WebSpacing = {
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

// ── Web Border Radius ─────────────────────────────────────────────────────────
export const WebRadii = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 16,
  xl: 20,
  xxl: 24,
  full: 999,
};

// ── Web Component Styles (exact copy from DashboardLayout.tsx) ────────────────
export const createWebStyles = (isDark: boolean) => {
  const c = isDark ? WebColors.dark : WebColors.light;
  const s = isDark ? WebShadows.dark : WebShadows.light;

  return StyleSheet.create({
    // ── kpi-hero card (from web: .kpi-hero) ──
    kpiHero: {
      backgroundColor: c.surface,
      borderRadius: WebRadii.xl,
      borderWidth: 1,
      borderColor: c.border,
      padding: 20,
      ...s.sm,
    },
    kpiHeroLabel: {
      fontFamily: WebTypography.family,
      fontSize: WebTypography.size.xs,
      fontWeight: WebTypography.weight.semibold,
      color: c.textTertiary,
      letterSpacing: 0.08,
      textTransform: "uppercase",
    },
    kpiHeroValue: {
      fontFamily: WebTypography.family,
      fontSize: 28,
      fontWeight: WebTypography.weight.bold,
      color: c.textPrimary,
      marginTop: 10,
    },

    // ── neo-card (from web: .neo-card) ──
    neoCard: {
      backgroundColor: c.surface,
      borderRadius: WebRadii.xl,
      borderWidth: 1,
      borderColor: c.border,
      padding: 16,
      ...s.md,
    },
    neoCardSm: {
      backgroundColor: c.surface,
      borderRadius: WebRadii.lg,
      borderWidth: 1,
      borderColor: c.borderSubtle,
      padding: 14,
      ...s.sm,
    },

    // ── neo-btn-primary (from web: .neo-btn-primary) ──
    neoBtnPrimary: {
      backgroundColor: c.primary,
      borderRadius: WebRadii.md,
      paddingVertical: 12,
      paddingHorizontal: 20,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 8,
      ...s.xs,
    },
    neoBtn: {
      backgroundColor: c.surface,
      borderRadius: WebRadii.md,
      borderWidth: 1,
      borderColor: c.border,
      paddingVertical: 12,
      paddingHorizontal: 20,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 8,
      ...s.xs,
    },
    neoBtnDanger: {
      backgroundColor: c.dangerSubtle,
      borderRadius: WebRadii.md,
      paddingVertical: 12,
      paddingHorizontal: 20,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 8,
      ...s.xs,
    },

    // ── Input (from web: .neo-input) ──
    neoInput: {
      backgroundColor: c.surfaceLight,
      borderRadius: WebRadii.md,
      borderWidth: 1.5,
      borderColor: "transparent",
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: WebTypography.size.sm,
      fontFamily: WebTypography.family,
      color: c.textPrimary,
    },
    neoInputFocused: {
      backgroundColor: c.surface,
      borderRadius: WebRadii.md,
      borderWidth: 1.5,
      borderColor: c.primary,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: WebTypography.size.sm,
      fontFamily: WebTypography.family,
      color: c.textPrimary,
    },

    // ── Badge ──
    badge: {
      backgroundColor: c.primary,
      borderRadius: WebRadii.sm,
      paddingHorizontal: 10,
      paddingVertical: 4,
      alignItems: "center",
      justifyContent: "center",
    },
    badgeSuccess: {
      backgroundColor: c.success,
      borderRadius: WebRadii.sm,
      paddingHorizontal: 10,
      paddingVertical: 4,
      alignItems: "center",
      justifyContent: "center",
    },
    badgeDanger: {
      backgroundColor: c.danger,
      borderRadius: WebRadii.sm,
      paddingHorizontal: 10,
      paddingVertical: 4,
      alignItems: "center",
      justifyContent: "center",
    },
    badgeWarning: {
      backgroundColor: c.warning,
      borderRadius: WebRadii.sm,
      paddingHorizontal: 10,
      paddingVertical: 4,
      alignItems: "center",
      justifyContent: "center",
    },

    // ── Status indicator dot ──
    statusDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },

    // ── Avatar ──
    avatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: c.primarySubtle,
      borderWidth: 2,
      borderColor: c.primary + "40",
    },

    // ── Divider ──
    divider: {
      height: 1,
      backgroundColor: c.border,
    },

    // ── Section header ──
    sectionHeader: {
      fontFamily: WebTypography.family,
      fontSize: WebTypography.size.xs,
      fontWeight: WebTypography.weight.bold,
      color: c.textTertiary,
      letterSpacing: 1.5,
      textTransform: "uppercase",
    },
  });
};
