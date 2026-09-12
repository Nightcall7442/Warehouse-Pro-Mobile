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
import { LocationDisclosure } from "../../src/components/LocationDisclosure";
import { FadeInItem } from "../../src/components/Animated";
import { startBackgroundTracking, stopBackgroundTracking, bufferLocation } from "../../src/backgroundLocation";

/**
 * Запасной опрос — только для телефонов, где не дали фоновую геолокацию.
 *
 * Пять минут, а не две: это принудительная съёмка, она идёт даже когда агент
 * никуда не двигался, и каждая такая съёмка стоит батареи. Там, где система
 * следит сама, этот таймер не запускается вовсе.
 */
const FALLBACK_TRACK_MS = 5 * 60 * 1000;

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
  // Фоновое слежение не дали — почему: показывается под переключателем.
  const [trackNotice, setTrackNotice] = useState("");
  const [askConsent, setAskConsent] = useState(false);
  const [lastSent, setLastSent] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isLocating = useRef(false);
  const spin = useSharedValue(0);

  /*
    Восстановление после перезапуска — только если разрешение ещё живо.

    Прежде трекинг включался по сохранённому признаку безоговорочно. Если
    человек тем временем отозвал доступ к геолокации в настройках телефона,
    приложение при следующем запуске молча просило разрешение снова —
    системным окном, без всякого разъяснения. Это ровно тот случай, который
    правило Google и запрещает: окно говорит «разрешить доступ», а о том, что
    след увидит начальник, не говорит ничего.

    Теперь так: разрешение на месте — продолжаем молча, человек согласие уже
    давал. Разрешения нет — трекинг остаётся выключенным, и когда человек
    включит его сам, он снова увидит раскрытие.
  */
  useEffect(() => {
    AsyncStorage.getItem(AUTO_TRACK_KEY).then(async v => {
      if (v !== "true") return;
      const { status } = await Location.getBackgroundPermissionsAsync();
      if (status === "granted") setAutoTrack(true);
    });
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

    /**
     * Снять точку и отправить — это два разных дела, и падают они по разным
     * причинам.
     *
     * Раньше оба были под одним catch с текстом «Не удалось определить
     * местоположение. Проверьте GPS». Координаты к тому мигу уже получены и
     * показаны на экране, а виноватой названа спутниковая связь: агент лез
     * чинить GPS, когда сломана сеть.
     *
     * Хуже: снятая точка при обрыве связи пропадала совсем. Рядом лежит
     * буфер, сделанный для фоновых точек ровно на этот случай, — им и
     * пользуемся. Дыру в маршруте потом нечем восстановить.
     */
    try {
      let c: { lat: number; lng: number; accuracy: number; mocked: boolean };
      let batteryPct: number | undefined;

      try {
        const [pos, battery] = await Promise.all([
          Promise.race([
            Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error("GPS timeout")), 15_000)),
          ]),
          Battery.getBatteryLevelAsync().catch(() => null),
        ]);
        c = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy ?? 999, mocked: pos.mocked === true };
        batteryPct = battery !== null ? Math.round(battery * 100) : undefined;
      } catch {
        // Вот здесь виноват действительно GPS: координат нет.
        setError("Не удалось определить местоположение. Проверьте, включён ли GPS.");
        setState("error");
        setLastSent(null);
        return;
      }

      setCoords(c);

      try {
        await saveLocation(c.lat, c.lng, c.accuracy, batteryPct, undefined, c.mocked);
        setState("success");
        setLastSent(new Date());
      } catch {
        // Координаты есть, не дошла отправка. Точку в буфер, а не в мусор.
        await bufferLocation({
          lat: c.lat,
          lng: c.lng,
          accuracy: c.accuracy,
          batteryLevel: batteryPct,
          recordedAt: new Date().toISOString(),
          mocked: c.mocked,
        });
        setError("Точка снята, но не отправлена — нет связи. Она сохранена и уйдёт сама, когда связь появится.");
        setState("error");
        setLastSent(null);
      }
    } finally {
      isLocating.current = false;
    }
  };

  /* ═════════════════════════════════════════════════════════════════════════
     Точку снимает КТО-ТО ОДИН.

     ── Что было ─────────────────────────────────────────────────────────────

     При включённом трекинге работали сразу два источника:

       • системная задача (backgroundLocation): отдаёт точку, когда агент
         сдвинулся на 50 метров, и не чаще раза в две минуты;
       • свой таймер в экране: раз в пять минут будил приёмник НЕЗАВИСИМО от
         того, двигался человек или нет.

     Второй и сажал батарею. Агент сидит в магазине, обедает или стоит в
     пробке — телефон всё равно каждые пять минут берёт свежую точку, ту же
     самую, что и в прошлый раз. Система в это время уже знает, где телефон,
     и отдала бы это даром.

     ── Как теперь ───────────────────────────────────────────────────────────

     Если системная задача запустилась — своего таймера нет вовсе: она
     работает и когда приложение свёрнуто, и когда открыто. Таймер остаётся
     ЗАПАСНЫМ ходом и включается только там, где разрешения на фоновую
     геолокацию не дали: без него у такого агента следа не будет совсем.
     ═════════════════════════════════════════════════════════════════════════ */
  useEffect(() => {
    if (!autoTrack) {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
      stopBackgroundTracking();
      return;
    }

    let cancelled = false;
    // Первую точку — сразу: человек включил трекинг и должен увидеть, что он
    // работает, а не ждать первого шага или пяти минут.
    void locate();

    setTrackNotice("");
    startBackgroundTracking().then(result => {
      if (cancelled) return;
      if (result.success) return;
      if (__DEV__) console.log("Background location not started:", result.reason);
      setTrackNotice(
        result.reason === "background_unavailable_in_expo_go"
          ? "В Expo Go на iPhone фоновое слежение недоступно — точки уходят, пока экран открыт. В установленном приложении работает в фоне."
          : result.reason === "background_permission_denied"
            ? "Фоновая геолокация не разрешена — точки уходят, пока экран открыт. Разрешите «Всегда» в настройках."
            : "Фоновое слежение не запустилось — точки уходят, пока экран открыт.",
      );
      // Запасной ход — только когда система следить отказалась.
      intervalRef.current = setInterval(locate, FALLBACK_TRACK_MS);
    });

    return () => {
      cancelled = true;
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    };
  }, [autoTrack]);

  useEffect(() => {
    if (state === "locating") spin.value = withRepeat(withTiming(1, { duration: 1000 }), -1, false);
    else cancelAnimation(spin);
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
              <Text style={{ fontSize: Typography.size.sm, fontFamily: Typography.fontMono, color: colors.text.secondary, letterSpacing: 0.5 }}>{coords.lat.toFixed(6)}, {coords.lng.toFixed(6)}</Text>
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
              {/*
                Подпись говорит, как оно работает НА САМОМ ДЕЛЕ.

                «Каждые 2 минуты» было неправдой в обе стороны: стоящий на
                месте агент слал точку раз в пять минут своим таймером, а
                идущий — по сдвигу на 50 метров. И главное, из «каждые две
                минуты» человек делает вывод, что телефон всё время что-то
                считает, — а он молчит, пока агент не двинулся. Это и есть
                причина, по которой батарея не садится.
              */}
              <Text style={{ fontSize: Typography.size.sm, color: colors.text.muted, marginTop: 2 }}>
                Отправка при перемещении, не чаще раза в 2 минуты
              </Text>
            </View>
            {/*
              Включение идёт через раскрытие, выключение — сразу.

              Правило Google Play: заметное разъяснение ДО системного запроса
              разрешения, и согласие отдельным действием. Системное окно
              говорит «разрешить доступ к местоположению» и НЕ говорит, что
              след увидит начальник, — а человек соглашается именно на это.

              Выключение спрашивать не о чем: отказаться от слежки можно без
              объяснений и мгновенно.
            */}
            <Switch
              value={autoTrack}
              onValueChange={v => {
                Haptics.selectionAsync();
                if (v) setAskConsent(true);
                else setAutoTrack(false);
              }}
              trackColor={{ false: colors.bg.elevated, true: colors.brand.primary }}
              thumbColor="#fff"
            />
          </View>
          {autoTrack && (
            <View style={{ marginTop: Spacing.md, paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: colors.border.subtle, gap: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Badge variant={trackNotice ? "warning" : "success"}>{trackNotice ? "Слежение только на экране" : "Авто-слежение активно"}</Badge>
              </View>
              {trackNotice ? (
                <Text testID="track-notice" style={{ fontSize: Typography.size.xs, color: colors.text.secondary, lineHeight: 16 }}>{trackNotice}</Text>
              ) : null}
            </View>
          )}
        </Card>
      </FadeInItem>

      <LocationDisclosure
        visible={askConsent}
        onAccept={() => { setAskConsent(false); setAutoTrack(true); }}
        /* Отказ ничего не включает и ни к чему не ведёт: трекинг остаётся
           выключенным, экран работает как работал. */
        onDecline={() => setAskConsent(false)}
      />

      {/* Last sent */}
      {lastSent && (
        <FadeInItem delay={100}>
          <Card style={{ alignItems: "center", paddingVertical: Spacing.lg }}>
            <Text style={{ fontSize: Typography.size.xs, fontFamily: Typography.fontBold, color: colors.text.muted, letterSpacing: 1.5, marginBottom: 4 }}>ПОСЛЕДНЯЯ ОТПРАВКА</Text>
            <Text style={{ fontSize: Typography.size["2xl"], color: colors.text.primary, fontVariant: ["tabular-nums"], fontFamily: Typography.fontMono }}>
              {lastSent.toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </Text>
            {coords && (
              <Text style={{ fontSize: Typography.size.xs, color: colors.text.muted, marginTop: 4, fontFamily: Typography.fontMono }}>
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
