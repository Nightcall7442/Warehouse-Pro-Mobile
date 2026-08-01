import { useState, useMemo } from "react";
import {
  View, Text, ScrollView, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, Platform,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { getOrderById, recordDeliveryAndPayment, type OrderDetail } from "../../src/api";
import { Typography, Radii } from "../../src/theme";
import { useThemeColors } from "../../src/store/theme";
import { notify } from "../../src/store/toast";
import { useBrandingStore } from "../../src/store/branding";

const RETURN_REASONS = [
  { value: "changed_mind", label: "Передумал" },
  { value: "no_space", label: "Не влезло в машину" },
  { value: "damaged", label: "Товар испорчен" },
  { value: "wrong_item", label: "Не тот товар" },
  { value: "wrong_client", label: "Клиент не тот" },
  { value: "other", label: "Свой вариант" },
];

interface DeliveryItem {
  itemId: number;
  productName: string;
  productCode: string;
  orderedQty: number;
  unitPrice: number;
  deliveredQty: number;
  returnReason: string;
}

export default function DeliveryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { branding } = useBrandingStore();

  const { data: order, isLoading } = useQuery({
    queryKey: ["order", id],
    queryFn: () => getOrderById(Number(id)),
    enabled: !!id,
  });

  const [items, setItems] = useState<DeliveryItem[]>([]);
  const [paidAmount, setPaidAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "transfer">("cash");
  const [debtDueDate, setDebtDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Initialize items when order loads
  useState(() => {
    if (order?.items) {
      setItems(order.items.map(item => ({
        itemId: item.id,
        productName: item.productName,
        productCode: item.productCode ?? "",
        orderedQty: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
        deliveredQty: Number(item.quantity),
        returnReason: "",
      })));
    }
  });

  const mutation = useMutation({
    mutationFn: recordDeliveryAndPayment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["order", id] });
      notify.success("Доставка зафиксирована");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    },
    onError: (e: Error) => {
      notify.error(e.message || "Ошибка");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    },
    onSettled: () => setSubmitting(false),
  });

  const computedTotal = useMemo(() => {
    return items.reduce((sum, item) => sum + item.unitPrice * item.deliveredQty, 0);
  }, [items]);

  const debt = useMemo(() => {
    return Math.max(0, computedTotal - Number(paidAmount || 0));
  }, [computedTotal, paidAmount]);

  const updateItem = (idx: number, field: keyof DeliveryItem, value: number | string) => {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  };

  const handleSubmit = () => {
    if (submitting) return;

    const hasPartial = items.some(i => i.deliveredQty < i.orderedQty);
    const paid = Number(paidAmount || 0);

    if (paid > computedTotal) {
      Alert.alert("Ошибка", "Сумма оплаты не может превышать сумму доставки");
      return;
    }

    if (hasPartial) {
      const missingReasons = items.filter(i => i.deliveredQty < i.orderedQty && !i.returnReason);
      if (missingReasons.length > 0) {
        Alert.alert("Ошибка", "Укажите причину для товаров, которых клиент не забрал");
        return;
      }
    }

    Alert.alert(
      "Подтверждение",
      `Доставка: ${computedTotal.toLocaleString("ru")} ${branding.currencySymbol}\nОплата: ${paid.toLocaleString("ru")} ${branding.currencySymbol}\nДолг: ${debt.toLocaleString("ru")} ${branding.currencySymbol}`,
      [
        { text: "Отмена", style: "cancel" },
        {
          text: "Подтвердить",
          onPress: () => {
            setSubmitting(true);
            mutation.mutate({
              orderId: Number(id),
              deliveredItems: items.map(i => ({
                itemId: i.itemId,
                deliveredQuantity: i.deliveredQty,
                returnReason: i.returnReason || undefined,
              })),
              payment: {
                paidAmount: paid.toFixed(2),
                method: paymentMethod,
                debtDueDate: debtDueDate || undefined,
                notes: notes || undefined,
              },
            });
          },
        },
      ],
    );
  };

  const s = makeStyles(colors);

  if (isLoading || !order) {
    return (
      <View style={[s.screen, { justifyContent: "center", alignItems: "center" }]}>
        <Text style={{ color: colors.text.secondary }}>Загрузка...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
      <ScrollView
        style={[s.screen, { paddingTop: insets.top + 8 }]}
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={{ paddingHorizontal: 16, marginBottom: 16 }}>
          <TouchableOpacity onPress={() => router.back()} style={{ marginBottom: 8 }}>
            <Feather name="arrow-left" size={24} color={colors.text.primary} />
          </TouchableOpacity>
          <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.xl, color: colors.text.primary }}>
            Доставка: {order.orderNumber}
          </Text>
          <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.sm, color: colors.text.secondary, marginTop: 2 }}>
            {order.shop?.name ?? "Магазин"}
          </Text>
        </View>

        {/* Items Section */}
        <View style={[s.card, { marginHorizontal: 16, marginBottom: 12 }]}>
          <Text style={{ fontFamily: Typography.fontSemibold, fontSize: Typography.size.md, color: colors.text.primary, marginBottom: 12 }}>
            ТОВАРЫ
          </Text>
          {items.map((item, idx) => {
            const hasReturn = item.deliveredQty < item.orderedQty;
            return (
              <View key={item.itemId} style={{ marginBottom: 16, paddingBottom: 16, borderBottomWidth: idx < items.length - 1 ? 1 : 0, borderBottomColor: colors.border.default }}>
                <Text style={{ fontFamily: Typography.fontMedium, fontSize: Typography.size.base, color: colors.text.primary }}>
                  {item.productName} {item.productCode ? `(${item.productCode})` : ""}
                </Text>
                <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.sm, color: colors.text.secondary, marginTop: 2 }}>
                  Заказано: {item.orderedQty} × {item.unitPrice.toLocaleString("ru")} = {(item.orderedQty * item.unitPrice).toLocaleString("ru")} {branding.currencySymbol}
                </Text>

                <View style={{ flexDirection: "row", alignItems: "center", marginTop: 8, gap: 8 }}>
                  <Text style={{ fontFamily: Typography.fontMedium, fontSize: Typography.size.sm, color: colors.text.primary, minWidth: 80 }}>
                    Передал:
                  </Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <TouchableOpacity
                      onPress={() => updateItem(idx, "deliveredQty", Math.max(0, item.deliveredQty - 1))}
                      style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: colors.bg.elevated, alignItems: "center", justifyContent: "center" }}
                    >
                      <Feather name="minus" size={18} color={colors.text.primary} />
                    </TouchableOpacity>
                    <TextInput
                      value={String(item.deliveredQty)}
                      onChangeText={v => updateItem(idx, "deliveredQty", Math.max(0, Math.min(item.orderedQty, Number(v) || 0)))}
                      keyboardType="numeric"
                      style={{
                        width: 60, height: 36, textAlign: "center",
                        fontFamily: Typography.fontBold, fontSize: Typography.size.lg,
                        color: colors.text.primary, backgroundColor: colors.bg.input,
                        borderRadius: 8, borderWidth: 1, borderColor: colors.border.default,
                      }}
                    />
                    <TouchableOpacity
                      onPress={() => updateItem(idx, "deliveredQty", Math.min(item.orderedQty, item.deliveredQty + 1))}
                      style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: colors.bg.elevated, alignItems: "center", justifyContent: "center" }}
                    >
                      <Feather name="plus" size={18} color={colors.text.primary} />
                    </TouchableOpacity>
                    <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.sm, color: colors.text.secondary }}>
                      / {item.orderedQty}
                    </Text>
                  </View>
                </View>

                {hasReturn && (
                  <View style={{ marginTop: 8 }}>
                    <Text style={{ fontFamily: Typography.fontMedium, fontSize: Typography.size.sm, color: colors.status.danger, marginBottom: 4 }}>
                      Возврат: {item.orderedQty - item.deliveredQty} шт
                    </Text>
                    <Text style={{ fontFamily: Typography.fontMedium, fontSize: Typography.size.xs, color: colors.text.secondary, marginBottom: 4 }}>
                      ПОЧЕМУ НЕ ВСЁ? *
                    </Text>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                      {RETURN_REASONS.map(r => (
                        <TouchableOpacity
                          key={r.value}
                          onPress={() => updateItem(idx, "returnReason", r.value)}
                          style={{
                            paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16,
                            backgroundColor: item.returnReason === r.value ? colors.brand.primaryDim : colors.bg.input,
                            borderWidth: 1,
                            borderColor: item.returnReason === r.value ? colors.brand.primary : colors.border.default,
                          }}
                        >
                          <Text style={{
                            fontFamily: Typography.fontMedium, fontSize: Typography.size.xs,
                            color: item.returnReason === r.value ? colors.brand.primary : colors.text.secondary,
                          }}>
                            {r.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {/* Payment Section */}
        <View style={[s.card, { marginHorizontal: 16, marginBottom: 12 }]}>
          <Text style={{ fontFamily: Typography.fontSemibold, fontSize: Typography.size.md, color: colors.text.primary, marginBottom: 12 }}>
            ОПЛАТА
          </Text>

          <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.sm, color: colors.text.secondary, marginBottom: 4 }}>
            Сумма по факту: {computedTotal.toLocaleString("ru")} {branding.currencySymbol}
          </Text>

          <Text style={{ fontFamily: Typography.fontMedium, fontSize: Typography.size.sm, color: colors.text.primary, marginBottom: 4 }}>
            Получено:
          </Text>
          <TextInput
            value={paidAmount}
            onChangeText={setPaidAmount}
            keyboardType="numeric"
            placeholder="0"
            placeholderTextColor={colors.text.muted}
            style={{
              height: 48, paddingHorizontal: 12,
              fontFamily: Typography.fontBold, fontSize: Typography.size.xl,
              color: colors.text.primary, backgroundColor: colors.bg.input,
              borderRadius: Radii.md, borderWidth: 1, borderColor: colors.border.default,
              marginBottom: 8,
            }}
          />

          {debt > 0 && (
            <View style={{ padding: 12, borderRadius: Radii.md, backgroundColor: colors.status.dangerDim, marginBottom: 8 }}>
              <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.lg, color: colors.status.danger }}>
                Долг: {debt.toLocaleString("ru")} {branding.currencySymbol}
              </Text>
            </View>
          )}

          {/* Payment method */}
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
            {(["cash", "card", "transfer"] as const).map(m => (
              <TouchableOpacity
                key={m}
                onPress={() => setPaymentMethod(m)}
                style={{
                  flex: 1, paddingVertical: 10, borderRadius: Radii.md,
                  backgroundColor: paymentMethod === m ? colors.brand.primaryDim : colors.bg.input,
                  borderWidth: 1,
                  borderColor: paymentMethod === m ? colors.brand.primary : colors.border.default,
                  alignItems: "center",
                }}
              >
                <Text style={{
                  fontFamily: Typography.fontMedium, fontSize: Typography.size.sm,
                  color: paymentMethod === m ? colors.brand.primary : colors.text.secondary,
                }}>
                  {m === "cash" ? "Наличные" : m === "card" ? "Карта" : "Перевод"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Debt due date */}
          <Text style={{ fontFamily: Typography.fontMedium, fontSize: Typography.size.sm, color: colors.text.primary, marginBottom: 4 }}>
            Когда обещал доплатить:
          </Text>
          <TextInput
            value={debtDueDate}
            onChangeText={setDebtDueDate}
            placeholder="ГГГГ-ММ-ДД"
            placeholderTextColor={colors.text.muted}
            style={{
              height: 44, paddingHorizontal: 12,
              fontFamily: Typography.fontRegular, fontSize: Typography.size.base,
              color: colors.text.primary, backgroundColor: colors.bg.input,
              borderRadius: Radii.md, borderWidth: 1, borderColor: colors.border.default,
              marginBottom: 8,
            }}
          />

          {/* Notes */}
          <Text style={{ fontFamily: Typography.fontMedium, fontSize: Typography.size.sm, color: colors.text.primary, marginBottom: 4 }}>
            Комментарий:
          </Text>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Комментарий агента..."
            placeholderTextColor={colors.text.muted}
            multiline
            style={{
              minHeight: 60, paddingHorizontal: 12, paddingTop: 10,
              fontFamily: Typography.fontRegular, fontSize: Typography.size.base,
              color: colors.text.primary, backgroundColor: colors.bg.input,
              borderRadius: Radii.md, borderWidth: 1, borderColor: colors.border.default,
              textAlignVertical: "top",
            }}
          />
        </View>

        {/* Summary */}
        <View style={[s.card, { marginHorizontal: 16, marginBottom: 16, backgroundColor: colors.bg.elevated }]}>
          <Text style={{ fontFamily: Typography.fontSemibold, fontSize: Typography.size.md, color: colors.text.primary, marginBottom: 8 }}>
            СВОДКА
          </Text>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
            <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.sm, color: colors.text.secondary }}>Заказ исходно:</Text>
            <Text style={{ fontFamily: Typography.fontMedium, fontSize: Typography.size.sm, color: colors.text.primary }}>{Number(order.total).toLocaleString("ru")} {branding.currencySymbol}</Text>
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
            <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.sm, color: colors.text.secondary }}>По факту:</Text>
            <Text style={{ fontFamily: Typography.fontMedium, fontSize: Typography.size.sm, color: colors.text.primary }}>{computedTotal.toLocaleString("ru")} {branding.currencySymbol}</Text>
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
            <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.sm, color: colors.text.secondary }}>Оплачено:</Text>
            <Text style={{ fontFamily: Typography.fontMedium, fontSize: Typography.size.sm, color: colors.status.success }}>{Number(paidAmount || 0).toLocaleString("ru")} {branding.currencySymbol}</Text>
          </View>
          {debt > 0 && (
            <View style={{ flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: colors.border.default, paddingTop: 6, marginTop: 4 }}>
              <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.md, color: colors.status.danger }}>ДОЛГ:</Text>
              <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.md, color: colors.status.danger }}>{debt.toLocaleString("ru")} {branding.currencySymbol}</Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Submit Button */}
      <View style={{
        position: "absolute", bottom: 0, left: 0, right: 0,
        paddingHorizontal: 16, paddingBottom: insets.bottom + 12, paddingTop: 12,
        backgroundColor: colors.bg.primary,
        borderTopWidth: 1, borderTopColor: colors.border.default,
      }}>
        <TouchableOpacity
          onPress={handleSubmit}
          disabled={submitting}
          style={{
            height: 52, borderRadius: Radii.lg,
            backgroundColor: colors.brand.primary,
            alignItems: "center", justifyContent: "center",
            opacity: submitting ? 0.6 : 1,
          }}
        >
          <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.md, color: "#fff" }}>
            {submitting ? "Отправка..." : "ЗАВЕРШИТЬ ДОСТАВКУ"}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}
