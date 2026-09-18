// Warehouse Pro — Plan tab: monthly norms + today's visits + KPI
import React, { useState, useCallback, useRef } from "react";
import { useRefreshOnFocus } from "../../src/hooks/useRefreshOnFocus";
import { useScrollTopOnFocus } from "../../src/hooks/useScrollTopOnFocus";
import { View, Text, ScrollView, RefreshControl } from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useThemeColors, useThemeStore } from "../../src/store/theme";
import { Typography, Spacing, Radii, KpiColors, BOTTOM_TAB_HEIGHT, soft } from "../../src/theme";
import { Card, Badge, EmptyState } from "../../src/components/ui";
// Высота плавающей панели вкладок — одна на приложение. Здесь стояло голое
// 100 (80 панели + отбивка), и такие же числа расползлись по другим экранам.
import { ProgressRing, NeumorphicProgressBar } from "../../src/components/Charts";
import { FadeInItem, PressableScale, ShimmerSkeleton } from "../../src/components/Animated";
import { getPlans, updatePlanStatus, getMyQuota, getAgentKpi, getMySalary, Plan } from "../../src/api";
import { useRouter } from "expo-router";
import { notify } from "../../src/store/toast";
import { useAuthStore } from "../../src/store/auth";
import { useVisitQueue } from "../../src/store/visit-queue";
import { useQueuedPlans } from "../../src/lib/plan-queue";
import { QueueNote } from "../../src/components/plans/QueueNote";
import { isRetryableError } from "../../src/store/offline";
import { sendVisitPing } from "../../src/lib/visit-ping";
import { formatMoney } from "../../src/store/branding";
import { useT, useLang } from "../../src/i18n";
import { GpsOffHint } from "../../src/components/plans/GpsOffHint";

type IconName = keyof typeof Feather.glyphMap;

// ── Quota Card (monthly norms) ───────────────────────────────────────────────
function QuotaCard({ colors }: { colors: ReturnType<typeof useThemeColors> }) {
  const t = useT();
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
    { icon: "dollar-sign" as IconName, label: t("Выручка", "Tushum"), actual: `${(quota.revenue.actual / 1000).toFixed(0)}K`, target: `${(quota.revenue.target / 1000).toFixed(0)}K`, pct: quota.revenue.pct },
    { icon: "shopping-cart" as IconName, label: t("Заказы", "Buyurtmalar"), actual: String(quota.orders.actual), target: String(quota.orders.target), pct: quota.orders.pct },
    { icon: "map-pin" as IconName, label: t("Визиты", "Tashriflar"), actual: `${Math.round(quota.visits.actual)}%`, target: `${Math.round(quota.visits.target)}%`, pct: quota.visits.pct },
  ];

  return (
    <Card style={{ marginBottom: Spacing.base }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: Spacing.md }}>
        <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.xs, color: colors.text.tertiary, letterSpacing: 1 }}>{t("ПЛАН МЕСЯЦА", "OYLIK REJA")}</Text>
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
  const t = useT();
  const STATUS_META: Record<string, { icon: IconName; color: string; bg: string; label: string }> = {
    visited: { icon: "check-circle", color: colors.status.success, bg: colors.status.successDim, label: t("Посещён", "Tashrif qilindi") },
    skipped: { icon: "clock", color: colors.status.warning, bg: colors.status.warningDim, label: t("Пропущен", "O'tkazildi") },
    planned: { icon: "circle", color: colors.status.info, bg: colors.status.infoDim, label: t("Запланирован", "Rejalangan") },
  };
  // То же правило: незнакомое состояние показывается кодом, а не «Запланирован».
  const cfg = STATUS_META[plan.status] ?? { ...STATUS_META.planned, label: plan.status };
  const hasDebt = Number(plan.shopDebt ?? 0) > 0;

  return (
    <FadeInItem delay={index * 50}>
      <View style={{
        flexDirection: "row", alignItems: "center",
        backgroundColor: colors.bg.card, borderRadius: Radii.lg,
        padding: 12, marginBottom: 8,
        // Пара теней вместо волосяной обводки и одиночной тени: строка плана
        // выступает из холста так же, как карточка списка.
        ...soft(isDark).raised,
        opacity: plan.status === "visited" ? 0.6 : 1,
      }}>
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: cfg.bg, alignItems: "center", justifyContent: "center" }}>
          <Feather name={cfg.icon} size={16} color={cfg.color} />
        </View>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={{ fontFamily: Typography.fontSemibold, fontSize: Typography.size.base, color: colors.text.primary }} numberOfLines={1}>
            {plan.shopName ?? t("Магазин", "Do'kon")}
          </Text>
          <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.xs, color: colors.text.tertiary, marginTop: 1 }} numberOfLines={1}>
            {plan.shopAddress ?? t("Адрес не указан", "Manzil ko'rsatilmagan")}
          </Text>
          {hasDebt && (
            <Text style={{ fontFamily: Typography.fontMedium, fontSize: 11, color: colors.status.danger, marginTop: 2 }}>
              {t("Долг", "Qarz")}: {formatMoney(plan.shopDebt)}
            </Text>
          )}
        </View>
        {plan.status === "planned" ? (
          <View style={{ flexDirection: "row", gap: 6 }}>
            <PressableScale disabled={isPending} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onSkip(); }} haptic="none" scaleTo={0.9}>
              {/*
                Рядом с «Готово» стояла кнопка из одной иконки-часов.

                Что она делает, приходилось угадывать: часы одинаково читаются
                и как «отложить», и как «история», и как «время визита». Обе
                кнопки меняют состояние визита, и обе обязаны говорить, что
                именно они меняют.
              */}
              <View style={{ backgroundColor: colors.bg.elevated, borderRadius: Radii.sm, paddingVertical: 6, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Feather name="clock" size={14} color={colors.status.warning} />
                <Text style={{ fontFamily: Typography.fontSemibold, fontSize: 11, color: colors.status.warning }}>{t("Отложить", "Keyinga")}</Text>
              </View>
            </PressableScale>
            <PressableScale disabled={isPending} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onDone(); }} haptic="none" scaleTo={0.9}>
              <View style={{ backgroundColor: colors.status.success, borderRadius: Radii.sm, paddingVertical: 6, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Feather name="check" size={14} color="#fff" />
                <Text style={{ fontFamily: Typography.fontSemibold, fontSize: 11, color: "#fff" }}>{t("Готово", "Tayyor")}</Text>
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
  const t = useT();
  const { data: kpi, isLoading } = useQuery({
    queryKey: ["agentKpi", "month"],
    queryFn: () => getAgentKpi("month").catch(() => null),
    retry: false,
  });

  /*
    Зарплата — отдельным запросом, потому что она и живёт отдельно: агентский
    KPI её не считает и никогда не содержал.

    Отказ гасится в null: у кого зарплата не настроена, строки просто не
    будет — показывать ему ошибку на экране плана незачем.
  */
  const { data: salary } = useQuery({
    queryKey: ["mySalary", "month"],
    queryFn: () => getMySalary("month").then((res) => res.totalSalary).catch(() => null),
    retry: false,
  });

  const router = useRouter();

  if (isLoading) return <ShimmerSkeleton height={120} radius={Radii.xxl} />;
  if (!kpi) return null;

  const GRADE_COLORS: Record<string, string> = { A: colors.status.success, B: colors.status.info, C: colors.status.warning, D: colors.status.danger, F: colors.status.danger };
  const gradeColor = GRADE_COLORS[kpi.kpiGrade] ?? colors.text.muted;

  return (
    <Card style={{ marginBottom: Spacing.base }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: Spacing.md }}>
        <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.xs, color: colors.text.tertiary, letterSpacing: 1 }}>{t("ПОКАЗАТЕЛИ", "KO'RSATKICHLAR")}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <View style={{ width: 28, height: 28, borderRadius: Radii.sm, backgroundColor: gradeColor + "20", alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontFamily: Typography.fontExtraBold, fontSize: 14, color: gradeColor }}>{kpi.kpiGrade}</Text>
          </View>
          <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.sm, color: colors.text.primary }}>{kpi.kpiScore}/100</Text>
        </View>
      </View>

      {/* Score breakdown bars */}
      {[
        { label: t("Визиты", "Tashriflar"), pct: kpi.visitCompletionRate, weight: "30%", color: KpiColors.teal },
        { label: t("Выручка", "Tushum"), pct: Math.min(100, kpi.revenue / 10_000_000 * 100), weight: "25%", color: KpiColors.blue },
        { label: t("Конверсия", "Konversiya"), pct: kpi.orderCount > 0 && kpi.totalPlans > 0 ? Math.min(100, (kpi.orderCount / kpi.totalPlans) * 100) : 0, weight: "20%", color: KpiColors.amber },
        { label: t("Без возвратов", "Qaytarishsiz"), pct: Math.max(0, 100 - kpi.returnRate), weight: "15%", color: KpiColors.green },
        { label: t("Долги", "Qarz"), pct: kpi.debtCollectionRate, weight: "10%", color: KpiColors.coral },
      ].map(item => (
        <View key={item.label} style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 }}>
          <Text style={{ fontFamily: Typography.fontMedium, fontSize: 10, color: colors.text.muted, width: 80 }}>{item.label} ({item.weight})</Text>
          <View style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: colors.bg.elevated, overflow: "hidden" }}>
            <View style={{ height: "100%", borderRadius: 3, width: `${Math.min(100, item.pct)}%`, backgroundColor: item.color }} />
          </View>
          <Text style={{ fontFamily: Typography.fontBold, fontSize: 10, color: item.color, width: 28, textAlign: "right" }}>{Math.round(item.pct)}</Text>
        </View>
      ))}

      {/*
        Зарплата.

        Здесь стояло `{kpi.salary && …}`, и оно не рисовалось НИКОГДА:
        kpi.agentKpi поля salary не возвращает и не возвращал — блок ждал
        числа, которого в ответе нет. Со стороны это выглядело как «зарплату
        на телефоне не показывают».

        Теперь число берётся у своей ручки (kpi.salary) и ведёт на разбор:
        одной суммой человек её не проверит, а спорить о зарплате приходят с
        разложением.
      */}
      {salary != null && (
        <PressableScale onPress={() => router.push("/salary")} haptic="light">
          <View style={{ marginTop: Spacing.md, paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: colors.border.subtle }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ fontFamily: Typography.fontMedium, fontSize: Typography.size.sm, color: colors.text.secondary }}>{t("Зарплата", "Oylik")}</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={{ fontFamily: Typography.fontExtraBold, fontSize: Typography.size.lg, color: colors.text.primary }}>
                  {formatMoney(salary)}
                </Text>
                <Feather name="chevron-right" size={16} color={colors.text.tertiary} />
              </View>
            </View>
          </View>
        </PressableScale>
      )}
    </Card>
  );
}

// ── Main Plan Screen ─────────────────────────────────────────────────────────
export default function PlanScreen() {
  // Вкладку не размонтируют при переключении, поэтому запрос уходит один раз
  // за запуск. Здесь данные этого экрана помечаются устаревшими при возврате
  // на него — подробности в самом хуке.
  useRefreshOnFocus([["plans"], ["myQuota"], ["agentKpi"]]);
  const scrollRef = useRef<ScrollView>(null);
  useScrollTopOnFocus(scrollRef);
  const colors = useThemeColors();
  const { isDark } = useThemeStore();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const t = useT();
  const lang = useLang();

  const { data: serverPlans, isLoading: plansLoading, isError: plansError, refetch: refetchPlans } = useQuery({
    queryKey: ["plans"],
    queryFn: async () => { const r = await getPlans(); return Array.isArray(r) ? r : []; },
    retry: false,
  });
  // Очередь визитов наложена на список: отмеченный без связи — отмечен.
  const { plans, queued } = useQueuedPlans(serverPlans);

  const router = useRouter();
  const { user } = useAuthStore();
  const isMerchandiser = user?.role === "merchandiser";
  const queueVisit = useVisitQueue();

  /*
    Без ветки onError отметка визита пропадала молча: агент жал «Посещён»,
    ничего не происходило — ни галочки, ни сообщения, — он жал ещё раз и
    бросал. Вечером в отчёте оказывалось три визита из четырнадцати, а
    посещаемость весит 30% в его KPI. Восстановить это потом нечем.

    Нет связи — отметка в очередь, а не «повторите позже»: половина визитов
    делается в подсобках без сети, и просить агента помнить о повторе —
    значит терять их. Очередь (store/visit-queue) была написана для этого
    экрана, но подключена только к AgentPlansView.
  */
  const updateMutation = useMutation({
    mutationFn: ({ planId, status }: { planId: number; status: Plan["status"] }) => updatePlanStatus(planId, status),
    onSuccess: (_d, variables) => {
      qc.invalidateQueries({ queryKey: ["plans"] });
      qc.invalidateQueries({ queryKey: ["myQuota"] });
      // Точка на карте начальника — следом за отметкой, как в AgentPlansView.
      if (variables.status === "visited") void sendVisitPing();
    },
    onError: async (e: Error, variables) => {
      if (!isRetryableError(e)) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        notify.error(t(`Отметка не сохранена: ${e.message}`, `Belgi saqlanmadi: ${e.message}`));
        return;
      }
      const ok = await queueVisit.add({ planId: variables.planId, status: variables.status });
      if (ok) notify.info(t("Нет связи — отметка сохранена и уйдёт сама", "Aloqa yo'q — belgi saqlandi, o'zi yuboriladi"));
      else notify.error(t(`Отметка не сохранена: ${e.message}. Повторите, когда появится связь.`, `Belgi saqlanmadi: ${e.message}. Aloqa paydo bo'lganda qayta urining.`));
    },
  });

  /*
    «Готово» у мерчандайзера — это отчёт: фото полки, чек-лист, заметки.
    Кнопка ставила visited без ничего, и единственный переход на экран отчёта
    лежал в AgentPlansView — на вкладке, которой у мерчандайзера нет. В бою
    роль не производила ни одного отчёта, а KPI считал визиты сделанными.
  */
  const handleDone = (plan: Plan) => {
    if (isMerchandiser) {
      router.push({
        pathname: "/merchandiser/visit",
        params: { planId: String(plan.id), shopId: String(plan.shopId ?? ""), shopName: plan.shopName ?? t("Магазин", "Do'kon") },
      });
      return;
    }
    updateMutation.mutate({ planId: plan.id, status: "visited" });
  };

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
  const monthName = now.toLocaleDateString(lang === "uz" ? "uz-Latn-UZ" : "ru", { month: "long", year: "numeric" });

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      {/* Header */}
      <View style={{ paddingTop: insets.top + Spacing.sm, paddingHorizontal: Spacing.base, paddingBottom: Spacing.md, backgroundColor: colors.bg.secondary, borderBottomWidth: 1, borderBottomColor: colors.border.default }}>
        <Text style={{ fontFamily: Typography.fontExtraBold, fontSize: 22, color: colors.text.primary }}>{t("План", "Reja")}</Text>
        <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.sm, color: colors.text.secondary, marginTop: 2, textTransform: "capitalize" }}>{monthName}</Text>
      </View>

      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: Spacing.base, paddingTop: Spacing.md, paddingBottom: insets.bottom + BOTTOM_TAB_HEIGHT + Spacing.xl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.brand.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Monthly norms */}
        <FadeInItem delay={0}>
          <QuotaCard colors={colors} />
        </FadeInItem>

        {/* Today's visits */}
        <FadeInItem delay={80}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: Spacing.sm }}>
            <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.xs, color: colors.text.tertiary, letterSpacing: 1 }}>{t("ВИЗИТЫ НА СЕГОДНЯ", "BUGUNGI TASHRIFLAR")}</Text>
            <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.sm, color: pct >= 80 ? colors.status.success : colors.brand.primary }}>
              {visited}/{total} · {pct}%
            </Text>
          </View>
          <NeumorphicProgressBar value={pct} height={6} color={pct >= 80 ? colors.status.success : colors.brand.primary} />
        </FadeInItem>

        <View style={{ marginTop: Spacing.md }}>
          <GpsOffHint colors={colors} />
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
              title={t("Не удалось загрузить план", "Rejani yuklab bo'lmadi")}
              description={t("Это сбой связи, а не пустой день. Потяните вниз, чтобы повторить.", "Bu aloqa xatosi, bo'sh kun emas. Qayta urinish uchun pastga torting.")}
            />
          ) : !plans?.length ? (
            <EmptyState icon="calendar" title={t("На сегодня визитов нет", "Bugun tashrif yo'q")} description={t("Планы визитов появятся здесь", "Tashrif rejalari shu yerda chiqadi")} />
          ) : (
            plans.map((plan, idx) => (
              <View key={plan.id}>
              <VisitCard
                plan={plan}
                colors={colors}
                isDark={isDark}
                index={idx}
                onDone={() => handleDone(plan)}
                onSkip={() => updateMutation.mutate({ planId: plan.id, status: "skipped" })}
                // Пендинг — по строке, а не по всему экрану. isPending у
                // мутации один на список, и отметка одного визита гасила
                // «Готово» и «Отложить» во ВСЕХ карточках: на медленной связи
                // список замирал целиком, и агент ждал вместо того, чтобы
                // отмечать следующий магазин. Сравниваем с planId строки —
                // приём уже применён в app/(tabs)/deliveries.tsx.
                isPending={updateMutation.isPending && updateMutation.variables?.planId === plan.id}
              />
              {queued.has(plan.id) && <QueueNote action={queued.get(plan.id)!} colors={colors} />}
              </View>
            ))
          )}
        </View>

        {/* Debts section */}
        <FadeInItem delay={160}>
          <Card style={{ marginTop: Spacing.base, marginBottom: Spacing.base }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: Spacing.md }}>
              <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.xs, color: colors.text.tertiary, letterSpacing: 1 }}>{t("ДОЛГИ", "QARZLAR")}</Text>
              {debtShops.length > 0 ? (
                <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.sm, color: colors.status.danger }}>
                  {t(`${debtShops.length} маг.`, `${debtShops.length} ta do'kon`)} · {formatMoney(totalDebt)}
                </Text>
              ) : (
                <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.sm, color: colors.status.success }}>{t("Нет долгов", "Qarz yo'q")}</Text>
              )}
            </View>
            {debtShops.length > 0 ? debtShops.slice(0, 5).map(p => (
              <View key={p.id} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border.subtle }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: Typography.fontSemibold, fontSize: Typography.size.sm, color: colors.text.primary }} numberOfLines={1}>{p.shopName ?? t("Магазин", "Do'kon")}</Text>
                </View>
                <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.sm, color: colors.status.danger }}>
                  {formatMoney(p.shopDebt)}
                </Text>
              </View>
            )) : (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 }}>
                <Feather name="check-circle" size={16} color={colors.status.success} />
                <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.sm, color: colors.text.muted }}>{t("Все магазины без задолженности", "Hech bir do'konda qarz yo'q")}</Text>
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
