import { useCallback, useMemo, useState } from "react";
import { View, Text, FlatList, RefreshControl, ActivityIndicator, Pressable, Linking } from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeColors } from "../src/store/theme";
import { Typography, Spacing, Radii, Sizes } from "../src/theme";
import { Card, EmptyState, SearchInput } from "../src/components/ui";
import { getMyDebts, type MyDebt } from "../src/api";
import { formatMoney } from "../src/store/branding";
import { errorText } from "../src/lib/error-text";

/**
 * Долги по моим заказам.
 *
 * ── Зачем экран ─────────────────────────────────────────────────────────────
 *
 * Долг магазина агент видел только в карточке самого магазина — по одному, и
 * лишь если помнил, к кому зайти. Ручка, отвечающая на «кому идти собирать»
 * целиком (`agent.myDebts`), была написана и не вызывалась ниоткуда.
 *
 * Вопрос этот задают каждый день: агент планирует объезд, и деньги собирают
 * заодно с заказами. Без списка он либо обходит всех подряд, либо не собирает
 * вовсе.
 *
 * ── Почему по заказам, а не по магазинам ────────────────────────────────────
 *
 * Магазин может быть должен по трём заказам сразу, и разговор в точке идёт не
 * про «вы должны два миллиона», а про конкретную накладную: «за эту оплатили,
 * за ту нет». Сумма по магазину показана сверху группы — она нужна, чтобы
 * назвать её первой, — а платят по строкам.
 *
 * Порядок — от самых старых: чем дольше долг висит, тем хуже он собирается,
 * и вчерашняя отгрузка подождёт.
 */
export default function DebtsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  /*
    «Сейчас» берётся один раз при первой отрисовке, а не на каждой.

    Date.now() прямо в разметке делает отрисовку неповторяемой: один и тот же
    набор данных даёт разный результат, и React справедливо на это ругается.
    Для возраста долга, который меряется днями, момент открытия экрана — ровно
    та точность, что нужна.
  */
  const [now] = useState(() => Date.now());

  const q = useQuery({ queryKey: ["myDebts"], queryFn: getMyDebts, retry: false });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await q.refetch(); } finally { setRefreshing(false); }
  }, [q]);

  const rows = useMemo(() => {
    const all = q.data ?? [];
    const needle = search.trim().toLowerCase();
    if (!needle) return all;
    return all.filter(
      (d) => d.shopName.toLowerCase().includes(needle) || d.orderNumber.toLowerCase().includes(needle),
    );
  }, [q.data, search]);

  const total = rows.reduce((s, d) => s + Number(d.remaining ?? 0), 0);
  /*
    Магазинов, а не строк: «14 заказов» ничего не говорит об объезде, а «шесть
    точек» — это шесть остановок за день.
  */
  const shops = new Set(rows.map((d) => d.shopId)).size;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      <View style={{
        paddingTop: insets.top + 8, paddingBottom: 12, paddingHorizontal: Spacing.lg,
        backgroundColor: colors.bg.secondary, borderBottomWidth: 1, borderColor: colors.border.default,
        flexDirection: "row", alignItems: "center", gap: Spacing.md,
      }}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Назад"
          style={{ width: 36, height: 36, borderRadius: Radii.lg, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg.card }}
        >
          <Feather name="arrow-left" size={18} color={colors.text.primary} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: Typography.fontExtraBold, fontSize: 22, color: colors.text.primary }}>Мои долги</Text>
          <Text style={{ fontFamily: Typography.fontRegular, fontSize: 13, color: colors.text.secondary, marginTop: 2 }}>
            {q.isLoading ? "Считаем…" : `${formatMoney(total)} · ${shops} точек`}
          </Text>
        </View>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(d) => String(d.orderId)}
        contentContainerStyle={{ padding: Spacing.lg, paddingBottom: insets.bottom + Spacing.xxl, gap: Spacing.sm }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand.primary} />}
        ListHeaderComponent={
          (q.data?.length ?? 0) > 0 ? (
            <View style={{ marginBottom: Spacing.sm }}>
              <SearchInput value={search} onChangeText={setSearch} placeholder="Магазин или номер заказа" />
            </View>
          ) : null
        }
        ListEmptyComponent={
          q.isLoading ? (
            <ActivityIndicator color={colors.brand.primary} style={{ marginTop: Spacing.xxl }} />
          ) : q.isError ? (
            <EmptyState icon="alert-circle" title="Не удалось загрузить" description={errorText(q.error)} />
          ) : search.trim() ? (
            <EmptyState icon="search" title="Ничего не нашлось" description="Попробуйте другое название" />
          ) : (
            <EmptyState icon="check-circle" title="Долгов нет" description="По вашим заказам всё оплачено" />
          )
        }
        renderItem={({ item }) => <DebtRow debt={item} now={now} colors={colors} onOpen={() => router.push(`/order/${item.orderId}`)} />}
      />
    </View>
  );
}

function DebtRow({ debt, now, colors, onOpen }: {
  debt: MyDebt;
  /** «Сейчас» приходит сверху: см. разбор в DebtsScreen. */
  now: number;
  colors: ReturnType<typeof useThemeColors>;
  onOpen: () => void;
}) {
  const remaining = Number(debt.remaining ?? 0);
  const paid = Number(debt.paid ?? 0);
  const total = Number(debt.total ?? 0);
  const day = debt.createdAt ? new Date(debt.createdAt).toLocaleDateString("ru-RU") : "";
  /*
    Сколько дней висит. Возраст долга — единственное, что отличает «вчера
    отгрузили» от «забыли полгода назад», а по сумме они выглядят одинаково.
  */
  const days = debt.createdAt
    ? Math.max(0, Math.floor((now - new Date(debt.createdAt).getTime()) / 86_400_000))
    : 0;

  return (
    <Card onPress={onOpen}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: Spacing.md }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.base, color: colors.text.primary }}>
            {debt.shopName}
          </Text>
          <Text style={{ fontFamily: Typography.fontMono, fontSize: Typography.size.xs, color: colors.text.tertiary, marginTop: 2 }}>
            {debt.orderNumber} · {day}
            {days > 0 ? ` · ${days} дн.` : ""}
          </Text>
          {debt.shopAddress ? (
            <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.xs, color: colors.text.tertiary, marginTop: 2 }} numberOfLines={1}>
              {debt.shopAddress}
            </Text>
          ) : null}
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={{ fontFamily: Typography.fontExtraBold, fontSize: Typography.size.md, color: colors.status.danger }}>
            {formatMoney(remaining)}
          </Text>
          {/*
            Частично оплаченное отличается от неоплаченного: «внесли половину»
            — это другой разговор в точке, чем «не платили вовсе».
          */}
          {paid > 0 ? (
            <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.xs, color: colors.text.tertiary, marginTop: 2 }}>
              из {formatMoney(total)}
            </Text>
          ) : null}
        </View>
      </View>

      {debt.shopPhone ? (
        <Pressable
          onPress={() => Linking.openURL(`tel:${debt.shopPhone}`)}
          accessibilityRole="button"
          accessibilityLabel={`Позвонить в ${debt.shopName}`}
          style={{
            flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
            minHeight: Sizes.touchTarget, borderRadius: Radii.lg, marginTop: Spacing.md,
            backgroundColor: colors.bg.elevated,
          }}
        >
          <Feather name="phone" size={14} color={colors.text.secondary} />
          <Text style={{ fontFamily: Typography.fontSemibold, fontSize: Typography.size.sm, color: colors.text.secondary }}>
            {debt.shopPhone}
          </Text>
        </Pressable>
      ) : null}
    </Card>
  );
}
