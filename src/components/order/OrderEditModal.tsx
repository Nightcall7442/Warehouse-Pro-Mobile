import React from "react";
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Modal, Pressable } from "react-native";
import {
  Typography,
  Spacing,
  Radii,
  ThemeColors,
} from "../../theme";

interface OrderEditModalProps {
  visible: boolean;
  notes: string;
  discount: string;
  saving: boolean;
  onNotesChange: (v: string) => void;
  onDiscountChange: (v: string) => void;
  onSave: () => void;
  onClose: () => void;
  colors: ThemeColors;
}

export function OrderEditModal({ visible, notes, discount, saving, onNotesChange, onDiscountChange, onSave, onClose, colors }: OrderEditModalProps) {
  return (
    <Modal visible={visible} animationType="slide" transparent>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)" }} onPress={onClose}>
        <Pressable style={{
          position: "absolute", bottom: 0, left: 0, right: 0, maxHeight: "60%",
          backgroundColor: colors.bg.secondary, borderTopLeftRadius: Radii.xxl, borderTopRightRadius: Radii.xxl, padding: Spacing.xl,
        }} onPress={e => e.stopPropagation()}>
          <View style={{ alignItems: "center", paddingBottom: Spacing.md }}>
            <View style={{ width: 40, height: 4, borderRadius: Radii.full, backgroundColor: colors.border.default }} />
          </View>
          <Text style={{ color: colors.text.primary, fontSize: Typography.size.lg, fontFamily: Typography.fontBold, marginBottom: Spacing.lg }}>Редактировать заказ</Text>
          <Text style={{ color: colors.text.tertiary, fontSize: Typography.size.sm, marginBottom: 6 }}>Заметки</Text>
          <TextInput value={notes} onChangeText={onNotesChange} placeholder="Заметки к заказу..."
            placeholderTextColor={colors.text.muted}
            style={{ backgroundColor: colors.bg.card, borderRadius: Radii.md, borderWidth: 1, borderColor: colors.border.default, padding: Spacing.base, color: colors.text.primary, fontSize: Typography.size.base, marginBottom: Spacing.lg, minHeight: 60, textAlignVertical: "top" }} multiline />
          <Text style={{ color: colors.text.tertiary, fontSize: Typography.size.sm, marginBottom: 6 }}>Скидка (%)</Text>
          <TextInput value={discount} onChangeText={onDiscountChange} placeholder="0" keyboardType="numeric"
            placeholderTextColor={colors.text.muted}
            style={{ backgroundColor: colors.bg.card, borderRadius: Radii.md, borderWidth: 1, borderColor: colors.border.default, padding: Spacing.base, color: colors.text.primary, fontSize: Typography.size.base, marginBottom: Spacing.xl }} />
          <TouchableOpacity onPress={onSave} disabled={saving}
            style={{ backgroundColor: colors.accent.primary, borderRadius: Radii.md, padding: 15, alignItems: "center", opacity: saving ? 0.6 : 1 }}>
            {saving
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={{ color: "#fff", fontSize: Typography.size.base, fontFamily: Typography.fontBold }}>Сохранить</Text>
            }
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
