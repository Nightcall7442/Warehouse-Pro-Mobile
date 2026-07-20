// Warehouse Pro — Agent Dashboard v2 (cold palette + rings/sparklines)
import React, { useCallback } from "react";
import { View, Text, ScrollView, RefreshControl, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { Feather } from "@expo/vector-icons";
import { useAuthStore } from "../../src/store/auth";
import { getAgentDashboard, getSupervisorDashboard, getPlans, updatePlanStatus, Plan } from "../../src/api";
import { Card, SectionHeader } from "../../src/components/ui";
import { ProgressRing, Sparkline, NeumorphicProgressBar } from "../../src/components/Charts";
import { Typography, Spacing, Radii, Shadows, KpiColors, ThemeColors, Gradients } from "../../src/theme";
import { useThemeColors, useThemeStore } from "../../src/store/theme";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { FadeInItem, PressableScale, ShimmerSkeleton } from "../../src/components/Animated";
import { LinearGradient } from "expo-linear-gradient";

type IconName = keyof typeof Feather.glyphMap;

// ── CardDots — 3 colored dots (cold palette) ──────────────────────────────────
function CardDots() {
  return (
    <View style={{ flexDirection: "row", gap: 6, marginBottom: 12 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: KpiColors.coral }} />
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: KpiColors.amber }} />
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: KpiColors.teal }} />
    </View>
  );
}

// ── Plan card (matches web PlanCard) ─────────────────────────────────────────
function PlanRow({ plan, onDone, onSkip, onPress, colors, isDark, index }: {
  plan: Plan; onDone: () => void; onSkip: () => void; onPress?: () => void; colors: ThemeColors; isDark: boolean; index: number;
}) {
  const STATUS_META: Record<string, { icon: IconName; color: string; bg: string; label: string }> = {
    visited: { icon: "check-circle", color: colors.status.success, bg: colors.status.successDim, label: "Посещён" },
    skipped: { icon: "clock", color: colors.status.warning, bg: colors.status.warningDim, label: "Пропущен" },
    planned: { icon: "circle", color: colors.status.info, bg: colors.status.infoDim, label: "Запланирован" },
  };
  const cfg = STATUS_META[plan.status] ?? STATUS_META.planned;
  const hasDebt = Number(plan.shopDebt ?? 0) > 0;
  const shadowColor = isDark ? "#000" : Shadows.xs.shadowColor;

  return (
    <FadeInItem delay={index * 60}>
      <PressableScale onPress={onPress} haptic="light">
        <View style={{
          flexDirection: "row", alignItems: "center",
          backgroundColor: colors.bg.card, borderRadius: Radii.lg,
          padding: 12, marginBottom: 8, borderWidth: 1,
          borderColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.5)",
          shadowColor, shadowOffset: Shadows.xs.shadowOffset, shadowOpacity: Shadows.xs.shadowOpacity, shadowRadius: Shadows.xs.shadowRadius, elevation: Shadows.xs.elevation,
          opacity: plan.status === "visited" ? 0.6 : 1,
        }}>
        <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: cfg.bg, alignItems: "center", justifyContent: "center" }}>
          <Feather name={cfg.icon} size={14} color={cfg.color} />
        </View>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={{ fontFamily: Typography.fontSemibold, fontSize: Typography.size.base, color: colors.text.primary }} numberOfLines={1}>
            {plan.shopName ?? "Магазин"}
          </Text>
          <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.xs, color: colors.text.tertiary, marginTop: 1 }} numberOfLines={1}>
            {plan.shopAddress ?? "Адрес не указан"}
          </Text>
        </View>
        <View style={{ alignItems: "flex-end", gap: 4 }}>
          {hasDebt && (
            <Text style={{ fontFamily: Typography.fontMono, fontSize: Typography.size.xs, color: colors.status.danger }}>
              {Number(plan.shopDebt).toLocaleString("ru")} сум
            </Text>
          )}
          {plan.status === "planned" && (
            <View style={{ flexDirection: "row", gap: 6 }}>
              <PressableScale onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onSkip(); }} haptic="none" scaleTo={0.93}>
                <View style={{ backgroundColor: colors.bg.elevated, borderRadius: Radii.sm, paddingVertical: 5, paddingHorizontal: 10 }}>
                  <Feather name="clock" size={12} color={colors.accent.warning} />
                </View>
              </PressableScale>
              <PressableScale onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onDone(); }} haptic="none" scaleTo={0.93}>
                <View style={{ backgroundColor: colors.accent.success, borderRadius: Radii.sm, paddingVertical: 5, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Feather name="check" size={12} color="#fff" />
                  <Text style={{ fontFamily: Typography.fontSemibold, fontSize: 11, color: "#fff" }}>Готово</Text>
                </View>
              </PressableScale>
            </View>
          )}
        </View>
      </View>
      </PressableScale>
    </FadeInItem>
  );
}

// ── Agent Home ────────────────────────────────────────────────────────────────
function AgentHome() {
  const router = useRouter();
  const colors = useThemeColors();
  const { isDark } = useThemeStore();
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();
  const qc = useQueryClient();

  const isAgentRole = user?.role === "agent" || user?.role === "supervisor" || user?.role === "ceo" || user?.role === "operator";

  const { data: kpis, isLoading: kpisLoading, isError: kpisError, refetch: refetchKpis } = useQuery({
    queryKey: ["agentDashboard"], queryFn: getAgentDashboard, retry: false, enabled: isAgentRole,
  });

  const { data: plans, isLoading: plansLoading, refetch: refetchPlans } = useQuery({
    queryKey: ["plans"],
    queryFn: async () => { const r = await getPlans(); return Array.isArray(r) ? r : []; },
    retry: false, enabled: isAgentRole,
  });

  const updateMutation = useMutation({
    mutationFn: ({ planId, status }: { planId: number; status: Plan["status"] }) => updatePlanStatus(planId, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["plans"] }),
  });

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Доброе утро" : hour < 18 ? "Добрый день" : "Добрый вечер";
  const firstName = (user?.name ?? user?.email ?? "Агент").split(" ")[0];

  const visited = plans?.filter(p => p.status === "visited").length ?? 0;
  const total = plans?.length ?? 0;
  const pct = total > 0 ? Math.round((visited / total) * 100) : 0;

  const handleRefresh = useCallback(async () => {
    await Promise.all([refetchKpis(), refetchPlans()]);
  }, [refetchKpis, refetchPlans]);

  const scrollRefresh = <RefreshControl refreshing={false} onRefresh={handleRefresh} tintColor={colors.brand.primary} />;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg.primary }} contentContainerStyle={{ paddingHorizontal: Spacing.base, paddingTop: insets.top + Spacing.lg, paddingBottom: insets.bottom + 100 }} refreshControl={scrollRefresh} showsVerticalScrollIndicator={false}>
      {/* Header — cold palette, avatar style */}
      <FadeInItem delay={0}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: Spacing.lg }}>
          <View style={{ flex: 1 }}>
            <CardDots />
            <Text style={{ fontSize: Typography.size.sm, fontFamily: Typography.fontMedium, color: colors.accent.primary }}>{greeting}, {firstName}</Text>
            <Text style={{ fontSize: Typography.size.xxl, fontFamily: Typography.fontExtraBold, color: colors.text.primary, marginTop: 2 }}>Мой день</Text>
            <Text style={{ fontSize: Typography.size.xs, fontFamily: Typography.fontBody, color: colors.text.tertiary, marginTop: 2, textTransform: "capitalize" }}>
              {format(new Date(), "EEEE, d MMMM", { locale: ru })}
            </Text>
          </View>
          <PressableScale onPress={() => router.push("/order/new")} haptic="light">
            <LinearGradient colors={Gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: Radii.md }}>
              <Feather name="plus" size={14} color="#fff" />
              <Text style={{ fontSize: Typography.size.xs, fontFamily: Typography.fontBold, color: "#fff" }}>Новый заказ</Text>
            </LinearGradient>
          </PressableScale>
        </View>
      </FadeInItem>

      {/* KPI rings — 2 donuts + revenue sparkline card */}
      <FadeInItem delay={80}>
        <View style={{ flexDirection: "row", gap: Spacing.sm, marginBottom: Spacing.base }}>
          {kpisLoading ? (
            <>
              <ShimmerSkeleton height={120} style={{ flex: 1 }} radius={Radii.xl} />
              <ShimmerSkeleton height={120} style={{ flex: 1 }} radius={Radii.xl} />
            </>
          ) : kpisError ? (
            <PressableScale onPress={() => refetchKpis()} haptic="light" style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 64, borderRadius: Radii.lg, backgroundColor: colors.status.dangerDim, borderWidth: 1, borderColor: colors.status.danger + "30" }}>
                <Feather name="wifi-off" size={14} color={colors.status.danger} />
                <Text style={{ fontFamily: Typography.fontMedium, fontSize: Typography.size.sm, color: colors.status.danger }}>Ошибка — тап</Text>
              </View>
            </PressableScale>
          ) : (
            <>
              {/* Orders ring */}
              <Card style={{ flex: 1, alignItems: "center", padding: Spacing.md }}>
                <ProgressRing value={kpis?.todayOrders ? Math.min(kpis.todayOrders * 10, 100) : 0} size={70} strokeWidth={7} color={KpiColors.blue} />
                <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.lg, color: colors.text.primary, marginTop: 8 }}>{kpis?.todayOrders ?? 0}</Text>
                <Text style={{ fontFamily: Typography.fontMedium, fontSize: 9, color: colors.text.tertiary, letterSpacing: 0.5, textTransform: "uppercase" }}>Заказов</Text>
              </Card>
              {/* Shops ring */}
              <Card style={{ flex: 1, alignItems: "center", padding: Spacing.md }}>
                <ProgressRing value={kpis?.assignedShops ? Math.min(kpis.assignedShops * 10, 100) : 0} size={70} strokeWidth={7} color={KpiColors.teal} />
                <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.lg, color: colors.text.primary, marginTop: 8 }}>{kpis?.assignedShops ?? 0}</Text>
                <Text style={{ fontFamily: Typography.fontMedium, fontSize: 9, color: colors.text.tertiary, letterSpacing: 0.5, textTransform: "uppercase" }}>Магазинов</Text>
              </Card>
            </>
          )}
        </View>
      </FadeInItem>

      {/* Revenue card with sparkline */}
      <FadeInItem delay={120}>
        <Card style={{ marginBottom: Spacing.base }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <View>
              <Text style={{ fontFamily: Typography.fontMedium, fontSize: Typography.size.xs, color: colors.text.tertiary, letterSpacing: 1, textTransform: "uppercase" }}>Выручка сегодня</Text>
              <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.xxl, color: colors.text.primary, marginTop: 4, fontVariant: ["tabular-nums"] }}>
                {(kpis?.todayRevenue ?? 0).toLocaleString("ru")} сум
              </Text>
            </View>
            <ProgressRing value={kpis?.todayRevenue ? Math.min((kpis.todayRevenue / 1000000) * 100, 100) : 0} size={56} strokeWidth={6} color={KpiColors.green} />
          </View>
          <Sparkline data={[12, 19, 8, 15, 22, 18, 25]} color={KpiColors.blue} width={280} height={40} />
        </Card>
      </FadeInItem>

      {/* Progress card — inset progress bar */}
      <FadeInItem delay={160}>
        <Card style={{ marginBottom: Spacing.base }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <Text style={{ fontFamily: Typography.fontMedium, fontSize: Typography.size.xs, color: colors.text.tertiary, letterSpacing: 1, textTransform: "uppercase" }}>ПЛАН ВИЗИТОВ</Text>
            <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.sm, color: pct >= 80 ? colors.status.success : pct >= 40 ? colors.status.warning : colors.accent.primary, fontVariant: ["tabular-nums"] }}>
              {visited}/{total} · {pct}%
            </Text>
          </View>
          <NeumorphicProgressBar value={pct} height={8} color={pct >= 80 ? colors.status.success : pct >= 40 ? colors.status.warning : colors.brand.primary} />
          <Text style={{ fontSize: Typography.size.xs, color: colors.text.muted, marginTop: 8 }}>
            {total === 0 ? "На сегодня визитов нет" : pct === 100 ? "Все визиты выполнены!" : `Осталось ${total - visited}`}
          </Text>
        </Card>
      </FadeInItem>

      {/* Quick actions — 2x2 grid */}
      <FadeInItem delay={200}>
        <View style={{ flexDirection: "row", gap: Spacing.sm, marginBottom: Spacing.base }}>
          <PressableScale onPress={() => router.push("/order/new")} haptic="light" style={{ flex: 1 }}>
            <LinearGradient colors={Gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={{ alignItems: "center", justifyContent: "center", paddingVertical: Spacing.lg, borderRadius: Radii.lg, gap: 8 }}>
              <View style={{ width: 36, height: 36, borderRadius: Radii.md, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" }}>
                <Feather name="plus-circle" size={18} color="#fff" />
              </View>
              <Text style={{ fontSize: Typography.size.xs, fontFamily: Typography.fontBold, color: "#fff", letterSpacing: 1 }}>НОВЫЙ ЗАКАЗ</Text>
            </LinearGradient>
          </PressableScale>
          <PressableScale onPress={() => router.push("/(tabs)/shops")} haptic="light" style={{ flex: 1 }}>
            <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: Spacing.lg, borderRadius: Radii.lg, gap: 8, backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.default }}>
              <View style={{ width: 36, height: 36, borderRadius: Radii.md, backgroundColor: colors.brand.primaryDim, alignItems: "center", justifyContent: "center" }}>
                <Feather name="shopping-bag" size={18} color={colors.brand.primaryLight} />
              </View>
              <Text style={{ fontSize: Typography.size.xs, fontFamily: Typography.fontBold, color: colors.text.primary, letterSpacing: 1 }}>МАГАЗИНЫ</Text>
            </View>
          </PressableScale>
        </View>
        <View style={{ flexDirection: "row", gap: Spacing.sm, marginBottom: Spacing.base }}>
          <PressableScale onPress={() => router.push("/(tabs)/gps")} haptic="light" style={{ flex: 1 }}>
            <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: Spacing.md, borderRadius: Radii.lg, gap: 8, backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.default }}>
              <View style={{ width: 32, height: 32, borderRadius: Radii.sm, backgroundColor: colors.status.successDim, alignItems: "center", justifyContent: "center" }}>
                <Feather name="navigation" size={16} color={colors.status.success} />
              </View>
              <Text style={{ fontSize: Typography.size.xs, fontFamily: Typography.fontBold, color: colors.text.primary, letterSpacing: 0.5 }}>GPS</Text>
            </View>
          </PressableScale>
          <PressableScale onPress={() => router.push("/(tabs)/barcode")} haptic="light" style={{ flex: 1 }}>
            <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: Spacing.md, borderRadius: Radii.lg, gap: 8, backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.default }}>
              <View style={{ width: 32, height: 32, borderRadius: Radii.sm, backgroundColor: colors.brand.primaryDim, alignItems: "center", justifyContent: "center" }}>
                <Feather name="maximize" size={16} color={colors.accent.primary} />
              </View>
              <Text style={{ fontSize: Typography.size.xs, fontFamily: Typography.fontBold, color: colors.text.primary, letterSpacing: 0.5 }}>БАРКОД</Text>
            </View>
          </PressableScale>
          <PressableScale onPress={() => router.push("/(tabs)/profile")} haptic="light" style={{ flex: 1 }}>
            <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: Spacing.md, borderRadius: Radii.lg, gap: 8, backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.default }}>
              <View style={{ width: 32, height: 32, borderRadius: Radii.sm, backgroundColor: colors.status.infoDim, alignItems: "center", justifyContent: "center" }}>
                <Feather name="user" size={16} color={colors.status.info} />
              </View>
              <Text style={{ fontSize: Typography.size.xs, fontFamily: Typography.fontBold, color: colors.text.primary, letterSpacing: 0.5 }}>ПРОФИЛЬ</Text>
            </View>
          </PressableScale>
        </View>
      </FadeInItem>

      {/* Today's visits */}
      <FadeInItem delay={320}>
        <SectionHeader title="Сегодняшние визиты" />
      </FadeInItem>
      <Card style={{ padding: 0, overflow: "hidden" }}>
        {plansLoading ? (
          <View style={{ padding: Spacing.base, gap: 10 }}>
            {[1, 2, 3].map(i => <ShimmerSkeleton key={i} height={56} radius={Radii.lg} />)}
          </View>
        ) : !plans?.length ? (
          <View style={{ padding: Spacing.xl, alignItems: "center", gap: 8 }}>
            <Feather name="calendar" size={28} color={colors.text.muted} />
            <Text style={{ fontSize: Typography.size.sm, color: colors.text.muted }}>На сегодня визитов нет</Text>
          </View>
        ) : (
          plans.map((plan, idx) => (
            <View key={plan.id}>
              <PlanRow plan={plan} colors={colors} isDark={isDark} index={idx}
                onDone={() => updateMutation.mutate({ planId: plan.id, status: "visited" })}
                onSkip={() => updateMutation.mutate({ planId: plan.id, status: "skipped" })}
                onPress={() => plan.shopId && router.push({ pathname: "/shop/[id]", params: { id: String(plan.shopId) } })}
              />
              {idx < plans.length - 1 && <View style={{ height: 1, backgroundColor: colors.border.subtle, marginLeft: 54 }} />}
            </View>
          ))
        )}
      </Card>
    </ScrollView>
  );
}

// ── Supervisor Home ───────────────────────────────────────────────────────────
function SupervisorHome() {
  const router = useRouter();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();

  const { data: kpis, isLoading, isError, refetch } = useQuery({
    queryKey: ["supervisorDashboard"], queryFn: getSupervisorDashboard, retry: false,
  });

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Доброе утро" : hour < 18 ? "Добрый день" : "Добрый вечер";
  const firstName = (user?.name ?? user?.email ?? "Супервайзер").split(" ")[0];

  const scrollRefresh = <RefreshControl refreshing={false} onRefresh={refetch} tintColor={colors.brand.primary} />;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg.primary }} contentContainerStyle={{ paddingHorizontal: Spacing.base, paddingTop: insets.top + Spacing.lg, paddingBottom: insets.bottom + 100 }} refreshControl={scrollRefresh} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <FadeInItem delay={0}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: Spacing.lg }}>
          <View style={{ flex: 1 }}>
            <CardDots />
            <Text style={{ fontSize: Typography.size.sm, fontFamily: Typography.fontMedium, color: colors.accent.primary }}>{greeting}, {firstName}</Text>
            <Text style={{ fontSize: Typography.size.xxl, fontFamily: Typography.fontExtraBold, color: colors.text.primary, marginTop: 2 }}>Главная</Text>
          </View>
        </View>
      </FadeInItem>

      {/* KPI rings + revenue card */}
      <FadeInItem delay={80}>
        <View style={{ flexDirection: "row", gap: Spacing.sm, marginBottom: Spacing.base }}>
          {isLoading ? (
            <>
              <ShimmerSkeleton height={120} style={{ flex: 1 }} radius={Radii.xl} />
              <ShimmerSkeleton height={120} style={{ flex: 1 }} radius={Radii.xl} />
            </>
          ) : isError ? (
            <PressableScale onPress={() => refetch()} haptic="light" style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 64, borderRadius: Radii.lg, backgroundColor: colors.status.dangerDim, borderWidth: 1, borderColor: colors.status.danger + "30" }}>
                <Feather name="wifi-off" size={14} color={colors.status.danger} />
                <Text style={{ fontFamily: Typography.fontMedium, fontSize: Typography.size.sm, color: colors.status.danger }}>Ошибка — тап</Text>
              </View>
            </PressableScale>
          ) : (
            <>
              {/* Orders ring */}
              <Card style={{ flex: 1, alignItems: "center", padding: Spacing.md }}>
                <ProgressRing value={kpis?.todayOrders ? Math.min(kpis.todayOrders * 10, 100) : 0} size={70} strokeWidth={7} color={KpiColors.blue} />
                <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.lg, color: colors.text.primary, marginTop: 8 }}>{kpis?.todayOrders ?? 0}</Text>
                <Text style={{ fontFamily: Typography.fontMedium, fontSize: 9, color: colors.text.tertiary, letterSpacing: 0.5, textTransform: "uppercase" }}>Заказов</Text>
              </Card>
              {/* Agents ring */}
              <Card style={{ flex: 1, alignItems: "center", padding: Spacing.md }}>
                <ProgressRing value={kpis?.activeAgents ? Math.round((kpis.onlineAgents ?? 0) / Math.max(kpis.activeAgents, 1) * 100) : 0} size={70} strokeWidth={7} color={KpiColors.teal} />
                <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.lg, color: colors.text.primary, marginTop: 8 }}>{kpis?.onlineAgents ?? 0}/{kpis?.activeAgents ?? 0}</Text>
                <Text style={{ fontFamily: Typography.fontMedium, fontSize: 9, color: colors.text.tertiary, letterSpacing: 0.5, textTransform: "uppercase" }}>Агенты онлайн</Text>
              </Card>
            </>
          )}
        </View>
      </FadeInItem>

      {/* Revenue card with sparkline */}
      <FadeInItem delay={120}>
        <Card style={{ marginBottom: Spacing.base }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <View>
              <Text style={{ fontFamily: Typography.fontMedium, fontSize: Typography.size.xs, color: colors.text.tertiary, letterSpacing: 1, textTransform: "uppercase" }}>Выручка сегодня</Text>
              <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.xxl, color: colors.text.primary, marginTop: 4, fontVariant: ["tabular-nums"] }}>
                {(kpis?.todayRevenue ?? 0).toLocaleString("ru")} сум
              </Text>
            </View>
            <ProgressRing value={kpis?.todayRevenue ? Math.min((kpis.todayRevenue / 5000000) * 100, 100) : 0} size={56} strokeWidth={6} color={KpiColors.green} />
          </View>
          <Sparkline data={[8, 15, 12, 20, 18, 25, 22]} color={KpiColors.blue} width={280} height={40} />
        </Card>
      </FadeInItem>

      {/* Quick actions */}
      <FadeInItem delay={160}>
        <View style={{ flexDirection: "row", gap: Spacing.sm, marginBottom: Spacing.base }}>
          <PressableScale onPress={() => router.push("/(tabs)/tracking")} haptic="light" style={{ flex: 1 }}>
            <LinearGradient colors={Gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={{ alignItems: "center", justifyContent: "center", paddingVertical: Spacing.lg, borderRadius: Radii.lg, gap: 8 }}>
              <View style={{ width: 36, height: 36, borderRadius: Radii.md, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" }}>
                <Feather name="map-pin" size={18} color="#fff" />
              </View>
              <Text style={{ fontSize: Typography.size.xs, fontFamily: Typography.fontBold, color: "#fff", letterSpacing: 1 }}>ТРЕКИНГ</Text>
            </LinearGradient>
          </PressableScale>
          <PressableScale onPress={() => router.push("/(tabs)/plans")} haptic="light" style={{ flex: 1 }}>
            <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: Spacing.lg, borderRadius: Radii.lg, gap: 8, backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.default }}>
              <View style={{ width: 36, height: 36, borderRadius: Radii.md, backgroundColor: colors.brand.primaryDim, alignItems: "center", justifyContent: "center" }}>
                <Feather name="calendar" size={18} color={colors.brand.primaryLight} />
              </View>
              <Text style={{ fontSize: Typography.size.xs, fontFamily: Typography.fontBold, color: colors.text.primary, letterSpacing: 1 }}>ПЛАНЫ</Text>
            </View>
          </PressableScale>
        </View>
      </FadeInItem>
    </ScrollView>
  );
}

// ── Courier Home ──────────────────────────────────────────────────────────────
const COURIER_STATUS: Record<string, { icon: IconName; variant: string; label: string }> = {
  assigned:         { icon: "package",    variant: "info",    label: "Назначен" },
  out_for_delivery: { icon: "truck",      variant: "warning", label: "В пути" },
  delivered:        { icon: "check-circle", variant: "success", label: "Доставлен" },
  failed:           { icon: "x-circle",   variant: "danger",  label: "Ошибка" },
};

function CourierHome() {
  const router = useRouter();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();

  const { data: deliveries, isLoading, refetch } = useQuery({
    queryKey: ["myDeliveries"],
    queryFn: () => import("../../src/api").then(m => m.listMyDeliveries()),
    retry: false,
  });

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Доброе утро" : hour < 18 ? "Добрый день" : "Добрый вечер";
  const firstName = (user?.name ?? user?.email ?? "Курьер").split(" ")[0];

  const assigned = (deliveries ?? []).filter((d: any) => d.deliveryStatus === "assigned").length;
  const inTransit = (deliveries ?? []).filter((d: any) => d.deliveryStatus === "out_for_delivery").length;
  const delivered = (deliveries ?? []).filter((d: any) => d.deliveryStatus === "delivered").length;
  const total = (deliveries ?? []).length;
  const deliveryPct = total > 0 ? Math.round((delivered / total) * 100) : 0;

  const scrollRefresh = <RefreshControl refreshing={false} onRefresh={refetch} tintColor={colors.brand.primary} />;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg.primary }} contentContainerStyle={{ paddingHorizontal: Spacing.base, paddingTop: insets.top + Spacing.lg, paddingBottom: insets.bottom + 100 }} refreshControl={scrollRefresh} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <FadeInItem delay={0}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: Spacing.lg }}>
          <View style={{ flex: 1 }}>
            <CardDots />
            <Text style={{ fontSize: Typography.size.sm, fontFamily: Typography.fontMedium, color: colors.accent.primary }}>{greeting}, {firstName}</Text>
            <Text style={{ fontSize: Typography.size.xxl, fontFamily: Typography.fontExtraBold, color: colors.text.primary, marginTop: 2 }}>Доставки</Text>
          </View>
        </View>
      </FadeInItem>

      {/* KPI rings — 3 donuts */}
      <FadeInItem delay={80}>
        <View style={{ flexDirection: "row", gap: Spacing.sm, marginBottom: Spacing.base }}>
          {isLoading ? (
            <>
              <ShimmerSkeleton height={120} style={{ flex: 1 }} radius={Radii.xl} />
              <ShimmerSkeleton height={120} style={{ flex: 1 }} radius={Radii.xl} />
              <ShimmerSkeleton height={120} style={{ flex: 1 }} radius={Radii.xl} />
            </>
          ) : (
            <>
              <Card style={{ flex: 1, alignItems: "center", padding: Spacing.sm }}>
                <ProgressRing value={total > 0 ? Math.round(assigned / Math.max(total, 1) * 100) : 0} size={60} strokeWidth={6} color={KpiColors.blue} />
                <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.lg, color: colors.text.primary, marginTop: 6 }}>{assigned}</Text>
                <Text style={{ fontFamily: Typography.fontMedium, fontSize: 8, color: colors.text.tertiary, letterSpacing: 0.5, textTransform: "uppercase" }}>Ожидают</Text>
              </Card>
              <Card style={{ flex: 1, alignItems: "center", padding: Spacing.sm }}>
                <ProgressRing value={total > 0 ? Math.round(inTransit / Math.max(total, 1) * 100) : 0} size={60} strokeWidth={6} color={KpiColors.amber} />
                <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.lg, color: colors.text.primary, marginTop: 6 }}>{inTransit}</Text>
                <Text style={{ fontFamily: Typography.fontMedium, fontSize: 8, color: colors.text.tertiary, letterSpacing: 0.5, textTransform: "uppercase" }}>В пути</Text>
              </Card>
              <Card style={{ flex: 1, alignItems: "center", padding: Spacing.sm }}>
                <ProgressRing value={deliveryPct} size={60} strokeWidth={6} color={KpiColors.green} />
                <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.lg, color: colors.text.primary, marginTop: 6 }}>{delivered}</Text>
                <Text style={{ fontFamily: Typography.fontMedium, fontSize: 8, color: colors.text.tertiary, letterSpacing: 0.5, textTransform: "uppercase" }}>Доставлено</Text>
              </Card>
            </>
          )}
        </View>
      </FadeInItem>

      {/* Progress — NeumorphicProgressBar */}
      <FadeInItem delay={120}>
        <Card style={{ marginBottom: Spacing.base }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <Text style={{ fontFamily: Typography.fontMedium, fontSize: Typography.size.xs, color: colors.text.tertiary, letterSpacing: 1, textTransform: "uppercase" }}>ПРОГРЕСС ДНЯ</Text>
            <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.sm, color: deliveryPct >= 80 ? colors.status.success : colors.accent.primary, fontVariant: ["tabular-nums"] }}>
              {delivered}/{total} · {deliveryPct}%
            </Text>
          </View>
          <NeumorphicProgressBar value={deliveryPct} height={8} color={deliveryPct >= 80 ? colors.status.success : colors.brand.primary} />
          <Text style={{ fontSize: Typography.size.xs, color: colors.text.muted, marginTop: 8 }}>
            {total === 0 ? "Нет заказов на сегодня" : delivered === total ? "Все доставлены!" : `Осталось ${total - delivered}`}
          </Text>
        </Card>
      </FadeInItem>

      {/* Quick actions */}
      <FadeInItem delay={160}>
        <View style={{ flexDirection: "row", gap: Spacing.sm, marginBottom: Spacing.base }}>
          <PressableScale onPress={() => router.push("/(tabs)/deliveries")} haptic="none" style={{ flex: 1 }}>
            <LinearGradient colors={Gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={{ alignItems: "center", justifyContent: "center", paddingVertical: Spacing.lg, borderRadius: Radii.lg, gap: 8 }}>
              <View style={{ width: 36, height: 36, borderRadius: Radii.md, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" }}>
                <Feather name="truck" size={18} color="#fff" />
              </View>
              <Text style={{ fontSize: Typography.size.xs, fontFamily: Typography.fontBold, color: "#fff", letterSpacing: 1 }}>ДОСТАВКИ</Text>
            </LinearGradient>
          </PressableScale>
          <PressableScale onPress={() => router.push("/(tabs)/profile")} haptic="none" style={{ flex: 1 }}>
            <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: Spacing.lg, borderRadius: Radii.lg, gap: 8, backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.default }}>
              <View style={{ width: 36, height: 36, borderRadius: Radii.md, backgroundColor: colors.status.infoDim, alignItems: "center", justifyContent: "center" }}>
                <Feather name="user" size={18} color={colors.status.info} />
              </View>
              <Text style={{ fontSize: Typography.size.xs, fontFamily: Typography.fontBold, color: colors.text.primary, letterSpacing: 1 }}>ПРОФИЛЬ</Text>
            </View>
          </PressableScale>
        </View>
      </FadeInItem>

      {/* Recent deliveries */}
      <FadeInItem delay={200}>
        <SectionHeader title="Последние доставки" />
      </FadeInItem>
      <Card style={{ padding: 0, overflow: "hidden" }}>
        {isLoading ? (
          <View style={{ padding: Spacing.base, gap: 10 }}>
            {[1, 2, 3].map(i => <ShimmerSkeleton key={i} height={56} radius={Radii.lg} />)}
          </View>
        ) : !(deliveries as any[])?.length ? (
          <View style={{ padding: Spacing.xl, alignItems: "center", gap: 8 }}>
            <Feather name="truck" size={28} color={colors.text.muted} />
            <Text style={{ fontSize: Typography.size.sm, color: colors.text.muted }}>Доставок пока нет</Text>
          </View>
        ) : (
          (deliveries as any[]).slice(0, 5).map((d: any, idx: number) => {
            const cfg = COURIER_STATUS[d.deliveryStatus] ?? COURIER_STATUS.assigned;
            return (
              <View key={d.id}>
                <TouchableOpacity activeOpacity={0.7} onPress={() => router.push("/(tabs)/deliveries")}
                  style={{ flexDirection: "row", alignItems: "center", padding: Spacing.base, gap: Spacing.md }}>
                  <View style={{ width: 36, height: 36, borderRadius: Radii.sm, backgroundColor: colors.brand.primaryDim, alignItems: "center", justifyContent: "center" }}>
                    <Feather name="truck" size={16} color={colors.accent.primary} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontSize: Typography.size.base, fontFamily: Typography.fontSemibold, color: colors.text.primary }} numberOfLines={1}>{d.orderNumber}</Text>
                    <Text style={{ fontSize: Typography.size.xs, color: colors.text.muted, marginTop: 2 }}>{d.shopName ?? "—"}</Text>
                  </View>
                  <View style={{ backgroundColor: cfg.variant === "success" ? colors.status.successDim : cfg.variant === "warning" ? colors.status.warningDim : cfg.variant === "danger" ? colors.status.dangerDim : colors.status.infoDim, borderRadius: Radii.full, paddingHorizontal: 8, paddingVertical: 3 }}>
                    <Text style={{ fontSize: 11, fontFamily: Typography.fontSemibold, color: cfg.variant === "success" ? colors.status.success : cfg.variant === "warning" ? colors.status.warning : cfg.variant === "danger" ? colors.status.danger : colors.status.info }}>{cfg.label}</Text>
                  </View>
                </TouchableOpacity>
                {idx < Math.min((deliveries as any[]).length, 5) - 1 && <View style={{ height: 1, backgroundColor: colors.border.subtle, marginLeft: 52 }} />}
              </View>
            );
          })
        )}
      </Card>
    </ScrollView>
  );
}

// ── Role router ───────────────────────────────────────────────────────────────
export default function HomeScreen() {
  const { user, isLoading } = useAuthStore();
  if (isLoading || !user) return null;
  const isSupervisor = user?.role === "supervisor" || user?.role === "ceo" || user?.role === "operator";
  const isCourier = user?.role === "courier";
  if (isCourier) return <CourierHome />;
  return isSupervisor ? <SupervisorHome /> : <AgentHome />;
}
