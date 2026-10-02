import { useState } from "react";
import { View, Text, Modal, Pressable, TextInput, ScrollView } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeColors, useThemeStore } from "../../store/theme";
import { Typography, Spacing, Radii, safeBottomPadding, soft } from "../../theme";
import { useT, useLang } from "../../i18n";
import type { NoOrderChoice } from "../../api";
import { NO_ORDER_REASONS, NO_ORDER_NOTE_MAX, noOrderInputError, noOrderReasonLabel, type NoOrderReason } from "../../lib/no-order-reason";

/*
  «Почему без заказа?» — шторка при закрытии визита, в котором нет заказа.

  Агент жмёт «Готово» (с фото или без), а заказа этому магазину сегодня у
  него нет — визит не закрывается молча: одна из шести причин, для «Другое»
  — коротко словами. Без причины «Закрыть визит» не нажимается. Заказ был
  (getPlans → hasOrder) или ждёт связи в очереди — шторки нет вовсе
  (useNoOrderGate, lib/no-order-gate). Тот же вопрос, что в вебе (NoOrderReason.tsx, #155).

  Причина уходит тем же запросом, что отметка: без связи — тем же местом в
  очереди визитов (store/visit-queue, поле noOrder).
*/

export function NoOrderReasonSheet({ shopName, onCancel, onConfirm, onOrder }: {
  shopName?: string | null;
  onCancel: () => void;
  onConfirm: (choice: NoOrderChoice) => void;
  onOrder?: () => void;
}) {
  const colors = useThemeColors();
  const { isDark } = useThemeStore();
  const insets = useSafeAreaInsets();
  const t = useT();
  const lang = useLang();
  const [reason, setReason] = useState<NoOrderReason | null>(null);
  const [note, setNote] = useState("");

  const problem = reason ? noOrderInputError(reason, note) : null;
  const ready = reason !== null && problem === null;
  const hint = reason === null
    ? t("Выберите причину — без неё визит не закрыть", "Sababni tanlang — usiz tashrifni yopib bo'lmaydi")
    : problem === "note_required"
    ? t("Для «Другое» напишите коротко, что случилось", "«Boshqa» uchun nima bo'lganini qisqa yozing")
    : problem === "note_too_long"
    ? t(`Не длиннее ${NO_ORDER_NOTE_MAX} знаков`, `${NO_ORDER_NOTE_MAX} belgidan oshmasin`)
    : null;

  const submit = () => {
    if (!ready || !reason) return;
    onConfirm(reason === "other" ? { noOrderReason: reason, noOrderNote: note.trim() } : { noOrderReason: reason });
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onCancel}>
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <Pressable
          onPress={onCancel}
          accessibilityLabel={t("Закрыть", "Yopish")}
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.bg.overlayDark }}
        />
        <View
          testID="no-order-sheet"
          style={{
            backgroundColor: colors.bg.secondary,
            borderTopLeftRadius: Radii.xxl, borderTopRightRadius: Radii.xxl,
            ...soft(isDark).raisedLg,
            paddingHorizontal: Spacing.base, paddingTop: Spacing.lg,
            paddingBottom: safeBottomPadding(insets.bottom, Spacing.base),
            maxHeight: "92%",
          }}
        >
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: Spacing.md }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text accessibilityRole="header" style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.xl, color: colors.text.primary }}>
                  {t("Почему без заказа?", "Nega buyurtmasiz?")}
                </Text>
                {shopName ? (
                  <Text numberOfLines={1} style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.sm, color: colors.text.tertiary, marginTop: 2 }}>{shopName}</Text>
                ) : null}
              </View>
              <Pressable
                onPress={onCancel}
                accessibilityRole="button"
                accessibilityLabel={t("Закрыть", "Yopish")}
                hitSlop={4}
                style={{ width: 44, height: 44, borderRadius: Radii.md, backgroundColor: colors.bg.card, alignItems: "center", justifyContent: "center", ...soft(isDark).raisedSm }}
              >
                <Feather name="x" size={18} color={colors.text.secondary} />
              </Pressable>
            </View>

            <View accessibilityRole="radiogroup" accessibilityLabel={t("Причина", "Sabab")} style={{ gap: Spacing.sm, marginTop: Spacing.base }}>
              {NO_ORDER_REASONS.map(r => {
                const on = reason === r;
                return (
                  <Pressable
                    key={r}
                    testID={`no-order-${r}`}
                    onPress={() => setReason(r)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    style={{
                      minHeight: 48, flexDirection: "row", alignItems: "center", gap: Spacing.md,
                      paddingHorizontal: 14, paddingVertical: 10, borderRadius: Radii.lg,
                      // Выбор — вдавленная плашка с заливкой бренда, а не обводка (язык v8: объём вместо линии).
                      backgroundColor: on ? colors.brand.primaryDim : colors.bg.card,
                      ...(on ? soft(isDark).insetSm : soft(isDark).raisedSm),
                    }}
                  >
                    <View style={{
                      width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center",
                      backgroundColor: on ? colors.brand.primary : colors.bg.primary,
                      ...(on ? null : soft(isDark).insetSm),
                    }}>
                      {on && <Feather name="check" size={13} color={colors.brand.ink} />}
                    </View>
                    <Text style={{ flex: 1, fontFamily: Typography.fontSemibold, fontSize: Typography.size.md, color: on ? colors.accent.primary : colors.text.primary }}>
                      {noOrderReasonLabel(r, lang)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {reason === "other" && (
              <View style={{ marginTop: Spacing.md }}>
                <Text style={{ fontFamily: Typography.fontMedium, fontSize: Typography.size.xs, color: colors.text.secondary, marginBottom: 6 }}>
                  {t("Что случилось", "Nima bo'ldi")}
                </Text>
                <TextInput
                  testID="no-order-note"
                  value={note}
                  onChangeText={setNote}
                  autoFocus
                  multiline
                  maxLength={NO_ORDER_NOTE_MAX + 50}
                  placeholder={t("Коротко: ремонт, переезд, сменился владелец…", "Qisqa: ta'mir, ko'chish, egasi almashgan…")}
                  placeholderTextColor={colors.text.tertiary}
                  style={{
                    minHeight: 64, borderRadius: Radii.md,
                    backgroundColor: colors.bg.input, color: colors.text.primary, ...soft(isDark).inset,
                    paddingHorizontal: 12, paddingVertical: 10,
                    fontFamily: Typography.fontRegular, fontSize: Typography.size.base, textAlignVertical: "top",
                  }}
                />
              </View>
            )}

            {hint && (
              <Text testID="no-order-hint" accessibilityLiveRegion="polite" style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.sm, color: colors.text.tertiary, marginTop: Spacing.md }}>
                {hint}
              </Text>
            )}

            <View style={{ flexDirection: "row", gap: Spacing.sm, marginTop: Spacing.base }}>
              {onOrder && (
                <Pressable
                  onPress={onOrder}
                  accessibilityRole="button"
                  style={{
                    minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
                    paddingHorizontal: Spacing.base, borderRadius: Radii.lg,
                    backgroundColor: colors.bg.card, ...soft(isDark).raisedSm,
                  }}
                >
                  <Feather name="plus-circle" size={16} color={colors.text.primary} />
                  <Text style={{ fontFamily: Typography.fontSemibold, fontSize: Typography.size.base, color: colors.text.primary }}>{t("Оформить заказ", "Buyurtma berish")}</Text>
                </Pressable>
              )}
              <Pressable
                testID="no-order-confirm"
                onPress={submit}
                disabled={!ready}
                accessibilityRole="button"
                accessibilityState={{ disabled: !ready }}
                style={{
                  flex: 1, minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
                  paddingHorizontal: Spacing.base, borderRadius: Radii.lg,
                  backgroundColor: colors.brand.primary, opacity: ready ? 1 : 0.4,
                }}
              >
                <Feather name="check" size={16} color={colors.brand.ink} />
                <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.base, color: colors.brand.ink }}>{t("Закрыть визит", "Tashrifni yopish")}</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
