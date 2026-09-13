// Warehouse Pro — Neumorphic UI Kit v2
// Cold palette (#e7ebf1 / #3b6fe0), dual-tone shadows
// All colors from theme.ts — no hardcoded hex in components.
import React from "react";
import { View, Text, TouchableOpacity, TouchableOpacityProps, ActivityIndicator, TextInput, ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { Typography, Spacing, Radii, Shadows, Gradients, DarkShadowColor, soft } from "../theme";
import { readableInk } from "../lib/contrast";
import { ShimmerSkeleton } from "./Animated";
import { useThemeColors, useThemeStore } from "../store/theme";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { formatMoney } from "../store/branding";
import { useT } from "../i18n";

// ── Card ──────────────────────────────────────────────────────────────────────
// Neumorphic card: bg.card bg, dual shadow, top highlight line.
// Matches reference design — cards are "sunk" into the canvas, not white plates.
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

  const cardStyle: ViewStyle = {
    backgroundColor: variant === "accent" ? colors.brand.primaryDim : colors.bg.card,
    borderRadius: Radii.xxl,
    padding: Spacing["2xl"],
    // Пара теней: светлая сверху-слева, серая снизу-справа. Рамки нет — в этом
    // языке оформления карточка отделяется от холста объёмом, а не линией.
    ...(variant === "flat" ? null : soft(isDark).raised),
  };

  /*
    Обрезка содержимого не должна съедать тени карточки.

    Тени рисуются ЗА границей элемента, поэтому overflow: "hidden" на самой
    карточке срезает их целиком — карточка становится плоской. Ровно это и
    происходило: восемь мест передавали сюда `overflow: "hidden"`, чтобы
    фотография не вылезала за скругление, и вместе с фотографией обрезался весь
    объём. Карточки товаров в каталоге, строки заказа, шапка магазина стояли
    плоскими, и со стороны это выглядело как «язык оформления сюда не дошёл».

    Обрезка переносится внутрь: тень остаётся на внешней поверхности, а
    содержимое обрезает вложенный слой с тем же скруглением. Места вызова при
    этом не меняются — они как передавали overflow, так и передают.
  */
  const merged: ViewStyle = Object.assign({}, cardStyle, ...(Array.isArray(style) ? style : [style ?? {}]));
  const clips = merged.overflow === "hidden";
  const content = (
    <View style={[cardStyle, style, clips ? { overflow: "visible" as const } : null]}>
      {clips ? (
        <View style={{
          borderRadius: merged.borderRadius,
          overflow: "hidden",
          // Карточке с заданной высотой вложенный слой должен её занять
          // целиком, иначе фотография внутри схлопнется в ноль.
          ...(merged.height !== undefined ? { height: "100%" as const } : null),
        }}>
          {children}
        </View>
      ) : children}
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
// Blue gradient primary, neumorphic secondary/danger.
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

// Кнопка размера sm выходит около 34 точек в высоту — ниже 44, с которых
// палец попадает надёжно. Поднимать отступ нельзя: он изменит высоту всех
// кнопок sm сразу, а их рисуют по две в ряд на карточке доставки. Запас
// добавлен только сверху и снизу: боковой налез бы на соседнюю кнопку, и
// промах вместо «ничего не произошло» стал бы нажатием не того.
const SM_HIT_SLOP = { top: 6, bottom: 6, left: 0, right: 0 };

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

  // Основная кнопка залита цветом бренда, а его выбирает арендатор. Белым
  // здесь было прописано намертво: на тёмно-синем читается, на жёлтом или
  // салатовом надпись исчезает. brand.ink считается по яркости заливки.
  //
  // «Опасно» и «Готово» страдали тем же, хотя цвета тут наши. У «опасно»
  // заливка — status.dangerDim, ПРОЗРАЧНЫЙ красный в 10%: в светлой теме сквозь
  // него просвечивает почти белая карточка, и белая надпись пропадала. Считать
  // чернила по самой строке "rgba(212,80,80,0.10)" нельзя — readableInk знает
  // только сплошной #rrggbb и на всё остальное отвечает белым, то есть ровно
  // тем, что мы чиним. Поэтому берётся фон, который сквозь тинт и виден, —
  // карточка.
  const dangerInk = readableInk(colors.bg.card);
  // У «Готово» заливка сплошная, но яркая-зелёная (#00e68a / #34c473) — белым по
  // ней контраст около 2:1. Чернила считаются по первому краю градиента: именно
  // он лежит под началом надписи.
  const successInk = readableInk(Gradients.success[0]);
  const textColor =
    variant === "primary" ? colors.brand.ink
    : variant === "danger" ? dangerInk
    : variant === "success" ? successInk
    : variant === "ghost" ? colors.brand.primary
    : colors.text.primary;

  const inner = (
    <>
      {loading ? (
        <ActivityIndicator size="small" color={variant === "ghost" || variant === "secondary" ? colors.accent.primary : textColor} />
      ) : (
        <>
          {icon && <Feather name={icon} size={size === "sm" ? 15 : 17} color={textColor} style={{ marginRight: 7 }} />}
          <Text style={{
            fontFamily: Typography.fontSemibold,
            letterSpacing: 0.2,
            color: textColor,
            fontSize: size === "sm" ? Typography.size.sm : size === "lg" ? Typography.size.md : Typography.size.base,
            textShadowColor: "rgba(0,0,0,0.2)",
            textShadowOffset: { width: 0, height: 1 },
            textShadowRadius: 1,
          }}>
            {children}
          </Text>
        </>
      )}
    </>
  );

  const base: ViewStyle = { flexDirection: "row", alignItems: "center", justifyContent: "center", borderRadius: Radii.md };

  if (variant === "primary" || variant === "success") {
    return (
      <TouchableOpacity activeOpacity={0.85} disabled={isDisabled} onPress={handlePress} hitSlop={size === "sm" ? SM_HIT_SLOP : undefined} style={[fullWidth && { width: "100%" }, isDisabled && { opacity: 0.45 }, style as ViewStyle]} {...props}>
        <LinearGradient colors={variant === "success" ? Gradients.success : Gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={[base, { paddingVertical: pad.v, paddingHorizontal: pad.h }]}>
          {inner}
        </LinearGradient>
      </TouchableOpacity>
    );
  }

  const variantStyle: ViewStyle =
    variant === "secondary" ? { backgroundColor: colors.bg.elevated, ...soft(isDark).raisedSm }
    : variant === "danger" ? { backgroundColor: colors.status.dangerDim, ...soft(isDark).raisedSm }
    // «Призрачная» кнопка остаётся плоской намеренно: у неё нет поверхности,
    // и объём означал бы, что нажимать надо именно её.
    : variant === "ghost" ? { backgroundColor: "transparent" }
    : {};

  return (
    <TouchableOpacity
      activeOpacity={0.75} disabled={isDisabled} onPress={handlePress}
      hitSlop={size === "sm" ? SM_HIT_SLOP : undefined}
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
    <View style={[{ flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radii.full, alignSelf: "flex-start", backgroundColor: BG[variant] }, style]}>
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

export function SearchInput({ value, onChangeText, placeholder, autoFocus }: SearchInputProps) {
  const colors = useThemeColors();
  const t = useT();
  const { isDark } = useThemeStore();
  const shadowColor = isDark ? DarkShadowColor : Shadows.inner.shadowColor;
  return (
    <View style={{
      flexDirection: "row", alignItems: "center", gap: 10,
      backgroundColor: colors.bg.input, borderRadius: Radii.lg,
      paddingHorizontal: Spacing.md, paddingVertical: 12,
      // Neumorphic inset: inner shadow (bottom-right dark)
      shadowColor,
      shadowOffset: { width: -3, height: -3 },
      shadowOpacity: isDark ? 0.3 : 0.2,
      shadowRadius: 6,
      elevation: -1,
      // Волосяная обводка была имитацией блика — настоящий даёт вдавленный
      // набор теней, которым поле и утоплено в холст.
    }}>
      <Feather name="search" size={16} color={colors.text.muted} />
      <TextInput
        style={{ flex: 1, fontSize: Typography.size.base, color: colors.text.primary, fontFamily: Typography.fontBody }}
        placeholder={placeholder ?? t("Поиск…", "Qidiruv…")}
        placeholderTextColor={colors.text.muted}
        value={value}
        onChangeText={onChangeText}
        autoFocus={autoFocus}
        autoCapitalize="none"
      />
      {!!value && (
        // Голая иконка в 15 точек — цель размером с саму иконку. Агент на ходу
        // промахивался мимо крестика и попадал в поле, а поле открывает
        // клавиатуру: вместо очистки запроса — лишний экран. Запас в 14 точек
        // взят у «глаза» пароля на входе, там та же беда уже вылечена.
        <TouchableOpacity
          onPress={() => onChangeText("")}
          hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
          accessibilityLabel={t("Очистить поиск", "Qidiruvni tozalash")}
        >
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
  const shadowColor = isDark ? DarkShadowColor : Shadows.xs.shadowColor;
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

// ── Skeleton ─────────────────────────────────────────────────────────────────
// Заливка была прописана намертво — rgba(0,0,0,0.04), чёрное по чёрному: в
// тёмной теме экран выбора магазина во время загрузки выглядел просто чёрным
// полем, и агент не понимал, идёт загрузка или список пуст. ShimmerSkeleton
// тему уже знает, поэтому здесь остался только вызов: у Skeleton есть свои
// вызывающие (app/order/new.tsx), их подпись не трогаем.
export function Skeleton(props: { width?: number | string; height: number; style?: ViewStyle; radius?: number }) {
  return <ShimmerSkeleton {...props} />;
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
const statusLabel = (t: (ru: string, uz: string) => string): Record<PlanStatus, string> => ({ planned: t("Запланирован", "Rejalashtirilgan"), visited: t("Посещён", "Tashrif"), skipped: t("Пропущен", "O'tkazildi") });

export function PlanCard({ plan, showCity, dimmed, loading, onVisit, onSkip }: {
  plan: { id: number; shopName?: string; shopAddress?: string; shopCity?: string; shopDebt?: string; status: string };
  showCity?: boolean; dimmed?: boolean; loading?: boolean; onVisit?: () => void; onSkip?: () => void;
}) {
  const colors = useThemeColors();
  const t = useT();
  const hasDebt = Number(plan.shopDebt ?? 0) > 0;
  const statusColor = plan.status === "visited" ? colors.accent.success : plan.status === "skipped" ? colors.accent.warning : colors.accent.info;
  const doneInk = readableInk(colors.accent.success);

  return (
    <View style={{ backgroundColor: colors.bg.card, borderRadius: Radii.xl, padding: 14, marginBottom: 10, ...Shadows.panel, opacity: dimmed ? 0.6 : 1 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: Typography.fontSemibold, fontSize: 15, color: colors.text.primary }}>{plan.shopName ?? t("Магазин", "Do'kon")}</Text>
          <Text style={{ fontFamily: Typography.fontRegular, fontSize: 13, color: colors.text.secondary, marginTop: 2 }} numberOfLines={1}>
            {plan.shopAddress ?? t("Адрес не указан", "Manzil ko'rsatilmagan")}{showCity && plan.shopCity ? ` · ${plan.shopCity}` : ""}
          </Text>
          {hasDebt && <Text style={{ fontFamily: Typography.fontMono, fontSize: 12, color: colors.accent.danger, marginTop: 4 }}>{t("Долг", "Qarz")}: {formatMoney(plan.shopDebt)}</Text>}
        </View>
        <View style={{ backgroundColor: statusColor + "18", paddingHorizontal: 9, paddingVertical: 4, borderRadius: Radii.full }}>
          <Text style={{ fontFamily: Typography.fontSemibold, fontSize: 11, color: statusColor }}>{statusLabel(t)[plan.status as PlanStatus] ?? plan.status}</Text>
        </View>
      </View>
      {plan.status === "planned" && (onVisit || onSkip) && (
        <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
          {onVisit && (
            <TouchableOpacity onPress={onVisit} disabled={!!loading}
              style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.accent.success, borderRadius: Radii.md, paddingVertical: 9, opacity: loading ? 0.6 : 1 }}>
              {/* Та же беда, что у кнопки «Готово» в Button: заливка — яркий
                  зелёный, а надпись была прописана белым. Контраст около 2:1,
                  на солнце подпись не читается вовсе. */}
              {loading ? <ActivityIndicator size={13} color={doneInk} /> : <Feather name="check-circle" size={13} color={doneInk} />}
              <Text style={{ fontFamily: Typography.fontSemibold, fontSize: 12, color: doneInk }}>{t("Готово", "Tayyor")}</Text>
            </TouchableOpacity>
          )}
          {onSkip && (
            <TouchableOpacity onPress={onSkip} disabled={!!loading}
              style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.bg.elevated, borderRadius: Radii.md, paddingVertical: 9 }}>
              <Feather name="clock" size={13} color={colors.accent.warning} />
              <Text style={{ fontFamily: Typography.fontSemibold, fontSize: 12, color: colors.accent.warning }}>{t("Пропустить", "O'tkazish")}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}
