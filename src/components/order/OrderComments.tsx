import { useState } from "react";
import { View, Text, TextInput, ActivityIndicator, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useThemeColors } from "../../store/theme";
import { Typography, Spacing, Radii, Sizes } from "../../theme";
import { Card } from "../ui";
import { getOrderComments, addOrderComment, type OrderComment } from "../../api";
import { errorText } from "../../lib/error-text";
import { notify } from "../../store/toast";
import * as Haptics from "expo-haptics";

/**
 * Переписка по заказу.
 *
 * ── Зачем ───────────────────────────────────────────────────────────────────
 *
 * Обе ручки (`order.listComments`, `order.addComment`) открыты агенту и не
 * вызывались из приложения ниоткуда: переписка велась в вебе, а агент,
 * которого она касается, её не видел и ответить не мог.
 *
 * Спрашивают здесь ровно то, что не помещается в поля заказа: «магазин просит
 * заменить позицию», «приеду после обеда», «оплатили наличными, чек у меня».
 * Без этого такие вещи уходят в личные сообщения и пропадают вместе с ними.
 *
 * ── Почему ответы показаны, а отвечать нечем ────────────────────────────────
 *
 * Сервер хранит дерево: у комментария может быть родитель. Ветку читать надо —
 * иначе ответ выглядит новым сообщением ни о чём. А вот отвечать ИМЕННО в
 * ветку на телефоне незачем: переписка по одному заказу — это несколько строк,
 * и вложенность там лишняя. Появится длинная — станет видно, и тогда это будет
 * решение, а не догадка.
 */
export function OrderComments({ orderId }: { orderId: number }) {
  const colors = useThemeColors();
  const qc = useQueryClient();
  const [draft, setDraft] = useState("");

  const q = useQuery({
    queryKey: ["orderComments", orderId],
    queryFn: () => getOrderComments(orderId),
    retry: false,
  });

  const add = useMutation({
    mutationFn: (content: string) => addOrderComment(orderId, content),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setDraft("");
      qc.invalidateQueries({ queryKey: ["orderComments", orderId] });
    },
    onError: (e) => notify.error(errorText(e)),
  });

  /*
    Дерево разворачивается в плоский список с отступом.

    Сервер отдаёт корни с вложенными `replies`, и рисовать их рекурсией на
    телефоне незачем: глубина здесь один-два уровня, а рекурсивный компонент
    ради этого пришлось бы объяснять каждому, кто сюда заглянет.
  */
  const flat: Array<{ c: OrderComment; depth: number }> = [];
  const walk = (nodes: OrderComment[], depth: number) => {
    for (const c of nodes) {
      flat.push({ c, depth });
      if (c.replies?.length) walk(c.replies, depth + 1);
    }
  };
  walk(q.data ?? [], 0);

  const canSend = draft.trim().length > 0 && !add.isPending;

  return (
    <Card style={{ marginTop: Spacing.md }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: Spacing.md }}>
        <Feather name="message-square" size={15} color={colors.text.tertiary} />
        <Text style={{
          fontFamily: Typography.fontMedium, fontSize: Typography.size.xs,
          letterSpacing: 1.5, textTransform: "uppercase", color: colors.text.muted,
        }}>
          Переписка
        </Text>
      </View>

      {q.isLoading ? (
        <ActivityIndicator color={colors.brand.primary} />
      ) : q.isError ? (
        <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.sm, color: colors.text.tertiary }}>
          {errorText(q.error)}
        </Text>
      ) : flat.length === 0 ? (
        <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.sm, color: colors.text.tertiary }}>
          Пока ничего не писали
        </Text>
      ) : (
        <View style={{ gap: Spacing.md }}>
          {flat.map(({ c, depth }) => (
            <View key={c.id} style={{ paddingLeft: depth * Spacing.lg }}>
              <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
                <Text style={{ fontFamily: Typography.fontSemibold, fontSize: Typography.size.sm, color: colors.text.primary }}>
                  {c.userName ?? "Сотрудник"}
                </Text>
                <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.xs, color: colors.text.tertiary }}>
                  {c.createdAt ? new Date(c.createdAt).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : ""}
                </Text>
              </View>
              <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.sm, color: colors.text.secondary, marginTop: 2 }}>
                {c.content}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* ── Написать ─────────────────────────────────────────────────── */}
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: Spacing.sm, marginTop: Spacing.lg }}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Написать по заказу…"
          placeholderTextColor={colors.text.tertiary}
          multiline
          /*
            Столько же, сколько принимает сервер. Обрезать молча нельзя: человек
            дописал бы длинное сообщение и потерял хвост, не узнав об этом.
          */
          maxLength={2000}
          style={{
            flex: 1, minHeight: Sizes.touchTarget, maxHeight: 120,
            paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
            borderRadius: Radii.lg, backgroundColor: colors.bg.elevated,
            fontFamily: Typography.fontRegular, fontSize: Typography.size.sm, color: colors.text.primary,
          }}
        />
        <Pressable
          onPress={() => add.mutate(draft.trim())}
          disabled={!canSend}
          accessibilityRole="button"
          accessibilityLabel="Отправить сообщение"
          style={{
            width: Sizes.touchTarget, height: Sizes.touchTarget, borderRadius: Radii.lg,
            alignItems: "center", justifyContent: "center",
            backgroundColor: colors.brand.primary, opacity: canSend ? 1 : 0.4,
          }}
        >
          {add.isPending
            ? <ActivityIndicator size="small" color="#fff" />
            : <Feather name="send" size={16} color="#fff" />}
        </Pressable>
      </View>
    </Card>
  );
}
