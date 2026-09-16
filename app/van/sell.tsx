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
import { getVanStock, getVanShops, vanSale, type VanStockLine } from "../../src/api";
import { formatMoney } from "../../src/store/branding";
import { formatQty } from "../../src/lib/units";
import { errorText } from "../../src/lib/error-text";
import { notify } from "../../src/store/toast";
import { useT } from "../../src/i18n";

/**
 * Продажа с машины.
 *
 * Не мастер заказа: в кузове товаров немного, и они все на одном экране.
 * Магазин → количество по строкам → чем заплатили → «Продать». Заказ рождается
 * доставленным, товар уходит с машины, деньги ложатся на руки водителю (или
 * «в путь», если перевод). После — чек: показать, отправить, распечатать.
 *
 * Ключ идемпотентности рождается вместе с экраном: повтор нажатия при плохой
 * связи не продаст дважды.
 */
type Method = "cash" | "card" | "transfer" | "debt";

export default function VanSellScreen() {
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
  const [method, setMethod] = useState<Method>("cash");
  const [paid, setPaid] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [key] = useState(() => `van-${vanId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);

  const stock = useQuery({ queryKey: ["vanStock", vanId], queryFn: () => getVanStock(vanId), enabled: Number.isFinite(vanId) && vanId > 0, retry: false });
  const shops = useQuery({ queryKey: ["vanShops", shopSearch.trim()], queryFn: () => getVanShops(shopSearch.trim() || undefined), retry: false });
  const shop = (shops.data ?? []).find((s) => s.id === shopId) ?? null;

  const lines = useMemo(() => (stock.data ?? []).filter((r) => (qty[r.productId] ?? 0) > 0), [stock.data, qty]);
  const total = lines.reduce((s, r) => s + r.unitPrice * (qty[r.productId] ?? 0), 0);
  const paidValue = paid == null ? (method === "debt" ? 0 : total) : Number(paid) || 0;
  const set = (r: VanStockLine, n: number) => setQty((q) => ({ ...q, [r.productId]: Math.max(0, Math.min(r.sellable, n)) }));

  const sale = useMutation({
    mutationFn: () => vanSale({
      vanId, shopId: shopId!, items: lines.map((r) => ({ productId: r.productId, quantity: String(qty[r.productId]) })),
      paymentMethod: method, paidAmount: paidValue, notes: notes.trim() || undefined, idempotencyKey: key,
    }),
    onSuccess: (r) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      notify.success(t(`Продано: ${r.orderNumber} на ${formatMoney(r.total)}`, `Sotildi: ${r.orderNumber}, ${formatMoney(r.total)}`));
      qc.invalidateQueries({ queryKey: ["vanStock"] }); qc.invalidateQueries({ queryKey: ["myVans"] });
      qc.invalidateQueries({ queryKey: ["vanSales"] }); qc.invalidateQueries({ queryKey: ["myCash"] }); qc.invalidateQueries({ queryKey: ["myOrders"] });
      router.replace({ pathname: "/van/receipt", params: { id: String(r.id), fresh: "1" } });
    },
    onError: (e) => notify.error(errorText(e)),
  });

  const label = { fontFamily: Typography.fontSemibold, fontSize: Typography.size.xs, letterSpacing: 0.6, color: colors.text.tertiary, marginBottom: Spacing.sm, paddingHorizontal: 2 };
  const METHODS: Array<[Method, string]> = [["cash", t("Наличные", "Naqd")], ["card", t("Карта", "Karta")], ["transfer", t("Перевод", "O'tkazma")], ["debt", t("В долг", "Qarzga")]];
  const canSubmit = !!shopId && lines.length > 0 && !sale.isPending && (method === "debt" || paidValue > 0);

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
          <Text style={{ fontFamily: Typography.fontExtraBold, fontSize: Typography.size.xxl, color: colors.text.primary }}>{t("Продажа с машины", "Mashinadan sotuv")}</Text>
          <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.sm, color: colors.text.secondary, marginTop: 2 }}>{t("Заказ родится доставленным, товар уйдёт с машины", "Buyurtma yetkazilgan holda tug'iladi, tovar mashinadan chiqadi")}</Text>
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
                  {Number(shop.debt) > 0 && <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.xs, color: colors.status.warning, marginTop: 2 }}>{t("долг", "qarz")} {formatMoney(Number(shop.debt))}</Text>}
                </View>
                <Pressable onPress={() => setShopId(null)} hitSlop={10} accessibilityRole="button"><Text style={{ fontFamily: Typography.fontSemibold, fontSize: Typography.size.sm, color: colors.brand.primaryLight }}>{t("Сменить", "Almashtirish")}</Text></Pressable>
              </View>
            </Card>
          ) : (
            <>
              <SearchInput value={shopSearch} onChangeText={setShopSearch} placeholder={t("Название магазина или владелец", "Do'kon nomi yoki egasi")} />
              <QueryState query={shops} what={t("магазины", "do'konlar")}>
                <View style={{ marginTop: Spacing.sm }}>
                  {(shops.data ?? []).slice(0, 8).map((s) => (
                    <Card key={s.id} style={{ marginBottom: Spacing.sm, padding: Spacing.md }} onPress={() => { setShopId(s.id); Haptics.selectionAsync().catch(() => {}); }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: Spacing.md }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontFamily: Typography.fontSemibold, fontSize: Typography.size.base, color: colors.text.primary }}>{s.name}</Text>
                          {(s.ownerName || s.address) && <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.xs, color: colors.text.tertiary, marginTop: 2 }}>{[s.ownerName, s.address].filter(Boolean).join(" · ")}</Text>}
                        </View>
                        {Number(s.debt) > 0 && <Text style={{ fontFamily: Typography.fontMono, fontSize: Typography.size.xs, color: colors.status.warning }}>{formatMoney(Number(s.debt))}</Text>}
                      </View>
                    </Card>
                  ))}
                  {(shops.data ?? []).length === 0 && <EmptyState icon="search" title={t("Ничего не найдено", "Hech narsa topilmadi")} />}
                </View>
              </QueryState>
            </>
          )}
        </View>

        {/* ── В кузове ───────────────────────────────────────────────── */}
        <View>
          <Text style={label}>{t("В КУЗОВЕ", "KUZOVDA")}</Text>
          <QueryState query={stock} what={t("остаток машины", "mashina qoldig'i")}>
            {(stock.data ?? []).length === 0 ? (
              <EmptyState icon="package" title={t("Машина пуста", "Mashina bo'sh")} />
            ) : (stock.data ?? []).map((r) => {
              const n = qty[r.productId] ?? 0;
              return (
                <Card key={r.productId} variant={n > 0 ? "accent" : "default"} style={{ marginBottom: Spacing.sm, padding: Spacing.md }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: Spacing.sm }}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={2} style={{ fontFamily: n > 0 ? Typography.fontBold : Typography.fontSemibold, fontSize: Typography.size.base, color: colors.text.primary }}>{r.name}</Text>
                      <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.xs, color: colors.text.tertiary, marginTop: 2 }}>{formatMoney(r.unitPrice)} · {t("в кузове", "kuzovda")} {formatQty(r.sellable)}</Text>
                    </View>
                    <Pressable onPress={() => set(r, n - 1)} disabled={n <= 0} accessibilityRole="button" accessibilityLabel={t("Меньше", "Kamroq")} hitSlop={6}
                      style={{ width: 36, height: 36, borderRadius: Radii.md, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg.card, opacity: n <= 0 ? 0.4 : 1, ...soft(isDark).raisedSm }}>
                      <Feather name="minus" size={16} color={colors.text.primary} />
                    </Pressable>
                    <TextInput value={n === 0 ? "" : String(n)} placeholder="0" placeholderTextColor={colors.text.muted} keyboardType="number-pad" accessibilityLabel={r.name} testID={`van-sale-qty-${r.productId}`}
                      onChangeText={(v) => set(r, Number(v.replace(/\D/g, "")) || 0)}
                      style={{ width: 56, height: 36, textAlign: "center", fontFamily: Typography.fontMono, fontSize: Typography.size.md, color: colors.text.primary, backgroundColor: colors.bg.input, borderRadius: Radii.md, ...soft(isDark).insetSm }} />
                    <Pressable onPress={() => set(r, n + 1)} disabled={n >= r.sellable} accessibilityRole="button" accessibilityLabel={t("Больше", "Ko'proq")} hitSlop={6}
                      style={{ width: 36, height: 36, borderRadius: Radii.md, alignItems: "center", justifyContent: "center", backgroundColor: colors.brand.primary, opacity: n >= r.sellable ? 0.4 : 1, ...soft(isDark).raisedSm }}>
                      <Feather name="plus" size={16} color={colors.brand.ink} />
                    </Pressable>
                  </View>
                  {n > 0 && <Text style={{ fontFamily: Typography.fontMono, fontSize: Typography.size.sm, color: colors.text.secondary, marginTop: 6, textAlign: "right" }}>{formatQty(n)} × {formatMoney(r.unitPrice)} = {formatMoney(n * r.unitPrice)}</Text>}
                </Card>
              );
            })}
          </QueryState>
        </View>

        {/* ── Оплата ─────────────────────────────────────────────────── */}
        <View>
          <Text style={label}>{t("ОПЛАТА", "TO'LOV")}</Text>
          <Card>
            <View style={{ flexDirection: "row", gap: Spacing.sm, flexWrap: "wrap" }}>
              {METHODS.map(([k, name]) => {
                const active = method === k;
                return (
                  <Pressable key={k} onPress={() => { setMethod(k); setPaid(null); }} accessibilityRole="button" accessibilityState={{ selected: active }} testID={`van-sale-method-${k}`}
                    style={{ flexGrow: 1, paddingVertical: 10, paddingHorizontal: Spacing.md, borderRadius: Radii.lg, alignItems: "center", backgroundColor: active ? colors.brand.primary : colors.bg.card, ...(active ? soft(isDark).inset : soft(isDark).raisedSm) }}>
                    <Text style={{ fontFamily: Typography.fontSemibold, fontSize: Typography.size.sm, color: active ? colors.brand.ink : colors.text.secondary }}>{name}</Text>
                  </Pressable>
                );
              })}
            </View>
            {method !== "debt" && (
              <View style={{ marginTop: Spacing.md }}>
                <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.xs, color: colors.text.tertiary, marginBottom: 4 }}>{t("Заплатил сейчас", "Hozir to'ladi")}</Text>
                <TextInput value={paid ?? (total ? String(Math.round(total)) : "")} onChangeText={(v) => setPaid(v.replace(/[^\d]/g, ""))} keyboardType="number-pad" placeholder="0" placeholderTextColor={colors.text.muted} testID="van-sale-paid"
                  style={{ fontFamily: Typography.fontMono, fontSize: Typography.size.lg, color: colors.text.primary, backgroundColor: colors.bg.input, borderRadius: Radii.lg, paddingVertical: 10, paddingHorizontal: Spacing.md, ...soft(isDark).inset }} />
                {paidValue < total && <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.xs, color: colors.status.warning, marginTop: 6 }}>{t("остаток", "qoldiq")} {formatMoney(total - paidValue)} — {t("в долг магазина", "do'kon qarziga")}</Text>}
              </View>
            )}
            <TextInput value={notes} onChangeText={setNotes} placeholder={t("Примечание (необязательно)", "Izoh (ixtiyoriy)")} placeholderTextColor={colors.text.muted} maxLength={300}
              style={{ marginTop: Spacing.md, fontFamily: Typography.fontRegular, fontSize: Typography.size.base, color: colors.text.primary, backgroundColor: colors.bg.input, borderRadius: Radii.lg, paddingVertical: 10, paddingHorizontal: Spacing.md, ...soft(isDark).inset }} />
          </Card>
        </View>
      </ScrollView>

      {/* ── Итог и кнопка — всегда под рукой ─────────────────────────── */}
      <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: Spacing.lg, paddingBottom: insets.bottom + Spacing.md, backgroundColor: colors.bg.secondary, ...soft(isDark).raisedLg }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: Spacing.sm }}>
          <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.sm, color: colors.text.secondary }}>{lines.length} {t("поз.", "poz.")}</Text>
          <Text style={{ fontFamily: Typography.fontExtraBold, fontSize: Typography.size.xl, color: colors.text.primary }} testID="van-sale-total">{formatMoney(total)}</Text>
        </View>
        <Button variant="primary" fullWidth icon="check" disabled={!canSubmit} loading={sale.isPending} onPress={() => sale.mutate()}>
          {t("Продать", "Sotish")}
        </Button>
      </View>
    </KeyboardAvoidingView>
  );
}
