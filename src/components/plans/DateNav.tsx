import { useMemo } from "react";
import { View, Text } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Typography, Spacing, Radii, ThemeColors } from "../../theme";
import { PressableScale } from "../Animated";

export function DateNav({
  date,
  isToday: _isToday,
  colors,
  onPrev,
  onNext,
}: {
  date: Date;
  isToday: boolean;
  colors: ThemeColors;
  onPrev: () => void;
  onNext: () => void;
}) {
  const days = useMemo(() => {
    const result = [];
    for (let i = -2; i <= 2; i++) {
      const d = new Date(date.getTime() + i * 86_400_000);
      const isCurrent = i === 0;
      result.push({ date: d, isCurrent, label: d.toLocaleDateString("ru", { weekday: "short" }), dayNum: d.getDate() });
    }
    return result;
  }, [date]);

  return (
    <View style={{ backgroundColor: colors.bg.card, borderRadius: Radii.xl, padding: Spacing.md, borderWidth: 1, borderColor: colors.border.default }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: Spacing.sm }}>
        <PressableScale onPress={onPrev} haptic="light">
          <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.bg.elevated, alignItems: "center", justifyContent: "center" }}>
            <Feather name="chevron-left" size={16} color={colors.text.primary} />
          </View>
        </PressableScale>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={{ fontFamily: Typography.fontSemibold, fontSize: Typography.size.base, color: colors.text.primary, textTransform: "capitalize" }}>
            {date.toLocaleDateString("ru", { weekday: "long" })}
          </Text>
          <Text style={{ fontFamily: Typography.fontMedium, fontSize: Typography.size.xs, color: colors.text.tertiary, marginTop: 2 }}>
            {date.toLocaleDateString("ru", { day: "numeric", month: "long", year: "numeric" })}
          </Text>
        </View>
        <PressableScale onPress={onNext} haptic="light">
          <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.bg.elevated, alignItems: "center", justifyContent: "center" }}>
            <Feather name="chevron-right" size={16} color={colors.text.primary} />
          </View>
        </PressableScale>
      </View>
      {/* Timeline dots */}
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: Spacing.xs }}>
        {days.map((d, i) => (
          <PressableScale key={i} onPress={() => {
            const diff = d.date.getTime() - date.getTime();
            if (diff !== 0) {
              const fn = diff > 0 ? onNext : onPrev;
              for (let j = 0; j < Math.abs(Math.round(diff / 86_400_000)); j++) fn();
            }
          }} haptic="light" style={{ alignItems: "center", gap: 4 }}>
            <View style={{
              width: d.isCurrent ? 36 : 28,
              height: d.isCurrent ? 36 : 28,
              borderRadius: d.isCurrent ? 18 : 14,
              backgroundColor: d.isCurrent ? colors.brand.primary : "transparent",
              borderWidth: d.isCurrent ? 0 : 1.5,
              borderColor: d.isCurrent ? "transparent" : colors.border.default,
              alignItems: "center",
              justifyContent: "center",
            }}>
              <Text style={{
                fontFamily: d.isCurrent ? Typography.fontBold : Typography.fontMedium,
                fontSize: d.isCurrent ? Typography.size.base : Typography.size.xs,
                color: d.isCurrent ? "#fff" : colors.text.secondary,
              }}>
                {d.dayNum}
              </Text>
            </View>
            <Text style={{
              fontFamily: Typography.fontMedium,
              fontSize: 9,
              color: d.isCurrent ? colors.accent.primary : colors.text.muted,
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}>
              {d.label}
            </Text>
          </PressableScale>
        ))}
      </View>
    </View>
  );
}
