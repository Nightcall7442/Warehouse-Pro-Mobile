import { useCallback, useMemo, useState } from "react";
import { View, Text, ScrollView, RefreshControl, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeColors, useThemeStore } from "../../src/store/theme";
import { Typography, Spacing, Radii, soft } from "../../src/theme";
import { Card, Button, EmptyState } from "../../src/components/ui";
import { QueryState } from "../../src/components/QueryState";
import { getMyVans, getVanStock, getVanSales } from "../../src/api";
import { formatMoney } from "../../src/store/branding";
import { formatQty } from "../../src/lib/units";
import { useT } from "../../src/i18n";

/**
 * Моя машина.
 *
 * Водитель видит, что у него в кузове и почём, продаёт с машины и видит
 * продажи за день. Загрузка и пересчёт — на складе, у кладовщика: водитель
 * лишь подтверждает PIN-ом то, что увёз. Здесь — рабочее место дня: что
 * есть, что продал, что осталось вернуть.
 */
export default function VanScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { isDark } = useThemeStore();
  const t = useT();
  const [refreshing, setRefreshing] = useState(false);

  const vans = useQuery({ queryKey: ["myVans"], queryFn: getMyVans, retry: false });
  const van = vans.data?.[0] ?? null;
  const stock = useQuery({ queryKey: ["vanStock", van?.id], queryFn: () => getVanStock(van!.id), enabled: !!van, retry: false });
  const range = useMemo(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0);
    return { from: d.toISOString(), to: new Date(d.getTime() + 86_400_000).toISOString() };
  }, []);
  const sales = useQuery({ queryKey: ["vanSales", van?.id, range.from], queryFn: () => getVanSales({ vanId: van!.id, ...range }), enabled: !!van, retry: false });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await Promise.all([vans.refetch(), stock.refetch(), sales.refetch()]); }
    finally { setRefreshing(false); }
  }, [vans, stock, sales]);

  const label = { fontFamily: Typography.fontSemibold, fontSize: Typography.size.xs, letterSpacing: 0.6, color: colors.text.tertiary };
  const soldToday = (sales.data ?? []).reduce((s, r) => s + Number(r.total), 0);

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
          <Text style={{ fontFamily: Typography.fontExtraBold, fontSize: Typography.size.xxl, color: colors.text.primary }}>{van ? van.name : t("Моя машина", "Mening mashinam")}</Text>
          <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.sm, color: colors.text.secondary, marginTop: 2 }}>
            {van?.plate ? `${van.plate} · ` : ""}{t("что в кузове и продажи за день", "kuzovdagi tovar va kunlik sotuvlar")}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: Spacing.lg, paddingBottom: insets.bottom + Spacing.xxl, gap: Spacing.lg }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand.primary} />}
      >
        <QueryState query={vans} what={t("машина", "mashina")}>
          {!van ? (
            <EmptyState icon="truck" title={t("Машина не назначена", "Mashina tayinlanmagan")} description={t("Директор назначает водителя в Настройки → Ван-селлинг", "Direktor Sozlamalar → Van-selling da haydovchi tayinlaydi")} />
          ) : (
            <>
              <Card>
                <View style={{ flexDirection: "row", gap: Spacing.lg }}>
                  <View style={{ flex: 1 }}>
                    <Text style={label}>{t("В КУЗОВЕ", "KUZOVDA")}</Text>
                    <Text style={{ fontFamily: Typography.fontExtraBold, fontSize: Typography.size.xxl, color: van.units > 0 ? colors.text.primary : colors.text.tertiary }} testID="van-value">{formatMoney(van.value)}</Text>
                    <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.xs, color: colors.text.tertiary }}>{van.units > 0 ? van.items + " " + t("поз.", "poz.") + " · " + formatQty(van.units) + " " + t("ед.", "dona") : t("пусто", "bo'sh")}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={label}>{t("ПРОДАНО СЕГОДНЯ", "BUGUN SOTILDI")}</Text>
                    <Text style={{ fontFamily: Typography.fontExtraBold, fontSize: Typography.size.xxl, color: soldToday > 0 ? colors.status.success : colors.text.tertiary }}>{formatMoney(soldToday)}</Text>
                    <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.xs, color: colors.text.tertiary }}>{(sales.data ?? []).length} {t("продаж", "sotuv")}</Text>
                  </View>
                </View>
                <Button variant="primary" fullWidth icon="shopping-bag" style={{ marginTop: Spacing.lg }} disabled={van.units <= 0} onPress={() => router.push({ pathname: "/van/sell", params: { vanId: String(van.id) } })}>
                  {t("Продать с машины", "Mashinadan sotish")}
                </Button>
              </Card>

              <View>
                <Text style={{ ...label, marginBottom: Spacing.sm, paddingHorizontal: 2 }}>{t("ЧТО В КУЗОВЕ", "KUZOVDA NIMA BOR")}</Text>
                <QueryState query={stock} what={t("остаток машины", "mashina qoldig'i")}>
                  {(stock.data ?? []).length === 0 ? (
                    <EmptyState icon="package" title={t("Машина пуста", "Mashina bo'sh")} description={t("Загрузку делает кладовщик; вы подтверждаете PIN-ом", "Yuklashni omborchi qiladi; siz PIN bilan tasdiqlaysiz")} />
                  ) : (stock.data ?? []).map((r) => (
                    <Card key={r.productId} style={{ marginBottom: Spacing.sm, padding: Spacing.lg }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: Spacing.md }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontFamily: Typography.fontSemibold, fontSize: Typography.size.base, color: colors.text.primary }}>{r.name}</Text>
                          <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.xs, color: colors.text.tertiary, marginTop: 2 }}>{formatMoney(r.unitPrice)}{r.sellable < r.onHand ? " · " + t("просрочено", "muddati o'tgan") + " " + formatQty(r.onHand - r.sellable) : ""}</Text>
                        </View>
                        <Text style={{ fontFamily: Typography.fontMono, fontSize: Typography.size.lg, color: colors.text.primary }}>{formatQty(r.onHand)}</Text>
                      </View>
                    </Card>
                  ))}
                </QueryState>
              </View>

              {(sales.data ?? []).length > 0 && (
                <View>
                  <Text style={{ ...label, marginBottom: Spacing.sm, paddingHorizontal: 2 }}>{t("ПРОДАЖИ СЕГОДНЯ", "BUGUNGI SOTUVLAR")}</Text>
                  {(sales.data ?? []).map((s) => (
                    <Card key={s.id} style={{ marginBottom: Spacing.sm, padding: Spacing.lg }} onPress={() => router.push({ pathname: "/van/receipt", params: { id: String(s.id) } })}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: Spacing.md }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontFamily: Typography.fontSemibold, fontSize: Typography.size.base, color: colors.text.primary }}>{s.orderNumber} · {s.shopName}</Text>
                          <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.xs, color: colors.text.tertiary, marginTop: 2 }}>
                            {s.deliveredAt ? new Date(s.deliveredAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) : ""} · {({ cash: t("наличные", "naqd"), card: t("карта", "karta"), transfer: t("перевод", "o'tkazma"), debt: t("в долг", "qarzga") } as Record<string, string>)[s.paymentMethod] ?? s.paymentMethod}
                          </Text>
                        </View>
                        <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.base, color: colors.text.primary }}>{formatMoney(Number(s.total))}</Text>
                        <Feather name="file-text" size={16} color={colors.text.tertiary} />
                      </View>
                    </Card>
                  ))}
                </View>
              )}
            </>
          )}
        </QueryState>
      </ScrollView>
    </View>
  );
}
