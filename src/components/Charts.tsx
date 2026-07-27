// Warehouse Pro — Charts Kit
// ProgressRing, Sparkline, NeumorphicProgressBar
// All use theme tokens — no hardcoded colors.
import React from "react";
import { View, Text } from "react-native";
import Svg, { Circle, Path, Defs, LinearGradient as SvgGrad, Stop } from "react-native-svg";
import { LinearGradient } from "expo-linear-gradient";
import { Typography, Radii } from "../theme";
import { useThemeColors, useThemeStore } from "../store/theme";

// ── ProgressRing ──────────────────────────────────────────────────────────────
// Donut chart with percentage inside. Matches reference "Target Doctors" style.
export function ProgressRing({ value, size = 80, strokeWidth = 8, color, label, sublabel }: {
  value: number; size?: number; strokeWidth?: number; color?: string; label?: string; sublabel?: string;
}) {
  const colors = useThemeColors();
  const ringColor = color ?? colors.brand.primary;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(value, 100) / 100) * circumference;
  const displayValue = Math.round(value);

  return (
    <View style={{ alignItems: "center", gap: 6 }}>
      <View style={{ width: size, height: size, position: "relative" }}>
        <Svg width={size} height={size}>
          <Defs>
            <SvgGrad id={`ring-${displayValue}`} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0%" stopColor={ringColor} />
              <Stop offset="100%" stopColor={ringColor} stopOpacity={0.6} />
            </SvgGrad>
          </Defs>
          <Circle cx={size / 2} cy={size / 2} r={radius}
            fill="none" stroke={colors.bg.elevated} strokeWidth={strokeWidth} />
          <Circle cx={size / 2} cy={size / 2} r={radius}
            fill="none" stroke={`url(#ring-${displayValue})`} strokeWidth={strokeWidth}
            strokeDasharray={circumference} strokeDashoffset={offset}
            strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`} />
        </Svg>
        <View style={{ position: "absolute", inset: 0, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontFamily: Typography.fontBold, fontSize: size * 0.25, color: colors.text.primary }}>
            {displayValue}%
          </Text>
        </View>
      </View>
      {label && <Text style={{ fontFamily: Typography.fontSemibold, fontSize: Typography.size.xs, color: colors.text.secondary }}>{label}</Text>}
      {sublabel && <Text style={{ fontFamily: Typography.fontRegular, fontSize: 10, color: colors.text.muted }}>{sublabel}</Text>}
    </View>
  );
}

// ── Sparkline ─────────────────────────────────────────────────────────────────
// Mini line chart with gradient fill. Matches reference "Notes/Smart Alerts".
export function Sparkline({ data, width = 160, height = 48, color }: {
  data: number[]; width?: number; height?: number; color?: string;
}) {
  const colors = useThemeColors();
  const lineColor = color ?? colors.brand.primary;
  if (!data.length) return <View style={{ width, height }} />;

  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const padding = 4;
  const chartW = width - padding * 2;
  const chartH = height - padding * 2;

  const points = data.map((v, i) => {
    const x = padding + (i / (data.length - 1 || 1)) * chartW;
    const y = padding + chartH - ((v - min) / range) * chartH;
    return `${x},${y}`;
  });

  const linePath = `M${points.join(" L")}`;
  const areaPath = `${linePath} L${padding + chartW},${padding + chartH} L${padding},${padding + chartH} Z`;

  return (
    <Svg width={width} height={height}>
      <Defs>
        <SvgGrad id={`spark-fill-${color ?? "def"}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor={lineColor} stopOpacity={0.25} />
          <Stop offset="100%" stopColor={lineColor} stopOpacity={0} />
        </SvgGrad>
      </Defs>
      <Path d={areaPath} fill={`url(#spark-fill-${color ?? "def"})`} />
      <Path d={linePath} fill="none" stroke={lineColor} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// ── NeumorphicProgressBar ─────────────────────────────────────────────────────
// Inset track + gradient fill. Matches reference inset progress bars.
export function NeumorphicProgressBar({ value, height = 8, color, style }: {
  value: number; height?: number; color?: string; style?: object;
}) {
  const colors = useThemeColors();
  const { isDark } = useThemeStore();
  const barColor = color ?? colors.brand.primary;
  const pct = Math.min(Math.max(value, 0), 100);

  return (
    <View style={[{
      height, borderRadius: Radii.full,
      backgroundColor: colors.bg.elevated,
      overflow: "hidden",
      // Neumorphic inset shadow
      shadowColor: isDark ? "#000" : "#a0988c",
      shadowOffset: { width: -3, height: -3 },
      shadowOpacity: isDark ? 0.35 : 0.22,
      shadowRadius: 5,
      elevation: -1,
      borderWidth: 0.5,
      borderColor: isDark ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.4)",
    }, style]}>
      <LinearGradient
        colors={[barColor + "cc", barColor]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ height: "100%", width: `${pct}%`, borderRadius: Radii.full }}
      />
    </View>
  );
}
