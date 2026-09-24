import React, { useEffect } from "react";
import { useThemeStore } from "../../store/theme";
import { View, Text, ScrollView } from "react-native";
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withRepeat } from "react-native-reanimated";
import { Feather } from "@expo/vector-icons";
import {
  Typography,
  Spacing,
  Radii,
  ThemeColors,
  soft,
} from "../../theme";
import { Card, IconCircle, Badge } from "../ui";
import { FadeInItem } from "../Animated";
import { useT } from "../../i18n";
import { STATUS_CONFIG, PIPELINE_STEPS, fmt, makeStyles, IconName } from "./OrderStyles";

/** Animated pulsing skeleton row */
function SkeletonRow({ w = "60%", h = 14, colors }: { w?: number | `${number}%`; h?: number; colors: ThemeColors }) {
  const pulse = useSharedValue(0.4);
  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: 900 }),
      -1,
      true,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: pulse.value,
  }));
  return (
    <Animated.View
      style={[
        {
          height: h,
          width: w,
          borderRadius: 6,
          backgroundColor: colors.bg.elevated,
          marginVertical: 4,
        },
        animatedStyle,
      ]}
    />
  );
}

export function LoadingState({ colors }: { colors: ThemeColors }) {
  const styles = makeStyles(colors);
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} scrollEnabled={false}>
      <View style={styles.skeletonHeader}>
        <View style={{ width: 40, height: 40, borderRadius: Radii.full, backgroundColor: colors.bg.elevated }} />
        <SkeletonRow w="50%" h={22} colors={colors} />
      </View>
      <View style={[styles.heroBanner, { backgroundColor: colors.bg.elevated }]} />
      <Card style={{ marginBottom: Spacing.base, gap: 12 }}>
        <SkeletonRow w="40%" h={14} colors={colors} />
        <SkeletonRow w="70%" h={18} colors={colors} />
        <SkeletonRow w="55%" h={14} colors={colors} />
        <SkeletonRow w="65%" h={18} colors={colors} />
      </Card>
      <Card style={{ gap: 12 }}>
        <SkeletonRow w="30%" h={14} colors={colors} />
        {[1, 2, 3].map(i => <SkeletonRow key={i} w="90%" h={14} colors={colors} />)}
      </Card>
    </ScrollView>
  );
}

/** Pipeline tracker — shows progress or cancelled */
export function PipelineBanner({ status, holdReason, colors }: { status: string; holdReason?: string | null; colors: ThemeColors }) {
  const { isDark } = useThemeStore();
  const t = useT();
  // Незнакомое состояние не выдаётся за «Новый»: пропуск виден, неправда нет.
  const cfg = STATUS_CONFIG[status] ?? { ...STATUS_CONFIG.new, label: status, step: 0 };
  // Ждёт офиса — отдельная плашка с причиной, а не диаграмма: диаграмма
  // рисовала pending как «отгружен», и агент обещал магазину «завтра привезут».
  if (status === "pending") {
    return (
      <Card style={{ flexDirection: "row", alignItems: "center", gap: 16, padding: Spacing.lg, marginTop: Spacing.base, marginBottom: Spacing.base, borderColor: colors.status.warning + "30", borderWidth: 1 }}>
        <View style={{ width: 56, height: 56, borderRadius: Radii.lg, backgroundColor: colors.status.warningDim, alignItems: "center", justifyContent: "center" }}>
          <Feather name="pause-circle" size={28} color={colors.status.warning} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: Typography.size.lg, fontFamily: Typography.fontBold, color: colors.text.primary, marginBottom: 6 }}>{t("Ждёт подтверждения офиса", "Ofis tasdig'ini kutmoqda")}</Text>
          <Text style={{ fontSize: Typography.size.sm, color: colors.text.muted }}>
            {holdReason || t("Офис проверит заказ и подтвердит или отклонит. До этого срок доставки не обещайте.", "Ofis buyurtmani tekshirib tasdiqlaydi yoki rad etadi. Ungacha yetkazish muddatini va'da qilmang.")}
          </Text>
        </View>
      </Card>
    );
  }
  if (status === "cancelled") {
    return (
      <Card style={{ flexDirection: "row", alignItems: "center", gap: 16, padding: Spacing.lg, marginTop: Spacing.base, marginBottom: Spacing.base, borderColor: colors.status.danger + "30", borderWidth: 1 }}>
        <View style={{ width: 56, height: 56, borderRadius: Radii.lg, backgroundColor: colors.status.dangerDim, alignItems: "center", justifyContent: "center" }}>
          <Feather name="x-circle" size={28} color={colors.status.danger} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: Typography.size.lg, fontFamily: Typography.fontBold, color: colors.text.primary, marginBottom: 10 }}>{t("Заказ отменён", "Buyurtma bekor qilingan")}</Text>
          <Text style={{ fontSize: Typography.size.sm, color: colors.text.muted }}>{t("Этот заказ был отменён и не обрабатывается", "Bu buyurtma bekor qilingan va bajarilmaydi")}</Text>
        </View>
      </Card>
    );
  }
  return (
    <Card style={{ flexDirection: "row", alignItems: "center", gap: 16, padding: Spacing.lg, marginTop: Spacing.base, marginBottom: Spacing.base, borderColor: colors.status[cfg.badgeVariant] + "20", borderWidth: 1 }}>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <Text style={{ fontSize: Typography.size.lg, fontFamily: Typography.fontBold, color: colors.text.primary }}>{cfg.label}</Text>
          <Badge variant={cfg.badgeVariant}>{cfg.label}</Badge>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          {PIPELINE_STEPS.map((step, i) => {
            const done = i <= cfg.step;
            const active = i === cfg.step;
            return (
              <View key={step} style={{ flexDirection: "row", alignItems: "center" }}>
                <View style={{
                  width: 18, height: 18, borderRadius: Radii.full,
                  backgroundColor: done ? colors.accent.primary : colors.border.subtle,
                  alignItems: "center", justifyContent: "center",
                  ...(active ? soft(isDark).raisedSm : soft(isDark).inset),
                }}>
                  {done && !active && <Feather name="check" size={9} color={colors.brand.ink} />}
                  {active && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent.primary + "40" }} />}
                </View>
                <Text style={{ fontSize: Typography.size.xs, color: done ? colors.text.primary : colors.text.muted, marginHorizontal: 4, fontFamily: Typography.fontMedium }}>{step}</Text>
                {i < PIPELINE_STEPS.length - 1 && (
                  <View style={{ width: 16, height: 2, backgroundColor: done && i < cfg.step ? colors.accent.primary : colors.border.subtle, borderRadius: 1 }} />
                )}
              </View>
            );
          })}
        </View>
      </View>
      <View style={{ width: 56, height: 56, borderRadius: Radii.lg, backgroundColor: colors.status[cfg.badgeVariant] + "12", alignItems: "center", justifyContent: "center" }}>
        <Feather name={cfg.icon} size={32} color={colors.status[cfg.badgeVariant]} />
      </View>
    </Card>
  );
}

/** Info row inside a card */
export function InfoRow({ icon, label, value, accent, colors }: { icon: IconName; label: string; value: string; accent?: boolean; colors: ThemeColors }) {
  const styles = makeStyles(colors);
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoIcon}>
        <Feather name={icon} size={14} color={colors.brand.primaryLight} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={[styles.infoValue, accent && styles.infoValueAccent]}>{value}</Text>
      </View>
    </View>
  );
}

/** Order summary info card */
export function OrderInfoCard({ order, colors }: { order: any; colors: ThemeColors }) {
  const t = useT();
  return (
    <FadeInItem delay={0}>
      <Card style={{ marginBottom: Spacing.sm, padding: 0, overflow: "hidden" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: Spacing.base, paddingBottom: 12 }}>
          <IconCircle name="info" size={15} variant="brand" />
          <Text style={{ fontSize: Typography.size.sm, fontFamily: Typography.fontSemibold, color: colors.text.primary }}>{t("Информация", "Ma'lumot")}</Text>
        </View>
        <View style={{ height: 1, backgroundColor: colors.border.subtle, marginHorizontal: Spacing.base }} />
        <InfoRow icon="hash"        label={t("Номер заказа", "Buyurtma raqami")}  value={`#${order.orderNumber}`} colors={colors} />
        <InfoRow icon="calendar"    label={t("Дата создания", "Yaratilgan sana")} value={fmt(order.createdAt)} colors={colors} />
        <InfoRow icon="shopping-bag" label={t("Магазин", "Do'kon")}      value={order.shopName ?? t("Не указан", "Ko'rsatilmagan")} colors={colors} />
        {order.agent?.name && <InfoRow icon="user" label={t("Агент", "Agent")} value={order.agent.name} colors={colors} />}
        {order.shop?.address && <InfoRow icon="map-pin" label={t("Адрес", "Manzil")} value={order.shop.address} colors={colors} />}
        {order.notes     && <InfoRow icon="file-text"     label={t("Заметки", "Izohlar")}      value={order.notes} colors={colors} />}
      </Card>
    </FadeInItem>
  );
}
