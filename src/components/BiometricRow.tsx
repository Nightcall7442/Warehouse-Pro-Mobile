import { View, Text, Switch } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Typography, Spacing, Radii, soft, type ThemeColors } from "../theme";
import { Card } from "./ui";
import { useT } from "../i18n";
import { useBiometricAuth } from "../hooks/useBiometricAuth";
import { notify } from "../store/toast";

/**
 * Переключатель «Вход по отпечатку и блокировка».
 *
 * Вход по отпечатку, экран блокировки и автоблокировка через пять минут были
 * написаны и покрыты тестами — и недостижимы: enrollBiometric не вызывался
 * нигде, кнопка отпечатка на входе показывалась только при включённом флаге,
 * а включить его было негде. Телефон с долгами клиентов и ценами лежал на
 * прилавке разблокированным. Показывается только там, где есть датчик и
 * заведён хотя бы один отпечаток/лицо.
 */
export function BiometricRow({ colors, isDark }: { colors: ThemeColors; isDark: boolean }) {
  const t = useT();
  const { capabilities, biometricEnabled, loading, enrollBiometric, disableBiometric } = useBiometricAuth();
  if (loading || !capabilities.hasHardware || !capabilities.isEnrolled) return null;

  const toggle = async (on: boolean) => {
    if (!on) { await disableBiometric(); return; }
    const ok = await enrollBiometric();
    if (!ok) notify.error(t("Не удалось подтвердить — биометрия не включена", "Tasdiqlab bo'lmadi — biometriya yoqilmadi"));
  };

  return (
    <Card style={{ padding: Spacing.xl, marginTop: Spacing.base }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: Spacing.md }}>
        <View style={{ width: 40, height: 40, borderRadius: Radii.lg, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg.elevated, ...soft(isDark).inset }}>
          <Feather name="lock" size={18} color={colors.accent.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: Typography.fontSemibold, fontSize: Typography.size.base, color: colors.text.primary }}>
            {t("Вход по отпечатку / Face ID", "Barmoq izi / Face ID bilan kirish")}
          </Text>
          <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.xs, color: colors.text.secondary, marginTop: 2 }}>
            {t("И блокировка экрана через 5 минут без действий", "Va 5 daqiqa harakatsizlikdan keyin ekran qulfi")}
          </Text>
        </View>
        <Switch
          value={biometricEnabled}
          onValueChange={(v) => { void toggle(v); }}
          accessibilityLabel={t("Вход по отпечатку", "Barmoq izi bilan kirish")}
          trackColor={{ true: colors.accent.primary, false: colors.bg.elevated }}
        />
      </View>
    </Card>
  );
}
