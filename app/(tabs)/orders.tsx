import React, { useMemo, useState, useCallback } from "react";
import {
  View,
  Text,
  SectionList,
  RefreshControl,
  TouchableOpacity,
} from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { format, parseISO, isToday, isYesterday } from "date-fns";
import { ru } from "date-fns/locale";
import { Feather } from "@expo/vector-icons";

import { getMyOrders, Order } from "../../src/api";
import { useOfflineStore } from "../../src/store/offline";
import { notify } from "../../src/store/toast";
import { useThemeStore } from "../../src/store/theme";
import { FadeInItem, PressableScale } from "../../src/components/Animated";
import {
  WebColors,
  WebShadows,
  WebTypography,
  WebSpacing,
  WebRadii,
  createWebStyles,
} from "../../src/theme-web-match";

type IconName = keyof typeof Feather.glyphMap;

interface OfflineOrderItem {
  id: string;
  shopName: string;
  createdAt: string;
  input: { items: Array<unknown> };
  _offline: boolean;
}

const STATUS_CONFIG: Record<
  string,
  {
    label: string;
    variant: "success" | "danger" | "warning" | "primary";
    icon: IconName;
  }
> = {
  new: { label: "Новый", variant: "primary", icon: "circle" },
  processing: { label: "В обработке", variant: "warning", icon: "loader" },
  completed: { label: "Выполнен", variant: "success", icon: "check-circle" },
  cancelled: { label: "Отменён", variant: "danger", icon: "x-circle" },
};

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
  try {
    return format(parseISO(dateStr), "yyyy-MM-dd");
  } catch {
    return "unknown";
  }
}

function groupByDay<T extends { createdAt: string }>(items: T[]) {
  const map = new Map<string, { key: string; label: string; data: T[] }>();
  for (const item of items) {
    const key = dayKey(item.createdAt);
    if (!map.has(key))
      map.set(key, { key, label: dayLabel(item.createdAt), data: [] });
    map.get(key)!.data.push(item);
  }
  return Array.from(map.values()).sort((a, b) =>
    a.key < b.key ? 1 : a.key > b.key ? -1 : 0
  );
}

// ── Status Badge (web exact) ──────────────────────────────────────────────────
function StatusBadge({
  variant,
  label,
  isDark,
}: {
  variant: "success" | "danger" | "warning" | "primary";
  label: string;
  isDark: boolean;
}) {
  const c = isDark ? WebColors.dark : WebColors.light;
  const dotColor =
    variant === "success"
      ? c.success
      : variant === "danger"
        ? c.danger
        : variant === "warning"
          ? c.warning
          : c.primary;
  const bgColor =
    variant === "success"
      ? c.successSubtle
      : variant === "danger"
        ? c.dangerSubtle
        : variant === "warning"
          ? c.warningSubtle
          : c.primarySubtle;

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: WebRadii.full,
        borderWidth: 1,
        borderColor: dotColor + "25",
        backgroundColor: bgColor,
      }}
    >
      <View
        style={{
          width: 6,
          height: 6,
          borderRadius: 3,
          backgroundColor: dotColor,
        }}
      />
      <Text
        style={{
          fontSize: WebTypography.size.xs,
          fontWeight: WebTypography.weight.medium,
          fontFamily: WebTypography.family,
          color: dotColor,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

// ── KPI Hero Card (web exact .kpi-hero) ──────────────────────────────────────
function KpiHeroCard({
  label,
  value,
  icon,
  iconBg,
  isDark,
  delay,
}: {
  label: string;
  value: string;
  icon: IconName;
  iconBg: string;
  isDark: boolean;
  delay: number;
}) {
  const c = isDark ? WebColors.dark : WebColors.light;
  const s = isDark ? WebShadows.dark : WebShadows.light;

  return (
    <FadeInItem delay={delay}>
      <View
        style={{
          backgroundColor: c.surface,
          borderRadius: WebRadii.xl,
          borderWidth: 1,
          borderColor: c.border,
          padding: 20,
          ...s.sm,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: 16,
          }}
        >
          <Text
            style={{
              fontFamily: WebTypography.family,
              fontSize: WebTypography.size.xs,
              fontWeight: WebTypography.weight.semibold,
              color: c.textTertiary,
              letterSpacing: 0.08,
              textTransform: "uppercase",
            }}
          >
            {label}
          </Text>
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              backgroundColor: iconBg,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Feather name={icon} size={20} color="#fff" />
          </View>
        </View>
        <Text
          style={{
            fontFamily: WebTypography.family,
            fontSize: 28,
            fontWeight: WebTypography.weight.bold,
            color: c.textPrimary,
            lineHeight: 32,
            letterSpacing: -0.03,
          }}
        >
          {value}
        </Text>
      </View>
    </FadeInItem>
  );
}

// ── Order Card (web mobile card style) ───────────────────────────────────────
const OrderCard = React.memo(function OrderCard({
  order,
  onPress,
  isDark,
  index,
}: {
  order: Order;
  onPress: () => void;
  isDark: boolean;
  index: number;
}) {
  const c = isDark ? WebColors.dark : WebColors.light;
  const s = isDark ? WebShadows.dark : WebShadows.light;
  const cfg = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.new;
  const time = (() => {
    try {
      return format(parseISO(order.createdAt), "HH:mm", { locale: ru });
    } catch {
      return "";
    }
  })();

  const priceStr = Number(order.total).toLocaleString("ru-RU");
  const dotColor =
    cfg.variant === "success"
      ? c.success
      : cfg.variant === "danger"
        ? c.danger
        : cfg.variant === "warning"
          ? c.warning
          : c.primary;

  return (
    <FadeInItem delay={index * 60}>
      <PressableScale onPress={onPress} haptic="light" scaleTo={0.98}>
        <View
          style={{
            backgroundColor: c.surface,
            borderRadius: WebRadii.xl,
            overflow: "hidden",
            ...s.sm,
          }}
        >
          <View style={{ flexDirection: "row" }}>
            {/* Left color bar */}
            <View
              style={{
                width: 4,
                backgroundColor: dotColor,
                borderTopLeftRadius: WebRadii.xl,
                borderBottomLeftRadius: WebRadii.xl,
              }}
            />
            <View style={{ flex: 1, padding: 14 }}>
              {/* Top row: order number + badge */}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 8,
                }}
              >
                <Text
                  style={{
                    fontFamily: WebTypography.family,
                    fontSize: WebTypography.size.md,
                    fontWeight: WebTypography.weight.semibold,
                    color: c.textPrimary,
                    fontVariant: ["tabular-nums"],
                  }}
                >
                  {order.orderNumber}
                </Text>
                <StatusBadge
                  variant={cfg.variant}
                  label={cfg.label}
                  isDark={isDark}
                />
              </View>

              {/* Bottom row: shop/agent left, price+chevron right */}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "flex-end",
                  justifyContent: "space-between",
                }}
              >
                <View style={{ flexDirection: "column", gap: 2 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <Feather
                      name="store"
                      size={12}
                      color={c.textSecondary}
                    />
                    <Text
                      style={{
                        fontSize: WebTypography.size.sm,
                        color: c.textPrimary,
                        maxWidth: 160,
                      }}
                      numberOfLines={1}
                    >
                      {order.shopName ?? "—"}
                    </Text>
                  </View>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <Feather
                      name="user"
                      size={12}
                      color={c.textSecondary}
                    />
                    <Text
                      style={{
                        fontSize: WebTypography.size.xs,
                        color: c.textSecondary,
                      }}
                    >
                      {time}
                    </Text>
                  </View>
                </View>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: WebTypography.family,
                      fontSize: WebTypography.size.lg,
                      fontWeight: WebTypography.weight.bold,
                      color: c.textPrimary,
                      fontVariant: ["tabular-nums"],
                    }}
                  >
                    {priceStr}
                  </Text>
                  <Feather
                    name="chevron-right"
                    size={15}
                    color={c.textSecondary}
                  />
                </View>
              </View>
            </View>
          </View>
        </View>
      </PressableScale>
    </FadeInItem>
  );
});

// ── Offline Order Card (web neo-card style) ──────────────────────────────────
const OfflineOrderCard = React.memo(function OfflineOrderCard({
  order,
  isDark,
}: {
  order: OfflineOrderItem;
  isDark: boolean;
}) {
  const c = isDark ? WebColors.dark : WebColors.light;
  const s = isDark ? WebShadows.dark : WebShadows.light;

  let timeStr = "--:--";
  try {
    timeStr = format(parseISO(order.createdAt), "HH:mm", { locale: ru });
  } catch {
    /* date parsing failed */
  }

  return (
    <View
      style={{
        backgroundColor: c.surface,
        borderRadius: WebRadii.xl,
        overflow: "hidden",
        ...s.sm,
      }}
    >
      <View style={{ flexDirection: "row" }}>
        <View
          style={{
            width: 4,
            backgroundColor: c.warning,
            borderTopLeftRadius: WebRadii.xl,
            borderBottomLeftRadius: WebRadii.xl,
          }}
        />
        <View style={{ flex: 1, padding: 14 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 8,
            }}
          >
            <Text
              style={{
                fontFamily: WebTypography.family,
                fontSize: WebTypography.size.sm,
                fontWeight: WebTypography.weight.semibold,
                color: c.warning,
                letterSpacing: 0.08,
                textTransform: "uppercase",
              }}
            >
              ОЖИДАЕТ ОТПРАВКИ
            </Text>
            <StatusBadge variant="warning" label="Локально" isDark={isDark} />
          </View>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Text
              style={{
                fontSize: WebTypography.size.sm,
                color: c.textPrimary,
              }}
              numberOfLines={1}
            >
              {order.shopName}
            </Text>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Feather name="clock" size={12} color={c.textTertiary} />
              <Text
                style={{
                  fontSize: WebTypography.size.xs,
                  color: c.textTertiary,
                }}
              >
                {timeStr}
              </Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
});

// ── Empty State ──────────────────────────────────────────────────────────────
function EmptyState({ isDark }: { isDark: boolean }) {
  const c = isDark ? WebColors.dark : WebColors.light;
  const s = isDark ? WebShadows.dark : WebShadows.light;

  return (
    <View style={{ alignItems: "center", paddingTop: WebSpacing.xxxl }}>
      <View
        style={{
          width: 120,
          height: 120,
          borderRadius: WebRadii.full,
          backgroundColor: c.surface,
          borderWidth: 1,
          borderColor: c.border,
          alignItems: "center",
          justifyContent: "center",
          marginBottom: WebSpacing.xl,
          ...s.md,
        }}
      >
        <Feather name="clipboard" size={40} color={c.textTertiary} />
      </View>
      <Text
        style={{
          fontSize: WebTypography.size.lg,
          fontWeight: WebTypography.weight.semibold,
          fontFamily: WebTypography.family,
          color: c.textPrimary,
          marginBottom: WebSpacing.sm,
        }}
      >
        Заказов пока нет
      </Text>
      <Text
        style={{
          fontSize: WebTypography.size.sm,
          color: c.textSecondary,
          textAlign: "center",
          paddingHorizontal: WebSpacing.xxxl,
          fontFamily: WebTypography.family,
        }}
      >
        Создайте первый заказ для одного из ваших магазинов
      </Text>
    </View>
  );
}

// ── Main Orders Screen ───────────────────────────────────────────────────────
export default function OrdersScreen() {
  const router = useRouter();
  const { isDark } = useThemeStore();
  const webStyles = createWebStyles(isDark);
  const c = isDark ? WebColors.dark : WebColors.light;
  const s = isDark ? WebShadows.dark : WebShadows.light;
  const insets = useSafeAreaInsets();
  const { orders: offlineOrders, syncAll } = useOfflineStore();
  const [syncing, setSyncing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<string>("all");

  const {
    data: orders,
    isLoading,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ["myOrders"],
    queryFn: getMyOrders,
    retry: false,
    staleTime: 2 * 60 * 1000,
  });

  const pendingOffline = offlineOrders.filter((o) => !o.synced);

  const sections = useMemo(() => {
    const result: Array<{
      key: string;
      label: string;
      data: Array<Order | OfflineOrderItem>;
    }> = [];

    if (pendingOffline.length > 0) {
      result.push({
        key: "offline",
        label: "Ожидают отправки",
        data: pendingOffline.map((o) => ({ ...o, _offline: true })),
      });
    }

    const serverOrders = Array.isArray(orders) ? orders : [];
    const filteredOrders =
      activeFilter === "all"
        ? serverOrders
        : serverOrders.filter((o) => o.status === activeFilter);

    result.push(...groupByDay(filteredOrders));
    return result;
  }, [orders, pendingOffline, activeFilter]);

  const stats = useMemo(() => {
    const all = Array.isArray(orders) ? orders : [];
    const total = all.length;
    const newCount = all.filter((o) => o.status === "new").length;
    const processingCount = all.filter((o) => o.status === "processing").length;
    const completedCount = all.filter((o) => o.status === "completed").length;
    const cancelledCount = all.filter((o) => o.status === "cancelled").length;
    const totalRevenue = all.reduce((sum, o) => sum + (o.total ?? 0), 0);
    return { total, newCount, processingCount, completedCount, cancelledCount, totalRevenue };
  }, [orders]);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    const result = await syncAll();
    await refetch();
    setSyncing(false);

    if (result.failed > 0) {
      notify.error(
        result.synced > 0
          ? `Отправлено ${result.synced}, не удалось отправить ${result.failed}.`
          : `Не удалось отправить ${result.failed} заказ(ов).`
      );
    } else if (result.synced > 0) {
      notify.success(`Отправлено ${result.synced} заказ(ов)`);
    }
  }, [syncAll, refetch]);

  const handleOrderPress = useCallback(
    (order: Order) => {
      router.push({
        pathname: "/order/[id]",
        params: { id: String(order.id) },
      });
    },
    [router]
  );

  const filters = [
    { key: "all", label: "Все" },
    { key: "new", label: "Новые" },
    { key: "processing", label: "В работе" },
    { key: "completed", label: "Выполнены" },
    { key: "cancelled", label: "Отменены" },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: c.canvas }}>
      {/* Status Bar Area */}
      <View style={{ paddingTop: insets.top, backgroundColor: c.canvas }} />

      {/* Sync Banner */}
      {pendingOffline.length > 0 && (
        <FadeInItem delay={0}>
          <PressableScale
            onPress={handleSync}
            haptic="medium"
            disabled={syncing}
            accessibilityLabel="Синхронизировать заказы"
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                backgroundColor: c.warningSubtle,
                paddingHorizontal: WebSpacing.base,
                paddingVertical: 12,
                marginHorizontal: WebSpacing.base,
                marginTop: WebSpacing.sm,
                borderRadius: WebRadii.lg,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <Feather
                  name={syncing ? "loader" : "cloud-off"}
                  size={15}
                  color={c.warning}
                />
                <Text
                  style={{
                    fontSize: WebTypography.size.sm,
                    fontWeight: WebTypography.weight.medium,
                    fontFamily: WebTypography.family,
                    color: c.warning,
                  }}
                >
                  {pendingOffline.length} заказ(ов) не синхронизировано
                </Text>
              </View>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <Text
                  style={{
                    fontSize: WebTypography.size.sm,
                    fontWeight: WebTypography.weight.semibold,
                    fontFamily: WebTypography.family,
                    color: c.warning,
                  }}
                >
                  {syncing ? "Отправка…" : "Отправить"}
                </Text>
                {!syncing && (
                  <Feather
                    name="arrow-right"
                    size={14}
                    color={c.warning}
                  />
                )}
              </View>
            </View>
          </PressableScale>
        </FadeInItem>
      )}

      {/* KPI Hero Stats */}
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: WebSpacing.base,
          paddingHorizontal: WebSpacing.base,
          paddingTop: WebSpacing.md,
        }}
      >
        <View style={{ flex: 1, minWidth: 150 }}>
          <KpiHeroCard
            label="ВСЕГО ЗАКАЗОВ"
            value={stats.total.toLocaleString()}
            icon="shopping-cart"
            iconBg="linear-gradient(135deg, #4b6cf6, #4b6cf6)" // fallback to primary
            isDark={isDark}
            delay={0}
          />
        </View>
        <View style={{ flex: 1, minWidth: 150 }}>
          <KpiHeroCard
            label="НОВЫЕ"
            value={stats.newCount.toLocaleString()}
            icon="clock"
            iconBg="#3b82f6"
            isDark={isDark}
            delay={0.05}
          />
        </View>
        <View style={{ flex: 1, minWidth: 150 }}>
          <KpiHeroCard
            label="В РАБОТЕ"
            value={stats.processingCount.toLocaleString()}
            icon="loader"
            iconBg={c.warning}
            isDark={isDark}
            delay={0.1}
          />
        </View>
        <View style={{ flex: 1, minWidth: 150 }}>
          <KpiHeroCard
            label="ВЫПОЛНЕНЫ"
            value={stats.completedCount.toLocaleString()}
            icon="check-circle"
            iconBg={c.success}
            isDark={isDark}
            delay={0.15}
          />
        </View>
        <View style={{ flex: 1, minWidth: 150 }}>
          <KpiHeroCard
            label="ОТМЕНЕНЫ"
            value={stats.cancelledCount.toLocaleString()}
            icon="x-circle"
            iconBg={c.danger}
            isDark={isDark}
            delay={0.2}
          />
        </View>
      </View>

      {/* Tab Filters (web style) */}
      <View
        style={{
          paddingHorizontal: WebSpacing.base,
          paddingTop: WebSpacing.lg,
          paddingBottom: WebSpacing.sm,
        }}
      >
        <View
          style={{
            backgroundColor: c.surface,
            borderRadius: WebRadii.xl,
            borderWidth: 1,
            borderColor: c.border,
            padding: WebSpacing.base,
            flexDirection: "row",
            flexWrap: "wrap",
            gap: WebSpacing.sm,
            ...s.sm,
          }}
        >
          {filters.map((f) => {
            const isActive = activeFilter === f.key;
            return (
              <TouchableOpacity
                key={f.key}
                onPress={() => setActiveFilter(f.key)}
                style={{
                  backgroundColor: isActive ? c.primarySubtle : c.surfaceLight,
                  borderRadius: WebRadii.md,
                  borderWidth: 1,
                  borderColor: isActive ? c.primary + "25" : c.border,
                  paddingHorizontal: WebSpacing.base,
                  paddingVertical: WebSpacing.sm,
                }}
              >
                <Text
                  style={{
                    fontSize: WebTypography.size.sm,
                    fontWeight: isActive
                      ? WebTypography.weight.semibold
                      : WebTypography.weight.medium,
                    fontFamily: WebTypography.family,
                    color: isActive ? c.primary : c.textSecondary,
                  }}
                >
                  {f.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Orders List */}
      <SectionList
        sections={isLoading ? [] : sections}
        keyExtractor={(item) => {
          const isOffline = "_offline" in item && item._offline;
          return isOffline ? `off-${item.id}` : String(item.id);
        }}
        contentContainerStyle={{
          padding: WebSpacing.base,
          paddingBottom: 130,
        }}
        showsVerticalScrollIndicator={false}
        stickySectionHeadersEnabled={false}
        windowSize={11}
        maxToRenderPerBatch={10}
        removeClippedSubviews
        updateCellsBatchingPeriod={50}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={c.primary}
          />
        }
        renderSectionHeader={({ section }) => (
          <FadeInItem delay={0}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingHorizontal: 4,
                paddingTop: WebSpacing.sm,
                paddingBottom: 6,
              }}
            >
              <Text
                style={{
                  fontFamily: WebTypography.family,
                  fontSize: WebTypography.size.xs,
                  fontWeight: WebTypography.weight.bold,
                  color: c.textTertiary,
                  letterSpacing: 1.5,
                  textTransform: "uppercase",
                }}
              >
                {section.label}
              </Text>
              <View
                style={{
                  backgroundColor: c.surfaceLight,
                  borderRadius: WebRadii.sm,
                  paddingHorizontal: 8,
                  paddingVertical: 2,
                  borderWidth: 1,
                  borderColor: c.borderSubtle,
                }}
              >
                <Text
                  style={{
                    fontSize: WebTypography.size.xs,
                    fontWeight: WebTypography.weight.semibold,
                    fontFamily: WebTypography.family,
                    color: c.textSecondary,
                  }}
                >
                  {section.data.length}
                </Text>
              </View>
            </View>
          </FadeInItem>
        )}
        ListEmptyComponent={!isLoading ? <EmptyState isDark={isDark} /> : null}
        renderItem={({ item, index }) => {
          const isOffline = "_offline" in item && item._offline;
          return isOffline ? (
            <OfflineOrderCard
              order={item as OfflineOrderItem}
              isDark={isDark}
            />
          ) : (
            <OrderCard
              order={item as Order}
              isDark={isDark}
              index={index}
              onPress={() => handleOrderPress(item as Order)}
            />
          );
        }}
        ItemSeparatorComponent={() => <View style={{ height: 0 }} />}
        SectionSeparatorComponent={() => (
          <View style={{ height: WebSpacing.sm }} />
        )}
      />

      {/* FAB (web neo-btn-primary style) */}
      <PressableScale
        onPress={() => router.push("/order/new")}
        haptic="medium"
        accessibilityLabel="Новый заказ"
        style={{
          position: "absolute",
          bottom: insets.bottom + 80,
          right: 20,
          width: 58,
          height: 58,
          borderRadius: WebRadii.full,
          backgroundColor: c.primary,
          alignItems: "center",
          justifyContent: "center",
          ...s.sm,
        }}
      >
        <Feather name="plus" size={26} color="#fff" />
      </PressableScale>
    </View>
  );
}
