import { useMemo } from "react";
import { View, Text, ScrollView, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useThemeColors } from "../../store/theme";
import { Typography, Spacing, Radii, Sizes } from "../../theme";
import {
  dayChoices,
  TIME_CHOICES,
  combineLocal,
  splitLocal,
  formatPromise,
  promiseState,
} from "../../lib/promised-delivery";
import { useLang, useT } from "../../i18n";

/* ═══════════════════════════════════════════════════════════════════════════
   Обещанный срок доставки — выбор двумя рядами кнопок.

   ── Почему так, а не календарём ─────────────────────────────────────────────

   Календарь — это новая родная зависимость, а такое решение в проекте уже
   принималось однажды и в ту же сторону (lib/due-date.ts). И он здесь не
   нужен: агент не выбирает произвольное мгновение, он повторяет то, что
   сказал магазину вслух — «завтра утром», «в пятницу к обеду». Два касания
   большим пальцем против трёх с прицеливанием по колесу.

   ── Чего здесь нет ──────────────────────────────────────────────────────────

   Заранее выбранного дня. Пока агент не нажал сам, срока нет — и это законный
   ответ: «не обещали» и «обещали на сегодня» разные вещи, а подставленный
   срок стал бы его обещанием, которого он не давал, и срывом, которого не
   было.
   ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  /** Что стоит сейчас: ISO или null, если срок не называли. */
  value: string | null;
  /** Новый срок (ISO) или null — «снять обещание». */
  onChange: (v: string | null) => void;
  /** Статус заказа — чтобы сказать про просрочку. Пусто на оформлении. */
  status?: string;
  /** Когда довезли: без него «позже обещанного» не отличить от «вовремя». */
  deliveredAt?: string | null;
  /** Показывать ли ряды выбора. Закрытый заказ только показывает срок. */
  editable?: boolean;
  disabled?: boolean;
}

export function PromisedDelivery({
  value, onChange, status = "new", deliveredAt = null, editable = true, disabled = false,
}: Props) {
  const colors = useThemeColors();
  const t = useT();
  const lang = useLang();
  const days = useMemo(() => dayChoices(new Date(), 7, lang), [lang]);
  const picked = splitLocal(value);
  const state = promiseState(value, status, deliveredAt);

  const choose = (date: string, time: string) => {
    const made = combineLocal(date, time);
    if (made) onChange(made.toISOString());
  };

  const chip = (active: boolean) => ({
    minHeight: Sizes.touchTarget,
    justifyContent: "center" as const,
    paddingHorizontal: Spacing.md,
    borderRadius: Radii.lg,
    backgroundColor: active ? colors.brand.primary : colors.bg.elevated,
  });
  const chipText = (active: boolean) => ({
    fontFamily: active ? Typography.fontSemibold : Typography.fontRegular,
    fontSize: Typography.size.sm,
    color: active ? colors.brand.ink : colors.text.secondary,
  });

  return (
    <View style={{ gap: Spacing.sm }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Feather name="clock" size={14} color={colors.text.tertiary} />
        <Text style={{
          fontFamily: Typography.fontMedium, fontSize: Typography.size.xs,
          letterSpacing: 1.5, textTransform: "uppercase", color: colors.text.muted,
        }}>
          {t("Обещанный срок", "Va'da qilingan muddat")}
        </Text>
        {!value && (
          <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.xs, color: colors.text.tertiary }}>
            {t("необязательно", "ixtiyoriy")}
          </Text>
        )}
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", gap: Spacing.sm, flexWrap: "wrap" }}>
        <Text style={{ fontFamily: Typography.fontSemibold, fontSize: Typography.size.base, color: colors.text.primary }}>
          {formatPromise(value, new Date(), lang)}
        </Text>
        {state.kind === "late" && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Feather name="alert-triangle" size={12} color={colors.status.danger} />
            <Text style={{ fontFamily: Typography.fontMedium, fontSize: Typography.size.xs, color: colors.status.danger }}>
              {t("Просрочен", "Muddati o'tgan")}
            </Text>
          </View>
        )}
        {state.kind === "late_delivered" && (
          <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.xs, color: colors.text.tertiary }}>
            {t("Довезли позже обещанного", "Va'dadan kech yetkazildi")}
          </Text>
        )}
      </View>

      {editable && (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.sm, paddingVertical: 2 }}>
            {days.map(d => {
              const active = picked?.date === d.date;
              return (
                <Pressable
                  key={d.date}
                  disabled={disabled}
                  accessibilityRole="button"
                  accessibilityLabel={t(`День доставки: ${d.label}`, `Yetkazish kuni: ${d.label}`)}
                  // Времени ещё нет — берём первое из ряда, чтобы одно касание
                  // уже дало осмысленный срок, а не половину выбора.
                  onPress={() => choose(d.date, picked?.time ?? TIME_CHOICES[0])}
                  style={chip(active)}
                >
                  <Text style={chipText(active)}>{d.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.sm, paddingVertical: 2 }}>
            {TIME_CHOICES.map(tm => {
              const active = picked?.time === tm;
              return (
                <Pressable
                  key={tm}
                  disabled={disabled}
                  accessibilityRole="button"
                  accessibilityLabel={t(`Время доставки: ${tm}`, `Yetkazish vaqti: ${tm}`)}
                  // День ещё не выбран — значит «сегодня»: так это и говорят.
                  onPress={() => choose(picked?.date ?? days[0].date, tm)}
                  style={chip(active)}
                >
                  <Text style={chipText(active)}>{tm}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {value && (
            <Pressable
              disabled={disabled}
              accessibilityRole="button"
              accessibilityLabel={t("Убрать обещанный срок", "Va'da muddatini olib tashlash")}
              /*
                Снять обещание — отдельная возможность, а не «оставить пустым».
                Ошибочно поставленный срок иначе остаётся навсегда, и вместе с
                ним — посчитанная по нему просрочка.
              */
              onPress={() => onChange(null)}
              style={{ minHeight: Sizes.touchTarget, justifyContent: "center", alignSelf: "flex-start", paddingHorizontal: Spacing.sm }}
            >
              <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.sm, color: colors.text.tertiary }}>
                {t("Убрать срок", "Muddatni olib tashlash")}
              </Text>
            </Pressable>
          )}
        </>
      )}
    </View>
  );
}
