// Warehouse Pro — объявления платформы на главной
/*
  Владелец платформы пишет объявление в консоли (веб #154): «в субботу ночью
  обновление», «появилась новая накладная». На вебе оно стоит полосой вверху
  приложения организации; агенты и курьеры веб не открывают — до них оно не
  доходило вовсе. Здесь — та же полоса карточкой на главной, у каждой роли.

  ── Что решает сервер, а что экран ───────────────────────────────────────────

  Кому, с какого дня и до какого — решает сервер (announcement.active): он
  отдаёт только начавшиеся, не истёкшие, адресованные этой организации и не
  закрытые этим человеком. Срока телефону не присылают, и выдумывать его
  здесь не из чего. Экран берёт из ответа ровно то, что там есть: заголовок,
  текст, уровень (info / warning), узбекский перевод.

  ── Без связи ──────────────────────────────────────────────────────────────

  Последний запрос не прошёл — карточек нет. Ни ошибки, ни копии с диска:
  объявление — не работа агента, и показать вчерашнее «завтра обновление»
  после того, как его сняли, хуже, чем промолчать до связи.

  ── Закрытие ───────────────────────────────────────────────────────────────

  Нажал крестик — карточки нет сразу, не дожидаясь ответа. Закрытие уходит на
  сервер (announcement.dismiss); не дошло (пропала связь) — карточка всё равно
  спрятана, а когда сервер снова пришлёт это объявление, закрытие уйдёт ещё
  раз. Хук мутации react-query здесь не нужен: ответ ничего не меняет на
  экране, а потерянный ответ мутации из эффекта уже ловили (StrictMode).
*/
import React, { useCallback, useEffect, useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { getActiveAnnouncements, dismissAnnouncement } from "../api";
import { useAuthStore } from "../store/auth";
import { useThemeColors, useThemeStore } from "../store/theme";
import { Typography, Spacing, Radii, soft } from "../theme";
import { useT, useLang } from "../i18n";
import { localizedAnnouncement } from "../lib/announcement-text";

/** Больше трёх подряд — уже не объявление, а лента; как на вебе. */
const MAX_ANNOUNCEMENTS = 3;

export function Announcements() {
  const user = useAuthStore(s => s.user);
  const colors = useThemeColors();
  const { isDark } = useThemeStore();
  const t = useT();
  const lang = useLang();
  // У суперадмина своя консоль, и это его же сообщения — сервер ему отдаёт пусто.
  const enabled = !!user && (user.role as string) !== "superadmin";

  const q = useQuery({
    // Человек в ключе: на общем телефоне закрытое одним не должно прятаться у другого.
    queryKey: ["announcements", user?.id ?? 0],
    queryFn: getActiveAnnouncements,
    enabled,
    retry: false,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });

  const [closed, setClosed] = useState<ReadonlySet<number>>(() => new Set());
  // Закрытые, чьё закрытие до сервера не дошло.
  const [unsent, setUnsent] = useState<ReadonlySet<number>>(() => new Set());

  const send = useCallback((id: number) => {
    dismissAnnouncement(id).then(
      () => setUnsent(s => { if (!s.has(id)) return s; const next = new Set(s); next.delete(id); return next; }),
      // Тот же набор — тот же объект: повтор не перерисовывает и не зацикливается.
      () => setUnsent(s => (s.has(id) ? s : new Set(s).add(id))),
    );
  }, []);

  // Сервер снова прислал закрытое — закрытие не дошло: отправляем ещё раз.
  useEffect(() => {
    for (const a of q.data ?? []) if (unsent.has(a.id)) send(a.id);
  }, [q.data, unsent, send]);

  if (!enabled || q.isError) return null;
  const shown = (q.data ?? []).filter(a => !closed.has(a.id)).slice(0, MAX_ANNOUNCEMENTS);
  if (shown.length === 0) return null;

  const close = (id: number) => {
    setClosed(prev => new Set(prev).add(id));
    send(id);
  };

  return (
    <View testID="announcements" style={{ gap: Spacing.sm, marginBottom: Spacing.base }}>
      {shown.map(a => {
        const warning = a.level === "warning";
        const text = localizedAnnouncement(a, lang);
        return (
          <View key={a.id} testID={`announcement-${a.id}`} accessibilityRole="summary"
            style={{ flexDirection: "row", alignItems: "flex-start", gap: Spacing.md, backgroundColor: colors.bg.card, borderRadius: Radii.xl, paddingVertical: Spacing.md, paddingLeft: Spacing.md, paddingRight: 4, ...soft(isDark).raisedSm }}>
            <View testID={`announcement-icon-${a.id}`} style={{ width: 36, height: 36, borderRadius: Radii.md, marginTop: 2, alignItems: "center", justifyContent: "center", backgroundColor: warning ? colors.status.warningDim : colors.status.infoDim }}>
              <Feather name={warning ? "alert-triangle" : "info"} size={18} color={warning ? colors.status.warning : colors.status.info} />
            </View>
            <View style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
              <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.sm, color: colors.text.primary, lineHeight: 19 }}>{text.title}</Text>
              <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.sm, color: colors.text.secondary, lineHeight: 19, marginTop: 2 }}>{text.body}</Text>
            </View>
            <TouchableOpacity testID={`announcement-close-${a.id}`} onPress={() => close(a.id)} accessibilityRole="button" accessibilityLabel={t("Закрыть объявление", "E'lonni yopish")}
              style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
              <Feather name="x" size={18} color={colors.text.tertiary} />
            </TouchableOpacity>
          </View>
        );
      })}
    </View>
  );
}
