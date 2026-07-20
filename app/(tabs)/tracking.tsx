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
import { useThemeColors, useThemeStore } from "../../src/store/theme";
import { Typography, Radii, Shadows } from "../../src/theme";
import { DarkShadowColor } from "../../src/theme";
import { ScreenHeader } from "../../src/components/ui";
import { ShimmerSkeleton, PressableScale } from "../../src/components/Animated";
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
  if (level >= 50) return "#34c473";
  if (level >= 20) return "#d4973a";
  return "#d45050";
}

export default function TrackingScreen() {
  const { width: SCREEN_W } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { isDark } = useThemeStore();
  const sc = isDark ? DarkShadowColor : Shadows.sm.shadowColor;

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
          color: isOnline(l.createdAt) ? "#34c473" : "#98a0b8",
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
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                backgroundColor: colors.bg.elevated,
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: Radii.full,
                borderWidth: 1,
                borderColor: colors.border.default,
              }}
            >
              <Feather name="maximize-2" size={13} color={colors.text.secondary} />
              <Text
                style={{
                  fontFamily: Typography.fontMedium,
                  fontSize: Typography.size.sm,
                  color: colors.text.secondary,
                }}
              >
                Все
              </Text>
            </View>
          </PressableScale>
        }
      />

      {/* Stats */}
      <View style={{ flexDirection: "row", gap: 8, marginHorizontal: 16, marginTop: 12 }}>
        {[
          { label: "ОНЛАЙН", value: onlineCount, color: colors.status.success },
          { label: "НЕ В СЕТИ", value: offlineCount, color: colors.status.warning },
          { label: "ВСЕГО", value: locations.length, color: colors.accent.primary },
        ].map(k => (
          <View
            key={k.label}
            style={{
              flex: 1,
              backgroundColor: colors.bg.card,
              borderRadius: Radii.md,
              borderWidth: 1,
              borderColor: colors.border.default,
              padding: 10,
              shadowColor: sc,
              shadowOffset: Shadows.xs.shadowOffset,
              shadowOpacity: Shadows.xs.shadowOpacity,
              shadowRadius: Shadows.xs.shadowRadius,
              elevation: Shadows.xs.elevation,
            }}
          >
            <Text
              style={{
                fontFamily: Typography.fontBold,
                fontSize: Typography.size.xl,
                color: k.color,
                fontVariant: ["tabular-nums"],
              }}
            >
              {k.value}
            </Text>
            <Text
              style={{
                fontFamily: Typography.fontMedium,
                fontSize: Typography.size.xs,
                color: colors.text.tertiary,
                letterSpacing: 0.5,
                marginTop: 2,
              }}
            >
              {k.label}
            </Text>
          </View>
        ))}
      </View>

      {/* Map */}
      <View
        style={{
          height: SCREEN_W * 0.7,
          backgroundColor: colors.bg.elevated,
          marginHorizontal: 16,
          marginTop: 12,
          borderRadius: Radii.lg,
          overflow: "hidden",
          borderWidth: 1,
          borderColor: colors.border.default,
          shadowColor: sc,
          shadowOffset: Shadows.sm.shadowOffset,
          shadowOpacity: Shadows.sm.shadowOpacity,
          shadowRadius: Shadows.sm.shadowRadius,
          elevation: Shadows.sm.elevation,
        }}
      >
        {isError ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 8 }}>
            <Feather name="wifi-off" size={28} color={colors.text.muted} />
            <Text style={{ fontFamily: Typography.fontMedium, color: colors.text.secondary }}>
              Ошибка загрузки
            </Text>
            <PressableScale onPress={() => refetch()} haptic="light">
              <View
                style={{
                  marginTop: 8,
                  paddingHorizontal: 16,
                  paddingVertical: 8,
                  backgroundColor: colors.accent.primary,
                  borderRadius: Radii.md,
                }}
              >
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
          style={{
            position: "absolute",
            bottom: 12,
            right: 12,
            backgroundColor: colors.bg.card,
            borderRadius: 999,
            padding: 10,
            borderWidth: 1,
            borderColor: colors.border.default,
            shadowColor: sc,
            shadowOffset: Shadows.sm.shadowOffset,
            shadowOpacity: Shadows.sm.shadowOpacity,
            shadowRadius: Shadows.sm.shadowRadius,
            elevation: Shadows.sm.elevation,
          }}
        >
          <Feather name="crosshair" size={18} color={colors.accent.primary} />
        </TouchableOpacity>
      </View>

      {/* Selected agent info */}
      {selectedLoc && (
        <View
          style={{
            marginHorizontal: 16,
            marginTop: 10,
            backgroundColor: colors.bg.card,
            borderRadius: Radii.md,
            borderWidth: 1,
            borderColor: colors.accent.primary + "40",
            padding: 12,
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
          }}
        >
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: isOnline(selectedLoc.createdAt)
                ? colors.status.success
                : colors.text.tertiary,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text
              style={{
                color: "#fff",
                fontFamily: Typography.fontBold,
                fontSize: Typography.size.xs,
              }}
            >
              {(selectedLoc.agentName ?? "A")[0].toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontFamily: Typography.fontSemibold,
                fontSize: Typography.size.sm,
                color: colors.text.primary,
              }}
            >
              {selectedLoc.agentName ?? `Агент #${selectedLoc.agentId}`}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
              <View
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: isOnline(selectedLoc.createdAt)
                    ? colors.status.success
                    : colors.status.warning,
                }}
              />
              <Text
                style={{
                  fontFamily: Typography.fontRegular,
                  fontSize: Typography.size.xs,
                  color: colors.text.tertiary,
                }}
              >
                {isOnline(selectedLoc.createdAt) ? "Онлайн" : timeAgo(selectedLoc.createdAt)}
              </Text>
              {selectedLoc.batteryLevel != null && (
                <Text
                  style={{
                    fontFamily: Typography.fontMedium,
                    fontSize: Typography.size.xs,
                    color: batteryColor(selectedLoc.batteryLevel),
                  }}
                >
                  🔋 {selectedLoc.batteryLevel}%
                </Text>
              )}
              {selectedLoc.accuracy && (
                <Text
                  style={{
                    fontFamily: Typography.fontRegular,
                    fontSize: Typography.size.xs,
                    color: colors.text.tertiary,
                  }}
                >
                  ±{Math.round(Number(selectedLoc.accuracy))}м
                </Text>
              )}
            </View>
          </View>
          <TouchableOpacity onPress={() => setSelectedId(null)} style={{ padding: 4 }}>
            <Feather name="x" size={16} color={colors.text.tertiary} />
          </TouchableOpacity>
        </View>
      )}

      {/* Agent list */}
      <FlatList
        data={locations}
        keyExtractor={l => String(l.id)}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={colors.accent.primary}
            colors={[colors.accent.primary]}
          />
        }
        ListEmptyComponent={
          !isLoading ? (
            <View style={{ alignItems: "center", paddingTop: 40, gap: 8 }}>
              <Feather name="map-pin" size={28} color={colors.text.muted} />
              <Text
                style={{
                  fontFamily: Typography.fontMedium,
                  fontSize: Typography.size.base,
                  color: colors.text.secondary,
                }}
              >
                Нет данных о локации
              </Text>
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
            <PressableScale onPress={() => focusAgent(loc)} haptic="light">
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  backgroundColor: colors.bg.card,
                  borderRadius: Radii.lg,
                  borderWidth: 1.5,
                  borderColor: selected ? colors.accent.primary : colors.border.default,
                  padding: 12,
                  marginBottom: 8,
                  shadowColor: sc,
                  shadowOffset: Shadows.sm.shadowOffset,
                  shadowOpacity: Shadows.sm.shadowOpacity,
                  shadowRadius: Shadows.sm.shadowRadius,
                  elevation: Shadows.sm.elevation,
                }}
              >
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: online ? colors.status.success : colors.text.tertiary,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text
                    style={{
                      color: "#fff",
                      fontFamily: Typography.fontBold,
                      fontSize: Typography.size.sm,
                    }}
                  >
                    {(loc.agentName ?? "A")[0].toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontFamily: Typography.fontSemibold,
                      fontSize: Typography.size.base,
                      color: colors.text.primary,
                    }}
                    numberOfLines={1}
                  >
                    {loc.agentName ?? `Агент #${loc.agentId}`}
                  </Text>
                  <View
                    style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 }}
                  >
                    <View
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: 3,
                        backgroundColor: online ? colors.status.success : colors.status.warning,
                      }}
                    />
                    <Text
                      style={{
                        fontFamily: Typography.fontRegular,
                        fontSize: Typography.size.xs,
                        color: colors.text.tertiary,
                      }}
                    >
                      {online ? "Онлайн" : timeAgo(loc.createdAt)}
                    </Text>
                    {loc.batteryLevel != null && (
                      <Text
                        style={{
                          fontFamily: Typography.fontMedium,
                          fontSize: Typography.size.xs,
                          color: batteryColor(loc.batteryLevel),
                        }}
                      >
                        🔋 {loc.batteryLevel}%
                      </Text>
                    )}
                  </View>
                </View>
                <Feather
                  name={selected ? "chevron-down" : "chevron-right"}
                  size={16}
                  color={colors.text.tertiary}
                />
              </View>
            </PressableScale>
          );
        }}
      />
    </View>
  );
}
