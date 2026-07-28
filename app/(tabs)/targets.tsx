// Warehouse Pro — Targets dashboard (READ-ONLY view of all metrics)
import { useState, useMemo } from "react";
import { View, Text, FlatList, SectionList, RefreshControl } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getSalesTargetSummary, getPlans, getAgentsList, Plan } from "../../src/api";
import { useThemeColors, useThemeStore } from "../../src/store/theme";
import { Typography, Spacing, Radii } from "../../src/theme";
import { Card, EmptyState } from "../../src/components/ui";
import { ProgressRing, NeumorphicProgressBar } from "../../src/components/Charts";
import { FadeInItem, PressableScale, ShimmerSkeleton } from "../../src/components/Animated";
import { PlanRow } from "../../src/components/plans/PlanRow";
import { DateNav } from "../../src/components/plans/DateNav";
import { fmtDate } from "../../src/components/plans/PlanHelpers";
import { LinearGradient } from "expo-linear-gradient";

type Section = "targets" | "visits";

export default function TargetsScreen() {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { isDark } = useThemeStore();
  const [section, setSection] = useState<Section>("targets");
  const [date, setDate] = useState(new Date());
  const [filterAgentId, setFilterAgentId] = useState<number | null>(null);

  const dateStr = fmtDate(date);
  const isToday = dateStr === fmtDate(new Date());
  const currentMonth = new Date().toLocaleDateString("ru-RU", { month: "long", year: "numeric" });

  // Targets data
  const { data: summary, isLoading: summaryLoading, refetch: refetchSummary } = useQuery({
    queryKey: ["salesTargetSummary"], queryFn: getSalesTargetSummary, enabled: section === "targets",
  });

  // Visit plans data
  const { data: agents } = useQuery({ queryKey: ["agentsList"], queryFn: getAgentsList });
  const selectedAgent = agents?.find(a => a.id === filterAgentId);

  const { data: plans, isLoading: plansLoading, refetch: refetchPlans } = useQuery({
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
      const key = plan.agentName ?? `Агент #${plan.agentId}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(plan);
    }
    return Object.entries(groups).map(([agentName, items]) => ({ title: agentName, data: items }));
  }, [plans, filterAgentId]);

  // Summary stats
  const totalTarget = (summary ?? []).reduce((s, a) => s + Number(a.targetAmount), 0);
  const totalActual = (summary ?? []).reduce((s, a) => s + Number(a.actualAmount), 0);
  const avgCompletion = summary && summary.length > 0 ? Math.round(summary.reduce((s, a) => s + a.completion, 0) / summary.length) : 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      {/* Header */}
      <LinearGradient colors={isDark ? ["#221f1c", "#1c1a17"] : [colors.brand.primary, colors.brand.primaryLight]}
        style={{ paddingTop: insets.top + 16, paddingBottom: 16, paddingHorizontal: Spacing.base }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <View>
            <Text style={{ fontFamily: Typography.fontBold, fontSize: 22, color: "#fff" }}>Показатели</Text>
            <Text style={{ fontFamily: Typography.fontRegular, fontSize: 13, color: "rgba(255,255,255,0.7)", marginTop: 4 }}>{currentMonth}</Text>
          </View>
        </View>

        {/* Section switcher */}
        <View style={{ flexDirection: "row", backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 12, padding: 3 }}>
          <PressableScale onPress={() => setSection("targets")} haptic="light" style={{ flex: 1 }}>
            <View style={{ paddingVertical: 10, borderRadius: 10, backgroundColor: section === "targets" ? "rgba(255,255,255,0.25)" : "transparent", alignItems: "center" }}>
              <Text style={{ fontFamily: section === "targets" ? Typography.fontBold : Typography.fontMedium, fontSize: 13, color: "#fff" }}>Нормы</Text>
            </View>
          </PressableScale>
          <PressableScale onPress={() => setSection("visits")} haptic="light" style={{ flex: 1 }}>
            <View style={{ paddingVertical: 10, borderRadius: 10, backgroundColor: section === "visits" ? "rgba(255,255,255,0.25)" : "transparent", alignItems: "center" }}>
              <Text style={{ fontFamily: section === "visits" ? Typography.fontBold : Typography.fontMedium, fontSize: 13, color: "#fff" }}>Визиты</Text>
            </View>
          </PressableScale>
        </View>
      </LinearGradient>

      {/* ── SECTION: Targets (quotas) ───────────────────────────────────── */}
      {section === "targets" && (
        <FlatList
          data={summary ?? []}
          keyExtractor={item => String(item.userId)}
          contentContainerStyle={{ paddingHorizontal: Spacing.base, paddingTop: Spacing.md, paddingBottom: insets.bottom + 100 }}
          ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
          refreshControl={<RefreshControl refreshing={summaryLoading} onRefresh={refetchSummary} tintColor={colors.accent.primary} />}
          ListHeaderComponent={summary && summary.length > 0 ? (
            <View style={{ marginBottom: Spacing.md }}>
              {/* Summary cards */}
              <View style={{ flexDirection: "row", gap: Spacing.sm, marginBottom: Spacing.md }}>
                <Card style={{ flex: 1, padding: 14, alignItems: "center" }}>
                  <Text style={{ fontFamily: Typography.fontMedium, fontSize: 10, color: colors.text.tertiary, textTransform: "uppercase", letterSpacing: 0.5 }}>План</Text>
                  <Text style={{ fontFamily: Typography.fontBold, fontSize: 18, color: colors.text.primary, marginTop: 4 }}>{totalTarget.toLocaleString("ru")}</Text>
                  <Text style={{ fontFamily: Typography.fontRegular, fontSize: 11, color: colors.text.muted }}>сум</Text>
                </Card>
                <Card style={{ flex: 1, padding: 14, alignItems: "center" }}>
                  <Text style={{ fontFamily: Typography.fontMedium, fontSize: 10, color: colors.text.tertiary, textTransform: "uppercase", letterSpacing: 0.5 }}>Факт</Text>
                  <Text style={{ fontFamily: Typography.fontBold, fontSize: 18, color: "#34c473", marginTop: 4 }}>{totalActual.toLocaleString("ru")}</Text>
                  <Text style={{ fontFamily: Typography.fontRegular, fontSize: 11, color: colors.text.muted }}>сум</Text>
                </Card>
                <Card style={{ flex: 1, padding: 14, alignItems: "center" }}>
                  <Text style={{ fontFamily: Typography.fontMedium, fontSize: 10, color: colors.text.tertiary, textTransform: "uppercase", letterSpacing: 0.5 }}>Среднее</Text>
                  <Text style={{ fontFamily: Typography.fontBold, fontSize: 18, color: avgCompletion >= 80 ? "#34c473" : avgCompletion >= 50 ? "#d4973a" : "#d45050", marginTop: 4 }}>{avgCompletion}%</Text>
                  <Text style={{ fontFamily: Typography.fontRegular, fontSize: 11, color: colors.text.muted }}>выполнение</Text>
                </Card>
              </View>
              <Text style={{ fontFamily: Typography.fontSemibold, fontSize: 13, color: colors.text.secondary }}>{summary.length} агентов</Text>
            </View>
          ) : null}
          ListEmptyComponent={summaryLoading ? (
            <View style={{ gap: Spacing.md }}>{[1, 2, 3].map(i => <ShimmerSkeleton key={i} height={120} radius={Radii.xxl} />)}</View>
          ) : (
            <View style={{ alignItems: "center", paddingTop: 60, gap: 12 }}>
              <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.bg.elevated, alignItems: "center", justifyContent: "center" }}><Feather name="target" size={28} color={colors.text.muted} /></View>
              <Text style={{ fontFamily: Typography.fontBold, fontSize: 16, color: colors.text.primary }}>Нет норм</Text>
              <Text style={{ fontFamily: Typography.fontRegular, fontSize: 13, color: colors.text.muted, textAlign: "center" }}>Создайте нормы в табе «Планы»</Text>
            </View>
          )}
          renderItem={({ item, index }) => {
            const revPct = Math.min(100, item.completion);
            const color = revPct >= 100 ? "#34c473" : revPct >= 60 ? "#d4973a" : "#d45050";
            return (
              <FadeInItem delay={index * 40}>
                <Card style={{ padding: 16 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 }}>
                    <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brand.primaryDim, alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ fontFamily: Typography.fontBold, fontSize: 18, color: colors.brand.primary }}>{item.userName.charAt(0)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: Typography.fontBold, fontSize: 16, color: colors.text.primary }}>{item.userName}</Text>
                      <Text style={{ fontFamily: Typography.fontRegular, fontSize: 12, color: colors.text.tertiary, marginTop: 2 }}>План: {Number(item.targetAmount).toLocaleString("ru")} сум</Text>
                    </View>
                    <View style={{ alignItems: "center" }}>
                      <ProgressRing value={revPct} size={56} strokeWidth={5} color={color} />
                      <Text style={{ fontFamily: Typography.fontBold, fontSize: 12, color, marginTop: 4 }}>{revPct}%</Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Text style={{ fontFamily: Typography.fontMono, fontSize: 11, color: colors.text.secondary }}>Факт: {Number(item.actualAmount).toLocaleString("ru")}</Text>
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
              <View style={{ flexDirection: "row", alignItems: "center", gap: Spacing.sm, backgroundColor: colors.bg.card, borderRadius: Radii.md, borderWidth: 1, borderColor: filterAgentId ? colors.accent.primary : colors.border.default, padding: 10 }}>
                <Feather name="user" size={15} color={filterAgentId ? colors.accent.primary : colors.text.muted} />
                <Text style={{ flex: 1, fontFamily: Typography.fontMedium, fontSize: 13, color: filterAgentId ? colors.text.primary : colors.text.muted }}>{selectedAgent?.name ?? "Все агенты"}</Text>
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
          ) : !filterAgentId && groupedPlans ? (
            <SectionList sections={groupedPlans} keyExtractor={item => String(item.id)}
              contentContainerStyle={{ paddingHorizontal: Spacing.base, paddingTop: Spacing.lg, paddingBottom: insets.bottom + 100 }}
              stickySectionHeadersEnabled ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
              refreshControl={<RefreshControl refreshing={plansLoading} onRefresh={refetchPlans} tintColor={colors.accent.primary} />}
              renderSectionHeader={({ section }) => (
                <View style={{ backgroundColor: colors.bg.primary, paddingVertical: Spacing.sm }}>
                  <Text style={{ fontFamily: Typography.fontBold, fontSize: 13, color: colors.accent.primary, textTransform: "uppercase", letterSpacing: 0.5 }}>{section.title} · {section.data.length}</Text>
                </View>
              )}
              renderItem={({ item: plan, index }) => <FadeInItem delay={index * 30}><PlanRow plan={plan} showCity colors={colors} isDark={isDark} /></FadeInItem>}
              ListEmptyComponent={<EmptyState icon="calendar" title="На этот день планов нет" />}
            />
          ) : (
            <FlatList data={plans ?? []} keyExtractor={p => String(p.id)}
              contentContainerStyle={{ paddingHorizontal: Spacing.base, paddingTop: Spacing.lg, paddingBottom: insets.bottom + 100 }}
              ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
              refreshControl={<RefreshControl refreshing={plansLoading} onRefresh={refetchPlans} tintColor={colors.accent.primary} />}
              ListEmptyComponent={<EmptyState icon="calendar" title="На этот день планов нет" />}
              renderItem={({ item: plan, index }) => <FadeInItem delay={index * 30}><PlanRow plan={plan} showAgent={!filterAgentId} showCity colors={colors} isDark={isDark} /></FadeInItem>}
            />
          )}
        </>
      )}
    </View>
  );
}
