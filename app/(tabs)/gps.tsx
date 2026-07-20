// Warehouse Pro — GPS v2 (cold palette, Card, Badge, FadeInItem)
import { useState, useEffect, useRef } from "react";
import { View, Text, Switch, ScrollView, RefreshControl } from "react-native";
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, cancelAnimation } from "react-native-reanimated";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import * as Battery from "expo-battery";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { saveLocation } from "../../src/api";
import { Card, Button, Badge } from "../../src/components/ui";
import { Typography, Spacing, Radii, Gradients, ThemeColors } from "../../src/theme";
import { useThemeColors } from "../../src/store/theme";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FadeInItem } from "../../src/components/Animated";
import { startBackgroundTracking, stopBackgroundTracking } from "../../src/backgroundLocation";

type GpsState = "idle" | "locating" | "success" | "error";

function AccuracyBar({ accuracy, colors }: { accuracy: number; colors: ThemeColors }) {
  const level = accuracy < 10 ? 4 : accuracy < 50 ? 3 : accuracy < 200 ? 2 : 1;
  const color = level === 4 ? colors.status.success : level === 3 ? colors.status.info : level === 2 ? colors.status.warning : colors.status.danger;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      {[1, 2, 3, 4].map(i => (
        <View key={i} style={{ width: 6, height: 12, borderRadius: 3, backgroundColor: i <= level ? color : colors.bg.elevated }} />
      ))}
      <Text style={{ fontSize: Typography.size.xs, marginLeft: 4, fontFamily: Typography.fontMedium, color }}>
        {accuracy < 10 ? "Отличный" : accuracy < 50 ? "Хороший" : accuracy < 200 ? "Нормальный" : "Слабый"} сигнал
      </Text>
    </View>
  );
}

const AUTO_TRACK_KEY = "gps_auto_track";

export default function GpsScreen() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<GpsState>("idle");
  const [coords, setCoords] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [error, setError] = useState("");
  const [autoTrack, setAutoTrack] = useState(false);
  const [lastSent, setLastSent] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isLocating = useRef(false);
  const spin = useSharedValue(0);

  useEffect(() => {
    AsyncStorage.getItem(AUTO_TRACK_KEY).then(v => { if (v === "true") setAutoTrack(true); });
  }, []);

  useEffect(() => { AsyncStorage.setItem(AUTO_TRACK_KEY, String(autoTrack)); }, [autoTrack]);

  const locate = async () => {
    if (isLocating.current) return;
    isLocating.current = true;
    setState("locating");
    setError("");

    let { status } = await Location.getForegroundPermissionsAsync();
    if (status === "undetermined") ({ status } = await Location.requestForegroundPermissionsAsync());
    if (status !== "granted") {
      setError("Доступ к геолокации запрещён. Разрешите в настройках.");
      setState("error");
      isLocating.current = false;
      return;
    }

    try {
      const [pos, battery] = await Promise.all([
        Promise.race([
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error("GPS timeout")), 15_000)),
        ]),
        Battery.getBatteryLevelAsync().catch(() => null),
      ]);
      const c = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy ?? 999 };
      setCoords(c);
      const batteryPct = battery !== null ? Math.round(battery * 100) : undefined;
      await saveLocation(c.lat, c.lng, c.accuracy, batteryPct);
      setState("success");
      setLastSent(new Date());
    } catch {
      setError("Не удалось определить местоположение. Проверьте GPS.");
      setState("error");
      setLastSent(null);
    } finally {
      isLocating.current = false;
    }
  };

  useEffect(() => {
    if (autoTrack) {
      locate();
      intervalRef.current = setInterval(locate, 5 * 60 * 1000);
      startBackgroundTracking().then(ok => { if (!ok) console.warn("Background location permission not granted"); });
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
      stopBackgroundTracking();
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [autoTrack]);

  useEffect(() => {
    if (state === "locating") spin.value = withRepeat(withTiming(1, { duration: 1000 }), -1, false);
    else cancelAnimation(spin);
  }, [state]);

  const spinStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * 360}deg` }] }));

  const handleRefresh = async () => { setRefreshing(true); await locate(); setRefreshing(false); };

  const statusMeta = {
    idle: { icon: "navigation" as const, gradient: true, text: "Нажмите кнопку, чтобы поделиться геолокацией", color: colors.text.secondary },
    locating: { icon: "loader" as const, gradient: true, text: "Определяем местоположение…", color: colors.text.secondary },
    success: { icon: "check" as const, gradient: false, text: "Геолокация успешно отправлена", color: colors.status.success },
    error: { icon: "alert-triangle" as const, gradient: false, text: error, color: colors.status.danger },
  }[state];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg.primary }}
      contentContainerStyle={{ padding: Spacing.base, paddingBottom: insets.bottom + 100, gap: Spacing.sm }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.accent.primary} />}
    >
      {/* Status card */}
      <FadeInItem delay={0}>
        <Card style={{ alignItems: "center", paddingVertical: Spacing["2xl"] }}>
          {statusMeta.gradient ? (
            <LinearGradient colors={Gradients.primarySoft} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 84, height: 84, borderRadius: Radii.full, alignItems: "center", justifyContent: "center", marginBottom: Spacing.md }}>
              <Animated.View style={state === "locating" ? spinStyle : undefined}>
                <Feather name={statusMeta.icon} size={32} color={colors.brand.primaryLight} />
              </Animated.View>
            </LinearGradient>
          ) : (
            <View style={{ width: 84, height: 84, borderRadius: Radii.full, alignItems: "center", justifyContent: "center", marginBottom: Spacing.md, backgroundColor: state === "success" ? colors.status.successDim : colors.status.dangerDim }}>
              <Feather name={statusMeta.icon} size={32} color={statusMeta.color} />
            </View>
          )}
          <Text style={{ fontSize: Typography.size.base, fontFamily: Typography.fontMedium, textAlign: "center", lineHeight: 22, paddingHorizontal: Spacing.base, color: statusMeta.color }}>{statusMeta.text}</Text>

          {coords && state === "success" && (
            <View style={{ marginTop: Spacing.md, alignItems: "center", gap: Spacing.sm }}>
              <Text style={{ fontSize: Typography.size.sm, fontFamily: "Courier New", color: colors.text.secondary, letterSpacing: 0.5 }}>{coords.lat.toFixed(6)}, {coords.lng.toFixed(6)}</Text>
              <AccuracyBar accuracy={coords.accuracy} colors={colors} />
            </View>
          )}
        </Card>
      </FadeInItem>

      {/* Manual share button */}
      <FadeInItem delay={40}>
        <Button variant="primary" size="lg" fullWidth icon={state === "locating" ? undefined : "map-pin"} loading={state === "locating"} onPress={locate} disabled={state === "locating"}>
          {state === "locating" ? "Определяем…" : "Поделиться геолокацией"}
        </Button>
      </FadeInItem>

      {/* Auto-tracking toggle */}
      <FadeInItem delay={80}>
        <Card>
          <View style={{ flexDirection: "row", alignItems: "center", gap: Spacing.md }}>
            <View style={{ width: 40, height: 40, borderRadius: Radii.md, backgroundColor: colors.brand.primaryDim, alignItems: "center", justifyContent: "center" }}>
              <Feather name="repeat" size={18} color={colors.brand.primaryLight} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: Typography.size.base, fontFamily: Typography.fontSemibold, color: colors.text.primary }}>Авто-слежение</Text>
              <Text style={{ fontSize: Typography.size.sm, color: colors.text.muted, marginTop: 2 }}>Отправка каждые 2 минуты</Text>
            </View>
            <Switch value={autoTrack} onValueChange={v => { Haptics.selectionAsync(); setAutoTrack(v); }} trackColor={{ false: colors.bg.elevated, true: colors.brand.primary }} thumbColor="#fff" />
          </View>
          {autoTrack && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: Spacing.md, paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: colors.border.subtle }}>
              <Badge variant="success">Авто-слежение активно</Badge>
            </View>
          )}
        </Card>
      </FadeInItem>

      {/* Last sent */}
      {lastSent && (
        <FadeInItem delay={100}>
          <Card style={{ alignItems: "center", paddingVertical: Spacing.lg }}>
            <Text style={{ fontSize: Typography.size.xs, fontFamily: Typography.fontBold, color: colors.text.muted, letterSpacing: 1.5, marginBottom: 4 }}>ПОСЛЕДНЯЯ ОТПРАВКА</Text>
            <Text style={{ fontSize: Typography.size["2xl"], color: colors.text.primary, fontVariant: ["tabular-nums"], fontFamily: "Courier New" }}>
              {lastSent.toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </Text>
            {coords && (
              <Text style={{ fontSize: Typography.size.xs, color: colors.text.muted, marginTop: 4, fontFamily: "Courier New" }}>
                {coords.lat.toFixed(5)}° N, {coords.lng.toFixed(5)}° E · ±{Math.round(coords.accuracy)} м
              </Text>
            )}
          </Card>
        </FadeInItem>
      )}

      {/* Info */}
      <FadeInItem delay={120}>
        <Card variant="accent">
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <Feather name="info" size={15} color={colors.brand.primaryLight} />
            <Text style={{ fontSize: Typography.size.sm, fontFamily: Typography.fontSemibold, color: colors.text.primary }}>Как это работает</Text>
          </View>
          <Text style={{ fontSize: Typography.size.sm, color: colors.text.secondary, lineHeight: 20 }}>
            Ваши координаты будут видны супервайзеру на карте. Это помогает планировать маршруты и подтверждать посещения магазинов.
          </Text>
        </Card>
      </FadeInItem>
    </ScrollView>
  );
}
