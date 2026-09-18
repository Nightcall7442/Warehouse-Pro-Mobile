import { View, Text } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Typography, Spacing, type ThemeColors } from "../../theme";
import { Button } from "../ui";
import { useT } from "../../i18n";
import { useVisitQueue, type VisitAction } from "../../store/visit-queue";
import { isRejected } from "../../lib/plan-queue";

/** Строка под планом: «ждёт отправки» или причина отказа с «Повторить» / «Убрать». */
export function QueueNote({ action, colors }: { action: VisitAction; colors: ThemeColors }) {
  const t = useT();
  const retry = useVisitQueue(s => s.retry);
  const remove = useVisitQueue(s => s.remove);
  if (!isRejected(action)) {
    return (
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: Spacing.xs, paddingHorizontal: Spacing.sm }}>
        <Feather name="upload-cloud" size={12} color={colors.text.secondary} />
        <Text style={{ fontFamily: Typography.fontMedium, fontSize: Typography.size.xs, color: colors.text.secondary }}>
          {t("Отмечено · ждёт отправки", "Belgilandi · yuborishni kutmoqda")}
        </Text>
      </View>
    );
  }
  return (
    <View style={{ marginTop: Spacing.xs, paddingHorizontal: Spacing.sm, gap: Spacing.xs }}>
      <Text style={{ fontFamily: Typography.fontMedium, fontSize: Typography.size.xs, color: colors.status.danger }} numberOfLines={2}>
        {t("Отметка отклонена: ", "Belgi rad etildi: ")}{action.error}
      </Text>
      <View style={{ flexDirection: "row", gap: Spacing.sm }}>
        <Button size="sm" variant="secondary" icon="refresh-cw" onPress={() => { void retry(action.id); }}>{t("Повторить", "Qayta")}</Button>
        <Button size="sm" variant="secondary" icon="x" onPress={() => { void remove(action.id); }}>{t("Убрать", "Olib tashlash")}</Button>
      </View>
    </View>
  );
}
