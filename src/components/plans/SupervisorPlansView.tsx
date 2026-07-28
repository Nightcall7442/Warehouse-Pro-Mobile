import { useState, useMemo } from "react";
import { View, Text, FlatList, SectionList, RefreshControl, TextInput } from "react-native";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getPlans, getAgentsList, createSalesTarget, Plan } from "../../api";
import { useThemeColors, useThemeStore } from "../../store/theme";
import { Typography, Spacing, Radii } from "../../theme";
import { ScreenHeader, EmptyState } from "../ui";
import { NeumorphicProgressBar } from "../Charts";
import { FadeInItem, PressableScale, ShimmerSkeleton } from "../Animated";
import { fmtDate } from "./PlanHelpers";
import { PlanRow } from "./PlanRow";
import { DateNav } from "./DateNav";
import { CreatePlanModal } from "./CreatePlanModal";
import { BottomSheet, SelectRow } from "./PlanHelpers";
import { notify } from "../../store/toast";

export function SupervisorPlansView() {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { isDark } = useThemeStore();
  const qc = useQueryClient();
  const [date, setDate] = useState(new Date());
  const [filterAgentId, setFilterAgentId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showAgentPicker, setShowAgentPicker] = useState(false);
  const [showCreateTarget, setShowCreateTarget] = useState(false);

  const dateStr = fmtDate(date);
  const isToday = dateStr === fmtDate(new Date());

  const { data: agents, isLoading: agentsLoading } = useQuery({
    queryKey: ["agentsList"],
    queryFn: getAgentsList,
  });
  const selectedAgent = agents?.find(a => a.id === filterAgentId);

  const { data: plans, isLoading, refetch } = useQuery({
    queryKey: ["supervisorPlans", dateStr, filterAgentId],
    queryFn: () => getPlans(filterAgentId ?? undefined, dateStr),
    refetchInterval: 60_000,
  });

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

  const visited = (plans ?? []).filter(p => p.status === "visited").length;
  const total = plans?.length ?? 0;
  const pct = total > 0 ? Math.round((visited / total) * 100) : 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      <ScreenHeader
        title="Планы визитов"
        right={
          <View style={{ flexDirection: "row", gap: 8 }}>
            <PressableScale onPress={() => setShowCreateTarget(true)} haptic="light">
              <View style={{ backgroundColor: colors.accent.warning, borderRadius: Radii.full, width: 36, height: 36, alignItems: "center", justifyContent: "center" }}>
                <Feather name="target" size={18} color="#fff" />
              </View>
            </PressableScale>
            <PressableScale onPress={() => setShowCreate(true)} haptic="light">
              <View style={{ backgroundColor: colors.accent.primary, borderRadius: Radii.full, width: 36, height: 36, alignItems: "center", justifyContent: "center" }}>
                <Feather name="plus" size={20} color="#fff" />
              </View>
            </PressableScale>
          </View>
        }
      />

      <View style={{ paddingHorizontal: Spacing.base, paddingTop: Spacing.md, gap: Spacing.sm }}>
        <DateNav
          date={date}
          isToday={isToday}
          colors={colors}
          onPrev={() => setDate(d => new Date(d.getTime() - 86_400_000))}
          onNext={() => setDate(d => new Date(d.getTime() + 86_400_000))}
        />

        <PressableScale onPress={() => setShowAgentPicker(true)} haptic="selection">
          <View style={{
            flexDirection: "row", alignItems: "center", gap: Spacing.sm,
            backgroundColor: colors.bg.card, borderRadius: Radii.md, borderWidth: 1,
            borderColor: filterAgentId ? colors.accent.primary : colors.border.default, padding: 10,
          }}>
            <Feather name="user" size={15} color={filterAgentId ? colors.accent.primary : colors.text.muted} />
            <Text style={{ flex: 1, fontFamily: Typography.fontMedium, fontSize: Typography.size.sm, color: filterAgentId ? colors.text.primary : colors.text.muted }}>
              {selectedAgent?.name ?? "Все агенты"}
            </Text>
            <Feather name="chevron-down" size={16} color={colors.text.muted} />
          </View>
        </PressableScale>

        {total > 0 && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: Spacing.sm }}>
            <Text style={{ fontFamily: Typography.fontMono, fontSize: Typography.size.sm, color: colors.text.secondary }}>{visited}/{total}</Text>
            <NeumorphicProgressBar value={pct} height={6} color={pct === 100 ? colors.accent.success : pct >= 60 ? colors.accent.warning : colors.brand.primary} style={{ flex: 1 }} />
            <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.sm, color: colors.text.primary }}>{pct}%</Text>
          </View>
        )}
      </View>

      {isLoading ? (
        <View style={{ paddingTop: Spacing.lg, paddingHorizontal: Spacing.base, gap: Spacing.md }}>
          {[1, 2, 3, 4].map(i => <ShimmerSkeleton key={i} height={110} radius={Radii.xxl} />)}
        </View>
      ) : !filterAgentId && groupedPlans ? (
        <SectionList
          sections={groupedPlans}
          keyExtractor={item => String(item.id)}
          contentContainerStyle={{ paddingHorizontal: Spacing.base, paddingTop: Spacing.lg, paddingBottom: insets.bottom + 100 }}
          stickySectionHeadersEnabled
          ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
          refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={colors.accent.primary} />}
          renderSectionHeader={({ section }) => (
            <View style={{ backgroundColor: colors.bg.primary, paddingVertical: Spacing.sm }}>
              <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.sm, color: colors.accent.primary, textTransform: "uppercase", letterSpacing: 0.5 }}>
                {section.title} · {section.data.length}
              </Text>
            </View>
          )}
          renderItem={({ item: plan, index }) => (
            <FadeInItem delay={index * 30}>
              <PlanRow plan={plan} showCity colors={colors} isDark={isDark} />
            </FadeInItem>
          )}
          ListEmptyComponent={<EmptyState icon="calendar" title="На этот день планов нет" />}
        />
      ) : (
        <FlatList
          data={plans ?? []}
          keyExtractor={p => String(p.id)}
          contentContainerStyle={{ paddingHorizontal: Spacing.base, paddingTop: Spacing.lg, paddingBottom: insets.bottom + 100 }}
          ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
          refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={colors.accent.primary} />}
          ListEmptyComponent={<EmptyState icon="calendar" title="На этот день планов нет" description="Нажмите «+», чтобы назначить маршрут" />}
          renderItem={({ item: plan, index }) => (
            <FadeInItem delay={index * 30}>
              <PlanRow plan={plan} showAgent={!filterAgentId} showCity colors={colors} isDark={isDark} />
            </FadeInItem>
          )}
        />
      )}

      {/* Agent picker */}
      <BottomSheet visible={showAgentPicker} onClose={() => setShowAgentPicker(false)} title="Выберите агента" colors={colors}>
        <FlatList
          data={agents ?? []}
          keyExtractor={a => String(a.id)}
          contentContainerStyle={{ paddingHorizontal: Spacing.base, paddingBottom: insets.bottom + Spacing.lg }}
          ListHeaderComponent={
            <SelectRow label="Все агенты" icon="users" selected={!filterAgentId} colors={colors} isDark={isDark}
              onPress={() => { setFilterAgentId(null); setShowAgentPicker(false); }} />
          }
          ListEmptyComponent={!agentsLoading ? <EmptyState icon="user" title="Нет агентов" description="Добавьте агентов в систему" /> : null}
          renderItem={({ item: agent }) => (
            <SelectRow label={agent.name} icon="user" selected={filterAgentId === agent.id} colors={colors} isDark={isDark}
              onPress={() => { setFilterAgentId(agent.id); setShowAgentPicker(false); }} />
          )}
        />
      </BottomSheet>

      {/* Create visit plan modal */}
      <CreatePlanModal
        visible={showCreate}
        date={dateStr}
        onClose={() => setShowCreate(false)}
        onCreated={(agentId?: number) => {
          setShowCreate(false);
          if (agentId) {
            setFilterAgentId(agentId);
            setTimeout(() => qc.invalidateQueries({ queryKey: ["supervisorPlans"] }), 100);
          }
        }}
      />

      {/* Create monthly target modal */}
      <CreateTargetModal
        visible={showCreateTarget}
        agents={agents ?? []}
        onClose={() => setShowCreateTarget(false)}
        onCreated={() => {
          setShowCreateTarget(false);
          notify.success("Месячный план создан");
        }}
      />
    </View>
  );
}

// ── Create Monthly Target Modal ─────────────────────────────────────────────
function CreateTargetModal({ visible, agents, onClose, onCreated }: {
  visible: boolean;
  agents: Array<{ id: number; name: string }>;
  onClose: () => void;
  onCreated: () => void;
}) {
  const colors = useThemeColors();
  const { isDark } = useThemeStore();
  const insets = useSafeAreaInsets();
  const [agentId, setAgentId] = useState<number | null>(null);
  const [targetAmount, setTargetAmount] = useState("");
  const [visitTarget, setVisitTarget] = useState("");
  const [showAgentPicker, setShowAgentPicker] = useState(false);

  const selectedAgent = agents.find(a => a.id === agentId);
  const now = new Date();
  const periodStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const periodEnd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${lastDay}`;

  const mutation = useMutation({
    mutationFn: () => createSalesTarget({
      userId: agentId!,
      periodType: "monthly",
      periodStart,
      periodEnd,
      targetAmount: Number(targetAmount.replace(/\s/g, "")),
      visitTarget: visitTarget ? Number(visitTarget) : undefined,
    }),
    onSuccess: () => {
      onCreated();
      setAgentId(null);
      setTargetAmount("");
      setVisitTarget("");
    },
    onError: (e: Error) => notify.error(e.message),
  });

  if (!visible) return null;

  return (
    <View style={{ position: "absolute", inset: 0, backgroundColor: colors.bg.overlay, justifyContent: "flex-end" }}>
      <PressableScale onPress={onClose} haptic="light" style={{ flex: 1 }}>
        <View style={{ flex: 1 }} />
      </PressableScale>
      <View style={{
        backgroundColor: colors.bg.card, borderTopLeftRadius: Radii.xxl, borderTopRightRadius: Radii.xxl,
        padding: Spacing.lg, paddingBottom: insets.bottom + Spacing.lg,
      }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: Spacing.lg }}>
          <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.lg, color: colors.text.primary }}>Месячный план</Text>
          <PressableScale onPress={onClose} haptic="light">
            <Feather name="x" size={20} color={colors.text.muted} />
          </PressableScale>
        </View>

        <Text style={{ fontFamily: Typography.fontMedium, fontSize: Typography.size.xs, color: colors.text.tertiary, marginBottom: 6 }}>Агент</Text>
        <PressableScale onPress={() => setShowAgentPicker(true)} haptic="light">
          <View style={{
            flexDirection: "row", alignItems: "center", gap: Spacing.sm,
            backgroundColor: colors.bg.input, borderRadius: Radii.md, borderWidth: 1,
            borderColor: agentId ? colors.accent.primary : colors.border.default, padding: 12, marginBottom: Spacing.md,
          }}>
            <Feather name="user" size={15} color={agentId ? colors.accent.primary : colors.text.muted} />
            <Text style={{ flex: 1, fontFamily: Typography.fontMedium, fontSize: Typography.size.sm, color: agentId ? colors.text.primary : colors.text.muted }}>
              {selectedAgent?.name ?? "Выберите агента"}
            </Text>
            <Feather name="chevron-down" size={16} color={colors.text.muted} />
          </View>
        </PressableScale>

        <Text style={{ fontFamily: Typography.fontMedium, fontSize: Typography.size.xs, color: colors.text.tertiary, marginBottom: 6 }}>Норма выручки (сум)</Text>
        <TextInput
          style={{
            backgroundColor: colors.bg.input, borderRadius: Radii.md, borderWidth: 1,
            borderColor: colors.border.default, padding: 12, fontFamily: Typography.fontMedium,
            fontSize: Typography.size.base, color: colors.text.primary, marginBottom: Spacing.md,
          }}
          placeholder="5 000 000" placeholderTextColor={colors.text.muted}
          value={targetAmount} onChangeText={setTargetAmount} keyboardType="numeric"
        />

        <Text style={{ fontFamily: Typography.fontMedium, fontSize: Typography.size.xs, color: colors.text.tertiary, marginBottom: 6 }}>Норма визитов (%)</Text>
        <TextInput
          style={{
            backgroundColor: colors.bg.input, borderRadius: Radii.md, borderWidth: 1,
            borderColor: colors.border.default, padding: 12, fontFamily: Typography.fontMedium,
            fontSize: Typography.size.base, color: colors.text.primary, marginBottom: Spacing.lg,
          }}
          placeholder="80" placeholderTextColor={colors.text.muted}
          value={visitTarget} onChangeText={setVisitTarget} keyboardType="numeric"
        />

        <PressableScale
          onPress={() => {
            if (!agentId) { notify.error("Выберите агента"); return; }
            if (!targetAmount) { notify.error("Введите норму выручки"); return; }
            mutation.mutate();
          }}
          disabled={mutation.isPending}
          haptic="medium"
        >
          <View style={{
            backgroundColor: colors.accent.primary, borderRadius: Radii.md, paddingVertical: 14,
            alignItems: "center", opacity: mutation.isPending ? 0.7 : 1,
          }}>
            <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.base, color: "#fff" }}>
              {mutation.isPending ? "Создание..." : "Создать план"}
            </Text>
          </View>
        </PressableScale>
      </View>

      <BottomSheet visible={showAgentPicker} onClose={() => setShowAgentPicker(false)} title="Выберите агента" colors={colors}>
        <FlatList
          data={agents}
          keyExtractor={a => String(a.id)}
          contentContainerStyle={{ paddingHorizontal: Spacing.base, paddingBottom: insets.bottom + Spacing.lg }}
          renderItem={({ item: agent }) => (
            <SelectRow label={agent.name} icon="user" selected={agentId === agent.id} colors={colors} isDark={isDark}
              onPress={() => { setAgentId(agent.id); setShowAgentPicker(false); }} />
          )}
        />
      </BottomSheet>
    </View>
  );
}
