// Warehouse Pro — Neumorphic UI Kit
// Minimal components matching web index.css
import React from "react";
import { View, Text, TouchableOpacity, TouchableOpacityProps, ActivityIndicator, TextInput, ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { Typography, Spacing, Radii, Shadows, Gradients, ThemeColors, DarkShadowColor } from "../theme";
import { useThemeColors, useThemeStore } from "../store/theme";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

// ── Card ──────────────────────────────────────────────────────────────────────
// Matches web .neo-card: surface bg, neumorphic shadow, top highlight line
interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  onPress?: () => void;
  variant?: "default" | "flat" | "accent";
  haptic?: boolean;
}

export function Card({ children, style, onPress, variant = "default", haptic = true }: CardProps) {
  const colors = useThemeColors();
  const { isDark } = useThemeStore();
  const shadowColor = isDark ? DarkShadowColor : Shadows.sm.shadowColor;

  const cardStyle: ViewStyle = {
    backgroundColor: variant === "accent" ? colors.brand.primaryDim : colors.bg.card,
    borderRadius: Radii.xxl,
    padding: Spacing.base,
    borderWidth: 1,
    borderColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.5)",
    shadowColor,
    shadowOffset: Shadows.sm.shadowOffset,
    shadowOpacity: Shadows.sm.shadowOpacity,
    shadowRadius: Shadows.sm.shadowRadius,
    elevation: Shadows.sm.elevation,
    ...(variant === "flat" ? { shadowOpacity: 0, elevation: 0, borderColor: "transparent" } : null),
  };

  const content = (
    <View style={[cardStyle, style]}>
      {variant !== "flat" && (
        <View
          pointerEvents="none"
          style={{
            position: "absolute", top: 0, left: Radii.xxl, right: Radii.xxl, height: 1,
            backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.6)",
          }}
        />
      )}
      {children}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity activeOpacity={0.85} onPress={() => {
        if (haptic) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}>
        {content}
      </TouchableOpacity>
    );
  }
  return content;
}

// ── Button ────────────────────────────────────────────────────────────────────
interface ButtonProps extends TouchableOpacityProps {
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "danger" | "ghost" | "success";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  icon?: keyof typeof Feather.glyphMap;
  fullWidth?: boolean;
}

const SIZE_PAD: Record<string, { v: number; h: number }> = {
  sm: { v: 9, h: 14 },
  md: { v: 13, h: 18 },
  lg: { v: 16, h: 22 },
};

export function Button({
  children, variant = "primary", size = "md", loading, icon, fullWidth,
  style, disabled, onPress: _onPress, ...props
}: ButtonProps) {
  const colors = useThemeColors();
  const { isDark } = useThemeStore();
  const isDisabled = disabled || loading;
  const pad = SIZE_PAD[size];
  const shadowColor = isDark ? DarkShadowColor : Shadows.xs.shadowColor;

  const handlePress = (e: import("react-native").GestureResponderEvent) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    _onPress?.(e);
  };

  const textColor =
    variant === "primary" || variant === "danger" || variant === "success" ? "#fff"
    : variant === "ghost" ? colors.brand.primary
    : colors.text.primary;

  const inner = (
    <>
      {loading ? (
        <ActivityIndicator size="small" color={variant === "primary" || variant === "danger" || variant === "success" ? "#fff" : colors.accent.primary} />
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

  const base: ViewStyle = { flexDirection: "row", alignItems: "center", justifyContent: "center", borderRadius: Radii.md };

  if (variant === "primary" || variant === "success") {
    return (
      <TouchableOpacity activeOpacity={0.85} disabled={isDisabled} onPress={handlePress} style={[fullWidth && { width: "100%" }, isDisabled && { opacity: 0.45 }, style as ViewStyle]} {...props}>
        <LinearGradient colors={variant === "success" ? Gradients.success : Gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={[base, { paddingVertical: pad.v, paddingHorizontal: pad.h }]}>
          {inner}
        </LinearGradient>
      </TouchableOpacity>
    );
  }

  const variantStyle: ViewStyle =
    variant === "secondary" ? { backgroundColor: colors.bg.elevated, borderWidth: 1, borderColor: colors.border.default }
    : variant === "danger" ? { backgroundColor: colors.status.dangerDim, borderWidth: 1, borderColor: colors.status.danger + "40" }
    : variant === "ghost" ? { backgroundColor: "transparent" }
    : {};

  return (
    <TouchableOpacity
      activeOpacity={0.75} disabled={isDisabled} onPress={handlePress}
      style={[base, variantStyle, { paddingVertical: pad.v, paddingHorizontal: pad.h, shadowColor, shadowOffset: Shadows.xs.shadowOffset, shadowOpacity: Shadows.xs.shadowOpacity, shadowRadius: Shadows.xs.shadowRadius, elevation: Shadows.xs.elevation }, fullWidth && { width: "100%" }, isDisabled && { opacity: 0.45 }, style as ViewStyle]}
      {...props}
    >
      {inner}
    </TouchableOpacity>
  );
}

// ── Badge ─────────────────────────────────────────────────────────────────────
// Matches web .status-badge: dot + border + subtle bg
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
    <View style={[{ flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radii.full, alignSelf: "flex-start", backgroundColor: BG[variant], borderWidth: 1, borderColor: FG[variant] + "25" }, style]}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: FG[variant], marginRight: icon ? 5 : 6 }} />
      {icon && <Feather name={icon} size={11} color={FG[variant]} style={{ marginRight: 4 }} />}
      <Text style={{ fontSize: 11, fontFamily: Typography.fontSemibold, color: FG[variant] }}>{children}</Text>
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

// ── Search Input ──────────────────────────────────────────────────────────────
// Matches web .neo-input: inset shadow effect
interface SearchInputProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}

export function SearchInput({ value, onChangeText, placeholder = "Поиск…", autoFocus }: SearchInputProps) {
  const colors = useThemeColors();
  const { isDark } = useThemeStore();
  const shadowColor = isDark ? DarkShadowColor : "#a0988c";
  return (
    <View style={{
      flexDirection: "row", alignItems: "center", gap: 10,
      backgroundColor: colors.bg.input, borderRadius: Radii.lg,
      paddingHorizontal: Spacing.md, paddingVertical: 12,
      shadowColor, shadowOffset: { width: -2, height: -2 }, shadowOpacity: 0.15, shadowRadius: 4, elevation: -1,
    }}>
      <Feather name="search" size={16} color={colors.text.muted} />
      <TextInput
        style={{ flex: 1, fontSize: Typography.size.base, color: colors.text.primary, fontFamily: Typography.fontBody }}
        placeholder={placeholder}
        placeholderTextColor={colors.text.muted}
        value={value}
        onChangeText={onChangeText}
        autoFocus={autoFocus}
        autoCapitalize="none"
      />
      {!!value && (
        <TouchableOpacity onPress={() => onChangeText("")}>
          <Feather name="x" size={15} color={colors.text.muted} />
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── Divider ───────────────────────────────────────────────────────────────────
export function Divider() {
  const colors = useThemeColors();
  return <View style={{ height: 1, backgroundColor: colors.border.subtle, marginVertical: Spacing.sm }} />;
}

// ── Screen Header ────────────────────────────────────────────────────────────
export function ScreenHeader({ title, subtitle, right, style }: {
  title: string; subtitle?: string; right?: React.ReactNode; style?: ViewStyle;
}) {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { isDark } = useThemeStore();
  const shadowColor = isDark ? DarkShadowColor : "#a0988c";
  return (
    <View style={[{
      paddingTop: insets.top + 8, paddingBottom: 12, paddingHorizontal: 16,
      backgroundColor: colors.bg.secondary, borderBottomWidth: 1, borderColor: colors.border.default,
      shadowColor, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2,
    }, style]}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View>
          <Text style={{ fontFamily: Typography.fontExtraBold, fontSize: 22, color: colors.text.primary }}>{title}</Text>
          {subtitle && <Text style={{ fontFamily: Typography.fontRegular, fontSize: 13, color: colors.text.secondary, marginTop: 2 }}>{subtitle}</Text>}
        </View>
        {right}
      </View>
    </View>
  );
}

// ── Skeleton (shimmer) ───────────────────────────────────────────────────────
export function Skeleton({ width, height, style, radius }: { width?: number | string; height: number; style?: ViewStyle; radius?: number }) {
  return (
    <View style={[
      { height, borderRadius: radius ?? Radii.xl, backgroundColor: "rgba(0,0,0,0.04)", overflow: "hidden" },
      width ? { width: width as number } : { width: "100%" },
      style,
    ]} />
  );
}

// ── Empty State ──────────────────────────────────────────────────────────────
export function EmptyState({ icon, title, description }: { icon?: keyof typeof Feather.glyphMap; title: string; description?: string }) {
  const colors = useThemeColors();
  return (
    <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: Spacing["3xl"], paddingHorizontal: Spacing.xl }}>
      {icon && <Feather name={icon} size={36} color={colors.text.muted} style={{ marginBottom: Spacing.md }} />}
      <Text style={{ fontSize: Typography.size.base, fontFamily: Typography.fontSemibold, color: colors.text.secondary, textAlign: "center" }}>{title}</Text>
      {description && <Text style={{ fontSize: Typography.size.sm, color: colors.text.muted, textAlign: "center", marginTop: 4 }}>{description}</Text>}
    </View>
  );
}

// ── Icon Circle ──────────────────────────────────────────────────────────────
export function IconCircle({ name, size = 22, variant = "brand" }: { name: keyof typeof Feather.glyphMap; size?: number; variant?: string }) {
  const colors = useThemeColors();
  const bg = variant === "brand" ? colors.brand.primaryDim : colors.bg.elevated;
  const color = variant === "brand" ? colors.accent.primary : colors.text.secondary;
  return (
    <View style={{ width: size + 24, height: size + 24, borderRadius: Radii.lg, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}>
      <Feather name={name} size={size} color={color} />
    </View>
  );
}

// ── Plan Card (compact) ─────────────────────────────────────────────────────
type PlanStatus = "planned" | "visited" | "skipped";
const STATUS_LABEL: Record<PlanStatus, string> = { planned: "Запланирован", visited: "Посещён", skipped: "Пропущен" };

export function PlanCard({ plan, showCity, dimmed, loading, onVisit, onSkip }: {
  plan: { id: number; shopName?: string; shopAddress?: string; shopCity?: string; shopDebt?: string; status: string };
  showCity?: boolean; dimmed?: boolean; loading?: boolean; onVisit?: () => void; onSkip?: () => void;
}) {
  const colors = useThemeColors();
  const hasDebt = Number(plan.shopDebt ?? 0) > 0;
  const statusColor = plan.status === "visited" ? colors.accent.success : plan.status === "skipped" ? colors.accent.warning : colors.accent.info;

  return (
    <View style={{ backgroundColor: colors.bg.card, borderRadius: Radii.xl, padding: 14, marginBottom: 10, ...Shadows.panel, opacity: dimmed ? 0.6 : 1 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: Typography.fontSemibold, fontSize: 15, color: colors.text.primary }}>{plan.shopName ?? "Магазин"}</Text>
          <Text style={{ fontFamily: Typography.fontRegular, fontSize: 13, color: colors.text.secondary, marginTop: 2 }} numberOfLines={1}>
            {plan.shopAddress ?? "Адрес не указан"}{showCity && plan.shopCity ? ` · ${plan.shopCity}` : ""}
          </Text>
          {hasDebt && <Text style={{ fontFamily: Typography.fontMono, fontSize: 12, color: colors.accent.danger, marginTop: 4 }}>Долг: {Number(plan.shopDebt).toLocaleString("ru")} сум</Text>}
        </View>
        <View style={{ backgroundColor: statusColor + "18", paddingHorizontal: 9, paddingVertical: 4, borderRadius: Radii.full }}>
          <Text style={{ fontFamily: Typography.fontSemibold, fontSize: 11, color: statusColor }}>{STATUS_LABEL[plan.status as PlanStatus] ?? plan.status}</Text>
        </View>
      </View>
      {plan.status === "planned" && (onVisit || onSkip) && (
        <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
          {onVisit && (
            <TouchableOpacity onPress={onVisit} disabled={!!loading}
              style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.accent.success, borderRadius: Radii.md, paddingVertical: 9, opacity: loading ? 0.6 : 1 }}>
              {loading ? <ActivityIndicator size={13} color="#fff" /> : <Feather name="check-circle" size={13} color="#fff" />}
              <Text style={{ fontFamily: Typography.fontSemibold, fontSize: 12, color: "#fff" }}>Готово</Text>
            </TouchableOpacity>
          )}
          {onSkip && (
            <TouchableOpacity onPress={onSkip} disabled={!!loading}
              style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.bg.elevated, borderRadius: Radii.md, paddingVertical: 9 }}>
              <Feather name="clock" size={13} color={colors.accent.warning} />
              <Text style={{ fontFamily: Typography.fontSemibold, fontSize: 12, color: colors.accent.warning }}>Пропустить</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}
