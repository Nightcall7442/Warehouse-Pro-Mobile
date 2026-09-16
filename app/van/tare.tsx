import { useMemo, useState } from "react";
import { View, Text, ScrollView, Pressable, TextInput, KeyboardAvoidingView, Platform } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useThemeColors, useThemeStore } from "../../src/store/theme";
import { Typography, Spacing, Radii, soft } from "../../src/theme";
import { Card, Button, SearchInput, EmptyState } from "../../src/components/ui";
import { QueryState } from "../../src/components/QueryState";
import { getVanShops, getShopTare, returnTareFromShop, type ShopTareLine } from "../../src/api";
import { formatMoney } from "../../src/store/branding";
import { formatQty } from "../../src/lib/units";
import { errorText } from "../../src/lib/error-text";
import { notify } from "../../src/store/toast";
import { useT } from "../../src/i18n";

/**
 * Приём пустой тары от магазина — на свою машину.
 *
 * Магазин → сколько чего вернул → «Принять». Сколько у магазина числится,
 * говорит сервер: больше принять нельзя, и кнопка «+» дальше не пустит.
 * Тара уходит с магазина и ложится в кузов; на складе её примут пересчётом
 * машины вместе с товаром. Залог показан, чтобы водитель видел цену вопроса.
 */
export default function VanTareScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { isDark } = useThemeStore();
  const t = useT();
  const qc = useQueryClient();
  const { vanId: vanIdParam } = useLocalSearchParams<{ vanId: string }>();
  const vanId = Number(vanIdParam);

  const [shopSearch, setShopSearch] = useState("");
  const [shopId, setShopId] = useState<number | null>(null);
  const [qty, setQty] = useState<Record<number, number>>({});
  const [note, setNote] = useState("");

  const shops = useQuery({ queryKey: ["vanShops", shopSearch.trim()], queryFn: () => getVanShops(shopSearch.trim() || undefined), retry: false });
  const shop = (shops.data ?? []).find((s) => s.id === shopId) ?? null;
  const held = useQuery({ queryKey: ["shopTare", shopId], queryFn: () => getShopTare(shopId!), enabled: !!shopId, retry: false });

  const items = useMemo(() => (held.data ?? []).filter((h) => (qty[h.tareTypeId] ?? 0) > 0).map((h) => ({ tareTypeId: h.tareTypeId, quantity: qty[h.tareTypeId] })), [held.data, qty]);
  const units = items.reduce((s, i) => s + i.quantity, 0);
  const deposit = (held.data ?? []).reduce((s, h) => s + (qty[h.tareTypeId] ?? 0) * h.depositPrice, 0);
  const set = (h: ShopTareLine, n: number) => setQty((q) => ({ ...q, [h.tareTypeId]: Math.max(0, Math.min(h.qty, n)) }));

  const ret = useMutation({
    mutationFn: () => returnTareFromShop({ shopId: shopId!, warehouseId: vanId, items, note: note.trim() || undefined }),
    onSuccess: (r) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      notify.success(t("Принято тары: ", "Idish qabul qilindi: ") + formatQty(r.units));
      qc.invalidateQueries({ queryKey: ["tareOverview"] }); qc.invalidateQueries({ queryKey: ["shopTare"] });
      router.back();
    },
    onError: (e) => notify.error(errorText(e)),
  });

  const label = { fontFamily: Typography.fontSemibold, fontSize: Typography.size.xs, letterSpacing: 0.6, color: colors.text.tertiary, marginBottom: Spacing.sm, paddingHorizontal: 2 };
  const canSubmit = !!shopId && items.length > 0 && !ret.isPending && Number.isFinite(vanId) && vanId > 0;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      <View style={{
        paddingTop: insets.top + 8, paddingBottom: 12, paddingHorizontal: Spacing.lg,
        backgroundColor: colors.bg.secondary, flexDirection: "row", alignItems: "center", gap: Spacing.md, ...soft(isDark).raisedSm,
      }}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel={t("Назад", "Orqaga")}
          style={{ width: 36, height: 36, borderRadius: Radii.lg, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg.card, ...soft(isDark).raisedSm }}>
          <Feather name="arrow-left" size={18} color={colors.text.primary} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: Typography.fontExtraBold, fontSize: Typography.size.xxl, color: colors.text.primary }}>{t("Принять тару", "Idish qabul qilish")}</Text>
          <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.sm, color: colors.text.secondary, marginTop: 2 }}>{t("Пустая тара от магазина — в кузов", "Do'kondan bo'sh idish — kuzovga")}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: Spacing.lg, paddingBottom: insets.bottom + 120, gap: Spacing.lg }} keyboardShouldPersistTaps="handled">
        {/* ── Магазин ────────────────────────────────────────────────── */}
        <View>
          <Text style={label}>{t("МАГАЗИН", "DO'KON")}</Text>
          {shop ? (
            <Card variant="accent" style={{ padding: Spacing.lg }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: Spacing.md }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.md, color: colors.text.primary }}>{shop.name}</Text>
                  {!!shop.address && <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.xs, color: colors.text.tertiary, marginTop: 2 }}>{shop.address}</Text>}
                </View>
                <Pressable onPress={() => { setShopId(null); setQty({}); }} hitSlop={10} accessibilityRole="button"><Text style={{ fontFamily: Typography.fontSemibold, fontSize: Typography.size.sm, color: colors.brand.primaryLight }}>{t("Сменить", "Almashtirish")}</Text></Pressable>
              </View>
            </Card>
          ) : (
            <>
              <SearchInput value={shopSearch} onChangeText={setShopSearch} placeholder={t("Название магазина или владелец", "Do'kon nomi yoki egasi")} />
              <QueryState query={shops} what={t("магазины", "do'konlar")}>
                <View style={{ marginTop: Spacing.sm }}>
                  {(shops.data ?? []).slice(0, 8).map((s) => (
                    <Card key={s.id} style={{ marginBottom: Spacing.sm, padding: Spacing.md }} onPress={() => { setShopId(s.id); Haptics.selectionAsync().catch(() => {}); }}>
                      <Text style={{ fontFamily: Typography.fontSemibold, fontSize: Typography.size.base, color: colors.text.primary }}>{s.name}</Text>
                      {(s.ownerName || s.address) && <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.xs, color: colors.text.tertiary, marginTop: 2 }}>{[s.ownerName, s.address].filter(Boolean).join(" · ")}</Text>}
                    </Card>
                  ))}
                  {(shops.data ?? []).length === 0 && <EmptyState icon="search" title={t("Ничего не найдено", "Hech narsa topilmadi")} />}
                </View>
              </QueryState>
            </>
          )}
        </View>

        {/* ── Что у магазина ─────────────────────────────────────────── */}
        {shop && (
          <View>
            <Text style={label}>{t("ЧИСЛИТСЯ ЗА МАГАЗИНОМ", "DO'KON HISOBIDA")}</Text>
            <QueryState query={held} what={t("тара магазина", "do'kon idishi")}>
              {(held.data ?? []).length === 0 ? (
                <EmptyState icon="box" title={t("Тары за магазином не числится", "Do'kon hisobida idish yo'q")} description={t("Принимать нечего", "Qabul qiladigan narsa yo'q")} />
              ) : (held.data ?? []).map((h) => {
                const n = qty[h.tareTypeId] ?? 0;
                return (
                  <Card key={h.tareTypeId} variant={n > 0 ? "accent" : "default"} style={{ marginBottom: Spacing.sm, padding: Spacing.md }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: Spacing.sm }}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text numberOfLines={2} style={{ fontFamily: n > 0 ? Typography.fontBold : Typography.fontSemibold, fontSize: Typography.size.base, color: colors.text.primary }}>{h.name}</Text>
                        <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.xs, color: colors.text.tertiary, marginTop: 2 }}>
                          {t("у магазина", "do'konda") + " " + formatQty(h.qty) + (h.depositPrice > 0 ? " · " + t("залог", "garov") + " " + formatMoney(h.depositPrice) : "")}
                        </Text>
                      </View>
                      <Pressable onPress={() => set(h, n - 1)} disabled={n <= 0} accessibilityRole="button" accessibilityLabel={t("Меньше", "Kamroq")} hitSlop={6}
                        style={{ width: 36, height: 36, borderRadius: Radii.md, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg.card, opacity: n <= 0 ? 0.4 : 1, ...soft(isDark).raisedSm }}>
                        <Feather name="minus" size={16} color={colors.text.primary} />
                      </Pressable>
                      <TextInput value={n === 0 ? "" : String(n)} placeholder="0" placeholderTextColor={colors.text.muted} keyboardType="number-pad" accessibilityLabel={h.name} testID={`van-tare-qty-${h.tareTypeId}`}
                        onChangeText={(v) => set(h, Number(v.replace(/\D/g, "")) || 0)}
                        style={{ width: 56, height: 36, textAlign: "center", fontFamily: Typography.fontMono, fontSize: Typography.size.md, color: colors.text.primary, backgroundColor: colors.bg.input, borderRadius: Radii.md, ...soft(isDark).insetSm }} />
                      <Pressable onPress={() => set(h, n + 1)} disabled={n >= h.qty} accessibilityRole="button" accessibilityLabel={t("Больше", "Ko'proq")} hitSlop={6}
                        style={{ width: 36, height: 36, borderRadius: Radii.md, alignItems: "center", justifyContent: "center", backgroundColor: colors.brand.primary, opacity: n >= h.qty ? 0.4 : 1, ...soft(isDark).raisedSm }}>
                        <Feather name="plus" size={16} color={colors.brand.ink} />
                      </Pressable>
                    </View>
                  </Card>
                );
              })}
            </QueryState>
            <TextInput value={note} onChangeText={setNote} placeholder={t("Примечание (необязательно)", "Izoh (ixtiyoriy)")} placeholderTextColor={colors.text.muted} maxLength={200}
              style={{ marginTop: Spacing.sm, fontFamily: Typography.fontRegular, fontSize: Typography.size.base, color: colors.text.primary, backgroundColor: colors.bg.input, borderRadius: Radii.lg, paddingVertical: 10, paddingHorizontal: Spacing.md, ...soft(isDark).inset }} />
          </View>
        )}
      </ScrollView>

      {/* ── Итог и кнопка — всегда под рукой ─────────────────────────── */}
      <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: Spacing.lg, paddingBottom: insets.bottom + Spacing.md, backgroundColor: colors.bg.secondary, ...soft(isDark).raisedLg }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: Spacing.sm }}>
          <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.sm, color: colors.text.secondary }}>{formatQty(units) + " " + t("ед. тары", "dona idish")}</Text>
          {deposit > 0 && <Text style={{ fontFamily: Typography.fontExtraBold, fontSize: Typography.size.xl, color: colors.text.primary }} testID="van-tare-deposit">{formatMoney(deposit)}</Text>}
        </View>
        <Button variant="primary" fullWidth icon="check" disabled={!canSubmit} loading={ret.isPending} onPress={() => ret.mutate()} testID="van-tare-submit">
          {t("Принять в кузов", "Kuzovga qabul qilish")}
        </Button>
      </View>
    </KeyboardAvoidingView>
  );
}
