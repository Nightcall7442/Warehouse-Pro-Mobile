import { useState, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Modal,
  ScrollView,
  ActivityIndicator,
  Alert,
  TextInput,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import Animated, {
  Layout,
} from "react-native-reanimated";
import {
  getPlans,
  updatePlanStatus,
  saveVisitPhoto,
  createPlan,
  getAgentsList,
  getAllShops,
  uploadFile,
  Plan,
  ShopSummary,
} from "../../src/api";
import { notify } from "../../src/store/toast";
import { useThemeColors } from "../../src/store/theme";
import { useAuthStore } from "../../src/store/auth";
import { Typography, Spacing, Radii } from "../../src/theme";
import { PlanCard, ScreenHeader } from "../../src/components/ui";
import { FadeInItem, PressableScale } from "../../src/components/Animated";

function fmtDate(d: Date): string {
  return d.toISOString().split("T")[0];
}


// ── Create-plan modal — supervisor only (territory-based) ─────────────────────
function CreatePlanModal({ visible, date, onClose, onCreated }: { visible: boolean; date: string; onClose: () => void; onCreated: (agentId?: number) => void }) {
  const colors = useThemeColors();
  const [agentId, setAgentId] = useState<number | null>(null);
  const [selectedTerritory, setSelectedTerritory] = useState<string | null>(null);
  const [notes, setNotes] = useState("");

  const { data: agents, isLoading: agentsLoading } = useQuery({ queryKey: ["agentsList"], queryFn: getAgentsList, enabled: visible });
  const { data: allShops, isLoading: shopsLoading } = useQuery({ queryKey: ["allShops"], queryFn: getAllShops, enabled: visible });

  // Extract unique territories from shops
  const territories = useMemo(() => {
    if (!allShops) return [];
    const map = new Map<string, ShopSummary[]>();
    for (const shop of allShops) {
      const territory = shop.district || shop.city || "Без территории";
      if (!map.has(territory)) map.set(territory, []);
      map.get(territory)!.push(shop);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b, "ru"))
      .map(([territory, shops]) => ({ territory, shops, count: shops.length }));
  }, [allShops]);

  const selectedShops = useMemo(() => {
    if (!selectedTerritory) return [];
    return territories.find(t => t.territory === selectedTerritory)?.shops ?? [];
  }, [territories, selectedTerritory]);

  // Create plans for ALL shops in the selected territory
  const mutation = useMutation({
    mutationFn: async () => {
      if (!agentId || !selectedShops.length) return;
      const results = [];
      for (const shop of selectedShops) {
        const result = await createPlan({ agentId, shopId: shop.id, planDate: date, notes: notes || undefined });
        results.push(result);
      }
      return results;
    },
    onSuccess: () => {
      notify.success(`Создано ${selectedShops.length} планов`);
      const createdAgent = agentId ?? undefined;
      reset();
      onCreated(createdAgent);
    },
    onError: (e: Error) => notify.error(e.message ?? "Не удалось создать планы"),
  });

  function reset() {
    setAgentId(null);
    setSelectedTerritory(null);
    setNotes("");
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={reset}>
      <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: 1, borderColor: colors.border.subtle }}>
          <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.lg, color: colors.text.primary }}>Новый план визита</Text>
          <TouchableOpacity onPress={() => { reset(); }}><Feather name="x" size={20} color={colors.text.primary} /></TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
          {/* Agent picker */}
          <Text style={{ fontFamily: Typography.fontSemibold, fontSize: Typography.size.sm, color: colors.text.tertiary, letterSpacing: 0.5 }}>АГЕНТ *</Text>
          {agentsLoading ? (
            <ActivityIndicator color={colors.accent.primary} />
          ) : (
            <View style={{ gap: 6 }}>
              {(agents ?? []).map(a => (
                <TouchableOpacity
                  key={a.id}
                  onPress={() => { setAgentId(a.id); }}
                  style={{
                    flexDirection: "row", alignItems: "center", gap: 10,
                    padding: 12, borderRadius: Radii.md,
                    backgroundColor: agentId === a.id ? colors.accent.primary + "18" : colors.bg.card,
                    borderWidth: 1.5, borderColor: agentId === a.id ? colors.accent.primary : colors.border.default,
                  }}
                >
                  <Feather name="user" size={15} color={agentId === a.id ? colors.accent.primary : colors.text.secondary} />
                  <Text style={{ fontFamily: Typography.fontMedium, fontSize: Typography.size.base, color: colors.text.primary }}>{a.name}</Text>
                </TouchableOpacity>
              ))}
              {!agentsLoading && (agents ?? []).length === 0 && (
                <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.sm, color: colors.text.tertiary }}>Нет активных агентов</Text>
              )}
            </View>
          )}

          {/* Territory picker */}
          <Text style={{ fontFamily: Typography.fontSemibold, fontSize: Typography.size.sm, color: colors.text.tertiary, letterSpacing: 0.5, marginTop: 8 }}>ТЕРРИТОРИЯ *</Text>
          {shopsLoading ? (
            <ActivityIndicator color={colors.accent.primary} />
          ) : (
            <View style={{ gap: 6 }}>
              {territories.map(t => (
                <TouchableOpacity
                  key={t.territory}
                  onPress={() => { setSelectedTerritory(t.territory); }}
                  style={{
                    flexDirection: "row", alignItems: "center", gap: 10,
                    padding: 12, borderRadius: Radii.md,
                    backgroundColor: selectedTerritory === t.territory ? colors.accent.primary + "18" : colors.bg.card,
                    borderWidth: 1.5, borderColor: selectedTerritory === t.territory ? colors.accent.primary : colors.border.default,
                  }}
                >
                  <Feather name="map-pin" size={15} color={selectedTerritory === t.territory ? colors.accent.primary : colors.text.secondary} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: Typography.fontMedium, fontSize: Typography.size.base, color: colors.text.primary }}>{t.territory}</Text>
                    <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.xs, color: colors.text.tertiary }}>{t.count} магазинов</Text>
                  </View>
                  {selectedTerritory === t.territory && <Feather name="check-circle" size={18} color={colors.accent.primary} />}
                </TouchableOpacity>
              ))}
              {!shopsLoading && territories.length === 0 && (
                <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.sm, color: colors.text.tertiary }}>Нет магазинов</Text>
              )}
            </View>
          )}

          {/* Selected shops preview */}
          {selectedShops.length > 0 && (
            <View style={{ backgroundColor: colors.accent.primary + "08", borderRadius: Radii.md, padding: 12, borderWidth: 1, borderColor: colors.accent.primary + "20" }}>
              <Text style={{ fontFamily: Typography.fontSemibold, fontSize: Typography.size.xs, color: colors.accent.primary, marginBottom: 4 }}>БУДУТ НАЗНАЧЕНЫ:</Text>
              {selectedShops.slice(0, 5).map(s => (
                <Text key={s.id} style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.sm, color: colors.text.secondary }}>• {s.name}</Text>
              ))}
              {selectedShops.length > 5 && (
                <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.xs, color: colors.text.tertiary, marginTop: 2 }}>...и ещё {selectedShops.length - 5}</Text>
              )}
            </View>
          )}

          {/* Notes */}
          <Text style={{ fontFamily: Typography.fontSemibold, fontSize: Typography.size.sm, color: colors.text.tertiary, letterSpacing: 0.5, marginTop: 8 }}>ПРИМЕЧАНИЯ</Text>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Дополнительные инструкции..."
            placeholderTextColor={colors.text.tertiary}
            multiline
            style={{ backgroundColor: colors.bg.input, borderRadius: Radii.md, borderWidth: 1, borderColor: colors.border.default, padding: 12, fontFamily: Typography.fontRegular, fontSize: Typography.size.base, color: colors.text.primary, minHeight: 60, textAlignVertical: "top" }}
          />
        </ScrollView>

        <View style={{ padding: 16, borderTopWidth: 1, borderColor: colors.border.subtle }}>
          <PressableScale
            onPress={() => {
              if (!agentId || !selectedTerritory) { notify.error("Выберите агента и территорию"); return; }
              mutation.mutate();
            }}
            haptic="medium"
            disabled={mutation.isPending}
          >
            <View style={{ backgroundColor: colors.accent.primary, borderRadius: Radii.lg, padding: 15, alignItems: "center", opacity: mutation.isPending ? 0.6 : 1 }}>
              {mutation.isPending
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.md, color: "#fff" }}>Создать план ({selectedShops.length} магазинов)</Text>}
            </View>
          </PressableScale>
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

  const { data: agents, isLoading: agentsLoading } = useQuery({ queryKey: ["agentsList"], queryFn: getAgentsList });
  const selectedAgent = agents?.find(a => a.id === filterAgentId);

  const { data: plans, isLoading, refetch } = useQuery({
    queryKey: ["supervisorPlans", dateStr, filterAgentId],
    queryFn: () => getPlans(filterAgentId ?? undefined, dateStr),
    refetchInterval: 60_000,
    enabled: !!filterAgentId,
  });

  const updateMutation = useMutation({
    mutationFn: ({ planId, status }: { planId: number; status: Plan["status"] }) => updatePlanStatus(planId, status),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["supervisorPlans"] }); notify.success("Статус обновлён"); },
    onError: (e: Error) => notify.error(e.message ?? "Не удалось обновить статус"),
  });

  const visited = (plans ?? []).filter(p => p.status === "visited").length;
  const total = plans?.length ?? 0;
  const pct = total > 0 ? Math.round((visited / total) * 100) : 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      <ScreenHeader
        title="Планы визитов"
          right={
          <TouchableOpacity onPress={() => { setShowCreate(true); }} style={{ backgroundColor: colors.accent.primary, width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" }}>
            <Feather name="plus" size={20} color="#fff" />
          </TouchableOpacity>
        }
      />

      {/* Date navigator */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: Spacing.base, paddingTop: Spacing.md }}>
          <TouchableOpacity
            onPress={() => { setDate(d => new Date(d.getTime() - 86_400_000)); }}
            style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.bg.elevated, alignItems: "center", justifyContent: "center" }}
          >
            <Feather name="chevron-left" size={18} color={colors.text.primary} />
          </TouchableOpacity>
          <View style={{ flex: 1, backgroundColor: colors.bg.card, borderRadius: Radii.md, borderWidth: 1, borderColor: colors.border.default, padding: 10, alignItems: "center" }}>
            <Text style={{ fontFamily: Typography.fontSemibold, fontSize: Typography.size.base, color: colors.text.primary, textTransform: "capitalize" }}>
              {date.toLocaleDateString("ru", { weekday: "long" })}
            </Text>
            <Text style={{ fontFamily: Typography.fontMedium, fontSize: Typography.size.xs, color: colors.text.tertiary, marginTop: 2 }}>
              {date.toLocaleDateString("ru", { day: "numeric", month: "long", year: "numeric" })}
              {isToday ? " · Сегодня" : ""}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => { setDate(d => new Date(d.getTime() + 86_400_000)); }}
            style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.bg.elevated, alignItems: "center", justifyContent: "center" }}
          >
            <Feather name="chevron-right" size={18} color={colors.text.primary} />
          </TouchableOpacity>
        </View>

        {/* Agent filter */}
        <TouchableOpacity
          onPress={() => { setShowAgentPicker(true); }}
          style={{
            flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10,
            backgroundColor: colors.bg.card, borderRadius: Radii.md,
            borderWidth: 1, borderColor: filterAgentId ? colors.accent.primary + "40" : colors.border.default,
            padding: 10,
          }}
        >
          <Feather name="user" size={15} color={filterAgentId ? colors.accent.primary : colors.text.muted} />
          <Text style={{ flex: 1, fontFamily: Typography.fontMedium, fontSize: Typography.size.sm, color: filterAgentId ? colors.text.primary : colors.text.muted }}>
            {selectedAgent?.name ?? "Выберите агента"}
          </Text>
          <Feather name="chevron-down" size={16} color={colors.text.muted} />
        </TouchableOpacity>

        {/* Progress */}
        {filterAgentId && total > 0 && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 }}>
            <Text style={{ fontFamily: Typography.fontMono, fontSize: Typography.size.sm, color: colors.text.secondary }}>{visited}/{total}</Text>
            <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.bg.elevated, overflow: "hidden" }}>
              <View style={{ width: `${pct}%`, height: "100%", borderRadius: 3, backgroundColor: pct === 100 ? colors.accent.success : pct >= 60 ? colors.accent.warning : colors.accent.primary }} />
            </View>
            <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.sm, color: colors.text.primary }}>{pct}%</Text>
          </View>
        )}

      {/* Plans list or empty state */}
      {!filterAgentId ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 10, paddingHorizontal: 32 }}>
          <Feather name="user" size={32} color={colors.text.tertiary} />
          <Text style={{ fontFamily: Typography.fontMedium, fontSize: Typography.size.md, color: colors.text.secondary, textAlign: "center" }}>
            Выберите агента для просмотра планов
          </Text>
          <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.sm, color: colors.text.tertiary, textAlign: "center" }}>
            Нажмите на фильтр выше, чтобы выбрать агента
          </Text>
        </View>
      ) : (
        <FlatList
          data={plans ?? []}
          keyExtractor={(p) => String(p.id)}
          contentContainerStyle={{ padding: Spacing.base, paddingBottom: insets.bottom + 100 }}
          windowSize={11}
          maxToRenderPerBatch={10}
          removeClippedSubviews
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={refetch}
              tintColor={colors.accent.primary}
            />
          }
          ListEmptyComponent={
            !isLoading ? (
              <View style={{ alignItems: "center", paddingTop: 50, gap: 10 }}>
                <Feather name="calendar" size={32} color={colors.text.tertiary} />
                <Text style={{ fontFamily: Typography.fontMedium, fontSize: Typography.size.base, color: colors.text.secondary }}>На этот день планов нет</Text>
                <TouchableOpacity onPress={() => { setShowCreate(true); }}>
                  <Text style={{ fontFamily: Typography.fontSemibold, fontSize: Typography.size.sm, color: colors.accent.primary }}>Создать план →</Text>
                </TouchableOpacity>
              </View>
            ) : null
          }
          renderItem={({ item: plan, index }) => (
            <Animated.View layout={Layout.springify().damping(20)}>
              <FadeInItem delay={index * 60}>
                <PlanCard
                  plan={plan}
                  showCity
                  onVisit={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    updateMutation.mutate({ planId: plan.id, status: "visited" });
                  }}
                  onSkip={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    updateMutation.mutate({ planId: plan.id, status: "skipped" });
                  }}
                  loading={updateMutation.isPending}
                />
              </FadeInItem>
            </Animated.View>
          )}
        />
      )}

      {/* Agent picker modal */}
      <Modal visible={showAgentPicker} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowAgentPicker(false)}>
        <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: 1, borderColor: colors.border.subtle }}>
            <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.lg, color: colors.text.primary }}>Выберите агента</Text>
            <TouchableOpacity onPress={() => { setShowAgentPicker(false); }}><Feather name="x" size={20} color={colors.text.primary} /></TouchableOpacity>
          </View>
          <FlatList
            data={agents ?? []}
            keyExtractor={(a) => String(a.id)}
            contentContainerStyle={{ padding: 16, gap: 8 }}
            ListEmptyComponent={
              !agentsLoading ? (
                <View style={{ alignItems: "center", paddingVertical: 48, gap: 8 }}>
                  <Feather name="user" size={32} color={colors.text.tertiary} />
                  <Text style={{ fontFamily: Typography.fontMedium, fontSize: Typography.size.base, color: colors.text.secondary }}>Нет агентов</Text>
                  <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.sm, color: colors.text.tertiary }}>Добавьте агентов в систему</Text>
                </View>
              ) : null
            }
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
                  <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.base, color: colors.brand.primaryLight }}>
                    {agent.name[0]?.toUpperCase()}
                  </Text>
                </View>
                <Text style={{ flex: 1, fontFamily: Typography.fontMedium, fontSize: Typography.size.md, color: colors.text.primary }}>{agent.name}</Text>
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
        onCreated={(agentId?: number) => {
          setShowCreate(false);
          if (agentId) {
            setFilterAgentId(agentId);
            // Invalidate after state update to ensure query uses new filterAgentId
            setTimeout(() => {
              qc.invalidateQueries({ queryKey: ["supervisorPlans"] });
            }, 100);
          }
        }}
      />
    </View>
  );
}

// ── Agent view — own plans for today, simple list ────────────────────────────
function AgentPlansView() {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const qc = useQueryClient();
  const router = useRouter();
  const { user } = useAuthStore();
  const isMerchandiser = user?.role === "merchandiser";

  const { data: plans, isLoading, refetch } = useQuery({
    queryKey: ["agentPlans"],
    queryFn: () => getPlans(),
    refetchInterval: 60_000,
  });

  const updateMutation = useMutation({
    mutationFn: ({ planId, status }: { planId: number; status: Plan["status"] }) => updatePlanStatus(planId, status),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["agentPlans"] }); notify.success("Статус обновлён"); },
    onError: (e: Error) => notify.error(e.message ?? "Не удалось обновить статус"),
  });

  const photoMutation = useMutation({
    mutationFn: ({ planId, photoUrl }: { planId: number; photoUrl: string }) => saveVisitPhoto(planId, photoUrl),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["agentPlans"] }); notify.success("Фото отправлено, визит отмечен"); },
    onError: (e: Error) => notify.error(e.message ?? "Ошибка отправки фото"),
  });

  const handleTakePhoto = async (planId: number) => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Нет доступа", "Разрешите доступ к камере в настройках");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.7,
      base64: true,
    });
    if (!result.canceled && result.assets?.[0]?.base64) {
      try {
        const url = await uploadFile(`data:image/jpeg;base64,${result.assets[0].base64}`, "shops");
        photoMutation.mutate({ planId, photoUrl: url });
      } catch { notify.error("Ошибка загрузки фото"); }
    }
  };

  const handleVisitDone = (planId: number, planName: string, shopId?: number) => {
    if (isMerchandiser) {
      router.push({ pathname: "/merchandiser/visit", params: { planId: String(planId), shopId: String(shopId ?? ""), shopName: planName } });
      return;
    }
    Alert.alert(
      "Подтвердить визит",
      `Отметить "${planName}" как посещённый?`,
      [
        { text: "Отмена", style: "cancel" },
        { text: "Без фото", onPress: () => updateMutation.mutate({ planId, status: "visited" }) },
        { text: "С фото", onPress: () => handleTakePhoto(planId) },
      ]
    );
  };

  const visited = (plans ?? []).filter(p => p.status === "visited").length;
  const total = plans?.length ?? 0;
  const pct = total > 0 ? Math.round((visited / total) * 100) : 0;

  const today = new Date();
  const greeting = today.getHours() < 12 ? "Доброе утро" : today.getHours() < 18 ? "Добрый день" : "Добрый вечер";

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      <ScreenHeader
        title="Мои планы"
        subtitle={`${greeting} — ${today.toLocaleDateString("ru", { day: "numeric", month: "long" })}`}
      />

      {/* Progress */}
      {total > 0 && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10, marginHorizontal: 16 }}>
          <Text style={{ fontFamily: Typography.fontMono, fontSize: Typography.size.sm, color: colors.text.secondary }}>{visited}/{total}</Text>
          <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.bg.elevated, overflow: "hidden" }}>
            <View style={{ width: `${pct}%`, height: "100%", borderRadius: 3, backgroundColor: pct === 100 ? colors.accent.success : pct >= 60 ? colors.accent.warning : colors.accent.primary }} />
          </View>
          <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.sm, color: colors.text.primary }}>{pct}%</Text>
        </View>
      )}

      {/* Plans list */}
      <FlatList
        data={plans ?? []}
        keyExtractor={(p) => String(p.id)}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
        windowSize={11}
        maxToRenderPerBatch={10}
        removeClippedSubviews
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={refetch}
            tintColor={colors.accent.primary}
          />
        }
        ListEmptyComponent={
          !isLoading ? (
            <View style={{ alignItems: "center", paddingTop: 50, gap: 10 }}>
              <Feather name="calendar" size={32} color={colors.text.tertiary} />
              <Text style={{ fontFamily: Typography.fontMedium, fontSize: Typography.size.base, color: colors.text.secondary }}>Планов на сегодня нет</Text>
              <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.sm, color: colors.text.tertiary, textAlign: "center" }}>
                Супервайзер ещё не назначил маршрут
              </Text>
            </View>
          ) : null
        }
        renderItem={({ item: plan, index }) => (
          <Animated.View layout={Layout.springify().damping(20)}>
            <FadeInItem delay={index * 60}>
              <PlanCard
                plan={plan}
                dimmed={plan.status === "visited"}
                onVisit={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  handleVisitDone(plan.id, plan.shopName ?? "Магазин", plan.shopId);
                }}
                onSkip={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  updateMutation.mutate({ planId: plan.id, status: "skipped" });
                }}
                loading={updateMutation.isPending || photoMutation.isPending}
              />
            </FadeInItem>
          </Animated.View>
        )}
      />
    </View>
  );
}

// ── Main screen — role-based routing ──────────────────────────────────────────
export default function PlansScreen() {
  const { user } = useAuthStore();
  const isSupervisor = user?.role === "supervisor" || user?.role === "ceo" || user?.role === "operator";

  if (isSupervisor) {
    return <SupervisorPlansView />;
  }
  return <AgentPlansView />;
}
