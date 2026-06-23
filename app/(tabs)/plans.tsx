import { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Modal,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  getPlans,
  updatePlanStatus,
  createPlan,
  getAgentsList,
  getAllShops,
  Plan,
} from "../../src/api";
import { notify } from "../../src/store/toast";
import { useThemeColors } from "../../src/store/theme";
import { useAuthStore } from "../../src/store/auth";
import { Typography, Spacing, Radii } from "../../src/theme";

function fmtDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

const STATUS_LABEL: Record<Plan["status"], string> = {
  planned: "Запланирован",
  visited: "Посещён",
  skipped: "Пропущен",
};

// ── Create-plan modal — supervisor only ───────────────────────────────────────
function CreatePlanModal({ visible, date, onClose, onCreated }: { visible: boolean; date: string; onClose: () => void; onCreated: () => void }) {
  const colors = useThemeColors();
  const [agentId, setAgentId] = useState<number | null>(null);
  const [shopId, setShopId] = useState<number | null>(null);
  const [notes, setNotes] = useState("");

  const { data: agents, isLoading: agentsLoading } = useQuery({ queryKey: ["agentsList"], queryFn: getAgentsList, enabled: visible });
  const { data: shops, isLoading: shopsLoading } = useQuery({ queryKey: ["allShops"], queryFn: getAllShops, enabled: visible });

  const mutation = useMutation({
    mutationFn: () => createPlan({ agentId: agentId!, shopId: shopId!, planDate: date, notes: notes || undefined }),
    onSuccess: () => {
      notify.success("План создан");
      reset();
      onCreated();
    },
    onError: (e: any) => notify.error(e.message ?? "Не удалось создать план"),
  });

  function reset() {
    setAgentId(null);
    setShopId(null);
    setNotes("");
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={reset}>
      <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: 1, borderColor: colors.border.subtle }}>
          <Text style={{ fontFamily: Typography.fontBold, fontSize: 17, color: colors.text.primary }}>Новый план визита</Text>
          <TouchableOpacity onPress={reset}><Feather name="x" size={20} color={colors.text.primary} /></TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
          {/* Agent picker */}
          <Text style={{ fontFamily: Typography.fontSemibold, fontSize: 12, color: colors.text.tertiary, letterSpacing: 0.5 }}>АГЕНТ *</Text>
          {agentsLoading ? (
            <ActivityIndicator color={colors.accent.primary} />
          ) : (
            <View style={{ gap: 6 }}>
              {(agents ?? []).map(a => (
                <TouchableOpacity
                  key={a.id}
                  onPress={() => setAgentId(a.id)}
                  style={{
                    flexDirection: "row", alignItems: "center", gap: 10,
                    padding: 12, borderRadius: Radii.md,
                    backgroundColor: agentId === a.id ? colors.accent.primary + "18" : colors.bg.card,
                    borderWidth: 1.5, borderColor: agentId === a.id ? colors.accent.primary : colors.border.default,
                  }}
                >
                  <Feather name="user" size={15} color={agentId === a.id ? colors.accent.primary : colors.text.secondary} />
                  <Text style={{ fontFamily: Typography.fontMedium, fontSize: 14, color: colors.text.primary }}>{a.name}</Text>
                </TouchableOpacity>
              ))}
              {!agentsLoading && (agents ?? []).length === 0 && (
                <Text style={{ fontFamily: Typography.fontRegular, fontSize: 13, color: colors.text.tertiary }}>Нет активных агентов</Text>
              )}
            </View>
          )}

          {/* Shop picker */}
          <Text style={{ fontFamily: Typography.fontSemibold, fontSize: 12, color: colors.text.tertiary, letterSpacing: 0.5, marginTop: 8 }}>МАГАЗИН *</Text>
          {shopsLoading ? (
            <ActivityIndicator color={colors.accent.primary} />
          ) : (
            <View style={{ gap: 6 }}>
              {(shops ?? []).map(s => (
                <TouchableOpacity
                  key={s.id}
                  onPress={() => setShopId(s.id)}
                  style={{
                    flexDirection: "row", alignItems: "center", gap: 10,
                    padding: 12, borderRadius: Radii.md,
                    backgroundColor: shopId === s.id ? colors.accent.primary + "18" : colors.bg.card,
                    borderWidth: 1.5, borderColor: shopId === s.id ? colors.accent.primary : colors.border.default,
                  }}
                >
                  <Feather name="shopping-bag" size={15} color={shopId === s.id ? colors.accent.primary : colors.text.secondary} />
                  <Text style={{ fontFamily: Typography.fontMedium, fontSize: 14, color: colors.text.primary, flex: 1 }} numberOfLines={1}>
                    {s.name}{s.city ? ` — ${s.city}` : ""}
                  </Text>
                </TouchableOpacity>
              ))}
              {!shopsLoading && (shops ?? []).length === 0 && (
                <Text style={{ fontFamily: Typography.fontRegular, fontSize: 13, color: colors.text.tertiary }}>Нет активных магазинов</Text>
              )}
            </View>
          )}

          {/* Notes */}
          <Text style={{ fontFamily: Typography.fontSemibold, fontSize: 12, color: colors.text.tertiary, letterSpacing: 0.5, marginTop: 8 }}>ПРИМЕЧАНИЯ</Text>
          <TouchableOpacity
            style={{ backgroundColor: colors.bg.input, borderRadius: Radii.md, borderWidth: 1, borderColor: colors.border.default, padding: 12 }}
            activeOpacity={1}
          >
            <Text
              style={{ fontFamily: Typography.fontRegular, fontSize: 14, color: notes ? colors.text.primary : colors.text.tertiary }}
            >
              {notes || "Дополнительные инструкции..."}
            </Text>
          </TouchableOpacity>
        </ScrollView>

        <View style={{ padding: 16, borderTopWidth: 1, borderColor: colors.border.subtle }}>
          <TouchableOpacity
            onPress={() => {
              if (!agentId || !shopId) { notify.error("Выберите агента и магазин"); return; }
              mutation.mutate();
            }}
            disabled={mutation.isPending}
            style={{ backgroundColor: colors.accent.primary, borderRadius: Radii.lg, padding: 15, alignItems: "center", opacity: mutation.isPending ? 0.6 : 1 }}
          >
            {mutation.isPending
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={{ fontFamily: Typography.fontBold, fontSize: 15, color: "#fff" }}>Создать план</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ── Supervisor view — all agents, date picker, agent filter, create form ────
function SupervisorPlansView() {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const qc = useQueryClient();
  const [date, setDate] = useState(new Date());
  const [filterAgentId, setFilterAgentId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showAgentPicker, setShowAgentPicker] = useState(false);

  const dateStr = fmtDate(date);
  const isToday = dateStr === fmtDate(new Date());

  const { data: agents } = useQuery({ queryKey: ["agentsList"], queryFn: getAgentsList });
  const selectedAgent = agents?.find(a => a.id === filterAgentId);

  const { data: plans, isLoading, refetch } = useQuery({
    queryKey: ["supervisorPlans", dateStr, filterAgentId],
    queryFn: () => getPlans(filterAgentId ?? undefined, dateStr),
    refetchInterval: 30_000,
    enabled: !!filterAgentId,
  });

  const updateMutation = useMutation({
    mutationFn: ({ planId, status }: { planId: number; status: Plan["status"] }) => updatePlanStatus(planId, status),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["supervisorPlans"] }); notify.success("Статус обновлён"); },
    onError: (e: any) => notify.error(e.message ?? "Не удалось обновить статус"),
  });

  const visited = (plans ?? []).filter(p => p.status === "visited").length;
  const total = plans?.length ?? 0;
  const pct = total > 0 ? Math.round((visited / total) * 100) : 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      {/* Header */}
      <View style={{ paddingTop: insets.top + 8, paddingBottom: 12, paddingHorizontal: 16, backgroundColor: colors.bg.secondary, borderBottomWidth: 1, borderColor: colors.border.default }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <Text style={{ fontFamily: Typography.fontExtraBold, fontSize: 22, color: colors.text.primary }}>Планы визитов</Text>
          <TouchableOpacity onPress={() => setShowCreate(true)} style={{ backgroundColor: colors.accent.primary, width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" }}>
            <Feather name="plus" size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Date navigator */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <TouchableOpacity
            onPress={() => setDate(d => new Date(d.getTime() - 86_400_000))}
            style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.bg.elevated, alignItems: "center", justifyContent: "center" }}
          >
            <Feather name="chevron-left" size={18} color={colors.text.primary} />
          </TouchableOpacity>
          <View style={{ flex: 1, backgroundColor: colors.bg.card, borderRadius: Radii.md, borderWidth: 1, borderColor: colors.border.default, padding: 10, alignItems: "center" }}>
            <Text style={{ fontFamily: Typography.fontSemibold, fontSize: 14, color: colors.text.primary, textTransform: "capitalize" }}>
              {date.toLocaleDateString("ru", { weekday: "long" })}
            </Text>
            <Text style={{ fontFamily: Typography.fontMedium, fontSize: 11, color: colors.text.tertiary, marginTop: 2 }}>
              {date.toLocaleDateString("ru", { day: "numeric", month: "long", year: "numeric" })}
              {isToday ? " · Сегодня" : ""}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => setDate(d => new Date(d.getTime() + 86_400_000))}
            style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.bg.elevated, alignItems: "center", justifyContent: "center" }}
          >
            <Feather name="chevron-right" size={18} color={colors.text.primary} />
          </TouchableOpacity>
        </View>

        {/* Agent filter */}
        <TouchableOpacity
          onPress={() => setShowAgentPicker(true)}
          style={{
            flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10,
            backgroundColor: colors.bg.card, borderRadius: Radii.md,
            borderWidth: 1, borderColor: filterAgentId ? colors.accent.primary + "40" : colors.border.default,
            padding: 10,
          }}
        >
          <Feather name="user" size={15} color={filterAgentId ? colors.accent.primary : colors.text.muted} />
          <Text style={{ flex: 1, fontFamily: Typography.fontMedium, fontSize: 13, color: filterAgentId ? colors.text.primary : colors.text.muted }}>
            {selectedAgent?.name ?? "Выберите агента"}
          </Text>
          <Feather name="chevron-down" size={16} color={colors.text.muted} />
        </TouchableOpacity>

        {/* Progress */}
        {filterAgentId && total > 0 && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 }}>
            <Text style={{ fontFamily: Typography.fontMono, fontSize: 12, color: colors.text.secondary }}>{visited}/{total}</Text>
            <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.bg.elevated, overflow: "hidden" }}>
              <View style={{ width: `${pct}%`, height: "100%", borderRadius: 3, backgroundColor: pct === 100 ? colors.accent.success : pct >= 60 ? colors.accent.warning : colors.accent.primary }} />
            </View>
            <Text style={{ fontFamily: Typography.fontBold, fontSize: 12, color: colors.text.primary }}>{pct}%</Text>
          </View>
        )}
      </View>

      {/* Plans list or empty state */}
      {!filterAgentId ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 10, paddingHorizontal: 32 }}>
          <Feather name="user" size={32} color={colors.text.tertiary} />
          <Text style={{ fontFamily: Typography.fontMedium, fontSize: 15, color: colors.text.secondary, textAlign: "center" }}>
            Выберите агента для просмотра планов
          </Text>
          <Text style={{ fontFamily: Typography.fontRegular, fontSize: 13, color: colors.text.tertiary, textAlign: "center" }}>
            Нажмите на фильтр выше, чтобы выбрать агента
          </Text>
        </View>
      ) : (
        <FlatList
          data={plans ?? []}
          keyExtractor={(p) => String(p.id)}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
          refreshing={isLoading}
          onRefresh={refetch}
          ListEmptyComponent={
            !isLoading ? (
              <View style={{ alignItems: "center", paddingTop: 50, gap: 10 }}>
                <Feather name="calendar" size={32} color={colors.text.tertiary} />
                <Text style={{ fontFamily: Typography.fontMedium, fontSize: 14, color: colors.text.secondary }}>На этот день планов нет</Text>
                <TouchableOpacity onPress={() => setShowCreate(true)}>
                  <Text style={{ fontFamily: Typography.fontSemibold, fontSize: 13, color: colors.accent.primary }}>Создать план →</Text>
                </TouchableOpacity>
              </View>
            ) : null
          }
          renderItem={({ item: plan }) => {
            const hasDebt = Number(plan.shopDebt ?? 0) > 0;
            const statusColor =
              plan.status === "visited" ? colors.accent.success :
              plan.status === "skipped" ? colors.accent.warning :
              colors.accent.info;
            return (
              <View style={{ backgroundColor: colors.bg.card, borderRadius: Radii.lg, borderWidth: 1, borderColor: colors.border.default, padding: 14, marginBottom: 10 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: Typography.fontSemibold, fontSize: 15, color: colors.text.primary }}>
                      {plan.shopName ?? "Магазин"}
                    </Text>
                    <Text style={{ fontFamily: Typography.fontRegular, fontSize: 13, color: colors.text.secondary, marginTop: 2 }} numberOfLines={1}>
                      {plan.shopAddress ?? "Адрес не указан"}{plan.shopCity ? ` · ${plan.shopCity}` : ""}
                    </Text>
                    {hasDebt && (
                      <Text style={{ fontFamily: Typography.fontMono, fontSize: 12, color: colors.accent.danger, marginTop: 4 }}>
                        Долг: {Number(plan.shopDebt).toLocaleString("ru")} сум
                      </Text>
                    )}
                  </View>
                  <View style={{ backgroundColor: statusColor + "18", paddingHorizontal: 9, paddingVertical: 4, borderRadius: Radii.full }}>
                    <Text style={{ fontFamily: Typography.fontSemibold, fontSize: 11, color: statusColor }}>{STATUS_LABEL[plan.status]}</Text>
                  </View>
                </View>

                {plan.status === "planned" && (
                  <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                    <TouchableOpacity
                      onPress={() => updateMutation.mutate({ planId: plan.id, status: "visited" })}
                      disabled={updateMutation.isPending}
                      style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.accent.success, borderRadius: Radii.md, paddingVertical: 9 }}
                    >
                      <Feather name="check-circle" size={13} color="#fff" />
                      <Text style={{ fontFamily: Typography.fontSemibold, fontSize: 12, color: "#fff" }}>Готово</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => updateMutation.mutate({ planId: plan.id, status: "skipped" })}
                      disabled={updateMutation.isPending}
                      style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.bg.elevated, borderWidth: 1, borderColor: colors.accent.warning + "40", borderRadius: Radii.md, paddingVertical: 9 }}
                    >
                      <Feather name="clock" size={13} color={colors.accent.warning} />
                      <Text style={{ fontFamily: Typography.fontSemibold, fontSize: 12, color: colors.accent.warning }}>Пропустить</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          }}
        />
      )}

      {/* Agent picker modal */}
      <Modal visible={showAgentPicker} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowAgentPicker(false)}>
        <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: 1, borderColor: colors.border.subtle }}>
            <Text style={{ fontFamily: Typography.fontBold, fontSize: 17, color: colors.text.primary }}>Выберите агента</Text>
            <TouchableOpacity onPress={() => setShowAgentPicker(false)}><Feather name="x" size={20} color={colors.text.primary} /></TouchableOpacity>
          </View>
          <FlatList
            data={agents ?? []}
            keyExtractor={(a) => String(a.id)}
            contentContainerStyle={{ padding: 16, gap: 8 }}
            renderItem={({ item: agent }) => (
              <TouchableOpacity
                onPress={() => { setFilterAgentId(agent.id); setShowAgentPicker(false); }}
                style={{
                  flexDirection: "row", alignItems: "center", gap: 12,
                  padding: 14, borderRadius: Radii.md,
                  backgroundColor: filterAgentId === agent.id ? colors.accent.primary + "18" : colors.bg.card,
                  borderWidth: 1.5, borderColor: filterAgentId === agent.id ? colors.accent.primary : colors.border.default,
                }}
              >
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.brand.primaryDim, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ fontFamily: Typography.fontBold, fontSize: 14, color: colors.brand.primaryLight }}>
                    {agent.name[0]?.toUpperCase()}
                  </Text>
                </View>
                <Text style={{ flex: 1, fontFamily: Typography.fontMedium, fontSize: 15, color: colors.text.primary }}>{agent.name}</Text>
                {filterAgentId === agent.id && <Feather name="check" size={18} color={colors.accent.primary} />}
              </TouchableOpacity>
            )}
          />
        </View>
      </Modal>

      <CreatePlanModal
        visible={showCreate}
        date={dateStr}
        onClose={() => setShowCreate(false)}
        onCreated={() => { setShowCreate(false); refetch(); }}
      />
    </View>
  );
}

// ── Agent view — own plans for today, simple list ────────────────────────────
function AgentPlansView() {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const qc = useQueryClient();

  const { data: plans, isLoading, refetch } = useQuery({
    queryKey: ["agentPlans"],
    queryFn: () => getPlans(),
    refetchInterval: 30_000,
  });

  const updateMutation = useMutation({
    mutationFn: ({ planId, status }: { planId: number; status: Plan["status"] }) => updatePlanStatus(planId, status),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["agentPlans"] }); notify.success("Статус обновлён"); },
    onError: (e: any) => notify.error(e.message ?? "Не удалось обновить статус"),
  });

  const visited = (plans ?? []).filter(p => p.status === "visited").length;
  const total = plans?.length ?? 0;
  const pct = total > 0 ? Math.round((visited / total) * 100) : 0;

  const today = new Date();
  const greeting = today.getHours() < 12 ? "Доброе утро" : today.getHours() < 18 ? "Добрый день" : "Добрый вечер";

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      {/* Header */}
      <View style={{ paddingTop: insets.top + 8, paddingBottom: 12, paddingHorizontal: 16, backgroundColor: colors.bg.secondary, borderBottomWidth: 1, borderColor: colors.border.default }}>
        <Text style={{ fontFamily: Typography.fontExtraBold, fontSize: 22, color: colors.text.primary }}>Мои планы</Text>
        <Text style={{ fontFamily: Typography.fontRegular, fontSize: 13, color: colors.text.secondary, marginTop: 2 }}>
          {greeting} — {today.toLocaleDateString("ru", { day: "numeric", month: "long" })}
        </Text>

        {/* Progress */}
        {total > 0 && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 }}>
            <Text style={{ fontFamily: Typography.fontMono, fontSize: 12, color: colors.text.secondary }}>{visited}/{total}</Text>
            <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.bg.elevated, overflow: "hidden" }}>
              <View style={{ width: `${pct}%`, height: "100%", borderRadius: 3, backgroundColor: pct === 100 ? colors.accent.success : pct >= 60 ? colors.accent.warning : colors.accent.primary }} />
            </View>
            <Text style={{ fontFamily: Typography.fontBold, fontSize: 12, color: colors.text.primary }}>{pct}%</Text>
          </View>
        )}
      </View>

      {/* Plans list */}
      <FlatList
        data={plans ?? []}
        keyExtractor={(p) => String(p.id)}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
        refreshing={isLoading}
        onRefresh={refetch}
        ListEmptyComponent={
          !isLoading ? (
            <View style={{ alignItems: "center", paddingTop: 50, gap: 10 }}>
              <Feather name="calendar" size={32} color={colors.text.tertiary} />
              <Text style={{ fontFamily: Typography.fontMedium, fontSize: 14, color: colors.text.secondary }}>Планов на сегодня нет</Text>
              <Text style={{ fontFamily: Typography.fontRegular, fontSize: 13, color: colors.text.tertiary, textAlign: "center" }}>
                Супервайзер ещё не назначил маршрут
              </Text>
            </View>
          ) : null
        }
        renderItem={({ item: plan }) => {
          const hasDebt = Number(plan.shopDebt ?? 0) > 0;
          const statusColor =
            plan.status === "visited" ? colors.accent.success :
            plan.status === "skipped" ? colors.accent.warning :
            colors.accent.info;
          return (
            <View style={{
              backgroundColor: colors.bg.card, borderRadius: Radii.lg, borderWidth: 1,
              borderColor: colors.border.default, padding: 14, marginBottom: 10,
              opacity: plan.status === "visited" ? 0.6 : 1,
            }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: Typography.fontSemibold, fontSize: 15, color: colors.text.primary }}>
                    {plan.shopName ?? "Магазин"}
                  </Text>
                  <Text style={{ fontFamily: Typography.fontRegular, fontSize: 13, color: colors.text.secondary, marginTop: 2 }} numberOfLines={1}>
                    {plan.shopAddress ?? "Адрес не указан"}
                  </Text>
                  {hasDebt && (
                    <Text style={{ fontFamily: Typography.fontMono, fontSize: 12, color: colors.accent.danger, marginTop: 4 }}>
                      Долг: {Number(plan.shopDebt).toLocaleString("ru")} сум
                    </Text>
                  )}
                </View>
                <View style={{ backgroundColor: statusColor + "18", paddingHorizontal: 9, paddingVertical: 4, borderRadius: Radii.full }}>
                  <Text style={{ fontFamily: Typography.fontSemibold, fontSize: 11, color: statusColor }}>{STATUS_LABEL[plan.status]}</Text>
                </View>
              </View>

              {plan.status === "planned" && (
                <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                  <TouchableOpacity
                    onPress={() => updateMutation.mutate({ planId: plan.id, status: "visited" })}
                    disabled={updateMutation.isPending}
                    style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.accent.success, borderRadius: Radii.md, paddingVertical: 9 }}
                  >
                    <Feather name="check-circle" size={13} color="#fff" />
                    <Text style={{ fontFamily: Typography.fontSemibold, fontSize: 12, color: "#fff" }}>Готово</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => updateMutation.mutate({ planId: plan.id, status: "skipped" })}
                    disabled={updateMutation.isPending}
                    style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.bg.elevated, borderWidth: 1, borderColor: colors.accent.warning + "40", borderRadius: Radii.md, paddingVertical: 9 }}
                  >
                    <Feather name="clock" size={13} color={colors.accent.warning} />
                    <Text style={{ fontFamily: Typography.fontSemibold, fontSize: 12, color: colors.accent.warning }}>Пропустить</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        }}
      />
    </View>
  );
}

// ── Main screen — role-based routing ──────────────────────────────────────────
export default function PlansScreen() {
  const { user } = useAuthStore();
  const isSupervisor = user?.role === "supervisor";

  if (isSupervisor) {
    return <SupervisorPlansView />;
  }
  return <AgentPlansView />;
}
