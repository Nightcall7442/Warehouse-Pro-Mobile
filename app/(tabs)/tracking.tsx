// Warehouse Pro — Supervisor Tracking (matches web SupervisorTracking.tsx)
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { View, Text, TouchableOpacity, FlatList, useWindowDimensions, Platform, RefreshControl } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getAgentLocations, AgentLocation, API_BASE } from "../../src/api";
import { SecureStore } from "../../src/storage";
import { useThemeColors, useThemeStore } from "../../src/store/theme";
import { Typography, Radii, Shadows, ThemeColors } from "../../src/theme";
import { DarkShadowColor } from "../../src/theme";
import { ScreenHeader } from "../../src/components/ui";
import { ShimmerSkeleton, PressableScale } from "../../src/components/Animated";

// Conditional MapView import — safe for standalone APK
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let MapView: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let Marker: any = null;
let PROVIDER_GOOGLE: string | undefined;
let PROVIDER_DEFAULT: string | undefined;
if (Platform.OS !== "web") {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const maps = require("react-native-maps");
    MapView = maps.default;
    Marker = maps.Marker;
    PROVIDER_GOOGLE = maps.PROVIDER_GOOGLE;
    PROVIDER_DEFAULT = maps.PROVIDER_DEFAULT;
  } catch {
    // react-native-maps not linked in standalone build
  }
}

const ONLINE_WINDOW = 600;
const DEFAULT_REGION = { latitude: 41.2995, longitude: 69.2401, latitudeDelta: 0.3, longitudeDelta: 0.3 };

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

// ── Agent Marker ─────────────────────────────────────────────────────────────
const AgentMarker = React.memo(function AgentMarker({ isSelected, online, agentName, agentId, colors }: {
  isSelected: boolean; online: boolean; agentName?: string; agentId: number; colors: ThemeColors;
}) {
  return (
    <View style={{
      width: isSelected ? 44 : 34, height: isSelected ? 44 : 34, borderRadius: isSelected ? 22 : 17,
      backgroundColor: online ? colors.status.success : colors.text.tertiary,
      borderWidth: 3, borderColor: isSelected ? colors.accent.primary : "#fff",
      alignItems: "center", justifyContent: "center",
      shadowColor: isSelected ? colors.accent.primary : "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: isSelected ? 0.4 : 0.2, shadowRadius: 8, elevation: isSelected ? 6 : 3,
    }}>
      <Text style={{ color: "#fff", fontFamily: Typography.fontBold, fontSize: isSelected ? Typography.size.md : Typography.size.sm }}>
        {(agentName ?? "A")[0].toUpperCase()}
      </Text>
      {isSelected && (
        <View style={{ position: "absolute", bottom: -20, backgroundColor: "rgba(0,0,0,0.75)", paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radii.sm }}>
          <Text style={{ color: "#fff", fontSize: Typography.size.xs, fontFamily: Typography.fontMedium }}>{agentName ?? `Agent #${agentId}`}</Text>
        </View>
      )}
    </View>
  );
});

// ── Main ─────────────────────────────────────────────────────────────────────
export default function TrackingScreen() {
  const { width: SCREEN_W } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { isDark } = useThemeStore();
  const sc = isDark ? DarkShadowColor : Shadows.sm.shadowColor;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [locations, setLocations] = useState<AgentLocation[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const wsFailures = useRef(0);
  const [wsConnected, setWsConnected] = useState(false);

  const { data: polledLocations, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ["agentLocations"], queryFn: getAgentLocations, refetchInterval: wsConnected ? false : 15_000, retry: 2,
  });

  useEffect(() => { if (polledLocations) setLocations(polledLocations); }, [polledLocations]);

  // WebSocket for real-time updates
  useEffect(() => {
    let mounted = true;
    let reconnectTimeout: ReturnType<typeof setTimeout>;
    async function connect() {
      const token = await SecureStore.getItemAsync("session_token");
      if (!token || !mounted) return;
      const wsHost = API_BASE.replace(/^https?:\/\//, "").replace(/\/$/, "");
      const protocol = API_BASE.startsWith("https") ? "wss" : "ws";
      const ws = new WebSocket(`${protocol}://${wsHost}/ws`);
      ws.onopen = () => { wsFailures.current = 0; setWsConnected(true); ws.send(JSON.stringify({ type: "auth", token })); };
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === "agent_location") {
            setLocations(prev => {
              const idx = prev.findIndex(l => l.agentId === msg.agentId);
              const updated: AgentLocation = { id: msg.agentId, agentId: msg.agentId, agentName: msg.agentName, lat: String(msg.lat), lng: String(msg.lng), accuracy: msg.accuracy != null ? String(msg.accuracy) : undefined, createdAt: new Date().toISOString() };
              if (idx >= 0) { const next = [...prev]; next[idx] = updated; return next; }
              return [...prev, updated];
            });
          }
        } catch { /* parse error */ }
      };
      ws.onerror = () => { wsFailures.current++; };
      ws.onclose = () => { if (!mounted) return; setWsConnected(false); wsRef.current = null; reconnectTimeout = setTimeout(connect, Math.min(1000 * 2 ** wsFailures.current, 30_000)); };
      wsRef.current = ws;
    }
    connect();
    return () => { mounted = false; clearTimeout(reconnectTimeout); wsRef.current?.close(); wsRef.current = null; };
  }, []);

  const onlineCount = locations.filter(l => isOnline(l.createdAt)).length;
  const offlineCount = locations.length - onlineCount;

  const initialRegion = useMemo(() => {
    const valid = locations.filter(l => { const lat = Number(l.lat), lng = Number(l.lng); return lat !== 0 && lng !== 0 && !isNaN(lat) && !isNaN(lng); });
    if (valid.length === 0) return DEFAULT_REGION;
    const lats = valid.map(l => Number(l.lat)), lngs = valid.map(l => Number(l.lng));
    return { latitude: (Math.min(...lats) + Math.max(...lats)) / 2, longitude: (Math.min(...lngs) + Math.max(...lngs)) / 2, latitudeDelta: Math.max(0.02, (Math.max(...lats) - Math.min(...lats)) * 1.6), longitudeDelta: Math.max(0.02, (Math.max(...lngs) - Math.min(...lngs)) * 1.6) };
  }, [locations]);

  const focusAgent = useCallback((loc: AgentLocation) => {
    setSelectedId(loc.agentId);
    const lat = Number(loc.lat), lng = Number(loc.lng);
    if (!lat || !lng || !mapRef.current || !mapReady) return;
    mapRef.current.animateToRegion({ latitude: lat, longitude: lng, latitudeDelta: 0.02, longitudeDelta: 0.02 }, 500);
  }, [mapReady]);

  const fitAll = useCallback(() => {
    if (!mapRef.current || !mapReady) return;
    const valid = locations.filter(l => Number(l.lat) && Number(l.lng));
    if (valid.length === 0) return;
    mapRef.current.fitToCoordinates(valid.map(l => ({ latitude: Number(l.lat), longitude: Number(l.lng) })), { edgePadding: { top: 50, right: 50, bottom: 50, left: 50 }, animated: true });
  }, [mapReady, locations]);

  const mapProvider = (Platform.OS === "android" && process.env.GOOGLE_MAPS_ANDROID_API_KEY) ? PROVIDER_GOOGLE : PROVIDER_DEFAULT;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      <ScreenHeader title="Трекинг" right={
        <PressableScale onPress={fitAll} haptic="light">
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.bg.elevated, paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radii.full, borderWidth: 1, borderColor: colors.border.default }}>
            <Feather name="maximize-2" size={13} color={colors.text.secondary} />
            <Text style={{ fontFamily: Typography.fontMedium, fontSize: Typography.size.sm, color: colors.text.secondary }}>Все</Text>
          </View>
        </PressableScale>
      } />

      {/* Stats */}
      <View style={{ flexDirection: "row", gap: 8, marginHorizontal: 16, marginTop: 12 }}>
        {[
          { label: "ОНЛАЙН", value: onlineCount, color: colors.status.success },
          { label: "НЕ В СЕТИ", value: offlineCount, color: colors.status.warning },
          { label: "ВСЕГО", value: locations.length, color: colors.accent.primary },
        ].map(k => (
          <View key={k.label} style={{ flex: 1, backgroundColor: colors.bg.card, borderRadius: Radii.md, borderWidth: 1, borderColor: colors.border.default, padding: 10, shadowColor: sc, shadowOffset: Shadows.xs.shadowOffset, shadowOpacity: Shadows.xs.shadowOpacity, shadowRadius: Shadows.xs.shadowRadius, elevation: Shadows.xs.elevation }}>
            <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.xl, color: k.color, fontVariant: ["tabular-nums"] }}>{k.value}</Text>
            <Text style={{ fontFamily: Typography.fontMedium, fontSize: Typography.size.xs, color: colors.text.tertiary, letterSpacing: 0.5, marginTop: 2 }}>{k.label}</Text>
          </View>
        ))}
      </View>

      {/* Map */}
      <View style={{ height: SCREEN_W * 0.75, backgroundColor: colors.bg.elevated, position: "relative" }}>
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
        ) : MapView ? (
          <MapView ref={mapRef} style={{ flex: 1 }} provider={mapProvider} initialRegion={initialRegion}
            onMapReady={() => setMapReady(true)} onMapLoaded={() => setMapReady(true)}
            showsUserLocation={false} showsMyLocationButton={false} showsCompass={true}
            loadingEnabled={true} loadingIndicatorColor={colors.accent.primary} loadingBackgroundColor={colors.bg.elevated}>
            {locations.filter(loc => Number(loc.lat) && Number(loc.lng)).map(loc => (
              <Marker key={loc.id} coordinate={{ latitude: Number(loc.lat), longitude: Number(loc.lng) }}
                onPress={() => focusAgent(loc)} tracksViewChanges={false}>
                <AgentMarker isSelected={selectedId === loc.agentId} online={isOnline(loc.createdAt)} agentName={loc.agentName} agentId={loc.agentId} colors={colors} />
              </Marker>
            ))}
          </MapView>
        ) : (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <Feather name="map" size={28} color={colors.text.muted} />
            <Text style={{ fontFamily: Typography.fontMedium, color: colors.text.secondary, marginTop: 8 }}>Карта недоступна</Text>
          </View>
        )}
        {/* Center button */}
        <TouchableOpacity onPress={fitAll} style={{ position: "absolute", bottom: 16, right: 16, backgroundColor: colors.bg.card, borderRadius: Radii.full, padding: 12, borderWidth: 1, borderColor: colors.border.default, shadowColor: sc, shadowOffset: Shadows.md.shadowOffset, shadowOpacity: Shadows.md.shadowOpacity, shadowRadius: Shadows.md.shadowRadius, elevation: Shadows.md.elevation }}>
          <Feather name="crosshair" size={20} color={colors.accent.primary} />
        </TouchableOpacity>
      </View>

      {/* Agent list */}
      <FlatList data={locations} keyExtractor={l => String(l.id)}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.accent.primary} colors={[colors.accent.primary]} />}
        ListEmptyComponent={!isLoading ? (
          <View style={{ alignItems: "center", paddingTop: 40, gap: 8 }}>
            <Feather name="map-pin" size={28} color={colors.text.muted} />
            <Text style={{ fontFamily: Typography.fontMedium, fontSize: Typography.size.base, color: colors.text.secondary }}>Нет данных о локации</Text>
          </View>
        ) : null}
        ListHeaderComponent={isLoading ? <View style={{ gap: 8 }}>{[1, 2, 3].map(i => <ShimmerSkeleton key={i} height={56} radius={Radii.lg} />)}</View> : null}
        renderItem={({ item: loc }) => {
          const online = isOnline(loc.createdAt);
          const selected = selectedId === loc.agentId;
          return (
            <PressableScale onPress={() => focusAgent(loc)} haptic="light">
              <View style={{
                flexDirection: "row", alignItems: "center", gap: 10,
                backgroundColor: colors.bg.card, borderRadius: Radii.lg, borderWidth: 1.5,
                borderColor: selected ? colors.accent.primary : colors.border.default,
                padding: 12, marginBottom: 8,
                shadowColor: sc, shadowOffset: Shadows.sm.shadowOffset, shadowOpacity: Shadows.sm.shadowOpacity, shadowRadius: Shadows.sm.shadowRadius, elevation: Shadows.sm.elevation,
              }}>
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: online ? colors.status.success : colors.text.tertiary, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ color: "#fff", fontFamily: Typography.fontBold, fontSize: Typography.size.sm }}>{(loc.agentName ?? "A")[0].toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: Typography.fontSemibold, fontSize: Typography.size.base, color: colors.text.primary }} numberOfLines={1}>{loc.agentName ?? `Агент #${loc.agentId}`}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 }}>
                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: online ? colors.status.success : colors.status.warning }} />
                    <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.xs, color: colors.text.tertiary }}>{online ? "Онлайн" : timeAgo(loc.createdAt)}</Text>
                  </View>
                </View>
                <Feather name="chevron-right" size={16} color={colors.text.tertiary} />
              </View>
            </PressableScale>
          );
        }}
      />
    </View>
  );
}
