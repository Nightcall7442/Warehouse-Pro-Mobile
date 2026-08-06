import { View, Text } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import { getMyQuota } from "../api";
import { computePace, money } from "../lib/monthly-plan";
import { useThemeColors } from "../store/theme";
import { Typography, Spacing, Radii } from "../theme";
import { ShimmerSkeleton } from "./Animated";

/**
 * The agent's monthly quota, as their supervisor set it.
 *
 * The number that actually governs an agent's month is not the percentage —
 * it's whether that percentage is ahead of the calendar. 60% is comfortable on
 * the 25th and alarming on the 5th, so this leads with pace rather than with a
 * bare progress bar, and says in money what remains and what that works out to
 * per remaining day. Everything else is secondary.
 */

export function MonthlyPlanCard() {
  const colors = useThemeColors();

  const { data: quota, isLoading } = useQuery({
    queryKey: ["myQuota"],
    queryFn: () => getMyQuota().catch(() => null),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const surface = {
    backgroundColor: colors.bg.card,
    borderRadius: Radii.xl,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  };

  if (isLoading) {
    return (
      <View style={{ ...surface, padding: Spacing.base, gap: 12 }}>
        <ShimmerSkeleton height={18} width={140} radius={Radii.sm} />
        <ShimmerSkeleton height={56} radius={Radii.md} />
        <ShimmerSkeleton height={40} radius={Radii.md} />
      </View>
    );
  }

  // No quota is a normal state, not a failure — most months a supervisor sets
  // one, but a new agent or an unset month should read as "not assigned"
  // rather than as a plan of zero they have already blown.
  if (!quota) {
    return (
      <View style={{ ...surface, padding: Spacing.lg, alignItems: "center", gap: 8 }}>
        <View style={{
          width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center",
          backgroundColor: colors.bg.elevated,
        }}>
          <Feather name="target" size={18} color={colors.text.muted} />
        </View>
        <Text style={{ fontFamily: Typography.fontSemibold, fontSize: Typography.size.sm, color: colors.text.secondary }}>
          Норма на этот месяц не назначена
        </Text>
        <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.xs, color: colors.text.muted, textAlign: "center" }}>
          Её ставит супервайзер
        </Text>
      </View>
    );
  }

  const pace = computePace(quota);

  const TONE = {
    done:    { color: colors.status.success, label: "План выполнен",  icon: "check-circle" as const },
    ahead:   { color: colors.status.success, label: "Идёте с опережением", icon: "trending-up" as const },
    onTrack: { color: colors.accent.primary, label: "Идёте по графику",    icon: "activity" as const },
    behind:  { color: colors.status.warning, label: "Отставание от графика", icon: "trending-down" as const },
  }[pace.status];

  const monthLabel = (() => {
    try { return format(parseISO(quota.month), "LLLL yyyy", { locale: ru }); }
    catch { return ""; }
  })();

  return (
    <View style={{ ...surface, overflow: "hidden" }}>
      {/* Headline: the month, and one sentence on whether it is going well. */}
      <View style={{ padding: Spacing.base, paddingBottom: Spacing.md }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{
            fontFamily: Typography.fontSemibold, fontSize: 10, letterSpacing: 1,
            textTransform: "uppercase", color: colors.text.muted,
          }}>
            План на {monthLabel}
          </Text>
          <View style={{
            flexDirection: "row", alignItems: "center", gap: 5,
            paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
            backgroundColor: colors.bg.elevated,
          }}>
            <Feather name={TONE.icon} size={11} color={TONE.color} />
            <Text style={{ fontFamily: Typography.fontSemibold, fontSize: 10, color: TONE.color }}>
              {TONE.label}
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6, marginTop: 10 }}>
          <Text style={{ fontFamily: Typography.fontExtraBold, fontSize: 34, color: colors.text.primary, letterSpacing: -1 }}>
            {quota.revenue.pct}%
          </Text>
          <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.sm, color: colors.text.secondary }}>
            {money(quota.revenue.actual)} из {money(quota.revenue.target)} сум
          </Text>
        </View>

        {/* The bar carries two facts at once: how far along the agent is, and
            where the calendar says they should be. The marker is what turns a
            percentage into a judgement. */}
        <View style={{ marginTop: 12 }}>
          <View style={{ height: 10, borderRadius: 5, backgroundColor: colors.bg.elevated, overflow: "hidden" }}>
            <View style={{
              width: `${Math.min(100, Math.max(0, quota.revenue.pct))}%`,
              height: "100%", borderRadius: 5, backgroundColor: TONE.color,
            }} />
          </View>
          {pace.status !== "done" && (
            <View style={{ height: 16, marginTop: -13 }}>
              <View style={{
                position: "absolute",
                left: `${Math.min(100, Math.max(0, pace.expectedPct))}%`,
                width: 2, height: 16, marginLeft: -1, borderRadius: 1,
                backgroundColor: colors.text.primary, opacity: 0.55,
              }} />
            </View>
          )}
          <Text style={{
            fontFamily: Typography.fontRegular, fontSize: Typography.size.xs,
            color: colors.text.muted, marginTop: pace.status === "done" ? 8 : 6,
          }}>
            {pace.status === "done"
              ? "Норма закрыта — всё сверху идёт в плюс"
              : `День ${quota.daysElapsed} из ${quota.daysTotal} · график ${pace.expectedPct}%`}
          </Text>
        </View>
      </View>

      {/* What is left, in the terms an agent plans their week with. */}
      {pace.status !== "done" && (
        <View style={{
          flexDirection: "row", borderTopWidth: 1, borderTopColor: colors.border.subtle,
        }}>
          <Stat label="Осталось" value={`${money(pace.remaining)} сум`} colors={colors} />
          <View style={{ width: 1, backgroundColor: colors.border.subtle }} />
          <Stat
            label={pace.daysLeft > 0 ? `В день (${pace.daysLeft} дн.)` : "Последний день"}
            value={`${money(pace.perDay)} сум`}
            colors={colors}
          />
        </View>
      )}

      {/* Orders and visits sit below revenue deliberately: they are how the
          money gets made, not the target itself. */}
      <View style={{ borderTopWidth: 1, borderTopColor: colors.border.subtle, padding: Spacing.base, gap: 12 }}>
        <MiniGoal
          icon="shopping-cart"
          label="Заказы"
          actual={String(quota.orders.actual)}
          target={String(quota.orders.target)}
          pct={quota.orders.pct}
          colors={colors}
        />
        <MiniGoal
          icon="map-pin"
          label="Визиты"
          actual={`${Math.round(quota.visits.actual)}%`}
          target={`${Math.round(quota.visits.target)}%`}
          pct={quota.visits.pct}
          colors={colors}
        />
      </View>
    </View>
  );
}

type Colors = ReturnType<typeof useThemeColors>;

function Stat({ label, value, colors }: { label: string; value: string; colors: Colors }) {
  return (
    <View style={{ flex: 1, paddingVertical: Spacing.md, paddingHorizontal: Spacing.base }}>
      <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.xs, color: colors.text.muted }}>
        {label}
      </Text>
      <Text
        numberOfLines={1}
        style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.base, color: colors.text.primary, marginTop: 3 }}
      >
        {value}
      </Text>
    </View>
  );
}

function MiniGoal({ icon, label, actual, target, pct, colors }: {
  icon: "shopping-cart" | "map-pin";
  label: string;
  actual: string;
  target: string;
  pct: number;
  colors: Colors;
}) {
  const done = pct >= 100;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <Feather name={icon} size={14} color={colors.text.muted} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
          <Text style={{ fontFamily: Typography.fontSemibold, fontSize: Typography.size.xs, color: colors.text.secondary }}>
            {label}
          </Text>
          <Text style={{ fontFamily: Typography.fontSemibold, fontSize: Typography.size.xs, color: colors.text.primary }}>
            {actual} / {target}
          </Text>
        </View>
        <View style={{ height: 4, borderRadius: 2, backgroundColor: colors.bg.elevated, marginTop: 5, overflow: "hidden" }}>
          <View style={{
            width: `${Math.min(100, Math.max(0, pct))}%`,
            height: "100%", borderRadius: 2,
            backgroundColor: done ? colors.status.success : colors.accent.primary,
          }} />
        </View>
      </View>
    </View>
  );
}
