import { useState, useMemo } from "react";
import {
  View, Text, ScrollView, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, Platform,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { getOrderById, completeDelivery, type OrderDetail } from "../../src/api";
import { Typography, Radii } from "../../src/theme";
import { useThemeColors } from "../../src/store/theme";
import { notify } from "../../src/store/toast";
import { useBrandingStore } from "../../src/store/branding";

type DeliveryResult = "paid" | "partial_paid" | "returned" | "partial_returned";

const RESULT_OPTIONS: Array<{ value: DeliveryResult; icon: string; label: string; color: string }> = [
  { value: "paid", icon: "check-circle", label: "100% оплачен", color: "#34c473" },
  { value: "partial_paid", icon: "clock", label: "Частично оплачен", color: "#d4973a" },
  { value: "returned", icon: "rotate-ccw", label: "Возврат", color: "#d45050" },
  { value: "partial_returned", icon: "package", label: "Частичный возврат", color: "#f09050" },
];

const RETURN_REASONS = [
  { value: "changed_mind", label: "Передумал" },
  { value: "no_space", label: "Не влезло в машину" },
  { value: "damaged", label: "Товар испорчен" },
  { value: "wrong_item", label: "Не тот товар" },
  { value: "wrong_client", label: "Клиент не тот" },
  { value: "other", label: "Свой вариант" },
];

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

  const [result, setResult] = useState<DeliveryResult>("paid");
  const [paidAmount, setPaidAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "transfer">("cash");
  const [debtDueDate, setDebtDueDate] = useState("");
  const [returnReason, setReturnReason] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const mutation = useMutation({
    mutationFn: completeDelivery,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["order", id] });
      queryClient.invalidateQueries({ queryKey: ["myDeliveries"] });
      const labels: Record<string, string> = {
        paid: "100% оплачен",
        partial_paid: "Частично оплачен",
        returned: "Возврат",
        partial_returned: "Частичный возврат",
      };
      notify.success(`Доставка: ${labels[data.result] ?? data.result}`);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    },
    onError: (e: Error) => {
      notify.error(e.message || "Ошибка");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    },
    onSettled: () => setSubmitting(false),
  });

  const orderTotal = useMemo(() => Number(order?.total ?? 0), [order]);
  const debt = useMemo(() => Math.max(0, orderTotal - Number(paidAmount || 0)), [orderTotal, paidAmount]);

  const handleSubmit = () => {
    if (submitting) return;

    if ((result === "paid" || result === "partial_paid") && Number(paidAmount || 0) <= 0) {
      Alert.alert("Ошибка", "Укажите сумму оплаты");
      return;
    }
    if (result === "partial_paid" && Number(paidAmount) >= orderTotal) {
      Alert.alert("Ошибка", "При частичной оплате сумма должна быть меньше итого");
      return;
    }

    const labels: Record<string, string> = {
      paid: `100% оплата: ${orderTotal.toLocaleString("ru")} ${branding.currencySymbol}`,
      partial_paid: `Оплата: ${Number(paidAmount).toLocaleString("ru")} ${branding.currencySymbol}, долг: ${debt.toLocaleString("ru")} ${branding.currencySymbol}`,
      returned: "Полный возврат — товар вернётся на склад",
      partial_returned: "Частичный возврат",
    };

    Alert.alert(
      "Подтверждение доставки",
      labels[result],
      [
        { text: "Отмена", style: "cancel" },
        {
          text: "Подтвердить",
          onPress: () => {
            setSubmitting(true);
            mutation.mutate({
              orderId: Number(id),
              result,
              paidAmount: result === "paid" ? String(orderTotal) : result === "partial_paid" ? paidAmount : undefined,
              paymentMethod,
              debtDueDate: debtDueDate || undefined,
              returnReason: returnReason || undefined,
              notes: notes || undefined,
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

  const showPaymentFields = result === "paid" || result === "partial_paid";
  const showReturnFields = result === "returned" || result === "partial_returned";

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
            {order.shop?.name ?? "Магазин"} • Итого: {orderTotal.toLocaleString("ru")} {branding.currencySymbol}
          </Text>
        </View>

        {/* Result Selection */}
        <View style={[s.card, { marginHorizontal: 16, marginBottom: 12 }]}>
          <Text style={{ fontFamily: Typography.fontSemibold, fontSize: Typography.size.md, color: colors.text.primary, marginBottom: 12 }}>
            РЕЗУЛЬТАТ ДОСТАВКИ
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {RESULT_OPTIONS.map(opt => {
              const isSelected = result === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  onPress={() => setResult(opt.value)}
                  style={{
                    flex: 1, minWidth: "45%", paddingVertical: 14, paddingHorizontal: 12,
                    borderRadius: Radii.lg,
                    backgroundColor: isSelected ? `${opt.color}15` : colors.bg.input,
                    borderWidth: 2,
                    borderColor: isSelected ? opt.color : colors.border.default,
                    alignItems: "center",
                  }}
                >
                  <Feather name={opt.icon as keyof typeof Feather.glyphMap} size={22} color={isSelected ? opt.color : colors.text.secondary} />
                  <Text style={{
                    fontFamily: isSelected ? Typography.fontBold : Typography.fontMedium,
                    fontSize: Typography.size.sm,
                    color: isSelected ? opt.color : colors.text.secondary,
                    marginTop: 6, textAlign: "center",
                  }}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Payment fields */}
        {showPaymentFields && (
          <View style={[s.card, { marginHorizontal: 16, marginBottom: 12 }]}>
            <Text style={{ fontFamily: Typography.fontSemibold, fontSize: Typography.size.md, color: colors.text.primary, marginBottom: 12 }}>
              ОПЛАТА
            </Text>

            {result === "partial_paid" && (
              <>
                <Text style={{ fontFamily: Typography.fontMedium, fontSize: Typography.size.sm, color: colors.text.primary, marginBottom: 4 }}>
                  Сумма оплаты:
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
                  <View style={{ padding: 10, borderRadius: Radii.md, backgroundColor: colors.status.dangerDim, marginBottom: 8 }}>
                    <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.lg, color: colors.status.danger }}>
                      Долг: {debt.toLocaleString("ru")} {branding.currencySymbol}
                    </Text>
                  </View>
                )}
              </>
            )}

            {result === "paid" && (
              <View style={{ padding: 10, borderRadius: Radii.md, backgroundColor: colors.status.successDim, marginBottom: 8 }}>
                <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.lg, color: colors.status.success }}>
                  Сумма: {orderTotal.toLocaleString("ru")} {branding.currencySymbol}
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
            {result === "partial_paid" && (
              <>
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
              </>
            )}
          </View>
        )}

        {/* Return fields */}
        {showReturnFields && (
          <View style={[s.card, { marginHorizontal: 16, marginBottom: 12 }]}>
            <Text style={{ fontFamily: Typography.fontSemibold, fontSize: Typography.size.md, color: colors.text.primary, marginBottom: 12 }}>
              ВОЗВРАТ
            </Text>
            <Text style={{ fontFamily: Typography.fontMedium, fontSize: Typography.size.sm, color: colors.text.primary, marginBottom: 4 }}>
              Причина возврата:
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
              {RETURN_REASONS.map(r => (
                <TouchableOpacity
                  key={r.value}
                  onPress={() => setReturnReason(r.value)}
                  style={{
                    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16,
                    backgroundColor: returnReason === r.value ? colors.brand.primaryDim : colors.bg.input,
                    borderWidth: 1,
                    borderColor: returnReason === r.value ? colors.brand.primary : colors.border.default,
                  }}
                >
                  <Text style={{
                    fontFamily: Typography.fontMedium, fontSize: Typography.size.xs,
                    color: returnReason === r.value ? colors.brand.primary : colors.text.secondary,
                  }}>
                    {r.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Notes */}
        <View style={[s.card, { marginHorizontal: 16, marginBottom: 12 }]}>
          <Text style={{ fontFamily: Typography.fontMedium, fontSize: Typography.size.sm, color: colors.text.primary, marginBottom: 4 }}>
            Комментарий:
          </Text>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Комментарий курьера..."
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
            backgroundColor: result === "returned" ? "#d45050" : result === "partial_returned" ? "#f09050" : colors.brand.primary,
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

function makeStyles(colors: ReturnType<typeof useThemeColors>) {
  return {
    screen: { flex: 1, backgroundColor: colors.bg.primary },
    card: {
      padding: 16,
      backgroundColor: colors.bg.card,
      borderRadius: Radii.lg,
      borderWidth: 1,
      borderColor: colors.border.default,
    },
  };
}
