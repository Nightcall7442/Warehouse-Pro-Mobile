import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TouchableOpacityProps,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
  Animated,
  Easing,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { Typography, Spacing, Radii, Shadows, Gradients, ThemeColors } from "../theme";
import { useThemeColors } from "../store/theme";

// ── Card ──────────────────────────────────────────────────────────────────────
interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  onPress?: () => void;
  variant?: "default" | "flat" | "accent";
}

export function Card({ children, style, onPress, variant = "default" }: CardProps) {
  const colors = useThemeColors();
  const cardStyle: ViewStyle = {
    backgroundColor: colors.bg.card,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: colors.border.default,
    padding: Spacing.base,
    ...Shadows.card,
    ...(variant === "flat" ? { shadowOpacity: 0, elevation: 0 } : null),
    ...(variant === "accent" ? { borderColor: "rgba(99,102,241,0.35)", backgroundColor: "rgba(99,102,241,0.07)" } : null),
  };
  const content = <View style={[cardStyle, style]}>{children}</View>;
  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        {content}
      </TouchableOpacity>
    );
  }
  return content;
}

// ── Button ────────────────────────────────────────────────────────────────────
interface ButtonProps extends TouchableOpacityProps {
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "danger" | "success" | "ghost";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  icon?: keyof typeof Feather.glyphMap;
  fullWidth?: boolean;
}

const SIZE_PADDING: Record<string, { v: number; h: number }> = {
  sm: { v: 9, h: 14 },
  md: { v: 13, h: 18 },
  lg: { v: 16, h: 22 },
};

export function Button({
  children,
  variant = "primary",
  size = "md",
  loading,
  icon,
  fullWidth,
  style,
  disabled,
  ...props
}: ButtonProps) {
  const colors = useThemeColors();
  const isDisabled = disabled || loading;
  const pad = SIZE_PADDING[size];

  const textColor =
    variant === "primary" || variant === "danger" || variant === "success" ? "#fff"
    : variant === "ghost" ? colors.brand.primaryLight
    : colors.text.primary;

  const inner = (
    <>
      {loading ? (
        <ActivityIndicator size="small" color={variant === "primary" || variant === "danger" || variant === "success" ? "#fff" : colors.brand.primary} />
      ) : (
        <>
          {icon && <Feather name={icon} size={size === "sm" ? 15 : 17} color={textColor} style={{ marginRight: 7 }} />}
          <Text style={{ fontFamily: Typography.fontSemibold, letterSpacing: 0.2, color: textColor, fontSize: size === "sm" ? Typography.size.sm : size === "lg" ? Typography.size.md : Typography.size.base }}>
            {children}
          </Text>
        </>
      )}
    </>
  );

  const baseBtnStyle: ViewStyle = { flexDirection: "row", alignItems: "center", justifyContent: "center", borderRadius: Radii.md };

  if (variant === "primary") {
    return (
      <TouchableOpacity activeOpacity={0.85} disabled={isDisabled} style={[fullWidth && { width: "100%" }, isDisabled && { opacity: 0.45 }, style as ViewStyle]} {...props}>
        <LinearGradient colors={Gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={[baseBtnStyle, { paddingVertical: pad.v, paddingHorizontal: pad.h }, !isDisabled && Shadows.glow]}>
          {inner}
        </LinearGradient>
      </TouchableOpacity>
    );
  }

  if (variant === "success") {
    return (
      <TouchableOpacity activeOpacity={0.85} disabled={isDisabled} style={[fullWidth && { width: "100%" }, isDisabled && { opacity: 0.45 }, style as ViewStyle]} {...props}>
        <LinearGradient colors={Gradients.success} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={[baseBtnStyle, { paddingVertical: pad.v, paddingHorizontal: pad.h }, !isDisabled && Shadows.glowSuccess]}>
          {inner}
        </LinearGradient>
      </TouchableOpacity>
    );
  }

  const variantStyle: ViewStyle =
    variant === "secondary" ? { backgroundColor: colors.bg.elevated, borderWidth: 1, borderColor: colors.border.default }
    : variant === "danger" ? { backgroundColor: colors.status.danger }
    : variant === "ghost" ? { backgroundColor: "transparent" }
    : {};

  return (
    <TouchableOpacity
      activeOpacity={0.75}
      disabled={isDisabled}
      style={[baseBtnStyle, variantStyle, { paddingVertical: pad.v, paddingHorizontal: pad.h }, fullWidth && { width: "100%" }, isDisabled && { opacity: 0.45 }, style as ViewStyle]}
      {...props}
    >
      {inner}
    </TouchableOpacity>
  );
}

// ── Icon circle / badge ──────────────────────────────────────────────────────
interface IconCircleProps {
  name: keyof typeof Feather.glyphMap;
  size?: number;
  variant?: "brand" | "success" | "warning" | "danger" | "info" | "neutral";
  gradient?: boolean;
}

export function IconCircle({ name, size = 22, variant = "brand", gradient }: IconCircleProps) {
  const colors = useThemeColors();
  const box = size + 24;

  const VARIANT_COLOR: Record<string, string> = {
    brand: colors.brand.primaryLight, success: colors.status.success, warning: colors.status.warning,
    danger: colors.status.danger, info: colors.status.info, neutral: colors.text.secondary,
  };
  const VARIANT_BG: Record<string, string> = {
    brand: colors.brand.primaryDim, success: colors.status.successDim, warning: colors.status.warningDim,
    danger: colors.status.dangerDim, info: colors.status.infoDim, neutral: colors.bg.elevated,
  };

  if (gradient) {
    return (
      <LinearGradient colors={Gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={{ width: box, height: box, borderRadius: Radii.lg, alignItems: "center", justifyContent: "center" }}>
        <Feather name={name} size={size} color="#fff" />
      </LinearGradient>
    );
  }
  return (
    <View style={{ width: box, height: box, borderRadius: Radii.lg, backgroundColor: VARIANT_BG[variant], alignItems: "center", justifyContent: "center" }}>
      <Feather name={name} size={size} color={VARIANT_COLOR[variant]} />
    </View>
  );
}

// ── Badge ─────────────────────────────────────────────────────────────────────
interface BadgeProps {
  children: React.ReactNode;
  variant?: "default" | "success" | "warning" | "danger" | "info";
  icon?: keyof typeof Feather.glyphMap;
  style?: ViewStyle;
}

export function Badge({ children, variant = "default", icon, style }: BadgeProps) {
  const colors = useThemeColors();
  const BG: Record<string, string> = { default: colors.bg.elevated, success: colors.status.successDim, warning: colors.status.warningDim, danger: colors.status.dangerDim, info: colors.status.infoDim };
  const FG: Record<string, string> = { default: colors.text.secondary, success: colors.status.success, warning: colors.status.warning, danger: colors.status.danger, info: colors.status.info };
  return (
    <View style={[{ flexDirection: "row", alignItems: "center", paddingHorizontal: 9, paddingVertical: 4, borderRadius: Radii.full, alignSelf: "flex-start", backgroundColor: BG[variant] }, style]}>
      {icon && <Feather name={icon} size={11} color={FG[variant]} style={{ marginRight: 4 }} />}
      <Text style={{ fontSize: Typography.size.xs, fontFamily: Typography.fontSemibold, letterSpacing: 0.4, color: FG[variant] }}>{children}</Text>
    </View>
  );
}

// ── Section Header ────────────────────────────────────────────────────────────
export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  const colors = useThemeColors();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: Spacing.sm, paddingHorizontal: 2 }}>
      <Text style={{ fontSize: Typography.size.xs, fontFamily: Typography.fontBold, color: colors.text.muted, letterSpacing: 1.5 }}>{title.toUpperCase()}</Text>
      {action && onAction && (
        <TouchableOpacity onPress={onAction} style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
          <Text style={{ fontSize: Typography.size.sm, color: colors.brand.primaryLight, fontFamily: Typography.fontSemibold }}>{action}</Text>
          <Feather name="arrow-right" size={13} color={colors.brand.primaryLight} />
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── Skeleton (shimmer) ───────────────────────────────────────────────────────
export function Skeleton({ width, height, style, radius }: { width?: number | string; height: number; style?: ViewStyle; radius?: number }) {
  const colors = useThemeColors();
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 900, easing: Easing.ease, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 900, easing: Easing.ease, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const opacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] });

  return (
    <Animated.View
      style={[
        { height, borderRadius: radius ?? Radii.md, backgroundColor: colors.bg.elevated, opacity },
        width ? { width: width as number } : { width: "100%" },
        style,
      ]}
    />
  );
}

// ── Divider ───────────────────────────────────────────────────────────────────
export function Divider() {
  const colors = useThemeColors();
  return <View style={{ height: 1, backgroundColor: colors.border.subtle, marginVertical: Spacing.sm }} />;
}

// ── Empty State ───────────────────────────────────────────────────────────────
export function EmptyState({
  icon,
  title,
  description,
}: {
  icon?: keyof typeof Feather.glyphMap;
  title: string;
  description?: string;
}) {
  const colors = useThemeColors();
  return (
    <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: Spacing["3xl"], paddingHorizontal: Spacing.xl }}>
      {icon && (
        <View style={{ width: 64, height: 64, borderRadius: Radii.full, backgroundColor: colors.bg.elevated, alignItems: "center", justifyContent: "center", marginBottom: Spacing.md }}>
          <Feather name={icon} size={28} color={colors.text.muted} />
        </View>
      )}
      <Text style={{ fontSize: Typography.size.base, fontFamily: Typography.fontSemibold, color: colors.text.secondary, textAlign: "center" }}>{title}</Text>
      {description && <Text style={{ fontSize: Typography.size.sm, color: colors.text.muted, textAlign: "center", marginTop: 4, lineHeight: 20 }}>{description}</Text>}
    </View>
  );
}

// ── Progress Bar ──────────────────────────────────────────────────────────────
export function ProgressBar({ progress, gradient = true }: { progress: number; gradient?: boolean }) {
  const colors = useThemeColors();
  const pct = Math.max(0, Math.min(1, progress));
  return (
    <View style={{ height: 8, backgroundColor: colors.bg.elevated, borderRadius: Radii.full, overflow: "hidden" }}>
      {gradient ? (
        <LinearGradient colors={Gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ height: "100%", borderRadius: Radii.full, width: `${pct * 100}%` }} />
      ) : (
        <View style={{ height: "100%", borderRadius: Radii.full, width: `${pct * 100}%`, backgroundColor: colors.brand.primary }} />
      )}
    </View>
  );
}
