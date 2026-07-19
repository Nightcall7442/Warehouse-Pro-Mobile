import { useState } from "react";
import {
  View, Text, ScrollView, TextInput,
  RefreshControl, ActivityIndicator, Linking, Alert,
} from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { Feather } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeColors } from "../../src/store/theme";
import { Typography, Spacing, Radii, ThemeColors } from "../../src/theme";
import { Card, Button, Badge, SectionHeader, EmptyState } from "../../src/components/ui";
import { listMyDeliveries, type Delivery } from "../../src/api";
import { useOfflineStore } from "../../src/store/offline";
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
  const qc = useQueryClient();
  const [cashInputs, setCashInputs] = useState<Record<number, string>>({});

  const { data: deliveries, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["myDeliveries"],
    queryFn: () => listMyDeliveries(),
  });

  const { addDeliveryAction } = useOfflineStore();

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
      return markOutForDelivery(orderId);
    },
    onSuccess: (result: any) => {
      if (result?.offline) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        notify.info("Нет подключения. Действие сохранено офлайн.");
        return;
      }
      qc.invalidateQueries({ queryKey: ["myDeliveries"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      notify.success("Взято в доставку");
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
      return markDelivered(orderId, cashAmount);
    },
    onSuccess: (result: any) => {
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
      return markFailed(orderId, reason);
    },
    onSuccess: (result: any) => {
      if (result?.offline) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        notify.info("Нет подключения. Действие сохранено офлайн.");
        return;
      }
      qc.invalidateQueries({ queryKey: ["myDeliveries"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      notify.success("Отмечено как недоставлено");
    },
    onError: (e: Error) => notify.error(e.message),
  });

  const assigned = (deliveries ?? []).filter((d: Delivery) => d.deliveryStatus === "assigned");
  const inTransit = (deliveries ?? []).filter((d: Delivery) => d.deliveryStatus === "out_for_delivery");

  const openMap = (address: string) => {
    const url = `https://yandex.ru/maps/?text=${encodeURIComponent(address)}`;
    Linking.openURL(url);
  };

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg.primary, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color={colors.accent.primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.primary, paddingTop: insets.top }}>
      <View style={{ paddingHorizontal: Spacing.base, paddingBottom: Spacing.md, paddingTop: Spacing.sm }}>
        <Text style={{ fontFamily: Typography.fontExtraBold, fontSize: Typography.size.xxl, color: colors.text.primary }}>
          Доставки
        </Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: Spacing.base, paddingBottom: insets.bottom + 100 }}
        refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={colors.accent.primary} />}
      >
        {/* Stats */}
        <View style={{ flexDirection: "row", gap: 12, marginBottom: 20 }}>
          <Card style={{ flex: 1, padding: 16 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <Feather name="package" size={16} color={colors.text.muted} />
              <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.sm, color: colors.text.muted }}>
                Ожидают
              </Text>
            </View>
            <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.xl, color: colors.text.primary }}>
              {assigned.length}
            </Text>
          </Card>
          <Card style={{ flex: 1, padding: 16 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <Feather name="truck" size={16} color={colors.status.warning} />
              <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.sm, color: colors.text.muted }}>
                В пути
              </Text>
            </View>
            <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.xl, color: colors.status.warning }}>
              {inTransit.length}
            </Text>
          </Card>
        </View>

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
                onCashChange={(v) => setCashInputs(prev => ({ ...prev, [order.id]: v }))}
                onOpenMap={() => order.shopAddress && openMap(order.shopAddress)}
                onDeliver={() => {
                  Alert.alert(
                    "Доставлено?",
                    `Заказ ${order.orderNumber} → ${order.shopName}`,
                    [
                      { text: "Отмена", style: "cancel" },
                      {
                        text: "Да",
                        onPress: () => markDel.mutate({
                          orderId: order.id,
                          cashAmount: cashInputs[order.id] || undefined,
                        }),
                      },
                    ]
                  );
                }}
                onFail={() => {
                  Alert.alert(
                    "Не доставлено?",
                    `Заказ ${order.orderNumber} → ${order.shopName}`,
                    [
                      { text: "Отмена", style: "cancel" },
                      { text: "Да", onPress: () => markFail.mutate({ orderId: order.id }) },
                    ]
                  );
                }}
                isPending={markDel.isPending}
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
                    {STATUS_CONFIG[order.deliveryStatus]?.label ?? order.deliveryStatus}
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

                <View style={{ flexDirection: "row", gap: 8 }}>
                  {order.shopAddress && (
                    <Button variant="secondary" size="sm" icon="map-pin" onPress={() => openMap(order.shopAddress!)} style={{ flex: 1 }}>
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
  order, colors, cashInput, onCashChange, onOpenMap, onDeliver, isPending,
}: {
  order: Delivery;
  colors: ThemeColors;
  cashInput: string;
  onCashChange: (v: string) => void;
  onOpenMap: () => void;
  onDeliver: () => void;
  onFail: () => void;
  isPending: boolean;
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
            <Button variant="danger" icon="x-circle" onPress={onFail}>
              Не доставлено
            </Button>
          </View>
        </View>
      </Card>
    </Animated.View>
  );
}
