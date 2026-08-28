import { type ReactNode } from "react";
import { View, Text, TouchableOpacity, Modal, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Plan } from "../../api";
import { Typography, Spacing, Radii, Shadows, ThemeColors } from "../../theme";
import { PressableScale } from "../Animated";

export function fmtDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

export function getStatusMeta(status: Plan["status"], colors: ThemeColors) {
  switch (status) {
    case "visited":
      return {
        label: "Посещён",
        icon: "check-circle" as const,
        color: colors.accent.success,
        bg: colors.status.successDim,
      };
    case "skipped":
      return {
        label: "Пропущен",
        icon: "clock" as const,
        color: colors.accent.warning,
        bg: colors.status.warningDim,
      };
    default:
      return {
        label: "Запланирован",
        icon: "calendar" as const,
        color: colors.accent.info,
        bg: colors.status.infoDim,
      };
  }
}

// ── Bottom sheet — same pattern as order/new.tsx ProductPicker ───────────────
export function BottomSheet({
  visible,
  onClose,
  title,
  colors,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  colors: ThemeColors;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: colors.bg.overlayDark }} onPress={onClose}>
        <Pressable
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            maxHeight: "86%",
            backgroundColor: colors.bg.secondary,
            borderTopLeftRadius: Radii.xxl,
            borderTopRightRadius: Radii.xxl,
            overflow: "hidden",
            // Шторка прижата к самому низу экрана, а внизу Android рисует свою
            // панель — полосу жестов или три кнопки. Без этого отступа нижняя
            // часть содержимого (а это как раз кнопки «Создать» и «Отмена»)
            // уходит под систему: их видно, но нажатие достаётся не
            // приложению. Отступ поставлен здесь, в самой шторке, а не в
            // каждом окне: тогда его нельзя забыть в новом.
            paddingBottom: insets.bottom,
          }}
          onPress={e => e.stopPropagation()}
        >
          <View style={{ alignItems: "center", paddingVertical: 12 }}>
            <View
              style={{
                width: 40,
                height: 4,
                borderRadius: Radii.full,
                backgroundColor: colors.border.default,
              }}
            />
          </View>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: Spacing.base,
              paddingBottom: Spacing.md,
            }}
          >
            <Text
              style={{
                fontFamily: Typography.fontBold,
                fontSize: Typography.size.lg,
                color: colors.text.primary,
              }}
            >
              {title}
            </Text>
            <TouchableOpacity
              onPress={onClose}
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor: colors.bg.elevated,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Feather name="x" size={16} color={colors.text.primary} />
            </TouchableOpacity>
          </View>
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── Selectable row — same visual language as shops.tsx territory cards ───────
export function SelectRow({
  label,
  sublabel,
  icon,
  selected,
  colors,
  isDark,
  onPress,
}: {
  label: string;
  sublabel?: string;
  icon: keyof typeof Feather.glyphMap;
  selected: boolean;
  colors: ThemeColors;
  isDark: boolean;
  onPress: () => void;
}) {
  const sc = isDark ? "#000" : Shadows.sm.shadowColor;
  return (
    <PressableScale onPress={onPress} haptic="selection" style={{ marginBottom: Spacing.sm }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: Spacing.md,
          backgroundColor: colors.bg.card,
          borderRadius: Radii.xl,
          borderWidth: 1,
          borderColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.5)",
          padding: Spacing.lg,
          shadowColor: sc,
          shadowOffset: Shadows.sm.shadowOffset,
          shadowOpacity: Shadows.sm.shadowOpacity,
          shadowRadius: Shadows.sm.shadowRadius,
          elevation: Shadows.sm.elevation,
        }}
      >
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: Radii.md,
            backgroundColor: selected ? colors.accent.primary : colors.brand.primaryDim,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Feather name={icon} size={17} color={selected ? "#fff" : colors.accent.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontFamily: Typography.fontSemibold,
              fontSize: Typography.size.base,
              color: colors.text.primary,
            }}
          >
            {label}
          </Text>
          {sublabel && (
            <Text
              style={{
                fontFamily: Typography.fontRegular,
                fontSize: Typography.size.xs,
                color: colors.text.tertiary,
                marginTop: 2,
              }}
            >
              {sublabel}
            </Text>
          )}
        </View>
        {selected && <Feather name="check" size={18} color={colors.accent.primary} />}
      </View>
    </PressableScale>
  );
}

export function FieldLabel({ children, colors }: { children: string; colors: ThemeColors }) {
  return (
    <Text
      style={{
        fontFamily: Typography.fontBold,
        fontSize: Typography.size.xs,
        color: colors.text.muted,
        letterSpacing: 1.5,
        marginTop: Spacing.lg,
        marginBottom: Spacing.sm,
      }}
    >
      {children.toUpperCase()}
    </Text>
  );
}
