import { useCallback, useState } from "react";
import { errorText } from "../../lib/error-text";
import { useRefreshOnFocus } from "../../hooks/useRefreshOnFocus";
import { View, Text, FlatList, Alert, RefreshControl } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import {
  getPlans,
  updatePlanStatus,
  saveVisitPhoto,
  uploadFile,
  getOptimizedRoute,
  Plan,
} from "../../api";
import { notify } from "../../store/toast";
import { useThemeColors, useThemeStore } from "../../store/theme";
import { useAuthStore } from "../../store/auth";
import { Typography, Spacing, Radii, BOTTOM_TAB_HEIGHT } from "../../theme";
import { ScreenHeader, EmptyState, Card } from "../ui";
import { ErrorState } from "../QueryState";
import { FadeInItem, PressableScale, ShimmerSkeleton } from "../Animated";
import { PlanRow } from "./PlanRow";
import { QueueNote } from "./QueueNote";
import { useQueuedPlans } from "../../lib/plan-queue";
import { preparePhoto } from "../../lib/prepare-photo";
import { sendVisitPing } from "../../lib/visit-ping";
import { useVisitQueue } from "../../store/visit-queue";
import { isRetryableError } from "../../store/offline";
import { useT, useLang } from "../../i18n";
import { GpsOffHint } from "./GpsOffHint";

export function AgentPlansView() {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { isDark } = useThemeStore();
  const qc = useQueryClient();
  const router = useRouter();
  const { user } = useAuthStore();
  const isMerchandiser = user?.role === "merchandiser";
  const t = useT();
  const lang = useLang();

  /*
    Опрос идёт, только пока экран открыт.

    Вкладки не размонтируются: один раз открыв «Планы», агент получал запрос
    раз в минуту до конца дня — и с вкладки «Заказы», и с телефоном в кармане.
    Это шестьдесят запросов в час к списку, которого никто не видит: на тарифе
    с оплатой за мегабайты видно в счёте, на дешёвом аппарате — в заряде.
    Приём тот же, что на вкладке «Слежение».
  */
  /*
    Опрос раз в минуту идёт только на открытом экране — иначе он тикал и с
    чужой вкладки, тратя мобильный интернет впустую.

    Но одного этого мало: вкладки expo-router не размонтируются, и без
    обновления ПРИ ВОЗВРАТЕ агент, полчаса пробывший в «Заказах», увидел бы
    получасовой список и ждал бы до первого тика ещё минуту. Раньше это
    прикрывал постоянный опрос.
  */
  const [screenFocused, setScreenFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setScreenFocused(true);
      return () => setScreenFocused(false);
    }, []),
  );

  const plansQuery = useQuery({
    queryKey: ["agentPlans"],
    queryFn: () => getPlans(),
    refetchInterval: screenFocused ? 60_000 : false,
  });
  // Вернулись на экран — данные помечаются устаревшими сразу, не дожидаясь
  // ближайшего тика опроса.
  useRefreshOnFocus([["agentPlans"]]);
  const { data: serverPlans, isLoading, isError, error, refetch } = plansQuery;
  // Очередь визитов наложена на список: отмеченный без связи — отмечен.
  const { plans, queued } = useQueuedPlans(serverPlans);

  // Свой признак «тянут вручную» вместо isFetching. Запрос повторяется сам раз
  // в минуту, и на isFetching кружок обновления выскакивал бы без касания.
  // isLoading тоже не годится: он истинен только при самой первой загрузке, и
  // при потягивании кружок исчезал мгновенно — человек тянул ещё раз, потом
  // решал, что обновление не работает, и перезапускал приложение.
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = async () => {
    setRefreshing(true);
    try { await refetch(); } finally { setRefreshing(false); }
  };

  const updateMutation = useMutation({
    mutationFn: ({ planId, status }: { planId: number; status: Plan["status"] }) =>
      updatePlanStatus(planId, status),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["agentPlans"] });
      notify.success(t("Статус обновлён", "Holat yangilandi"));
      /*
        Отмеченный визит сам ставит точку на карту слежения.

        Писали в agent_locations только фоновый сбор и вкладка «GPS», которую
        агент жмёт руками. У агента с выключенным фоновым сбором визит
        отмечался, а на карте у начальника не появлялось ничего — ни точки, ни
        маршрута.

        Только на «посещён»: пропуск точки — это не факт присутствия, и
        отмечать им карту значило бы рисовать агента там, куда он не заходил.

        Отправка не ждётся: визит уже отмечен, и точка не должна ни задерживать
        его, ни отменять. Подробности — в lib/visit-ping.
      */
      if (variables.status === "visited") void sendVisitPing();
    },
    /*
      Нет связи — отметка в очередь, а не в мусор. Раньше агент в подвале
      магазина получал «Network Error», и визит оставался неотмеченным: план
      показывал пропуск, KPI считал прогул. Отказ по существу (план не ваш,
      уже отмечен) — по-прежнему ошибка вслух.
    */
    onError: async (e: Error, variables) => {
      if (!isRetryableError(e)) { notify.error(errorText(e)); return; }
      const ok = await queueVisit.add({ planId: variables.planId, status: variables.status });
      if (ok) notify.info(t("Нет связи — отметка сохранена и уйдёт сама", "Aloqa yo'q — belgi saqlandi, o'zi yuboriladi"));
      else notify.error(errorText(e));
      // Точка снимается сейчас, где агент стоит, и ждёт связи в буфере: иначе
      // визит из очереди приходил без точки — карта пуста, антифрод слеп.
      if (ok && variables.status === "visited") void sendVisitPing();
    },
  });

  const queueVisit = useVisitQueue();

  const photoMutation = useMutation({
    mutationFn: ({ planId, photoUrl }: { planId: number; photoUrl: string }) =>
      saveVisitPhoto(planId, photoUrl),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agentPlans"] });
      notify.success(t("Фото отправлено, визит отмечен", "Rasm yuborildi, tashrif belgilandi"));
      // Точка уходит следом за отметкой и не задерживает её: см. sendVisitPing.
      void sendVisitPing();
    },
    /*
      Снимок уже в хранилище, а привязка к визиту сорвалась по сети: в очередь
      с готовой ссылкой, не с файлом. Раньше — тост об ошибке, фото в S3
      сиротой, визит не отмечен.
    */
    onError: async (e: Error, variables) => {
      if (!isRetryableError(e)) { notify.error(errorText(e)); return; }
      const ok = await queueVisit.add({ planId: variables.planId, status: "visited", photoUrl: variables.photoUrl });
      if (ok) notify.info(t("Нет связи — фото и отметка сохранены и уйдут сами", "Aloqa yo'q — rasm va belgi saqlandi, o'zi yuboriladi"));
      else notify.error(errorText(e));
      if (ok) void sendVisitPing();
    },
  });

  // Route optimization
  const [optimizedPlanIds, setOptimizedPlanIds] = useState<number[] | null>(null);
  const [optimizing, setOptimizing] = useState(false);

  const handleOptimize = async () => {
    setOptimizing(true);
    try {
      /*
        Точность — та же, что у всех остальных съёмок в приложении.

        Здесь стояло `accuracy: 1`, то есть Lowest — это километры. Батарею
        оно бережёт, но маршрут строится ОТ этой точки, и с километровой
        ошибкой порядок объезда по городу выходит неверным. Balanced берётся
        по вышкам и Wi-Fi, стоит немногим дороже и даёт десятки метров.
      */
      const Loc = await import("expo-location");
      const { coords } = await Loc.getCurrentPositionAsync({ accuracy: Loc.Accuracy.Balanced });
      const result = await getOptimizedRoute(coords.latitude, coords.longitude);
      if (result.plans.length > 0) {
        setOptimizedPlanIds(result.plans.map(p => p.id));
        notify.success(t(`Маршрут оптимизирован (${result.totalStops} точек, ${result.totalDistance.toFixed(1)} км)`, `Yo'nalish tuzildi (${result.totalStops} nuqta, ${result.totalDistance.toFixed(1)} km)`));
      }
    } catch {
      notify.error(t("Не удалось оптимизировать маршрут", "Yo'nalishni tuzib bo'lmadi"));
    } finally {
      setOptimizing(false);
    }
  };

  const handleTakePhoto = async (planId: number) => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(t("Нет доступа", "Ruxsat yo'q"), t("Разрешите доступ к камере в настройках", "Sozlamalarda kameraga ruxsat bering"));
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      quality: 0.7,
    });
    if (!result.canceled && result.assets?.[0]?.uri) {
      const uri = result.assets[0].uri;
      try {
        // Снимок уменьшается перед отправкой: камера отдаёт полное разрешение.
        const { dataUrl } = await preparePhoto(uri);
        // Папка "visits", а не "shops": снимок визита — это доказательство
        // обхода, а не фотография точки, и лежать вперемешку с карточками
        // магазинов ему незачем. Папка в uploadFile была объявлена и не
        // использовалась.
        const url = await uploadFile(dataUrl, "visits");
        photoMutation.mutate({ planId, photoUrl: url });
      } catch (e) {
        // Без связи снимок ждёт в очереди ссылкой на файл камеры и грузится
        // при первой связи вместе с отметкой.
        if (isRetryableError(e) && await queueVisit.add({ planId, status: "visited", photoUri: uri })) {
          notify.info(t("Нет связи — фото и отметка сохранены и уйдут сами", "Aloqa yo'q — rasm va belgi saqlandi, o'zi yuboriladi"));
          void sendVisitPing();
        } else {
          notify.error(t("Ошибка загрузки фото", "Rasmni yuklab bo'lmadi"));
        }
      }
    }
  };

  const handleVisitDone = (planId: number, planName: string, shopId?: number) => {
    if (isMerchandiser) {
      router.push({
        pathname: "/merchandiser/visit",
        params: { planId: String(planId), shopId: String(shopId ?? ""), shopName: planName },
      });
      return;
    }
    Alert.alert(t("Подтвердить визит", "Tashrifni tasdiqlash"), t(`Отметить "${planName}" как посещённый?`, `"${planName}" tashrif qilindi deb belgilaysizmi?`), [
      { text: t("Отмена", "Bekor"), style: "cancel" },
      { text: t("Без фото", "Rasmsiz"), onPress: () => updateMutation.mutate({ planId, status: "visited" }) },
      { text: t("С фото", "Rasm bilan"), onPress: () => handleTakePhoto(planId) },
    ]);
  };

  const visited = (plans ?? []).filter(p => p.status === "visited").length;
  const total = plans?.length ?? 0;
  const pct = total > 0 ? Math.round((visited / total) * 100) : 0;

  const today = new Date();
  const greeting =
    today.getHours() < 12 ? t("Доброе утро", "Xayrli ertalab") : today.getHours() < 18 ? t("Добрый день", "Xayrli kun") : t("Добрый вечер", "Xayrli kech");

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      <ScreenHeader
        title={t("Мои планы", "Mening rejalarim")}
        subtitle={`${greeting} — ${today.toLocaleDateString(lang === "uz" ? "uz-Latn-UZ" : "ru", { day: "numeric", month: "long" })}`}
      />

      {total > 0 && (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: Spacing.sm,
            marginTop: Spacing.md,
            marginHorizontal: Spacing.base,
          }}
        >
          <Text
            style={{
              fontFamily: Typography.fontMono,
              fontSize: Typography.size.sm,
              color: colors.text.secondary,
            }}
          >
            {visited}/{total}
          </Text>
          <View
            style={{
              flex: 1,
              height: 6,
              borderRadius: 3,
              backgroundColor: colors.bg.elevated,
              overflow: "hidden",
            }}
          >
            <View
              style={{
                width: `${pct}%`,
                height: "100%",
                borderRadius: 3,
                backgroundColor:
                  pct === 100
                    ? colors.accent.success
                    : pct >= 60
                      ? colors.accent.warning
                      : colors.accent.primary,
              }}
            />
          </View>
          <Text
            style={{
              fontFamily: Typography.fontBold,
              fontSize: Typography.size.sm,
              color: colors.text.primary,
            }}
          >
            {pct}%
          </Text>
        </View>
      )}

      {/* Route optimization button */}
      {!isLoading && plans && plans.length > 0 && (
        <PressableScale
          onPress={handleOptimize}
          haptic="light"
          disabled={optimizing}
        >
          <Card style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 14, marginBottom: Spacing.md, opacity: optimizing ? 0.6 : 1 }}>
            <View style={{ width: 40, height: 40, borderRadius: Radii.md, backgroundColor: colors.accent.primary + "15", alignItems: "center", justifyContent: "center" }}>
              {optimizing ? <Feather name="loader" size={18} color={colors.accent.primary} /> : <Feather name="navigation" size={18} color={colors.accent.primary} />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: Typography.fontSemibold, fontSize: Typography.size.sm, color: colors.text.primary }}>
                {optimizing ? t("Оптимизация...", "Tuzilmoqda...") : optimizedPlanIds ? t("Маршрут оптимизирован", "Yo'nalish tuzildi") : t("Оптимизировать маршрут", "Yo'nalishni tuzish")}
              </Text>
              <Text style={{ fontSize: Typography.size.xs, color: colors.text.tertiary, marginTop: 2 }}>
                {optimizedPlanIds ? t(`${optimizedPlanIds.length} точек по порядку`, `${optimizedPlanIds.length} nuqta tartib bilan`) : t("Сортировка по близости", "Yaqinlik bo'yicha tartib")}
              </Text>
            </View>
            {!optimizing && <Feather name="check-circle" size={16} color={colors.status.success} />}
          </Card>
        </PressableScale>
      )}

      {isLoading ? (
        <View style={{ paddingTop: Spacing.lg, paddingHorizontal: Spacing.base, gap: Spacing.md }}>
          {[1, 2, 3, 4].map(i => (
            <ShimmerSkeleton key={i} height={110} radius={Radii.xxl} />
          ))}
        </View>
      ) : (
        <FlatList
          data={optimizedPlanIds
            ? [...(plans ?? [])].sort((a, b) => {
                const ai = optimizedPlanIds.indexOf(a.id);
                const bi = optimizedPlanIds.indexOf(b.id);
                if (ai === -1 && bi === -1) return 0;
                if (ai === -1) return 1;
                if (bi === -1) return -1;
                return ai - bi;
              })
            : plans ?? []}
          keyExtractor={p => String(p.id)}
          // Панель вкладок плавающая и стоит поверх списка: под неё уезжала
          // последняя карточка дня, а это как раз тот визит, до которого агент
          // добирается к вечеру. Запаса в 24 точки хватало только на отступ от
          // края экрана, но не на саму панель.
          contentContainerStyle={{ padding: Spacing.base, paddingBottom: insets.bottom + BOTTOM_TAB_HEIGHT + Spacing.lg }}
          ListHeaderComponent={<GpsOffHint colors={colors} />}
          ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.accent.primary}
            />
          }
          ListEmptyComponent={
            // «Супервайзер ещё не назначил маршрут» — утверждение о работе, а
            // не о запросе. При отказе список пуст ровно так же, как при
            // пустом дне, и человек делал единственный разумный вывод: работы
            // нет. Отказ теперь называет себя отказом и даёт чем повторить.
            isError ? (
              <ErrorState
                what={t("планы", "rejalarni")}
                error={error}
                description={t("Это сбой связи, а не пустой день. Проверьте подключение и попробуйте снова.", "Bu aloqa xatosi, bo'sh kun emas. Ulanishni tekshirib, qayta urinib ko'ring.")}
                onRetry={() => { void refetch(); }}
                retrying={refreshing}
              />
            ) : (
              <EmptyState
                icon="calendar"
                title={t("Планов на сегодня нет", "Bugunga reja yo'q")}
                description={t("Супервайзер ещё не назначил маршрут", "Supervisor hali yo'nalish bermagan")}
              />
            )
          }
          renderItem={({ item: plan, index }) => (
            <FadeInItem delay={index * 30}>
              <PlanRow
                plan={plan}
                colors={colors}
                isDark={isDark}
                onPress={() => plan.shopId && router.push({ pathname: "/shop/[id]", params: { id: String(plan.shopId) } })}
                onVisit={() => handleVisitDone(plan.id, plan.shopName ?? t("Магазин", "Do'kon"), plan.shopId)}
                onSkip={() => updateMutation.mutate({ planId: plan.id, status: "skipped" })}
                // Пендинг — по строке, а не по всему списку. Отметка одного
                // визита гасила кнопки во всех карточках сразу: агент на
                // медленной связи видел, что список «замер» целиком, и ждал
                // вместо того, чтобы отмечать следующий магазин.
                loading={
                  (updateMutation.isPending && updateMutation.variables?.planId === plan.id) ||
                  (photoMutation.isPending && photoMutation.variables?.planId === plan.id)
                }
              />
              {queued.has(plan.id) && <QueueNote action={queued.get(plan.id)!} colors={colors} />}
            </FadeInItem>
          )}
        />
      )}
    </View>
  );
}
