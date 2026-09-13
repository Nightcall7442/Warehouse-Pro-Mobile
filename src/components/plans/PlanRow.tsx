import { View, Text } from "react-native";
import { Feather } from "@expo/vector-icons";
import type { Plan } from "../../api";
import { Typography, Spacing, Radii, ThemeColors, soft } from "../../theme";
import { PressableScale } from "../Animated";
import { Button } from "../ui";
import { getStatusMeta } from "./PlanHelpers";
import { formatMoney } from "../../store/branding";
import { SecureImage } from "../SecureImage";
import { useT } from "../../i18n";

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
  const t = useT();
  const hasDebt = Number(plan.shopDebt ?? 0) > 0;
  const meta = getStatusMeta(plan.status, colors);
  const canAct = plan.status === "planned" && (onVisit || onSkip);

  return (
    <PressableScale onPress={onPress} haptic="light">
    <View
      style={{
        backgroundColor: colors.bg.card,
        borderRadius: Radii.xxl,
        padding: Spacing.xl,
        ...soft(isDark).raised,
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
                {plan.shopName ?? t("Магазин", "Do'kon")}
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
          {/*
            Отметка визита: когда и чем подтверждена.

            «Посещён» без времени не отличает утренний обход от отметки задним
            числом вечером, а снимок, который нельзя открыть, ничего не
            доказывает. Оба поля приезжают из getPlans; раньше сервер не отдавал
            ни того, ни другого.
          */}
          {plan.status === "visited" && (plan.visitedAt || plan.photoUrl) && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 }}>
              {plan.visitedAt && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Feather name="clock" size={10} color={colors.text.secondary} />
                  <Text style={{ fontFamily: Typography.fontRegular, fontSize: 11, color: colors.text.secondary }}>
                    {new Date(plan.visitedAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
                  </Text>
                </View>
              )}
              {plan.photoUrl && (
                <SecureImage
                  uri={plan.photoUrl}
                  style={{ width: 32, height: 32, borderRadius: Radii.md }}
                />
              )}
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
                {formatMoney(plan.shopDebt)}
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
                {t("Готово", "Tayyor")}
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
                {t("Пропустить", "O'tkazish")}
              </Button>
            </View>
          )}
        </View>
      )}
    </View>
    </PressableScale>
  );
}
