import { useCallback, useState } from "react";
import { View, Text, Linking } from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Location from "expo-location";
import { useFocusEffect } from "expo-router";
import { Typography, Spacing, Radii, type ThemeColors } from "../../theme";
import { PressableScale } from "../Animated";
import { useT } from "../../i18n";

/**
 * «Геолокация выключена» над списком планов.
 *
 * Без разрешения на геолокацию визиты отмечаются, но ни одна точка не уходит:
 * на карте у начальника агента нет, а проверка на подлог видит «нет GPS» и
 * записывает визиты в подозрительные — с вычетом из зарплаты. Агент об этом
 * не узнавал никак: отметка проходила молча. Одна строка с дорогой в
 * настройки; читается разрешение, не запрашивается — запрос поверх списка
 * планов выглядит как сбой, его место на вкладке «GPS».
 */
export function GpsOffHint({ colors }: { colors: ThemeColors }) {
  const t = useT();
  const [off, setOff] = useState(false);
  useFocusEffect(useCallback(() => {
    let alive = true;
    Location.getForegroundPermissionsAsync()
      .then(({ status }) => { if (alive) setOff(status !== "granted"); })
      .catch(() => {});
    return () => { alive = false; };
  }, []));
  if (!off) return null;
  return (
    <PressableScale onPress={() => { void Linking.openSettings?.(); }} haptic="light">
      <View style={{ flexDirection: "row", alignItems: "center", gap: Spacing.sm, backgroundColor: colors.status.warningDim, borderRadius: Radii.lg, padding: Spacing.md, marginBottom: Spacing.md }}>
        <Feather name="map-pin" size={16} color={colors.status.warning} />
        <Text style={{ flex: 1, fontFamily: Typography.fontMedium, fontSize: Typography.size.sm, color: colors.text.primary }}>
          {t("Геолокация выключена — визиты не подтверждаются координатами. Нажмите, чтобы разрешить.", "Geolokatsiya o'chiq — tashriflar koordinatalar bilan tasdiqlanmaydi. Ruxsat berish uchun bosing.")}
        </Text>
        <Feather name="chevron-right" size={16} color={colors.text.secondary} />
      </View>
    </PressableScale>
  );
}
