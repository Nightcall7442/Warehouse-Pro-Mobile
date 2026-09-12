// Warehouse Pro — Unified Layout System
// Consistent padding, headers, and safe area handling for all screens.
import React from "react";
import { View, Text, TouchableOpacity, ViewStyle, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useThemeColors, useThemeStore } from "../store/theme";
import { Typography, Spacing, Radii, Shadows, BOTTOM_TAB_HEIGHT, soft } from "../theme";
import { DarkShadowColor } from "../theme";

// ── Constants ────────────────────────────────────────────────────────────────

// ── PageContainer ────────────────────────────────────────────────────────────
// Wraps every screen: sets background, safe-area padding, and standard bottom
// padding for the tab bar.
interface PageContainerProps {
  children: React.ReactNode;
  style?: ViewStyle;
  scrollable?: boolean;
  refreshControl?: React.ReactElement<React.ComponentProps<typeof import("react-native").RefreshControl>>;
  contentPadding?: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
}

export function PageContainer({
  children,
  style,
  scrollable = false,
  refreshControl,
  contentPadding = true,
}: PageContainerProps) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();

  const containerStyle: ViewStyle = {
    flex: 1,
    backgroundColor: colors.bg.primary,
  };

  const contentContainerStyle: ViewStyle = {
    paddingHorizontal: contentPadding ? Spacing.base : 0,
    paddingBottom: insets.bottom + BOTTOM_TAB_HEIGHT,
  };

  if (scrollable) {
    return (
      <ScrollView
        style={containerStyle}
        contentContainerStyle={contentContainerStyle}
        showsVerticalScrollIndicator={false}
        refreshControl={refreshControl}
      >
        {children}
      </ScrollView>
    );
  }

  return (
    <View style={[containerStyle, style]}>
      {children}
    </View>
  );
}

// ── PageHeader ───────────────────────────────────────────────────────────────
// Consistent page header with safe area, back button, title, and optional right.
interface PageHeaderProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  onBack?: () => void;
  right?: React.ReactNode;
  noBorder?: boolean;
}

export function PageHeader({ title, subtitle, showBack, onBack, right, noBorder }: PageHeaderProps) {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { isDark } = useThemeStore();
  const sc = isDark ? DarkShadowColor : Shadows.xs.shadowColor;

  return (
    <View
      style={{
        paddingTop: insets.top + Spacing.sm,
        paddingHorizontal: Spacing.base,
        paddingBottom: Spacing.md,
        backgroundColor: colors.bg.primary,
        borderBottomWidth: noBorder ? 0 : 1,
        borderBottomColor: colors.border.default,
        shadowColor: sc,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 4,
        elevation: 2,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: Spacing.md, flex: 1 }}>
          {showBack && onBack && (
            <TouchableOpacity
              onPress={onBack}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              style={{
                width: 36,
                height: 36,
                borderRadius: Radii.full,
                backgroundColor: colors.bg.elevated,
                alignItems: "center",
                justifyContent: "center", ...soft(isDark).raised,
              }}
            >
              <Feather name="arrow-left" size={18} color={colors.text.primary} />
            </TouchableOpacity>
          )}
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontFamily: Typography.fontExtraBold,
                fontSize: Typography.size.xxl,
                color: colors.text.primary,
              }}
              numberOfLines={1}
            >
              {title}
            </Text>
            {subtitle && (
              <Text
                style={{
                  fontFamily: Typography.fontRegular,
                  fontSize: Typography.size.xs,
                  color: colors.text.tertiary,
                  marginTop: 2,
                }}
              >
                {subtitle}
              </Text>
            )}
          </View>
        </View>
        {right && <View style={{ flexDirection: "row", alignItems: "center", gap: Spacing.sm }}>{right}</View>}
      </View>
    </View>
  );
}

// ── SectionTitle ─────────────────────────────────────────────────────────────
// Uppercase section label with optional action link.
interface SectionTitleProps {
  title: string;
  action?: string;
  onAction?: () => void;
}

export function SectionTitle({ title, action, onAction }: SectionTitleProps) {
  const colors = useThemeColors();
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginTop: Spacing.lg,
        marginBottom: Spacing.sm,
        paddingHorizontal: 2,
      }}
    >
      <Text
        style={{
          fontSize: Typography.size.xs,
          fontFamily: Typography.fontBold,
          color: colors.text.muted,
          letterSpacing: 1.5,
        }}
      >
        {title.toUpperCase()}
      </Text>
      {action && onAction && (
        <TouchableOpacity
          onPress={onAction}
          style={{ flexDirection: "row", alignItems: "center", gap: 3 }}
        >
          <Text
            style={{
              fontSize: Typography.size.sm,
              color: colors.brand.primaryLight,
              fontFamily: Typography.fontSemibold,
            }}
          >
            {action}
          </Text>
          <Feather name="arrow-right" size={13} color={colors.brand.primaryLight} />
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── IconAction ───────────────────────────────────────────────────────────────
// Round icon button used in headers and toolbars.
interface IconActionProps {
  icon: keyof typeof Feather.glyphMap;
  onPress?: () => void;
  badge?: number;
  variant?: "default" | "primary" | "ghost";
  size?: number;
}

export function IconAction({ icon, onPress, badge, variant = "default", size = 36 }: IconActionProps) {
  const colors = useThemeColors();
  const { isDark } = useThemeStore();
  const bg =
    variant === "primary" ? colors.accent.primary :
    variant === "ghost" ? "transparent" :
    colors.bg.elevated;
  const iconColor =
    variant === "primary" ? "#fff" : colors.text.primary;
  /*
    Кнопка-иконка приподнята, а не обведена. В прототипе это «выдавленный»
    квадратик со скруглением — колокольчик, поиск, шестерёнка; линия вокруг
    него из прежнего языка.
  */
  const borderStyle = variant === "default" ? soft(isDark).raisedSm : {};

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: bg,
        alignItems: "center",
        justifyContent: "center",
        ...borderStyle,
      }}
    >
      <Feather name={icon} size={size === 36 ? 18 : 16} color={iconColor} />
      {badge !== undefined && badge > 0 && (
        <View
          style={{
            position: "absolute",
            top: -2,
            right: -2,
            width: 18,
            height: 18,
            borderRadius: 9,
            backgroundColor: colors.status.danger,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ fontSize: 10, fontFamily: Typography.fontBold, color: "#fff" }}>
            {badge > 99 ? "99+" : badge}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ── Card (Neumorphic) ───────────────────────────────────────────────────────
// Standard neumorphic card matching the design system.
interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  onPress?: () => void;
  variant?: "default" | "flat" | "accent" | "inset";
}

export function Card({ children, style, onPress, variant = "default" }: CardProps) {
  const colors = useThemeColors();
  const { isDark } = useThemeStore();

  const cardStyle: ViewStyle = {
    backgroundColor:
      variant === "accent" ? colors.brand.primaryDim :
      variant === "inset" ? colors.bg.input :
      colors.bg.card,
    borderRadius: Radii.xxl,
    padding: Spacing.base,
    // «Вдавленный» вариант получает вдавленную грань, а не просто другой цвет:
    // в этом языке оформления углубление показывают тенью внутрь.
    ...(variant === "inset" ? soft(isDark).inset : {}),
    ...(variant === "default" || variant === "accent" ? soft(isDark).raised : {}),
    ...(variant === "flat" ? { borderWidth: 0 } : {}),
  };

  const content = (
    <View style={[cardStyle, style]}>
      {children}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity activeOpacity={0.85} onPress={onPress}>
        {content}
      </TouchableOpacity>
    );
  }
  return content;
}
