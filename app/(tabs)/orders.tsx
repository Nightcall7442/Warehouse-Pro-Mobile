import { useMemo, useState } from "react";
import {
  View,
  Text,
  SectionList,
  TouchableOpacity,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO, isToday, isYesterday } from "date-fns";
import { ru } from "date-fns/locale";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { getMyOrders, Order } from "../../src/api";
import { useOfflineStore } from "../../src/store/offline";
import { notify } from "../../src/store/toast";
import { Card, Badge, EmptyState, Skeleton, IconCircle } from "../../src/components/ui";
import { Typography, Spacing, Radii, Gradients, ThemeColors } from "../../src/theme";
import { useThemeColors } from "../../src/store/theme";

type IconName = keyof typeof Feather.glyphMap;

const STATUS_CONFIG: Record<string, { label: string; variant: "info" | "warning" | "success" | "danger"; icon: IconName }> = {
  new: { label: "Новый", variant: "info", icon: "circle" },
  processing: { label: "В обработке", variant: "warning", icon: "loader" },
  completed: { label: "Выполнен", variant: "success", icon: "check-circle" },
  cancelled: { label: "Отменён", variant: "danger", icon: "x-circle" },
};

// ── Group orders into day sections, newest day first ───────────────────────────
function dayLabel(dateStr: string): string {
  try {
    const d = parseISO(dateStr);
    if (isToday(d)) return "Сегодня";
    if (isYesterday(d)) return "Вчера";
    return format(d, "d MMMM, EEEE", { locale: ru });
  } catch {
    return "Без даты";
  }
}

function dayKey(dateStr: string): string {
  try { return format(parseISO(dateStr), "yyyy-MM-dd"); }
  catch { return "unknown"; }
}

function groupByDay<T extends { createdAt: string }>(items: T[]) {
  const map = new Map<string, { key: string; label: string; data: T[] }>();
  for (const item of items) {
    const key = dayKey(item.createdAt);
    if (!map.has(key)) map.set(key, { key, label: dayLabel(item.createdAt), data: [] });
    map.get(key)!.data.push(item);
  }
  // Newest day first; days are already populated from a newest-first input list,
  // but Map preserves insertion order, so sort explicitly to be safe.
  return Array.from(map.values()).sort((a, b) => (a.key < b.key ? 1 : a.key > b.key ? -1 : 0));
}

function OrderCard({ order, onPress, colors }: { order: Order; onPress: () => void; colors: ThemeColors }) {
  const s = makeStyles(colors);
  const cfg = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.new;
  const time = (() => {
    try { return format(parseISO(order.createdAt), "HH:mm", { locale: ru }); }
    catch { return ""; }
  })();

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      <Card style={s.orderCard}>
        <View style={s.orderRow}>
          <View style={s.orderNumRow}>
            <IconCircle name="file-text" size={16} variant="brand" />
            <View>
              <Text style={s.orderNum}>#{order.orderNumber}</Text>
              <Text style={s.orderShop} numberOfLines={1}>{order.shopName ?? "Магазин"}</Text>
            </View>
          </View>
          <Badge variant={cfg.variant} icon={cfg.icon}>{cfg.label}</Badge>
        </View>
        <View style={s.orderFooter}>
          <View style={s.orderFooterItem}>
            <Feather name="clock" size={12} color={colors.text.muted} />
            <Text style={s.orderDate}>{time}</Text>
          </View>
          <Text style={s.orderTotal}>
            {Number(order.total).toLocaleString("ru")} сум
          </Text>
        </View>
      </Card>
    </TouchableOpacity>
  );
}

function OfflineOrderCard({ order, colors }: { order: any; colors: ThemeColors }) {
  const s = makeStyles(colors);
  return (
    <Card style={[s.orderCard, s.offlineCard]}>
      <View style={s.orderRow}>
        <View style={s.orderNumRow}>
          <IconCircle name="cloud-off" size={16} variant="warning" />
          <View>
            <Text style={s.offlineIndicatorText}>ОЖИДАЕТ ОТПРАВКИ</Text>
            <Text style={s.orderShop} numberOfLines={1}>{order.shopName}</Text>
          </View>
        </View>
        <Badge variant="warning" icon="upload-cloud">Локально</Badge>
      </View>
      <View style={s.orderFooter}>
        <View style={s.orderFooterItem}>
          <Feather name="clock" size={12} color={colors.text.muted} />
          <Text style={s.orderDate}>
            {format(parseISO(order.createdAt), "HH:mm", { locale: ru })}
          </Text>
        </View>
        <Text style={s.itemCount}>{order.input.items.length} позиций</Text>
      </View>
    </Card>
  );
}

export default function OrdersScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const s = makeStyles(colors);
  const { orders: offlineOrders, syncAll } = useOfflineStore();
  const [syncing, setSyncing] = useState(false);

  const { data: orders, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["myOrders"],
    queryFn: getMyOrders,
    retry: false,
  });

  const pendingOffline = offlineOrders.filter((o) => !o.synced);

  // Offline (unsent) orders always show first, grouped on top regardless of date,
  // so the agent never loses track of what still needs to sync. Server orders
  // are grouped into day sections below them, newest day first.
  const sections = useMemo(() => {
    const result: Array<{ key: string; label: string; data: any[] }> = [];
    if (pendingOffline.length > 0) {
      result.push({ key: "offline", label: "Ожидают отправки", data: pendingOffline.map(o => ({ ...o, _offline: true })) });
    }
    const serverOrders = Array.isArray(orders) ? orders : [];
    result.push(...groupByDay(serverOrders));
    return result;
  }, [orders, pendingOffline]);

  const handleSync = async () => {
    setSyncing(true);
    const result = await syncAll();
    await refetch();
    setSyncing(false);

    if (result.failed > 0) {
      notify.error(
        result.synced > 0
          ? `Отправлено ${result.synced}, не удалось отправить ${result.failed}. Возможно, товар уже закончился на складе — проверьте заказ.`
          : `Не удалось отправить ${result.failed} заказ(ов). Возможно, товар уже закончился на складе.`
      );
    } else if (result.synced > 0) {
      notify.success(`Отправлено ${result.synced} заказ(ов)`);
    }
  };

  const handleOrderPress = (order: Order) => {
    router.push(`/order/${order.id}`);
  };

  return (
    <View style={s.container}>
      {/* Sync banner */}
      {pendingOffline.length > 0 && (
        <TouchableOpacity
          style={s.syncBanner}
          onPress={handleSync}
          activeOpacity={0.8}
          disabled={syncing}
        >
          <View style={s.syncBannerLeft}>
            <Feather name={syncing ? "loader" : "cloud-off"} size={15} color={colors.status.warning} />
            <Text style={s.syncBannerText}>
              {pendingOffline.length} заказ(ов) не синхронизировано
            </Text>
          </View>
          <View style={s.syncBannerAction}>
            <Text style={s.syncBannerActionText}>
              {syncing ? "Отправка…" : "Отправить"}
            </Text>
            {!syncing && <Feather name="arrow-right" size={14} color={colors.status.warning} />}
          </View>
        </TouchableOpacity>
      )}

      <SectionList
        sections={isLoading ? [] : sections}
        keyExtractor={(item: any) => item._offline ? `off-${item.id}` : String(item.id)}
        contentContainerStyle={s.list}
        showsVerticalScrollIndicator={false}
        stickySectionHeadersEnabled={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={colors.brand.primary}
          />
        }
        renderSectionHeader={({ section }) => (
          <View style={s.sectionHeader}>
            <Text style={s.sectionHeaderText}>{section.label.toUpperCase()}</Text>
            <Text style={s.sectionHeaderCount}>{section.data.length}</Text>
          </View>
        )}
        ListHeaderComponent={
          isLoading ? (
            <View style={{ gap: Spacing.sm }}>
              {[1, 2, 3].map(i => <Skeleton key={i} height={104} radius={Radii.lg} />)}
            </View>
          ) : null
        }
        ListEmptyComponent={
          !isLoading ? (
            <EmptyState
              icon="clipboard"
              title="Заказов пока нет"
              description="Создайте первый заказ для одного из ваших магазинов"
            />
          ) : null
        }
        renderItem={({ item }: any) =>
          item._offline ? (
            <OfflineOrderCard order={item} colors={colors} />
          ) : (
            <OrderCard order={item} colors={colors} onPress={() => handleOrderPress(item)} />
          )
        }
        ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
        SectionSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
      />

      {/* FAB */}
      <TouchableOpacity
        style={s.fabWrap}
        onPress={() => router.push("/order/new")}
        activeOpacity={0.85}
      >
        <LinearGradient colors={Gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.fab}>
          <Feather name="plus" size={26} color="#fff" />
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return {
    container: { flex: 1, backgroundColor: colors.bg.primary } as const,
    list: { padding: Spacing.base, paddingBottom: 130 },

    sectionHeader: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "space-between" as const,
      paddingHorizontal: 4,
      paddingTop: Spacing.sm,
      paddingBottom: 6,
    },
    sectionHeaderText: {
      fontSize: 11,
      fontFamily: Typography.fontBold,
      color: colors.text.muted,
      letterSpacing: 1,
    },
    sectionHeaderCount: {
      fontSize: 11,
      fontFamily: Typography.fontSemibold,
      color: colors.text.muted,
      backgroundColor: colors.bg.elevated,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: Radii.full,
    },

    syncBanner: {
      flexDirection: "row" as const,
      justifyContent: "space-between" as const,
      alignItems: "center" as const,
      backgroundColor: colors.status.warningDim,
      paddingHorizontal: Spacing.base,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: "rgba(245,165,36,0.2)",
    },
    syncBannerLeft: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 8,
    },
    syncBannerText: {
      fontSize: Typography.size.sm,
      fontFamily: Typography.fontMedium,
      color: colors.status.warning,
    },
    syncBannerAction: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 4,
    },
    syncBannerActionText: {
      fontSize: Typography.size.sm,
      fontFamily: Typography.fontSemibold,
      color: colors.status.warning,
    },

    orderCard: { padding: Spacing.base },
    offlineCard: {
      borderColor: "rgba(245,165,36,0.3)",
      backgroundColor: "rgba(245,165,36,0.05)",
    },
    orderRow: {
      flexDirection: "row" as const,
      justifyContent: "space-between" as const,
      alignItems: "flex-start" as const,
      marginBottom: Spacing.md,
    },
    orderNumRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: Spacing.md,
      flex: 1,
    },
    orderNum: {
      fontSize: Typography.size.sm,
      fontFamily: Typography.fontBold,
      color: colors.brand.primaryLight,
      fontVariant: ["tabular-nums" as const],
    },
    offlineIndicatorText: {
      fontSize: 10,
      fontFamily: Typography.fontBold,
      color: colors.status.warning,
      letterSpacing: 0.8,
    },
    orderShop: {
      fontSize: Typography.size.base,
      fontFamily: Typography.fontMedium,
      color: colors.text.primary,
      marginTop: 2,
    },
    orderFooter: {
      flexDirection: "row" as const,
      justifyContent: "space-between" as const,
      alignItems: "center" as const,
      paddingTop: Spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.border.subtle,
    },
    orderFooterItem: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 5,
    },
    orderDate: {
      fontSize: Typography.size.xs,
      color: colors.text.muted,
    },
    orderTotal: {
      fontSize: Typography.size.base,
      fontFamily: Typography.fontBold,
      color: colors.text.primary,
      fontVariant: ["tabular-nums" as const],
    },
    itemCount: {
      fontSize: Typography.size.xs,
      color: colors.text.muted,
    },

    fabWrap: {
      position: "absolute" as const,
      bottom: 100,
      right: 20,
      borderRadius: Radii.full,
      shadowColor: colors.brand.primary,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.5,
      shadowRadius: 16,
      elevation: 12,
    },
    fab: {
      width: 58,
      height: 58,
      borderRadius: Radii.full,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
  };
}
