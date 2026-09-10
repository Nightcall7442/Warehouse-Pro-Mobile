import { useCallback, useMemo, useState } from "react";
import { View, Text, FlatList, RefreshControl, ActivityIndicator, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeColors } from "../src/store/theme";
import { Typography, Spacing, Radii, Sizes } from "../src/theme";
import { EmptyState } from "../src/components/ui";
import {
  getNotifications, getNotificationCounts, markNotificationRead, markAllNotificationsRead,
  type AppNotification, type NotificationType,
} from "../src/api";
import { errorText } from "../src/lib/error-text";
import { notify } from "../src/store/toast";

/**
 * Уведомления.
 *
 * ── Зачем экран ─────────────────────────────────────────────────────────────
 *
 * Толчок на телефон — это сигнал, а не запись: пропустил его, смахнул с
 * экрана блокировки — и узнать было неоткуда. Список уведомлений в приложении
 * не показывался вовсе, хотя сервер их хранит: прочитанные месяц,
 * непрочитанные три.
 *
 * Особенно это било по зарплате. Выдали деньги, толчок пришёл, человек его не
 * увидел — и подтвердить получение ему уже нечем: до экрана зарплаты он
 * доходит сам, а напоминания нет.
 *
 * ── Почему отметка о прочтении по нажатию ───────────────────────────────────
 *
 * Не «пролистал — значит прочитал»: список пробегают глазами, и стирать этим
 * непрочитанное значит решить за человека, что он это видел. Нажал — открыл,
 * то есть точно прочитал.
 */

const TYPE_ICON: Record<NotificationType, keyof typeof Feather.glyphMap> = {
  order: "shopping-bag",
  payment: "dollar-sign",
  stock: "package",
  system: "info",
};

/** Куда ведёт уведомление в приложении. */
function routeFor(n: AppNotification): string | null {
  /*
    Ссылки приходят веб-адресами («/agent-kpi», «/orders/12»), а у приложения
    свои экраны — подставлять их напрямую нельзя: router.push("/agent-kpi")
    уведёт в никуда. Разбирается только то, чему на телефоне есть место.
  */
  const link = n.link ?? "";
  const order = link.match(/\/orders?\/(\d+)/);
  if (order) return `/order/${order[1]}`;
  if (link.includes("agent-kpi") || n.type === "payment") return "/salary";
  return null;
}

export default function NotificationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const qc = useQueryClient();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const listQ = useInfiniteQuery({
    queryKey: ["notifications", unreadOnly],
    queryFn: ({ pageParam }) => getNotifications({ unreadOnly, cursor: pageParam }),
    initialPageParam: undefined as number | undefined,
    /*
      Продолжение — по идентификатору САМОЙ СТАРОЙ показанной записи, как и
      ждёт сервер. По времени нельзя: уведомление всей смене пишется одной
      пачкой с одинаковым createdAt, и на границе страницы запись терялась бы.
    */
    getNextPageParam: (last) => (last.hasMore ? last.items[last.items.length - 1]?.id : undefined),
    retry: false,
  });

  const countsQ = useQuery({
    queryKey: ["notificationCounts"],
    queryFn: getNotificationCounts,
    retry: false,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["notifications"] });
    qc.invalidateQueries({ queryKey: ["notificationCounts"] });
  };

  const markOne = useMutation({
    mutationFn: (id: number) => markNotificationRead(id),
    onSuccess: invalidate,
    // Молча: человек нажал, чтобы открыть уведомление, а не чтобы отметить
    // его прочитанным — жаловаться ему тут не на что.
    onError: () => {},
  });

  const markAll = useMutation({
    mutationFn: () => markAllNotificationsRead(),
    onSuccess: () => { invalidate(); notify.success("Всё прочитано"); },
    onError: (e) => notify.error(errorText(e)),
  });

  const items = useMemo(
    () => (listQ.data?.pages ?? []).flatMap((p) => p.items),
    [listQ.data],
  );
  const unread = countsQ.data?.unread ?? 0;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await Promise.all([listQ.refetch(), countsQ.refetch()]); }
    finally { setRefreshing(false); }
  }, [listQ, countsQ]);

  const open = (n: AppNotification) => {
    if (!n.isRead) markOne.mutate(n.id);
    const to = routeFor(n);
    if (to) router.push(to);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      {/* ── Шапка ────────────────────────────────────────────────────── */}
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
          <Text style={{ fontFamily: Typography.fontExtraBold, fontSize: 22, color: colors.text.primary }}>Уведомления</Text>
          <Text style={{ fontFamily: Typography.fontRegular, fontSize: 13, color: colors.text.secondary, marginTop: 2 }}>
            {unread > 0 ? `${unread} непрочитанных` : "Всё прочитано"}
          </Text>
        </View>
        {unread > 0 && (
          <Pressable
            onPress={() => markAll.mutate()}
            disabled={markAll.isPending}
            accessibilityRole="button"
            accessibilityLabel="Отметить всё прочитанным"
            hitSlop={8}
            style={{
              minHeight: Sizes.touchTarget, paddingHorizontal: Spacing.md, borderRadius: Radii.lg,
              alignItems: "center", justifyContent: "center", backgroundColor: colors.bg.card,
              opacity: markAll.isPending ? 0.5 : 1,
            }}
          >
            {markAll.isPending
              ? <ActivityIndicator size="small" color={colors.text.secondary} />
              : <Feather name="check-square" size={17} color={colors.text.secondary} />}
          </Pressable>
        )}
      </View>

      {/* ── Только непрочитанные ─────────────────────────────────────── */}
      <View style={{ flexDirection: "row", gap: Spacing.sm, paddingHorizontal: Spacing.lg, paddingTop: Spacing.md }}>
        {[
          { key: false, label: "Все" },
          { key: true, label: unread > 0 ? `Непрочитанные · ${unread}` : "Непрочитанные" },
        ].map((tab) => {
          const active = unreadOnly === tab.key;
          return (
            <Pressable
              key={String(tab.key)}
              onPress={() => setUnreadOnly(tab.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={{
                flex: 1, minHeight: Sizes.touchTarget, borderRadius: Radii.lg,
                alignItems: "center", justifyContent: "center",
                backgroundColor: active ? colors.brand.primary : colors.bg.card,
              }}
            >
              <Text style={{
                fontFamily: Typography.fontSemibold, fontSize: Typography.size.sm,
                color: active ? "#fff" : colors.text.secondary,
              }}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <FlatList
        data={items}
        keyExtractor={(n) => String(n.id)}
        contentContainerStyle={{ padding: Spacing.lg, paddingBottom: insets.bottom + Spacing.xxl, gap: Spacing.sm }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand.primary} />}
        onEndReachedThreshold={0.4}
        onEndReached={() => { if (listQ.hasNextPage && !listQ.isFetchingNextPage) listQ.fetchNextPage(); }}
        ListEmptyComponent={
          listQ.isLoading ? (
            <ActivityIndicator color={colors.brand.primary} style={{ marginTop: Spacing.xxl }} />
          ) : listQ.isError ? (
            <EmptyState icon="alert-circle" title="Не удалось загрузить" description={errorText(listQ.error)} />
          ) : (
            <EmptyState
              icon="bell"
              title={unreadOnly ? "Непрочитанных нет" : "Уведомлений нет"}
              description={unreadOnly ? "Всё, что приходило, вы уже открыли" : "Здесь появятся заказы, оплаты и остатки"}
            />
          )
        }
        ListFooterComponent={
          listQ.isFetchingNextPage
            ? <ActivityIndicator color={colors.brand.primary} style={{ marginVertical: Spacing.lg }} />
            : null
        }
        renderItem={({ item }) => <Row n={item} colors={colors} onPress={() => open(item)} />}
      />
    </View>
  );
}

function Row({ n, colors, onPress }: {
  n: AppNotification;
  colors: ReturnType<typeof useThemeColors>;
  onPress: () => void;
}) {
  const day = n.createdAt ? new Date(n.createdAt).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={{
        flexDirection: "row", gap: Spacing.md, alignItems: "flex-start",
        padding: Spacing.lg, borderRadius: Radii.xxl,
        /*
          Непрочитанное выделяется подложкой, а не точкой сбоку: точку в
          списке из тридцати строк не видно, а разница между «уже смотрел» и
          «ещё нет» — единственное, ради чего сюда заходят.
        */
        backgroundColor: n.isRead ? colors.bg.card : colors.brand.primaryDim,
      }}
    >
      <View style={{
        width: 34, height: 34, borderRadius: Radii.lg, alignItems: "center", justifyContent: "center",
        backgroundColor: colors.bg.elevated,
      }}>
        <Feather name={TYPE_ICON[n.type] ?? "info"} size={16} color={n.isRead ? colors.text.tertiary : colors.brand.primary} />
      </View>

      <View style={{ flex: 1 }}>
        <Text style={{
          fontFamily: n.isRead ? Typography.fontMedium : Typography.fontBold,
          fontSize: Typography.size.base, color: colors.text.primary,
        }}>
          {n.title}
        </Text>
        {n.message ? (
          <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.sm, color: colors.text.secondary, marginTop: 2 }}>
            {n.message}
          </Text>
        ) : null}
        <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.xs, color: colors.text.tertiary, marginTop: 4 }}>
          {day}
        </Text>
      </View>
    </Pressable>
  );
}
