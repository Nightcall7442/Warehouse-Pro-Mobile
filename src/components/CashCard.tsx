import { View, Text } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useT } from "../i18n";
import { getMyCash } from "../api";
import { formatMoney } from "../store/branding";
import { Typography, Spacing, Radii, soft } from "../theme";
import { useThemeColors, useThemeStore } from "../store/theme";
import { FadeInItem } from "./Animated";

/*
  Карточка на главной для тех, кто носит деньги.

  «Наличные на руках» — сколько сдать офису и по скольким заказам. Считается
  по расчёту заказов (order.myCash): наличные, записанные в поле и ещё не
  принятые офисом. Ноль — карточки нет: сдавать нечего.
*/
export function CashCard({ delay = 150 }: { delay?: number }) {
  const t = useT();
  const colors = useThemeColors();
  const { isDark } = useThemeStore();
  const q = useQuery({ queryKey: ["myCash"], queryFn: getMyCash, retry: false, staleTime: 60_000 });
  const m = q.data;
  if (!m || m.amount <= 0) return null;
  return (
    <FadeInItem delay={delay}>
      <View style={{ backgroundColor: colors.bg.card, borderRadius: Radii.xl, padding: Spacing.lg, marginBottom: Spacing.lg, ...soft(isDark).raised, flexDirection: "row", alignItems: "center", gap: Spacing.md }} testID="home-cash-card">
        <View style={{ width: 40, height: 40, borderRadius: Radii.md, backgroundColor: colors.status.warningDim, alignItems: "center", justifyContent: "center" }}>
          <Feather name="dollar-sign" size={18} color={colors.status.warning} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: Typography.fontSemibold, fontSize: Typography.size.xs, letterSpacing: 0.6, color: colors.status.warning }}>{t("НАЛИЧНЫЕ НА РУКАХ", "QO'LDAGI NAQD PUL")}</Text>
          <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.md, color: colors.text.primary, marginTop: 2 }}>
            {formatMoney(m.amount)} · {m.orders} {t("зак.", "buy.")}
          </Text>
          <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.xs, color: colors.text.secondary, marginTop: 2 }}>{t("сдать в офис", "ofisga topshirish")}</Text>
        </View>
      </View>
    </FadeInItem>
  );
}
