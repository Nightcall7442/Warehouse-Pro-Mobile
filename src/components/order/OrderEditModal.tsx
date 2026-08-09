import React, { useState, useRef } from "react";
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Modal, Pressable, ScrollView } from "react-native";
import { Feather } from "@expo/vector-icons";
import {
  Typography,
  Spacing,
  Radii,
  ThemeColors,
} from "../../theme";

interface OrderItem {
  id: number;
  productName: string;
  productCode?: string;
  quantity: number;
  unitPrice: number;
  unit?: string;
}

interface EditableItem extends OrderItem {
  newQuantity: number;
}

interface OrderEditModalProps {
  visible: boolean;
  notes: string;
  discount: string;
  items: OrderItem[];
  saving: boolean;
  onNotesChange: (v: string) => void;
  onDiscountChange: (v: string) => void;
  onSaveItems: (items: Array<{ itemId: number; quantity: number }>) => void;
  onSave: () => void;
  onClose: () => void;
  colors: ThemeColors;
}

const UNIT_LABELS: Record<string, string> = {
  kg: "кг", l: "л", pcs: "шт", box: "блок", pack: "упак", m: "м", block: "блок",
};

export function OrderEditModal({
  visible, notes, discount, items, saving,
  onNotesChange, onDiscountChange, onSaveItems, onSave, onClose, colors,
}: OrderEditModalProps) {
  const [editItems, setEditItems] = useState<EditableItem[]>([]);
  const [activeTab, setActiveTab] = useState<"items" | "details">("items");

  // Reset edit items when modal opens (adjusting state during render — React-recommended pattern)
  const prevVisible = useRef(false);
  if (visible && !prevVisible.current) { // eslint-disable-line react-hooks/refs -- adjusting state during render
    setEditItems(items.map(item => ({ ...item, newQuantity: item.quantity })));
  }
  prevVisible.current = visible; // eslint-disable-line react-hooks/refs -- adjusting state during render

  function updateQuantity(idx: number, qty: string) {
    const num = parseInt(qty, 10);
    setEditItems(prev => prev.map((it, i) =>
      i === idx ? { ...it, newQuantity: isNaN(num) ? 0 : num } : it
    ));
  }

  function handleSaveItems() {
    const changed = editItems
      .filter(it => it.newQuantity !== it.quantity)
      .map(it => ({ itemId: it.id, quantity: it.newQuantity }));
    onSaveItems(changed);
  }

  const hasChanges = editItems.some(it => it.newQuantity !== it.quantity);

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)" }} onPress={onClose}>
        <Pressable style={{
          position: "absolute", bottom: 0, left: 0, right: 0, maxHeight: "80%",
          backgroundColor: colors.bg.secondary, borderTopLeftRadius: Radii.xxl, borderTopRightRadius: Radii.xxl, padding: Spacing.xl,
        }} onPress={e => e.stopPropagation()}>
          <View style={{ alignItems: "center", paddingBottom: Spacing.md }}>
            <View style={{ width: 40, height: 4, borderRadius: Radii.full, backgroundColor: colors.border.default }} />
          </View>
          <Text style={{ color: colors.text.primary, fontSize: Typography.size.lg, fontFamily: Typography.fontBold, marginBottom: Spacing.md }}>Редактировать заказ</Text>

          {/* Tabs */}
          <View style={{ flexDirection: "row", marginBottom: Spacing.lg, backgroundColor: colors.bg.card, borderRadius: Radii.md, padding: 3 }}>
            <TouchableOpacity
              onPress={() => setActiveTab("items")}
              style={{
                flex: 1, paddingVertical: 10, borderRadius: Radii.sm,
                backgroundColor: activeTab === "items" ? colors.accent.primary : "transparent",
                alignItems: "center",
              }}
            >
              <Text style={{
                fontSize: Typography.size.sm, fontFamily: Typography.fontSemibold,
                color: activeTab === "items" ? "#fff" : colors.text.tertiary,
              }}>Товары</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setActiveTab("details")}
              style={{
                flex: 1, paddingVertical: 10, borderRadius: Radii.sm,
                backgroundColor: activeTab === "details" ? colors.accent.primary : "transparent",
                alignItems: "center",
              }}
            >
              <Text style={{
                fontSize: Typography.size.sm, fontFamily: Typography.fontSemibold,
                color: activeTab === "details" ? "#fff" : colors.text.tertiary,
              }}>Детали</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: "70%" }}>
            {activeTab === "items" ? (
              <View style={{ gap: 12 }}>
                {editItems.map((item, idx) => {
                  const unitLabel = UNIT_LABELS[item.unit ?? "pcs"] ?? "шт";
                  const changed = item.newQuantity !== item.quantity;
                  return (
                    <View key={item.id} style={{
                      backgroundColor: colors.bg.card, borderRadius: Radii.lg,
                      borderWidth: 1, borderColor: changed ? colors.accent.primary + "40" : colors.border.subtle,
                      padding: 14,
                    }}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                        <View style={{ flex: 1, marginRight: 10 }}>
                          <Text style={{ color: colors.text.primary, fontSize: Typography.size.sm, fontFamily: Typography.fontMedium }} numberOfLines={2}>
                            {item.productName}
                          </Text>
                          {item.productCode && (
                            <Text style={{ color: colors.text.muted, fontSize: Typography.size.xs, marginTop: 2 }}>
                              {item.productCode}
                            </Text>
                          )}
                          <Text style={{ color: colors.text.tertiary, fontSize: Typography.size.xs, marginTop: 4 }}>
                            {item.quantity} {unitLabel} × {item.unitPrice.toLocaleString("ru")} сум
                          </Text>
                        </View>
                        {changed && (
                          <View style={{ backgroundColor: colors.accent.primary + "15", paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radii.sm }}>
                            <Text style={{ fontSize: Typography.size.xs, color: colors.accent.primary, fontFamily: Typography.fontSemibold }}>Изменено</Text>
                          </View>
                        )}
                      </View>

                      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                        <TouchableOpacity
                          onPress={() => updateQuantity(idx, String(Math.max(0, item.newQuantity - 1)))}
                          style={{
                            width: 36, height: 36, borderRadius: Radii.md,
                            backgroundColor: colors.bg.elevated, alignItems: "center", justifyContent: "center",
                          }}
                        >
                          <Feather name="minus" size={16} color={colors.text.primary} />
                        </TouchableOpacity>
                        <TextInput
                          value={String(item.newQuantity)}
                          onChangeText={(v) => updateQuantity(idx, v)}
                          keyboardType="numeric"
                          style={{
                            flex: 1, textAlign: "center", backgroundColor: colors.bg.input,
                            borderRadius: Radii.md, borderWidth: 1,
                            borderColor: changed ? colors.accent.primary : colors.border.default,
                            padding: 10, color: colors.text.primary,
                            fontSize: Typography.size.md, fontFamily: Typography.fontBold,
                          }}
                        />
                        <TouchableOpacity
                          onPress={() => updateQuantity(idx, String(item.newQuantity + 1))}
                          style={{
                            width: 36, height: 36, borderRadius: Radii.md,
                            backgroundColor: colors.bg.elevated, alignItems: "center", justifyContent: "center",
                          }}
                        >
                          <Feather name="plus" size={16} color={colors.text.primary} />
                        </TouchableOpacity>
                        <Text style={{ color: colors.text.muted, fontSize: Typography.size.sm, width: 30 }}>{unitLabel}</Text>
                      </View>

                      {changed && (
                        <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border.subtle }}>
                          <Text style={{ fontSize: Typography.size.xs, color: colors.text.muted }}>
                            Было: {item.quantity} {unitLabel}
                          </Text>
                          <Text style={{ fontSize: Typography.size.xs, color: colors.text.muted }}>
                            Сумма: {(item.unitPrice * item.newQuantity).toLocaleString("ru")} сум
                          </Text>
                        </View>
                      )}
                    </View>
                  );
                })}

                {hasChanges && (
                  <TouchableOpacity onPress={handleSaveItems} disabled={saving}
                    style={{ backgroundColor: colors.accent.primary, borderRadius: Radii.md, padding: 15, alignItems: "center", opacity: saving ? 0.6 : 1 }}>
                    {saving
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <Text style={{ color: "#fff", fontSize: Typography.size.base, fontFamily: Typography.fontBold }}>Сохранить количество</Text>
                    }
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <View style={{ gap: 16 }}>
                <View>
                  <Text style={{ color: colors.text.tertiary, fontSize: Typography.size.sm, marginBottom: 6 }}>Заметки</Text>
                  <TextInput value={notes} onChangeText={onNotesChange} placeholder="Заметки к заказу..."
                    placeholderTextColor={colors.text.muted}
                    style={{ backgroundColor: colors.bg.card, borderRadius: Radii.md, borderWidth: 1, borderColor: colors.border.default, padding: Spacing.base, color: colors.text.primary, fontSize: Typography.size.base, minHeight: 60, textAlignVertical: "top" }} multiline />
                </View>
                <View>
                  <Text style={{ color: colors.text.tertiary, fontSize: Typography.size.sm, marginBottom: 6 }}>Скидка (%)</Text>
                  <TextInput value={discount} onChangeText={onDiscountChange} placeholder="0" keyboardType="numeric"
                    placeholderTextColor={colors.text.muted}
                    style={{ backgroundColor: colors.bg.card, borderRadius: Radii.md, borderWidth: 1, borderColor: colors.border.default, padding: Spacing.base, color: colors.text.primary, fontSize: Typography.size.base }} />
                </View>
                <TouchableOpacity onPress={onSave} disabled={saving}
                  style={{ backgroundColor: colors.accent.primary, borderRadius: Radii.md, padding: 15, alignItems: "center", opacity: saving ? 0.6 : 1 }}>
                  {saving
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={{ color: "#fff", fontSize: Typography.size.base, fontFamily: Typography.fontBold }}>Сохранить детали</Text>
                  }
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
