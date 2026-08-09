// Warehouse Pro — Plan tab: monthly norms + today's visits + KPI
import React, { useState, useCallback } from "react";
import { View, Text, ScrollView, RefreshControl } from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useThemeColors, useThemeStore } from "../../src/store/theme";
import { Typography, Spacing, Radii, Shadows, KpiColors } from "../../src/theme";
import { Card, Badge, EmptyState } from "../../src/components/ui";
import { ProgressRing, NeumorphicProgressBar } from "../../src/components/Charts";
import { FadeInItem, PressableScale, ShimmerSkeleton } from "../../src/components/Animated";
import { getPlans, updatePlanStatus, getMyQuota, getAgentKpi, Plan } from "../../src/api";
import { notify } from "../../src/store/toast";

type IconName = keyof typeof Feather.glyphMap;

// ── Quota Card (monthly norms) ───────────────────────────────────────────────
function QuotaCard({ colors, isDark: _isDark }: { colors: ReturnType<typeof useThemeColors>; isDark: boolean }) {
  const { data: quota, isLoading } = useQuery({
    queryKey: ["myQuota"],
    queryFn: () => getMyQuota().catch(() => null),
    retry: false,
  });

  if (isLoading) return <ShimmerSkeleton height={160} radius={Radii.xxl} />;
  if (!quota) return null;

  const overall = Math.round(quota.revenue.pct * 0.5 + quota.orders.pct * 0.3 + quota.visits.pct * 0.2);
  const progressColor = (pct: number) => pct >= 100 ? colors.status.success : pct >= 70 ? colors.status.warning : colors.status.danger;

  const metrics = [
    { icon: "dollar-sign" as IconName, label: "Выручка", actual: `${(quota.revenue.actual / 1000).toFixed(0)}K`, target: `${(quota.revenue.target / 1000).toFixed(0)}K`, pct: quota.revenue.pct },
    { icon: "shopping-cart" as IconName, label: "Заказы", actual: String(quota.orders.actual), target: String(quota.orders.target), pct: quota.orders.pct },
    { icon: "map-pin" as IconName, label: "Визиты", actual: `${Math.round(quota.visits.actual)}%`, target: `${Math.round(quota.visits.target)}%`, pct: quota.visits.pct },
  ];

  return (
    <Card style={{ marginBottom: Spacing.base }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: Spacing.md }}>
        <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.xs, color: colors.text.tertiary, letterSpacing: 1 }}>ПЛАН МЕСЯЦА</Text>
        <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.sm, color: progressColor(overall) }}>{overall}%</Text>
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", gap: Spacing.lg, marginBottom: Spacing.md }}>
        <ProgressRing value={overall} size={64} strokeWidth={6} color={progressColor(overall)} />
        <View style={{ flex: 1, flexDirection: "row", gap: Spacing.sm }}>
          {metrics.map(m => (
            <View key={m.label} style={{ flex: 1, alignItems: "center" }}>
              <Feather name={m.icon} size={14} color={progressColor(m.pct)} />
              <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.sm, color: colors.text.primary, marginTop: 2 }}>{m.actual}</Text>
              <Text style={{ fontFamily: Typography.fontRegular, fontSize: 9, color: colors.text.muted }}>/{m.target}</Text>
            </View>
          ))}
        </View>
      </View>

      {metrics.map(m => (
        <View key={m.label} style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 }}>
          <Text style={{ fontFamily: Typography.fontMedium, fontSize: 10, color: colors.text.muted, width: 50 }}>{m.label}</Text>
          <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.bg.elevated, overflow: "hidden" }}>
            <View style={{ height: "100%", borderRadius: 3, width: `${Math.min(100, m.pct)}%`, backgroundColor: progressColor(m.pct) }} />
          </View>
          <Text style={{ fontFamily: Typography.fontBold, fontSize: 10, color: progressColor(m.pct), width: 32, textAlign: "right" }}>{m.pct}%</Text>
        </View>
      ))}
    </Card>
  );
}

// ── Visit Card ───────────────────────────────────────────────────────────────
function VisitCard({ plan, colors, isDark, onDone, onSkip, index, isPending }: {
  plan: Plan; colors: ReturnType<typeof useThemeColors>; isDark: boolean;
  onDone: () => void; onSkip: () => void; index: number; isPending: boolean;
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
    <FadeInItem delay={index * 50}>
      <View style={{
        flexDirection: "row", alignItems: "center",
        backgroundColor: colors.bg.card, borderRadius: Radii.lg,
        padding: 12, marginBottom: 8, borderWidth: 1,
        borderColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.5)",
        shadowColor, shadowOffset: Shadows.xs.shadowOffset, shadowOpacity: Shadows.xs.shadowOpacity,
        shadowRadius: Shadows.xs.shadowRadius, elevation: Shadows.xs.elevation,
        opacity: plan.status === "visited" ? 0.6 : 1,
      }}>
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: cfg.bg, alignItems: "center", justifyContent: "center" }}>
          <Feather name={cfg.icon} size={16} color={cfg.color} />
        </View>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={{ fontFamily: Typography.fontSemibold, fontSize: Typography.size.base, color: colors.text.primary }} numberOfLines={1}>
            {plan.shopName ?? "Магазин"}
          </Text>
          <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.xs, color: colors.text.tertiary, marginTop: 1 }} numberOfLines={1}>
            {plan.shopAddress ?? "Адрес не указан"}
          </Text>
          {hasDebt && (
            <Text style={{ fontFamily: Typography.fontMedium, fontSize: 11, color: colors.status.danger, marginTop: 2 }}>
              Долг: {Number(plan.shopDebt).toLocaleString("ru")} сум
            </Text>
          )}
        </View>
        {plan.status === "planned" ? (
          <View style={{ flexDirection: "row", gap: 6 }}>
            <PressableScale disabled={isPending} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onSkip(); }} haptic="none" scaleTo={0.9}>
              <View style={{ backgroundColor: colors.bg.elevated, borderRadius: Radii.sm, paddingVertical: 6, paddingHorizontal: 10 }}>
                <Feather name="clock" size={14} color={colors.status.warning} />
              </View>
            </PressableScale>
            <PressableScale disabled={isPending} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onDone(); }} haptic="none" scaleTo={0.9}>
              <View style={{ backgroundColor: colors.status.success, borderRadius: Radii.sm, paddingVertical: 6, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Feather name="check" size={14} color="#fff" />
                <Text style={{ fontFamily: Typography.fontSemibold, fontSize: 11, color: "#fff" }}>Готово</Text>
              </View>
            </PressableScale>
          </View>
        ) : (
          <Badge variant={plan.status === "visited" ? "success" : "warning"} style={{ marginLeft: 8 }}>
            {cfg.label}
          </Badge>
        )}
      </View>
    </FadeInItem>
  );
}

// ── KPI Summary Card ─────────────────────────────────────────────────────────
function KpiSummaryCard({ colors }: { colors: ReturnType<typeof useThemeColors> }) {
  const { data: kpi, isLoading } = useQuery({
    queryKey: ["agentKpi", "month"],
    queryFn: () => getAgentKpi("month").catch(() => null),
    retry: false,
  });

  if (isLoading) return <ShimmerSkeleton height={120} radius={Radii.xxl} />;
  if (!kpi) return null;

  const GRADE_COLORS: Record<string, string> = { A: colors.status.success, B: colors.status.info, C: colors.status.warning, D: colors.status.danger, F: colors.status.danger };
  const gradeColor = GRADE_COLORS[kpi.grade] ?? colors.text.muted;

  return (
    <Card style={{ marginBottom: Spacing.base }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: Spacing.md }}>
        <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.xs, color: colors.text.tertiary, letterSpacing: 1 }}>ПОКАЗАТЕЛИ</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <View style={{ width: 28, height: 28, borderRadius: Radii.sm, backgroundColor: gradeColor + "20", alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontFamily: Typography.fontExtraBold, fontSize: 14, color: gradeColor }}>{kpi.grade}</Text>
          </View>
          <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.sm, color: colors.text.primary }}>{kpi.kpiScore}/100</Text>
        </View>
      </View>

      {/* Score breakdown bars */}
      {[
        { label: "Визиты", pct: kpi.visitCompletionRate, weight: "30%", color: KpiColors.teal },
        { label: "Выручка", pct: Math.min(100, kpi.revenue / 10_000_000 * 100), weight: "25%", color: KpiColors.blue },
        { label: "Конверсия", pct: kpi.orderCount > 0 && kpi.totalPlans > 0 ? Math.min(100, (kpi.orderCount / kpi.totalPlans) * 100) : 0, weight: "20%", color: KpiColors.amber },
        { label: "Без возвратов", pct: Math.max(0, 100 - kpi.returnRate), weight: "15%", color: KpiColors.green },
        { label: "Долги", pct: kpi.debtCollectionRate, weight: "10%", color: KpiColors.coral },
      ].map(item => (
        <View key={item.label} style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 }}>
          <Text style={{ fontFamily: Typography.fontMedium, fontSize: 10, color: colors.text.muted, width: 80 }}>{item.label} ({item.weight})</Text>
          <View style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: colors.bg.elevated, overflow: "hidden" }}>
            <View style={{ height: "100%", borderRadius: 3, width: `${Math.min(100, item.pct)}%`, backgroundColor: item.color }} />
          </View>
          <Text style={{ fontFamily: Typography.fontBold, fontSize: 10, color: item.color, width: 28, textAlign: "right" }}>{Math.round(item.pct)}</Text>
        </View>
      ))}

      {/* Salary */}
      {kpi.salary && (
        <View style={{ marginTop: Spacing.md, paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: colors.border.subtle }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ fontFamily: Typography.fontMedium, fontSize: Typography.size.sm, color: colors.text.secondary }}>Зарплата</Text>
            <Text style={{ fontFamily: Typography.fontExtraBold, fontSize: Typography.size.lg, color: colors.text.primary }}>
              {Number(kpi.salary.total).toLocaleString("ru")} сум
            </Text>
          </View>
        </View>
      )}
    </Card>
  );
}

// ── Main Plan Screen ─────────────────────────────────────────────────────────
export default function PlanScreen() {
  const colors = useThemeColors();
  const { isDark } = useThemeStore();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const { data: plans, isLoading: plansLoading, isError: plansError, refetch: refetchPlans } = useQuery({
    queryKey: ["plans"],
    queryFn: async () => { const r = await getPlans(); return Array.isArray(r) ? r : []; },
    retry: false,
  });

  const updateMutation = useMutation({
    mutationFn: ({ planId, status }: { planId: number; status: Plan["status"] }) => updatePlanStatus(planId, status),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["plans"] }); qc.invalidateQueries({ queryKey: ["myQuota"] }); },
    // Без этой ветки отметка визита пропадала молча: агент жал «Посещён»,
    // ничего не происходило — ни галочки, ни сообщения, — он жал ещё раз и
    // бросал. Вечером в отчёте оказывалось три визита из четырнадцати, а
    // посещаемость весит 30% в его KPI. Восстановить это потом нечем.
    onError: (e: Error) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      notify.error(`Отметка не сохранена: ${e.message}. Повторите, когда появится связь.`);
    },
  });

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await Promise.all([refetchPlans(), qc.invalidateQueries({ queryKey: ["myQuota"] }), qc.invalidateQueries({ queryKey: ["agentKpi"] })]); }
    finally { setRefreshing(false); }
  }, [refetchPlans, qc]);

  const visited = plans?.filter(p => p.status === "visited").length ?? 0;
  const total = plans?.length ?? 0;
  const pct = total > 0 ? Math.round((visited / total) * 100) : 0;
  const debtShops = plans?.filter(p => Number(p.shopDebt ?? 0) > 0) ?? [];
  const totalDebt = debtShops.reduce((s, p) => s + Number(p.shopDebt ?? 0), 0);

  const now = new Date();
  const monthName = now.toLocaleDateString("ru", { month: "long", year: "numeric" });

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      {/* Header */}
      <View style={{ paddingTop: insets.top + Spacing.sm, paddingHorizontal: Spacing.base, paddingBottom: Spacing.md, backgroundColor: colors.bg.secondary, borderBottomWidth: 1, borderBottomColor: colors.border.default }}>
        <Text style={{ fontFamily: Typography.fontExtraBold, fontSize: 22, color: colors.text.primary }}>План</Text>
        <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.sm, color: colors.text.secondary, marginTop: 2, textTransform: "capitalize" }}>{monthName}</Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: Spacing.base, paddingTop: Spacing.md, paddingBottom: insets.bottom + 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.brand.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Monthly norms */}
        <FadeInItem delay={0}>
          <QuotaCard colors={colors} isDark={isDark} />
        </FadeInItem>

        {/* Today's visits */}
        <FadeInItem delay={80}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: Spacing.sm }}>
            <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.xs, color: colors.text.tertiary, letterSpacing: 1 }}>ВИЗИТЫ НА СЕГОДНЯ</Text>
            <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.sm, color: pct >= 80 ? colors.status.success : colors.brand.primary }}>
              {visited}/{total} · {pct}%
            </Text>
          </View>
          <NeumorphicProgressBar value={pct} height={6} color={pct >= 80 ? colors.status.success : colors.brand.primary} />
        </FadeInItem>

        <View style={{ marginTop: Spacing.md }}>
          {plansLoading ? (
            <View style={{ gap: 8 }}>
              {[1, 2, 3].map(i => <ShimmerSkeleton key={i} height={64} radius={Radii.lg} />)}
            </View>
          ) : plansError ? (
            // «Не удалось загрузить» и «визитов нет» — разные вещи. Раньше
            // ветки ошибки не было, и агент, открывший приложение вне зоны
            // покрытия, видел «0/0 · 0%» и считал, что на сегодня ничего не
            // назначено.
            <EmptyState
              icon="alert-circle"
              title="Не удалось загрузить план"
              description="Это сбой связи, а не пустой день. Потяните вниз, чтобы повторить."
            />
          ) : !plans?.length ? (
            <EmptyState icon="calendar" title="На сегодня визитов нет" description="Планы визитов появятся здесь" />
          ) : (
            plans.map((plan, idx) => (
              <VisitCard
                key={plan.id}
                plan={plan}
                colors={colors}
                isDark={isDark}
                index={idx}
                onDone={() => updateMutation.mutate({ planId: plan.id, status: "visited" })}
                onSkip={() => updateMutation.mutate({ planId: plan.id, status: "skipped" })}
                isPending={updateMutation.isPending}
              />
            ))
          )}
        </View>

        {/* Debts section */}
        <FadeInItem delay={160}>
          <Card style={{ marginTop: Spacing.base, marginBottom: Spacing.base }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: Spacing.md }}>
              <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.xs, color: colors.text.tertiary, letterSpacing: 1 }}>ДОЛГИ</Text>
              {debtShops.length > 0 ? (
                <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.sm, color: colors.status.danger }}>
                  {debtShops.length} маг. · {totalDebt.toLocaleString("ru")} сум
                </Text>
              ) : (
                <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.sm, color: colors.status.success }}>Нет долгов</Text>
              )}
            </View>
            {debtShops.length > 0 ? debtShops.slice(0, 5).map(p => (
              <View key={p.id} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border.subtle }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: Typography.fontSemibold, fontSize: Typography.size.sm, color: colors.text.primary }} numberOfLines={1}>{p.shopName ?? "Магазин"}</Text>
                </View>
                <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.sm, color: colors.status.danger }}>
                  {Number(p.shopDebt).toLocaleString("ru")} сум
                </Text>
              </View>
            )) : (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 }}>
                <Feather name="check-circle" size={16} color={colors.status.success} />
                <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.sm, color: colors.text.muted }}>Все магазины без задолженности</Text>
              </View>
            )}
          </Card>
        </FadeInItem>

        {/* KPI Summary */}
        <FadeInItem delay={200}>
          <KpiSummaryCard colors={colors} />
        </FadeInItem>
      </ScrollView>
    </View>
  );
}
