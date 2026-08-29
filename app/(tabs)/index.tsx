// Warehouse Pro — Agent Dashboard v2 (cold palette + rings/sparklines)
import React, { useCallback, useMemo, useState } from "react";
import { View, Text, ScrollView, RefreshControl, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { Feather } from "@expo/vector-icons";
import { useAuthStore } from "../../src/store/auth";
import { getPlans, getMyOrders, getRevenueTrend, getDashboardTrends, getDashboardStatusBreakdown, getDashboardActivity, getSmartAlerts, Plan } from "../../src/api";
import { Card } from "../../src/components/ui";
import { ProgressRing, Sparkline, NeumorphicProgressBar, DonutChart, MiniBarChart } from "../../src/components/Charts";
import { Typography, Spacing, Radii, Shadows, KpiColors, ThemeColors, Gradients } from "../../src/theme";
import { useThemeColors, useThemeStore } from "../../src/store/theme";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { FadeInItem, PressableScale, ShimmerSkeleton } from "../../src/components/Animated";
import { money } from "../../src/components/order/OrderStyles";
import { LinearGradient } from "expo-linear-gradient";

type IconName = keyof typeof Feather.glyphMap;

/** «1 заказ», «2 заказа», «5 заказов» — число всегда рядом со словом. */
function ordersWord(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 14) return "заказов";
  const ones = n % 10;
  if (ones === 1) return "заказ";
  if (ones >= 2 && ones <= 4) return "заказа";
  return "заказов";
}

// ── CardDots — 3 colored dots (cold palette) ──────────────────────────────────
function CardDots() {
  return (
    <View style={{ flexDirection: "row", gap: 6, marginBottom: 12 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: KpiColors.coral }} />
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: KpiColors.amber }} />
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: KpiColors.teal }} />
    </View>
  );
}

// Visit and order statuses, worded as they are on the plan and orders tabs so
// the same record doesn't get two different names in two places.
const PLAN_STATUS: Record<string, { icon: "check-circle" | "clock" | "circle"; color: string; bg: string; label: string }> = {
  visited: { icon: "check-circle", color: "#34c473", bg: "rgba(52,196,115,0.12)", label: "Посещён" },
  skipped: { icon: "clock",        color: "#d4973a", bg: "rgba(212,151,58,0.12)", label: "Пропущен" },
  planned: { icon: "circle",       color: "#5b6d8a", bg: "rgba(91,109,138,0.12)", label: "Запланирован" },
};

const ORDER_STATUS: Record<string, { color: string; label: string }> = {
  new:                 { color: "#5b6d8a", label: "Новый" },
  processing:          { color: "#d4973a", label: "В работе" },
  shipped:             { color: "#4a9de8", label: "Отгружен" },
  pending:             { color: "#d4973a", label: "Ожидает" },
  delivered:           { color: "#34c473", label: "Доставлен" },
  partial_return_kept: { color: "#34c473", label: "Частичный возврат" },
  partially_returned:  { color: "#d4973a", label: "Частичный возврат" },
  returned:            { color: "#d45050", label: "Возврат" },
  cancelled:           { color: "#d45050", label: "Отменён" },
};

// ── Agent Home (Premium — matching web Dashboard.tsx style) ────────────────────
function AgentHome() {
  const router = useRouter();
  const { isDark } = useThemeStore();
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();

  const isAgentRole = user?.role === "agent" || user?.role === "supervisor" || user?.role === "ceo" || user?.role === "operator" || user?.role === "merchandiser";

  const { data: revenueTrend, refetch: refetchTrend } = useQuery({
    queryKey: ["revenueTrend"],
    queryFn: () => getRevenueTrend(7),
    retry: false, enabled: isAgentRole,
  });

  // Today's route. getPlans() with no arguments already scopes to today and to
  // the calling agent server-side, so nothing needs passing here.
  const { data: todayPlans, isLoading: plansLoading, isError: plansFailed, refetch: refetchPlans } = useQuery({
    queryKey: ["plans", "today"],
    queryFn: async () => { const r = await getPlans(); return Array.isArray(r) ? r : []; },
    retry: false, enabled: isAgentRole,
  });

  const { data: myOrders, isLoading: ordersLoading, isError: ordersFailed, refetch: refetchOrders } = useQuery({
    queryKey: ["myOrders"], queryFn: getMyOrders, retry: false, enabled: isAgentRole,
  });

  const visitedCount = (todayPlans ?? []).filter(p => p.status === "visited").length;

  // "Мои заказы сегодня" says today, so it has to mean today — the whole list
  // would quietly turn the section into a different thing by tomorrow.
  const todayOrders = useMemo(() => {
    const today = format(new Date(), "yyyy-MM-dd");
    return (myOrders ?? [])
      .filter(o => (o.createdAt ?? "").slice(0, 10) === today)
      .slice(0, 5);
  }, [myOrders]);

  /**
   * Выручка за сегодня.
   *
   * Считается по ВСЕМ сегодняшним заказам, а не по пяти, что показаны в
   * списке ниже: там стоит slice(0, 5) — это витрина, а не итог. Сложить
   * витрину значило бы показывать агенту заниженную сумму ровно с шестого
   * заказа за день, причём молча.
   *
   * Отменённые и возвращённые не в счёт: товар вернулся, денег за него нет.
   *
   * Оговорка про частичный возврат. У заказа со статусом partially_returned
   * поле total — это сумма ЗАКАЗА, а сколько из неё вернули, мобильному
   * приложению сейчас не приходит (см. Order в src/api.ts). Такие заказы
   * считаются целиком, то есть сумма может быть завышена на возвращённую
   * часть. Занижать было бы хуже — агент недосчитается заработанного, — но
   * честно это станет только тогда, когда сервер начнёт отдавать сумму
   * возврата в списке.
   */
  const todayTotals = useMemo(() => {
    const today = format(new Date(), "yyyy-MM-dd");
    const NOT_REVENUE = new Set(["cancelled", "returned"]);
    const counted = (myOrders ?? []).filter(o =>
      (o.createdAt ?? "").slice(0, 10) === today && !NOT_REVENUE.has(o.status));
    return {
      count: counted.length,
      sum: counted.reduce((acc, o) => acc + (Number(o.total) || 0), 0),
    };
  }, [myOrders]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Доброе утро" : hour < 18 ? "Добрый день" : "Добрый вечер";
  const firstName = (user?.name ?? user?.email ?? "Агент").split(" ")[0];

  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([refetchPlans(), refetchOrders(), refetchTrend()]);
    } finally { setRefreshing(false); }
  }, [refetchPlans, refetchOrders, refetchTrend]);

  const scrollRefresh = <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#5b6d8a" />;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: isDark ? "#1c1a17" : "#e8e6e1" }} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: insets.top + 20, paddingBottom: insets.bottom + 100 }} refreshControl={scrollRefresh} showsVerticalScrollIndicator={false}>
      {/* ── Header (matching web) ────────────────────────────────────────── */}
      <FadeInItem delay={0}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <View style={{ flex: 1 }}>
            <CardDots />
            <Text style={{ fontFamily: "DM Sans", fontSize: 13, fontWeight: "500", color: "#5b6d8a" }}>{greeting}, {firstName}</Text>
            <Text style={{ fontFamily: "DM Sans", fontSize: 26, fontWeight: "700", color: isDark ? "#ede9e3" : "#2d3748", marginTop: 4, letterSpacing: -0.5 }}>Мой день</Text>
            <Text style={{ fontFamily: "DM Sans", fontSize: 13, color: isDark ? "#8a8478" : "#5a6a7f", marginTop: 4, textTransform: "capitalize" }}>
              {format(new Date(), "EEEE, d MMMM yyyy", { locale: ru })}
            </Text>
          </View>
          <PressableScale onPress={() => router.push("/profile")} haptic="light">
            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: isDark ? "rgba(0,153,204,0.12)" : "rgba(91,109,138,0.1)", alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#5b6d8a" }}>
              <Text style={{ fontFamily: "DM Sans", fontWeight: "700", fontSize: 18, color: "#5b6d8a" }}>{firstName.charAt(0).toUpperCase()}</Text>
            </View>
          </PressableScale>
        </View>
      </FadeInItem>

      {/* ── Today's visits ───────────────────────────────────────────────── */}
      {/* The route is the agent's day. It used to live only behind the plan tab,
          so the screen called "Мой день" opened without any of it. Rows go to
          the shop, which is where the agent acts on a visit; marking one done
          stays on the plan tab rather than being duplicated here. */}
      <FadeInItem delay={60}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Feather name="map-pin" size={16} color="#5b6d8a" />
            <Text style={{ fontFamily: "DM Sans", fontWeight: "700", fontSize: 16, color: isDark ? "#ede9e3" : "#2d3748" }}>Визиты сегодня</Text>
            {(todayPlans?.length ?? 0) > 0 && (
              <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, backgroundColor: isDark ? "rgba(0,153,204,0.12)" : "rgba(91,109,138,0.1)" }}>
                <Text style={{ fontFamily: "DM Sans", fontWeight: "700", fontSize: 11, color: "#5b6d8a" }}>
                  {visitedCount} / {todayPlans?.length ?? 0}
                </Text>
              </View>
            )}
          </View>
          <PressableScale onPress={() => router.push("/(tabs)/plan")} haptic="light">
            <Feather name="arrow-right" size={16} color={isDark ? "#8a8478" : "#8b9bb4"} />
          </PressableScale>
        </View>
        <View style={{ backgroundColor: isDark ? "#221f1c" : "#efedea", borderRadius: 20, overflow: "hidden", marginBottom: 16, borderWidth: 1, borderColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.5)" }}>
          {plansLoading ? (
            <View style={{ padding: 16, gap: 10 }}>
              <ShimmerSkeleton height={44} radius={Radii.md} />
              <ShimmerSkeleton height={44} radius={Radii.md} />
            </View>
          ) : plansFailed ? (
            /* Сбой связи — не пустой маршрут.
               Раньше этой ветки не было: при неудачном запросе список выходил
               пустым, и экран честно писал «На сегодня визитов нет». Агент,
               открывший приложение в подвале магазина, делал единственный
               разумный вывод — что маршрут не назначили — и уезжал.
               Так же уже обжигался экран доставок, там ветка появилась. */
            <View style={{ padding: 24, alignItems: "center", gap: 8 }}>
              <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)", alignItems: "center", justifyContent: "center" }}>
                <Feather name="wifi-off" size={20} color={isDark ? "#8a8478" : "#8b9bb4"} />
              </View>
              <Text style={{ fontFamily: "DM Sans", fontWeight: "600", fontSize: 13, color: isDark ? "#ede9e3" : "#2d3748" }}>Не удалось загрузить визиты</Text>
              <Text style={{ fontFamily: "DM Sans", fontSize: 12, color: isDark ? "#a39d92" : "#5a6a7f", textAlign: "center" }}>
                Это сбой связи, а не пустой маршрут. Потяните вниз, чтобы обновить.
              </Text>
            </View>
          ) : (todayPlans?.length ?? 0) === 0 ? (
            <View style={{ padding: 24, alignItems: "center", gap: 8 }}>
              <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)", alignItems: "center", justifyContent: "center" }}>
                <Feather name="map-pin" size={20} color={isDark ? "#8a8478" : "#8b9bb4"} />
              </View>
              <Text style={{ fontFamily: "DM Sans", fontWeight: "500", fontSize: 13, color: isDark ? "#8a8478" : "#5a6a7f" }}>На сегодня визитов нет</Text>
            </View>
          ) : (
            (todayPlans ?? []).slice(0, 5).map((plan, i) => {
              const meta = PLAN_STATUS[plan.status] ?? PLAN_STATUS.planned;
              return (
                <PressableScale
                  key={plan.id}
                  haptic="light"
                  onPress={() => { if (plan.shopId) router.push(`/shop/${plan.shopId}`); else router.push("/(tabs)/plan"); }}
                >
                  <View style={{
                    flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 14,
                    borderTopWidth: i === 0 ? 0 : 1,
                    borderTopColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)",
                    opacity: plan.status === "visited" ? 0.6 : 1,
                  }}>
                    <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: meta.bg, alignItems: "center", justifyContent: "center" }}>
                      <Feather name={meta.icon} size={14} color={meta.color} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1} style={{ fontFamily: "DM Sans", fontWeight: "600", fontSize: 14, color: isDark ? "#ede9e3" : "#2d3748" }}>
                        {plan.shopName ?? "Магазин"}
                      </Text>
                      {plan.shopAddress ? (
                        <Text numberOfLines={1} style={{ fontFamily: "DM Sans", fontSize: 12, color: isDark ? "#8a8478" : "#8b9bb4", marginTop: 2 }}>
                          {plan.shopAddress}
                        </Text>
                      ) : null}
                    </View>
                    <Text style={{ fontFamily: "DM Sans", fontWeight: "600", fontSize: 11, color: meta.color }}>{meta.label}</Text>
                  </View>
                </PressableScale>
              );
            })
          )}
        </View>
      </FadeInItem>

      {/* ── Revenue sparkline card (matching web) ────────────────────────── */}
      <FadeInItem delay={120}>
        <View style={{ backgroundColor: isDark ? "#221f1c" : "#efedea", borderRadius: 24, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.5)" }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <View>
              <Text style={{ fontFamily: "DM Sans", fontWeight: "700", fontSize: 16, color: isDark ? "#ede9e3" : "#2d3748" }}>Динамика продаж</Text>
              <Text style={{ fontFamily: "DM Sans", fontSize: 12, color: isDark ? "#8a8478" : "#8b9bb4", marginTop: 3 }}>Выручка за 7 дней</Text>
            </View>
            <View style={{ flexDirection: "row", gap: 6 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#c06080" }} />
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#c49530" }} />
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#3a9a8a" }} />
            </View>
          </View>
          <Sparkline data={revenueTrend?.length ? revenueTrend : [0]} color="#5b6d8a" width={320} height={60} />
        </View>
      </FadeInItem>

      {/* ── Quick Actions (matching web style) ────────────────────────────── */}
      <FadeInItem delay={180}>
        <View style={{ flexDirection: "row", gap: 12, marginBottom: 16 }}>
          <PressableScale onPress={() => router.push("/order/new")} haptic="light" style={{ flex: 1 }}>
            <LinearGradient colors={["#5b6d8a", "#7a8fa8"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={{ alignItems: "center", justifyContent: "center", paddingVertical: 20, borderRadius: 20, gap: 10 }}>
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" }}>
                <Feather name="plus-circle" size={20} color="#fff" />
              </View>
              <Text style={{ fontSize: 11, fontFamily: "DM Sans", fontWeight: "700", color: "#fff", letterSpacing: 1 }}>НОВЫЙ ЗАКАЗ</Text>
            </LinearGradient>
          </PressableScale>
          <PressableScale onPress={() => router.push("/(tabs)/shops")} haptic="light" style={{ flex: 1 }}>
            <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: 20, borderRadius: 20, gap: 10, backgroundColor: isDark ? "#221f1c" : "#efedea", borderWidth: 1, borderColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.5)" }}>
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: isDark ? "rgba(0,153,204,0.12)" : "rgba(91,109,138,0.1)", alignItems: "center", justifyContent: "center" }}>
                <Feather name="shopping-bag" size={20} color="#5b6d8a" />
              </View>
              <Text style={{ fontSize: 11, fontFamily: "DM Sans", fontWeight: "700", color: isDark ? "#ede9e3" : "#2d3748", letterSpacing: 1 }}>МАГАЗИНЫ</Text>
            </View>
          </PressableScale>
        </View>
        <View style={{ flexDirection: "row", gap: 12, marginBottom: 16 }}>
          <PressableScale onPress={() => router.push("/(tabs)/gps")} haptic="light" style={{ flex: 1 }}>
            <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: 16, borderRadius: 16, gap: 8, backgroundColor: isDark ? "#221f1c" : "#efedea", borderWidth: 1, borderColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.5)" }}>
              <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: isDark ? "rgba(0,230,138,0.12)" : "rgba(52,196,115,0.1)", alignItems: "center", justifyContent: "center" }}>
                <Feather name="navigation" size={16} color="#34c473" />
              </View>
              <Text style={{ fontSize: 10, fontFamily: "DM Sans", fontWeight: "700", color: isDark ? "#ede9e3" : "#2d3748", letterSpacing: 0.5 }}>GPS</Text>
            </View>
          </PressableScale>
          <PressableScale onPress={() => router.push("/(tabs)/barcode")} haptic="light" style={{ flex: 1 }}>
            <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: 16, borderRadius: 16, gap: 8, backgroundColor: isDark ? "#221f1c" : "#efedea", borderWidth: 1, borderColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.5)" }}>
              <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: isDark ? "rgba(0,153,204,0.12)" : "rgba(91,109,138,0.1)", alignItems: "center", justifyContent: "center" }}>
                <Feather name="maximize" size={16} color="#5b6d8a" />
              </View>
              <Text style={{ fontSize: 10, fontFamily: "DM Sans", fontWeight: "700", color: isDark ? "#ede9e3" : "#2d3748", letterSpacing: 0.5 }}>БАРКОД</Text>
            </View>
          </PressableScale>
          <PressableScale onPress={() => router.push("/(tabs)/profile")} haptic="light" style={{ flex: 1 }}>
            <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: 16, borderRadius: 16, gap: 8, backgroundColor: isDark ? "#221f1c" : "#efedea", borderWidth: 1, borderColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.5)" }}>
              <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: isDark ? "rgba(0,180,255,0.12)" : "rgba(74,157,232,0.1)", alignItems: "center", justifyContent: "center" }}>
                <Feather name="user" size={16} color="#4a9de8" />
              </View>
              <Text style={{ fontSize: 10, fontFamily: "DM Sans", fontWeight: "700", color: isDark ? "#ede9e3" : "#2d3748", letterSpacing: 0.5 }}>ПРОФИЛЬ</Text>
            </View>
          </PressableScale>
        </View>
      </FadeInItem>

      {/* ── Recent Orders (matching web) ─────────────────────────────────── */}
      <FadeInItem delay={240}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Feather name="clipboard" size={16} color="#5b6d8a" />
            <Text style={{ fontFamily: "DM Sans", fontWeight: "700", fontSize: 16, color: isDark ? "#ede9e3" : "#2d3748" }}>Мои заказы сегодня</Text>
          </View>
          <PressableScale onPress={() => router.push("/(tabs)/orders")} haptic="light">
            <Feather name="arrow-right" size={16} color={isDark ? "#8a8478" : "#8b9bb4"} />
          </PressableScale>
        </View>
        {/* Итог дня — над списком.
            Агент за смену спрашивает себя ровно об этом: сколько сегодня
            наторговал. Раньше в приложении этого числа не было нигде: заказы
            он видел по одному, а складывать их приходилось в уме.

            Сбой связи НЕ рисуется нулём. Пустой ответ и не пришедший ответ
            выглядят на экране одинаково — «0 сум», — и агент решает, что день
            пустой, хотя это просто нет сети в подвале магазина. Ровно на этом
            уже обжигались соседние экраны: «На сегодня визитов нет» вместо
            «связь пропала». */}
        {isAgentRole && (
          <View style={{
            backgroundColor: isDark ? "#221f1c" : "#efedea",
            borderRadius: 20, padding: 16, marginBottom: 12,
            borderWidth: 1, borderColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.5)",
            flexDirection: "row", alignItems: "center", justifyContent: "space-between",
          }}>
            <View style={{ flex: 1 }}>
              {/* Подпись 12-м, а не восьмым: восьмой на солнце не читается, и
                  от показателя остаётся голое число без имени. */}
              <Text style={{ fontFamily: "DM Sans", fontWeight: "600", fontSize: 12, letterSpacing: 0.6, color: isDark ? "#a39d92" : "#5b6d8a" }}>
                ВЫРУЧКА ЗА СЕГОДНЯ
              </Text>
              {ordersFailed ? (
                <>
                  <Text style={{ fontFamily: "DM Sans", fontWeight: "700", fontSize: 22, marginTop: 4, color: isDark ? "#a39d92" : "#5b6d8a" }}>
                    —
                  </Text>
                  <Text style={{ fontFamily: "DM Sans", fontSize: 13, marginTop: 2, color: isDark ? "#a39d92" : "#5b6d8a" }}>
                    Нет связи — потяните вниз, чтобы обновить
                  </Text>
                </>
              ) : ordersLoading ? (
                <ShimmerSkeleton width={160} height={26} radius={8} style={{ marginTop: 6 }} />
              ) : (
                <>
                  <Text style={{ fontFamily: "DM Sans", fontWeight: "800", fontSize: 24, marginTop: 4, color: isDark ? "#ede9e3" : "#2d3748" }}>
                    {money(todayTotals.sum)}
                  </Text>
                  <Text style={{ fontFamily: "DM Sans", fontSize: 13, marginTop: 2, color: isDark ? "#a39d92" : "#5b6d8a" }}>
                    {todayTotals.count === 0
                      ? "заказов ещё нет"
                      : `${todayTotals.count} ${ordersWord(todayTotals.count)}`}
                  </Text>
                </>
              )}
            </View>
            <View style={{
              width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center",
              backgroundColor: isDark ? "rgba(201,162,39,0.16)" : "rgba(201,162,39,0.12)",
            }}>
              <Feather name="trending-up" size={20} color="#c9a227" />
            </View>
          </View>
        )}

        {/* This section was a hardcoded "Создайте первый заказ" panel — it never
            queried anything, so it read as empty however many orders the agent
            had actually placed that day. */}
        <View style={{ backgroundColor: isDark ? "#221f1c" : "#efedea", borderRadius: 20, overflow: "hidden", borderWidth: 1, borderColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.5)" }}>
          {ordersLoading ? (
            <View style={{ padding: 16, gap: 10 }}>
              <ShimmerSkeleton height={44} radius={Radii.md} />
              <ShimmerSkeleton height={44} radius={Radii.md} />
            </View>
          ) : todayOrders.length === 0 ? (
            <View style={{ padding: 24, alignItems: "center", gap: 8 }}>
              <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)", alignItems: "center", justifyContent: "center" }}>
                <Feather name="clipboard" size={20} color={isDark ? "#8a8478" : "#8b9bb4"} />
              </View>
              <Text style={{ fontFamily: "DM Sans", fontWeight: "500", fontSize: 13, color: isDark ? "#8a8478" : "#5a6a7f" }}>
                {ordersFailed
                  ? "Не удалось загрузить заказы — это сбой связи"
                  : (myOrders?.length ?? 0) > 0 ? "Сегодня заказов ещё нет" : "Создайте первый заказ"}
              </Text>
            </View>
          ) : (
            todayOrders.map((order, i) => {
              const meta = ORDER_STATUS[order.status] ?? ORDER_STATUS.new;
              return (
                <PressableScale key={order.id} haptic="light" onPress={() => router.push(`/order/${order.id}`)}>
                  <View style={{
                    flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 14,
                    borderTopWidth: i === 0 ? 0 : 1,
                    borderTopColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)",
                  }}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1} style={{ fontFamily: "DM Sans", fontWeight: "600", fontSize: 14, color: isDark ? "#ede9e3" : "#2d3748" }}>
                        {order.shopName ?? order.orderNumber}
                      </Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: meta.color }} />
                        <Text style={{ fontFamily: "DM Sans", fontSize: 12, color: isDark ? "#8a8478" : "#8b9bb4" }}>{meta.label}</Text>
                      </View>
                    </View>
                    <Text style={{ fontFamily: "DM Sans", fontWeight: "700", fontSize: 14, color: isDark ? "#ede9e3" : "#2d3748" }} numberOfLines={1}>
                      {Number(order.total ?? 0).toLocaleString("ru")}
                    </Text>
                  </View>
                </PressableScale>
              );
            })
          )}
        </View>
      </FadeInItem>
    </ScrollView>
  );
}

// ── Status colors (matching web Dashboard.tsx) ────────────────────────────────
const STATUS_COLOR: Record<string, string> = {
  new: "#5b6d8a", processing: "#d4973a", completed: "#34c473", cancelled: "#d45050",
};
const STATUS_LABEL: Record<string, string> = {
  new: "Новые", processing: "В работе", completed: "Выполнены", cancelled: "Отменены",
};

// ── Alert icon mapping ────────────────────────────────────────────────────────
function AlertIcon({ severity, size = 14 }: { severity: string; size?: number }) {
  if (severity === "danger") return <Feather name="alert-circle" size={size} color="#d45050" />;
  if (severity === "warning") return <Feather name="trending-down" size={size} color="#d4973a" />;
  return <Feather name="trending-up" size={size} color="#4a9de8" />;
}

// ── Supervisor Home (Premium — matching web Dashboard.tsx) ─────────────────────
function SupervisorHome() {
  const router = useRouter();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();
  const [refreshing, setRefreshing] = useState(false);
  const [range, setRange] = useState<"7d" | "30d" | "month">("7d");

  // Dashboard queries
  const { data: trends, refetch } = useQuery({
    queryKey: ["dashboardTrends", range], queryFn: () => getDashboardTrends(range), retry: false,
  });

  const { data: statusData } = useQuery({
    queryKey: ["dashboardStatus"], queryFn: getDashboardStatusBreakdown, retry: false,
  });

  const { data: activity } = useQuery({
    queryKey: ["dashboardActivity"], queryFn: getDashboardActivity, retry: false,
  });

  const { data: alerts } = useQuery({
    queryKey: ["smartAlerts"], queryFn: getSmartAlerts, retry: false,
  });

  // Derived data
  const revenueTrend = (trends ?? []).slice(-7).map(t => Number(t.revenue));
  const ordersTrend = (trends ?? []).slice(-7).map(t => t.orderCount);
  const statusTotal = (statusData ?? []).reduce((s, d) => s + d.count, 0) || 1;

  const donutSegments = (statusData ?? []).map((s) => ({
    value: s.count,
    color: STATUS_COLOR[s.status] ?? "#5b6d8a",
    label: STATUS_LABEL[s.status] ?? s.status,
  }));

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Доброе утро" : hour < 18 ? "Добрый день" : "Добрый вечер";
  const firstName = (user?.name ?? user?.email ?? "").split(" ")[0];

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await refetch(); } finally { setRefreshing(false); }
  }, [refetch]);

  const scrollRefresh = <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.brand.primary} />;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg.primary }} contentContainerStyle={{ paddingHorizontal: Spacing.base, paddingTop: insets.top + Spacing.lg, paddingBottom: insets.bottom + 100 }} refreshControl={scrollRefresh} showsVerticalScrollIndicator={false}>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <FadeInItem delay={0}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: Spacing.lg }}>
          <View style={{ flex: 1 }}>
            <CardDots />
            <Text style={{ fontSize: Typography.size.sm, fontFamily: Typography.fontMedium, color: colors.accent.primary }}>{greeting}, {firstName}</Text>
            <Text style={{ fontSize: Typography.size.xxl, fontFamily: Typography.fontExtraBold, color: colors.text.primary, marginTop: 2 }}>Главная</Text>
            <Text style={{ fontSize: Typography.size.xs, fontFamily: Typography.fontBody, color: colors.text.tertiary, marginTop: 2, textTransform: "capitalize" }}>
              {format(new Date(), "EEEE, d MMMM yyyy", { locale: ru })}
            </Text>
          </View>
          <PressableScale onPress={() => router.push("/profile")} haptic="light">
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brand.primaryDim, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.brand.primary }}>
              <Text style={{ fontFamily: Typography.fontBold, fontSize: 16, color: colors.brand.primary }}>{firstName.charAt(0).toUpperCase()}</Text>
            </View>
          </PressableScale>
        </View>
      </FadeInItem>

      {/* ── Smart Alerts ────────────────────────────────────────────────── */}
      {alerts && alerts.length > 0 && (
        <FadeInItem delay={60}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: Spacing.base }} contentContainerStyle={{ gap: Spacing.sm }}>
            {alerts.slice(0, 4).map((alert, i) => {
              const alertColors: Record<string, { bg: string; border: string }> = {
                info: { bg: colors.status.infoDim, border: colors.status.info },
                warning: { bg: colors.status.warningDim, border: colors.status.warning },
                danger: { bg: colors.status.dangerDim, border: colors.status.danger },
              };
              const ac = alertColors[alert.severity] ?? alertColors.info;
              return (
                <Card key={i} style={{ minWidth: 220, padding: 14, borderLeftWidth: 3, borderLeftColor: ac.border }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: ac.bg, alignItems: "center", justifyContent: "center" }}>
                      <AlertIcon severity={alert.severity} size={14} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: Typography.fontSemibold, fontSize: Typography.size.sm, color: colors.text.primary }} numberOfLines={1}>{alert.title}</Text>
                      <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.xs, color: colors.text.tertiary, marginTop: 2 }} numberOfLines={2}>{alert.message}</Text>
                    </View>
                  </View>
                </Card>
              );
            })}
          </ScrollView>
        </FadeInItem>
      )}

      {/* ── Sales Dynamics Chart ─────────────────────────────────────────── */}
      <FadeInItem delay={100}>
        <Card style={{ marginBottom: Spacing.base }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <View>
              <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.base, color: colors.text.primary }}>Динамика продаж</Text>
              <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.xs, color: colors.text.tertiary, marginTop: 2 }}>Выручка и заказы</Text>
            </View>
            <View style={{ flexDirection: "row", backgroundColor: colors.bg.elevated, borderRadius: Radii.full, padding: 2 }}>
              {(["7d", "30d", "month"] as const).map(r => (
                <PressableScale key={r} onPress={() => setRange(r)} haptic="light" scaleTo={0.95}>
                  <View style={{ paddingVertical: 6, paddingHorizontal: 12, borderRadius: Radii.full, backgroundColor: range === r ? colors.brand.primary : "transparent" }}>
                    <Text style={{ fontFamily: Typography.fontSemibold, fontSize: 11, color: range === r ? "#fff" : colors.text.tertiary }}>{r === "7d" ? "7д" : r === "30d" ? "30д" : "Месяц"}</Text>
                  </View>
                </PressableScale>
              ))}
            </View>
          </View>
          <View style={{ marginBottom: 12 }}>
            <Sparkline data={revenueTrend.length ? revenueTrend : [0]} color="#5b6d8a" width={320} height={50} />
          </View>
          <View>
            <Sparkline data={ordersTrend.length ? ordersTrend : [0]} color="#34c473" width={320} height={40} />
          </View>
          <View style={{ flexDirection: "row", justifyContent: "center", gap: 20, marginTop: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#5b6d8a" }} />
              <Text style={{ fontFamily: Typography.fontMedium, fontSize: 11, color: colors.text.tertiary }}>Выручка</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#34c473" }} />
              <Text style={{ fontFamily: Typography.fontMedium, fontSize: 11, color: colors.text.tertiary }}>Заказы</Text>
            </View>
          </View>
        </Card>
      </FadeInItem>

      {/* ── Order Status Donut ───────────────────────────────────────────── */}
      <FadeInItem delay={140}>
        <Card style={{ marginBottom: Spacing.base }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <Feather name="pie-chart" size={16} color={colors.accent.primary} />
            <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.base, color: colors.text.primary }}>Статусы заказов</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 20 }}>
            <DonutChart segments={donutSegments} size={120} strokeWidth={18} centerLabel={String(statusTotal)} centerSublabel="заказов" />
            <View style={{ flex: 1, gap: 8 }}>
              {donutSegments.map((seg, i) => (
                <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: seg.color }} />
                  <Text style={{ fontFamily: Typography.fontMedium, fontSize: 12, color: colors.text.secondary, flex: 1 }} numberOfLines={1}>{seg.label}</Text>
                  <Text style={{ fontFamily: Typography.fontBold, fontSize: 12, color: colors.text.primary }}>{seg.value}</Text>
                </View>
              ))}
            </View>
          </View>
        </Card>
      </FadeInItem>

      {/* ── Quick Actions (no create order) ──────────────────────────────── */}
      <FadeInItem delay={180}>
        <View style={{ flexDirection: "row", gap: Spacing.sm, marginBottom: Spacing.base }}>
          <PressableScale onPress={() => router.push("/(tabs)/tracking")} haptic="light" style={{ flex: 1 }}>
            <LinearGradient colors={Gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={{ alignItems: "center", justifyContent: "center", paddingVertical: Spacing.lg, borderRadius: Radii.lg, gap: 8 }}>
              <View style={{ width: 36, height: 36, borderRadius: Radii.md, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" }}>
                <Feather name="map-pin" size={18} color="#fff" />
              </View>
              <Text style={{ fontSize: Typography.size.xs, fontFamily: Typography.fontBold, color: "#fff", letterSpacing: 1 }}>ТРЕКИНГ</Text>
            </LinearGradient>
          </PressableScale>
          <PressableScale onPress={() => router.push("/(tabs)/plans")} haptic="light" style={{ flex: 1 }}>
            <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: Spacing.lg, borderRadius: Radii.lg, gap: 8, backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.default }}>
              <View style={{ width: 36, height: 36, borderRadius: Radii.md, backgroundColor: colors.brand.primaryDim, alignItems: "center", justifyContent: "center" }}>
                <Feather name="calendar" size={18} color={colors.brand.primaryLight} />
              </View>
              <Text style={{ fontSize: Typography.size.xs, fontFamily: Typography.fontBold, color: colors.text.primary, letterSpacing: 1 }}>ПЛАНЫ</Text>
            </View>
          </PressableScale>
        </View>
        <View style={{ flexDirection: "row", gap: Spacing.sm, marginBottom: Spacing.base }}>
          <PressableScale onPress={() => router.push("/(tabs)/shops")} haptic="light" style={{ flex: 1 }}>
            <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: Spacing.md, borderRadius: Radii.lg, gap: 6, backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.default }}>
              <View style={{ width: 32, height: 32, borderRadius: Radii.sm, backgroundColor: colors.brand.primaryDim, alignItems: "center", justifyContent: "center" }}>
                <Feather name="shopping-bag" size={16} color={colors.accent.primary} />
              </View>
              <Text style={{ fontSize: Typography.size.xs, fontFamily: Typography.fontBold, color: colors.text.primary, letterSpacing: 0.5 }}>МАГАЗИНЫ</Text>
            </View>
          </PressableScale>
          <PressableScale onPress={() => router.push("/(tabs)/profile")} haptic="light" style={{ flex: 1 }}>
            <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: Spacing.md, borderRadius: Radii.lg, gap: 6, backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border.default }}>
              <View style={{ width: 32, height: 32, borderRadius: Radii.sm, backgroundColor: colors.status.infoDim, alignItems: "center", justifyContent: "center" }}>
                <Feather name="user" size={16} color={colors.status.info} />
              </View>
              <Text style={{ fontSize: Typography.size.xs, fontFamily: Typography.fontBold, color: colors.text.primary, letterSpacing: 0.5 }}>ПРОФИЛЬ</Text>
            </View>
          </PressableScale>
        </View>
      </FadeInItem>

      {/* ── Recent Orders ────────────────────────────────────────────────── */}
      <FadeInItem delay={220}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Feather name="clipboard" size={16} color={colors.accent.primary} />
            <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.base, color: colors.text.primary }}>Последние заказы</Text>
          </View>
          <Text style={{ fontFamily: Typography.fontMedium, fontSize: Typography.size.xs, color: colors.text.tertiary }}>{activity?.length ?? 0} заказов</Text>
        </View>
        <Card style={{ padding: 0, overflow: "hidden" }}>
          {!activity?.length ? (
            <View style={{ padding: Spacing.xl, alignItems: "center", gap: 8 }}>
              <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.bg.elevated, alignItems: "center", justifyContent: "center" }}>
                <Feather name="clipboard" size={20} color={colors.text.muted} />
              </View>
              <Text style={{ fontFamily: Typography.fontMedium, fontSize: Typography.size.sm, color: colors.text.muted }}>Заказов пока нет</Text>
            </View>
          ) : (
            activity.slice(0, 10).map((order, idx) => (
              <TouchableOpacity key={order.id} activeOpacity={0.7} onPress={() => router.push(`/order/${order.id}`)}>
                <View style={{ flexDirection: "row", alignItems: "center", padding: 14, gap: 12 }}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: STATUS_COLOR[order.status] ?? colors.border.default }} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontFamily: Typography.fontSemibold, fontSize: Typography.size.base, color: colors.text.primary }} numberOfLines={1}>{order.agentName ?? "—"}</Text>
                    <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.xs, color: colors.text.tertiary, marginTop: 2 }}>
                      #{order.orderNumber} · {order.createdAt ? format(new Date(order.createdAt), "HH:mm") : ""}
                    </Text>
                  </View>
                  <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.base, color: colors.text.primary }}>
                    {Number(order.total).toLocaleString("ru")}
                  </Text>
                </View>
                {idx < Math.min(activity.length, 10) - 1 && <View style={{ height: 1, backgroundColor: colors.border.subtle, marginLeft: 36 }} />}
              </TouchableOpacity>
            ))
          )}
        </Card>
      </FadeInItem>
    </ScrollView>
  );
}

// ── Courier Home (Premium — matching web Dashboard.tsx style) ──────────────────
const COURIER_STATUS: Record<string, { icon: IconName; label: string; color: string }> = {
  assigned:         { icon: "package",     label: "Назначен",   color: "#4a9de8" },
  out_for_delivery: { icon: "truck",       label: "В пути",     color: "#d4973a" },
  delivered:        { icon: "check-circle", label: "Доставлен", color: "#34c473" },
  failed:           { icon: "x-circle",    label: "Ошибка",     color: "#d45050" },
};

function CourierHome() {
  const router = useRouter();
  const { isDark } = useThemeStore();
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();

  const { data: deliveries, isLoading, refetch } = useQuery({
    queryKey: ["myDeliveries"],
    queryFn: () => import("../../src/api").then(m => m.listMyDeliveries()),
    retry: false,
  });
  const [refreshing, setRefreshing] = useState(false);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Доброе утро" : hour < 18 ? "Добрый день" : "Добрый вечер";
  const firstName = (user?.name ?? user?.email ?? "Курьер").split(" ")[0];

  const assigned = (deliveries ?? []).filter(d => d.deliveryStatus === "assigned").length;
  const inTransit = (deliveries ?? []).filter(d => d.deliveryStatus === "out_for_delivery").length;
  const delivered = (deliveries ?? []).filter(d => d.deliveryStatus === "delivered").length;
  const total = (deliveries ?? []).length;
  const deliveryPct = total > 0 ? Math.round((delivered / total) * 100) : 0;

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await refetch(); } finally { setRefreshing(false); }
  }, [refetch]);

  const scrollRefresh = <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#5b6d8a" />;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: isDark ? "#1c1a17" : "#e8e6e1" }} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: insets.top + 20, paddingBottom: insets.bottom + 100 }} refreshControl={scrollRefresh} showsVerticalScrollIndicator={false}>
      {/* ── Header (matching web) ────────────────────────────────────────── */}
      <FadeInItem delay={0}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <View style={{ flex: 1 }}>
            <CardDots />
            <Text style={{ fontFamily: "DM Sans", fontSize: 13, fontWeight: "500", color: "#5b6d8a" }}>{greeting}, {firstName}</Text>
            <Text style={{ fontFamily: "DM Sans", fontSize: 26, fontWeight: "700", color: isDark ? "#ede9e3" : "#2d3748", marginTop: 4, letterSpacing: -0.5 }}>Доставки</Text>
            <Text style={{ fontFamily: "DM Sans", fontSize: 13, color: isDark ? "#8a8478" : "#5a6a7f", marginTop: 4, textTransform: "capitalize" }}>
              {format(new Date(), "EEEE, d MMMM yyyy", { locale: ru })}
            </Text>
          </View>
          <PressableScale onPress={() => router.push("/profile")} haptic="light">
            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: isDark ? "rgba(0,153,204,0.12)" : "rgba(91,109,138,0.1)", alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#5b6d8a" }}>
              <Text style={{ fontFamily: "DM Sans", fontWeight: "700", fontSize: 18, color: "#5b6d8a" }}>{firstName.charAt(0).toUpperCase()}</Text>
            </View>
          </PressableScale>
        </View>
      </FadeInItem>

      {/* ── KPI Cards (matching web kpi-hero style) ──────────────────────── */}
      <FadeInItem delay={60}>
        {isLoading ? (
          <View style={{ gap: 12, marginBottom: 16 }}>
            <View style={{ flexDirection: "row", gap: 12 }}>
              <ShimmerSkeleton height={140} style={{ flex: 1 }} radius={Radii.xl} />
              <ShimmerSkeleton height={140} style={{ flex: 1 }} radius={Radii.xl} />
            </View>
            <View style={{ flexDirection: "row", gap: 12 }}>
              <ShimmerSkeleton height={140} style={{ flex: 1 }} radius={Radii.xl} />
              <ShimmerSkeleton height={140} style={{ flex: 1 }} radius={Radii.xl} />
            </View>
          </View>
        ) : (
          <View style={{ gap: 12, marginBottom: 16 }}>
            {/* Row 1: Assigned + In Transit */}
            <View style={{ flexDirection: "row", gap: 12 }}>
              {/* Assigned */}
              <View style={{ flex: 1, backgroundColor: isDark ? "#221f1c" : "#efedea", borderRadius: 24, padding: 16, borderWidth: 1, borderColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.5)" }}>
                <CardDots />
                <Text style={{ fontFamily: "DM Sans", fontWeight: "600", fontSize: 9, color: isDark ? "#8a8478" : "#8b9bb4", letterSpacing: 1, textTransform: "uppercase" }}>ОЖИДАЮТ</Text>
                <Text style={{ fontFamily: "DM Sans", fontWeight: "700", fontSize: 28, color: "#4a9de8", marginTop: 8 }}>{assigned}</Text>
                <View style={{ marginTop: 8 }}>
                  <MiniBarChart data={[assigned, inTransit, delivered]} color="#4a9de8" width={100} height={28} />
                </View>
              </View>
              {/* In Transit */}
              <View style={{ flex: 1, backgroundColor: isDark ? "#221f1c" : "#efedea", borderRadius: 24, padding: 16, borderWidth: 1, borderColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.5)" }}>
                <CardDots />
                <Text style={{ fontFamily: "DM Sans", fontWeight: "600", fontSize: 9, color: isDark ? "#8a8478" : "#8b9bb4", letterSpacing: 1, textTransform: "uppercase" }}>В ПУТИ</Text>
                <Text style={{ fontFamily: "DM Sans", fontWeight: "700", fontSize: 28, color: "#d4973a", marginTop: 8 }}>{inTransit}</Text>
                <View style={{ marginTop: 8 }}>
                  <MiniBarChart data={[assigned, inTransit, delivered]} color="#d4973a" width={100} height={28} />
                </View>
              </View>
            </View>
            {/* Row 2: Delivered + Progress */}
            <View style={{ flexDirection: "row", gap: 12 }}>
              {/* Delivered */}
              <View style={{ flex: 1, backgroundColor: isDark ? "#221f1c" : "#efedea", borderRadius: 24, padding: 16, borderWidth: 1, borderColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.5)" }}>
                <CardDots />
                <Text style={{ fontFamily: "DM Sans", fontWeight: "600", fontSize: 9, color: isDark ? "#8a8478" : "#8b9bb4", letterSpacing: 1, textTransform: "uppercase" }}>ДОСТАВЛЕНО</Text>
                <Text style={{ fontFamily: "DM Sans", fontWeight: "700", fontSize: 28, color: "#34c473", marginTop: 8 }}>{delivered}</Text>
              </View>
              {/* Progress ring */}
              <View style={{ flex: 1, backgroundColor: isDark ? "#221f1c" : "#efedea", borderRadius: 24, padding: 16, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.5)" }}>
                <ProgressRing value={deliveryPct} size={64} strokeWidth={6} color={deliveryPct >= 80 ? "#34c473" : "#5b6d8a"} />
                <Text style={{ fontFamily: "DM Sans", fontWeight: "600", fontSize: 10, color: isDark ? "#8a8478" : "#5a6a7f", marginTop: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>Прогресс</Text>
              </View>
            </View>
          </View>
        )}
      </FadeInItem>

      {/* ── Progress bar card (matching web) ──────────────────────────────── */}
      <FadeInItem delay={120}>
        <View style={{ backgroundColor: isDark ? "#221f1c" : "#efedea", borderRadius: 24, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.5)" }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <Text style={{ fontFamily: "DM Sans", fontWeight: "600", fontSize: 10, color: isDark ? "#8a8478" : "#8b9bb4", letterSpacing: 1, textTransform: "uppercase" }}>ПРОГРЕСС ДНЯ</Text>
            <Text style={{ fontFamily: "DM Sans", fontWeight: "700", fontSize: 13, color: deliveryPct >= 80 ? "#34c473" : "#5b6d8a" }}>
              {delivered}/{total} · {deliveryPct}%
            </Text>
          </View>
          <NeumorphicProgressBar value={deliveryPct} height={10} color={deliveryPct >= 80 ? "#34c473" : "#5b6d8a"} />
          <Text style={{ fontFamily: "DM Sans", fontSize: 12, color: isDark ? "#8a8478" : "#5a6a7f", marginTop: 10 }}>
            {total === 0 ? "Нет заказов на сегодня" : delivered === total ? "Все доставлены!" : `Осталось ${total - delivered}`}
          </Text>
        </View>
      </FadeInItem>

      {/* ── Quick Actions (matching web) ───────────────────────────────────── */}
      <FadeInItem delay={160}>
        <View style={{ flexDirection: "row", gap: 12, marginBottom: 16 }}>
          <PressableScale onPress={() => router.push("/(tabs)/deliveries")} haptic="light" style={{ flex: 1 }}>
            <LinearGradient colors={["#5b6d8a", "#7a8fa8"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={{ alignItems: "center", justifyContent: "center", paddingVertical: 20, borderRadius: 20, gap: 10 }}>
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" }}>
                <Feather name="truck" size={20} color="#fff" />
              </View>
              <Text style={{ fontSize: 11, fontFamily: "DM Sans", fontWeight: "700", color: "#fff", letterSpacing: 1 }}>ДОСТАВКИ</Text>
            </LinearGradient>
          </PressableScale>
          <PressableScale onPress={() => router.push("/(tabs)/profile")} haptic="light" style={{ flex: 1 }}>
            <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: 20, borderRadius: 20, gap: 10, backgroundColor: isDark ? "#221f1c" : "#efedea", borderWidth: 1, borderColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.5)" }}>
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: isDark ? "rgba(0,180,255,0.12)" : "rgba(74,157,232,0.1)", alignItems: "center", justifyContent: "center" }}>
                <Feather name="user" size={20} color="#4a9de8" />
              </View>
              <Text style={{ fontSize: 11, fontFamily: "DM Sans", fontWeight: "700", color: isDark ? "#ede9e3" : "#2d3748", letterSpacing: 1 }}>ПРОФИЛЬ</Text>
            </View>
          </PressableScale>
        </View>
      </FadeInItem>

      {/* ── Recent deliveries (matching web recent orders style) ───────────── */}
      <FadeInItem delay={200}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Feather name="truck" size={16} color="#5b6d8a" />
            <Text style={{ fontFamily: "DM Sans", fontWeight: "700", fontSize: 16, color: isDark ? "#ede9e3" : "#2d3748" }}>Последние доставки</Text>
          </View>
          <Text style={{ fontFamily: "DM Sans", fontWeight: "500", fontSize: 12, color: isDark ? "#8a8478" : "#8b9bb4" }}>{total} заказов</Text>
        </View>
        <View style={{ backgroundColor: isDark ? "#221f1c" : "#efedea", borderRadius: 20, overflow: "hidden", borderWidth: 1, borderColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.5)" }}>
          {isLoading ? (
            <View style={{ padding: 16, gap: 10 }}>
              {[1, 2, 3].map(i => <ShimmerSkeleton key={i} height={56} radius={Radii.lg} />)}
            </View>
          ) : !deliveries?.length ? (
            <View style={{ padding: 32, alignItems: "center", gap: 8 }}>
              <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)", alignItems: "center", justifyContent: "center" }}>
                <Feather name="truck" size={20} color={isDark ? "#8a8478" : "#8b9bb4"} />
              </View>
              <Text style={{ fontFamily: "DM Sans", fontWeight: "500", fontSize: 13, color: isDark ? "#8a8478" : "#5a6a7f" }}>Доставок пока нет</Text>
            </View>
          ) : (
            deliveries.slice(0, 5).map((d, idx) => {
              const cfg = COURIER_STATUS[d.deliveryStatus] ?? COURIER_STATUS.assigned;
              return (
                <View key={d.id}>
                  <TouchableOpacity activeOpacity={0.7} onPress={() => router.push("/(tabs)/deliveries")}
                    style={{ flexDirection: "row", alignItems: "center", padding: 14, gap: 12 }}>
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: cfg.color }} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ fontFamily: "DM Sans", fontWeight: "600", fontSize: 14, color: isDark ? "#ede9e3" : "#2d3748" }} numberOfLines={1}>{d.orderNumber}</Text>
                      <Text style={{ fontFamily: "DM Sans", fontSize: 11, color: isDark ? "#8a8478" : "#8b9bb4", marginTop: 2 }}>{d.shopName ?? "—"}</Text>
                    </View>
                    <View style={{ backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 }}>
                      <Text style={{ fontFamily: "DM Sans", fontWeight: "600", fontSize: 11, color: cfg.color }}>{cfg.label}</Text>
                    </View>
                  </TouchableOpacity>
                  {idx < Math.min(deliveries.length, 5) - 1 && <View style={{ height: 1, backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.05)", marginLeft: 34 }} />}
                </View>
              );
            })
          )}
        </View>
      </FadeInItem>
    </ScrollView>
  );
}

// ── Role router ───────────────────────────────────────────────────────────────
export default function HomeScreen() {
  const { user, isLoading } = useAuthStore();
  if (isLoading || !user) return null;
  const isSupervisor = user?.role === "supervisor" || user?.role === "ceo" || user?.role === "operator";
  const isCourier = user?.role === "courier";
  if (isCourier) return <CourierHome />;
  return isSupervisor ? <SupervisorHome /> : <AgentHome />;
}
