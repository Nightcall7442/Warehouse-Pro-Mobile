import { useState, useMemo, useCallback } from "react";
import { View, Text, FlatList, SectionList, RefreshControl, TextInput, KeyboardAvoidingView, Platform, ScrollView, Modal } from "react-native";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useFocusEffect, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getPlans, getAgentsList, createSalesTarget, Plan } from "../../api";
import { useThemeColors, useThemeStore } from "../../store/theme";
import { Typography, Spacing, Radii, Gradients, BOTTOM_TAB_HEIGHT, soft } from "../../theme";
import { ScreenHeader, EmptyState } from "../ui";
import { ErrorState } from "../QueryState";
import { NeumorphicProgressBar } from "../Charts";
import { FadeInItem, PressableScale, ShimmerSkeleton } from "../Animated";
import { fmtDate } from "./PlanHelpers";
import { PlanRow } from "./PlanRow";
import { DateNav } from "./DateNav";
import { CreatePlanModal } from "./CreatePlanModal";
import { BottomSheet, SelectRow } from "./PlanHelpers";
import { notify } from "../../store/toast";
import { errorText } from "../../lib/error-text";
import { LinearGradient } from "expo-linear-gradient";
import { useCurrencySymbol } from "../../store/branding";
import { useT, useLang } from "../../i18n";

export function SupervisorPlansView() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colors = useThemeColors();
  const { isDark } = useThemeStore();
  const qc = useQueryClient();
  const [date, setDate] = useState(new Date());
  const [filterAgentId, setFilterAgentId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showCreateTarget, setShowCreateTarget] = useState(false);
  const [showAgentPicker, setShowAgentPicker] = useState(false);
  const t = useT();

  const dateStr = fmtDate(date);
  const isToday = dateStr === fmtDate(new Date());

  const { data: agents, isLoading: agentsLoading, isError: agentsError } = useQuery({ queryKey: ["agentsList"], queryFn: getAgentsList });
  const selectedAgent = agents?.find(a => a.id === filterAgentId);

  /*
    Опрос раз в минуту — ТОЛЬКО на открытом экране.

    Стоял без этого условия, и вкладки expo-router не размонтируются: экран
    планов, однажды открытый, продолжал ходить на сервер раз в минуту, пока
    приложение вообще запущено. У супервайзера, свернувшего приложение утром,
    это несколько сотен запросов за день — то есть радио телефона будится
    ровно столько же раз, и всё ради данных, на которые никто не смотрит.

    Соседний экран агента так и сделан; здесь условия просто не было.
  */
  const [screenFocused, setScreenFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setScreenFocused(true);
      return () => setScreenFocused(false);
    }, []),
  );

  const { data: plans, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["supervisorPlans", dateStr, filterAgentId],
    queryFn: () => getPlans(filterAgentId ?? undefined, dateStr),
    refetchInterval: screenFocused ? 60_000 : false,
    // Вернулись на экран — данные помечаются устаревшими сразу, не дожидаясь
    // ближайшего тика опроса.
    refetchOnMount: "always",
  });

  // Свой признак «тянут вручную»: запрос повторяется сам раз в минуту, и на
  // isFetching кружок обновления выскакивал бы каждую минуту без касания. На
  // isLoading, как было, он гас мгновенно — обновление выглядело сломанным.
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = async () => {
    setRefreshing(true);
    try { await refetch(); } finally { setRefreshing(false); }
  };

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

  const visited = (plans ?? []).filter(p => p.status === "visited").length;
  const total = plans?.length ?? 0;
  const pct = total > 0 ? Math.round((visited / total) * 100) : 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      <ScreenHeader
        title={t("Планы", "Rejalar")}
        right={
          <View style={{ flexDirection: "row", gap: 8 }}>
            {/* Нормы и визиты: экран норм ушёл из панели вкладок — дверь сюда. */}
            <PressableScale onPress={() => router.push("/(tabs)/targets")} haptic="light">
              <View style={{ backgroundColor: colors.bg.elevated, borderRadius: Radii.full, width: 36, height: 36, alignItems: "center", justifyContent: "center", ...soft(isDark).raisedSm }}>
                <Feather name="trending-up" size={18} color={colors.text.primary} />
              </View>
            </PressableScale>
            <PressableScale onPress={() => setShowCreateTarget(true)} haptic="light">
              <View style={{ backgroundColor: colors.accent.warning, borderRadius: Radii.full, width: 36, height: 36, alignItems: "center", justifyContent: "center" }}>
                <Feather name="target" size={18} color="#fff" />
              </View>
            </PressableScale>
            <PressableScale onPress={() => setShowCreate(true)} haptic="light">
              <View style={{ backgroundColor: colors.accent.primary, borderRadius: Radii.full, width: 36, height: 36, alignItems: "center", justifyContent: "center" }}>
                <Feather name="plus" size={20} color={colors.brand.ink} />
              </View>
            </PressableScale>
          </View>
        }
      />

      <View style={{ paddingHorizontal: Spacing.base, paddingTop: Spacing.md, gap: Spacing.sm }}>
        <DateNav date={date} isToday={isToday} colors={colors}
          onPrev={() => setDate(d => new Date(d.getTime() - 86_400_000))}
          onNext={() => setDate(d => new Date(d.getTime() + 86_400_000))} />

        <PressableScale onPress={() => setShowAgentPicker(true)} haptic="selection">
          <View style={{ flexDirection: "row", alignItems: "center", gap: Spacing.sm, backgroundColor: colors.bg.card, borderRadius: Radii.md, ...(filterAgentId ? soft(isDark).raisedSm : soft(isDark).inset), padding: 10 }}>
            <Feather name="user" size={15} color={filterAgentId ? colors.accent.primary : colors.text.muted} />
            <Text style={{ flex: 1, fontFamily: Typography.fontMedium, fontSize: Typography.size.sm, color: filterAgentId ? colors.text.primary : colors.text.muted }}>{selectedAgent?.name ?? t("Все агенты", "Barcha agentlar")}</Text>
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
        <SectionList sections={groupedPlans} keyExtractor={item => String(item.id)}
          contentContainerStyle={{ paddingHorizontal: Spacing.base, paddingTop: Spacing.lg, paddingBottom: insets.bottom + 100 }}
          stickySectionHeadersEnabled ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.accent.primary} />}
          renderSectionHeader={({ section }) => (
            <View style={{ backgroundColor: colors.bg.primary, paddingVertical: Spacing.sm }}>
              <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.sm, color: colors.accent.primary, textTransform: "uppercase", letterSpacing: 0.5 }}>{section.title} · {section.data.length}</Text>
            </View>
          )}
          renderItem={({ item: plan, index }) => (
            <FadeInItem delay={index * 30}><PlanRow plan={plan} showCity colors={colors} isDark={isDark} /></FadeInItem>
          )}
          ListEmptyComponent={<EmptyState icon="calendar" title={t("На этот день планов нет", "Bu kun uchun reja yo'q")} />}
        />
      ) : (
        <FlatList data={plans ?? []} keyExtractor={p => String(p.id)}
          contentContainerStyle={{ paddingHorizontal: Spacing.base, paddingTop: Spacing.lg, paddingBottom: insets.bottom + 100 }}
          ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.accent.primary} />}
          ListEmptyComponent={
            // «Нажмите "+", чтобы назначить маршрут» при отказе связи — совет
            // делать заново то, что уже сделано: планы на день есть, просто не
            // доехали. Отказ должен называться отказом.
            isError ? (
              <ErrorState
                what={t("планы", "rejalarni")}
                error={error}
                description={t("Это сбой связи, а не пустой день. Проверьте подключение и попробуйте снова.", "Bu aloqa xatosi, bo'sh kun emas. Ulanishni tekshirib, qayta urinib ko'ring.")}
                onRetry={() => { void refetch(); }}
                retrying={refreshing}
              />
            ) : (
              <EmptyState icon="calendar" title={t("На этот день планов нет", "Bu kun uchun reja yo'q")} description={t("Нажмите «+», чтобы назначить маршрут", "Yo'nalish berish uchun «+» bosing")} />
            )
          }
          renderItem={({ item: plan, index }) => (
            <FadeInItem delay={index * 30}><PlanRow plan={plan} showAgent={!filterAgentId} showCity colors={colors} isDark={isDark} /></FadeInItem>
          )}
        />
      )}

      <BottomSheet visible={showAgentPicker} onClose={() => setShowAgentPicker(false)} title={t("Выберите агента", "Agent tanlang")} colors={colors}>
        <FlatList data={agents ?? []} keyExtractor={a => String(a.id)}
          contentContainerStyle={{ paddingHorizontal: Spacing.base, paddingBottom: insets.bottom + Spacing.lg }}
          ListHeaderComponent={<SelectRow label={t("Все агенты", "Barcha agentlar")} icon="users" selected={!filterAgentId} colors={colors} isDark={isDark} onPress={() => { setFilterAgentId(null); setShowAgentPicker(false); }} />}
          ListEmptyComponent={
            // «Нет агентов» — утверждение о штате. При отказе список тоже
            // пуст, и супервайзер решал бы, что агентов ему не завели.
            agentsError ? <EmptyState icon="alert-circle" title={t("Не удалось загрузить агентов", "Agentlarni yuklab bo'lmadi")} description={t("Закройте список и откройте снова.", "Ro'yxatni yopib, qayta oching.")} />
            : !agentsLoading ? <EmptyState icon="user" title={t("Нет агентов", "Agentlar yo'q")} />
            : null
          }
          renderItem={({ item: agent }) => (
            <SelectRow label={agent.name} icon="user" selected={filterAgentId === agent.id} colors={colors} isDark={isDark} onPress={() => { setFilterAgentId(agent.id); setShowAgentPicker(false); }} />
          )}
        />
      </BottomSheet>

      <CreatePlanModal visible={showCreate} date={dateStr} onClose={() => setShowCreate(false)}
        onCreated={(agentId?: number) => { setShowCreate(false); if (agentId) { setFilterAgentId(agentId); setTimeout(() => qc.invalidateQueries({ queryKey: ["supervisorPlans"] }), 100); } }} />

      <CreateTargetModal visible={showCreateTarget} agents={agents ?? []} onClose={() => setShowCreateTarget(false)}
        onCreated={() => { setShowCreateTarget(false); qc.invalidateQueries({ queryKey: ["salesTargetSummary"] }); }} />
    </View>
  );
}

// ── Create Monthly Target Modal ─────────────────────────────────────────────
function CreateTargetModal({ visible, agents, onClose, onCreated }: {
  visible: boolean; agents: Array<{ id: number; name: string }>; onClose: () => void; onCreated: () => void;
}) {
  const colors = useThemeColors();
  const { isDark } = useThemeStore();
  const currencySymbol = useCurrencySymbol();
  const insets = useSafeAreaInsets();
  const [agentId, setAgentId] = useState<number | null>(null);
  const [targetAmount, setTargetAmount] = useState("");
  const [visitTarget, setVisitTarget] = useState("");
  const [showAgentPicker, setShowAgentPicker] = useState(false);
  const t = useT();
  const lang = useLang();

  const selectedAgent = agents.find(a => a.id === agentId);
  const now = new Date();
  const periodStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const periodEnd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${lastDay}`;

  const mutation = useMutation({
    mutationFn: () => createSalesTarget({ userId: agentId!, periodType: "monthly", periodStart, periodEnd, targetAmount: Number(targetAmount.replace(/\s/g, "")), visitTarget: visitTarget ? Number(visitTarget) : undefined }),
    onSuccess: () => { notify.success(t("Норма создана", "Norma yaratildi")); onCreated(); setAgentId(null); setTargetAmount(""); setVisitTarget(""); },
    // e.message — это текст axios: супервайзер, у которого в кабинете моргнул
    // интернет, читал «Network Error» вместо «нет связи». Слова самого сервера
    // errorText пропускает как есть — они русские и по делу.
    onError: (e: Error) => notify.error(errorText(e)),
  });

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: insets.top + 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: colors.border.subtle }}>
            <Text style={{ fontFamily: Typography.fontBold, fontSize: 20, color: colors.text.primary }}>{t("Месячная норма", "Oylik norma")}</Text>
            <PressableScale onPress={onClose} haptic="light">
              <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.bg.elevated, alignItems: "center", justifyContent: "center" }}><Feather name="x" size={16} color={colors.text.muted} /></View>
            </PressableScale>
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
            <Text style={{ fontFamily: Typography.fontSemibold, fontSize: 13, color: colors.text.secondary, marginBottom: 8 }}>{t("Агент", "Agent")}</Text>
            <PressableScale onPress={() => setShowAgentPicker(true)} haptic="light">
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.bg.input, borderRadius: 12, ...(agentId ? soft(isDark).raisedSm : soft(isDark).inset), padding: 14, marginBottom: 20 }}>
                {selectedAgent ? <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.brand.primaryDim, alignItems: "center", justifyContent: "center" }}><Text style={{ fontFamily: Typography.fontBold, fontSize: 14, color: colors.brand.primary }}>{selectedAgent.name.charAt(0)}</Text></View> : <Feather name="user" size={18} color={colors.text.muted} />}
                <Text style={{ flex: 1, fontFamily: Typography.fontMedium, fontSize: 15, color: agentId ? colors.text.primary : colors.text.muted }}>{selectedAgent?.name ?? t("Выберите агента", "Agent tanlang")}</Text>
                <Feather name="chevron-down" size={18} color={colors.text.muted} />
              </View>
            </PressableScale>
            <Text style={{ fontFamily: Typography.fontSemibold, fontSize: 13, color: colors.text.secondary, marginBottom: 8 }}>{t("Норма выручки", "Tushum normasi")} ({currencySymbol})</Text>
            <TextInput style={{ backgroundColor: colors.bg.input, borderRadius: 12, ...soft(isDark).inset, padding: 14, fontFamily: Typography.fontMedium, fontSize: 18, color: colors.text.primary, marginBottom: 20 }}
              placeholder="5 000 000" placeholderTextColor={colors.text.muted} value={targetAmount} onChangeText={setTargetAmount} keyboardType="numeric" returnKeyType="done" />
            <Text style={{ fontFamily: Typography.fontSemibold, fontSize: 13, color: colors.text.secondary, marginBottom: 8 }}>{t("Норма визитов", "Tashrif normasi")} (%)</Text>
            <TextInput style={{ backgroundColor: colors.bg.input, borderRadius: 12, ...soft(isDark).inset, padding: 14, fontFamily: Typography.fontMedium, fontSize: 18, color: colors.text.primary, marginBottom: 24 }}
              placeholder="80" placeholderTextColor={colors.text.muted} value={visitTarget} onChangeText={setVisitTarget} keyboardType="numeric" returnKeyType="done" />
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 24, padding: 12, backgroundColor: colors.bg.elevated, borderRadius: 12 }}>
              <Feather name="calendar" size={16} color={colors.text.muted} />
              <Text style={{ fontFamily: Typography.fontRegular, fontSize: 13, color: colors.text.tertiary }}>{new Date(periodStart).toLocaleDateString(lang === "uz" ? "uz-Latn-UZ" : "ru-RU", { day: "numeric", month: "short" })} — {new Date(periodEnd).toLocaleDateString(lang === "uz" ? "uz-Latn-UZ" : "ru-RU", { day: "numeric", month: "short" })}</Text>
            </View>
            <PressableScale onPress={() => { if (!agentId) { notify.error(t("Выберите агента", "Agent tanlang")); return; } if (!targetAmount) { notify.error(t("Введите норму", "Normani kiriting")); return; } mutation.mutate(); }} disabled={mutation.isPending} haptic="medium">
              <LinearGradient colors={Gradients.primary} style={{ borderRadius: 12, paddingVertical: 16, alignItems: "center", opacity: mutation.isPending ? 0.7 : 1 }}>
                <Text style={{ fontFamily: Typography.fontBold, fontSize: 16, color: colors.brand.ink }}>{mutation.isPending ? t("Создание...", "Yaratilmoqda...") : t("Создать норму", "Norma yaratish")}</Text>
              </LinearGradient>
            </PressableScale>
          </ScrollView>
          <Modal visible={showAgentPicker} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowAgentPicker(false)}>
            <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: insets.top + 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: colors.border.subtle }}>
                <Text style={{ fontFamily: Typography.fontBold, fontSize: 20, color: colors.text.primary }}>{t("Выберите агента", "Agent tanlang")}</Text>
                <PressableScale onPress={() => setShowAgentPicker(false)} haptic="light">
                  <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.bg.elevated, alignItems: "center", justifyContent: "center" }}><Feather name="x" size={16} color={colors.text.muted} /></View>
                </PressableScale>
              </View>
              <FlatList data={agents} keyExtractor={a => String(a.id)} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: insets.bottom + BOTTOM_TAB_HEIGHT }}
                ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: colors.border.subtle }} />}
                renderItem={({ item: agent }) => (
                  <PressableScale onPress={() => { setAgentId(agent.id); setShowAgentPicker(false); }} haptic="light">
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14 }}>
                      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: agentId === agent.id ? colors.accent.primary : colors.brand.primaryDim, alignItems: "center", justifyContent: "center" }}>
                        {/* Кружок выбранного агента залит фирменным цветом —
                            буква берёт чернила по его яркости. */}
                        <Text style={{ fontFamily: Typography.fontBold, fontSize: 16, color: agentId === agent.id ? colors.brand.ink : colors.brand.primary }}>{agent.name.charAt(0)}</Text>
                      </View>
                      <Text style={{ flex: 1, fontFamily: Typography.fontMedium, fontSize: 15, color: colors.text.primary }}>{agent.name}</Text>
                      {agentId === agent.id && <Feather name="check" size={20} color={colors.accent.primary} />}
                    </View>
                  </PressableScale>
                )}
              />
            </View>
          </Modal>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
