// Warehouse Pro — Agent Dashboard v2 (cold palette + rings/sparklines)
import React, { useCallback, useMemo, useState } from "react";
import { View, Text, ScrollView, RefreshControl, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ru, uz } from "date-fns/locale";
import { useT, useLang } from "../../src/i18n";
import { Feather } from "@expo/vector-icons";
import { useAuthStore } from "../../src/store/auth";
import { getPlans, getMyOrders, getRevenueTrend, getDashboardTrends, getDashboardStatusBreakdown, getDashboardActivity, getSmartAlerts, getNotificationCounts, getReceivablesAging, getMyDebts } from "../../src/api";
import { plural } from "../../src/lib/plural";
import { debtorTotals } from "../../src/lib/debtors";
import { formatMoney } from "../../src/store/branding";
import { Card } from "../../src/components/ui";
import { ProgressRing, Sparkline, NeumorphicProgressBar, DonutChart, MiniBarChart } from "../../src/components/Charts";
import { Typography, Spacing, Radii, KpiColors, soft, type ThemeColors } from "../../src/theme";
import { orderStatusLabel, orderStatusColor, deliveryStatusLabel } from "../../src/lib/order-status";
import { useThemeColors, useThemeStore } from "../../src/store/theme";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FadeInItem, PressableScale, ShimmerSkeleton } from "../../src/components/Animated";
import { CashCard, VanCard } from "../../src/components/MoneyAndVanCards";
import { money } from "../../src/components/order/OrderStyles";
import { LinearGradient } from "expo-linear-gradient";

type IconName = keyof typeof Feather.glyphMap;

// ── CardDots — 3 colored dots (cold palette) ──────────────────────────────────
/**
 * Колокол с числом непрочитанных.
 *
 * Толчок на телефон — сигнал, а не запись: смахнул с экрана блокировки, и
 * узнать было неоткуда. Счётчик стоит на главной, потому что сюда человек
 * попадает всегда, а в профиль заходит редко.
 *
 * Один на три главные — агентскую, начальничью и курьерскую: уведомления
 * приходят каждому, а три копии значка разъедутся при первой же правке.
 */
function NotificationBell() {
  const router = useRouter();
  const colors = useThemeColors();

  /*
    Одно число отдельным лёгким запросом. Тянуть ради него весь список
    уведомлений было бы дороже самого экрана уведомлений.

    Отказ гасится в ноль: значка просто не будет — главная не про уведомления,
    и ронять её из-за них нельзя.
  */
  const { data } = useQuery({
    queryKey: ["notificationCounts"],
    queryFn: () => getNotificationCounts().catch(() => null),
    retry: false,
  });
  const unread = data?.unread ?? 0;

  return (
    <PressableScale onPress={() => router.push("/notifications")} haptic="light">
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.bg.card, alignItems: "center", justifyContent: "center" }}>
        <Feather name="bell" size={18} color={colors.text.secondary} />
        {unread > 0 && (
          <View style={{
            position: "absolute", top: 1, right: 1, minWidth: 16, height: 16, paddingHorizontal: 4,
            borderRadius: 8, backgroundColor: colors.status.danger,
            alignItems: "center", justifyContent: "center",
          }}>
            {/* Больше девяти — «9+»: точное число на значке в шестнадцать
                точек не читается, а «много» читается. */}
            <Text style={{ fontFamily: Typography.fontBold, fontSize: 9, color: "#fff" }}>
              {unread > 9 ? "9+" : unread}
            </Text>
          </View>
        )}
      </View>
    </PressableScale>
  );
}

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
type PlanStatusMeta = { icon: "check-circle" | "clock" | "circle"; color: string; bg: string; label: string };

// Функция, а не таблица: цвет теперь берётся из темы, а тема на уровне модуля
// ещё не выбрана — он вычисляется при отрисовке.
const planStatusMeta = (c: ThemeColors, t: (ru: string, uz: string) => string): Record<string, PlanStatusMeta> => ({
  visited: { icon: "check-circle", color: c.status.success, bg: c.status.successDim, label: t("Посещён", "Tashrif") },
  skipped: { icon: "clock",        color: c.status.warning, bg: c.status.warningDim, label: t("Пропущен", "O'tkazildi") },
  planned: { icon: "circle",       color: c.accent.primary, bg: c.brand.primaryDim,  label: t("Запланирован", "Rejalashtirilgan") },
});

/*
  Своей таблицы состояний заказа у главной больше нет.

  Она расходилась с экраном заказа словами: здесь стояло «В работе» и
  «Ожидает», там — «В обработке» и «В ожидании». Агент видел заказ на главной
  одним словом, открывал его и читал другое. Слово и цвет берутся из
  src/lib/order-status.ts.
*/

// ── Agent Home (Premium — matching web Dashboard.tsx style) ────────────────────
function AgentHome() {
  const router = useRouter();
  const t = useT();
  const lang = useLang();
  const colors = useThemeColors();
  const { isDark } = useThemeStore();
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();

  const isAgentRole = user?.role === "agent" || user?.role === "supervisor" || user?.role === "ceo" || user?.role === "operator" || user?.role === "merchandiser";
  /*
    Мерчандайзер заказов не оформляет: его работа — визиты и отчёты по ним.
    Раньше главная показывала ему «Динамику продаж», «Новый заказ» и «Мои
    заказы сегодня» — три пустых блока о чужой работе поверх единственного
    нужного. Ему остаются визиты, магазины, GPS и профиль.
  */
  const isMerchandiser = user?.role === "merchandiser";
  const sells = isAgentRole && !isMerchandiser;
  const isAgent = user?.role === "agent";

  const { data: revenueTrend, refetch: refetchTrend } = useQuery({
    queryKey: ["revenueTrend"],
    queryFn: () => getRevenueTrend(7),
    retry: false, enabled: sells,
  });

  /*
    Долги — плиткой на главной, а не только в профиле.

    Экран «Мои долги» есть, но дверь к нему одна — строка в профиле, куда
    агент заходит раз в месяц. Вопрос «кому идти собирать» задают каждое
    утро, вместе с маршрутом. Только агенту, как и сам экран: у курьера
    своих заказов нет, начальник смотрит долги отдельным отчётом.
    Отказ гасится в null: главная не про долги, плитки просто не будет.
  */
  const { data: myDebts, refetch: refetchDebts } = useQuery({
    queryKey: ["myDebts"],
    queryFn: () => getMyDebts().catch(() => null),
    retry: false, enabled: isAgent,
  });
  const debtSummary = useMemo(() => {
    if (!myDebts) return null;
    return {
      shops: new Set(myDebts.map(d => d.shopId)).size,
      sum: myDebts.reduce((acc, d) => acc + (Number(d.remaining) || 0), 0),
    };
  }, [myDebts]);

  // Today's route. getPlans() with no arguments already scopes to today and to
  // the calling agent server-side, so nothing needs passing here.
  const { data: todayPlans, isLoading: plansLoading, isError: plansFailed, refetch: refetchPlans } = useQuery({
    queryKey: ["plans", "today"],
    queryFn: async () => { const r = await getPlans(); return Array.isArray(r) ? r : []; },
    retry: false, enabled: isAgentRole,
  });

  const { data: myOrders, isLoading: ordersLoading, isError: ordersFailed, refetch: refetchOrders } = useQuery({
    queryKey: ["myOrders"], queryFn: getMyOrders, retry: false, enabled: sells,
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
   * Оговорка про частичный возврат. Он оформляется документом возврата, а
   * статус заказа остаётся delivered; поле total — сумма ЗАКАЗА, и сколько из
   * неё вернули, мобильному приложению в списке не приходит. Такие заказы
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
  const greeting = hour < 12 ? t("Доброе утро", "Xayrli tong") : hour < 18 ? t("Добрый день", "Xayrli kun") : t("Добрый вечер", "Xayrli kech");
  const firstName = (user?.name ?? user?.email ?? t("Агент", "Agent")).split(" ")[0];

  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([refetchPlans(), refetchOrders(), refetchTrend(), refetchDebts()]);
    } finally { setRefreshing(false); }
  }, [refetchPlans, refetchOrders, refetchTrend, refetchDebts]);

  const scrollRefresh = <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.accent.primary} />;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg.primary }} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: insets.top + 20, paddingBottom: insets.bottom + 100 }} refreshControl={scrollRefresh} showsVerticalScrollIndicator={false}>
      {/* ── Header (matching web) ────────────────────────────────────────── */}
      <FadeInItem delay={0}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <View style={{ flex: 1 }}>
            <CardDots />
            <Text style={{ fontFamily: Typography.fontMedium, fontSize: 13, color: colors.accent.primary }}>{greeting}, {firstName}</Text>
            <Text style={{ fontFamily: Typography.fontBold, fontSize: 26, color: colors.text.primary, marginTop: 4, letterSpacing: -0.5 }}>{t("Мой день", "Mening kunim")}</Text>
            <Text style={{ fontFamily: Typography.fontRegular, fontSize: 13, color: colors.text.secondary, marginTop: 4, textTransform: "capitalize" }}>
              {format(new Date(), "EEEE, d MMMM yyyy", { locale: lang === "uz" ? uz : ru })}
            </Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: Spacing.sm }}>
            <NotificationBell />
          <PressableScale onPress={() => router.push("/profile")} haptic="light">
            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brand.primaryDim, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.accent.primary }}>
              <Text style={{ fontFamily: Typography.fontBold, fontSize: 18, color: colors.accent.primary }}>{firstName.charAt(0).toUpperCase()}</Text>
            </View>
          </PressableScale>
          </View>
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
            <Feather name="map-pin" size={16} color={colors.accent.primary} />
            <Text style={{ fontFamily: Typography.fontBold, fontSize: 16, color: colors.text.primary }}>{t("Визиты сегодня", "Bugungi tashriflar")}</Text>
            {(todayPlans?.length ?? 0) > 0 && (
              <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, backgroundColor: colors.brand.primaryDim }}>
                <Text style={{ fontFamily: Typography.fontBold, fontSize: 11, color: colors.accent.primary }}>
                  {visitedCount} / {todayPlans?.length ?? 0}
                </Text>
              </View>
            )}
          </View>
          <PressableScale onPress={() => router.push("/(tabs)/plan")} haptic="light">
            <Feather name="arrow-right" size={16} color={colors.text.tertiary} />
          </PressableScale>
        </View>
        <View style={{ backgroundColor: colors.bg.card, borderRadius: 20, marginBottom: 16, ...soft(isDark).raised }}>
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
              <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.bg.secondary, alignItems: "center", justifyContent: "center" }}>
                <Feather name="wifi-off" size={20} color={colors.text.tertiary} />
              </View>
              <Text style={{ fontFamily: Typography.fontSemibold, fontSize: 13, color: colors.text.primary }}>{t("Не удалось загрузить визиты", "Tashriflar yuklanmadi")}</Text>
              <Text style={{ fontFamily: Typography.fontRegular, fontSize: 12, color: colors.text.secondary, textAlign: "center" }}>
                {t("Это сбой связи, а не пустой маршрут. Потяните вниз, чтобы обновить.", "Bu aloqa uzilishi, marshrut bo'sh emas. Yangilash uchun pastga torting.")}
              </Text>
            </View>
          ) : (todayPlans?.length ?? 0) === 0 ? (
            <View style={{ padding: 24, alignItems: "center", gap: 8 }}>
              <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.bg.secondary, alignItems: "center", justifyContent: "center" }}>
                <Feather name="map-pin" size={20} color={colors.text.tertiary} />
              </View>
              <Text style={{ fontFamily: Typography.fontMedium, fontSize: 13, color: colors.text.secondary }}>{t("На сегодня визитов нет", "Bugun tashrif yo'q")}</Text>
            </View>
          ) : (
            (todayPlans ?? []).slice(0, 5).map((plan, i) => {
              const statuses = planStatusMeta(colors, t);
              const meta = statuses[plan.status] ?? statuses.planned;
              return (
                <PressableScale
                  key={plan.id}
                  haptic="light"
                  onPress={() => { if (plan.shopId) router.push(`/shop/${plan.shopId}`); else router.push("/(tabs)/plan"); }}
                >
                  <View style={{
                    flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 14,
                    borderTopWidth: i === 0 ? 0 : 1,
                    borderTopColor: colors.border.subtle,
                    opacity: plan.status === "visited" ? 0.6 : 1,
                  }}>
                    <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: meta.bg, alignItems: "center", justifyContent: "center" }}>
                      <Feather name={meta.icon} size={14} color={meta.color} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1} style={{ fontFamily: Typography.fontSemibold, fontSize: 14, color: colors.text.primary }}>
                        {plan.shopName ?? t("Магазин", "Do'kon")}
                      </Text>
                      {plan.shopAddress ? (
                        <Text numberOfLines={1} style={{ fontFamily: Typography.fontRegular, fontSize: 12, color: colors.text.tertiary, marginTop: 2 }}>
                          {plan.shopAddress}
                        </Text>
                      ) : null}
                    </View>
                    <Text style={{ fontFamily: Typography.fontSemibold, fontSize: 11, color: meta.color }}>{meta.label}</Text>
                  </View>
                </PressableScale>
              );
            })
          )}
        </View>
      </FadeInItem>

      {/* ── Revenue sparkline card (matching web) ────────────────────────── */}
      {sells && (
      <FadeInItem delay={120}>
        <View style={{ backgroundColor: colors.bg.card, borderRadius: 24, padding: 20, marginBottom: 16, ...soft(isDark).raised }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <View>
              <Text style={{ fontFamily: Typography.fontBold, fontSize: 16, color: colors.text.primary }}>{t("Динамика продаж", "Sotuvlar dinamikasi")}</Text>
              <Text style={{ fontFamily: Typography.fontRegular, fontSize: 12, color: colors.text.tertiary, marginTop: 3 }}>{t("Выручка за 7 дней", "7 kunlik tushum")}</Text>
            </View>
            <View style={{ flexDirection: "row", gap: 6 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent.secondary }} />
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.status.warning }} />
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.status.success }} />
            </View>
          </View>
          <Sparkline data={revenueTrend?.length ? revenueTrend : [0]} color={colors.accent.primary} width={320} height={60} />
        </View>
      </FadeInItem>
      )}

      {/* ── Quick Actions (matching web style) ────────────────────────────── */}
      <FadeInItem delay={180}>
        <View style={{ flexDirection: "row", gap: 12, marginBottom: 16 }}>
          {sells && (
          <PressableScale onPress={() => router.push("/order/new")} haptic="light" style={{ flex: 1 }}>
            <LinearGradient colors={[colors.accent.primary, colors.text.tertiary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={{ alignItems: "center", justifyContent: "center", paddingVertical: 20, borderRadius: 20, gap: 10 }}>
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" }}>
                <Feather name="plus-circle" size={20} color="#fff" />
              </View>
              <Text style={{ fontSize: 11, fontFamily: Typography.fontBold, color: "#fff", letterSpacing: 1 }}>{t("НОВЫЙ ЗАКАЗ", "YANGI BUYURTMA")}</Text>
            </LinearGradient>
          </PressableScale>
          )}
          <PressableScale onPress={() => router.push("/(tabs)/shops")} haptic="light" style={{ flex: 1 }}>
            <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: 20, borderRadius: 20, gap: 10, backgroundColor: colors.bg.card, ...soft(isDark).raised }}>
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.brand.primaryDim, alignItems: "center", justifyContent: "center" }}>
                <Feather name="shopping-bag" size={20} color={colors.accent.primary} />
              </View>
              <Text style={{ fontSize: 11, fontFamily: Typography.fontBold, color: colors.text.primary, letterSpacing: 1 }}>{t("МАГАЗИНЫ", "DO'KONLAR")}</Text>
            </View>
          </PressableScale>
        </View>
        <View style={{ flexDirection: "row", gap: 12, marginBottom: 16 }}>
          <PressableScale onPress={() => router.push("/(tabs)/gps")} haptic="light" style={{ flex: 1 }}>
            <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: 16, borderRadius: 16, gap: 8, backgroundColor: colors.bg.card, ...soft(isDark).raised }}>
              <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colors.status.successDim, alignItems: "center", justifyContent: "center" }}>
                <Feather name="navigation" size={16} color={colors.status.success} />
              </View>
              <Text style={{ fontSize: 10, fontFamily: Typography.fontBold, color: colors.text.primary, letterSpacing: 0.5 }}>GPS</Text>
            </View>
          </PressableScale>
          {sells && (
          <PressableScale onPress={() => router.push("/(tabs)/barcode")} haptic="light" style={{ flex: 1 }}>
            <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: 16, borderRadius: 16, gap: 8, backgroundColor: colors.bg.card, ...soft(isDark).raised }}>
              <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colors.brand.primaryDim, alignItems: "center", justifyContent: "center" }}>
                <Feather name="maximize" size={16} color={colors.accent.primary} />
              </View>
              <Text style={{ fontSize: 10, fontFamily: Typography.fontBold, color: colors.text.primary, letterSpacing: 0.5 }}>{t("БАРКОД", "SHTRIX-KOD")}</Text>
            </View>
          </PressableScale>
          )}
          <PressableScale onPress={() => router.push("/(tabs)/profile")} haptic="light" style={{ flex: 1 }}>
            <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: 16, borderRadius: 16, gap: 8, backgroundColor: colors.bg.card, ...soft(isDark).raised }}>
              <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: colors.status.infoDim, alignItems: "center", justifyContent: "center" }}>
                <Feather name="user" size={16} color={colors.status.info} />
              </View>
              <Text style={{ fontSize: 10, fontFamily: Typography.fontBold, color: colors.text.primary, letterSpacing: 0.5 }}>{t("ПРОФИЛЬ", "PROFIL")}</Text>
            </View>
          </PressableScale>
        </View>
      </FadeInItem>

      {/* ── Наличные на руках и моя машина — тем, кто носит деньги и товар ── */}
      {isAgent && <CashCard delay={195} />}
      {isAgent && <VanCard delay={200} />}

      {/* ── Долги: кому идти собирать ─────────────────────────────────────── */}
      {isAgent && debtSummary && debtSummary.shops > 0 && (
        <FadeInItem delay={210}>
          <PressableScale onPress={() => router.push("/debts")} haptic="light">
            <View style={{
              backgroundColor: colors.bg.card, borderRadius: 20, padding: 16, marginBottom: 16, ...soft(isDark).raised,
              flexDirection: "row", alignItems: "center", gap: 12,
            }}>
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.status.dangerDim, alignItems: "center", justifyContent: "center" }}>
                <Feather name="alert-circle" size={18} color={colors.status.danger} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: Typography.fontSemibold, fontSize: 12, letterSpacing: 0.6, color: colors.status.danger }}>{t("ДОЛГИ", "QARZLAR")}</Text>
                <Text style={{ fontFamily: Typography.fontBold, fontSize: 15, color: colors.text.primary, marginTop: 2 }}>
                  {t(`${debtSummary.shops} ${plural(debtSummary.shops, "магазин", "магазина", "магазинов")}`, `${debtSummary.shops} ta do'kon`)} · {formatMoney(debtSummary.sum)}
                </Text>
              </View>
              <Feather name="chevron-right" size={16} color={colors.text.tertiary} />
            </View>
          </PressableScale>
        </FadeInItem>
      )}

      {/* ── Recent Orders (matching web) ─────────────────────────────────── */}
      {sells && (
      <FadeInItem delay={240}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Feather name="clipboard" size={16} color={colors.accent.primary} />
            <Text style={{ fontFamily: Typography.fontBold, fontSize: 16, color: colors.text.primary }}>{t("Мои заказы сегодня", "Bugungi buyurtmalarim")}</Text>
          </View>
          <PressableScale onPress={() => router.push("/(tabs)/orders")} haptic="light">
            <Feather name="arrow-right" size={16} color={colors.text.tertiary} />
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
        {sells && (
          <View style={{
            backgroundColor: colors.bg.card,
            borderRadius: 20, padding: 16, marginBottom: 12,
            ...soft(isDark).raised,
            flexDirection: "row", alignItems: "center", justifyContent: "space-between",
          }}>
            <View style={{ flex: 1 }}>
              {/* Подпись 12-м, а не восьмым: восьмой на солнце не читается, и
                  от показателя остаётся голое число без имени. */}
              <Text style={{ fontFamily: Typography.fontSemibold, fontSize: 12, letterSpacing: 0.6, color: colors.accent.primary }}>
                {t("ВЫРУЧКА ЗА СЕГОДНЯ", "BUGUNGI TUSHUM")}
              </Text>
              {ordersFailed ? (
                <>
                  <Text style={{ fontFamily: Typography.fontBold, fontSize: 22, marginTop: 4, color: colors.accent.primary }}>
                    —
                  </Text>
                  <Text style={{ fontFamily: Typography.fontRegular, fontSize: 13, marginTop: 2, color: colors.accent.primary }}>
                    {t("Нет связи — потяните вниз, чтобы обновить", "Aloqa yo'q — yangilash uchun pastga torting")}
                  </Text>
                </>
              ) : ordersLoading ? (
                <ShimmerSkeleton width={160} height={26} radius={8} style={{ marginTop: 6 }} />
              ) : (
                <>
                  <Text style={{ fontFamily: Typography.fontExtraBold, fontSize: 24, marginTop: 4, color: colors.text.primary }}>
                    {money(todayTotals.sum)}
                  </Text>
                  <Text style={{ fontFamily: Typography.fontRegular, fontSize: 13, marginTop: 2, color: colors.accent.primary }}>
                    {todayTotals.count === 0
                      ? t("заказов ещё нет", "hali buyurtma yo'q")
                      : t(`${todayTotals.count} ${plural(todayTotals.count, "заказ", "заказа", "заказов")}`, `${todayTotals.count} ta buyurtma`)}
                  </Text>
                </>
              )}
            </View>
            <View style={{
              width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center",
              backgroundColor: colors.status.successDim,
            }}>
              <Feather name="trending-up" size={20} color={colors.status.success} />
            </View>
          </View>
        )}

        {/* This section was a hardcoded "Создайте первый заказ" panel — it never
            queried anything, so it read as empty however many orders the agent
            had actually placed that day. */}
        <View style={{ backgroundColor: colors.bg.card, borderRadius: 20, ...soft(isDark).raised }}>
          {ordersLoading ? (
            <View style={{ padding: 16, gap: 10 }}>
              <ShimmerSkeleton height={44} radius={Radii.md} />
              <ShimmerSkeleton height={44} radius={Radii.md} />
            </View>
          ) : todayOrders.length === 0 ? (
            <View style={{ padding: 24, alignItems: "center", gap: 8 }}>
              <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.bg.secondary, alignItems: "center", justifyContent: "center" }}>
                <Feather name="clipboard" size={20} color={colors.text.tertiary} />
              </View>
              <Text style={{ fontFamily: Typography.fontMedium, fontSize: 13, color: colors.text.secondary }}>
                {ordersFailed
                  ? t("Не удалось загрузить заказы — это сбой связи", "Buyurtmalar yuklanmadi — aloqa uzildi")
                  : (myOrders?.length ?? 0) > 0 ? t("Сегодня заказов ещё нет", "Bugun hali buyurtma yo'q") : t("Создайте первый заказ", "Birinchi buyurtmani yarating")}
              </Text>
            </View>
          ) : (
            todayOrders.map((order, i) => {
              const meta = { label: orderStatusLabel(order.status), color: orderStatusColor(order.status) };
              return (
                <PressableScale key={order.id} haptic="light" onPress={() => router.push(`/order/${order.id}`)}>
                  <View style={{
                    flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 14,
                    borderTopWidth: i === 0 ? 0 : 1,
                    borderTopColor: colors.border.subtle,
                  }}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1} style={{ fontFamily: Typography.fontSemibold, fontSize: 14, color: colors.text.primary }}>
                        {order.shopName ?? order.orderNumber}
                      </Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: meta.color }} />
                        <Text style={{ fontFamily: Typography.fontRegular, fontSize: 12, color: colors.text.tertiary }}>{meta.label}</Text>
                      </View>
                    </View>
                    <Text style={{ fontFamily: Typography.fontBold, fontSize: 14, color: colors.text.primary }} numberOfLines={1}>
                      {Number(order.total ?? 0).toLocaleString("ru")}
                    </Text>
                  </View>
                </PressableScale>
              );
            })
          )}
        </View>
      </FadeInItem>
      )}
    </ScrollView>
  );
}

// ── Status colors (matching web Dashboard.tsx) ────────────────────────────────
/*
  Своих таблиц состояния заказа здесь больше нет.

  Они знали четыре значения из семи, и одно из четырёх — «completed» —
  состоянием заказа не было никогда: его убрали из перечисления базы. На
  круговой диаграмме у супервайзера доставленные, отгруженные, ожидающие и
  возвращённые заказы показывались английскими кодами.
*/

// ── Alert icon mapping ────────────────────────────────────────────────────────
function AlertIcon({ severity, size = 14, colors }: { severity: string; size?: number; colors: ThemeColors }) {
  if (severity === "danger") return <Feather name="alert-circle" size={size} color={colors.status.danger} />;
  if (severity === "warning") return <Feather name="trending-down" size={size} color={colors.status.warning} />;
  return <Feather name="trending-up" size={size} color={colors.status.info} />;
}

// ── Supervisor Home (Premium — matching web Dashboard.tsx) ─────────────────────
function SupervisorHome() {
  const router = useRouter();
  const t = useT();
  const lang = useLang();
  const colors = useThemeColors();
  const { isDark } = useThemeStore();
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

  /*
    Долги магазинов. Тот же ключ, что и на вкладке «Долги», — значит открытая
    вкладка достаётся уже посчитанной, без второго похода на сервер.
  */
  const { data: aging } = useQuery({
    queryKey: ["receivablesAging"], queryFn: getReceivablesAging, retry: false,
  });
  const debts = debtorTotals(aging);

  // Derived data
  const revenueTrend = (trends ?? []).slice(-7).map(t => Number(t.revenue));
  const ordersTrend = (trends ?? []).slice(-7).map(t => t.orderCount);
  const statusTotal = (statusData ?? []).reduce((s, d) => s + d.count, 0) || 1;

  const donutSegments = (statusData ?? []).map((s) => ({
    value: s.count,
    color: orderStatusColor(s.status),
    label: orderStatusLabel(s.status),
  }));

  const hour = new Date().getHours();
  const greeting = hour < 12 ? t("Доброе утро", "Xayrli tong") : hour < 18 ? t("Добрый день", "Xayrli kun") : t("Добрый вечер", "Xayrli kech");
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
            <Text style={{ fontSize: Typography.size.xxl, fontFamily: Typography.fontExtraBold, color: colors.text.primary, marginTop: 2 }}>{t("Главная", "Bosh sahifa")}</Text>
            <Text style={{ fontSize: Typography.size.xs, fontFamily: Typography.fontBody, color: colors.text.tertiary, marginTop: 2, textTransform: "capitalize" }}>
              {format(new Date(), "EEEE, d MMMM yyyy", { locale: lang === "uz" ? uz : ru })}
            </Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: Spacing.sm }}>
            <NotificationBell />
          <PressableScale onPress={() => router.push("/profile")} haptic="light">
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brand.primaryDim, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.brand.primary }}>
              <Text style={{ fontFamily: Typography.fontBold, fontSize: 16, color: colors.brand.primary }}>{firstName.charAt(0).toUpperCase()}</Text>
            </View>
          </PressableScale>
          </View>
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
                      <AlertIcon severity={alert.severity} size={14} colors={colors} />
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

      {/* ── Долги магазинов ──────────────────────────────────────────────
        Выше графиков намеренно.

        Динамика продаж отвечает на вопрос «как идут дела», а долги — на «что
        делать сегодня». Второе важнее и требует действия, поэтому стоит
        первым. Карточка ведёт на вкладку, где список отсортирован от самых
        старых долгов.

        Показывается, только когда долг есть: пустая карточка «0 сум» на
        главной занимает место и не сообщает ничего.
      */}
      {debts.totalDebt > 0 && (
        <FadeInItem delay={80}>
          <PressableScale onPress={() => router.push("/debtors")} haptic="light">
            <Card style={{ marginBottom: Spacing.base }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <Feather name="alert-circle" size={16} color={colors.status.warning} />
                <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.base, color: colors.text.primary }}>
                  {t("Долги магазинов", "Do'konlar qarzi")}
                </Text>
                <View style={{ flex: 1 }} />
                <Feather name="chevron-right" size={18} color={colors.text.tertiary} />
              </View>

              <View style={{ flexDirection: "row", alignItems: "flex-end", gap: Spacing.lg }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.xs, color: colors.text.tertiary }}>
                    {t("всего", "jami")}
                  </Text>
                  <Text style={{ fontFamily: Typography.fontExtraBold, fontSize: Typography.size.lg, color: colors.text.primary }}>
                    {formatMoney(debts.totalDebt)}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.xs, color: colors.text.tertiary }}>
                    {t("магазинов", "do'kon")}
                  </Text>
                  <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.lg, color: colors.text.primary }}>
                    {debts.debtorCount}
                  </Text>
                </View>
              </View>

              {/*
                Просроченное — отдельной строкой и красным. Это единственное
                число здесь, по которому что-то делают: остальное справка.
              */}
              {debts.overdue > 0 && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.status.danger }} />
                  <Text style={{ fontFamily: Typography.fontMedium, fontSize: Typography.size.sm, color: colors.status.danger }}>
                    {t("старше месяца", "bir oydan eski")}: {formatMoney(debts.overdue)}
                  </Text>
                </View>
              )}
            </Card>
          </PressableScale>
        </FadeInItem>
      )}

      {/* ── Sales Dynamics Chart ─────────────────────────────────────────── */}
      <FadeInItem delay={100}>
        <Card style={{ marginBottom: Spacing.base }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <View>
              <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.base, color: colors.text.primary }}>{t("Динамика продаж", "Sotuvlar dinamikasi")}</Text>
              <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.xs, color: colors.text.tertiary, marginTop: 2 }}>{t("Выручка и заказы", "Tushum va buyurtmalar")}</Text>
            </View>
            <View style={{ flexDirection: "row", backgroundColor: colors.bg.elevated, borderRadius: Radii.full, padding: 2 }}>
              {(["7d", "30d", "month"] as const).map(r => (
                <PressableScale key={r} onPress={() => setRange(r)} haptic="light" scaleTo={0.95}>
                  <View style={{ paddingVertical: 6, paddingHorizontal: 12, borderRadius: Radii.full, backgroundColor: range === r ? colors.brand.primary : "transparent" }}>
                    <Text style={{ fontFamily: Typography.fontSemibold, fontSize: 11, color: range === r ? "#fff" : colors.text.tertiary }}>{r === "7d" ? t("7д", "7 k") : r === "30d" ? t("30д", "30 k") : t("Месяц", "Oy")}</Text>
                  </View>
                </PressableScale>
              ))}
            </View>
          </View>
          <View style={{ marginBottom: 12 }}>
            <Sparkline data={revenueTrend.length ? revenueTrend : [0]} color={colors.accent.primary} width={320} height={50} />
          </View>
          <View>
            <Sparkline data={ordersTrend.length ? ordersTrend : [0]} color={colors.status.success} width={320} height={40} />
          </View>
          <View style={{ flexDirection: "row", justifyContent: "center", gap: 20, marginTop: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent.primary }} />
              <Text style={{ fontFamily: Typography.fontMedium, fontSize: 11, color: colors.text.tertiary }}>{t("Выручка", "Tushum")}</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.status.success }} />
              <Text style={{ fontFamily: Typography.fontMedium, fontSize: 11, color: colors.text.tertiary }}>{t("Заказы", "Buyurtmalar")}</Text>
            </View>
          </View>
        </Card>
      </FadeInItem>

      {/* ── Order Status Donut ───────────────────────────────────────────── */}
      <FadeInItem delay={140}>
        <Card style={{ marginBottom: Spacing.base }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <Feather name="pie-chart" size={16} color={colors.accent.primary} />
            <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.base, color: colors.text.primary }}>{t("Статусы заказов", "Buyurtma holatlari")}</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 20 }}>
            <DonutChart segments={donutSegments} size={120} strokeWidth={18} centerLabel={String(statusTotal)} centerSublabel={t("заказов", "buyurtma")} />
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
            <View
              style={{ backgroundColor: colors.brand.primary, alignItems: "center", justifyContent: "center", paddingVertical: Spacing.lg, borderRadius: Radii.lg, gap: 8 }}>
              <View style={{ width: 36, height: 36, borderRadius: Radii.md, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" }}>
                <Feather name="map-pin" size={18} color="#fff" />
              </View>
              <Text style={{ fontSize: Typography.size.xs, fontFamily: Typography.fontBold, color: "#fff", letterSpacing: 1 }}>{t("ТРЕКИНГ", "KUZATUV")}</Text>
            </View>
          </PressableScale>
          <PressableScale onPress={() => router.push("/(tabs)/plans")} haptic="light" style={{ flex: 1 }}>
            <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: Spacing.lg, borderRadius: Radii.lg, gap: 8, backgroundColor: colors.bg.card, ...soft(isDark).raised }}>
              <View style={{ width: 36, height: 36, borderRadius: Radii.md, backgroundColor: colors.brand.primaryDim, alignItems: "center", justifyContent: "center" }}>
                <Feather name="calendar" size={18} color={colors.brand.primaryLight} />
              </View>
              <Text style={{ fontSize: Typography.size.xs, fontFamily: Typography.fontBold, color: colors.text.primary, letterSpacing: 1 }}>{t("ПЛАНЫ", "REJALAR")}</Text>
            </View>
          </PressableScale>
        </View>
        <View style={{ flexDirection: "row", gap: Spacing.sm, marginBottom: Spacing.base }}>
          <PressableScale onPress={() => router.push("/(tabs)/shops")} haptic="light" style={{ flex: 1 }}>
            <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: Spacing.md, borderRadius: Radii.lg, gap: 6, backgroundColor: colors.bg.card, ...soft(isDark).raised }}>
              <View style={{ width: 32, height: 32, borderRadius: Radii.sm, backgroundColor: colors.brand.primaryDim, alignItems: "center", justifyContent: "center" }}>
                <Feather name="shopping-bag" size={16} color={colors.accent.primary} />
              </View>
              <Text style={{ fontSize: Typography.size.xs, fontFamily: Typography.fontBold, color: colors.text.primary, letterSpacing: 0.5 }}>{t("МАГАЗИНЫ", "DO'KONLAR")}</Text>
            </View>
          </PressableScale>
          <PressableScale onPress={() => router.push("/(tabs)/profile")} haptic="light" style={{ flex: 1 }}>
            <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: Spacing.md, borderRadius: Radii.lg, gap: 6, backgroundColor: colors.bg.card, ...soft(isDark).raised }}>
              <View style={{ width: 32, height: 32, borderRadius: Radii.sm, backgroundColor: colors.status.infoDim, alignItems: "center", justifyContent: "center" }}>
                <Feather name="user" size={16} color={colors.status.info} />
              </View>
              <Text style={{ fontSize: Typography.size.xs, fontFamily: Typography.fontBold, color: colors.text.primary, letterSpacing: 0.5 }}>{t("ПРОФИЛЬ", "PROFIL")}</Text>
            </View>
          </PressableScale>
        </View>
      </FadeInItem>

      {/* ── Recent Orders ────────────────────────────────────────────────── */}
      <FadeInItem delay={220}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Feather name="clipboard" size={16} color={colors.accent.primary} />
            <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.base, color: colors.text.primary }}>{t("Последние заказы", "So'nggi buyurtmalar")}</Text>
          </View>
          <Text style={{ fontFamily: Typography.fontMedium, fontSize: Typography.size.xs, color: colors.text.tertiary }}>{activity?.length ?? 0} {t("заказов", "ta buyurtma")}</Text>
        </View>
        <Card style={{ padding: 0, overflow: "hidden" }}>
          {!activity?.length ? (
            <View style={{ padding: Spacing.xl, alignItems: "center", gap: 8 }}>
              <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.bg.elevated, alignItems: "center", justifyContent: "center" }}>
                <Feather name="clipboard" size={20} color={colors.text.muted} />
              </View>
              <Text style={{ fontFamily: Typography.fontMedium, fontSize: Typography.size.sm, color: colors.text.muted }}>{t("Заказов пока нет", "Hali buyurtma yo'q")}</Text>
            </View>
          ) : (
            activity.slice(0, 10).map((order, idx) => (
              <TouchableOpacity key={order.id} activeOpacity={0.7} onPress={() => router.push(`/order/${order.id}`)}>
                <View style={{ flexDirection: "row", alignItems: "center", padding: 14, gap: 12 }}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: orderStatusColor(order.status) }} />
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
/* Значок и цвет — здесь, слово — из общего словаря доставок. */
const courierStatusMeta = (c: ThemeColors): Record<string, { icon: IconName; label: string; color: string }> =>
  Object.fromEntries(Object.entries({
    not_assigned:     { icon: "clock" as IconName,        color: c.text.tertiary },
    assigned:         { icon: "package" as IconName,      color: c.status.info },
    out_for_delivery: { icon: "truck" as IconName,        color: c.status.warning },
    delivered:        { icon: "check-circle" as IconName, color: c.status.success },
    failed:           { icon: "x-circle" as IconName,     color: c.status.danger },
  }).map(([k, v]) => [k, { ...v, label: deliveryStatusLabel(k) }]));

function CourierHome() {
  const router = useRouter();
  const t = useT();
  const lang = useLang();
  const colors = useThemeColors();
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
  const greeting = hour < 12 ? t("Доброе утро", "Xayrli tong") : hour < 18 ? t("Добрый день", "Xayrli kun") : t("Добрый вечер", "Xayrli kech");
  const firstName = (user?.name ?? user?.email ?? t("Курьер", "Kuryer")).split(" ")[0];

  const assigned = (deliveries ?? []).filter(d => d.deliveryStatus === "assigned").length;
  const inTransit = (deliveries ?? []).filter(d => d.deliveryStatus === "out_for_delivery").length;
  const delivered = (deliveries ?? []).filter(d => d.deliveryStatus === "delivered").length;
  const total = (deliveries ?? []).length;
  const deliveryPct = total > 0 ? Math.round((delivered / total) * 100) : 0;

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await refetch(); } finally { setRefreshing(false); }
  }, [refetch]);

  const scrollRefresh = <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.accent.primary} />;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg.primary }} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: insets.top + 20, paddingBottom: insets.bottom + 100 }} refreshControl={scrollRefresh} showsVerticalScrollIndicator={false}>
      {/* ── Header (matching web) ────────────────────────────────────────── */}
      <FadeInItem delay={0}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <View style={{ flex: 1 }}>
            <CardDots />
            <Text style={{ fontFamily: Typography.fontMedium, fontSize: 13, color: colors.accent.primary }}>{greeting}, {firstName}</Text>
            <Text style={{ fontFamily: Typography.fontBold, fontSize: 26, color: colors.text.primary, marginTop: 4, letterSpacing: -0.5 }}>{t("Доставки", "Yetkazish")}</Text>
            <Text style={{ fontFamily: Typography.fontRegular, fontSize: 13, color: colors.text.secondary, marginTop: 4, textTransform: "capitalize" }}>
              {format(new Date(), "EEEE, d MMMM yyyy", { locale: lang === "uz" ? uz : ru })}
            </Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: Spacing.sm }}>
            <NotificationBell />
          <PressableScale onPress={() => router.push("/profile")} haptic="light">
            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brand.primaryDim, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.accent.primary }}>
              <Text style={{ fontFamily: Typography.fontBold, fontSize: 18, color: colors.accent.primary }}>{firstName.charAt(0).toUpperCase()}</Text>
            </View>
          </PressableScale>
          </View>
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
              <View style={{ flex: 1, backgroundColor: colors.bg.card, borderRadius: 24, padding: 16, ...soft(isDark).raised }}>
                <CardDots />
                <Text style={{ fontFamily: Typography.fontSemibold, fontSize: 9, color: colors.text.tertiary, letterSpacing: 1, textTransform: "uppercase" }}>{t("ОЖИДАЮТ", "KUTILMOQDA")}</Text>
                <Text style={{ fontFamily: Typography.fontBold, fontSize: 28, color: colors.status.info, marginTop: 8 }}>{assigned}</Text>
                <View style={{ marginTop: 8 }}>
                  <MiniBarChart data={[assigned, inTransit, delivered]} color={colors.status.info} width={100} height={28} />
                </View>
              </View>
              {/* In Transit */}
              <View style={{ flex: 1, backgroundColor: colors.bg.card, borderRadius: 24, padding: 16, ...soft(isDark).raised }}>
                <CardDots />
                <Text style={{ fontFamily: Typography.fontSemibold, fontSize: 9, color: colors.text.tertiary, letterSpacing: 1, textTransform: "uppercase" }}>{t("В ПУТИ", "YO'LDA")}</Text>
                <Text style={{ fontFamily: Typography.fontBold, fontSize: 28, color: colors.status.warning, marginTop: 8 }}>{inTransit}</Text>
                <View style={{ marginTop: 8 }}>
                  <MiniBarChart data={[assigned, inTransit, delivered]} color={colors.status.warning} width={100} height={28} />
                </View>
              </View>
            </View>
            {/* Row 2: Delivered + Progress */}
            <View style={{ flexDirection: "row", gap: 12 }}>
              {/* Delivered */}
              <View style={{ flex: 1, backgroundColor: colors.bg.card, borderRadius: 24, padding: 16, ...soft(isDark).raised }}>
                <CardDots />
                <Text style={{ fontFamily: Typography.fontSemibold, fontSize: 9, color: colors.text.tertiary, letterSpacing: 1, textTransform: "uppercase" }}>{t("ДОСТАВЛЕНО", "YETKAZILDI")}</Text>
                <Text style={{ fontFamily: Typography.fontBold, fontSize: 28, color: colors.status.success, marginTop: 8 }}>{delivered}</Text>
              </View>
              {/* Progress ring */}
              <View style={{ flex: 1, backgroundColor: colors.bg.card, borderRadius: 24, padding: 16, alignItems: "center", justifyContent: "center", ...soft(isDark).raised }}>
                <ProgressRing value={deliveryPct} size={64} strokeWidth={6} color={deliveryPct >= 80 ? colors.status.success : colors.accent.primary} />
                <Text style={{ fontFamily: Typography.fontSemibold, fontSize: 10, color: colors.text.secondary, marginTop: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>{t("Прогресс", "Jarayon")}</Text>
              </View>
            </View>
          </View>
        )}
      </FadeInItem>

      {/* ── Progress bar card (matching web) ──────────────────────────────── */}
      <FadeInItem delay={120}>
        <View style={{ backgroundColor: colors.bg.card, borderRadius: 24, padding: 20, marginBottom: 16, ...soft(isDark).raised }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <Text style={{ fontFamily: Typography.fontSemibold, fontSize: 10, color: colors.text.tertiary, letterSpacing: 1, textTransform: "uppercase" }}>{t("ПРОГРЕСС ДНЯ", "KUN JARAYONI")}</Text>
            <Text style={{ fontFamily: Typography.fontBold, fontSize: 13, color: deliveryPct >= 80 ? colors.status.success : colors.accent.primary }}>
              {delivered}/{total} · {deliveryPct}%
            </Text>
          </View>
          <NeumorphicProgressBar value={deliveryPct} height={10} color={deliveryPct >= 80 ? colors.status.success : colors.accent.primary} />
          <Text style={{ fontFamily: Typography.fontRegular, fontSize: 12, color: colors.text.secondary, marginTop: 10 }}>
            {total === 0 ? t("Нет заказов на сегодня", "Bugunga buyurtma yo'q") : delivered === total ? t("Все доставлены!", "Hammasi yetkazildi!") : t(`Осталось ${total - delivered}`, `${total - delivered} ta qoldi`)}
          </Text>
        </View>
      </FadeInItem>

      {/* ── Quick Actions (matching web) ───────────────────────────────────── */}
      <FadeInItem delay={160}>
        <View style={{ flexDirection: "row", gap: 12, marginBottom: 16 }}>
          <PressableScale onPress={() => router.push("/(tabs)/deliveries")} haptic="light" style={{ flex: 1 }}>
            <LinearGradient colors={[colors.accent.primary, colors.text.tertiary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={{ alignItems: "center", justifyContent: "center", paddingVertical: 20, borderRadius: 20, gap: 10 }}>
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" }}>
                <Feather name="truck" size={20} color="#fff" />
              </View>
              <Text style={{ fontSize: 11, fontFamily: Typography.fontBold, color: "#fff", letterSpacing: 1 }}>{t("ДОСТАВКИ", "YETKAZISH")}</Text>
            </LinearGradient>
          </PressableScale>
          <PressableScale onPress={() => router.push("/(tabs)/profile")} haptic="light" style={{ flex: 1 }}>
            <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: 20, borderRadius: 20, gap: 10, backgroundColor: colors.bg.card, ...soft(isDark).raised }}>
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.status.infoDim, alignItems: "center", justifyContent: "center" }}>
                <Feather name="user" size={20} color={colors.status.info} />
              </View>
              <Text style={{ fontSize: 11, fontFamily: Typography.fontBold, color: colors.text.primary, letterSpacing: 1 }}>{t("ПРОФИЛЬ", "PROFIL")}</Text>
            </View>
          </PressableScale>
        </View>
      </FadeInItem>

      {/* ── Наличные на руках и моя машина ─────────────────────────────────── */}
      <CashCard delay={180} />
      <VanCard delay={190} />

      {/* ── Recent deliveries (matching web recent orders style) ───────────── */}
      <FadeInItem delay={200}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Feather name="truck" size={16} color={colors.accent.primary} />
            <Text style={{ fontFamily: Typography.fontBold, fontSize: 16, color: colors.text.primary }}>{t("Последние доставки", "So'nggi yetkazishlar")}</Text>
          </View>
          <Text style={{ fontFamily: Typography.fontMedium, fontSize: 12, color: colors.text.tertiary }}>{total} {t("заказов", "ta buyurtma")}</Text>
        </View>
        <View style={{ backgroundColor: colors.bg.card, borderRadius: 20, ...soft(isDark).raised }}>
          {isLoading ? (
            <View style={{ padding: 16, gap: 10 }}>
              {[1, 2, 3].map(i => <ShimmerSkeleton key={i} height={56} radius={Radii.lg} />)}
            </View>
          ) : !deliveries?.length ? (
            <View style={{ padding: 32, alignItems: "center", gap: 8 }}>
              <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.bg.secondary, alignItems: "center", justifyContent: "center" }}>
                <Feather name="truck" size={20} color={colors.text.tertiary} />
              </View>
              <Text style={{ fontFamily: Typography.fontMedium, fontSize: 13, color: colors.text.secondary }}>{t("Доставок пока нет", "Hali yetkazish yo'q")}</Text>
            </View>
          ) : (
            deliveries.slice(0, 5).map((d, idx) => {
              const statuses = courierStatusMeta(colors);
              // Незнакомое состояние показывается кодом, а не «Назначен».
              const cfg = statuses[d.deliveryStatus] ?? { icon: "help-circle" as IconName, label: d.deliveryStatus, color: colors.text.tertiary };
              return (
                <View key={d.id}>
                  <TouchableOpacity activeOpacity={0.7} onPress={() => router.push("/(tabs)/deliveries")}
                    style={{ flexDirection: "row", alignItems: "center", padding: 14, gap: 12 }}>
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: cfg.color }} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ fontFamily: Typography.fontSemibold, fontSize: 14, color: colors.text.primary }} numberOfLines={1}>{d.orderNumber}</Text>
                      <Text style={{ fontFamily: Typography.fontRegular, fontSize: 11, color: colors.text.tertiary, marginTop: 2 }}>{d.shopName ?? "—"}</Text>
                    </View>
                    <View style={{ backgroundColor: colors.bg.secondary, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 }}>
                      <Text style={{ fontFamily: Typography.fontSemibold, fontSize: 11, color: cfg.color }}>{cfg.label}</Text>
                    </View>
                  </TouchableOpacity>
                  {idx < Math.min(deliveries.length, 5) - 1 && <View style={{ height: 1, backgroundColor: colors.border.subtle, marginLeft: 34 }} />}
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
