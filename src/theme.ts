// ──────────────────────────────────────────────────────────────────────────────
// Warehouse Pro — Design System v6
// Neumorphic Soft UI — matches web redesign.
// Light: warm beige canvas, raised cream cards. Dark: charcoal canvas, cyan accent.
// Font: DM Sans
// ──────────────────────────────────────────────────────────────────────────────

export const DarkColors = {
  bg: {
    primary: "#1c1a17",
    secondary: "#221f1c",
    card: "#221f1c",
    elevated: "#262320",
    input: "#221f1c",
    overlay: "rgba(28,26,23,0.85)",
    glass: "rgba(34,31,28,0.75)",
    glassCard: "rgba(38,35,32,0.7)",
    overlayDark: "rgba(0,0,0,0.5)",
    glassButton: "rgba(255,255,255,0.08)",
  },
  border: {
    default: "#322e28",
    subtle: "#2a2622",
    strong: "#423d35",
    focus: "#00d4ff",
    glass: "rgba(255,255,255,0.06)",
  },
  text: {
    primary: "#ede9e3",
    secondary: "#a39d92",
    tertiary: "#8a8478", // WCAG AA: 4.5:1 on #1c1a17
    muted: "#8a8478",
    inverse: "#1c1a17",
    onGlass: "rgba(237,233,227,0.92)",
  },
  accent: {
    primary: "#00d4ff",
    secondary: "#a78bfa",
    success: "#00e68a",
    danger: "#ff4d6a",
    warning: "#ffb020",
    info: "#00b4ff",
  },
  brand: {
    primary: "#00d4ff",
    primaryLight: "#33ddff",
    secondary: "#a78bfa",
    primaryDim: "rgba(0,212,255,0.12)",
    glow: "rgba(0,212,255,0.35)",
    glowSoft: "rgba(0,212,255,0.14)",
  },
  status: {
    success: "#00e68a",
    successDim: "rgba(0,230,138,0.12)",
    successGlow: "rgba(0,230,138,0.25)",
    warning: "#ffb020",
    warningDim: "rgba(255,176,32,0.12)",
    danger: "#ff4d6a",
    dangerDim: "rgba(255,77,106,0.12)",
    info: "#00b4ff",
    infoDim: "rgba(0,180,255,0.12)",
  },
  tab: {
    active: "#00d4ff",
    inactive: "#756f64",
    bg: "rgba(34,31,28,0.92)",
    border: "rgba(255,255,255,0.06)",
  },
  gradient: {
    primary: ["#00d4ff", "#33ddff"] as const,
    primarySoft: ["rgba(0,212,255,0.16)", "rgba(167,139,250,0.06)"] as const,
    success: ["#00e68a", "#3cd0b0"] as const,
    warm: ["#ffb020", "#f09858"] as const,
    danger: ["#ff4d6a", "#e878a8"] as const,
    ocean: ["#00b4ff", "#00d4ff"] as const,
    sunset: ["#f09858", "#e878a8"] as const,
    profileHeader: ["#00d4ff", "#33ddff"] as const,
  },
};

export const LightColors = {
  bg: {
    primary: "#e8e6e1",
    secondary: "#efedea",
    card: "#efedea",
    elevated: "#f2f0ec",
    input: "#efedea",
    overlay: "rgba(232,230,225,0.9)",
    glass: "rgba(246,244,240,0.8)",
    glassCard: "rgba(246,244,240,0.85)",
    overlayDark: "rgba(0,0,0,0.4)",
    glassButton: "rgba(255,255,255,0.5)",
  },
  border: {
    default: "#d8d5cd",
    subtle: "#e0ddd7",
    strong: "#c4c0b8",
    focus: "#5b6d8a",
    glass: "rgba(0,0,0,0.05)",
  },
  text: {
    primary: "#2b2a28",
    secondary: "#5e5b54",
    tertiary: "#757168",
    muted: "#757168",
    inverse: "#ffffff",
    onGlass: "rgba(43,42,40,0.92)",
  },
  accent: {
    primary: "#5b6d8a",
    secondary: "#7a8ba8",
    success: "#34c473",
    danger: "#d45050",
    warning: "#d4973a",
    info: "#5a8fad",
  },
  brand: {
    primary: "#5b6d8a",
    primaryLight: "#4a5c78",
    secondary: "#7a8ba8",
    primaryDim: "rgba(91,109,138,0.10)",
    glow: "rgba(91,109,138,0.20)",
    glowSoft: "rgba(91,109,138,0.08)",
  },
  status: {
    success: "#34c473",
    successDim: "rgba(52,196,115,0.10)",
    successGlow: "rgba(52,196,115,0.20)",
    warning: "#d4973a",
    warningDim: "rgba(212,151,58,0.10)",
    danger: "#d45050",
    dangerDim: "rgba(212,80,80,0.10)",
    info: "#5a8fad",
    infoDim: "rgba(90,143,173,0.10)",
  },
  tab: {
    active: "#5b6d8a",
    inactive: "#757168",
    bg: "rgba(239,237,234,0.95)",
    border: "rgba(0,0,0,0.05)",
  },
  gradient: {
    primary: ["#5b6d8a", "#4a5c78"] as const,
    success: ["#34c473", "#2ab06a"] as const,
    warm: ["#d4973a", "#c48830"] as const,
    danger: ["#d45050", "#c04040"] as const,
    ocean: ["#5a8fad", "#5b6d8a"] as const,
    sunset: ["#d4973a", "#d45050"] as const,
    primarySoft: ["rgba(91,109,138,0.10)", "rgba(122,139,168,0.05)"] as const,
    profileHeader: ["#5b6d8a", "#4a5c78"] as const,
  },
};

export type ThemeColors = typeof DarkColors | typeof LightColors;

// Colors will be updated by theme store - initially dark
// NOTE: Components should use useThemeColors() hook instead of importing Colors directly
// to avoid stale references after theme toggle
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export let Colors: any = DarkColors;

// Function to update Colors when theme changes
export function updateColors(isDark: boolean) {
  Colors = isDark ? DarkColors : LightColors;
  Gradients = buildGradients(isDark);
}

// ── Typography ────────────────────────────────────────────────────────────────
export const Typography = {
  fontDisplay: "DMSans_800ExtraBold",
  fontBody: "DMSans_400Regular",
  fontRegular: "DMSans_400Regular",
  fontMedium: "DMSans_500Medium",
  fontSemibold: "DMSans_600SemiBold",
  fontSemiBold: "DMSans_600SemiBold",
  fontBold: "DMSans_700Bold",
  fontExtraBold: "DMSans_800ExtraBold",
  fontMono: "Courier New",
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
  lineHeight: {
    tight: 1.2,
    snug: 1.35,
    normal: 1.5,
    relaxed: 1.65,
  },
  letterSpacing: {
    tight: -0.025,
    normal: 0,
    wide: 0.04,
    wider: 0.08,
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
  "4xl": 64,
};

// ── Sizes ────────────────────────────────────────────────────────────────────
export const Sizes = {
  touchTarget: 44,
};

// ── Border Radius ─────────────────────────────────────────────────────────────
// Soft UI uses noticeably rounder corners than the old Linear/Stripe look.
export const Radii = {
  xs: 6,
  sm: 10,
  md: 12,   // matches web .neo-btn border-radius
  lg: 16,
  xl: 20,
  xxl: 24,
  "2xl": 28,
  full: 999,
};

// ── Shadows ───────────────────────────────────────────────────────────────────
// Neumorphic shadow system — matches web index.css.
// RN can't do true dual-tone (light+dark sides), so we use the dominant
// dark-side shadow. The top highlight line in ui.tsx Card compensates.
// Light: warm muted tone (#a0988c). Dark: pure black.
export const Shadows = {
  xs: {
    shadowColor: "#a0988c",
    shadowOffset: { width: 2, height: 2 },
    shadowOpacity: 0.22,
    shadowRadius: 4,
    elevation: 1,
  },
  sm: {
    shadowColor: "#a0988c",
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 2,
  },
  md: {
    shadowColor: "#a0988c",
    shadowOffset: { width: 6, height: 6 },
    shadowOpacity: 0.32,
    shadowRadius: 16,
    elevation: 4,
  },
  lg: {
    shadowColor: "#a0988c",
    shadowOffset: { width: 8, height: 8 },
    shadowOpacity: 0.38,
    shadowRadius: 24,
    elevation: 8,
  },
  xl: {
    shadowColor: "#a0988c",
    shadowOffset: { width: 10, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 32,
    elevation: 12,
  },
  card: {
    shadowColor: "#a0988c",
    shadowOffset: { width: 8, height: 8 },
    shadowOpacity: 0.38,
    shadowRadius: 20,
    elevation: 4,
  },
  panel: {
    shadowColor: "#a0988c",
    shadowOffset: { width: 3, height: 3 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 2,
  },
  panelRaised: {
    shadowColor: "#a0988c",
    shadowOffset: { width: 6, height: 6 },
    shadowOpacity: 0.32,
    shadowRadius: 16,
    elevation: 5,
  },
  glow: {
    shadowColor: "#5b6d8a",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
  glowSuccess: {
    shadowColor: "#34c473",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
  glowDanger: {
    shadowColor: "#d45050",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
  inner: {
    shadowColor: "#a0988c",
    shadowOffset: { width: -3, height: -3 },
    shadowOpacity: 0.28,
    shadowRadius: 6,
    elevation: -1,
  },
};

// Dark-mode shadow color override — used by ui.tsx where shadowColor needs to
// switch from the warm neumorphic tone (light) to plain black (dark), since
// a light-toned shadow reads muddy on a charcoal canvas.
export const DarkShadowColor = "#000000";

// ── KPI Colors ────────────────────────────────────────────────────────────────
export const KpiColors = {
  indigo: "#4b6cf6",
  blue: "#4a9de8",
  teal: "#2ec4b0",
  green: "#34c473",
  amber: "#e8a830",
  orange: "#f09050",
  red: "#e85050",
  pink: "#f06895",
  purple: "#8b7cf6",
  coral: "#f06895",
};

export const KpiColorsDark = {
  indigo: "#7b94f8",
  blue: "#58a8f0",
  teal: "#3cd0b0",
  green: "#5ad88e",
  amber: "#f0c040",
  orange: "#f09858",
  red: "#f06060",
  pink: "#e878a8",
  purple: "#a088f0",
  coral: "#e878a8",
};

// ── Animation Timing ──────────────────────────────────────────────────────────
export const Timing = {
  instant: 80,
  fast: 150,
  normal: 250,
  slow: 400,
  slower: 600,
  spring: { damping: 18, stiffness: 220, mass: 0.9 },
  springSnappy: { damping: 20, stiffness: 300, mass: 0.8 },
  springBouncy: { damping: 12, stiffness: 180, mass: 0.8 },
  ease: [0.25, 0.46, 0.45, 0.94] as const,
  easeOut: [0.16, 1, 0.3, 1] as const,
  easeInBack: [0.36, 0, 0.66, -0.56] as const,
  easeOutBack: [0.34, 1.56, 0.64, 1] as const,
};

// ── Gradients ─────────────────────────────────────────────────────────────────
// Static "always dark" surfaces (splash/header backgrounds) that don't flip
// with the theme toggle.
const StaticGradients = {
  dark: ["#221f1c", "#1c1a17"] as const,
  card: ["#262320", "#221f1c"] as const,
  sheen: ["rgba(255,255,255,0.06)", "rgba(255,255,255,0)"] as const,
};

const buildGradients = (isDark: boolean) => ({
  ...StaticGradients,
  ...(isDark ? DarkColors.gradient : LightColors.gradient),
  warning: (isDark ? DarkColors.gradient.warm : LightColors.gradient.warm),
});

// Mutable, kept in sync with Colors by updateColors() so screens that import
// `Gradients` directly (without the theme hook) still pick up the cyan
// (dark) / blue (light) brand gradient after a theme toggle re-render.
export let Gradients: ReturnType<typeof buildGradients> = buildGradients(true);
