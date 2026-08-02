// Warehouse Pro — Orders v2 (cold palette, ProgressRing donuts)
import React, { useEffect, useMemo, useState } from "react";
import { View, Text, FlatList, RefreshControl, TouchableOpacity, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { format, parseISO, isToday, isYesterday } from "date-fns";
import { ru } from "date-fns/locale";
import { Feather } from "@expo/vector-icons";
import { getMyOrders, Order } from "../../src/api";
import { useThemeColors } from "../../src/store/theme";
import { useAuthStore } from "../../src/store/auth";
import { useOfflineStore } from "../../src/store/offline";
import { Typography, Spacing, Radii, KpiColors } from "../../src/theme";

import { Card } from "../../src/components/ui";
import { ProgressRing, NeumorphicProgressBar } from "../../src/components/Charts";
import { FadeInItem, PressableScale } from "../../src/components/Animated";
import { LinearGradient } from "expo-linear-gradient";
import { Gradients } from "../../src/theme";

const BOTTOM_TAB_HEIGHT = 80;

type ListItem = { type: "header"; date: string; key: string } | { type: "order"; order: Order; key: string };

function dayLabel(dateStr: string): string {
  try {
    const d = parseISO(dateStr);
    if (isToday(d)) return "Сегодня";
    if (isYesterday(d)) return "Вчера";
    return format(d, "d MMMM", { locale: ru });
  } catch { return ""; }
}

function dayKey(dateStr: string): string {
  try { return format(parseISO(dateStr), "yyyy-MM-dd"); } catch { return "unknown"; }
}

export default function OrdersScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();
  const offline = useOfflineStore();
  const { orders: offlineOrders, deliveryActions, syncAll, retry, retryDeliveryAction, syncingOrders, syncingActions } = offline;

  const { data: orders, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["myOrders"],
    queryFn: getMyOrders,
    retry: false, staleTime: 2 * 60 * 1000,
    enabled: user?.role === "agent" || user?.role === "ceo" || user?.role === "operator",
  });
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const pendingOffline = useMemo(() => {
    return offlineOrders.filter(o => !o.synced);
  }, [offlineOrders]);

  const pendingActions = useMemo(() => {
    return deliveryActions.filter(a => !a.synced);
  }, [deliveryActions]);

  const queryClient = useQueryClient();
  useEffect(() => {
    const s = useOfflineStore.getState();
    if (s.orders.some(o => !o.synced)) {
      s.syncAll().then(({ synced }: { synced: number }) => {
        if (synced > 0) queryClient.invalidateQueries({ queryKey: ["myOrders"] });
      });
    }
  }, []);

  const items = useMemo<ListItem[]>(() => {
    const arr = Array.isArray(orders) ? orders : [];
    const sorted = [...arr].sort((a, b) => {
      try { return parseISO(b.createdAt).getTime() - parseISO(a.createdAt).getTime(); }
      catch { return 0; }
    });
    const result: ListItem[] = [];
    let lastKey = "";
    for (const order of sorted) {
      const key = dayKey(order.createdAt);
      if (key !== lastKey) {
        result.push({ type: "header", date: order.createdAt, key: `h-${key}` });
        lastKey = key;
      }
      result.push({ type: "order", order, key: `o-${order.id}` });
    }
    return result;
  }, [orders]);

  const stats = useMemo(() => {
    const arr = Array.isArray(orders) ? orders : [];
    const newCount = arr.filter(o => o.status === "new").length;
    const processingCount = arr.filter(o => o.status === "processing").length;
    const completedCount = arr.filter(o => o.status === "delivered" || o.status === "partial_return_kept").length;
    const cancelledCount = arr.filter(o => o.status === "cancelled").length;
    return { total: arr.length, newCount, processingCount, completedCount, cancelledCount };
  }, [orders]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      {/* Header — matches web Orders.tsx */}
      <View style={{ paddingTop: insets.top + Spacing.sm, paddingHorizontal: Spacing.base, paddingBottom: Spacing.sm }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <View>
            <Text style={{ fontFamily: Typography.fontExtraBold, fontSize: Typography.size.xxl, color: colors.text.primary }}>Заказы</Text>
            <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.sm, color: colors.text.muted, marginTop: 2 }}>
              {stats.total} заказов · {stats.newCount} новых
            </Text>
          </View>
          <PressableScale onPress={() => router.push("/order/new")} haptic="light">
            <LinearGradient colors={Gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: Radii.md }}>
              <Feather name="plus" size={14} color="#fff" />
              <Text style={{ fontSize: Typography.size.xs, fontFamily: Typography.fontBold, color: "#fff" }}>Новый</Text>
            </LinearGradient>
          </PressableScale>
        </View>
      </View>

      {/* Online sync banner — offline orders pending */}
      {pendingOffline.length > 0 && (
        <View style={{ marginHorizontal: Spacing.base, marginBottom: Spacing.sm }}>
          <Card style={{ backgroundColor: colors.status.warningDim, borderWidth: 1, borderColor: colors.status.warning, padding: Spacing.md }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: Spacing.sm }}>
              <Feather name="wifi-off" size={18} color={colors.status.warning} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: Typography.fontSemibold, fontSize: Typography.size.sm, color: colors.text.primary }}>
                  {pendingOffline.length} {pendingOffline.length === 1 ? "заказ" : "заказов"} не отправлен{pendingOffline.length === 1 ? "" : "ы"}
                </Text>
                {syncingOrders ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
                    <ActivityIndicator size="small" color={colors.accent.primary} />
                    <Text style={{ fontSize: Typography.size.xs, color: colors.text.secondary }}>Отправка...</Text>
                  </View>
                ) : (
                  <TouchableOpacity onPress={() => syncAll()} style={{ marginTop: 4 }}>
                    <Text style={{ fontSize: Typography.size.xs, color: colors.accent.primary, fontFamily: Typography.fontSemibold }}>
                      Нажмите для повторной отправки
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
              <Feather name="chevron-right" size={16} color={colors.text.muted} />
            </View>
            {/* Failed items with retry */}
            {pendingOffline.filter(o => o.status === "failed").map(o => (
              <TouchableOpacity
                key={o.id}
                onPress={async () => { setRetryingId(o.id); await retry(o.id); setRetryingId(null); }}
                disabled={retryingId === o.id}
                style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8, paddingLeft: 26, opacity: retryingId === o.id ? 0.6 : 1 }}
              >
                {retryingId === o.id ? (
                  <ActivityIndicator size="small" color={colors.accent.primary} />
                ) : (
                  <Feather name="alert-circle" size={14} color={colors.status.danger} />
                )}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: Typography.size.xs, color: colors.text.secondary }} numberOfLines={1}>
                    {o.shopName}
                  </Text>
                  {o.error && retryingId !== o.id ? (
                    <Text style={{ fontSize: 10, color: colors.status.danger, marginTop: 1 }} numberOfLines={2}>
                      {o.error}
                    </Text>
                  ) : null}
                </View>
                {retryingId === o.id ? (
                  <Text style={{ fontSize: Typography.size.xs, color: colors.accent.primary }}>Отправка...</Text>
                ) : (
                  <>
                    <Feather name="refresh-cw" size={14} color={colors.accent.primary} />
                    <Text style={{ fontSize: Typography.size.xs, color: colors.accent.primary }}>Повтор</Text>
                  </>
                )}
              </TouchableOpacity>
            ))}
          </Card>
        </View>
      )}

      {/* Online sync banner — delivery actions pending */}
      {pendingActions.length > 0 && (
        <View style={{ marginHorizontal: Spacing.base, marginBottom: Spacing.sm }}>
          <Card style={{ backgroundColor: colors.status.warningDim, borderWidth: 1, borderColor: colors.status.warning, padding: Spacing.md }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: Spacing.sm }}>
              <Feather name="truck" size={18} color={colors.status.warning} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: Typography.fontSemibold, fontSize: Typography.size.sm, color: colors.text.primary }}>
                  {pendingActions.length} {pendingActions.length === 1 ? "действие" : "действий"} ожидают отправки
                </Text>
                {syncingActions ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
                    <ActivityIndicator size="small" color={colors.accent.primary} />
                    <Text style={{ fontSize: Typography.size.xs, color: colors.text.secondary }}>Отправка...</Text>
                  </View>
                ) : (
                  <TouchableOpacity onPress={() => offline.syncDeliveryActions()} style={{ marginTop: 4 }}>
                    <Text style={{ fontSize: Typography.size.xs, color: colors.accent.primary, fontFamily: Typography.fontSemibold }}>
                      Нажмите для повторной отправки
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
            {pendingActions.filter(a => a.status === "failed").map(a => (
              <TouchableOpacity
                key={a.id}
                onPress={() => retryDeliveryAction(a.id)}
                style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8, paddingLeft: 26 }}
              >
                <Feather name="alert-circle" size={14} color={colors.status.danger} />
                <Text style={{ flex: 1, fontSize: Typography.size.xs, color: colors.text.secondary }} numberOfLines={1}>
                  {a.action.type === "markOutForDelivery" ? "Выезд" : a.action.type === "markDelivered" ? "Доставлен" : "Проблема"} #{a.action.orderId}
                </Text>
                <Feather name="refresh-cw" size={14} color={colors.accent.primary} />
                <Text style={{ fontSize: Typography.size.xs, color: colors.accent.primary }}>Повтор</Text>
              </TouchableOpacity>
            ))}
          </Card>
        </View>
      )}

      {/* KPI row — rings like Dashboard */}
      <FadeInItem delay={0}>
        <View style={{ flexDirection: "row", gap: Spacing.sm, paddingHorizontal: Spacing.base, marginBottom: Spacing.base }}>
          {isLoading ? (
            <>
              <View style={{ flex: 1 }}><View style={{ height: 120, borderRadius: Radii.xl, backgroundColor: colors.bg.elevated }} /></View>
              <View style={{ flex: 1 }}><View style={{ height: 120, borderRadius: Radii.xl, backgroundColor: colors.bg.elevated }} /></View>
              <View style={{ flex: 1 }}><View style={{ height: 120, borderRadius: Radii.xl, backgroundColor: colors.bg.elevated }} /></View>
            </>
          ) : (
            <>
              {/* Total ring */}
              <Card style={{ flex: 1, alignItems: "center", padding: Spacing.md }}>
                <ProgressRing value={stats.total > 0 ? 100 : 0} size={56} strokeWidth={6} color={KpiColors.blue} />
                <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.lg, color: colors.text.primary, marginTop: 6 }}>{stats.total}</Text>
                <Text style={{ fontFamily: Typography.fontMedium, fontSize: 8, color: colors.text.tertiary, letterSpacing: 0.5, textTransform: "uppercase" }}>Всего</Text>
              </Card>
              {/* New ring */}
              <Card style={{ flex: 1, alignItems: "center", padding: Spacing.md }}>
                <ProgressRing value={stats.total > 0 ? Math.round(stats.newCount / Math.max(stats.total, 1) * 100) : 0} size={56} strokeWidth={6} color={KpiColors.teal} />
                <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.lg, color: colors.text.primary, marginTop: 6 }}>{stats.newCount}</Text>
                <Text style={{ fontFamily: Typography.fontMedium, fontSize: 8, color: colors.text.tertiary, letterSpacing: 0.5, textTransform: "uppercase" }}>Новые</Text>
              </Card>
              {/* Completed ring */}
              <Card style={{ flex: 1, alignItems: "center", padding: Spacing.md }}>
                <ProgressRing value={stats.total > 0 ? Math.round(stats.completedCount / Math.max(stats.total, 1) * 100) : 0} size={56} strokeWidth={6} color={KpiColors.green} />
                <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.lg, color: colors.text.primary, marginTop: 6 }}>{stats.completedCount}</Text>
                <Text style={{ fontFamily: Typography.fontMedium, fontSize: 8, color: colors.text.tertiary, letterSpacing: 0.5, textTransform: "uppercase" }}>Выполнены</Text>
              </Card>
            </>
          )}
        </View>
      </FadeInItem>

      {/* Progress bar */}
      {stats.total > 0 && (
        <FadeInItem delay={40}>
          <View style={{ paddingHorizontal: Spacing.base, marginBottom: Spacing.base }}>
            <NeumorphicProgressBar value={stats.total > 0 ? Math.round(stats.completedCount / Math.max(stats.total, 1) * 100) : 0} height={6} color={KpiColors.green} />
          </View>
        </FadeInItem>
      )}

      {/* List */}
      <FlatList
        data={items}
        keyExtractor={item => item.key}
        contentContainerStyle={{ paddingHorizontal: Spacing.base, paddingBottom: insets.bottom + BOTTOM_TAB_HEIGHT + Spacing.lg }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.accent.primary} />}
        ListEmptyComponent={!isLoading ? (
          <View style={{ alignItems: "center", paddingTop: 100 }}>
            <View style={{ width: 64, height: 64, borderRadius: Radii.xl, backgroundColor: colors.bg.elevated, alignItems: "center", justifyContent: "center", marginBottom: Spacing.md }}>
              <Feather name="clipboard" size={28} color={colors.text.muted} />
            </View>
            <Text style={{ fontSize: Typography.size.base, fontFamily: Typography.fontSemibold, color: colors.text.secondary }}>Заказов пока нет</Text>
          </View>
        ) : null}
        renderItem={({ item }) => {
          if (item.type === "header") {
            return (
              <View style={{ paddingTop: Spacing.md, paddingBottom: Spacing.xs }}>
                <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.xs, color: colors.text.muted, letterSpacing: 0.5 }}>{dayLabel(item.date).toUpperCase()}</Text>
              </View>
            );
          }
          const order = item.order;
          const time = (() => { try { return format(parseISO(order.createdAt), "HH:mm", { locale: ru }); } catch { return ""; } })();
          return (
            <PressableScale
              onPress={() => router.push({ pathname: "/order/[id]", params: { id: String(order.id) } })}
              haptic="light"
              style={{ marginBottom: Spacing.xs }}
            >
              <Card>
                <View style={{ flexDirection: "row", alignItems: "center", gap: Spacing.md }}>
                  <View style={{ width: 36, height: 36, borderRadius: Radii.sm, backgroundColor: colors.brand.primaryDim, alignItems: "center", justifyContent: "center" }}>
                    <Feather name="clipboard" size={16} color={colors.accent.primary} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontSize: Typography.size.base, fontFamily: Typography.fontSemibold, color: colors.text.primary }} numberOfLines={1}>{order.orderNumber}</Text>
                    <Text style={{ fontSize: Typography.size.xs, color: colors.text.muted, marginTop: 2 }}>{time}</Text>
                  </View>
                  <Text style={{ fontSize: Typography.size.md, fontFamily: Typography.fontBold, color: colors.text.primary, fontVariant: ["tabular-nums"] }}>
                    {Number(order.total).toLocaleString("ru")}
                  </Text>
                  <Feather name="chevron-right" size={16} color={colors.text.muted} />
                </View>
              </Card>
            </PressableScale>
          );
        }}
      />

      {/* FAB */}
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => router.push("/order/new")}
        style={{
          position: "absolute", bottom: insets.bottom + BOTTOM_TAB_HEIGHT + Spacing.sm, right: Spacing.xl,
          width: 56, height: 56, borderRadius: 28, backgroundColor: colors.accent.primary,
          alignItems: "center", justifyContent: "center",
        }}>
        <Feather name="plus" size={26} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}