import React from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { Feather } from "@expo/vector-icons";
import {
  Typography,
  Radii,
  ThemeColors,
} from "../../theme";
import { Card } from "../ui";
import { PressableScale, FadeInItem } from "../Animated";

interface OrderActionsProps {
  canCancel: boolean;
  canDelete: boolean;
  cancelPending: boolean;
  deletePending: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onDelete: () => void;
  colors: ThemeColors;
}

export function OrderActions({ canCancel, canDelete, cancelPending, deletePending, onEdit, onCancel, onDelete, colors }: OrderActionsProps) {
  return (
    <FadeInItem delay={120}>
      <View style={{ gap: 12, marginTop: 8 }}>
        <View style={{ flexDirection: "row", gap: 12 }}>
          <PressableScale onPress={onEdit} haptic="light" style={{ flex: 1, borderRadius: Radii.xl, overflow: "hidden" }}>
            <Card style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, paddingHorizontal: 16, backgroundColor: colors.bg.elevated, borderWidth: 1, borderColor: colors.border.default }}>
              <Feather name="edit-2" size={18} color={colors.text.primary} />
              <Text style={{ fontSize: Typography.size.sm, fontFamily: Typography.fontSemibold, color: colors.text.primary }}>Изменить</Text>
            </Card>
          </PressableScale>
          {canCancel && (
            <PressableScale onPress={onCancel} haptic="medium" style={{ flex: 1, borderRadius: Radii.xl, overflow: "hidden" }}>
              <Card style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, paddingHorizontal: 16, backgroundColor: colors.status.dangerDim, borderWidth: 1, borderColor: colors.status.danger + "40" }}>
                {cancelPending
                  ? <ActivityIndicator size="small" color={colors.status.danger} />
                  : <Feather name="x" size={18} color={colors.status.danger} />
                }
                <Text style={{ fontSize: Typography.size.sm, fontFamily: Typography.fontSemibold, color: colors.status.danger }}>Отменить</Text>
              </Card>
            </PressableScale>
          )}
        </View>
        {canDelete && (
          <PressableScale onPress={onDelete} haptic="medium" style={{ borderRadius: Radii.xl, overflow: "hidden" }}>
            <Card style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, paddingHorizontal: 16, backgroundColor: colors.status.dangerDim, borderWidth: 1, borderColor: colors.status.danger + "40" }}>
              {deletePending
                ? <ActivityIndicator size="small" color={colors.status.danger} />
                : <Feather name="trash-2" size={18} color={colors.status.danger} />
              }
              <Text style={{ fontSize: Typography.size.sm, fontFamily: Typography.fontSemibold, color: colors.status.danger }}>Удалить заказ</Text>
            </Card>
          </PressableScale>
        )}
      </View>
    </FadeInItem>
  );
}
