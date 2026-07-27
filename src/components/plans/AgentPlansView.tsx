import { useState } from "react";
import { View, Text, FlatList, Alert, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import {
  getPlans,
  updatePlanStatus,
  saveVisitPhoto,
  uploadFile,
  getOptimizedRoute,
  Plan,
} from "../../api";
import { notify } from "../../store/toast";
import { useThemeColors, useThemeStore } from "../../store/theme";
import { useAuthStore } from "../../store/auth";
import { Typography, Spacing, Radii } from "../../theme";
import { ScreenHeader, EmptyState, Card } from "../ui";
import { FadeInItem, PressableScale, ShimmerSkeleton } from "../Animated";
import { PlanRow } from "./PlanRow";

export function AgentPlansView() {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { isDark } = useThemeStore();
  const qc = useQueryClient();
  const router = useRouter();
  const { user } = useAuthStore();
  const isMerchandiser = user?.role === "merchandiser";

  const {
    data: plans,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["agentPlans"],
    queryFn: () => getPlans(),
    refetchInterval: 60_000,
  });

  const updateMutation = useMutation({
    mutationFn: ({ planId, status }: { planId: number; status: Plan["status"] }) =>
      updatePlanStatus(planId, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agentPlans"] });
      notify.success("Статус обновлён");
    },
    onError: (e: Error) => notify.error(e.message ?? "Не удалось обновить статус"),
  });

  const photoMutation = useMutation({
    mutationFn: ({ planId, photoUrl }: { planId: number; photoUrl: string }) =>
      saveVisitPhoto(planId, photoUrl),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agentPlans"] });
      notify.success("Фото отправлено, визит отмечен");
    },
    onError: (e: Error) => notify.error(e.message ?? "Ошибка отправки фото"),
  });

  // Route optimization
  const [optimizedPlanIds, setOptimizedPlanIds] = useState<number[] | null>(null);
  const [optimizing, setOptimizing] = useState(false);

  const handleOptimize = async () => {
    setOptimizing(true);
    try {
      const { coords } = await (await import("expo-location")).getCurrentPositionAsync({ accuracy: 1 });
      const result = await getOptimizedRoute(coords.latitude, coords.longitude);
      if (result.plans.length > 0) {
        setOptimizedPlanIds(result.plans.map(p => p.id));
        notify.success(`Маршрут оптимизирован (${result.totalStops} точек, ${result.totalDistance.toFixed(1)} км)`);
      }
    } catch {
      notify.error("Не удалось оптимизировать маршрут");
    } finally {
      setOptimizing(false);
    }
  };

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
      } catch {
        notify.error("Ошибка загрузки фото");
      }
    }
  };

  const handleVisitDone = (planId: number, planName: string, shopId?: number) => {
    if (isMerchandiser) {
      router.push({
        pathname: "/merchandiser/visit",
        params: { planId: String(planId), shopId: String(shopId ?? ""), shopName: planName },
      });
      return;
    }
    Alert.alert("Подтвердить визит", `Отметить "${planName}" как посещённый?`, [
      { text: "Отмена", style: "cancel" },
      { text: "Без фото", onPress: () => updateMutation.mutate({ planId, status: "visited" }) },
      { text: "С фото", onPress: () => handleTakePhoto(planId) },
    ]);
  };

  const visited = (plans ?? []).filter(p => p.status === "visited").length;
  const total = plans?.length ?? 0;
  const pct = total > 0 ? Math.round((visited / total) * 100) : 0;

  const today = new Date();
  const greeting =
    today.getHours() < 12 ? "Доброе утро" : today.getHours() < 18 ? "Добрый день" : "Добрый вечер";

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      <ScreenHeader
        title="Мои планы"
        subtitle={`${greeting} — ${today.toLocaleDateString("ru", { day: "numeric", month: "long" })}`}
      />

      {total > 0 && (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: Spacing.sm,
            marginTop: Spacing.md,
            marginHorizontal: Spacing.base,
          }}
        >
          <Text
            style={{
              fontFamily: Typography.fontMono,
              fontSize: Typography.size.sm,
              color: colors.text.secondary,
            }}
          >
            {visited}/{total}
          </Text>
          <View
            style={{
              flex: 1,
              height: 6,
              borderRadius: 3,
              backgroundColor: colors.bg.elevated,
              overflow: "hidden",
            }}
          >
            <View
              style={{
                width: `${pct}%`,
                height: "100%",
                borderRadius: 3,
                backgroundColor:
                  pct === 100
                    ? colors.accent.success
                    : pct >= 60
                      ? colors.accent.warning
                      : colors.accent.primary,
              }}
            />
          </View>
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

      {/* Route optimization button */}
      {!isLoading && plans && plans.length > 0 && (
        <PressableScale
          onPress={handleOptimize}
          haptic="light"
          disabled={optimizing}
        >
          <Card style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 14, marginBottom: Spacing.md, opacity: optimizing ? 0.6 : 1 }}>
            <View style={{ width: 40, height: 40, borderRadius: Radii.md, backgroundColor: colors.accent.primary + "15", alignItems: "center", justifyContent: "center" }}>
              {optimizing ? <Feather name="loader" size={18} color={colors.accent.primary} /> : <Feather name="navigation" size={18} color={colors.accent.primary} />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: Typography.fontSemibold, fontSize: Typography.size.sm, color: colors.text.primary }}>
                {optimizing ? "Оптимизация..." : optimizedPlanIds ? "Маршрут оптимизирован" : "Оптимизировать маршрут"}
              </Text>
              <Text style={{ fontSize: Typography.size.xs, color: colors.text.tertiary, marginTop: 2 }}>
                {optimizedPlanIds ? `${optimizedPlanIds.length} точек по порядку` : "Сортировка по близости"}
              </Text>
            </View>
            {!optimizing && <Feather name="check-circle" size={16} color={colors.status.success} />}
          </Card>
        </PressableScale>
      )}

      {isLoading ? (
        <View style={{ paddingTop: Spacing.lg, paddingHorizontal: Spacing.base, gap: Spacing.md }}>
          {[1, 2, 3, 4].map(i => (
            <ShimmerSkeleton key={i} height={110} radius={Radii.xxl} />
          ))}
        </View>
      ) : (
        <FlatList
          data={optimizedPlanIds
            ? [...(plans ?? [])].sort((a, b) => {
                const ai = optimizedPlanIds.indexOf(a.id);
                const bi = optimizedPlanIds.indexOf(b.id);
                if (ai === -1 && bi === -1) return 0;
                if (ai === -1) return 1;
                if (bi === -1) return -1;
                return ai - bi;
              })
            : plans ?? []}
          keyExtractor={p => String(p.id)}
          contentContainerStyle={{ padding: Spacing.base, paddingBottom: insets.bottom + 24 }}
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
              title="Планов на сегодня нет"
              description="Супервайзер ещё не назначил маршрут"
            />
          }
          renderItem={({ item: plan, index }) => (
            <FadeInItem delay={index * 30}>
              <PlanRow
                plan={plan}
                colors={colors}
                isDark={isDark}
                onPress={() => plan.shopId && router.push({ pathname: "/shop/[id]", params: { id: String(plan.shopId) } })}
                onVisit={() => handleVisitDone(plan.id, plan.shopName ?? "Магазин", plan.shopId)}
                onSkip={() => updateMutation.mutate({ planId: plan.id, status: "skipped" })}
                loading={updateMutation.isPending || photoMutation.isPending}
              />
            </FadeInItem>
          )}
        />
      )}
    </View>
  );
}
