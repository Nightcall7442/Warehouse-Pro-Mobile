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
import { useT } from "../../i18n";

interface OrderActionsProps {
  /** Состав и заметки ещё можно менять (new / processing / pending); иначе — серая строка с причиной. */
  canEdit: boolean;
  canCancel: boolean;
  canDelete: boolean;
  cancelPending: boolean;
  deletePending: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onDelete: () => void;
  colors: ThemeColors;
}

export function OrderActions({ canEdit, canCancel, canDelete, cancelPending, deletePending, onEdit, onCancel, onDelete, colors }: OrderActionsProps) {
  const t = useT();
  return (
    <FadeInItem delay={120}>
      <View style={{ gap: 12, marginTop: 8 }}>
        {/*
          Три дороги в стену на экране денег: «Изменить» у доставленного
          заказа, «Удалить» у агента, «Детали» у агента — сервер отказывал
          внятно («заказ уже у курьера — оформляется возвратом»), а экран
          прятал текст за «Не удалось… Попробуйте ещё раз». Теперь кнопка
          есть только там, где действие пройдёт.
        */}
        {!canEdit && (
          <Text style={{ fontSize: Typography.size.xs, color: colors.text.secondary, paddingHorizontal: 4 }}>
            {t("Состав менять нельзя: заказ у курьера или закрыт. Возврат оформляет офис.", "Tarkibni o'zgartirib bo'lmaydi: buyurtma kuryerda yoki yopilgan. Qaytarishni ofis rasmiylashtiradi.")}
          </Text>
        )}
        <View style={{ flexDirection: "row", gap: 12 }}>
          {canEdit && (
            <PressableScale onPress={onEdit} haptic="light" style={{ flex: 1, borderRadius: Radii.xl, overflow: "hidden" }}>
              <Card style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, paddingHorizontal: 16, backgroundColor: colors.bg.elevated }}>
                <Feather name="edit-2" size={18} color={colors.text.primary} />
                <Text style={{ fontSize: Typography.size.sm, fontFamily: Typography.fontSemibold, color: colors.text.primary }}>{t("Изменить", "O'zgartirish")}</Text>
              </Card>
            </PressableScale>
          )}
          {canCancel && (
            <PressableScale onPress={onCancel} haptic="medium" style={{ flex: 1, borderRadius: Radii.xl, overflow: "hidden" }}>
              <Card style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, paddingHorizontal: 16, backgroundColor: colors.status.dangerDim, borderWidth: 1, borderColor: colors.status.danger + "40" }}>
                {cancelPending
                  ? <ActivityIndicator size="small" color={colors.status.danger} />
                  : <Feather name="x" size={18} color={colors.status.danger} />
                }
                <Text style={{ fontSize: Typography.size.sm, fontFamily: Typography.fontSemibold, color: colors.status.danger }}>{t("Отменить", "Bekor qilish")}</Text>
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
              <Text style={{ fontSize: Typography.size.sm, fontFamily: Typography.fontSemibold, color: colors.status.danger }}>{t("Удалить заказ", "Buyurtmani o'chirish")}</Text>
            </Card>
          </PressableScale>
        )}
      </View>
    </FadeInItem>
  );
}
