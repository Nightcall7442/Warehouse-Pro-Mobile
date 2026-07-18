// Warehouse Pro — Orders (minimal with date sections)
import React, { useMemo, useCallback } from "react";
import { View, Text, FlatList, RefreshControl, TouchableOpacity, Alert } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { format, parseISO, isToday, isYesterday } from "date-fns";
import { ru } from "date-fns/locale";
import { Feather } from "@expo/vector-icons";
import { getMyOrders, deleteOrder, Order } from "../../src/api";
import { useThemeColors, useThemeStore } from "../../src/store/theme";
import { useAuthStore } from "../../src/store/auth";
import { Typography, Spacing, Radii } from "../../src/theme";
import { DarkShadowColor } from "../../src/theme";
import { notify } from "../../src/store/toast";
import { Shadows } from "../../src/theme";

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
  const { isDark } = useThemeStore();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();

  const { data: orders, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["myOrders"],
    queryFn: getMyOrders,
    retry: false, staleTime: 2 * 60 * 1000,
    enabled: user?.role === "agent" || user?.role === "ceo" || user?.role === "operator",
  });

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

  const handleDelete = useCallback((order: Order) => {
    Alert.alert("Удалить заказ?", `Заказ #${order.orderNumber}`, [
      { text: "Нет", style: "cancel" },
      { text: "Да", style: "destructive", onPress: async () => {
        try { await deleteOrder(order.id); notify.success("Удалён"); refetch(); }
        catch { notify.error("Не удалось удалить"); }
      }},
    ]);
  }, [refetch]);

  const sc = isDark ? DarkShadowColor : Shadows.sm.shadowColor;
  const orderCount = items.filter(i => i.type === "order").length;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      {/* Header */}
      <View style={{ paddingTop: insets.top + Spacing.sm, paddingHorizontal: Spacing.base, paddingBottom: Spacing.sm }}>
        <Text style={{ fontFamily: Typography.fontExtraBold, fontSize: Typography.size.xxl, color: colors.text.primary }}>Заказы</Text>
        <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.sm, color: colors.text.muted, marginTop: 2 }}>{orderCount} заказов</Text>
      </View>

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
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => router.push({ pathname: "/order/[id]", params: { id: String(order.id) } })}
              onLongPress={() => handleDelete(order)}
              style={{
                flexDirection: "row", alignItems: "center", gap: Spacing.md,
                backgroundColor: colors.bg.card, borderRadius: Radii.lg,
                padding: Spacing.base, marginBottom: Spacing.xs,
                borderWidth: 1, borderColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.5)",
                shadowColor: sc, shadowOffset: Shadows.xs.shadowOffset, shadowOpacity: Shadows.xs.shadowOpacity,
                shadowRadius: Shadows.xs.shadowRadius, elevation: Shadows.xs.elevation,
              }}>
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
            </TouchableOpacity>
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
          shadowColor: colors.accent.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6,
        }}>
        <Feather name="plus" size={26} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}
