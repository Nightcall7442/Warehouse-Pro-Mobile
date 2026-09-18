import { View, Text } from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useT } from "../i18n";
import { getMyCash } from "../api";
import { formatMoney } from "../store/branding";
import { Typography, Spacing, Radii, soft } from "../theme";
import { useThemeColors, useThemeStore } from "../store/theme";
import { FadeInItem, PressableScale } from "./Animated";

/*
  Карточка на главной для тех, кто носит деньги.

  «Наличные на руках» — сколько сдать и до какого часа; недостача красным.
  Показывается всегда: ноль — тоже ответ на вопрос «должен ли я что-то
  сдать».
*/
export function CashCard({ delay = 150 }: { delay?: number }) {
  const router = useRouter();
  const t = useT();
  const colors = useThemeColors();
  const { isDark } = useThemeStore();
  const q = useQuery({ queryKey: ["myCash"], queryFn: getMyCash, retry: false, staleTime: 60_000 });
  const m = q.data;
  if (!m) return null;
  const over = m.onHand > m.limit;
  const tone = m.debt > 0 || over ? colors.status.danger : colors.status.success;
  const dim = m.debt > 0 || over ? colors.status.dangerDim : colors.status.successDim;
  return (
    <FadeInItem delay={delay}>
      <PressableScale onPress={() => router.push("/cash")} haptic="light">
        <View style={{ backgroundColor: colors.bg.card, borderRadius: Radii.xl, padding: Spacing.lg, marginBottom: Spacing.lg, ...soft(isDark).raised, flexDirection: "row", alignItems: "center", gap: Spacing.md }} testID="home-cash-card">
          <View style={{ width: 40, height: 40, borderRadius: Radii.md, backgroundColor: dim, alignItems: "center", justifyContent: "center" }}>
            <Feather name="dollar-sign" size={18} color={tone} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: Typography.fontSemibold, fontSize: Typography.size.xs, letterSpacing: 0.6, color: tone }}>{t("НАЛИЧНЫЕ НА РУКАХ", "QO'LDAGI NAQD PUL")}</Text>
            <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.md, color: colors.text.primary, marginTop: 2 }}>
              {formatMoney(m.onHand)}{m.onHand > 0 ? " · " + t("сдать до", "topshirish") + " " + m.deadline : ""}
            </Text>
            {m.debt > 0 && <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.xs, color: colors.status.danger, marginTop: 2 }}>{t("недостача", "kamomad")} {formatMoney(m.debt)}</Text>}
          </View>
          <Feather name="chevron-right" size={16} color={colors.text.tertiary} />
        </View>
      </PressableScale>
    </FadeInItem>
  );
}
