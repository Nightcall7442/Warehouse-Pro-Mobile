// Warehouse Pro — Tracking v2 (cold palette, Card component)
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
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
import { useThemeColors } from "../../src/store/theme";
import { Typography, Spacing, Radii, KpiColors } from "../../src/theme";
import { Card, ScreenHeader, Badge } from "../../src/components/ui";
import { ShimmerSkeleton, PressableScale, FadeInItem } from "../../src/components/Animated";
import YandexMapView, { centerOnAgent, fitAllMarkers } from "../../src/components/YandexMapView";
import type { WebView } from "react-native-webview";

const ONLINE_WINDOW = 600;

function isOnline(createdAt: string | undefined): boolean {
  if (!createdAt) return false;
  return (Date.now() - new Date(createdAt).getTime()) / 1000 < ONLINE_WINDOW;
}

function timeAgo(createdAt: string | undefined): string {
  if (!createdAt) return "Нет данных";
  const s = Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000);
  if (s < 60) return "Только что";
  if (s < 3600) return `${Math.floor(s / 60)} мин назад`;
  if (s < 86400) return `${Math.floor(s / 3600)} ч назад`;
  return new Date(createdAt).toLocaleDateString("ru");
}

function batteryColor(level: number): string {
  if (level >= 50) return KpiColors.teal;
  if (level >= 20) return KpiColors.amber;
  return KpiColors.red;
}

export default function TrackingScreen() {
  const { width: SCREEN_W } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();

  const webViewRef = useRef<WebView>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [locations, setLocations] = useState<AgentLocation[]>([]);

  const {
    data: polledLocations,
    isLoading,
    isError,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ["agentLocations"],
    queryFn: getAgentLocations,
    refetchInterval: 15_000,
    retry: 2,
  });

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (polledLocations) setLocations(polledLocations);
  }, [polledLocations]);

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
          label: l.agentName ?? `Agent #${l.agentId}`,
          color: isOnline(l.createdAt) ? KpiColors.teal : "#98a0b8",
          online: isOnline(l.createdAt),
          batteryLevel: l.batteryLevel ?? null,
        })),
    [locations]
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
        title="Трекинг"
        right={
          <PressableScale onPress={fitAll} haptic="light">
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.bg.elevated, paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radii.full, borderWidth: 1, borderColor: colors.border.default }}>
              <Feather name="maximize-2" size={13} color={colors.text.secondary} />
              <Text style={{ fontFamily: Typography.fontMedium, fontSize: Typography.size.sm, color: colors.text.secondary }}>Все</Text>
            </View>
          </PressableScale>
        }
      />

      {/* Stats */}
      <FadeInItem delay={0}>
        <View style={{ flexDirection: "row", gap: Spacing.sm, marginHorizontal: Spacing.lg, marginTop: Spacing.md }}>
          {[
            { label: "ОНЛАЙН", value: onlineCount, color: colors.status.success },
            { label: "НЕ В СЕТИ", value: offlineCount, color: colors.status.warning },
            { label: "ВСЕГО", value: locations.length, color: colors.accent.primary },
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
        <View style={{ height: SCREEN_W * 0.7, backgroundColor: colors.bg.elevated, marginHorizontal: Spacing.lg, marginTop: Spacing.md, borderRadius: Radii.lg, overflow: "hidden", borderWidth: 1, borderColor: colors.border.default }}>
          {isError ? (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 8 }}>
              <Feather name="wifi-off" size={28} color={colors.text.muted} />
              <Text style={{ fontFamily: Typography.fontMedium, color: colors.text.secondary }}>Ошибка загрузки</Text>
              <PressableScale onPress={() => refetch()} haptic="light">
                <View style={{ marginTop: 8, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: colors.accent.primary, borderRadius: Radii.md }}>
                  <Text style={{ color: "#fff", fontFamily: Typography.fontMedium }}>Повторить</Text>
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
            style={{ position: "absolute", bottom: 12, right: 12, backgroundColor: colors.bg.card, borderRadius: Radii.full, padding: 10, borderWidth: 1, borderColor: colors.border.default }}
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
              <Text style={{ fontFamily: Typography.fontSemibold, fontSize: Typography.size.sm, color: colors.text.primary }}>{selectedLoc.agentName ?? `Агент #${selectedLoc.agentId}`}</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
                <Badge variant={isOnline(selectedLoc.createdAt) ? "success" : "warning"}>
                  {isOnline(selectedLoc.createdAt) ? "Онлайн" : timeAgo(selectedLoc.createdAt)}
                </Badge>
                {selectedLoc.batteryLevel != null && (
                  <Text style={{ fontFamily: Typography.fontMedium, fontSize: Typography.size.xs, color: batteryColor(selectedLoc.batteryLevel) }}>🔋 {selectedLoc.batteryLevel}%</Text>
                )}
                {selectedLoc.accuracy && (
                  <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.xs, color: colors.text.tertiary }}>±{Math.round(Number(selectedLoc.accuracy))}м</Text>
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
        contentContainerStyle={{ padding: Spacing.lg, paddingBottom: insets.bottom + 24 }}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.accent.primary} colors={[colors.accent.primary]} />
        }
        ListEmptyComponent={
          !isLoading ? (
            <View style={{ alignItems: "center", paddingTop: 40, gap: 8 }}>
              <Feather name="map-pin" size={28} color={colors.text.muted} />
              <Text style={{ fontFamily: Typography.fontMedium, fontSize: Typography.size.base, color: colors.text.secondary }}>Нет данных о локации</Text>
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
              <Card style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderWidth: selected ? 1.5 : 1, borderColor: selected ? colors.accent.primary : colors.border.default }}>
                <View style={{ width: 36, height: 36, borderRadius: Radii.full, backgroundColor: online ? colors.status.success : colors.text.tertiary, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ color: "#fff", fontFamily: Typography.fontBold, fontSize: Typography.size.sm }}>{(loc.agentName ?? "A")[0].toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: Typography.fontSemibold, fontSize: Typography.size.base, color: colors.text.primary }} numberOfLines={1}>{loc.agentName ?? `Агент #${loc.agentId}`}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 }}>
                    <Badge variant={online ? "success" : "warning"}>
                      {online ? "Онлайн" : timeAgo(loc.createdAt)}
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
