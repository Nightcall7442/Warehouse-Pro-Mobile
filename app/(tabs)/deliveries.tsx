import { useState } from "react";
import { useRouter } from "expo-router";
import {
  View, Text, ScrollView, TextInput,
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
import { useOfflineStore, isRetryableError } from "../../src/store/offline";
import { notify } from "../../src/store/toast";
import * as Haptics from "expo-haptics";
import * as Network from "expo-network";

const STATUS_CONFIG: Record<string, { icon: keyof typeof Feather.glyphMap; variant: "info" | "warning" | "success" | "danger"; label: string }> = {
  assigned:         { icon: "package",  variant: "info",    label: "Назначен" },
  out_for_delivery: { icon: "truck",    variant: "warning", label: "В пути" },
  delivered:        { icon: "check-circle", variant: "success", label: "Доставлен" },
  failed:           { icon: "x-circle", variant: "danger",  label: "Ошибка" },
};

export default function DeliveriesScreen() {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const router = useRouter();
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
  const queuedActionByOrder = new Map<number, string>(
    deliveryActions
      .filter(a => !a.synced)
      .map(a => [
        a.action.type === "completeDelivery" ? a.action.input.orderId : a.action.orderId,
        a.action.type,
      ]),
  );
  const queuedOrderIds = new Set(queuedActionByOrder.keys());

  /** Подпись к отложенной отметке — что курьер уже сделал. */
  const QUEUED_LABEL: Record<string, string> = {
    markOutForDelivery: "Выехал",
    markDelivered: "Доставлено",
    completeDelivery: "Доставлено",
    markFailed: "Не доставлено",
  };

  const markOut = useMutation({
    mutationFn: async (orderId: number) => {
      const net = await Network.getNetworkStateAsync();
      if (!net.isConnected) {
        await addDeliveryAction({
          id: `markOut-${orderId}-${Date.now()}`,
          action: { type: "markOutForDelivery", orderId },
          createdAt: new Date().toISOString(),
          synced: false,
        });
        return { offline: true };
      }
      const { markOutForDelivery } = await import("../../src/api");
      try {
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
        await addDeliveryAction({
          id: `markOut-${orderId}-${Date.now()}`,
          action: { type: "markOutForDelivery", orderId },
          createdAt: new Date().toISOString(),
          synced: false,
        });
        return { offline: true };
      }
    },
    onSuccess: (result: { offline?: boolean } | void) => {
      if (result?.offline) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        notify.info("Нет подключения. Действие сохранено офлайн.");
        return;
      }
      qc.invalidateQueries({ queryKey: ["myDeliveries"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      notify.success("Взято в доставку!");
    },
    onError: (e: Error) => notify.error(e.message),
  });

  const markDel = useMutation({
    mutationFn: async ({ orderId, cashAmount }: { orderId: number; cashAmount?: string }) => {
      const net = await Network.getNetworkStateAsync();
      if (!net.isConnected) {
        await addDeliveryAction({
          id: `markDel-${orderId}-${Date.now()}`,
          action: { type: "markDelivered", orderId, cashAmount },
          createdAt: new Date().toISOString(),
          synced: false,
        });
        return { offline: true };
      }
      const { markDelivered } = await import("../../src/api");
      try {
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
        await addDeliveryAction({
          id: `markDel-${orderId}-${Date.now()}`,
          action: { type: "markDelivered", orderId, cashAmount },
          createdAt: new Date().toISOString(),
          synced: false,
        });
        return { offline: true };
      }
    },
    onSuccess: (result: { offline?: boolean } | void) => {
      if (result?.offline) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        notify.info("Нет подключения. Действие сохранено офлайн.");
        return;
      }
      qc.invalidateQueries({ queryKey: ["myDeliveries"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      notify.success("Доставлено!");
    },
    onError: (e: Error) => notify.error(e.message),
  });

  const markFail = useMutation({
    mutationFn: async ({ orderId, reason }: { orderId: number; reason?: string }) => {
      const net = await Network.getNetworkStateAsync();
      if (!net.isConnected) {
        await addDeliveryAction({
          id: `markFail-${orderId}-${Date.now()}`,
          action: { type: "markFailed", orderId, reason },
          createdAt: new Date().toISOString(),
          synced: false,
        });
        return { offline: true };
      }
      const { markFailed } = await import("../../src/api");
      try {
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
        await addDeliveryAction({
          id: `markFail-${orderId}-${Date.now()}`,
          action: { type: "markFailed", orderId, reason },
          createdAt: new Date().toISOString(),
          synced: false,
        });
        return { offline: true };
      }
    },
    onSuccess: (result: { offline?: boolean } | void) => {
      if (result?.offline) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        notify.info("Нет подключения. Действие сохранено офлайн.");
        return;
      }
      qc.invalidateQueries({ queryKey: ["myDeliveries"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      notify.warning("Отмечено как недоставлено");
    },
    onError: (e: Error) => notify.error(e.message),
  });

  // Отмеченные без сети видны отдельным разделом.
  //
  // Раньше такой заказ просто выпадал из списка: сервер о нём ещё не знает,
  // поэтому в «ожидают» и «в пути» его не показывали, а в «доставлены» он
  // попасть не мог — там только то, что подтвердил сервер. Курьер нажимал
  // «Доставлено», карточка исчезала, и понять, записалось ли что-нибудь,
  // было нельзя. Оставить карточку на месте с рабочими кнопками тоже нельзя:
  // тогда ту же доставку можно отметить дважды.
  const queued = (deliveries ?? []).filter((d: Delivery) => queuedOrderIds.has(d.id));
  const assigned = (deliveries ?? []).filter((d: Delivery) => d.deliveryStatus === "assigned" && !queuedOrderIds.has(d.id));
  const inTransit = (deliveries ?? []).filter((d: Delivery) => d.deliveryStatus === "out_for_delivery" && !queuedOrderIds.has(d.id));
  const delivered = (deliveries ?? []).filter((d: Delivery) => d.deliveryStatus === "delivered");
  const totalDeliveries = (deliveries ?? []).length;

  const openMap = async (address: string) => {
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
  };

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

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: Spacing.base,
          paddingBottom: insets.bottom + 100,
        }}
        refreshControl={
          <RefreshControl
            refreshing={isFetching}
            onRefresh={refetch}
            tintColor={colors.accent.primary}
          />
        }
      >
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
        <NeumorphicProgressBar value={totalDeliveries > 0 ? Math.round(delivered.length / Math.max(totalDeliveries, 1) * 100) : 0} height={6} color={KpiColors.green} />

        {/* Отмечено без сети — ждёт отправки */}
        {queued.length > 0 && (
          <>
            <SectionHeader title="ЖДУТ ОТПРАВКИ" />
            {queued.map((order: Delivery) => (
              <Card key={order.id} style={{ marginBottom: 12, padding: 16, opacity: 0.75 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.md, color: colors.text.primary }}>
                      {order.orderNumber}
                    </Text>
                    <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.sm, color: colors.text.muted, marginTop: 2 }}>
                      {order.shopName}
                    </Text>
                  </View>
                  <Badge variant="warning">
                    {QUEUED_LABEL[queuedActionByOrder.get(order.id) ?? ""] ?? "Отмечено"}
                  </Badge>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 }}>
                  <Feather name="clock" size={13} color={colors.text.tertiary} />
                  <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.sm, color: colors.text.tertiary, flex: 1 }}>
                    Записано на телефоне. Уйдёт на сервер, когда появится связь.
                  </Text>
                </View>
              </Card>
            ))}
          </>
        )}

        {/* In Transit */}
        {inTransit.length > 0 && (
          <>
            <SectionHeader title="В ПУТИ" />
            {inTransit.map((order: Delivery) => (
              <DeliveryCard
                key={order.id}
                order={order}
                colors={colors}
                cashInput={cashInputs[order.id] ?? ""}
                onCashChange={v => setCashInputs(prev => ({ ...prev, [order.id]: v }))}
                onOpenMap={() => order.shopAddress && openMap(order.shopAddress)}
                onDeliver={() => {
                  Alert.alert("Доставлено?", `Заказ ${order.orderNumber} → ${order.shopName}`, [
                    { text: "Отмена", style: "cancel" },
                    {
                      text: "Да",
                      onPress: () =>
                        markDel.mutate({
                          orderId: order.id,
                          cashAmount: cashInputs[order.id] || undefined,
                        }),
                    },
                  ]);
                }}
                onOpenFull={() => router.push({ pathname: "/order/deliver", params: { id: String(order.id) } })}
                onFail={() => {
                  Alert.alert("Не доставлено?", `Заказ ${order.orderNumber} → ${order.shopName}`, [
                    { text: "Отмена", style: "cancel" },
                    { text: "Да", onPress: () => markFail.mutate({ orderId: order.id }) },
                  ]);
                }}
                // Ожидание — только на своей карточке. Общий на весь экран
                // признак зажигал спиннер и блокировал кнопки на ВСЕХ
                // заказах в пути: курьер нажимал «Доставлено» на одном, а
                // остальные становились недоступны.
                isPending={markDel.isPending && markDel.variables?.orderId === order.id}
                failPending={markFail.isPending && markFail.variables?.orderId === order.id}
              />
            ))}
          </>
        )}

        {/* Assigned */}
        {assigned.length > 0 && (
          <>
            <SectionHeader title="ОЖИДАЮТ ДОСТАВКИ" />
            {assigned.map((order: Delivery) => (
              <Card key={order.id} style={{ marginBottom: 12, padding: 16 }}>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    marginBottom: 8,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontFamily: Typography.fontBold,
                        fontSize: Typography.size.md,
                        color: colors.text.primary,
                      }}
                    >
                      {order.orderNumber}
                    </Text>
                    <Text
                      style={{
                        fontFamily: Typography.fontRegular,
                        fontSize: Typography.size.sm,
                        color: colors.text.muted,
                        marginTop: 2,
                      }}
                    >
                      {order.shopName}
                    </Text>
                  </View>
                  <Badge variant={STATUS_CONFIG[order.deliveryStatus]?.variant ?? "default"}>
                    {STATUS_CONFIG[order.deliveryStatus]?.label ?? order.deliveryStatus}
                  </Badge>
                </View>

                {order.shopAddress && (
                  <View
                    style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 8 }}
                  >
                    <Feather name="map-pin" size={12} color={colors.text.muted} />
                    <Text
                      style={{
                        fontFamily: Typography.fontRegular,
                        fontSize: Typography.size.xs,
                        color: colors.text.muted,
                      }}
                    >
                      {order.shopAddress}
                      {order.shopCity ? `, ${order.shopCity}` : ""}
                    </Text>
                  </View>
                )}

                <Text
                  style={{
                    fontFamily: Typography.fontBold,
                    fontSize: Typography.size.md,
                    color: colors.text.primary,
                    marginBottom: 12,
                  }}
                >
                  {Number(order.total).toLocaleString("ru-RU")} сум
                </Text>

                <View style={{ flexDirection: "row", gap: 8 }}>
                  {order.shopAddress && (
                    <Button
                      variant="secondary"
                      size="sm"
                      icon="map-pin"
                      onPress={() => openMap(order.shopAddress!)}
                      style={{ flex: 1 }}
                    >
                      На карте
                    </Button>
                  )}
                  <Button
                    variant="primary"
                    size="sm"
                    icon="truck"
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      markOut.mutate(order.id);
                    }}
                    loading={markOut.isPending}
                    style={{ flex: 1 }}
                  >
                    Взять в доставку
                  </Button>
                </View>
              </Card>
            ))}
          </>
        )}

        {(!deliveries || deliveries.length === 0) && (
          <EmptyState icon="truck" title="Нет заказов на доставку" />
        )}
      </ScrollView>
    </View>
  );
}

function DeliveryCard({
  order, colors, cashInput, onCashChange, onOpenMap, onDeliver, onOpenFull, onFail, isPending, failPending,
}: {
  order: Delivery;
  colors: ThemeColors;
  cashInput: string;
  onCashChange: (v: string) => void;
  onOpenMap: () => void;
  onDeliver: () => void;
  /** Полное оформление: частичная оплата, срок долга, возврат по позициям. */
  onOpenFull: () => void;
  onFail: () => void;
  isPending: boolean;
  failPending: boolean;
}) {
  const config = STATUS_CONFIG[order.deliveryStatus] ?? STATUS_CONFIG.assigned;

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
            {config.label}
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
          {Number(order.total).toLocaleString("ru-RU")} сум
        </Text>

        <Button variant="secondary" size="sm" icon="map-pin" onPress={onOpenMap} style={{ marginBottom: 12 }}>
          На карте
        </Button>

        <View style={{ borderTopWidth: 1, borderTopColor: colors.border.subtle, paddingTop: 12 }}>
          <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.xs, color: colors.text.muted, marginBottom: 6 }}>
            Сумма наличных (необязательно)
          </Text>
          <TextInput
            value={cashInput}
            onChangeText={onCashChange}
            placeholder="0"
            keyboardType="numeric"
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
          <Button variant="success" icon="check-circle" onPress={onDeliver} loading={isPending}>
            Доставлено
          </Button>
          <View style={{ marginTop: 8 }}>
            {/* Экран полного оформления существовал, но попасть на него было
                нельзя: маршрут order/deliver зарегистрирован, а перехода на
                него не было ни одного во всём приложении. Курьеру оставались
                только «Доставлено» и «Не доставлено», а частичная оплата,
                срок долга и возврат по позициям — 496 строк готового
                экрана — лежали мёртвым грузом. */}
            <Button variant="secondary" icon="edit-3" onPress={onOpenFull}>
              Оформить подробно
            </Button>
          </View>
          <View style={{ marginTop: 8 }}>
            <Button variant="danger" icon="x-circle" onPress={onFail} loading={failPending}>
              Не доставлено
            </Button>
          </View>
        </View>
      </Card>
    </Animated.View>
  );
}
