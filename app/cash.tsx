import { useCallback, useState } from "react";
import { View, Text, ScrollView, RefreshControl, Pressable, TextInput } from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useThemeColors, useThemeStore } from "../src/store/theme";
import { Typography, Spacing, Radii, soft } from "../src/theme";
import { Card, Button, EmptyState } from "../src/components/ui";
import { QueryState } from "../src/components/QueryState";
import { getMyCash, setCashPin } from "../src/api";
import { formatMoney } from "../src/store/branding";
import { errorText } from "../src/lib/error-text";
import { notify } from "../src/store/toast";
import { useT } from "../src/i18n";

/**
 * Наличные на руках.
 *
 * ── Зачем экран ─────────────────────────────────────────────────────────────
 *
 * Владелец: «в мобилке не хватило — у меня на руках вот столько, вот я сдал
 * в кассу». Деньги носят курьер и агент, у которых веба нет, а число «сколько
 * я должен сдать» жило только у кассира. Здесь оно перед глазами: на руках,
 * до какого часа сдать, что уже принял кассир (ПКО с номером), недостачи,
 * которые уйдут в удержание, и переводы, которые касса ещё не сверила.
 *
 * ── PIN ─────────────────────────────────────────────────────────────────────
 *
 * PIN — подпись сотрудника: под суммой при сдаче наличных и под количеством
 * при загрузке машины. Кассир его не знает и не вводит; вводит сам сотрудник
 * на экране кассира. Заводится здесь, меняется здесь же.
 */
const KIND = { pko: "ПКО", rko: "РКО" } as const; // i18n-ignore: номера кассовых документов — как на бумаге, без перевода

export default function CashScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { isDark } = useThemeStore();
  const t = useT();
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");

  const q = useQuery({ queryKey: ["myCash"], queryFn: getMyCash, retry: false });
  const savePin = useMutation({
    mutationFn: (p: string) => setCashPin(p),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      notify.success(t("PIN сохранён", "PIN saqlandi"));
      setPin(""); setPin2("");
    },
    onError: (e) => notify.error(errorText(e)),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await q.refetch(); qc.invalidateQueries({ queryKey: ["myCash"] }); }
    finally { setRefreshing(false); }
  }, [q, qc]);

  const m = q.data;
  const over = !!m && m.onHand > m.limit;
  const pinOk = /^\d{4,6}$/.test(pin) && pin === pin2;
  const label = { fontFamily: Typography.fontSemibold, fontSize: Typography.size.xs, letterSpacing: 0.6, color: colors.text.tertiary };
  const inputStyle = {
    fontFamily: Typography.fontMono, fontSize: Typography.size.lg, color: colors.text.primary, textAlign: "center" as const,
    backgroundColor: colors.bg.input, borderRadius: Radii.lg, paddingVertical: 12, paddingHorizontal: Spacing.md, ...soft(isDark).inset,
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      <View style={{
        paddingTop: insets.top + 8, paddingBottom: 12, paddingHorizontal: Spacing.lg,
        backgroundColor: colors.bg.secondary, flexDirection: "row", alignItems: "center", gap: Spacing.md, ...soft(isDark).raisedSm,
      }}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel={t("Назад", "Orqaga")}
          style={{ width: 36, height: 36, borderRadius: Radii.lg, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg.card, ...soft(isDark).raisedSm }}>
          <Feather name="arrow-left" size={18} color={colors.text.primary} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: Typography.fontExtraBold, fontSize: Typography.size.xxl, color: colors.text.primary }}>{t("Наличные", "Naqd pul")}</Text>
          <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.sm, color: colors.text.secondary, marginTop: 2 }}>
            {t("На руках, сдано в кассу, PIN", "Qo'lda, kassaga topshirilgan, PIN")}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: Spacing.lg, paddingBottom: insets.bottom + Spacing.xxl, gap: Spacing.lg }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand.primary} />}
        keyboardShouldPersistTaps="handled"
      >
        <QueryState query={q} what={t("наличные", "naqd pul")}>
          {m && (
            <>
              {/* ── На руках ─────────────────────────────────────────── */}
              <Card>
                <Text style={label}>{t("НА РУКАХ", "QO'LDA")}</Text>
                <Text style={{ fontFamily: Typography.fontExtraBold, fontSize: Typography.size.xxxl, color: over ? colors.status.danger : colors.text.primary, marginTop: 4 }} testID="cash-on-hand">
                  {formatMoney(m.onHand)}
                </Text>
                <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.sm, color: colors.text.secondary, marginTop: 6 }}>
                  {t(`Сдать в кассу до ${m.deadline}`, `Kassaga ${m.deadline} gacha topshiring`)}{over ? " · " + t("выше лимита", "limitdan yuqori") + " " + formatMoney(m.limit) : ""}
                </Text>
                <View style={{ flexDirection: "row", gap: Spacing.lg, marginTop: Spacing.md }}>
                  <View style={{ flex: 1 }}>
                    <Text style={label}>{t("ПРИНЯТО СЕГОДНЯ", "BUGUN QABUL")}</Text>
                    <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.lg, color: colors.text.primary }}>{formatMoney(m.todayIn)} <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.xs, color: colors.text.tertiary }}>({m.todayCount})</Text></Text>
                  </View>
                  {m.nonCashTransit.count > 0 && (
                    <View style={{ flex: 1 }}>
                      <Text style={label}>{t("ПЕРЕВОДЫ В ПУТИ", "O'TKAZMALAR YO'LDA")}</Text>
                      <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.lg, color: colors.status.warning }}>{formatMoney(m.nonCashTransit.total)} <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.xs, color: colors.text.tertiary }}>({m.nonCashTransit.count})</Text></Text>
                    </View>
                  )}
                </View>
                {m.debt > 0 && (
                  <View style={{ marginTop: Spacing.md, padding: Spacing.md, borderRadius: Radii.lg, backgroundColor: colors.status.dangerDim }}>
                    <Text style={{ fontFamily: Typography.fontSemibold, fontSize: Typography.size.sm, color: colors.status.danger }}>
                      {t("Долг по кассе (недостачи)", "Kassa bo'yicha qarz (kamomad)")}: {formatMoney(m.debt)}
                    </Text>
                    <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.xs, color: colors.text.secondary, marginTop: 2 }}>
                      {t("Удерживается из зарплаты. Спорно — к директору.", "Oylikdan ushlab qolinadi. Bahsli bo'lsa — direktorga.")}
                    </Text>
                  </View>
                )}
              </Card>

              {/* ── Сдачи ───────────────────────────────────────────────── */}
              <View>
                <Text style={{ ...label, marginBottom: Spacing.sm, paddingHorizontal: 2 }}>{t("СДАНО В КАССУ", "KASSAGA TOPSHIRILGAN")}</Text>
                {m.documents.length === 0 ? (
                  <EmptyState icon="inbox" title={t("Сдач пока не было", "Hali topshirilmagan")} description={t("Кассир примет наличные и подтвердит — запись появится здесь", "Kassir naqdni qabul qilib tasdiqlaydi — yozuv shu yerda chiqadi")} />
                ) : m.documents.map((d) => {
                  const disc = d.discrepancy != null ? Number(d.discrepancy) : 0;
                  return (
                    <Card key={d.id} style={{ marginBottom: Spacing.sm, padding: Spacing.lg }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: Spacing.md }}>
                        <View style={{ width: 36, height: 36, borderRadius: Radii.md, backgroundColor: disc < 0 ? colors.status.dangerDim : colors.status.successDim, alignItems: "center", justifyContent: "center" }}>
                          <Feather name={disc < 0 ? "alert-triangle" : "check"} size={16} color={disc < 0 ? colors.status.danger : colors.status.success} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.base, color: colors.text.primary }}>
                            {KIND[d.kind]}-{String(d.number).padStart(4, "0")} · {formatMoney(Number(d.amount))}
                          </Text>
                          <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.xs, color: colors.text.tertiary, marginTop: 2 }}>
                            {new Date(d.createdAt).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                            {disc !== 0 ? " · " + (disc < 0 ? t("недостача", "kamomad") : t("излишек", "ortiqcha")) + " " + formatMoney(Math.abs(disc)) : ""}
                            {d.note ? ` · ${d.note}` : ""}
                          </Text>
                        </View>
                      </View>
                    </Card>
                  );
                })}
              </View>

              {/* ── PIN ─────────────────────────────────────────────────── */}
              <Card>
                <Text style={label}>{t("PIN ДЛЯ СДАЧИ", "TOPSHIRISH PIN-I")}</Text>
                <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.sm, color: colors.text.secondary, marginTop: 4, marginBottom: Spacing.md }}>
                  {t("Вводится при сдаче наличных и при загрузке машины — это ваша подпись под суммой. Кассир PIN не знает.", "Naqd topshirishda va mashina yuklashda kiritiladi — bu summa ostidagi imzoingiz. Kassir PIN-ni bilmaydi.")}
                </Text>
                <View style={{ flexDirection: "row", gap: Spacing.sm }}>
                  <TextInput style={{ flex: 1, ...inputStyle }} value={pin} onChangeText={(v) => setPin(v.replace(/\D/g, "").slice(0, 6))} placeholder={t("PIN 4–6 цифр", "PIN 4–6 raqam")} placeholderTextColor={colors.text.muted} keyboardType="number-pad" secureTextEntry maxLength={6} testID="cash-pin" />
                  <TextInput style={{ flex: 1, ...inputStyle }} value={pin2} onChangeText={(v) => setPin2(v.replace(/\D/g, "").slice(0, 6))} placeholder={t("Ещё раз", "Yana bir bor")} placeholderTextColor={colors.text.muted} keyboardType="number-pad" secureTextEntry maxLength={6} testID="cash-pin-2" />
                </View>
                {pin.length >= 4 && pin2.length >= 4 && pin !== pin2 && (
                  <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.xs, color: colors.status.danger, marginTop: 6 }}>{t("PIN не совпадает", "PIN mos kelmadi")}</Text>
                )}
                <Button variant="primary" fullWidth style={{ marginTop: Spacing.md }} disabled={!pinOk} loading={savePin.isPending} onPress={() => savePin.mutate(pin)}>
                  {t("Сохранить PIN", "PIN-ni saqlash")}
                </Button>
              </Card>
            </>
          )}
        </QueryState>
      </ScrollView>
    </View>
  );
}
