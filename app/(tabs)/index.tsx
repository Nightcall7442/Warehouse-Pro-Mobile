import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useAuthStore } from "../../src/store/auth";
import { useOfflineStore } from "../../src/store/offline";
import { notify } from "../../src/store/toast";
import { getAgentDashboard, getPlans, updatePlanStatus } from "../../src/api";
import { Card, SectionHeader, Skeleton, ProgressBar } from "../../src/components/ui";
import { Typography, Spacing, Radii, Gradients, ThemeColors } from "../../src/theme";
import { useThemeColors } from "../../src/store/theme";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type IconName = keyof typeof Feather.glyphMap;

function KpiCard({
  value, label, icon, accent, colors,
}: {
  value: string | number; label: string; icon: IconName; accent?: boolean; colors: ThemeColors;
}) {
  const s = makeStyles(colors);
  if (accent) {
    return (
      <LinearGradient colors={Gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[s.kpiCard, s.kpiCardAccent]}>
        <View style={s.kpiIconBoxAccent}>
          <Feather name={icon} size={16} color="#fff" />
        </View>
        <Text style={[s.kpiValue, s.kpiValueAccent]}>{value}</Text>
        <Text style={[s.kpiLabel, s.kpiLabelAccent]}>{label}</Text>
      </LinearGradient>
    );
  }
  return (
    <View style={s.kpiCard}>
      <View style={s.kpiIconBox}>
        <Feather name={icon} size={16} color={colors.brand.primaryLight} />
      </View>
      <Text style={s.kpiValue}>{value}</Text>
      <Text style={s.kpiLabel}>{label}</Text>
    </View>
  );
}

function PlanItem({ plan, onDone, colors }: { plan: any; onDone: () => void; colors: ThemeColors }) {
  const s = makeStyles(colors);
  const STATUS_META: Record<string, { icon: IconName; color: string; bg: string }> = {
    visited: { icon: "check", color: colors.status.success, bg: colors.status.successDim },
    skipped: { icon: "minus", color: colors.status.warning, bg: colors.status.warningDim },
    planned: { icon: "circle", color: colors.status.info, bg: colors.status.infoDim },
  };
  const cfg = STATUS_META[plan.status as string] ?? STATUS_META.planned;
  const hasDebt = Number(plan.shopDebt ?? 0) > 0;

  return (
    <View style={s.planItem}>
      <View style={[s.planDot, { backgroundColor: cfg.bg }]}>
        <Feather name={cfg.icon} size={14} color={cfg.color} />
      </View>
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={s.planName} numberOfLines={1}>{plan.shopName ?? "Магазин"}</Text>
        <Text style={s.planAddress} numberOfLines={1}>{plan.shopAddress ?? "Адрес не указан"}</Text>
      </View>
      <View style={{ alignItems: "flex-end", gap: 4 }}>
        {hasDebt && (
          <Text style={s.planDebt}>
            {Number(plan.shopDebt).toLocaleString("ru")} сум
          </Text>
        )}
        {plan.status === "planned" && (
          <TouchableOpacity style={s.doneBtn} onPress={onDone} activeOpacity={0.8}>
            <Feather name="check" size={12} color="#fff" />
            <Text style={s.doneBtnText}>Готово</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const s = makeStyles(colors);
  const { user } = useAuthStore();
  const { orders: offlineOrders, syncAll } = useOfflineStore();
  const qc = useQueryClient();

  const { data: kpis, isLoading: kpisLoading, isError: kpisError, refetch: refetchKpis } = useQuery({
    queryKey: ["agentDashboard"],
    queryFn: getAgentDashboard,
    retry: false,
  });

  const { data: plans, isLoading: plansLoading, refetch: refetchPlans } = useQuery({
    queryKey: ["plans"],
    queryFn: async () => {
      const result = await getPlans();
      return Array.isArray(result) ? result : [];
    },
    retry: false,
  });

  const updateMutation = useMutation({
    mutationFn: ({ planId, status }: { planId: number; status: any }) =>
      updatePlanStatus(planId, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["plans"] }),
  });

  const pendingOffline = offlineOrders.filter((o) => !o.synced).length;

  const todayVisited = plans?.filter((p) => p.status === "visited").length ?? 0;
  const todayTotal = plans?.length ?? 0;
  const progress = todayTotal > 0 ? todayVisited / todayTotal : 0;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Доброе утро" : hour < 18 ? "Добрый день" : "Добрый вечер";
  const firstName = user?.name?.split(" ")[0] ?? "Агент";

  const handleRefresh = async () => {
    await Promise.all([refetchKpis(), refetchPlans()]);
  };

  return (
    <ScrollView
      style={s.container}
      contentContainerStyle={[s.content, { paddingTop: insets.top + Spacing.base }]}
      refreshControl={
        <RefreshControl
          refreshing={false}
          onRefresh={handleRefresh}
          tintColor={colors.brand.primary}
        />
      }
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.greeting}>{greeting}, {firstName}</Text>
          <Text style={s.date}>
            {format(new Date(), "EEEE, d MMMM", { locale: ru })}
          </Text>
        </View>
        <LinearGradient colors={Gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.avatarCircle}>
          <Text style={s.avatarText}>{firstName[0]?.toUpperCase()}</Text>
        </LinearGradient>
      </View>

      {/* Offline banner */}
      {pendingOffline > 0 && (
        <TouchableOpacity
          style={s.offlineBanner}
          onPress={async () => {
            const result = await syncAll();
            if (result.failed > 0) {
              notify.error(
                result.synced > 0
                  ? `Отправлено ${result.synced}, не удалось отправить ${result.failed}`
                  : `Не удалось отправить ${result.failed} заказ(ов)`
              );
            } else if (result.synced > 0) {
              notify.success(`Отправлено ${result.synced} заказ(ов)`);
            }
          }}
          activeOpacity={0.8}
        >
          <Feather name="cloud-off" size={16} color={colors.status.warning} />
          <Text style={s.offlineBannerText}>
            {pendingOffline} заказ(ов) ожидают синхронизации. Нажмите для отправки.
          </Text>
          <Feather name="chevron-right" size={16} color={colors.status.warning} />
        </TouchableOpacity>
      )}

      {/* KPI row */}
      <View style={s.kpiRow}>
        {kpisLoading ? (
          <>
            <Skeleton height={92} style={{ flex: 1 }} radius={Radii.lg} />
            <Skeleton height={92} style={{ flex: 1 }} radius={Radii.lg} />
            <Skeleton height={92} style={{ flex: 1 }} radius={Radii.lg} />
          </>
        ) : kpisError ? (
          <TouchableOpacity
            onPress={() => refetchKpis()}
            style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 92, borderRadius: Radii.lg, backgroundColor: colors.status.dangerDim, borderWidth: 1, borderColor: colors.status.danger + "30" }}
          >
            <Feather name="wifi-off" size={16} color={colors.status.danger} />
            <Text style={{ fontFamily: Typography.fontMedium, fontSize: 13, color: colors.status.danger }}>
              Не удалось загрузить — нажмите для повтора
            </Text>
          </TouchableOpacity>
        ) : (
          <>
            <KpiCard value={kpis?.todayOrders ?? 0} label="Заказы" icon="shopping-cart" accent colors={colors} />
            <KpiCard
              value={(kpis?.todayRevenue ?? 0).toLocaleString("ru")}
              label="Выручка"
              icon="trending-up"
              colors={colors}
            />
            <KpiCard value={kpis?.assignedShops ?? 0} label="Магазины" icon="shopping-bag" colors={colors} />
          </>
        )}
      </View>

      {/* Progress bar */}
      <Card style={{ marginBottom: Spacing.base }}>
        <View style={s.progressHeader}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Feather name="map" size={14} color={colors.text.secondary} />
            <Text style={s.progressTitle}>ПЛАН ВИЗИТОВ СЕГОДНЯ</Text>
          </View>
          <Text style={s.progressCount}>{todayVisited} / {todayTotal}</Text>
        </View>
        <ProgressBar progress={progress} />
        <Text style={s.progressLabel}>
          {todayTotal > 0
            ? `${Math.round(progress * 100)}% выполнено`
            : "Визиты не запланированы"}
        </Text>
      </Card>

      {/* Quick actions */}
      <View style={s.actionsRow}>
        <TouchableOpacity
          style={{ flex: 1 }}
          onPress={() => router.push("/order/new")}
          activeOpacity={0.85}
        >
          <LinearGradient colors={Gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.actionBtn}>
            <View style={s.actionIconBoxLight}>
              <Feather name="plus" size={20} color="#fff" />
            </View>
            <Text style={s.actionBtnLabelAccent}>НОВЫЙ ЗАКАЗ</Text>
          </LinearGradient>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.actionBtn, s.actionBtnSecondary, { flex: 1 }]}
          onPress={() => router.push("/(tabs)/shops")}
          activeOpacity={0.85}
        >
          <View style={s.actionIconBox}>
            <Feather name="shopping-bag" size={20} color={colors.brand.primaryLight} />
          </View>
          <Text style={s.actionBtnLabel}>МОИ МАГАЗИНЫ</Text>
        </TouchableOpacity>
      </View>

      {/* Today's visits */}
      <SectionHeader title="Визиты сегодня" />
      <Card style={{ padding: 0, overflow: "hidden" }}>
        {plansLoading ? (
          <View style={{ padding: Spacing.base, gap: 10 }}>
            {[1, 2, 3].map((i) => <Skeleton key={i} height={56} />)}
          </View>
        ) : !plans?.length ? (
          <View style={s.emptyPlans}>
            <Feather name="calendar" size={28} color={colors.text.muted} />
            <Text style={s.emptyText}>Визиты не запланированы</Text>
          </View>
        ) : (
          plans.map((plan, idx) => (
            <View key={plan.id}>
              <PlanItem
                plan={plan}
                colors={colors}
                onDone={() => updateMutation.mutate({ planId: plan.id, status: "visited" })}
              />
              {idx < plans.length - 1 && <View style={s.itemDivider} />}
            </View>
          ))
        )}
      </Card>
    </ScrollView>
  );
}

function makeStyles(colors: ThemeColors) {
  return {
    container: { flex: 1, backgroundColor: colors.bg.primary } as const,
    content: { padding: Spacing.base, paddingBottom: 120 } as const,

    header: {
      flexDirection: "row" as const,
      justifyContent: "space-between" as const,
      alignItems: "center" as const,
      marginBottom: Spacing.lg,
    },
    greeting: {
      fontSize: Typography.size.xl,
      fontFamily: Typography.fontBold,
      color: colors.text.primary,
    },
    date: {
      fontSize: Typography.size.sm,
      fontFamily: Typography.fontBody,
      color: colors.text.secondary,
      marginTop: 2,
      textTransform: "capitalize" as const,
    },
    avatarCircle: {
      width: 46,
      height: 46,
      borderRadius: Radii.full,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      shadowColor: colors.brand.primary,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.4,
      shadowRadius: 12,
      elevation: 6,
    },
    avatarText: {
      fontSize: Typography.size.md,
      fontFamily: Typography.fontBold,
      color: "#fff",
    },

    offlineBanner: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      backgroundColor: colors.status.warningDim,
      borderRadius: Radii.md,
      borderWidth: 1,
      borderColor: "rgba(245,165,36,0.25)",
      padding: Spacing.md,
      marginBottom: Spacing.base,
      gap: 10,
    },
    offlineBannerText: {
      flex: 1,
      fontSize: Typography.size.sm,
      fontFamily: Typography.fontMedium,
      color: colors.status.warning,
      lineHeight: 18,
    },

    kpiRow: {
      flexDirection: "row" as const,
      gap: Spacing.sm,
      marginBottom: Spacing.base,
    },
    kpiCard: {
      flex: 1,
      backgroundColor: colors.bg.card,
      borderRadius: Radii.lg,
      borderWidth: 1,
      borderColor: colors.border.default,
      padding: Spacing.md,
    },
    kpiCardAccent: {
      borderWidth: 0,
      shadowColor: colors.brand.primary,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.35,
      shadowRadius: 16,
      elevation: 8,
    },
    kpiIconBox: {
      width: 28,
      height: 28,
      borderRadius: Radii.sm,
      backgroundColor: colors.brand.primaryDim,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      marginBottom: Spacing.sm,
    },
    kpiIconBoxAccent: {
      width: 28,
      height: 28,
      borderRadius: Radii.sm,
      backgroundColor: "rgba(255,255,255,0.18)",
      alignItems: "center" as const,
      justifyContent: "center" as const,
      marginBottom: Spacing.sm,
    },
    kpiValue: {
      fontSize: Typography.size.lg,
      fontFamily: Typography.fontDisplay,
      color: colors.text.primary,
      fontVariant: ["tabular-nums" as const],
    },
    kpiValueAccent: { color: "#fff" },
    kpiLabel: {
      fontSize: 10,
      fontFamily: Typography.fontSemibold,
      color: colors.text.muted,
      marginTop: 2,
      letterSpacing: 0.8,
      textTransform: "uppercase" as const,
    },
    kpiLabelAccent: { color: "rgba(255,255,255,0.85)" },

    progressHeader: {
      flexDirection: "row" as const,
      justifyContent: "space-between" as const,
      alignItems: "center" as const,
      marginBottom: Spacing.sm,
    },
    progressTitle: {
      fontSize: Typography.size.xs,
      fontFamily: Typography.fontBold,
      color: colors.text.secondary,
      letterSpacing: 1,
    },
    progressCount: {
      fontSize: Typography.size.sm,
      fontFamily: Typography.fontBold,
      color: colors.text.primary,
      fontVariant: ["tabular-nums" as const],
    },
    progressLabel: {
      fontSize: Typography.size.xs,
      color: colors.text.muted,
      marginTop: 8,
    },

    actionsRow: {
      flexDirection: "row" as const,
      gap: Spacing.sm,
      marginBottom: Spacing.base,
    },
    actionBtn: {
      alignItems: "center" as const,
      justifyContent: "center" as const,
      paddingVertical: Spacing.lg,
      borderRadius: Radii.lg,
      gap: 8,
      borderWidth: 1,
      borderColor: "transparent",
    },
    actionBtnSecondary: {
      backgroundColor: colors.bg.card,
      borderColor: colors.border.default,
    },
    actionIconBox: {
      width: 36,
      height: 36,
      borderRadius: Radii.md,
      backgroundColor: colors.brand.primaryDim,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
    actionIconBoxLight: {
      width: 36,
      height: 36,
      borderRadius: Radii.md,
      backgroundColor: "rgba(255,255,255,0.18)",
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
    actionBtnLabel: {
      fontSize: Typography.size.xs,
      fontFamily: Typography.fontBold,
      color: colors.text.primary,
      letterSpacing: 1,
    },
    actionBtnLabelAccent: {
      fontSize: Typography.size.xs,
      fontFamily: Typography.fontBold,
      color: "#fff",
      letterSpacing: 1,
    },

    planItem: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      padding: Spacing.base,
    },
    planDot: {
      width: 36,
      height: 36,
      borderRadius: Radii.full,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      flexShrink: 0,
    },
    planName: {
      fontSize: Typography.size.sm,
      fontFamily: Typography.fontSemibold,
      color: colors.text.primary,
    },
    planAddress: {
      fontSize: Typography.size.xs,
      color: colors.text.muted,
      marginTop: 2,
    },
    planDebt: {
      fontSize: Typography.size.xs,
      fontFamily: Typography.fontSemibold,
      color: colors.status.danger,
    },
    doneBtn: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 4,
      backgroundColor: colors.brand.primary,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: Radii.md,
    },
    doneBtnText: {
      fontSize: Typography.size.xs,
      color: "#fff",
      fontFamily: Typography.fontSemibold,
    },
    itemDivider: {
      height: 1,
      backgroundColor: colors.border.subtle,
      marginLeft: Spacing.base + 36 + 12,
    },
    emptyPlans: {
      padding: Spacing.xl,
      alignItems: "center" as const,
      gap: 8,
    },
    emptyText: {
      fontSize: Typography.size.sm,
      color: colors.text.muted,
    },
  };
}
