import { View, Text } from "react-native";
import { Feather } from "@expo/vector-icons";
import type { Plan } from "../../api";
import { Typography, Spacing, Radii, Shadows, ThemeColors } from "../../theme";
import { PressableScale } from "../Animated";
import { Button } from "../ui";
import { getStatusMeta } from "./PlanHelpers";

export function PlanRow({
  plan,
  showAgent,
  showCity,
  colors,
  isDark,
  onPress,
  onVisit,
  onSkip,
  loading,
}: {
  plan: Plan;
  showAgent?: boolean;
  showCity?: boolean;
  colors: ThemeColors;
  isDark: boolean;
  onPress?: () => void;
  onVisit?: () => void;
  onSkip?: () => void;
  loading?: boolean;
}) {
  const hasDebt = Number(plan.shopDebt ?? 0) > 0;
  const sc = isDark ? "#000" : Shadows.sm.shadowColor;
  const meta = getStatusMeta(plan.status, colors);
  const canAct = plan.status === "planned" && (onVisit || onSkip);

  return (
    <PressableScale onPress={onPress} haptic="light">
    <View
      style={{
        backgroundColor: colors.bg.card,
        borderRadius: Radii.xxl,
        borderWidth: 1,
        borderColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.5)",
        padding: Spacing.xl,
        shadowColor: sc,
        shadowOffset: Shadows.sm.shadowOffset,
        shadowOpacity: Shadows.sm.shadowOpacity,
        shadowRadius: Shadows.sm.shadowRadius,
        elevation: Shadows.sm.elevation,
        opacity: plan.status === "visited" ? 0.7 : 1,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: Spacing.lg }}>
        {/* Status circle — circular badge */}
        <View
          style={{
            width: 48,
            height: 48,
            borderRadius: 24,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: meta.bg,
            borderWidth: 2,
            borderColor: meta.color + "30",
          }}
        >
          <Feather name={meta.icon} size={18} color={meta.color} />
        </View>
        {/* Info */}
        <View style={{ flex: 1, minWidth: 0 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <View style={{ minWidth: 0, flex: 1 }}>
              <Text
                style={{
                  fontFamily: Typography.fontSemibold,
                  fontSize: Typography.size.base,
                  color: colors.text.primary,
                }}
                numberOfLines={1}
              >
                {plan.shopName ?? "Магазин"}
              </Text>
              {showAgent && plan.agentName && (
                <Text
                  style={{
                    fontFamily: Typography.fontRegular,
                    fontSize: Typography.size.xs,
                    color: colors.text.secondary,
                    marginTop: 2,
                  }}
                  numberOfLines={1}
                >
                  {plan.agentName}
                </Text>
              )}
            </View>
            <View
              style={{
                backgroundColor: meta.bg,
                borderRadius: Radii.full,
                paddingHorizontal: 9,
                paddingVertical: 3,
              }}
            >
              <Text style={{ fontFamily: Typography.fontMedium, fontSize: 10, color: meta.color }}>
                {meta.label}
              </Text>
            </View>
          </View>
          {(plan.shopAddress || (showCity && plan.shopCity)) && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 }}>
              <Feather name="map-pin" size={10} color={colors.text.secondary} />
              <Text
                style={{
                  fontFamily: Typography.fontRegular,
                  fontSize: 11,
                  color: colors.text.secondary,
                  flexShrink: 1,
                }}
                numberOfLines={1}
              >
                {[showCity ? plan.shopCity : null, plan.shopAddress].filter(Boolean).join(", ")}
              </Text>
            </View>
          )}
          {hasDebt && (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
                marginTop: 6,
                alignSelf: "flex-start",
                backgroundColor: colors.status.dangerDim,
                borderRadius: Radii.full,
                paddingHorizontal: 8,
                paddingVertical: 3,
              }}
            >
              <Feather name="alert-circle" size={10} color={colors.status.danger} />
              <Text
                style={{
                  fontFamily: Typography.fontSemibold,
                  fontSize: 11,
                  color: colors.status.danger,
                }}
              >
                {Number(plan.shopDebt).toLocaleString("ru")} сум
              </Text>
            </View>
          )}
        </View>
      </View>

      {canAct && (
        <View style={{ flexDirection: "row", gap: Spacing.sm, marginTop: Spacing.lg }}>
          {onVisit && (
            <View style={{ flex: 1 }}>
              <Button
                variant="success"
                size="sm"
                icon="check-circle"
                onPress={onVisit}
                loading={loading}
                style={{ width: "100%" }}
              >
                Готово
              </Button>
            </View>
          )}
          {onSkip && (
            <View style={{ flex: 1 }}>
              <Button
                variant="secondary"
                size="sm"
                icon="clock"
                onPress={onSkip}
                disabled={loading}
                style={{ width: "100%" }}
              >
                Пропустить
              </Button>
            </View>
          )}
        </View>
      )}
    </View>
    </PressableScale>
  );
}
