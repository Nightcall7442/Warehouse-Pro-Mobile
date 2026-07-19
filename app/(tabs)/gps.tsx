import { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  Switch,
  ScrollView,
  RefreshControl,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  cancelAnimation,
} from "react-native-reanimated";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import * as Battery from "expo-battery";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { saveLocation } from "../../src/api";
import { Card, Button } from "../../src/components/ui";
import { Typography, Spacing, Radii, Gradients, ThemeColors } from "../../src/theme";
import { useThemeColors } from "../../src/store/theme";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { startBackgroundTracking, stopBackgroundTracking } from "../../src/backgroundLocation";

type GpsState = "idle" | "locating" | "success" | "error";

function AccuracyBar({ accuracy, colors }: { accuracy: number; colors: ThemeColors }) {
  const s = makeStyles(colors);
  // <10m excellent, <50m good, <200m ok, else poor
  const level = accuracy < 10 ? 4 : accuracy < 50 ? 3 : accuracy < 200 ? 2 : 1;
  const color =
    level === 4 ? colors.status.success :
    level === 3 ? colors.status.info :
    level === 2 ? colors.status.warning :
    colors.status.danger;

  return (
    <View style={s.accuracyBar}>
      {[1, 2, 3, 4].map((i) => (
        <View
          key={i}
          style={[
            s.accuracySegment,
            { backgroundColor: i <= level ? color : colors.bg.elevated },
          ]}
        />
      ))}
      <Text style={[s.accuracyLabel, { color }]}>
        {accuracy < 10 ? "Отличный" : accuracy < 50 ? "Хороший" : accuracy < 200 ? "Нормальный" : "Слабый"} сигнал
      </Text>
    </View>
  );
}

const AUTO_TRACK_KEY = "gps_auto_track";

export default function GpsScreen() {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const s = makeStyles(colors, insets.bottom);
  const [state, setState] = useState<GpsState>("idle");
  const [coords, setCoords] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [error, setError] = useState("");
  const [autoTrack, setAutoTrack] = useState(false);
  const [lastSent, setLastSent] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isLocating = useRef(false);
  const spin = useSharedValue(0);

  // Restore auto-track state on mount
  useEffect(() => {
    AsyncStorage.getItem(AUTO_TRACK_KEY).then((v) => {
      if (v === "true") setAutoTrack(true);
    });
  }, []);

  // Persist auto-track state
  useEffect(() => {
    AsyncStorage.setItem(AUTO_TRACK_KEY, String(autoTrack));
  }, [autoTrack]);

  const locate = async () => {
    if (isLocating.current) return;
    isLocating.current = true;
    setState("locating");
    setError("");

    // Check permission first, only request if undetermined
    let { status } = await Location.getForegroundPermissionsAsync();
    if (status === "undetermined") {
      ({ status } = await Location.requestForegroundPermissionsAsync());
    }
    if (status !== "granted") {
      setError("Доступ к геолокации запрещён. Разрешите в настройках.");
      setState("error");
      isLocating.current = false;
      return;
    }

    try {
      // Race position acquisition against 15s timeout
      const [pos, battery] = await Promise.all([
        Promise.race([
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("GPS timeout")), 15_000)
          ),
        ]),
        Battery.getBatteryLevelAsync().catch(() => null),
      ]);
      const c = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy ?? 999,
      };
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
      // Start foreground polling
      // eslint-disable-next-line react-hooks/set-state-in-effect
      locate();
      intervalRef.current = setInterval(locate, 5 * 60 * 1000);
      // Also start background location task
      startBackgroundTracking().then((ok) => {
        if (!ok) console.warn("Background location permission not granted");
      });
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
      stopBackgroundTracking();
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [autoTrack]);

  useEffect(() => {
    if (state === "locating") {
      spin.value = withRepeat(
        withTiming(1, { duration: 1000 }),
        -1,
        false
      );
    } else {
      cancelAnimation(spin);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.value * 360}deg` }],
  }));

  const handleRefresh = async () => {
    setRefreshing(true);
    await locate();
    setRefreshing(false);
  };

  const statusMeta = {
    idle: { icon: "navigation" as const, gradient: true, text: "Нажмите кнопку, чтобы поделиться геолокацией", color: colors.text.secondary },
    locating: { icon: "loader" as const, gradient: true, text: "Определяем местоположение…", color: colors.text.secondary },
    success: { icon: "check" as const, gradient: false, text: "Геолокация успешно отправлена", color: colors.status.success },
    error: { icon: "alert-triangle" as const, gradient: false, text: error, color: colors.status.danger },
  }[state];

  return (
    <ScrollView
      style={s.container}
      contentContainerStyle={s.content}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.accent.primary} />}
    >
      {/* Status card */}
      <Card style={s.statusCard}>
        {statusMeta.gradient ? (
          <LinearGradient colors={Gradients.primarySoft} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.statusIconBox}>
            <Animated.View style={state === "locating" ? spinStyle : undefined}>
              <Feather name={statusMeta.icon} size={32} color={colors.brand.primaryLight} />
            </Animated.View>
          </LinearGradient>
        ) : (
          <View style={[
            s.statusIconBox,
            { backgroundColor: state === "success" ? colors.status.successDim : colors.status.dangerDim },
          ]}>
            <Feather name={statusMeta.icon} size={32} color={statusMeta.color} />
          </View>
        )}
        <Text style={[s.statusText, { color: statusMeta.color }]}>{statusMeta.text}</Text>

        {coords && state === "success" && (
          <View style={s.coordsBox}>
            <Text style={s.coordsText}>
              {coords.lat.toFixed(6)}, {coords.lng.toFixed(6)}
            </Text>
            <AccuracyBar accuracy={coords.accuracy} colors={colors} />
          </View>
        )}
      </Card>

      {/* Manual share button */}
      <Button
        variant="primary"
        size="lg"
        fullWidth
        icon={state === "locating" ? undefined : "map-pin"}
        loading={state === "locating"}
        onPress={locate}
        disabled={state === "locating"}
      >
        {state === "locating" ? "Определяем…" : "Поделиться геолокацией"}
      </Button>

      {/* Auto-tracking toggle */}
      <Card style={s.toggleCard}>
        <View style={s.toggleRow}>
          <View style={s.toggleIconBox}>
            <Feather name="repeat" size={18} color={colors.brand.primaryLight} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.toggleTitle}>Авто-слежение</Text>
            <Text style={s.toggleDesc}>
              Отправка каждые 2 минуты
            </Text>
          </View>
          <Switch
            value={autoTrack}
            onValueChange={(v) => { Haptics.selectionAsync(); setAutoTrack(v); }}
            trackColor={{
              false: colors.bg.elevated,
              true: colors.brand.primary,
            }}
            thumbColor="#fff"
          />
        </View>

        {autoTrack && (
          <View style={s.activeIndicator}>
            <View style={s.activeDot} />
            <Text style={s.activeText}>Авто-слежение активно</Text>
          </View>
        )}
      </Card>

      {/* Last sent */}
      {lastSent && (
        <Card style={s.lastSentCard}>
          <Text style={s.lastSentLabel}>ПОСЛЕДНЯЯ ОТПРАВКА</Text>
          <Text style={s.lastSentTime}>
            {lastSent.toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </Text>
          {coords && (
            <Text style={s.lastSentCoords}>
              {coords.lat.toFixed(5)}° N, {coords.lng.toFixed(5)}° E · ±{Math.round(coords.accuracy)} м
            </Text>
          )}
        </Card>
      )}

      {/* Info */}
      <Card variant="accent" style={s.infoCard}>
        <View style={s.infoHeader}>
          <Feather name="info" size={15} color={colors.brand.primaryLight} />
          <Text style={s.infoTitle}>Как это работает</Text>
        </View>
        <Text style={s.infoText}>
          Ваши координаты будут видны супервайзеру на карте. Это помогает планировать маршруты и подтверждать посещения магазинов.
        </Text>
      </Card>
    </ScrollView>
  );
}

function makeStyles(colors: ThemeColors, bottomInset: number = 0) {
  return {
    container: { flex: 1, backgroundColor: colors.bg.primary } as const,
    content: { padding: Spacing.base, paddingBottom: bottomInset + 100, gap: Spacing.sm },

    statusCard: {
      alignItems: "center" as const,
      paddingVertical: Spacing["2xl"],
    },
    statusIconBox: {
      width: 84,
      height: 84,
      borderRadius: Radii.full,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      marginBottom: Spacing.md,
    },
    statusText: {
      fontSize: Typography.size.base,
      fontFamily: Typography.fontMedium,
      textAlign: "center" as const,
      lineHeight: 22,
      paddingHorizontal: Spacing.base,
    },

    coordsBox: {
      marginTop: Spacing.md,
      alignItems: "center" as const,
      gap: Spacing.sm,
    },
    coordsText: {
      fontSize: Typography.size.sm,
      fontFamily: "Courier New",
      color: colors.text.secondary,
      letterSpacing: 0.5,
    },
    accuracyBar: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 4,
    },
    accuracySegment: {
      width: 6,
      height: 12,
      borderRadius: 3,
    },
    accuracyLabel: {
      fontSize: Typography.size.xs,
      marginLeft: 4,
      fontFamily: Typography.fontMedium,
    },

    toggleCard: {},
    toggleRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: Spacing.md,
    },
    toggleIconBox: {
      width: 40,
      height: 40,
      borderRadius: Radii.md,
      backgroundColor: colors.brand.primaryDim,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
    toggleTitle: {
      fontSize: Typography.size.base,
      fontFamily: Typography.fontSemibold,
      color: colors.text.primary,
    },
    toggleDesc: {
      fontSize: Typography.size.sm,
      color: colors.text.muted,
      marginTop: 2,
    },
    activeIndicator: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 6,
      marginTop: Spacing.md,
      paddingTop: Spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.border.subtle,
    },
    activeDot: {
      width: 8,
      height: 8,
      borderRadius: Radii.full,
      backgroundColor: colors.status.success,
    },
    activeText: {
      fontSize: Typography.size.sm,
      fontFamily: Typography.fontMedium,
      color: colors.status.success,
    },

    lastSentCard: { alignItems: "center" as const, paddingVertical: Spacing.lg },
    lastSentLabel: {
      fontSize: Typography.size.xs,
      fontFamily: Typography.fontBold,
      color: colors.text.muted,
      letterSpacing: 1.5,
      marginBottom: 4,
    },
    lastSentTime: {
      fontSize: Typography.size["2xl"],
      color: colors.text.primary,
      fontVariant: ["tabular-nums" as const],
      fontFamily: "Courier New",
    },
    lastSentCoords: {
      fontSize: Typography.size.xs,
      color: colors.text.muted,
      marginTop: 4,
      fontFamily: "Courier New",
    },

    infoCard: {},
    infoHeader: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 6,
      marginBottom: 6,
    },
    infoTitle: {
      fontSize: Typography.size.sm,
      fontFamily: Typography.fontSemibold,
      color: colors.text.primary,
    },
    infoText: {
      fontSize: Typography.size.sm,
      color: colors.text.secondary,
      lineHeight: 20,
    },
  };
}
