import { View, Text, Switch } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Typography, Spacing, Radii, type ThemeColors } from "../theme";
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
export function BiometricRow({ colors }: { colors: ThemeColors; isDark?: boolean }) {
  const t = useT();
  const { capabilities, biometricEnabled, loading, enrollBiometric, disableBiometric } = useBiometricAuth();
  if (loading || !capabilities.hasHardware || !capabilities.isEnrolled) return null;

  const toggle = async (on: boolean) => {
    if (!on) { await disableBiometric(); return; }
    const ok = await enrollBiometric();
    if (!ok) notify.error(t("Не удалось подтвердить — биометрия не включена", "Tasdiqlab bo'lmadi — biometriya yoqilmadi"));
  };

  // Ряд внутри группы «Аккаунт»: своя линия сверху, потому что строки может и
  // не быть (нет датчика), а линия без строки — дыра в группе.
  return (
    <View>
      <View style={{ height: 1, backgroundColor: colors.border.subtle, marginLeft: 64 }} />
      <View style={{ flexDirection: "row", alignItems: "center", gap: Spacing.md, minHeight: 56, paddingHorizontal: Spacing.base, paddingVertical: 10 }}>
        <View style={{ width: 36, height: 36, borderRadius: Radii.full, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg.elevated }}>
          <Feather name="lock" size={18} color={colors.text.secondary} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontFamily: Typography.fontMedium, fontSize: Typography.size.base, color: colors.text.primary }}>
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
          trackColor={{ true: colors.accent.primary, false: colors.bg.input }}
        />
      </View>
    </View>
  );
}
