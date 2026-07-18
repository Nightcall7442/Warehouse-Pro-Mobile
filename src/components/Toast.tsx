import { useEffect, useRef, useState } from "react";
import { Animated, Text, View, Easing } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useToastStore } from "../store/toast";
import { useThemeColors } from "../store/theme";
import { Typography, Radii, Shadows } from "../theme";

const AUTO_DISMISS_MS = 3200;

const ICONS: Record<string, keyof typeof Feather.glyphMap> = {
  success: "check-circle",
  error:   "alert-circle",
  info:    "info",
};

/**
 * Brand toast — replaces the bare-system `Alert.alert()` for non-blocking
 * feedback (errors, success confirmations). Mount this once near the root
 * (app/_layout.tsx) so it renders above every screen.
 *
 * Confirmations that require a real choice ("Cancel order? Yes/No") still
 * use Alert.alert — a toast can't wait for an answer and shouldn't.
 */
export function ToastHost() {
  const { toast, hide } = useToastStore();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();

  const [translateY] = useState(() => new Animated.Value(-80));
  const [opacity]     = useState(() => new Animated.Value(0));
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!toast) return;

    Animated.parallel([
      Animated.timing(translateY, { toValue: 0, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(opacity,    { toValue: 1, duration: 220, useNativeDriver: true }),
    ]).start();

    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    dismissTimer.current = setTimeout(() => {
      Animated.parallel([
        Animated.timing(translateY, { toValue: -80, duration: 220, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
        Animated.timing(opacity,    { toValue: 0, duration: 180, useNativeDriver: true }),
      ]).start(() => hide());
    }, AUTO_DISMISS_MS);

    return () => { if (dismissTimer.current) clearTimeout(dismissTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast?.id]);

  if (!toast) return null;

  const accentColor =
    toast.variant === "success" ? colors.accent.success :
    toast.variant === "error"   ? colors.accent.danger :
    colors.accent.info;

  return (
    <Animated.View
      pointerEvents="box-none"
      style={{
        position: "absolute", top: 0, left: 0, right: 0, zIndex: 999,
        paddingTop: insets.top + 8, paddingHorizontal: 16,
        transform: [{ translateY }], opacity,
      }}
    >
      <View
        style={{
          flexDirection: "row", alignItems: "center", gap: 10,
          backgroundColor: colors.bg.card,
          borderRadius: Radii.lg,
          borderWidth: 1, borderColor: colors.border.default,
          borderLeftWidth: 3, borderLeftColor: accentColor,
          paddingVertical: 12, paddingHorizontal: 14,
          ...Shadows.lg,
        }}
        accessibilityRole="alert"
        accessibilityLiveRegion="assertive"
      >
        <Feather name={ICONS[toast.variant]} size={18} color={accentColor} />
        <Text
          style={{ flex: 1, fontFamily: Typography.fontMedium, fontSize: 14, color: colors.text.primary }}
          numberOfLines={3}
        >
          {toast.message}
        </Text>
      </View>
    </Animated.View>
  );
}
