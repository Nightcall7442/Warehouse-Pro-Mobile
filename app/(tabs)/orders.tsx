// Warehouse Pro — Orders v2 (cold palette, ProgressRing donuts)
import React, { useEffect, useMemo, useState } from "react";
import { View, Text, FlatList, RefreshControl, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { format, parseISO, isToday, isYesterday } from "date-fns";
import { ru, uz } from "date-fns/locale";
import { useT, useLang, tt, type Lang } from "../../src/i18n";
import { Feather } from "@expo/vector-icons";
import { getMyOrders, Order } from "../../src/api";
import { offlineOrderTotal } from "../../src/lib/order-money";
import type { OfflineOrder } from "../../src/store/offline";
import { useThemeColors } from "../../src/store/theme";
import { useAuthStore } from "../../src/store/auth";
import { useOfflineStore } from "../../src/store/offline";
import { Typography, Spacing, Radii, KpiColors } from "../../src/theme";

import { Card, Badge } from "../../src/components/ui";
import { ProgressRing, NeumorphicProgressBar } from "../../src/components/Charts";
import { FadeInItem, PressableScale } from "../../src/components/Animated";
import { LinearGradient } from "expo-linear-gradient";
import { Gradients } from "../../src/theme";

const BOTTOM_TAB_HEIGHT = 80;

type ListItem =
  | { type: "header"; date: string; key: string }
  /** Заголовок раздела без даты: «ОЖИДАЮТ ОТПРАВКИ». */
  | { type: "title"; title: string; key: string }
  | { type: "order"; order: Order; key: string }
  /** Заказ из очереди на телефоне: сервер о нём ещё не знает. */
  | { type: "pending"; order: OfflineOrder; key: string };

function dayLabel(dateStr: string, lang: Lang): string {
  try {
    const d = parseISO(dateStr);
    if (isToday(d)) return tt("Сегодня", "Bugun");
    if (isYesterday(d)) return tt("Вчера", "Kecha");
    return format(d, "d MMMM", { locale: lang === "uz" ? uz : ru });
  } catch { return ""; }
}

function dayKey(dateStr: string): string {
  try { return format(parseISO(dateStr), "yyyy-MM-dd"); } catch { return "unknown"; }
}

/**
 * Discarding drops work the agent actually did — a visit they made, an order
 * they took — so it asks first, and says plainly that nothing will be sent.
 */
function confirmDiscard(what: string, onConfirm: () => void) {
  Alert.alert(
    tt("Удалить из очереди?", "Navbatdan o'chirasizmi?"),
    tt(`${what} не будет отправлено на сервер. Отменить это действие нельзя.`, `${what} serverga yuborilmaydi. Bu amalni qaytarib bo'lmaydi.`),
    [
      { text: tt("Отмена", "Bekor"), style: "cancel" },
      { text: tt("Удалить", "O'chirish"), style: "destructive", onPress: onConfirm },
    ]
  );
}

export default function OrdersScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const t = useT();
  const lang = useLang();
  const { user } = useAuthStore();
  const offline = useOfflineStore();
  const { orders: offlineOrders, deliveryActions, syncAll, retry, retryDeliveryAction, syncingOrders, syncingActions } = offline;

  const { data: orders, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ["myOrders"],
    queryFn: getMyOrders,
    retry: false, staleTime: 2 * 60 * 1000,
    enabled: user?.role === "agent" || user?.role === "ceo" || user?.role === "operator",
  });
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const pendingOffline = useMemo(() => {
    // Чужая запись (оставшаяся в очереди с прошлой смены на этом устройстве)
    // не показывается — иначе кнопка "Повтор" рядом с ней ничего бы не сделала.
    return offlineOrders.filter(o => !o.synced && (o.ownerId == null || o.ownerId === user?.id));
  }, [offlineOrders, user?.id]);

  const pendingActions = useMemo(() => {
    return deliveryActions.filter(a => !a.synced && (a.ownerId == null || a.ownerId === user?.id));
  }, [deliveryActions, user?.id]);

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
    /*
      Отложенные — первыми и обычными карточками.

      Было: заказ, оформленный без связи, значился только счётчиком в жёлтой
      полосе «1 заказ не отправлен» — ни магазина, ни суммы, ни времени.
      Агент не мог понять, какой из трёх сегодняшних застрял, и оформлял
      заново — второй такой же. Полоса остаётся: в ней «повторить» и «убрать».
    */
    if (pendingOffline.length > 0) {
      result.push({ type: "title", title: t("ОЖИДАЮТ ОТПРАВКИ", "YUBORISH KUTILMOQDA"), key: "h-pending" });
      for (const order of pendingOffline) result.push({ type: "pending", order, key: `p-${order.id}` });
    }
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
  }, [orders, pendingOffline, t]);

  const stats = useMemo(() => {
    const arr = Array.isArray(orders) ? orders : [];
    const newCount = arr.filter(o => o.status === "new").length;
    const processingCount = arr.filter(o => o.status === "processing").length;
    const completedCount = arr.filter(o => o.status === "delivered").length;
    const cancelledCount = arr.filter(o => o.status === "cancelled").length;
    return { total: arr.length, newCount, processingCount, completedCount, cancelledCount };
  }, [orders]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      {/* Header — matches web Orders.tsx */}
      <View style={{ paddingTop: insets.top + Spacing.sm, paddingHorizontal: Spacing.base, paddingBottom: Spacing.sm }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <View>
            <Text style={{ fontFamily: Typography.fontExtraBold, fontSize: Typography.size.xxl, color: colors.text.primary }}>{t("Заказы", "Buyurtmalar")}</Text>
            <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.sm, color: colors.text.muted, marginTop: 2 }}>
              {t(`${stats.total} заказов · ${stats.newCount} новых`, `${stats.total} ta buyurtma · ${stats.newCount} ta yangi`)}
            </Text>
          </View>
          <PressableScale onPress={() => router.push("/order/new")} haptic="light">
            <LinearGradient colors={Gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: Radii.md }}>
              <Feather name="plus" size={14} color="#fff" />
              <Text style={{ fontSize: Typography.size.xs, fontFamily: Typography.fontBold, color: "#fff" }}>{t("Новый", "Yangi")}</Text>
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
                  {t(`${pendingOffline.length} ${pendingOffline.length === 1 ? "заказ" : "заказов"} не отправлен${pendingOffline.length === 1 ? "" : "ы"}`, `${pendingOffline.length} ta buyurtma yuborilmadi`)}
                </Text>
                {syncingOrders ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
                    <ActivityIndicator size="small" color={colors.accent.primary} />
                    <Text style={{ fontSize: Typography.size.xs, color: colors.text.secondary }}>{t("Отправка...", "Yuborilmoqda...")}</Text>
                  </View>
                ) : (
                  <TouchableOpacity onPress={() => syncAll()} style={{ marginTop: 4 }}>
                    <Text style={{ fontSize: Typography.size.xs, color: colors.accent.primary, fontFamily: Typography.fontSemibold }}>
                      {t("Нажмите для повторной отправки", "Qayta yuborish uchun bosing")}
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
                  <Text style={{ fontSize: Typography.size.xs, color: colors.accent.primary }}>{t("Отправка...", "Yuborilmoqda...")}</Text>
                ) : (
                  <>
                    <Feather name="refresh-cw" size={14} color={colors.accent.primary} />
                    <Text style={{ fontSize: Typography.size.xs, color: colors.accent.primary }}>{t("Повтор", "Qayta")}</Text>
                    {/* Only offered once the server has actually refused the order.
                        Retrying that will never help, and without a way out the
                        row stays red forever — which is what pushes agents into
                        re-entering the order by hand and creating a duplicate. */}
                    {o.retryable === false ? (
                      <TouchableOpacity
                        onPress={() => confirmDiscard(o.shopName, () => offline.remove(o.id))}
                        hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
                        accessibilityLabel={t("Удалить заказ из очереди", "Buyurtmani navbatdan o'chirish")}
                      >
                        <Feather name="x" size={16} color={colors.text.muted} />
                      </TouchableOpacity>
                    ) : null}
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
                  {t(`${pendingActions.length} ${pendingActions.length === 1 ? "действие" : "действий"} ожидают отправки`, `${pendingActions.length} ta amal yuborishni kutmoqda`)}
                </Text>
                {syncingActions ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
                    <ActivityIndicator size="small" color={colors.accent.primary} />
                    <Text style={{ fontSize: Typography.size.xs, color: colors.text.secondary }}>{t("Отправка...", "Yuborilmoqda...")}</Text>
                  </View>
                ) : (
                  <TouchableOpacity onPress={() => offline.syncDeliveryActions()} style={{ marginTop: 4 }}>
                    <Text style={{ fontSize: Typography.size.xs, color: colors.accent.primary, fontFamily: Typography.fontSemibold }}>
                      {t("Нажмите для повторной отправки", "Qayta yuborish uchun bosing")}
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
                  {a.action.type === "markOutForDelivery" ? t("Выезд", "Yo'lga chiqdi")
                    : a.action.type === "markDelivered" ? t("Доставлен", "Yetkazildi")
                    : a.action.type === "completeDelivery" ? t("Доставка завершена", "Yetkazish yakunlandi")
                    : t("Проблема", "Muammo")} #{a.action.type === "completeDelivery" ? a.action.input.orderId : a.action.orderId}
                </Text>
                <Feather name="refresh-cw" size={14} color={colors.accent.primary} />
                <Text style={{ fontSize: Typography.size.xs, color: colors.accent.primary }}>{t("Повтор", "Qayta")}</Text>
                {a.retryable === false ? (
                  <TouchableOpacity
                    onPress={() => confirmDiscard(t("это действие", "bu amal"), () => offline.discardDeliveryAction(a.id))}
                    hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
                    accessibilityLabel={t("Удалить действие из очереди", "Amalni navbatdan o'chirish")}
                  >
                    <Feather name="x" size={16} color={colors.text.muted} />
                  </TouchableOpacity>
                ) : null}
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
                <Text style={{ fontFamily: Typography.fontMedium, fontSize: 8, color: colors.text.tertiary, letterSpacing: 0.5, textTransform: "uppercase" }}>{t("Всего", "Jami")}</Text>
              </Card>
              {/* New ring */}
              <Card style={{ flex: 1, alignItems: "center", padding: Spacing.md }}>
                <ProgressRing value={stats.total > 0 ? Math.round(stats.newCount / Math.max(stats.total, 1) * 100) : 0} size={56} strokeWidth={6} color={KpiColors.teal} />
                <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.lg, color: colors.text.primary, marginTop: 6 }}>{stats.newCount}</Text>
                <Text style={{ fontFamily: Typography.fontMedium, fontSize: 8, color: colors.text.tertiary, letterSpacing: 0.5, textTransform: "uppercase" }}>{t("Новые", "Yangi")}</Text>
              </Card>
              {/* Completed ring */}
              <Card style={{ flex: 1, alignItems: "center", padding: Spacing.md }}>
                <ProgressRing value={stats.total > 0 ? Math.round(stats.completedCount / Math.max(stats.total, 1) * 100) : 0} size={56} strokeWidth={6} color={KpiColors.green} />
                <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.lg, color: colors.text.primary, marginTop: 6 }}>{stats.completedCount}</Text>
                <Text style={{ fontFamily: Typography.fontMedium, fontSize: 8, color: colors.text.tertiary, letterSpacing: 0.5, textTransform: "uppercase" }}>{t("Выполнены", "Bajarildi")}</Text>
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
            {/* Сбой связи и пустой список выглядели одинаково: «Заказов пока
                нет». Агент решал, что за день ничего не оформил, и заказывал
                заново — а первый заказ при этом лежал на сервере. */}
            <Text style={{ fontSize: Typography.size.base, fontFamily: Typography.fontSemibold, color: colors.text.secondary }}>
              {isError ? t("Не удалось загрузить заказы", "Buyurtmalarni yuklab bo'lmadi") : t("Заказов пока нет", "Hozircha buyurtma yo'q")}
            </Text>
            {isError && (
              <Text style={{ fontSize: Typography.size.sm, color: colors.text.muted, marginTop: 6, textAlign: "center", paddingHorizontal: 32 }}>
                {t("Это сбой связи, а не пустой день. Потяните вниз, чтобы обновить.", "Bu aloqa uzilishi, bo'sh kun emas. Yangilash uchun pastga torting.")}
              </Text>
            )}
          </View>
        ) : null}
        renderItem={({ item }) => {
          if (item.type === "header" || item.type === "title") {
            const title = item.type === "title" ? item.title : dayLabel(item.date, lang).toUpperCase();
            return (
              <View style={{ paddingTop: Spacing.md, paddingBottom: Spacing.xs }}>
                <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.xs, color: colors.text.muted, letterSpacing: 0.5 }}>{title}</Text>
              </View>
            );
          }
          if (item.type === "pending") {
            const o = item.order;
            const time = (() => { try { return format(parseISO(o.createdAt), "HH:mm", { locale: ru }); } catch { return ""; } })();
            // Открыть нечего: номера у заказа нет, пока его не принял сервер.
            return (
              <Card style={{ marginBottom: Spacing.xs, opacity: 0.85 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: Spacing.md }}>
                  <View style={{ width: 36, height: 36, borderRadius: Radii.sm, backgroundColor: colors.status.warningDim, alignItems: "center", justifyContent: "center" }}>
                    <Feather name={o.status === "failed" ? "alert-circle" : "clock"} size={16} color={o.status === "failed" ? colors.status.danger : colors.status.warning} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontSize: Typography.size.base, fontFamily: Typography.fontSemibold, color: colors.text.primary }} numberOfLines={1}>{o.shopName}</Text>
                    <Text style={{ fontSize: Typography.size.xs, color: colors.text.muted, marginTop: 2 }}>{time}</Text>
                  </View>
                  <Text style={{ fontSize: Typography.size.md, fontFamily: Typography.fontBold, color: colors.text.primary, fontVariant: ["tabular-nums"] }}>
                    {offlineOrderTotal(o).toLocaleString("ru")}
                  </Text>
                </View>
                <Badge variant={o.status === "failed" ? "danger" : "warning"} style={{ marginTop: Spacing.sm }}>
                  {o.status === "failed" ? t("Сервер отклонил", "Server rad etdi") : t("Ожидает отправки", "Yuborish kutilmoqda")}
                </Badge>
              </Card>
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