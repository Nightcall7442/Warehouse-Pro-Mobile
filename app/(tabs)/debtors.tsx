import { useCallback, useMemo, useRef, useState } from "react";
import { View, Text, FlatList, RefreshControl, ActivityIndicator, Pressable, ScrollView, Linking } from "react-native";
import { useScrollTopOnFocus } from "../../src/hooks/useScrollTopOnFocus";
import { useScrollTopOnChange } from "../../src/hooks/useScrollTopOnChange";

import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeColors } from "../../src/store/theme";
import { Typography, Spacing, Radii, Sizes } from "../../src/theme";
import { Card, EmptyState, SearchInput } from "../../src/components/ui";
import { getReceivablesAging, type ShopAging, type AgeBucket } from "../../src/api";
import { formatMoney } from "../../src/store/branding";
import { errorText } from "../../src/lib/error-text";
import { BUCKETS, bucketOf, sortDebtors, debtorTotals } from "../../src/lib/debtors";
import { useT, useLang } from "../../src/i18n";

/**
 * Задолженности магазинов — экран супервайзера.
 *
 * ── На какой вопрос отвечает ────────────────────────────────────────────────
 *
 * Не «сколько нам должны» — это одно число, и оно есть на главной. А «К КОМУ
 * ЕХАТЬ СЕГОДНЯ». Поэтому сверху не итог, а разбивка по возрасту: миллион
 * недельного долга и миллион полугодового — это две разные ситуации, и
 * решение принимается именно из различия.
 *
 * ── Почему список по умолчанию от самых старых ──────────────────────────────
 *
 * Чем дольше долг висит, тем хуже он собирается. Отсортируй по сумме — сверху
 * окажется крупный магазин, который платит исправно и просто много берёт, а
 * полугодовой долг маленькой точки уедет вниз и не будет виден никогда.
 * Сортировка по сумме есть, но вторым нажатием.
 *
 * ── Почему в строке телефон и агент ─────────────────────────────────────────
 *
 * Долг закрывается звонком. Список без номера — это список для чтения: увидел
 * «47 дней», и пошёл искать телефон в другом экране. Агент — чтобы знать, с
 * кого спрашивать: магазин числится за ним, и ехать туда ему.
 */
export default function DebtorsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const t = useT();
  const lang = useLang();

  const [search, setSearch] = useState("");
  const [bucket, setBucket] = useState<AgeBucket | null>(null);
  const [byAmount, setByAmount] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const listRef = useRef<FlatList>(null);
  useScrollTopOnFocus(listRef);
  useScrollTopOnChange(listRef, [search, bucket, byAmount]);

  const q = useQuery({ queryKey: ["receivablesAging"], queryFn: getReceivablesAging, retry: false });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await q.refetch(); } finally { setRefreshing(false); }
  }, [q]);

  const rows = useMemo(
    () => sortDebtors(q.data?.shops ?? [], { search, bucket, byAmount }),
    [q.data, search, bucket, byAmount],
  );

  const totals = useMemo(() => debtorTotals(q.data), [q.data]);

  const bucketColor = (b: AgeBucket): string => ({
    d0_7:    colors.status.success,
    d8_30:   colors.status.warning,
    d31_60:  colors.status.danger,
    d60plus: colors.status.danger,
  })[b];

  const renderRow = ({ item }: { item: ShopAging }) => {
    const b = bucketOf(item.oldestDays);
    return (
      <Card style={{ marginBottom: Spacing.sm }}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: Spacing.md }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              numberOfLines={1}
              style={{ fontFamily: Typography.fontSemibold, fontSize: Typography.size.base, color: colors.text.primary }}
            >
              {item.shopName}
            </Text>
            <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.xs, color: colors.text.tertiary, marginTop: 2 }}>
              {item.agentName ?? t("агент не назначен", "agent biriktirilmagan")}
            </Text>

            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 }}>
              {item.oldestDays === null ? (
                /*
                  Возраст неизвестен — это не ноль дней. Так выглядит долг,
                  начисленный руками, без заказа: состарить его нечем, и
                  писать «0 дней» значило бы показать его самым свежим.
                */
                <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.xs, color: colors.text.tertiary }}>
                  {t("без привязки к заказу", "buyurtmaga bog'lanmagan")}
                </Text>
              ) : (
                <>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: bucketColor(b) }} />
                  <Text style={{ fontFamily: Typography.fontMedium, fontSize: Typography.size.xs, color: bucketColor(b) }}>
                    {t(`висит ${item.oldestDays} ${item.oldestDays === 1 ? "день" : item.oldestDays < 5 ? "дня" : "дней"}`, `${item.oldestDays} kundan beri turibdi`)}
                  </Text>
                </>
              )}
            </View>
          </View>

          <View style={{ alignItems: "flex-end", gap: 8 }}>
            <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.base, color: colors.text.primary }}>
              {formatMoney(item.debt)}
            </Text>
            {item.phone ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t(`Позвонить: ${item.shopName}`, `Qo'ng'iroq: ${item.shopName}`)}
                onPress={() => Linking.openURL(`tel:${item.phone}`)}
                style={{
                  minHeight: Sizes.touchTarget, minWidth: Sizes.touchTarget,
                  alignItems: "center", justifyContent: "center",
                  borderRadius: Radii.lg, backgroundColor: colors.brand.primaryDim,
                  paddingHorizontal: Spacing.md,
                }}
              >
                <Feather name="phone" size={16} color={colors.brand.primary} />
              </Pressable>
            ) : (
              <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.xs, color: colors.text.tertiary }}>
                {t("нет телефона", "telefon yo'q")}
              </Text>
            )}
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t(`Открыть магазин: ${item.shopName}`, `Do'konni ochish: ${item.shopName}`)}
          onPress={() => router.push(`/shop/${item.shopId}`)}
          style={{ minHeight: Sizes.touchTarget, justifyContent: "center", marginTop: 4 }}
        >
          <Text style={{ fontFamily: Typography.fontMedium, fontSize: Typography.size.sm, color: colors.brand.primary }}>
            {t("Открыть магазин →", "Do'konni ochish →")}
          </Text>
        </Pressable>
      </Card>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.primary, paddingTop: insets.top + Spacing.md }}>
      <View style={{ paddingHorizontal: Spacing.base }}>
        <Text style={{ fontFamily: Typography.fontExtraBold, fontSize: Typography.size.xxl, color: colors.text.primary }}>
          {t("Долги магазинов", "Do'konlar qarzi")}
        </Text>

        {/* ── Итог и возраст ────────────────────────────────────────────── */}
        <Card style={{ marginTop: Spacing.md }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
            <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.xl, color: colors.text.primary }}>
              {formatMoney(totals.totalDebt)}
            </Text>
            <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.sm, color: colors.text.tertiary }}>
              {t(`${totals.debtorCount} магазинов`, `${totals.debtorCount} ta do'kon`)}
            </Text>
          </View>

          {totals.overdue > 0 && (
            <Text style={{ fontFamily: Typography.fontMedium, fontSize: Typography.size.sm, color: colors.status.danger, marginTop: 4 }}>
              {t("старше месяца", "bir oydan eski")}: {formatMoney(totals.overdue)}
            </Text>
          )}

          {/*
            Не привязанное к заказу показывается отдельной строкой, а не
            прячется в сумме. Корзины плюс оно дают ровно долг магазинов;
            отчёт, части которого не сходятся с итогом, хуже отсутствующего.
            И само по себе это признак ручных правок, за которыми стоит
            присмотреть.
          */}
          {totals.unattributed > 0 && (
            <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.xs, color: colors.text.tertiary, marginTop: 4 }}>
              {t("без привязки к заказу", "buyurtmaga bog'lanmagan")}: {formatMoney(totals.unattributed)}
            </Text>
          )}
        </Card>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: Spacing.sm, paddingVertical: Spacing.md }}
        >
          {BUCKETS.map(b => {
            const active = bucket === b.key;
            const sum = totals.buckets[b.key] ?? 0;
            const label = lang === "uz" ? b.uz : b.ru;
            return (
              <Pressable
                key={b.key}
                accessibilityRole="button"
                accessibilityLabel={t(`Возраст долга: ${label}`, `Qarz muddati: ${label}`)}
                onPress={() => setBucket(active ? null : b.key)}
                style={{
                  minHeight: Sizes.touchTarget, justifyContent: "center",
                  paddingHorizontal: Spacing.md, borderRadius: Radii.lg,
                  backgroundColor: active ? colors.brand.primary : colors.bg.elevated,
                }}
              >
                <Text style={{
                  fontFamily: active ? Typography.fontSemibold : Typography.fontRegular,
                  fontSize: Typography.size.xs,
                  color: active ? "#fff" : colors.text.secondary,
                }}>
                  {label}
                </Text>
                <Text style={{
                  fontFamily: Typography.fontMedium, fontSize: Typography.size.xs,
                  color: active ? "#fff" : colors.text.primary,
                }}>
                  {formatMoney(sum)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={{ flexDirection: "row", alignItems: "center", gap: Spacing.sm, marginBottom: Spacing.sm }}>
          <View style={{ flex: 1 }}>
            <SearchInput value={search} onChangeText={setSearch} placeholder={t("Магазин или агент", "Do'kon yoki agent")} />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={byAmount ? t("Сортировать по возрасту", "Muddat bo'yicha saralash") : t("Сортировать по сумме", "Summa bo'yicha saralash")}
            onPress={() => setByAmount(v => !v)}
            style={{
              minHeight: Sizes.touchTarget, minWidth: Sizes.touchTarget,
              alignItems: "center", justifyContent: "center",
              borderRadius: Radii.lg, backgroundColor: colors.bg.elevated, paddingHorizontal: Spacing.md,
            }}
          >
            <Feather name={byAmount ? "dollar-sign" : "clock"} size={16} color={colors.text.secondary} />
          </Pressable>
        </View>
      </View>

      {q.isLoading ? (
        <ActivityIndicator color={colors.brand.primary} style={{ marginTop: Spacing.xl }} />
      ) : q.isError ? (
        <EmptyState icon="alert-circle" title={t("Не загрузилось", "Yuklanmadi")} description={errorText(q.error)} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon="check-circle"
          title={q.data?.shops.length ? t("Ничего не найдено", "Hech narsa topilmadi") : t("Долгов нет", "Qarz yo'q")}
          description={q.data?.shops.length ? t("Измените поиск или срок", "Qidiruv yoki muddatni o'zgartiring") : t("Ни за одним магазином долга не числится", "Hech bir do'konda qarz yo'q")}
        />
      ) : (
        <FlatList
          ref={listRef}
          data={rows}
          keyExtractor={(r) => String(r.shopId)}
          renderItem={renderRow}
          contentContainerStyle={{ paddingHorizontal: Spacing.base, paddingBottom: insets.bottom + 100 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand.primary} />}
        />
      )}
    </View>
  );
}
