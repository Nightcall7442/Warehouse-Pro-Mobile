// Warehouse Pro — Targets dashboard (READ-ONLY view of all metrics)
import { useState, useMemo, useRef } from "react";
import { useRefreshOnFocus } from "../../src/hooks/useRefreshOnFocus";
import { useScrollTopOnFocus } from "../../src/hooks/useScrollTopOnFocus";
import { useScrollTopOnChange } from "../../src/hooks/useScrollTopOnChange";
import { View, Text, FlatList, SectionList, RefreshControl } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { getSalesTargetSummary, getPlans, getAgentsList, Plan } from "../../src/api";
import { useThemeColors, useThemeStore } from "../../src/store/theme";
import { Typography, Spacing, Radii, soft } from "../../src/theme";
import { Card, EmptyState } from "../../src/components/ui";
import { ErrorState } from "../../src/components/QueryState";
import { ProgressRing, NeumorphicProgressBar } from "../../src/components/Charts";
import { FadeInItem, PressableScale, ShimmerSkeleton } from "../../src/components/Animated";
import { PlanRow } from "../../src/components/plans/PlanRow";
import { DateNav } from "../../src/components/plans/DateNav";
import { fmtDate } from "../../src/components/plans/PlanHelpers";
import { formatMoney, useBrandingStore } from "../../src/store/branding";
import { money } from "../../src/lib/monthly-plan";
import { useT, useLang } from "../../src/i18n";

type Section = "targets" | "visits";

export default function TargetsScreen() {
  // Вкладку не размонтируют при переключении, поэтому запрос уходит один раз
  // за запуск. Здесь данные этого экрана помечаются устаревшими при возврате
  // на него — подробности в самом хуке.
  useRefreshOnFocus([["salesTargetSummary"], ["agentsList"]]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colors = useThemeColors();
  const { isDark } = useThemeStore();
  // Шапка ровная, цвета bg.secondary (как ScreenHeader и веб) — чернила обычные.
  // Раньше она была залита цветом арендатора с белыми надписями, и у организации
  // со светлым фирменным цветом заголовок «Показатели» пропадал целиком.
  const headerInk = colors.text.primary;
  const headerInkSoft = colors.text.secondary;
  const [section, setSection] = useState<Section>("targets");
  const [date, setDate] = useState(new Date());
  const [filterAgentId, setFilterAgentId] = useState<number | null>(null);
  // Один ref на списки разделов — смонтирован всегда один. SectionList
  // прокрутки к началу не отдаёт, к нему ref не привязан.
  const listRef = useRef<FlatList>(null);
  useScrollTopOnFocus(listRef);
  useScrollTopOnChange(listRef, [section, date, filterAgentId]);
  const t = useT();
  const lang = useLang();

  const dateStr = fmtDate(date);
  const isToday = dateStr === fmtDate(new Date());
  const currentMonth = new Date().toLocaleDateString(lang === "uz" ? "uz-Latn-UZ" : "ru-RU", { month: "long", year: "numeric" });

  // Targets data
  const {
    data: summary, isLoading: summaryLoading, isError: summaryError, error: summaryErr,
    isFetching: summaryFetching, refetch: refetchSummary,
  } = useQuery({
    queryKey: ["salesTargetSummary"], queryFn: getSalesTargetSummary, enabled: section === "targets",
  });

  // Visit plans data
  const { data: agents } = useQuery({ queryKey: ["agentsList"], queryFn: getAgentsList });
  const selectedAgent = agents?.find(a => a.id === filterAgentId);

  const {
    data: plans, isLoading: plansLoading, isError: plansError, error: plansErr,
    isFetching: plansFetching, refetch: refetchPlans,
  } = useQuery({
    queryKey: ["supervisorPlans", dateStr, filterAgentId],
    queryFn: () => getPlans(filterAgentId ?? undefined, dateStr),
    enabled: section === "visits",
  });

  const visited = (plans ?? []).filter(p => p.status === "visited").length;
  const total = plans?.length ?? 0;
  const pct = total > 0 ? Math.round((visited / total) * 100) : 0;

  const groupedPlans = useMemo(() => {
    if (filterAgentId || !plans || plans.length === 0) return null;
    const groups: Record<string, Plan[]> = {};
    for (const plan of plans) {
      const key = plan.agentName ?? t(`Агент #${plan.agentId}`, `Agent #${plan.agentId}`);
      if (!groups[key]) groups[key] = [];
      groups[key].push(plan);
    }
    return Object.entries(groups).map(([agentName, items]) => ({ title: agentName, data: items }));
  }, [plans, filterAgentId, t]);

  // Summary stats
  const totalTarget = (summary ?? []).reduce((s, a) => s + Number(a.targetAmount), 0);
  const totalActual = (summary ?? []).reduce((s, a) => s + Number(a.actualAmount), 0);
  const avgCompletion = summary && summary.length > 0 ? Math.round(summary.reduce((s, a) => s + a.revenueCompletion, 0) / summary.length) : 0;
  /*
    Итоги в карточку на треть ширины — сжатым числом («41,4 млн сум»), как в
    MonthlyPlanCard. Полные «41 400 000 сум» туда не влезали: на телефоне
    шрифт ужимался до мелкого, в вебе строка обрезалась «41 400 00…».
    Чтобы и «41,4 млн сум» влезло целиком, у карточек боковые поля 8, шрифт 14:
    знак валюты подписью под число уносить нельзя (см. ниже, про доллар).
  */
  const { currencySymbol, symbolPosition } = useBrandingStore(s => s.branding);
  const withCurrency = (v: string) => (symbolPosition === "before" ? `${currencySymbol} ${v}` : `${v} ${currencySymbol}`);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      {/* Header */}
      <View style={{ paddingTop: insets.top + 16, paddingBottom: 16, paddingHorizontal: Spacing.base, backgroundColor: colors.bg.secondary, ...soft(isDark).raisedSm }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <PressableScale onPress={() => router.back()} haptic="light">
              <View accessibilityRole="button" accessibilityLabel={t("Назад", "Orqaga")} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.bg.card, ...soft(isDark).raisedSm, alignItems: "center", justifyContent: "center" }}>
                <Feather name="arrow-left" size={18} color={headerInk} />
              </View>
            </PressableScale>
            <View>
            <Text style={{ fontFamily: Typography.fontBold, fontSize: 22, color: headerInk }}>{t("Показатели", "Ko'rsatkichlar")}</Text>
            <Text style={{ fontFamily: Typography.fontRegular, fontSize: 13, color: headerInkSoft, marginTop: 4 }}>{currentMonth}</Text>
            </View>
          </View>
        </View>

        {/* Section switcher */}
        <View style={{ flexDirection: "row", backgroundColor: colors.bg.card, borderRadius: 12, padding: 3, ...soft(isDark).inset }}>
          <PressableScale onPress={() => setSection("targets")} haptic="light" style={{ flex: 1 }}>
            <View style={{ paddingVertical: 10, borderRadius: 10, backgroundColor: section === "targets" ? colors.bg.elevated : "transparent", alignItems: "center" }}>
              <Text style={{ fontFamily: section === "targets" ? Typography.fontBold : Typography.fontMedium, fontSize: 13, color: headerInk }}>{t("Нормы", "Normalar")}</Text>
            </View>
          </PressableScale>
          <PressableScale onPress={() => setSection("visits")} haptic="light" style={{ flex: 1 }}>
            <View style={{ paddingVertical: 10, borderRadius: 10, backgroundColor: section === "visits" ? colors.bg.elevated : "transparent", alignItems: "center" }}>
              <Text style={{ fontFamily: section === "visits" ? Typography.fontBold : Typography.fontMedium, fontSize: 13, color: headerInk }}>{t("Визиты", "Tashriflar")}</Text>
            </View>
          </PressableScale>
        </View>
      </View>

      {/* ── SECTION: Targets (quotas) ───────────────────────────────────── */}
      {section === "targets" && (
        <FlatList
          ref={listRef}
          data={summary ?? []}
          keyExtractor={item => String(item.userId)}
          contentContainerStyle={{ paddingHorizontal: Spacing.base, paddingTop: Spacing.md, paddingBottom: insets.bottom + 100 }}
          ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
          refreshControl={
            // isLoading истинно только при самой первой загрузке: при
            // потягивании кружок исчезал сразу, хотя запрос ещё шёл, и человек
            // решал, что обновление не работает. Опроса по времени на этом
            // экране нет, поэтому isFetching здесь безопасен.
            <RefreshControl refreshing={summaryFetching} onRefresh={refetchSummary} tintColor={colors.accent.primary} />
          }
          ListHeaderComponent={summary && summary.length > 0 ? (
            <View style={{ marginBottom: Spacing.md }}>
              {/* Summary cards */}
              {/* Знак валюты стоял подписью под числом, отдельной строкой: у
                  арендатора с долларом он должен стоять слева от суммы, а не
                  под ней. formatMoney знает и разряды, и сторону знака. */}
              <View style={{ flexDirection: "row", gap: Spacing.sm, marginBottom: Spacing.md }}>
                <Card style={{ flex: 1, paddingVertical: 14, paddingHorizontal: 8, alignItems: "center" }}>
                  <Text style={{ fontFamily: Typography.fontMedium, fontSize: 10, color: colors.text.tertiary, textTransform: "uppercase", letterSpacing: 0.5 }}>{t("План", "Reja")}</Text>
                  <Text numberOfLines={1} adjustsFontSizeToFit style={{ fontFamily: Typography.fontBold, fontSize: 14, color: colors.text.primary, marginTop: 4 }}>{withCurrency(money(totalTarget))}</Text>
                </Card>
                <Card style={{ flex: 1, paddingVertical: 14, paddingHorizontal: 8, alignItems: "center" }}>
                  <Text style={{ fontFamily: Typography.fontMedium, fontSize: 10, color: colors.text.tertiary, textTransform: "uppercase", letterSpacing: 0.5 }}>{t("Факт", "Fakt")}</Text>
                  <Text numberOfLines={1} adjustsFontSizeToFit style={{ fontFamily: Typography.fontBold, fontSize: 14, color: colors.status.success, marginTop: 4 }}>{withCurrency(money(totalActual))}</Text>
                </Card>
                <Card style={{ flex: 1, paddingVertical: 14, paddingHorizontal: 8, alignItems: "center" }}>
                  <Text style={{ fontFamily: Typography.fontMedium, fontSize: 10, color: colors.text.tertiary, textTransform: "uppercase", letterSpacing: 0.5 }}>{t("Среднее", "O'rtacha")}</Text>
                  <Text style={{ fontFamily: Typography.fontBold, fontSize: 18, color: avgCompletion >= 80 ? colors.status.success : avgCompletion >= 50 ? colors.status.warning : colors.status.danger, marginTop: 4 }}>{avgCompletion}%</Text>
                  <Text style={{ fontFamily: Typography.fontRegular, fontSize: 11, color: colors.text.muted }}>{t("выполнение", "bajarilish")}</Text>
                </Card>
              </View>
              <Text style={{ fontFamily: Typography.fontSemibold, fontSize: 13, color: colors.text.secondary }}>{t(`${summary.length} агентов`, `${summary.length} ta agent`)}</Text>
            </View>
          ) : null}
          ListEmptyComponent={summaryLoading ? (
            <View style={{ gap: Spacing.md }}>{[1, 2, 3].map(i => <ShimmerSkeleton key={i} height={120} radius={Radii.xxl} />)}</View>
          ) : summaryError ? (
            // «Нет норм. Создайте нормы в табе "Планы"» — указание сделать то,
            // что уже сделано: руководитель шёл ставить нормы поверх
            // существующих или решал, что настройки слетели.
            <View style={{ paddingTop: Spacing.xl }}>
              <ErrorState
                what={t("нормы", "normalarni")}
                error={summaryErr}
                description={t("Это сбой связи, а не пустые настройки. Нормы на месте — их не удалось получить.", "Bu aloqa xatosi, bo'sh sozlama emas. Normalar joyida — faqat olib bo'lmadi.")}
                onRetry={() => { void refetchSummary(); }}
                retrying={summaryFetching}
              />
            </View>
          ) : (
            <View style={{ alignItems: "center", paddingTop: 60, gap: 12 }}>
              <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.bg.elevated, alignItems: "center", justifyContent: "center" }}><Feather name="target" size={28} color={colors.text.muted} /></View>
              <Text style={{ fontFamily: Typography.fontBold, fontSize: 16, color: colors.text.primary }}>{t("Нет норм", "Normalar yo'q")}</Text>
              <Text style={{ fontFamily: Typography.fontRegular, fontSize: 13, color: colors.text.muted, textAlign: "center" }}>{t("Создайте нормы в табе «Планы»", "Normani «Rejalar» bo'limida yarating")}</Text>
            </View>
          )}
          renderItem={({ item, index }) => {
            const revPct = Math.min(100, item.revenueCompletion);
            const color = revPct >= 100 ? colors.status.success : revPct >= 60 ? colors.status.warning : colors.status.danger;
            return (
              <FadeInItem delay={index * 40}>
                <Card style={{ padding: 16 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 }}>
                    <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brand.primaryDim, alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ fontFamily: Typography.fontBold, fontSize: 18, color: colors.brand.primary }}>{(item.userName ?? "—").charAt(0)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: Typography.fontBold, fontSize: 16, color: colors.text.primary }}>{item.userName}</Text>
                      <Text style={{ fontFamily: Typography.fontRegular, fontSize: 12, color: colors.text.tertiary, marginTop: 2 }}>{t("План", "Reja")}: {formatMoney(item.targetAmount)}</Text>
                    </View>
                    <View style={{ alignItems: "center" }}>
                      <ProgressRing value={revPct} size={56} strokeWidth={5} color={color} />
                      <Text style={{ fontFamily: Typography.fontBold, fontSize: 12, color, marginTop: 4 }}>{revPct}%</Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    {/* «План: 5 000 000 сум», а под ним «Факт: 3 200 000» без
                        валюты — вторая цифра повисала без единицы. */}
                    <Text style={{ fontFamily: Typography.fontMono, fontSize: 11, color: colors.text.secondary }}>{t("Факт", "Fakt")}: {formatMoney(item.actualAmount)}</Text>
                    <NeumorphicProgressBar value={revPct} height={6} color={color} style={{ flex: 1 }} />
                  </View>
                </Card>
              </FadeInItem>
            );
          }}
        />
      )}

      {/* ── SECTION: Visit Plans ─────────────────────────────────────────── */}
      {section === "visits" && (
        <>
          <View style={{ paddingHorizontal: Spacing.base, paddingTop: Spacing.md, gap: Spacing.sm }}>
            <DateNav date={date} isToday={isToday} colors={colors}
              onPrev={() => setDate(d => new Date(d.getTime() - 86_400_000))}
              onNext={() => setDate(d => new Date(d.getTime() + 86_400_000))} />
            <PressableScale onPress={() => setFilterAgentId(null)} haptic="selection">
              <View style={{ flexDirection: "row", alignItems: "center", gap: Spacing.sm, backgroundColor: colors.bg.card, borderRadius: Radii.md, ...(filterAgentId ? soft(isDark).raisedSm : soft(isDark).inset), padding: 10 }}>
                <Feather name="user" size={15} color={filterAgentId ? colors.accent.primary : colors.text.muted} />
                <Text style={{ flex: 1, fontFamily: Typography.fontMedium, fontSize: 13, color: filterAgentId ? colors.text.primary : colors.text.muted }}>{selectedAgent?.name ?? t("Все агенты", "Barcha agentlar")}</Text>
                <Feather name="chevron-down" size={16} color={colors.text.muted} />
              </View>
            </PressableScale>
            {total > 0 && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: Spacing.sm }}>
                <Text style={{ fontFamily: Typography.fontMono, fontSize: 13, color: colors.text.secondary }}>{visited}/{total}</Text>
                <NeumorphicProgressBar value={pct} height={6} color={pct === 100 ? colors.accent.success : pct >= 60 ? colors.accent.warning : colors.brand.primary} style={{ flex: 1 }} />
                <Text style={{ fontFamily: Typography.fontBold, fontSize: 13, color: colors.text.primary }}>{pct}%</Text>
              </View>
            )}
          </View>
          {plansLoading ? (
            <View style={{ paddingTop: Spacing.lg, paddingHorizontal: Spacing.base, gap: Spacing.md }}>{[1, 2, 3, 4].map(i => <ShimmerSkeleton key={i} height={110} radius={Radii.xxl} />)}</View>
          ) : plansError ? (
            // «На этот день планов нет» — утверждение о работе агентов. При
            // отказе связи планы есть, просто не доехали.
            <View style={{ paddingTop: Spacing.xl }}>
              <ErrorState
                what={t("планы", "rejalarni")}
                error={plansErr}
                description={t("Это сбой связи, а не пустой день. Проверьте подключение и попробуйте снова.", "Bu aloqa xatosi, bo'sh kun emas. Ulanishni tekshirib, qayta urinib ko'ring.")}
                onRetry={() => { void refetchPlans(); }}
                retrying={plansFetching}
              />
            </View>
          ) : !filterAgentId && groupedPlans ? (
            <SectionList sections={groupedPlans} keyExtractor={item => String(item.id)}
              contentContainerStyle={{ paddingHorizontal: Spacing.base, paddingTop: Spacing.lg, paddingBottom: insets.bottom + 100 }}
              stickySectionHeadersEnabled ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
              refreshControl={<RefreshControl refreshing={plansFetching} onRefresh={refetchPlans} tintColor={colors.accent.primary} />}
              renderSectionHeader={({ section }) => (
                <View style={{ backgroundColor: colors.bg.primary, paddingVertical: Spacing.sm }}>
                  <Text style={{ fontFamily: Typography.fontBold, fontSize: 13, color: colors.accent.primary, textTransform: "uppercase", letterSpacing: 0.5 }}>{section.title} · {section.data.length}</Text>
                </View>
              )}
              renderItem={({ item: plan, index }) => <FadeInItem delay={index * 30}><PlanRow plan={plan} showCity colors={colors} isDark={isDark} /></FadeInItem>}
              ListEmptyComponent={<EmptyState icon="calendar" title={t("На этот день планов нет", "Bu kun uchun reja yo'q")} />}
            />
          ) : (
            <FlatList ref={listRef} data={plans ?? []} keyExtractor={p => String(p.id)}
              contentContainerStyle={{ paddingHorizontal: Spacing.base, paddingTop: Spacing.lg, paddingBottom: insets.bottom + 100 }}
              ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
              refreshControl={<RefreshControl refreshing={plansFetching} onRefresh={refetchPlans} tintColor={colors.accent.primary} />}
              ListEmptyComponent={<EmptyState icon="calendar" title={t("На этот день планов нет", "Bu kun uchun reja yo'q")} />}
              renderItem={({ item: plan, index }) => <FadeInItem delay={index * 30}><PlanRow plan={plan} showAgent={!filterAgentId} showCity colors={colors} isDark={isDark} /></FadeInItem>}
            />
          )}
        </>
      )}
    </View>
  );
}
