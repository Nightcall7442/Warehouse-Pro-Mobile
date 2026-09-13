import { useState, useMemo } from "react";
import { validateDeliveryForm } from "../../src/lib/delivery-validation";
import { parseDueDate } from "../../src/lib/due-date";
import { plural } from "../../src/lib/plural";
import { qty } from "../../src/lib/format";
import { reportNotQueued } from "../../src/lib/offline-guard";
import { Button } from "../../src/components/ui";
import {
  View, Text, ScrollView, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, Platform,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import * as Network from "expo-network";
import { getOrderById, completeDelivery, type CompleteDeliveryInput } from "../../src/api";
import { Typography, Radii, Spacing, soft } from "../../src/theme";
import { useThemeColors, useThemeStore } from "../../src/store/theme";
import { notify } from "../../src/store/toast";
import { useBrandingStore } from "../../src/store/branding";
import { useOfflineStore, isRetryableError } from "../../src/store/offline";
import { useT } from "../../src/i18n";
import { unitShort } from "../../src/lib/units";
import { paymentMethodLabel } from "../../src/lib/order-status";

type DeliveryResult = "paid" | "partial_paid" | "returned" | "partial_returned";

// Partial-return uses a distinct 4th hue (no theme token covers it) to stay visually
// separate from the 3 standard status colors — matches the same orange used in OrderStyles.
const PARTIAL_RETURN_COLOR = "#f09050";

type T = (ru: string, uz: string) => string;

/** Слово исхода — одно и на кнопке выбора, и в тосте после отправки. */
function resultLabel(t: T, result: string): string {
  switch (result) {
    case "paid": return t("100% оплачен", "100% to'langan");
    case "partial_paid": return t("Частично оплачен", "Qisman to'langan");
    case "returned": return t("Возврат", "Qaytarish");
    case "partial_returned": return t("Частичный возврат", "Qisman qaytarish");
    default: return result;
  }
}

function getResultOptions(t: T, colors: ReturnType<typeof useThemeColors>): Array<{ value: DeliveryResult; icon: string; label: string; color: string }> {
  return [
    { value: "paid", icon: "check-circle", label: resultLabel(t, "paid"), color: colors.status.success },
    { value: "partial_paid", icon: "clock", label: resultLabel(t, "partial_paid"), color: colors.status.warning },
    { value: "returned", icon: "rotate-ccw", label: resultLabel(t, "returned"), color: colors.status.danger },
    { value: "partial_returned", icon: "package", label: resultLabel(t, "partial_returned"), color: PARTIAL_RETURN_COLOR },
  ];
}

/* Коды уходят на сервер; подпись — на языке телефона. */
function getReturnReasons(t: T) {
  return [
    { value: "changed_mind", label: t("Передумал", "Fikridan qaytdi") },
    { value: "no_space", label: t("Не влезло в машину", "Mashinaga sig'madi") },
    { value: "damaged", label: t("Товар испорчен", "Tovar buzilgan") },
    { value: "wrong_item", label: t("Не тот товар", "Boshqa tovar") },
    { value: "wrong_client", label: t("Клиент не тот", "Boshqa mijoz") },
    { value: "other", label: t("Свой вариант", "Boshqa sabab") },
  ];
}

export default function DeliveryScreen() {
  const { isDark } = useThemeStore();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colors = useThemeColors();
  const t = useT();
  const RESULT_OPTIONS = useMemo(() => getResultOptions(t, colors), [t, colors]);
  const RETURN_REASONS = useMemo(() => getReturnReasons(t), [t]);
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { branding } = useBrandingStore();
  const { addDeliveryAction } = useOfflineStore();

  const { data: order, isLoading, isError, refetch } = useQuery({
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
  const [returnedQty, setReturnedQty] = useState<Record<number, string>>({});

  const queueOffline = async (input: CompleteDeliveryInput) => {
    // Признак записи на диск обязан дойти до onSuccess: без него экран
    // рапортовал «сохранено офлайн» даже тогда, когда ничего не сохранил.
    const queued = await addDeliveryAction({
      id: `completeDelivery-${input.orderId}-${Date.now()}`,
      action: { type: "completeDelivery", input },
      createdAt: new Date().toISOString(),
      synced: false,
    });
    return { offline: true as const, queued, result: input.result, finalStatus: "" };
  };

  const mutation = useMutation({
    mutationFn: async (input: CompleteDeliveryInput) => {
      const net = await Network.getNetworkStateAsync();
      if (!net.isConnected) return queueOffline(input);

      try {
        return await completeDelivery(input);
      } catch (e) {
        // The pre-flight check said we were online, but the request still
        // didn't land — which is the normal case in a weak-signal doorway,
        // not an edge case. Falling through to onError here would show a
        // toast and drop the delivery on the floor: the goods are handed
        // over, the money is taken, and nothing records it. Queue it like
        // the offline branch above and let AutoSync carry it.
        //
        // Проверка отдана общей функции. Своя копия искала подстроку
        // "status 5", а axios пишет "status code 502" — совпадения не было
        // никогда, и при ответе шлюза курьер получал тост «Ошибка», отдав
        // товар и взяв наличные. Комментарий выше описывает именно этот
        // исход — он и наступал.
        if (isRetryableError(e)) return queueOffline(input);
        throw e; // a real rejection from the server — the courier must see it
      }
    },
    onSuccess: (data) => {
      // Ключа "orders" нет ни у одного запроса: списки живут под "myOrders",
      // карточка — под ["order", id]. Строка не делала ничего, и список
      // заказов после завершённой доставки оставался прежним.
      queryClient.invalidateQueries({ queryKey: ["myOrders"] });
      queryClient.invalidateQueries({ queryKey: ["order", id] });
      queryClient.invalidateQueries({ queryKey: ["myDeliveries"] });
      if ("offline" in data && data.offline) {
        // Курьер к этому мигу уже отдал товар и, возможно, взял деньги. Если
        // запись не легла на диск — сказать об этом и НЕ закрывать экран:
        // закрытый экран курьер прочитает как «всё в порядке».
        if (!data.queued) {
          reportNotQueued(t("Отметка о доставке", "Yetkazish belgisi"));
          return;
        }
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        notify.info(t("Нет подключения. Доставка сохранена офлайн и отправится автоматически.", "Aloqa yo'q. Yetkazish oflayn saqlandi va o'zi yuboriladi."));
      } else {
        notify.success(t(`Доставка: ${resultLabel(t, data.result)}`, `Yetkazish: ${resultLabel(t, data.result)}`));
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      router.back();
    },
    onError: (e: Error) => {
      notify.error(e.message || t("Ошибка", "Xatolik"));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    },
    onSettled: () => setSubmitting(false),
  });

  const orderTotal = useMemo(() => Number(order?.total ?? 0), [order]);

  const returnedItemsList = useMemo(() => {
    if (!order) return [];
    return order.items
      .map(item => ({ itemId: item.id, returnedQty: Number(returnedQty[item.id] || 0) }))
      .filter(ri => ri.returnedQty > 0);
  }, [order, returnedQty]);

  /*
    Сколько магазин должен за то, что оставил: итог минус вернувшееся по
    цене строки. Сервер считает так же (courier-delivery: orderTotal после
    возврата), и оплата при частичном возврате сверяется с этой суммой.
  */
  const keptTotal = useMemo(() => {
    if (!order || result !== "partial_returned") return orderTotal;
    const returnedValue = order.items.reduce((s, item) => s + Number(returnedQty[item.id] || 0) * Number(item.unitPrice), 0);
    return Math.max(0, Math.round((orderTotal - returnedValue) * 100) / 100);
  }, [order, result, orderTotal, returnedQty]);
  const owed = result === "partial_returned" ? keptTotal : orderTotal;
  const debt = useMemo(() => Math.max(0, owed - Number(paidAmount || 0)), [owed, paidAmount]);

  const setItemReturnedQty = (itemId: number, maxQty: number, value: string) => {
    const clamped = Math.max(0, Math.min(maxQty, Number(value) || 0));
    setReturnedQty(prev => ({ ...prev, [itemId]: String(clamped) }));
  };

  const handleSubmit = () => {
    if (submitting) return;

    // Проверки живут в src/lib/delivery-validation: экран без навигации,
    // запросов и темы в тесте не поднять, а ошибка была именно в них.
    //
    // Поле «Сумма оплаты» рисуется только для частичной оплаты, а требовалось
    // и для полной. «Оплачен полностью» — исход по умолчанию и самый частый:
    // курьер выбирал его, жал «Завершить» и получал «Укажите сумму оплаты»,
    // не находя на экране поля, о котором речь. Завершить доставку было
    // нельзя вообще. Сумма при полной оплате и так берётся из итога заказа.
    const problem = validateDeliveryForm({
      result,
      paidAmount,
      orderTotal,
      returnedItemsCount: returnedItemsList.length,
      keptTotal,
    });
    if (problem) {
      Alert.alert(t("Ошибка", "Xatolik"), problem);
      return;
    }
    // Дату пишут как привыкли — «15.09.2026»; сервер ждёт ГГГГ-ММ-ДД. Разбор
    // лежал в lib/due-date и здесь не использовался: отказ приходил уже
    // после того, как товар отдан и деньги взяты.
    const dueIso = debtDueDate.trim() ? parseDueDate(debtDueDate) : null;
    if (debtDueDate.trim() && !dueIso) {
      Alert.alert(t("Дата не разобрана", "Sana tushunilmadi"), t(`«${debtDueDate}» — напишите день, месяц и год, например 15.09.2026.`, `«${debtDueDate}» — kun, oy va yilni yozing, masalan 15.09.2026.`));
      return;
    }

    const cur = branding.currencySymbol;
    const total = orderTotal.toLocaleString("ru");
    const paidStr = Number(paidAmount || 0).toLocaleString("ru");
    const debtStr = debt.toLocaleString("ru");
    const n = returnedItemsList.length;
    const labels: Record<string, string> = {
      paid: t(`100% оплата: ${total} ${cur}`, `100% to'lov: ${total} ${cur}`),
      partial_paid: t(`Оплата: ${paidStr} ${cur}, долг: ${debtStr} ${cur}`, `To'lov: ${paidStr} ${cur}, qarz: ${debtStr} ${cur}`),
      returned: t("Полный возврат — товар вернётся на склад", "To'liq qaytarish — tovar omborga qaytadi"),
      partial_returned: t(`Возврат: ${n} позици${n === 1 ? "я" : "и"}; оплата ${paidStr} ${cur}`, `Qaytarish: ${n} ta pozitsiya; to'lov ${paidStr} ${cur}`) +
        (debt > 0 ? t(`, долг ${debtStr} ${cur}`, `, qarz ${debtStr} ${cur}`) : ""),
    };

    Alert.alert(
      t("Подтверждение доставки", "Yetkazishni tasdiqlash"),
      labels[result],
      [
        { text: t("Отмена", "Bekor"), style: "cancel" },
        {
          text: t("Подтвердить", "Tasdiqlash"),
          onPress: () => {
            setSubmitting(true);
            mutation.mutate({
              orderId: Number(id),
              result,
              paidAmount: result === "paid" ? String(orderTotal)
                : result === "partial_paid" || result === "partial_returned" ? String(Number(paidAmount || 0))
                : undefined,
              paymentMethod,
              debtDueDate: dueIso ?? undefined,
              returnReason: returnReason || undefined,
              returnedItems: result === "partial_returned" ? returnedItemsList : undefined,
              notes: notes || undefined,
            });
          },
        },
      ],
    );
  };

  const s = makeStyles(colors, isDark);

  // Раньше стояло только `isLoading || !order`. При сбое запроса isLoading
  // становится false, order остаётся пустым — и курьер у двери магазина
  // смотрел на «Загрузка...» бесконечно, без объяснения и без повтора.
  if (isError && !order) {
    return (
      <View style={[s.screen, { justifyContent: "center", alignItems: "center", padding: 24 }]}>
        <Feather name="wifi-off" size={32} color={colors.text.muted} />
        <Text style={{ color: colors.text.primary, fontFamily: Typography.fontSemibold, fontSize: Typography.size.md, marginTop: 12, textAlign: "center" }}>
          {t("Не удалось загрузить заказ", "Buyurtmani yuklab bo'lmadi")}
        </Text>
        <Text style={{ color: colors.text.secondary, fontSize: Typography.size.sm, marginTop: 6, textAlign: "center" }}>
          {t("Это сбой связи, а не отсутствие заказа.", "Bu aloqa uzilishi, buyurtma yo'q degani emas.")}
        </Text>
        <View style={{ marginTop: 16, minWidth: 160 }}>
          <Button variant="primary" icon="refresh-cw" onPress={() => refetch()}>
            {t("Повторить", "Qayta urinish")}
          </Button>
        </View>
      </View>
    );
  }

  if (isLoading || !order) {
    return (
      <View style={[s.screen, { justifyContent: "center", alignItems: "center" }]}>
        <Text style={{ color: colors.text.secondary }}>{t("Загрузка...", "Yuklanmoqda...")}</Text>
      </View>
    );
  }

  const showPaymentFields = result === "paid" || result === "partial_paid" || result === "partial_returned";
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
            {t("Доставка", "Yetkazish")}: {order.orderNumber}
          </Text>
          <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.sm, color: colors.text.secondary, marginTop: 2 }}>
            {order.shop?.name ?? t("Магазин", "Do'kon")} • {t("Итого", "Jami")}: {orderTotal.toLocaleString("ru")} {branding.currencySymbol}
          </Text>
        </View>

        {/*
          Состав — всегда, сразу под заголовком.

          Было: позиции показывались только при «Частичном возврате», как
          поле ввода. Курьер у двери с коробками не видел, что именно везёт,
          и открывал заказ отдельно, чтобы сверить с накладной. Здесь —
          «название × количество», без кнопок.
        */}
        <View testID="deliver-items" style={[s.card, { marginHorizontal: 16, marginBottom: 12 }]}>
          <Text style={{ fontFamily: Typography.fontSemibold, fontSize: Typography.size.md, color: colors.text.primary, marginBottom: 8 }}>
            {t(`СОСТАВ · ${order.items.length} ${plural(order.items.length, "позиция", "позиции", "позиций")}`, `TARKIB · ${order.items.length} ta pozitsiya`)}
          </Text>
          {order.items.map(item => (
            <View key={item.id} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.border.subtle }}>
              <Text style={{ flex: 1, fontFamily: Typography.fontRegular, fontSize: Typography.size.sm, color: colors.text.primary }} numberOfLines={2}>
                {item.productName}
              </Text>
              <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.sm, color: colors.text.primary }}>
                × {qty(item.quantity)} {unitShort(item.unit)}
              </Text>
            </View>
          ))}
        </View>

        {/* Result Selection */}
        <View style={[s.card, { marginHorizontal: 16, marginBottom: 12 }]}>
          <Text style={{ fontFamily: Typography.fontSemibold, fontSize: Typography.size.md, color: colors.text.primary, marginBottom: 12 }}>
            {t("РЕЗУЛЬТАТ ДОСТАВКИ", "YETKAZISH NATIJASI")}
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {RESULT_OPTIONS.map(opt => {
              const isSelected = result === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  onPress={() => setResult(opt.value)}
                  style={{
                    flex: 1, minWidth: "45%", paddingVertical: Spacing.base, paddingHorizontal: Spacing.md,
                    borderRadius: Radii.lg,
                    backgroundColor: isSelected ? `${opt.color}15` : colors.bg.input,
                    // Выбранное «выступает», остальное «утоплено» — тот же
                    // приём, что у сегмент-контрола: состояние читается на
                    // ощупь, а не по толщине обводки.
                    ...(isSelected ? soft(isDark).raisedSm : soft(isDark).inset),
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
              {t("ОПЛАТА", "TO'LOV")}
            </Text>

            {(result === "partial_paid" || result === "partial_returned") && (
              <>
                <Text style={{ fontFamily: Typography.fontMedium, fontSize: Typography.size.sm, color: colors.text.primary, marginBottom: 4 }}>
                  {result === "partial_returned" ? t(`Оплата (за оставшееся ${keptTotal.toLocaleString("ru")} ${branding.currencySymbol}):`, `To'lov (qolgan ${keptTotal.toLocaleString("ru")} ${branding.currencySymbol} uchun):`) : t("Сумма оплаты:", "To'lov summasi:")}
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
                    borderRadius: Radii.lg, ...soft(isDark).inset,
                    marginBottom: 8,
                  }}
                />
                {debt > 0 && (
                  <View style={{ padding: 10, borderRadius: Radii.md, backgroundColor: colors.status.dangerDim, marginBottom: 8 }}>
                    <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.lg, color: colors.status.danger }}>
                      {t("Долг", "Qarz")}: {debt.toLocaleString("ru")} {branding.currencySymbol}
                    </Text>
                  </View>
                )}
              </>
            )}

            {result === "paid" && (
              <View style={{ padding: 10, borderRadius: Radii.md, backgroundColor: colors.status.successDim, marginBottom: 8 }}>
                <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.lg, color: colors.status.success }}>
                  {t("Сумма", "Summa")}: {orderTotal.toLocaleString("ru")} {branding.currencySymbol}
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
                    flex: 1, paddingVertical: Spacing.sm + 2, borderRadius: Radii.md,
                    backgroundColor: paymentMethod === m ? colors.brand.primaryDim : colors.bg.input,
                    ...(paymentMethod === m ? soft(isDark).raisedSm : soft(isDark).inset),
                    alignItems: "center",
                  }}
                >
                  <Text style={{
                    fontFamily: Typography.fontMedium, fontSize: Typography.size.sm,
                    color: paymentMethod === m ? colors.brand.primary : colors.text.secondary,
                  }}>
                    {paymentMethodLabel(m)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Debt due date */}
            {(result === "partial_paid" || (result === "partial_returned" && debt > 0)) && (
              <>
                <Text style={{ fontFamily: Typography.fontMedium, fontSize: Typography.size.sm, color: colors.text.primary, marginBottom: 4 }}>
                  {t("Когда обещал доплатить:", "Qachon to'lashga va'da berdi:")}
                </Text>
                <TextInput
                  value={debtDueDate}
                  onChangeText={setDebtDueDate}
                  placeholder="15.09.2026"
                  placeholderTextColor={colors.text.muted}
                  style={{
                    height: 44, paddingHorizontal: 12,
                    fontFamily: Typography.fontRegular, fontSize: Typography.size.base,
                    color: colors.text.primary, backgroundColor: colors.bg.input,
                    borderRadius: Radii.lg, ...soft(isDark).inset,
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
              {t("ВОЗВРАТ", "QAYTARISH")}
            </Text>
            <Text style={{ fontFamily: Typography.fontMedium, fontSize: Typography.size.sm, color: colors.text.primary, marginBottom: 4 }}>
              {t("Причина возврата:", "Qaytarish sababi:")}
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
              {RETURN_REASONS.map(r => (
                <TouchableOpacity
                  key={r.value}
                  onPress={() => setReturnReason(r.value)}
                  style={{
                    paddingHorizontal: Spacing.sm + 2, paddingVertical: Spacing.xs + 2, borderRadius: Radii.lg,
                    backgroundColor: returnReason === r.value ? colors.brand.primaryDim : colors.bg.input,
                    ...(returnReason === r.value ? soft(isDark).raisedSm : soft(isDark).inset),
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

            {result === "partial_returned" && (
              <>
                <Text style={{ fontFamily: Typography.fontMedium, fontSize: Typography.size.sm, color: colors.text.primary, marginTop: 8, marginBottom: 8 }}>
                  {t("Возвращённое количество:", "Qaytarilgan miqdor:")}
                </Text>
                {order.items.map(item => {
                  const qty = Number(returnedQty[item.id] || 0);
                  return (
                    <View
                      key={item.id}
                      style={{
                        flexDirection: "row", alignItems: "center", gap: 10,
                        paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border.subtle,
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontFamily: Typography.fontMedium, fontSize: Typography.size.sm, color: colors.text.primary }} numberOfLines={2}>
                          {item.productName}
                        </Text>
                        <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.xs, color: colors.text.muted, marginTop: 2 }}>
                          {t("Заказано", "Buyurtilgan")}: {item.quantity} {unitShort(item.unit)}
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => setItemReturnedQty(item.id, Number(item.quantity), String(qty - 1))}
                        style={{ width: 32, height: 32, borderRadius: Radii.md, backgroundColor: colors.bg.input, alignItems: "center", justifyContent: "center" }}
                      >
                        <Feather name="minus" size={14} color={colors.text.primary} />
                      </TouchableOpacity>
                      <TextInput
                        value={returnedQty[item.id] ?? "0"}
                        onChangeText={(v) => setItemReturnedQty(item.id, Number(item.quantity), v)}
                        keyboardType="numeric"
                        style={{
                          width: 48, textAlign: "center", paddingVertical: 6,
                          fontFamily: Typography.fontBold, fontSize: Typography.size.md,
                          color: qty > 0 ? colors.status.warning : colors.text.primary,
                          backgroundColor: colors.bg.input, borderRadius: Radii.md,
                          ...soft(isDark).insetSm,
                        }}
                      />
                      <TouchableOpacity
                        onPress={() => setItemReturnedQty(item.id, Number(item.quantity), String(qty + 1))}
                        style={{ width: 32, height: 32, borderRadius: Radii.md, backgroundColor: colors.bg.input, alignItems: "center", justifyContent: "center" }}
                      >
                        <Feather name="plus" size={14} color={colors.text.primary} />
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </>
            )}
          </View>
        )}

        {/* Notes */}
        <View style={[s.card, { marginHorizontal: 16, marginBottom: 12 }]}>
          <Text style={{ fontFamily: Typography.fontMedium, fontSize: Typography.size.sm, color: colors.text.primary, marginBottom: 4 }}>
            {t("Комментарий:", "Izoh:")}
          </Text>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder={t("Комментарий курьера...", "Kuryer izohi...")}
            placeholderTextColor={colors.text.muted}
            multiline
            style={{
              minHeight: 60, paddingHorizontal: 12, paddingTop: 10,
              fontFamily: Typography.fontRegular, fontSize: Typography.size.base,
              color: colors.text.primary, backgroundColor: colors.bg.input,
              borderRadius: Radii.lg, ...soft(isDark).inset,
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
            backgroundColor: result === "returned" ? colors.status.danger : result === "partial_returned" ? PARTIAL_RETURN_COLOR : colors.brand.primary,
            alignItems: "center", justifyContent: "center",
            opacity: submitting ? 0.6 : 1,
          }}
        >
          <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.md, color: "#fff" }}>
            {submitting ? t("Отправка...", "Yuborilmoqda...") : t("ЗАВЕРШИТЬ ДОСТАВКУ", "YETKAZISHNI YAKUNLASH")}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

function makeStyles(colors: ReturnType<typeof useThemeColors>, isDark: boolean) {
  return {
    screen: { flex: 1, backgroundColor: colors.bg.primary },
    /*
      Карточка отделяется от холста объёмом, а не линией — как Card в
      components/ui и как всё остальное в этом языке. Рамка вокруг поверхности
      цвета холста читалась как чертёж, а не как предмет.
    */
    card: {
      padding: Spacing.lg,
      backgroundColor: colors.bg.card,
      borderRadius: Radii.xl,
      ...soft(isDark).raised,
    },
  };
}
