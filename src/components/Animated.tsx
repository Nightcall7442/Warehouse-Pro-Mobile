// Warehouse Pro — Lightweight components (no animations, no battery drain)
import React from "react";
import { View, Text, TouchableOpacity, ViewStyle, TextStyle, ActivityIndicator } from "react-native";
import * as Haptics from "expo-haptics";
import { useThemeStore, useThemeColors } from "../store/theme";
import { Radii } from "../theme";

// ── FadeInItem → plain View (no animation) ──────────────────────────────────
export function FadeInItem({
  children,
  delay: _delay,
  style,
}: {
  children: React.ReactNode;
  delay?: number;
  style?: ViewStyle;
}) {
  return <View style={style}>{children}</View>;
}

// ── FadeInTop → plain View ───────────────────────────────────────────────────
export function FadeInTop({
  children,
  delay: _delay,
  style,
}: {
  children: React.ReactNode;
  delay?: number;
  style?: ViewStyle;
}) {
  return <View style={style}>{children}</View>;
}

// ── SlideIn → plain View ─────────────────────────────────────────────────────
export function SlideIn({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={style}>{children}</View>;
}

// ── ScaleIn → plain View ─────────────────────────────────────────────────────
export function ScaleIn({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={style}>{children}</View>;
}

// ── PressableScale → TouchableOpacity (no scale animation) ───────────────────
// Default hitSlop of 6pt/side pads out small icon buttons (many are sized
// 32-36pt visually) toward the ~44pt accessible touch-target floor without
// changing any rendered layout. Callers with tight adjacent spacing can pass
// hitSlop={undefined} or a smaller value to opt out.
const DEFAULT_HIT_SLOP = { top: 6, bottom: 6, left: 6, right: 6 };

export function PressableScale({
  children,
  onPress,
  style,
  scaleTo: _scaleTo,
  haptic = "light",
  disabled = false,
  accessibilityLabel,
  hitSlop = DEFAULT_HIT_SLOP,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  style?: ViewStyle;
  scaleTo?: number;
  haptic?: "light" | "medium" | "heavy" | "selection" | "success" | "error" | "none";
  disabled?: boolean;
  accessibilityLabel?: string;
  hitSlop?: { top: number; bottom: number; left: number; right: number };
}) {
  const handlePress = () => {
    if (haptic !== "none") {
      switch (haptic) {
        case "light":
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          break;
        case "medium":
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          break;
        case "heavy":
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
          break;
        case "selection":
          Haptics.selectionAsync();
          break;
        case "success":
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          break;
        case "error":
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          break;
      }
    }
    onPress?.();
  };

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={handlePress}
      disabled={disabled}
      style={[{ opacity: disabled ? 0.5 : 1 }, style]}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      hitSlop={hitSlop}
    >
      {children}
    </TouchableOpacity>
  );
}

// ── ShimmerSkeleton → static placeholder ─────────────────────────────────────
export function ShimmerSkeleton({
  width,
  height,
  style,
  radius,
}: {
  width?: number | string;
  height: number;
  style?: ViewStyle;
  radius?: number;
}) {
  const { isDark } = useThemeStore();
  const bgColor = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)";

  return (
    <View
      style={[
        {
          height,
          borderRadius: radius ?? 12,
          backgroundColor: bgColor,
          overflow: "hidden",
        },
        width ? { width: width as number } : { width: "100%" },
        style,
      ]}
    />
  );
}

// ── AnimatedNumber → plain Text ──────────────────────────────────────────────
export function AnimatedNumber({
  value,
  style,
  duration: _duration,
  prefix = "",
  suffix = "",
}: {
  value: number;
  style?: TextStyle;
  duration?: number;
  prefix?: string;
  suffix?: string;
}) {
  return (
    <Text style={style}>
      {prefix}{value.toLocaleString("ru")}{suffix}
    </Text>
  );
}

// ── AnimatedCounter → plain Text ─────────────────────────────────────────────
export function AnimatedCounter({
  value,
  style,
  duration: _duration,
}: {
  value: number;
  style?: TextStyle;
  duration?: number;
}) {
  return <Text style={style}>{value}</Text>;
}

// ── AnimatedGradient → plain View with gradient ──────────────────────────────
export function AnimatedGradient({
  colors: _colors,
  style,
}: {
  colors: readonly [string, string, ...string[]];
  style?: ViewStyle;
}) {
  return <View style={[{ overflow: "hidden" }, style]} />;
}

// ── PulseGlow → static dot ──────────────────────────────────────────────────
export function PulseGlow({
  color,
  size = 8,
  style,
}: {
  color?: string;
  size?: number;
  style?: ViewStyle;
}) {
  const colors = useThemeColors();
  return (
    <View style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: color ?? colors.brand.primary }, style]} />
  );
}

// ── OnlineIndicator → static dot ─────────────────────────────────────────────
export function OnlineIndicator({
  online,
  size = 8,
  style,
}: {
  online: boolean;
  size?: number;
  style?: ViewStyle;
}) {
  const colors = useThemeColors();
  const color = online ? colors.status.success : colors.text.muted;
  return (
    <View style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }, style]} />
  );
}

// ── StaggerContainer → plain View ────────────────────────────────────────────
export function StaggerContainer({
  children,
  staggerDelay: _staggerDelay,
  style,
}: {
  children: React.ReactNode;
  staggerDelay?: number;
  style?: ViewStyle;
}) {
  return <View style={style}>{children}</View>;
}

// ── AnimatedCard → plain View/TouchableOpacity ───────────────────────────────
export function AnimatedCard({
  children,
  onPress,
  style,
  variant: _variant,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  style?: ViewStyle;
  variant?: "default" | "glass" | "elevated";
}) {
  if (onPress) {
    return (
      <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={style}>
        {children}
      </TouchableOpacity>
    );
  }
  return <View style={style}>{children}</View>;
}

// ── FloatingActionButton → plain TouchableOpacity ───────────────────────────
export function FloatingActionButton({
  icon,
  onPress,
  color,
  style,
}: {
  icon: React.ReactNode;
  onPress: () => void;
  color?: string;
  style?: ViewStyle;
}) {
  const colors = useThemeColors();
  const bgColor = color ?? colors.brand.primary;
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={[
        {
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: bgColor,
          alignItems: "center",
          justifyContent: "center",
        },
        style,
      ]}
    >
      {icon}
    </TouchableOpacity>
  );
}

// ── ProgressRing → static View ───────────────────────────────────────────────
export function ProgressRing({
  progress,
  size = 64,
  strokeWidth = 6,
  color,
  bgColor = "rgba(255,255,255,0.1)",
  style,
}: {
  progress: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  bgColor?: string;
  style?: ViewStyle;
}) {
  const colors = useThemeColors();
  const ringColor = color ?? colors.brand.primary;
  return (
    <View style={[{ width: size, height: size }, style]}>
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: strokeWidth,
          borderColor: bgColor,
          position: "absolute",
        }}
      />
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: strokeWidth,
          borderColor: ringColor,
          borderRightColor: progress < 50 ? bgColor : ringColor,
          borderBottomColor: progress < 75 ? bgColor : ringColor,
          borderLeftColor: progress < 100 ? bgColor : ringColor,
        }}
      />
    </View>
  );
}

// ── GlowBorder → plain View ──────────────────────────────────────────────────
export function GlowBorder({
  children,
  color,
  intensity = 0.4,
  style,
}: {
  children: React.ReactNode;
  color?: string;
  intensity?: number;
  style?: ViewStyle;
}) {
  const colors = useThemeColors();
  const glowColor = color ?? colors.brand.primary;
  return (
    <View
      style={[
        {
          shadowColor: glowColor,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: intensity,
          shadowRadius: 16,
          elevation: 8,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

// ── GradientBorder → plain View ──────────────────────────────────────────────
export function GradientBorder({
  colors: _colors,
  borderWidth = 1.5,
  borderRadius = 18,
  children,
  style,
}: {
  colors: readonly [string, string, ...string[]];
  borderWidth?: number;
  borderRadius?: number;
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  return (
    <View style={[{ padding: borderWidth, borderRadius }, style]}>
      <View style={{ borderRadius: borderRadius - borderWidth, overflow: "hidden" }}>
        {children}
      </View>
    </View>
  );
}

// ── DataPulse → plain View ───────────────────────────────────────────────────
export function DataPulse({
  children,
  trigger: _trigger,
  color: _color,
  style,
}: {
  children: React.ReactNode;
  trigger: number;
  color?: string;
  style?: ViewStyle;
}) {
  return <View style={style}>{children}</View>;
}

// ── ParallaxScroll → plain ScrollView ────────────────────────────────────────
export function ParallaxScroll({
  headerHeight = 260,
  headerContent,
  children,
  style,
  contentContainerStyle,
  refreshControl: _refreshControl,
  showsVerticalScrollIndicator: _showsVerticalScrollIndicator = false,
}: {
  headerHeight?: number;
  headerContent: React.ReactNode;
  children: React.ReactNode;
  style?: ViewStyle;
  contentContainerStyle?: ViewStyle;
  refreshControl?: React.ReactElement;
  showsVerticalScrollIndicator?: boolean;
}) {
  return (
    <View style={[{ flex: 1 }, style]}>
      <View style={{ height: headerHeight }}>{headerContent}</View>
      <View style={contentContainerStyle}>{children}</View>
    </View>
  );
}

// ── SwipeToDelete → plain View (no gesture) ──────────────────────────────────
export function SwipeToDelete({
  children,
  onDelete: _onDelete,
  onDeleteLabel: _onDeleteLabel,
  style,
}: {
  children: React.ReactNode;
  onDelete: () => void;
  onDeleteLabel?: string;
  style?: ViewStyle;
}) {
  return <View style={[{ borderRadius: Radii.xl }, style]}>{children}</View>;
}

// ── PullRefreshIndicator → ActivityIndicator ─────────────────────────────────
export function PullRefreshIndicator({
  refreshing,
  progress: _progress,
  style,
}: {
  refreshing: boolean;
  progress: number;
  style?: ViewStyle;
}) {
  const colors = useThemeColors();
  if (!refreshing) return null;
  return (
    <View style={[{ alignItems: "center", marginVertical: 8 }, style]}>
      <ActivityIndicator size="small" color={colors.brand.primary} />
    </View>
  );
}
