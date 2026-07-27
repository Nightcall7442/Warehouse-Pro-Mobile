import { useState, useMemo } from "react";
import { View, Text, FlatList, SectionList, RefreshControl } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getPlans, getAgentsList, Plan } from "../../api";
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

export function SupervisorPlansView() {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { isDark } = useThemeStore();
  const qc = useQueryClient();
  const [date, setDate] = useState(new Date());
  const [filterAgentId, setFilterAgentId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showAgentPicker, setShowAgentPicker] = useState(false);

  const dateStr = fmtDate(date);
  const isToday = dateStr === fmtDate(new Date());

  const { data: agents, isLoading: agentsLoading } = useQuery({
    queryKey: ["agentsList"],
    queryFn: getAgentsList,
  });
  const selectedAgent = agents?.find(a => a.id === filterAgentId);

  const {
    data: plans,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["supervisorPlans", dateStr, filterAgentId],
    queryFn: () => getPlans(filterAgentId ?? undefined, dateStr),
    refetchInterval: 60_000,
  });

  // Group by agent when no filter is selected
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
          <PressableScale onPress={() => setShowCreate(true)} haptic="light">
            <View
              style={{
                backgroundColor: colors.accent.primary,
                borderRadius: Radii.full,
                width: 36,
                height: 36,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Feather name="plus" size={20} color="#fff" />
            </View>
          </PressableScale>
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
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: Spacing.sm,
              backgroundColor: colors.bg.card,
              borderRadius: Radii.md,
              borderWidth: 1,
              borderColor: filterAgentId ? colors.accent.primary : colors.border.default,
              padding: 10,
            }}
          >
            <Feather
              name="user"
              size={15}
              color={filterAgentId ? colors.accent.primary : colors.text.muted}
            />
            <Text
              style={{
                flex: 1,
                fontFamily: Typography.fontMedium,
                fontSize: Typography.size.sm,
                color: filterAgentId ? colors.text.primary : colors.text.muted,
              }}
            >
              {selectedAgent?.name ?? "Все агенты"}
            </Text>
            <Feather name="chevron-down" size={16} color={colors.text.muted} />
          </View>
        </PressableScale>

        {total > 0 && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: Spacing.sm }}>
            <Text
              style={{
                fontFamily: Typography.fontMono,
                fontSize: Typography.size.sm,
                color: colors.text.secondary,
              }}
            >
              {visited}/{total}
            </Text>
            <NeumorphicProgressBar
              value={pct}
              height={6}
              color={pct === 100 ? colors.accent.success : pct >= 60 ? colors.accent.warning : colors.brand.primary}
              style={{ flex: 1 }}
            />
            <Text
              style={{
                fontFamily: Typography.fontBold,
                fontSize: Typography.size.sm,
                color: colors.text.primary,
              }}
            >
              {pct}%
            </Text>
          </View>
        )}
      </View>

      {isLoading ? (
        <View style={{ paddingTop: Spacing.lg, paddingHorizontal: Spacing.base, gap: Spacing.md }}>
          {[1, 2, 3, 4].map(i => (
            <ShimmerSkeleton key={i} height={110} radius={Radii.xxl} />
          ))}
        </View>
      ) : !filterAgentId && groupedPlans ? (
        <SectionList
          sections={groupedPlans}
          keyExtractor={item => String(item.id)}
          contentContainerStyle={{
            paddingHorizontal: Spacing.base,
            paddingTop: Spacing.lg,
            paddingBottom: insets.bottom + 100,
          }}
          stickySectionHeadersEnabled
          ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={refetch}
              tintColor={colors.accent.primary}
            />
          }
          renderSectionHeader={({ section }) => (
            <View style={{ backgroundColor: colors.bg.primary, paddingVertical: Spacing.sm }}>
              <Text
                style={{
                  fontFamily: Typography.fontBold,
                  fontSize: Typography.size.sm,
                  color: colors.accent.primary,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                }}
              >
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
          contentContainerStyle={{
            paddingHorizontal: Spacing.base,
            paddingTop: Spacing.lg,
            paddingBottom: insets.bottom + 100,
          }}
          ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={refetch}
              tintColor={colors.accent.primary}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon="calendar"
              title="На этот день планов нет"
              description="Нажмите «+», чтобы назначить маршрут"
            />
          }
          renderItem={({ item: plan, index }) => (
            <FadeInItem delay={index * 30}>
              <PlanRow
                plan={plan}
                showAgent={!filterAgentId}
                showCity
                colors={colors}
                isDark={isDark}
              />
            </FadeInItem>
          )}
        />
      )}

      {/* Agent picker */}
      <BottomSheet
        visible={showAgentPicker}
        onClose={() => setShowAgentPicker(false)}
        title="Выберите агента"
        colors={colors}
      >
        <FlatList
          data={agents ?? []}
          keyExtractor={a => String(a.id)}
          contentContainerStyle={{
            paddingHorizontal: Spacing.base,
            paddingBottom: insets.bottom + Spacing.lg,
          }}
          ListHeaderComponent={
            <SelectRow
              label="Все агенты"
              icon="users"
              selected={!filterAgentId}
              colors={colors}
              isDark={isDark}
              onPress={() => {
                setFilterAgentId(null);
                setShowAgentPicker(false);
              }}
            />
          }
          ListEmptyComponent={
            !agentsLoading ? (
              <EmptyState
                icon="user"
                title="Нет агентов"
                description="Добавьте агентов в систему"
              />
            ) : null
          }
          renderItem={({ item: agent }) => (
            <SelectRow
              label={agent.name}
              icon="user"
              selected={filterAgentId === agent.id}
              colors={colors}
              isDark={isDark}
              onPress={() => {
                setFilterAgentId(agent.id);
                setShowAgentPicker(false);
              }}
            />
          )}
        />
      </BottomSheet>

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
    </View>
  );
}
