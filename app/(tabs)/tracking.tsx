// Warehouse Pro — Tracking v2 (cold palette, Card component)
import React, { useMemo, useRef, useState, useCallback } from "react";
import { useFocusEffect } from "expo-router";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  useWindowDimensions,
  RefreshControl,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getAgentLocations, AgentLocation } from "../../src/api";
import { useThemeColors, useThemeStore } from "../../src/store/theme";
import { Typography, Spacing, Radii, KpiColors, BOTTOM_TAB_HEIGHT, soft } from "../../src/theme";
import { Card, ScreenHeader, Badge } from "../../src/components/ui";
import { ShimmerSkeleton, PressableScale, FadeInItem } from "../../src/components/Animated";
import YandexMapView, { centerOnAgent, fitAllMarkers } from "../../src/components/YandexMapView";
import type { WebView } from "react-native-webview";
import { tt, useT, useLang } from "../../src/i18n";

const ONLINE_WINDOW = 600;

// Высота плавающей панели вкладок. Третья копия одного числа в проекте:
// в src/components/Layout.tsx оно объявлено без export, в app/(tabs)/orders.tsx
// лежит своя копия. Экспортировать одну — правка чужого файла.

function isOnline(createdAt: string | undefined): boolean {
  if (!createdAt) return false;
  return (Date.now() - new Date(createdAt).getTime()) / 1000 < ONLINE_WINDOW;
}

function timeAgo(createdAt: string | undefined, lang: "ru" | "uz"): string {
  if (!createdAt) return tt("Нет данных", "Ma'lumot yo'q");
  const s = Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000);
  if (s < 60) return tt("Только что", "Hozirgina");
  if (s < 3600) return tt(`${Math.floor(s / 60)} мин назад`, `${Math.floor(s / 60)} daqiqa oldin`);
  if (s < 86400) return tt(`${Math.floor(s / 3600)} ч назад`, `${Math.floor(s / 3600)} soat oldin`);
  return new Date(createdAt).toLocaleDateString(lang === "uz" ? "uz-Latn-UZ" : "ru");
}

function batteryColor(level: number): string {
  if (level >= 50) return KpiColors.teal;
  if (level >= 20) return KpiColors.amber;
  return KpiColors.red;
}

export default function TrackingScreen() {
  const { isDark } = useThemeStore();
  const { width: SCREEN_W } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();

  const webViewRef = useRef<WebView>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const t = useT();
  const lang = useLang();

  /*
    Опрос идёт, только пока экран открыт.

    Вкладки не размонтируются: один раз открыв «Трекинг», супервайзер получал
    запрос каждые 15 секунд до конца дня — и на других вкладках, и с телефоном
    в кармане. Это 240 запросов в час к карте, которую никто не смотрит: на
    тарифе с оплатой за мегабайты видно в счёте, на дешёвом аппарате — в
    проценте заряда к обеду.
  */
  const [screenFocused, setScreenFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setScreenFocused(true);
      return () => setScreenFocused(false);
    }, []),
  );

  const {
    data: polledLocations,
    isLoading,
    isError,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ["agentLocations"],
    queryFn: getAgentLocations,
    refetchInterval: screenFocused ? 15_000 : false,
    retry: 2,
  });

  /*
    Ответ запроса и есть состояние экрана.

    Раньше он ещё раз перекладывался в useState через эффект — лишняя отрисовка
    на каждый ответ и подавленное предупреждение линтера. useMemo нужен ради
    ссылки: список маркеров ниже пересобирается по ней, а не по содержимому.
  */
  const locations = useMemo<AgentLocation[]>(() => polledLocations ?? [], [polledLocations]);

  const onlineCount = locations.filter(l => isOnline(l.createdAt)).length;
  const offlineCount = locations.length - onlineCount;

  const mapMarkers = useMemo(
    () =>
      locations
        .filter(l => Number(l.lat) && Number(l.lng))
        .map(l => ({
          id: l.agentId,
          lat: Number(l.lat),
          lng: Number(l.lng),
          // Подпись метки — по-русски, как в списке под картой. Когда сервер не
          // прислал имя, на булавке стояла латинская «A» (берётся первая буква),
          // а по нажатию открывалось «Agent #12» — при том, что тот же человек
          // строкой ниже подписан «Агент #12».
          label: l.agentName ?? t(`Агент #${l.agentId}`, `Agent #${l.agentId}`),
          color: isOnline(l.createdAt) ? KpiColors.teal : colors.text.muted,
          online: isOnline(l.createdAt),
          batteryLevel: l.batteryLevel ?? null,
        })),
    [locations, colors.text.muted, t]
  );

  const center = useMemo(() => {
    if (mapMarkers.length === 0) return { lat: 41.2995, lng: 69.2401 };
    return {
      lat: mapMarkers.reduce((s, m) => s + m.lat, 0) / mapMarkers.length,
      lng: mapMarkers.reduce((s, m) => s + m.lng, 0) / mapMarkers.length,
    };
  }, [mapMarkers]);

  const focusAgent = useCallback((loc: AgentLocation) => {
    setSelectedId(loc.agentId);
    const lat = Number(loc.lat),
      lng = Number(loc.lng);
    if (!lat || !lng) return;
    centerOnAgent(webViewRef, lat, lng);
  }, []);

  const fitAll = useCallback(() => {
    fitAllMarkers(webViewRef);
  }, []);

  const onMarkerPress = useCallback((id: number) => {
    setSelectedId(id);
  }, []);

  const selectedLoc = locations.find(l => l.agentId === selectedId);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      <ScreenHeader
        title={t("Трекинг", "Kuzatuv")}
        right={
          <PressableScale onPress={fitAll} haptic="light">
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.bg.elevated, paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radii.full, ...soft(isDark).raised}}>
              <Feather name="maximize-2" size={13} color={colors.text.secondary} />
              <Text style={{ fontFamily: Typography.fontMedium, fontSize: Typography.size.sm, color: colors.text.secondary }}>{t("Все", "Hammasi")}</Text>
            </View>
          </PressableScale>
        }
      />

      {/* Stats */}
      <FadeInItem delay={0}>
        <View style={{ flexDirection: "row", gap: Spacing.sm, marginHorizontal: Spacing.lg, marginTop: Spacing.md }}>
          {/* «ОНЛАЙН» и «НЕ В СЕТИ» — одно и то же понятие, написанное на двух
              языках, и стояли они рядом как пара. Оборот один на весь экран. */}
          {[
            { label: t("НА СВЯЗИ", "ALOQADA"), value: onlineCount, color: colors.status.success },
            { label: t("НЕ НА СВЯЗИ", "ALOQADA EMAS"), value: offlineCount, color: colors.status.warning },
            { label: t("ВСЕГО", "JAMI"), value: locations.length, color: colors.accent.primary },
          ].map(k => (
            <Card key={k.label} style={{ flex: 1, alignItems: "center", padding: Spacing.md }}>
              <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.xl, color: k.color, fontVariant: ["tabular-nums"] }}>{k.value}</Text>
              <Text style={{ fontFamily: Typography.fontMedium, fontSize: Typography.size.xs, color: colors.text.tertiary, letterSpacing: 0.5, marginTop: 2 }}>{k.label}</Text>
            </Card>
          ))}
        </View>
      </FadeInItem>

      {/* Map */}
      <FadeInItem delay={40}>
        <View style={{ height: SCREEN_W * 0.7, backgroundColor: colors.bg.elevated, marginHorizontal: Spacing.lg, marginTop: Spacing.md, borderRadius: Radii.lg, overflow: "hidden", ...soft(isDark).raised}}>
          {isError ? (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 8 }}>
              <Feather name="wifi-off" size={28} color={colors.text.muted} />
              <Text style={{ fontFamily: Typography.fontMedium, color: colors.text.secondary }}>{t("Ошибка загрузки", "Yuklab bo'lmadi")}</Text>
              <PressableScale onPress={() => refetch()} haptic="light">
                <View style={{ marginTop: 8, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: colors.accent.primary, borderRadius: Radii.md }}>
                  <Text style={{ color: "#fff", fontFamily: Typography.fontMedium }}>{t("Повторить", "Qayta urinish")}</Text>
                </View>
              </PressableScale>
            </View>
          ) : (
            <YandexMapView
              ref={webViewRef}
              markers={mapMarkers}
              center={center}
              zoom={mapMarkers.length > 1 ? 11 : 14}
              onMarkerPress={onMarkerPress}
              style={{ width: "100%", height: "100%" }}
            />
          )}
          {/* Center button */}
          <TouchableOpacity
            onPress={fitAll}
            style={{ position: "absolute", bottom: 12, right: 12, backgroundColor: colors.bg.card, borderRadius: Radii.full, padding: 10, ...soft(isDark).raised}}
          >
            <Feather name="crosshair" size={18} color={colors.accent.primary} />
          </TouchableOpacity>
        </View>
      </FadeInItem>

      {/* Selected agent info */}
      {selectedLoc && (
        <FadeInItem delay={60}>
          <Card style={{ marginHorizontal: Spacing.lg, marginTop: Spacing.sm, padding: Spacing.md, flexDirection: "row", alignItems: "center", gap: 10, borderColor: colors.accent.primary + "40", borderWidth: 1 }}>
            <View style={{ width: 32, height: 32, borderRadius: Radii.full, backgroundColor: isOnline(selectedLoc.createdAt) ? colors.status.success : colors.text.tertiary, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: "#fff", fontFamily: Typography.fontBold, fontSize: Typography.size.xs }}>{(selectedLoc.agentName ?? "A")[0].toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: Typography.fontSemibold, fontSize: Typography.size.sm, color: colors.text.primary }}>{selectedLoc.agentName ?? t(`Агент #${selectedLoc.agentId}`, `Agent #${selectedLoc.agentId}`)}</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
                <Badge variant={isOnline(selectedLoc.createdAt) ? "success" : "warning"}>
                  {isOnline(selectedLoc.createdAt) ? t("На связи", "Aloqada") : timeAgo(selectedLoc.createdAt, lang)}
                </Badge>
                {selectedLoc.batteryLevel != null && (
                  <Text style={{ fontFamily: Typography.fontMedium, fontSize: Typography.size.xs, color: batteryColor(selectedLoc.batteryLevel) }}>🔋 {selectedLoc.batteryLevel}%</Text>
                )}
                {selectedLoc.accuracy && (
                  <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.xs, color: colors.text.tertiary }}>±{Math.round(Number(selectedLoc.accuracy))}{t("м", "m")}</Text>
                )}
              </View>
            </View>
            <TouchableOpacity onPress={() => setSelectedId(null)} style={{ padding: 4 }}>
              <Feather name="x" size={16} color={colors.text.tertiary} />
            </TouchableOpacity>
          </Card>
        </FadeInItem>
      )}

      {/* Agent list */}
      <FlatList
        data={locations}
        keyExtractor={l => String(l.id)}
        /*
          Панель вкладок стоит поверх экрана (position: absolute), места под
          себя навигатор не резервирует, и отбить низ обязан каждый экран сам.
          Отбито было 24 точки против примерно 80 занятых: супервайзер
          долистывал список до конца и не мог нажать на последнего агента —
          карточка наполовину под плашкой, касание уходило в кнопку вкладки.
        */
        contentContainerStyle={{ padding: Spacing.lg, paddingBottom: insets.bottom + BOTTOM_TAB_HEIGHT + Spacing.lg }}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.accent.primary} colors={[colors.accent.primary]} />
        }
        ListEmptyComponent={
          !isLoading ? (
            <View style={{ alignItems: "center", paddingTop: 40, gap: 8 }}>
              <Feather name="map-pin" size={28} color={colors.text.muted} />
              <Text style={{ fontFamily: Typography.fontMedium, fontSize: Typography.size.base, color: colors.text.secondary }}>{t("Нет данных о локации", "Joylashuv ma'lumoti yo'q")}</Text>
            </View>
          ) : null
        }
        ListHeaderComponent={
          isLoading ? (
            <View style={{ gap: 8 }}>
              {[1, 2, 3].map(i => (
                <ShimmerSkeleton key={i} height={56} radius={Radii.lg} />
              ))}
            </View>
          ) : null
        }
        renderItem={({ item: loc }) => {
          const online = isOnline(loc.createdAt);
          const selected = selectedId === loc.agentId;
          return (
            <PressableScale onPress={() => focusAgent(loc)} haptic="light" style={{ marginBottom: 8 }}>
              <Card style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 12, ...(selected ? soft(isDark).raisedSm : soft(isDark).inset),}}>
                <View style={{ width: 36, height: 36, borderRadius: Radii.full, backgroundColor: online ? colors.status.success : colors.text.tertiary, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ color: "#fff", fontFamily: Typography.fontBold, fontSize: Typography.size.sm }}>{(loc.agentName ?? "A")[0].toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: Typography.fontSemibold, fontSize: Typography.size.base, color: colors.text.primary }} numberOfLines={1}>{loc.agentName ?? t(`Агент #${loc.agentId}`, `Agent #${loc.agentId}`)}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 }}>
                    <Badge variant={online ? "success" : "warning"}>
                      {online ? t("На связи", "Aloqada") : timeAgo(loc.createdAt, lang)}
                    </Badge>
                    {loc.batteryLevel != null && (
                      <Text style={{ fontFamily: Typography.fontMedium, fontSize: Typography.size.xs, color: batteryColor(loc.batteryLevel) }}>🔋 {loc.batteryLevel}%</Text>
                    )}
                  </View>
                </View>
                <Feather name={selected ? "chevron-down" : "chevron-right"} size={16} color={colors.text.tertiary} />
              </Card>
            </PressableScale>
          );
        }}
      />
    </View>
  );
}
