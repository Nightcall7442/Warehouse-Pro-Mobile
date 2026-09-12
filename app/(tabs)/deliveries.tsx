import { memo, useCallback, useMemo, useRef, useState } from "react";
import { parseAmount } from "../../src/lib/order-money";
import { useRefreshOnFocus } from "../../src/hooks/useRefreshOnFocus";
import { useScrollTopOnFocus } from "../../src/hooks/useScrollTopOnFocus";
import { useRouter } from "expo-router";
import { reportNotQueued } from "../../src/lib/offline-guard";
import {
  View, Text, FlatList, TextInput,
  RefreshControl, ActivityIndicator, Linking, Alert,
} from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { Feather } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeColors } from "../../src/store/theme";
import { Typography, Spacing, Radii, ThemeColors, KpiColors } from "../../src/theme";
import { Card, Button, Badge, SectionHeader, EmptyState } from "../../src/components/ui";
import { ProgressRing, NeumorphicProgressBar } from "../../src/components/Charts";
import { listMyDeliveries, type Delivery } from "../../src/api";
import { useOfflineStore, isRetryableError, deliveryActionOrderId } from "../../src/store/offline";
import { errorText } from "../../src/lib/error-text";
import { notify } from "../../src/store/toast";
import * as Haptics from "expo-haptics";
import * as Network from "expo-network";
import { formatMoney } from "../../src/store/branding";
import { getCourierKpi } from "../../src/api";
import { deliveryStatusLabel } from "../../src/lib/order-status";

/* Слово — из общего словаря, здесь только значок и вид плашки. */
const STATUS_CONFIG: Record<string, { icon: keyof typeof Feather.glyphMap; variant: "info" | "warning" | "success" | "danger" }> = {
  not_assigned:     { icon: "clock",        variant: "warning" },
  assigned:         { icon: "package",      variant: "info" },
  out_for_delivery: { icon: "truck",        variant: "warning" },
  delivered:        { icon: "check-circle", variant: "success" },
  failed:           { icon: "x-circle",     variant: "danger" },
};

/**
 * Итоги месяца у курьера.
 *
 * ── Почему отдельно от колец выше ───────────────────────────────────────────
 *
 * Кольца считают СЕГОДНЯШНИЙ маршрут: сколько ждёт, сколько в пути. Это
 * вопрос «что я ещё не сделал». А «сколько я отвёз за месяц» — вопрос про
 * работу целиком, и по сегодняшнему дню на него не ответить.
 *
 * ── Почему рядом с зарплатой ────────────────────────────────────────────────
 *
 * Довезённое и рабочие дни — ровно те числа, из которых складывается его
 * выплата (ставка × довезённое, суточные × дни). Видеть их порознь значит
 * заставлять человека сверять два экрана, чтобы проверить свои деньги.
 */
function MonthTotals() {
  const colors = useThemeColors();
  const router = useRouter();

  /*
    Отказ гасится в null: блока просто не будет. Экран доставок — рабочий, и
    ронять его из-за показателей нельзя.
  */
  const { data } = useQuery({
    queryKey: ["courierKpi", "month"],
    queryFn: () => getCourierKpi("month").catch(() => null),
    retry: false,
  });

  if (!data) return null;

  const cells = [
    { label: "Довезено", value: String(data.delivered) },
    { label: "Сорвано", value: String(data.failed) },
    // Ноль назначенных — это не «ноль процентов успеха», а «мерить нечего».
    { label: "Успешных", value: data.delivered + data.failed > 0 ? `${data.successRate}%` : "—" },
    { label: "Рабочих дней", value: String(data.workDays) },
  ];

  return (
    <Card style={{ marginTop: 12, marginBottom: 12 }} onPress={() => router.push("/salary")}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: Spacing.md }}>
        <Text style={{
          fontFamily: Typography.fontMedium, fontSize: Typography.size.xs,
          letterSpacing: 1.5, textTransform: "uppercase", color: colors.text.muted,
        }}>
          Итоги месяца
        </Text>
        <Feather name="chevron-right" size={16} color={colors.text.tertiary} />
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap", rowGap: Spacing.md }}>
        {cells.map((c) => (
          <View key={c.label} style={{ width: "50%" }}>
            <Text style={{ fontFamily: Typography.fontExtraBold, fontSize: Typography.size.lg, color: colors.text.primary }}>
              {c.value}
            </Text>
            <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.xs, color: colors.text.tertiary, marginTop: 2 }}>
              {c.label}
            </Text>
          </View>
        ))}
      </View>

      <View style={{ marginTop: Spacing.md, paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: colors.border.subtle, flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ fontFamily: Typography.fontMedium, fontSize: Typography.size.sm, color: colors.text.secondary }}>
          Привезено денег
        </Text>
        <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.sm, color: colors.text.primary }}>
          {formatMoney(data.cashCollected)}
        </Text>
      </View>
    </Card>
  );
}

type DeliveryRow =
  | { type: "header"; key: string; title: string }
  | { type: "transit"; key: string; order: Delivery }
  | { type: "assigned"; key: string; order: Delivery }
  | { type: "queued"; key: string; order: Delivery };

/** Как называется отложенная отметка, пока она ждёт связи. */
const QUEUED_LABEL: Record<string, string> = {
  markOutForDelivery: "Выехал",
  markDelivered: "Доставлено",
  completeDelivery: "Доставлено",
  markFailed: "Не доставлено",
};

/*
  Текст красной подсказки — человеку, а не строке axios.

  Сюда доходит только то, что не удалось сложить в очередь: обрыв связи
  перехватывается в самой мутации. Но перехват может и не успеть — не сработала
  запись в очередь, отказала проверка сети, — и тогда курьер на улице получал
  красным «Network Error»: ни что делать, ни сохранилось ли действие. Пустое
  сообщение сервера всплывало пустой красной полосой: тост ничего не фильтрует.
*/
function failureText(e: unknown): string {
  if (isRetryableError(e)) return "Нет связи. Действие не сохранилось — повторите, когда появится сеть.";
  // Дальше говорит errorText: он пропускает слова сервера («Заказ уже
  // завершён») и переводит на русский всё остальное. Здесь стояло сырое
  // e.message — вместе с ним наружу лезли «Request failed with status code 400»
  // и пустая красная полоса, когда сообщения не было вовсе.
  return errorText(e);
}

export default function DeliveriesScreen() {
  // Вкладку не размонтируют при переключении, поэтому запрос уходит один раз
  // за запуск. Здесь данные этого экрана помечаются устаревшими при возврате
  // на него — подробности в самом хуке.
  useRefreshOnFocus([["myDeliveries"]]);
  const router = useRouter();
  const listRef = useRef<FlatList>(null);
  useScrollTopOnFocus(listRef);
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const qc = useQueryClient();
  const [cashInputs, setCashInputs] = useState<Record<number, string>>({});

  const { data: deliveries, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["myDeliveries"],
    queryFn: () => listMyDeliveries(),
  });

  const { addDeliveryAction, deliveryActions } = useOfflineStore();

  // An order queued offline stays in `myDeliveries` untouched — there's no
  // server response to update it with yet — so without this, the card kept
  // showing active buttons and a courier could queue a second markDelivered
  // (or markFailed) for the same order before the first ever syncs. The
  // backend now rejects a duplicate on sync, but it still shows up in the
  // queue as a confusing "failed" entry instead of never being created.
  //
  // Считается в useMemo, а не в теле отрисовки: суммы наличных лежат в
  // состоянии экрана, и без этого каждая набранная цифра пересобирала Set по
  // всей очереди и трижды перебирала маршрут из 30–60 точек. Цифры появлялись
  // в поле с задержкой.
  const queuedActionByOrder = useMemo(() => {
    const byOrder = new Map<number, string>();
    for (const a of deliveryActions) {
      if (!a.synced) byOrder.set(deliveryActionOrderId(a.action), a.action.type);
    }
    return byOrder;
  }, [deliveryActions]);

  /*
    Отложенный «выехал» — не конец работы с заказом, а её середина.

    Раньше любая отложенная отметка убирала заказ в «ЖДУТ ОТПРАВКИ» без
    кнопок, и курьер без связи мог сделать по заказу только одно действие:
    «выехал» — и всё, «доставлен» ждал появления сети. Очередь теперь уходит
    по одной и по порядку, поэтому заказ с отложенным «выехал» показывается
    «В ПУТИ» со всеми кнопками, а «ждут отправки» — только отметки, после
    которых делать уже нечего (доставлен, недоставлен, проведён).
  */
  const queuedOrderIds = useMemo(
    () => new Set([...queuedActionByOrder].filter(([, type]) => type !== "markOutForDelivery").map(([id]) => id)),
    [queuedActionByOrder],
  );
  const locallyOut = useMemo(
    () => new Set([...queuedActionByOrder].filter(([, type]) => type === "markOutForDelivery").map(([id]) => id)),
    [queuedActionByOrder],
  );

  /*
    В мутацию уходит весь заказ, а не один его id.

    Очередь неотправленных писала «Выезд #417» — это номер строки в базе,
    которого нет ни в накладной, ни в разговоре с оператором. Номер заказа и
    магазин известны ровно здесь, в момент нажатия кнопки; дальше, когда связь
    появится, доставать их будет неоткуда.
  */
  const markOut = useMutation({
    mutationFn: async (order: Delivery) => {
      const orderId = order.id;
      const queuedMeta = {
        orderNumber: order.orderNumber,
        shopName: order.shopName,
        createdAt: new Date().toISOString(),
        synced: false,
      };
      const net = await Network.getNetworkStateAsync();
      if (!net.isConnected) {
        const queued = await addDeliveryAction({
          id: `markOut-${orderId}-${Date.now()}`,
          action: { type: "markOutForDelivery", orderId },
          ...queuedMeta,
        });
        return { offline: true, queued };
      }
      const { markOutForDelivery } = await import("../../src/api");
      try {
        // return await, а не return: без await обещание уходит из try наружу,
        // и написанный ниже перехват не срабатывал ни разу — ошибка сети
        // улетала в onError, а действие не попадало в очередь.
        return await markOutForDelivery(orderId);
      } catch (e) {
        // Предполётная проверка сказала «сеть есть», но запрос всё равно
        // не дошёл. В дверях магазина это обычное дело, а не исключение:
        // Android считает подключением и EDGE, и Wi-Fi с окном входа.
        //
        // Раньше здесь перехвата не было вовсе. Курьер жал «Доставлено»,
        // вводил принятую сумму, получал тост с текстом ошибки — и
        // действие не сохранялось нигде: ни на сервере, ни в очереди.
        // Товар отдан, деньги в кармане, в системе ничего.
        if (!isRetryableError(e)) throw e;
        const queued = await addDeliveryAction({
          id: `markOut-${orderId}-${Date.now()}`,
          action: { type: "markOutForDelivery", orderId },
          ...queuedMeta,
        });
        return { offline: true, queued };
      }
    },
    onSuccess: (result: { offline?: boolean; queued?: boolean } | void) => {
      if (result?.offline) {
        // Очередь могла не записаться на диск — тогда отметка исчезнет вместе
        // с приложением, и говорить «сохранено» нельзя.
        if (!result.queued) { reportNotQueued("Отметка"); return; }
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        notify.info("Нет подключения. Действие сохранено офлайн.");
        return;
      }
      qc.invalidateQueries({ queryKey: ["myDeliveries"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      notify.success("Взято в доставку!");
    },
    onError: (e: Error) => notify.error(failureText(e)),
  });

  const markDel = useMutation({
    mutationFn: async ({ order, cashAmount }: { order: Delivery; cashAmount?: string }) => {
      const orderId = order.id;
      const queuedMeta = {
        orderNumber: order.orderNumber,
        shopName: order.shopName,
        createdAt: new Date().toISOString(),
        synced: false,
      };
      const net = await Network.getNetworkStateAsync();
      if (!net.isConnected) {
        const queued = await addDeliveryAction({
          id: `markDel-${orderId}-${Date.now()}`,
          action: { type: "markDelivered", orderId, cashAmount },
          ...queuedMeta,
        });
        return { offline: true, queued };
      }
      const { markDelivered } = await import("../../src/api");
      try {
        // return await, а не return: без await обещание уходит из try наружу,
        // и написанный ниже перехват не срабатывал ни разу — ошибка сети
        // улетала в onError, а действие не попадало в очередь. Именно то, от
        // чего этот перехват и писали: товар отдан, деньги в кармане, в
        // системе ничего.
        return await markDelivered(orderId, cashAmount);
      } catch (e) {
        // Предполётная проверка сказала «сеть есть», но запрос всё равно
        // не дошёл. В дверях магазина это обычное дело, а не исключение:
        // Android считает подключением и EDGE, и Wi-Fi с окном входа.
        //
        // Раньше здесь перехвата не было вовсе. Курьер жал «Доставлено»,
        // вводил принятую сумму, получал тост с текстом ошибки — и
        // действие не сохранялось нигде: ни на сервере, ни в очереди.
        // Товар отдан, деньги в кармане, в системе ничего.
        if (!isRetryableError(e)) throw e;
        const queued = await addDeliveryAction({
          id: `markDel-${orderId}-${Date.now()}`,
          action: { type: "markDelivered", orderId, cashAmount },
          ...queuedMeta,
        });
        return { offline: true, queued };
      }
    },
    onSuccess: (result: { offline?: boolean; queued?: boolean } | void) => {
      if (result?.offline) {
        // Очередь могла не записаться на диск — тогда отметка исчезнет вместе
        // с приложением, и говорить «сохранено» нельзя.
        if (!result.queued) { reportNotQueued("Отметка"); return; }
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        notify.info("Нет подключения. Действие сохранено офлайн.");
        return;
      }
      qc.invalidateQueries({ queryKey: ["myDeliveries"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      notify.success("Доставлено!");
    },
    onError: (e: Error) => notify.error(failureText(e)),
  });

  const markFail = useMutation({
    mutationFn: async ({ order, reason }: { order: Delivery; reason?: string }) => {
      const orderId = order.id;
      const queuedMeta = {
        orderNumber: order.orderNumber,
        shopName: order.shopName,
        createdAt: new Date().toISOString(),
        synced: false,
      };
      const net = await Network.getNetworkStateAsync();
      if (!net.isConnected) {
        const queued = await addDeliveryAction({
          id: `markFail-${orderId}-${Date.now()}`,
          action: { type: "markFailed", orderId, reason },
          ...queuedMeta,
        });
        return { offline: true, queued };
      }
      const { markFailed } = await import("../../src/api");
      try {
        // return await, а не return: без await обещание уходит из try наружу,
        // и написанный ниже перехват не срабатывал ни разу — ошибка сети
        // улетала в onError, а действие не попадало в очередь.
        return await markFailed(orderId, reason);
      } catch (e) {
        // Предполётная проверка сказала «сеть есть», но запрос всё равно
        // не дошёл. В дверях магазина это обычное дело, а не исключение:
        // Android считает подключением и EDGE, и Wi-Fi с окном входа.
        //
        // Раньше здесь перехвата не было вовсе. Курьер жал «Доставлено»,
        // вводил принятую сумму, получал тост с текстом ошибки — и
        // действие не сохранялось нигде: ни на сервере, ни в очереди.
        // Товар отдан, деньги в кармане, в системе ничего.
        if (!isRetryableError(e)) throw e;
        const queued = await addDeliveryAction({
          id: `markFail-${orderId}-${Date.now()}`,
          action: { type: "markFailed", orderId, reason },
          ...queuedMeta,
        });
        return { offline: true, queued };
      }
    },
    onSuccess: (result: { offline?: boolean; queued?: boolean } | void) => {
      if (result?.offline) {
        // Очередь могла не записаться на диск — тогда отметка исчезнет вместе
        // с приложением, и говорить «сохранено» нельзя.
        if (!result.queued) { reportNotQueued("Отметка"); return; }
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        notify.info("Нет подключения. Действие сохранено офлайн.");
        return;
      }
      qc.invalidateQueries({ queryKey: ["myDeliveries"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      notify.warning("Отмечено как недоставлено");
    },
    onError: (e: Error) => notify.error(failureText(e)),
  });

  const { queued, assigned, inTransit, deliveredCount, totalDeliveries } = useMemo(() => {
    const all = deliveries ?? [];
    return {
      queued: all.filter((d: Delivery) => queuedOrderIds.has(d.id)),
      assigned: all.filter((d: Delivery) => d.deliveryStatus === "assigned" && !queuedOrderIds.has(d.id) && !locallyOut.has(d.id)),
      inTransit: all.filter((d: Delivery) => (d.deliveryStatus === "out_for_delivery" || locallyOut.has(d.id)) && !queuedOrderIds.has(d.id)),
      deliveredCount: all.filter((d: Delivery) => d.deliveryStatus === "delivered").length,
      totalDeliveries: all.length,
    };
  }, [deliveries, queuedOrderIds, locallyOut]);

  /*
    Маршрут — один плоский список «заголовок + карточка», как на вкладке
    заказов. Раньше он строился двумя .map внутри ScrollView: все 30–60
    карточек монтировались разом, вместе с полями ввода и кнопками, хотя видно
    из них три. Экран открывался медленно и дёргался при прокрутке.
  */
  const items = useMemo(() => {
    const rows: DeliveryRow[] = [];
    /*
      Отложенные идут первыми: это единственное, что человек только что сделал
      руками, и он должен видеть, что отметка не потерялась.
    */
    if (queued.length > 0) {
      rows.push({ type: "header", key: "h-queued", title: "ЖДУТ ОТПРАВКИ" });
      for (const order of queued) rows.push({ type: "queued", key: `q-${order.id}`, order });
    }
    if (inTransit.length > 0) {
      rows.push({ type: "header", key: "h-transit", title: "В ПУТИ" });
      for (const order of inTransit) rows.push({ type: "transit", key: `t-${order.id}`, order });
    }
    if (assigned.length > 0) {
      rows.push({ type: "header", key: "h-assigned", title: "ОЖИДАЮТ ДОСТАВКИ" });
      for (const order of assigned) rows.push({ type: "assigned", key: `a-${order.id}`, order });
    }
    return rows;
  }, [queued, inTransit, assigned]);

  const handleOpenFull = useCallback((order: Delivery) => {
    router.push({ pathname: "/order/deliver", params: { id: String(order.id) } });
  }, [router]);

  const openMap = useCallback(async (address: string) => {
    const url = `https://yandex.ru/maps/?text=${encodeURIComponent(address)}`;
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      } else {
        notify.error("Не удалось открыть карты");
      }
    } catch {
      notify.error("Не удалось открыть карты");
    }
  }, []);

  /*
    Обработчики карточек держатся неизменными между отрисовками, иначе
    React.memo на карточке бессмысленна: новая функция — новый пропс — и
    перерисовывается весь маршрут на каждую цифру в поле наличных. Сумму
    карточка передаёт из своего пропса, поэтому cashInputs сюда не входит.
  */
  const mutateDeliver = markDel.mutate;
  const mutateFail = markFail.mutate;
  const mutateOut = markOut.mutate;

  const handleCashChange = useCallback((orderId: number, value: string) => {
    setCashInputs(prev => ({ ...prev, [orderId]: value }));
  }, []);

  const handleDeliver = useCallback((order: Delivery, cashAmount: string) => {
    /*
      Сумма разбирается ЗДЕСЬ, а не уходит строкой как набрали.

      Поле принимало «150,50» — русская раскладка даёт запятую, — и эта
      строка уходила на сервер как есть. Там она превращалась в ноль: заказ
      отмечался доставленным, деньги курьер взял, а в системе оплаты нет, и
      магазину оставался долг на всю сумму.

      Ровно эта беда уже была разобрана на экране сдачи доставки; здесь
      живой путь курьера, и он оставался прежним.
    */
    const paid = parseAmount(cashAmount);
    Alert.alert("Доставлено?", `Заказ ${order.orderNumber} → ${order.shopName}${paid > 0 ? `\nНаличными: ${formatMoney(paid)}` : ""}`, [
      { text: "Отмена", style: "cancel" },
      { text: "Да", onPress: () => mutateDeliver({ order, cashAmount: paid > 0 ? String(paid) : undefined }) },
    ]);
  }, [mutateDeliver]);

  const handleFail = useCallback((order: Delivery) => {
    Alert.alert("Не доставлено?", `Заказ ${order.orderNumber} → ${order.shopName}`, [
      { text: "Отмена", style: "cancel" },
      { text: "Да", onPress: () => mutateFail({ order }) },
    ]);
  }, [mutateFail]);

  const handleTakeOut = useCallback((order: Delivery) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    mutateOut(order);
  }, [mutateOut]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg.primary, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color={colors.accent.primary} />
      </View>
    );
  }

  // Не удалось загрузить — это НЕ то же самое, что «доставок нет».
  //
  // Раньше ветки ошибки не было вовсе: при неудачном запросе список выходил
  // пустым, и экран честно рисовал «Ожидают 0 / В пути 0». Курьер, открывший
  // приложение на складе в подвале, делал единственный разумный вывод — что
  // маршрут на сегодня не назначили — и уезжал. Баннер «нет сети» тут не
  // помогает: он показывается только при полном обрыве, а при слабом сигнале
  // запрос просто не доходит.
  if (isError) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg.primary, paddingTop: insets.top, justifyContent: "center", padding: Spacing.base }}>
        <EmptyState
          icon="alert-circle"
          title="Не удалось загрузить доставки"
          description="Это сбой связи, а не пустой маршрут. Проверьте подключение и попробуйте снова."
        />
        <Button onPress={() => { void refetch(); }} loading={isFetching} style={{ marginTop: Spacing.base }}>
          Повторить
        </Button>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.primary, paddingTop: insets.top }}>
      <View
        style={{
          paddingHorizontal: Spacing.base,
          paddingBottom: Spacing.md,
          paddingTop: Spacing.sm,
        }}
      >
        <Text
          style={{
            fontFamily: Typography.fontExtraBold,
            fontSize: Typography.size.xxl,
            color: colors.text.primary,
          }}
        >
          Доставки
        </Text>
      </View>

      <FlatList
        ref={listRef}
        data={items}
        keyExtractor={row => row.key}
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: Spacing.base,
          paddingBottom: insets.bottom + 100,
        }}
        /*
          Первое касание после ввода суммы съедала клавиатура: по умолчанию оно
          только убирает её и до кнопки не доходит. А кнопки «Доставлено» и «Не
          доставлено» стоят прямо под полем «Сумма наличных» — курьер вбивал
          сумму, жал «Доставлено», ничего не происходило, он жал ещё раз.
        */
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isFetching}
            onRefresh={refetch}
            tintColor={colors.accent.primary}
          />
        }
        ListHeaderComponent={
          <>
            {/* Stats — rings + progress bar */}
            <View style={{ flexDirection: "row", gap: 12, marginBottom: 12 }}>
              <Card style={{ flex: 1, padding: 16, alignItems: "center" }}>
                <ProgressRing value={totalDeliveries > 0 ? Math.round(assigned.length / Math.max(totalDeliveries, 1) * 100) : 0} size={56} strokeWidth={6} color={KpiColors.blue} />
                <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.lg, color: colors.text.primary, marginTop: 6 }}>{assigned.length}</Text>
                <Text style={{ fontFamily: Typography.fontMedium, fontSize: 9, color: colors.text.tertiary, textTransform: "uppercase", letterSpacing: 0.5 }}>Ожидают</Text>
              </Card>
              <Card style={{ flex: 1, padding: 16, alignItems: "center" }}>
                <ProgressRing value={totalDeliveries > 0 ? Math.round(inTransit.length / Math.max(totalDeliveries, 1) * 100) : 0} size={56} strokeWidth={6} color={KpiColors.amber} />
                <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.lg, color: colors.status.warning, marginTop: 6 }}>{inTransit.length}</Text>
                <Text style={{ fontFamily: Typography.fontMedium, fontSize: 9, color: colors.text.tertiary, textTransform: "uppercase", letterSpacing: 0.5 }}>В пути</Text>
              </Card>
            </View>
            <NeumorphicProgressBar value={totalDeliveries > 0 ? Math.round(deliveredCount / Math.max(totalDeliveries, 1) * 100) : 0} height={6} color={KpiColors.green} />
            {/*
              Итоги месяца — под сегодняшним маршрутом.

              Кольца выше отвечают «что осталось СЕГОДНЯ», и это разные
              вопросы: курьер не видел, сколько он отвёз за месяц, сколько
              довёз денег и в скольких днях выходил. Ручка (kpi.courierKpi)
              была написана и не вызывалась ниоткуда — свои показатели он не
              видел вовсе.
            */}
            <MonthTotals />
          </>
        }
        ListEmptyComponent={
          <EmptyState
            icon="truck"
            title={totalDeliveries === 0 ? "Нет заказов на доставку" : "Маршрут пройден"}
          />
        }
        renderItem={({ item }) => {
          if (item.type === "header") return <SectionHeader title={item.title} />;
          if (item.type === "queued") {
            /*
              Отметка уже стоит, но ещё не ушла. Карточка приглушена и без
              кнопок: нажимать нечего, а исчезать ей нельзя — иначе курьер не
              знает, приняли его отметку или потеряли.
            */
            return (
              <Card style={{ marginBottom: 12, padding: 16, opacity: 0.75 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.md, color: colors.text.primary }}>
                      {item.order.orderNumber}
                    </Text>
                    <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.sm, color: colors.text.muted, marginTop: 2 }}>
                      {item.order.shopName}
                    </Text>
                  </View>
                  <Badge variant="warning">
                    {QUEUED_LABEL[queuedActionByOrder.get(item.order.id) ?? ""] ?? "Отмечено"}
                  </Badge>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 }}>
                  <Feather name="clock" size={13} color={colors.text.tertiary} />
                  <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.sm, color: colors.text.tertiary, flex: 1 }}>
                    Записано на телефоне. Уйдёт на сервер, когда появится связь.
                  </Text>
                </View>
              </Card>
            );
          }
          if (item.type === "transit") {
            return (
              <DeliveryCard
                order={item.order}
                colors={colors}
                cashInput={cashInputs[item.order.id] ?? ""}
                onCashChange={handleCashChange}
                onOpenMap={openMap}
                onDeliver={handleDeliver}
                onOpenFull={handleOpenFull}
                onFail={handleFail}
                /*
                  Своя карточка, а не весь маршрут. Раньше сюда уходило общее
                  состояние мутации: курьер жал «Доставлено» на первой точке —
                  и надписи пропадали, а кнопки гасли сразу на ВСЕХ карточках
                  «в пути». На плохой связи это длилось секунды и выглядело
                  зависшим приложением.
                */
                isPending={markDel.isPending && markDel.variables?.order.id === item.order.id}
                failPending={markFail.isPending && markFail.variables?.order.id === item.order.id}
              />
            );
          }
          return (
            <AssignedCard
              order={item.order}
              colors={colors}
              onOpenMap={openMap}
              onTakeOut={handleTakeOut}
              isPending={markOut.isPending && markOut.variables?.id === item.order.id}
            />
          );
        }}
      />
    </View>
  );
}

/*
  Карточки маршрута обёрнуты в memo.

  Суммы наличных лежат в состоянии экрана, поэтому каждая набранная цифра
  перерисовывает его целиком. Без memo это означало перерисовку всех 30–60
  карточек с полями и кнопками на КАЖДУЮ цифру: на дешёвом телефоне в дверях
  магазина цифры появлялись в поле с задержкой. Работает это только пока
  пропсы не меняются по ссылке — обработчики выше поэтому и держатся в
  useCallback, а сумму карточка отдаёт обратно из своего пропса.
*/
const DeliveryCard = memo(function DeliveryCard({
  order, colors, cashInput, onCashChange, onOpenMap, onDeliver, onOpenFull, onFail, isPending, failPending,
}: {
  order: Delivery;
  colors: ThemeColors;
  cashInput: string;
  onCashChange: (orderId: number, value: string) => void;
  onOpenMap: (address: string) => void;
  onDeliver: (order: Delivery, cashAmount: string) => void;
  /** Полное оформление: частичная оплата, срок долга, возврат по позициям. */
  onOpenFull: (order: Delivery) => void;
  onFail: (order: Delivery) => void;
  isPending: boolean;
  failPending: boolean;
}) {
  // Значок и вид плашки для незнакомого состояния — нейтральные, а не «назначен».
  const config = STATUS_CONFIG[order.deliveryStatus] ?? { icon: "help-circle" as const, variant: "info" as const };

  return (
    <Animated.View entering={FadeIn}>
      <Card style={{ marginBottom: 12, padding: 16 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.md, color: colors.text.primary }}>
              {order.orderNumber}
            </Text>
            <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.sm, color: colors.text.muted, marginTop: 2 }}>
              {order.shopName}
            </Text>
          </View>
          <Badge variant={config.variant}>
            {deliveryStatusLabel(order.deliveryStatus)}
          </Badge>
        </View>

        {order.shopAddress && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 8 }}>
            <Feather name="map-pin" size={12} color={colors.text.muted} />
            <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.xs, color: colors.text.muted }}>
              {order.shopAddress}{order.shopCity ? `, ${order.shopCity}` : ""}
            </Text>
          </View>
        )}

        <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.md, color: colors.text.primary, marginBottom: 12 }}>
          {formatMoney(order.total)}
        </Text>

        <Button variant="secondary" size="sm" icon="map-pin" onPress={() => order.shopAddress && onOpenMap(order.shopAddress)} style={{ marginBottom: 12 }}>
          На карте
        </Button>

        <View style={{ borderTopWidth: 1, borderTopColor: colors.border.subtle, paddingTop: 12 }}>
          <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.xs, color: colors.text.muted, marginBottom: 6 }}>
            Сумма наличных (необязательно)
          </Text>
          {/* decimal-pad, а не numeric: на Android у numeric часто нет
              разделителя дробной части, и копейки набрать нечем. */}
          <TextInput
            value={cashInput}
            onChangeText={value => onCashChange(order.id, value)}
            placeholder="0"
            keyboardType="decimal-pad"
            style={{
              backgroundColor: colors.bg.secondary,
              borderRadius: Radii.md,
              paddingHorizontal: 12,
              paddingVertical: 10,
              fontFamily: Typography.fontMedium,
              fontSize: Typography.size.sm,
              color: colors.text.primary,
              marginBottom: 12,
            }}
          />
          <Button variant="success" icon="check-circle" onPress={() => onDeliver(order, cashInput)} loading={isPending}>
            Доставлено
          </Button>
          <View style={{ marginTop: 8 }}>
            {/* Экран полного оформления существовал, но попасть на него было
                нельзя: маршрут order/deliver зарегистрирован, а перехода на
                него не было ни одного во всём приложении. Курьеру оставались
                только «Доставлено» и «Не доставлено», а частичная оплата,
                срок долга и возврат по позициям лежали мёртвым грузом. */}
            <Button variant="secondary" icon="edit-3" onPress={() => onOpenFull(order)}>
              Оформить подробно
            </Button>
          </View>
          <View style={{ marginTop: 8 }}>
            <Button variant="danger" icon="x-circle" onPress={() => onFail(order)} loading={failPending}>
              Не доставлено
            </Button>
          </View>
        </View>
      </Card>
    </Animated.View>
  );
});

// Карточка «ожидает доставки» вынесена из тела экрана по той же причине:
// в списке она рисуется через renderItem, и без memo перерисовывалась бы
// вместе со всем маршрутом на каждую цифру в чужом поле наличных.
const AssignedCard = memo(function AssignedCard({
  order, colors, onOpenMap, onTakeOut, isPending,
}: {
  order: Delivery;
  colors: ThemeColors;
  onOpenMap: (address: string) => void;
  onTakeOut: (order: Delivery) => void;
  isPending: boolean;
}) {
  return (
    <Card style={{ marginBottom: 12, padding: 16 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.md, color: colors.text.primary }}>
            {order.orderNumber}
          </Text>
          <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.sm, color: colors.text.muted, marginTop: 2 }}>
            {order.shopName}
          </Text>
        </View>
        <Badge variant={STATUS_CONFIG[order.deliveryStatus]?.variant ?? "default"}>
          {deliveryStatusLabel(order.deliveryStatus)}
        </Badge>
      </View>

      {order.shopAddress && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 8 }}>
          <Feather name="map-pin" size={12} color={colors.text.muted} />
          <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.xs, color: colors.text.muted }}>
            {order.shopAddress}{order.shopCity ? `, ${order.shopCity}` : ""}
          </Text>
        </View>
      )}

      <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.md, color: colors.text.primary, marginBottom: 12 }}>
        {formatMoney(order.total)}
      </Text>

      <View style={{ flexDirection: "row", gap: 8 }}>
        {order.shopAddress && (
          <Button variant="secondary" size="sm" icon="map-pin" onPress={() => onOpenMap(order.shopAddress!)} style={{ flex: 1 }}>
            На карте
          </Button>
        )}
        <Button variant="primary" size="sm" icon="truck" onPress={() => onTakeOut(order)} loading={isPending} style={{ flex: 1 }}>
          Взять в доставку
        </Button>
      </View>
    </Card>
  );
});
