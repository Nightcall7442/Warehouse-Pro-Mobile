// Warehouse Pro — Targets/Quotas tracking tab (supervisor only)
import { useState, useCallback } from "react";
import { View, Text, FlatList, RefreshControl, TextInput, KeyboardAvoidingView, Platform, ScrollView, Modal } from "react-native";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getSalesTargetSummary, getSalesTargets, createSalesTarget, getAgentsList } from "../../src/api";
import { useThemeColors, useThemeStore } from "../../src/store/theme";
import { Typography, Spacing, Radii } from "../../src/theme";
import { Card } from "../../src/components/ui";
import { ProgressRing, NeumorphicProgressBar } from "../../src/components/Charts";
import { FadeInItem, PressableScale, ShimmerSkeleton } from "../../src/components/Animated";
import { notify } from "../../src/store/toast";
import { LinearGradient } from "expo-linear-gradient";

export default function TargetsScreen() {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { isDark } = useThemeStore();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);

  const { data: summary, isLoading, refetch } = useQuery({
    queryKey: ["salesTargetSummary"],
    queryFn: getSalesTargetSummary,
  });

  const { data: targets } = useQuery({
    queryKey: ["salesTargets"],
    queryFn: () => getSalesTargets({ periodType: "monthly" }),
  });

  const currentMonth = new Date().toLocaleDateString("ru-RU", { month: "long", year: "numeric" });

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      {/* Header */}
      <LinearGradient colors={isDark ? ["#221f1c", "#1c1a17"] : [colors.brand.primary, colors.brand.primaryLight]}
        style={{ paddingTop: insets.top + 16, paddingBottom: 20, paddingHorizontal: Spacing.base }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <View>
            <Text style={{ fontFamily: Typography.fontBold, fontSize: 22, color: "#fff" }}>Нормы</Text>
            <Text style={{ fontFamily: Typography.fontRegular, fontSize: 13, color: "rgba(255,255,255,0.7)", marginTop: 4 }}>
              {currentMonth}
            </Text>
          </View>
          <PressableScale onPress={() => setShowCreate(true)} haptic="light">
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" }}>
              <Feather name="plus" size={20} color="#fff" />
            </View>
          </PressableScale>
        </View>
      </LinearGradient>

      <FlatList
        data={summary ?? []}
        keyExtractor={item => String(item.userId)}
        contentContainerStyle={{ paddingHorizontal: Spacing.base, paddingTop: Spacing.md, paddingBottom: insets.bottom + 100 }}
        ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={colors.accent.primary} />}
        ListHeaderComponent={
          summary && summary.length > 0 ? (
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: Spacing.md }}>
              <Text style={{ fontFamily: Typography.fontSemibold, fontSize: Typography.size.sm, color: colors.text.secondary }}>
                {summary.length} агентов
              </Text>
              <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.sm, color: colors.accent.primary }}>
                Итого: {summary.reduce((s, a) => s + Number(a.targetAmount), 0).toLocaleString("ru")} сум
              </Text>
            </View>
          ) : null
        }
        ListEmptyComponent={
          isLoading ? (
            <View style={{ gap: Spacing.md }}>
              {[1, 2, 3].map(i => <ShimmerSkeleton key={i} height={120} radius={Radii.xxl} />)}
            </View>
          ) : (
            <View style={{ alignItems: "center", paddingTop: 60, gap: 12 }}>
              <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.bg.elevated, alignItems: "center", justifyContent: "center" }}>
                <Feather name="target" size={28} color={colors.text.muted} />
              </View>
              <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.base, color: colors.text.primary }}>Нет норм</Text>
              <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.sm, color: colors.text.muted, textAlign: "center", paddingHorizontal: 40 }}>
                Нажмите + чтобы создать месячный план для агента
              </Text>
            </View>
          )
        }
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
                    <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.base, color: colors.text.primary }}>{item.userName}</Text>
                    <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.xs, color: colors.text.tertiary, marginTop: 2 }}>
                      План: {Number(item.targetAmount).toLocaleString("ru")} сум
                    </Text>
                  </View>
                  <View style={{ alignItems: "center" }}>
                    <ProgressRing value={revPct} size={56} strokeWidth={5} color={color} />
                    <Text style={{ fontFamily: Typography.fontBold, fontSize: 12, color, marginTop: 4 }}>{revPct}%</Text>
                  </View>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={{ fontFamily: Typography.fontMono, fontSize: 11, color: colors.text.secondary }}>
                    Факт: {Number(item.actualAmount).toLocaleString("ru")}
                  </Text>
                  <NeumorphicProgressBar value={revPct} height={6} color={color} style={{ flex: 1 }} />
                </View>
              </Card>
            </FadeInItem>
          );
        }}
      />

      {/* Create target modal */}
      <CreateTargetModal
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => {
          setShowCreate(false);
          qc.invalidateQueries({ queryKey: ["salesTargetSummary"] });
          qc.invalidateQueries({ queryKey: ["salesTargets"] });
        }}
      />
    </View>
  );
}

// ── Create Monthly Target Modal (proper keyboard handling) ──────────────────
function CreateTargetModal({ visible, onClose, onCreated }: {
  visible: boolean;
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

  const { data: agents = [] } = useQuery({
    queryKey: ["agentsList"],
    queryFn: getAgentsList,
    enabled: visible,
  });

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
      notify.success("План создан");
      onCreated();
      setAgentId(null);
      setTargetAmount("");
      setVisitTarget("");
    },
    onError: (e: Error) => notify.error(e.message),
  });

  const handleClose = () => {
    setAgentId(null);
    setTargetAmount("");
    setVisitTarget("");
    onClose();
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
          {/* Header */}
          <View style={{
            flexDirection: "row", alignItems: "center", justifyContent: "space-between",
            paddingHorizontal: Spacing.lg, paddingTop: insets.top + 16, paddingBottom: 16,
            borderBottomWidth: 1, borderBottomColor: colors.border.subtle,
          }}>
            <Text style={{ fontFamily: Typography.fontBold, fontSize: 20, color: colors.text.primary }}>Месячный план</Text>
            <PressableScale onPress={handleClose} haptic="light">
              <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.bg.elevated, alignItems: "center", justifyContent: "center" }}>
                <Feather name="x" size={16} color={colors.text.muted} />
              </View>
            </PressableScale>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: Spacing.lg }} keyboardShouldPersistTaps="handled">
            {/* Agent picker */}
            <Text style={{ fontFamily: Typography.fontSemibold, fontSize: 13, color: colors.text.secondary, marginBottom: 8 }}>Агент</Text>
            <PressableScale onPress={() => setShowAgentPicker(true)} haptic="light">
              <View style={{
                flexDirection: "row", alignItems: "center", gap: 12,
                backgroundColor: colors.bg.input, borderRadius: 12, borderWidth: 1,
                borderColor: agentId ? colors.accent.primary : colors.border.default, padding: 14, marginBottom: 20,
              }}>
                {selectedAgent ? (
                  <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.brand.primaryDim, alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ fontFamily: Typography.fontBold, fontSize: 14, color: colors.brand.primary }}>{selectedAgent.name.charAt(0)}</Text>
                  </View>
                ) : (
                  <Feather name="user" size={18} color={colors.text.muted} />
                )}
                <Text style={{ flex: 1, fontFamily: Typography.fontMedium, fontSize: 15, color: agentId ? colors.text.primary : colors.text.muted }}>
                  {selectedAgent?.name ?? "Выберите агента"}
                </Text>
                <Feather name="chevron-down" size={18} color={colors.text.muted} />
              </View>
            </PressableScale>

            {/* Target amount */}
            <Text style={{ fontFamily: Typography.fontSemibold, fontSize: 13, color: colors.text.secondary, marginBottom: 8 }}>Норма выручки (сум)</Text>
            <TextInput
              style={{
                backgroundColor: colors.bg.input, borderRadius: 12, borderWidth: 1,
                borderColor: colors.border.default, padding: 14, fontFamily: Typography.fontMedium,
                fontSize: 18, color: colors.text.primary, marginBottom: 20,
              }}
              placeholder="5 000 000" placeholderTextColor={colors.text.muted}
              value={targetAmount} onChangeText={setTargetAmount}
              keyboardType="numeric" returnKeyType="done"
            />

            {/* Visit target */}
            <Text style={{ fontFamily: Typography.fontSemibold, fontSize: 13, color: colors.text.secondary, marginBottom: 8 }}>Норма визитов (%)</Text>
            <TextInput
              style={{
                backgroundColor: colors.bg.input, borderRadius: 12, borderWidth: 1,
                borderColor: colors.border.default, padding: 14, fontFamily: Typography.fontMedium,
                fontSize: 18, color: colors.text.primary, marginBottom: 30,
              }}
              placeholder="80" placeholderTextColor={colors.text.muted}
              value={visitTarget} onChangeText={setVisitTarget}
              keyboardType="numeric" returnKeyType="done"
            />

            {/* Period info */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 30, padding: 12, backgroundColor: colors.bg.elevated, borderRadius: 12 }}>
              <Feather name="calendar" size={16} color={colors.text.muted} />
              <Text style={{ fontFamily: Typography.fontRegular, fontSize: 13, color: colors.text.tertiary }}>
                Период: {new Date(periodStart).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })} — {new Date(periodEnd).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" })}
              </Text>
            </View>

            {/* Submit */}
            <PressableScale
              onPress={() => {
                if (!agentId) { notify.error("Выберите агента"); return; }
                if (!targetAmount) { notify.error("Введите норму выручки"); return; }
                mutation.mutate();
              }}
              disabled={mutation.isPending}
              haptic="medium"
            >
              <LinearGradient colors={["#5b6d8a", "#7a8fa8"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={{ borderRadius: 12, paddingVertical: 16, alignItems: "center", opacity: mutation.isPending ? 0.7 : 1 }}>
                <Text style={{ fontFamily: Typography.fontBold, fontSize: 16, color: "#fff" }}>
                  {mutation.isPending ? "Создание..." : "Создать план"}
                </Text>
              </LinearGradient>
            </PressableScale>
          </ScrollView>

          {/* Agent picker modal */}
          <Modal visible={showAgentPicker} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowAgentPicker(false)}>
            <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
              <View style={{
                flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                paddingHorizontal: Spacing.lg, paddingTop: insets.top + 16, paddingBottom: 16,
                borderBottomWidth: 1, borderBottomColor: colors.border.subtle,
              }}>
                <Text style={{ fontFamily: Typography.fontBold, fontSize: 20, color: colors.text.primary }}>Выберите агента</Text>
                <PressableScale onPress={() => setShowAgentPicker(false)} haptic="light">
                  <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.bg.elevated, alignItems: "center", justifyContent: "center" }}>
                    <Feather name="x" size={16} color={colors.text.muted} />
                  </View>
                </PressableScale>
              </View>
              <FlatList
                data={agents}
                keyExtractor={a => String(a.id)}
                contentContainerStyle={{ paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: insets.bottom + 20 }}
                ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: colors.border.subtle }} />}
                renderItem={({ item: agent }) => (
                  <PressableScale onPress={() => { setAgentId(agent.id); setShowAgentPicker(false); }} haptic="light">
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14 }}>
                      <View style={{
                        width: 40, height: 40, borderRadius: 20,
                        backgroundColor: agentId === agent.id ? colors.accent.primary : colors.brand.primaryDim,
                        alignItems: "center", justifyContent: "center",
                      }}>
                        <Text style={{ fontFamily: Typography.fontBold, fontSize: 16, color: agentId === agent.id ? "#fff" : colors.brand.primary }}>
                          {agent.name.charAt(0)}
                        </Text>
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
