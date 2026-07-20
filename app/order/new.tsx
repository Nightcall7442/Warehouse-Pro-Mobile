// Warehouse Pro — New Order (matches web NewOrder.tsx — 3-step wizard)
import { useState, useMemo } from "react";
import { View, Text, ScrollView, TouchableOpacity, TextInput, FlatList, Modal, Pressable, ActivityIndicator } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import * as Network from "expo-network";
import { Feather } from "@expo/vector-icons";
import { getMyShops, getProducts, createOrder, Shop } from "../../src/api";
import { useOfflineStore } from "../../src/store/offline";
import { notify } from "../../src/store/toast";
import { useThemeColors } from "../../src/store/theme";
import { Typography, Spacing, Radii, ThemeColors } from "../../src/theme";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Card, SearchInput, Skeleton } from "../../src/components/ui";
import { PressableScale } from "../../src/components/Animated";

interface OrderLine {
  productId: number;
  name: string;
  unitPrice: number;
  quantity: string;
  discount: string;
  available: number;
  unit?: string;
}

// ── Step Indicator (matches web Steps) ───────────────────────────────────────
function StepIndicator({ step, total, colors }: { step: number; total: number; colors: ThemeColors }) {
  const labels = ["Магазин", "Товары", "Итог"];
  return (
    <View style={{ backgroundColor: colors.bg.secondary, paddingHorizontal: Spacing.base, paddingBottom: Spacing.base, borderBottomWidth: 1, borderBottomColor: colors.border.default }}>
      {/* Progress track */}
      <View style={{ height: 5, backgroundColor: colors.bg.input, borderRadius: Radii.full, marginBottom: Spacing.base, overflow: "hidden" }}>
        <View style={{ height: "100%", borderRadius: Radii.full, width: `${(step / total) * 100}%`, backgroundColor: colors.accent.primary }} />
      </View>
      {/* Step info */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: colors.accent.primary, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontSize: Typography.size.sm, fontFamily: Typography.fontBold, color: "#fff" }}>{step}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: Typography.size.xs, color: colors.text.tertiary, fontFamily: Typography.fontBold, letterSpacing: 1 }}>ШАГ {step} ИЗ {total}</Text>
          <Text style={{ fontSize: Typography.size.base, color: colors.text.primary, fontFamily: Typography.fontBold }}>{labels[step - 1]}</Text>
        </View>
        {/* Dots */}
        <View style={{ flexDirection: "row", gap: 5 }}>
          {Array.from({ length: total }).map((_, i) => (
            <View key={i} style={{ width: i + 1 === step ? 18 : 6, height: 6, borderRadius: 3, backgroundColor: i + 1 < step ? colors.accent.primary + "60" : i + 1 === step ? colors.accent.primary : colors.border.default }} />
          ))}
        </View>
      </View>
    </View>
  );
}

// ── Step 1: Shop Picker ──────────────────────────────────────────────────────
function ShopPicker({ selectedId, onSelect, colors }: { selectedId: number; onSelect: (s: Shop) => void; colors: ThemeColors }) {
  const [search, setSearch] = useState("");
  const { data: shops, isLoading } = useQuery({ queryKey: ["myShops"], queryFn: getMyShops });

  const filtered = useMemo(() =>
    (shops ?? []).filter(s => !search || s.name?.toLowerCase().includes(search.toLowerCase()) || s.ownerName?.toLowerCase().includes(search.toLowerCase())),
    [shops, search]
  );

  return (
    <View style={{ padding: Spacing.base, gap: Spacing.md }}>
      <SearchInput value={search} onChangeText={setSearch} placeholder="Поиск магазинов…" autoFocus />
      {isLoading ? (
        <View style={{ gap: 10 }}>{[1, 2, 3, 4].map(i => <Skeleton key={i} height={64} radius={Radii.lg} />)}</View>
      ) : filtered.length === 0 ? (
        <View style={{ alignItems: "center", paddingVertical: 60 }}>
          <Feather name="search" size={32} color={colors.text.muted} />
          <Text style={{ fontSize: Typography.size.base, fontFamily: Typography.fontSemibold, color: colors.text.secondary, marginTop: Spacing.md }}>Ничего не найдено</Text>
        </View>
      ) : (
        <FlatList data={filtered} keyExtractor={s => String(s.id)} scrollEnabled={false}
          renderItem={({ item: shop }) => {
            const selected = shop.id === selectedId;
            const hasDebt = Number(shop.debt ?? 0) > 0;
            return (
              <PressableScale onPress={() => { onSelect(shop); }} haptic="light" style={{ marginBottom: 8 }}>
                <Card style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderWidth: selected ? 1.5 : 1, borderColor: selected ? colors.accent.primary : colors.border.default }}>
                  <View style={{ width: 40, height: 40, borderRadius: Radii.md, backgroundColor: selected ? colors.accent.primary + "20" : colors.bg.elevated, alignItems: "center", justifyContent: "center" }}>
                    <Feather name="shopping-bag" size={18} color={selected ? colors.accent.primary : colors.text.muted} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ fontSize: Typography.size.base, fontFamily: Typography.fontSemibold, color: selected ? colors.accent.primary : colors.text.primary }}>{shop.name}</Text>
                    <Text style={{ fontSize: Typography.size.sm, color: colors.text.tertiary }} numberOfLines={1}>
                      {[shop.ownerName, shop.city].filter(Boolean).join(" · ") || "—"}
                    </Text>
                    {hasDebt && <Text style={{ fontSize: Typography.size.xs, color: colors.status.danger, fontFamily: Typography.fontMedium, marginTop: 2 }}>Долг: {Number(shop.debt).toLocaleString("ru")} сум</Text>}
                  </View>
                  {selected ? (
                    <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: colors.accent.primary, alignItems: "center", justifyContent: "center" }}>
                      <Feather name="check" size={14} color="#fff" />
                    </View>
                  ) : (
                    <View style={{ width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor: colors.border.default }} />
                  )}
                </Card>
              </PressableScale>
            );
          }}
        />
      )}
    </View>
  );
}

// ── Step 2: Product Picker + Cart ────────────────────────────────────────────
function ProductStep({ lines, onChange, colors }: { lines: OrderLine[]; onChange: (l: OrderLine[]) => void; colors: ThemeColors }) {
  const [showPicker, setShowPicker] = useState(false);

  const lineTotal = (l: OrderLine) => l.unitPrice * Number(l.quantity || 0) * (1 - Number(l.discount || 0) / 100);

  return (
    <View style={{ padding: Spacing.base, gap: Spacing.sm }}>
      {/* Add product button */}
      <PressableScale onPress={() => setShowPicker(true)} haptic="light">
        <Card style={{ padding: 16, flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.accent.primary + "20", alignItems: "center", justifyContent: "center" }}>
            <Feather name="plus" size={18} color={colors.accent.primary} />
          </View>
          <Text style={{ flex: 1, fontSize: Typography.size.base, fontFamily: Typography.fontSemibold, color: colors.accent.primary }}>Добавить товар</Text>
          <Feather name="chevron-right" size={16} color={colors.accent.primary} />
        </Card>
      </PressableScale>

      {/* Empty state */}
      {lines.length === 0 && (
        <View style={{ alignItems: "center", paddingVertical: 50, gap: 10 }}>
          <View style={{ width: 64, height: 64, borderRadius: Radii.xl, backgroundColor: colors.bg.elevated, alignItems: "center", justifyContent: "center" }}>
            <Feather name="package" size={28} color={colors.text.muted} />
          </View>
          <Text style={{ fontSize: Typography.size.base, fontFamily: Typography.fontSemibold, color: colors.text.secondary }}>Корзина пуста</Text>
          <Text style={{ fontSize: Typography.size.sm, color: colors.text.tertiary }}>Нажмите «Добавить товар»</Text>
        </View>
      )}

      {/* Line items */}
      {lines.map((line, idx) => {
        const total = lineTotal(line);
        return (
          <Card key={line.productId} style={{ padding: Spacing.base, gap: 8 }}>
            {/* Header */}
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
              <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colors.accent.primary + "20", alignItems: "center", justifyContent: "center", marginTop: 1 }}>
                <Text style={{ fontSize: Typography.size.xs, fontFamily: Typography.fontBold, color: colors.accent.primary }}>{idx + 1}</Text>
              </View>
              <Text style={{ flex: 1, fontSize: Typography.size.base, fontFamily: Typography.fontSemibold, color: colors.text.primary, lineHeight: 20 }} numberOfLines={2}>{line.name}</Text>
              <TouchableOpacity onPress={() => onChange(lines.filter((_, i) => i !== idx))} style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.bg.elevated, borderWidth: 1, borderColor: colors.border.default, alignItems: "center", justifyContent: "center" }}>
                <Feather name="x" size={14} color={colors.text.muted} />
              </TouchableOpacity>
            </View>
            {/* Price info */}
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ fontSize: Typography.size.xs, color: colors.text.tertiary, fontFamily: Typography.fontMedium }}>{line.unitPrice.toLocaleString("ru")} сум / {line.unit ?? "кг"}</Text>
              <Text style={{ fontSize: Typography.size.xs, color: colors.text.tertiary }}>Остаток: {line.available}</Text>
            </View>
            {/* Inputs */}
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={{ fontSize: Typography.size.xs, color: colors.text.tertiary, fontFamily: Typography.fontBold, letterSpacing: 0.5 }}>КОЛ-ВО</Text>
                <TextInput value={line.quantity} onChangeText={v => {
                  const next = [...lines]; next[idx] = { ...next[idx], quantity: v.replace(",", ".") }; onChange(next);
                }} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={colors.text.tertiary} selectTextOnFocus
                  style={{ backgroundColor: colors.bg.elevated, borderRadius: Radii.md, borderWidth: 1, borderColor: colors.border.default, paddingVertical: 10, paddingHorizontal: 8, fontSize: Typography.size.base, fontFamily: Typography.fontSemibold, color: colors.text.primary, textAlign: "center" }} />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={{ fontSize: Typography.size.xs, color: colors.text.tertiary, fontFamily: Typography.fontBold, letterSpacing: 0.5 }}>СКИДКА (%)</Text>
                <TextInput value={line.discount} onChangeText={v => {
                  const next = [...lines]; next[idx] = { ...next[idx], discount: v }; onChange(next);
                }} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={colors.text.tertiary}
                  style={{ backgroundColor: colors.bg.elevated, borderRadius: Radii.md, borderWidth: 1, borderColor: colors.border.default, paddingVertical: 10, paddingHorizontal: 8, fontSize: Typography.size.base, fontFamily: Typography.fontSemibold, color: colors.text.primary, textAlign: "center" }} />
              </View>
              <View style={{ flex: 1.2, gap: 4 }}>
                <Text style={{ fontSize: Typography.size.xs, color: colors.text.tertiary, fontFamily: Typography.fontBold, letterSpacing: 0.5 }}>СУММА</Text>
                <View style={{ backgroundColor: colors.accent.primary + "12", borderRadius: Radii.md, paddingVertical: 10, paddingHorizontal: 8, alignItems: "center" }}>
                  {Number(line.discount) > 0 && (
                    <Text style={{ fontSize: Typography.size.xs, color: colors.text.tertiary, textDecorationLine: "line-through" }}>
                      {(line.unitPrice * Number(line.quantity || 0)).toLocaleString("ru")}
                    </Text>
                  )}
                  <Text style={{ fontSize: Typography.size.sm, fontFamily: Typography.fontBold, color: colors.accent.primary }}>{total.toLocaleString("ru")}</Text>
                </View>
              </View>
            </View>
          </Card>
        );
      })}

      {/* Product picker modal */}
      <ProductPicker visible={showPicker} onClose={() => setShowPicker(false)} lines={lines} onChange={onChange} colors={colors} />
    </View>
  );
}

// ── Product Picker Modal ─────────────────────────────────────────────────────
function ProductPicker({ visible, onClose, lines, onChange, colors }: {
  visible: boolean; onClose: () => void; lines: OrderLine[]; onChange: (l: OrderLine[]) => void; colors: ThemeColors;
}) {
  const [search, setSearch] = useState("");
  const { data: products, isLoading } = useQuery({ queryKey: ["products"], queryFn: () => getProducts() });

  const filtered = useMemo(() => {
    const list = (products ?? []).filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()) || (p.code ?? "").toLowerCase().includes(search.toLowerCase()));
    return list.sort((a, b) => (a.category ?? "").localeCompare(b.category ?? "") || a.name.localeCompare(b.name));
  }, [products, search]);

  const already = useMemo(() => new Set(lines.map(l => l.productId)), [lines]);

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)" }} onPress={onClose}>
        <Pressable style={{
          position: "absolute", bottom: 0, left: 0, right: 0, maxHeight: "80%",
          backgroundColor: colors.bg.secondary, borderTopLeftRadius: Radii.xxl, borderTopRightRadius: Radii.xxl, overflow: "hidden",
        }} onPress={e => e.stopPropagation()}>
          <View style={{ alignItems: "center", paddingVertical: 12 }}>
            <View style={{ width: 40, height: 4, borderRadius: Radii.full, backgroundColor: colors.border.default }} />
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: Spacing.base, paddingBottom: Spacing.md }}>
            <Text style={{ color: colors.text.primary, fontSize: Typography.size.lg, fontFamily: Typography.fontBold }}>Выбор товара</Text>
            <TouchableOpacity onPress={onClose} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.bg.elevated, alignItems: "center", justifyContent: "center" }}>
              <Feather name="x" size={16} color={colors.text.primary} />
            </TouchableOpacity>
          </View>
          {/* Search */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: Spacing.base, marginBottom: Spacing.sm, backgroundColor: colors.bg.elevated, borderRadius: Radii.md, borderWidth: 1, borderColor: colors.border.default, paddingHorizontal: 14, paddingVertical: 10 }}>
            <Feather name="search" size={16} color={colors.text.muted} />
            <TextInput style={{ flex: 1, color: colors.text.primary, fontSize: Typography.size.base, fontFamily: Typography.fontRegular }} placeholder="Название или артикул…" placeholderTextColor={colors.text.muted} value={search} onChangeText={setSearch} autoFocus />
            {search.length > 0 && <TouchableOpacity onPress={() => setSearch("")}><Feather name="x-circle" size={16} color={colors.text.muted} /></TouchableOpacity>}
          </View>
          {/* Product list */}
          {isLoading ? (
            <View style={{ padding: Spacing.base, gap: 10 }}>{[1, 2, 3, 4, 5].map(i => <Skeleton key={i} height={60} radius={Radii.lg} />)}</View>
          ) : (
            <FlatList data={filtered} keyExtractor={p => String(p.id)} contentContainerStyle={{ padding: Spacing.base, gap: 8 }} keyboardShouldPersistTaps="handled"
              ListEmptyComponent={<View style={{ alignItems: "center", paddingVertical: 40 }}><Feather name="search" size={28} color={colors.text.muted} /><Text style={{ fontSize: Typography.size.base, color: colors.text.secondary, marginTop: Spacing.md }}>Товар не найден</Text></View>}
              renderItem={({ item: p }) => {
                const added = already.has(p.id);
                return (
                  <PressableScale onPress={() => {
                    if (added) return;
                    onChange([...lines, { productId: p.id, name: p.name, unitPrice: Number(p.unitPrice), quantity: "1", discount: "0", available: Number(p.available), unit: p.unit }]);
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }} haptic="light">
                    <Card style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 12, marginBottom: 4, borderWidth: 1, borderColor: added ? colors.status.success : colors.border.default, backgroundColor: added ? colors.status.success + "0D" : colors.bg.card }}>
                      <View style={{ width: 36, height: 36, borderRadius: Radii.md, backgroundColor: added ? colors.status.success + "20" : colors.bg.elevated, alignItems: "center", justifyContent: "center" }}>
                        <Feather name={added ? "check" : "package"} size={16} color={added ? colors.status.success : colors.text.muted} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: added ? colors.text.secondary : colors.text.primary, fontSize: Typography.size.sm, fontFamily: Typography.fontSemibold }} numberOfLines={1}>{p.name}</Text>
                        <View style={{ flexDirection: "row", gap: 6, marginTop: 2 }}>
                          {p.code && <Text style={{ fontSize: Typography.size.xs, color: colors.text.tertiary, backgroundColor: colors.bg.elevated, paddingHorizontal: 4, borderRadius: 4 }}>{p.code}</Text>}
                          <Text style={{ fontSize: Typography.size.xs, color: colors.accent.primary, fontFamily: Typography.fontMedium }}>{Number(p.unitPrice).toLocaleString("ru")} сум</Text>
                        </View>
                      </View>
                      {added ? (
                        <Text style={{ fontSize: Typography.size.xs, color: colors.status.success, fontFamily: Typography.fontSemibold }}>В корзине</Text>
                      ) : (
                        <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.accent.primary, alignItems: "center", justifyContent: "center" }}>
                          <Feather name="plus" size={14} color="#fff" />
                        </View>
                      )}
                    </Card>
                  </PressableScale>
                );
              }}
            />
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── Step 3: Review ───────────────────────────────────────────────────────────
function ReviewStep({ shopName, lines, notes, onNotesChange, paymentMethod, onPaymentChange, colors }: {
  shopName: string; lines: OrderLine[]; notes: string; onNotesChange: (v: string) => void;
  paymentMethod: string; onPaymentChange: (v: string) => void; colors: ThemeColors;
}) {
  const { subtotal, totalQty } = useMemo(() => {
    let sub = 0, qty = 0;
    for (const l of lines) { sub += l.unitPrice * Number(l.quantity || 0) * (1 - Number(l.discount || 0) / 100); qty += Number(l.quantity || 0); }
    return { subtotal: sub, totalQty: qty };
  }, [lines]);

  const PAYMENT_OPTIONS = [
    { key: "cash", label: "Наличные", icon: "dollar-sign" as const },
    { key: "card", label: "Карта", icon: "credit-card" as const },
    { key: "transfer", label: "Перевод", icon: "send" as const },
    { key: "debt", label: "Долг", icon: "alert-circle" as const },
  ];

  return (
    <View style={{ padding: Spacing.base, gap: Spacing.sm }}>
      {/* Shop card */}
      <Card style={{ flexDirection: "row", alignItems: "center", gap: 14, padding: 16 }}>
        <View style={{ width: 42, height: 42, borderRadius: Radii.lg, backgroundColor: colors.accent.primary + "20", alignItems: "center", justifyContent: "center" }}>
          <Feather name="shopping-bag" size={20} color={colors.accent.primary} />
        </View>
        <View>
          <Text style={{ fontSize: Typography.size.xs, color: colors.text.tertiary, fontFamily: Typography.fontBold, letterSpacing: 1 }}>МАГАЗИН</Text>
          <Text style={{ fontSize: Typography.size.base, fontFamily: Typography.fontBold, color: colors.text.primary, marginTop: 2 }}>{shopName}</Text>
        </View>
      </Card>

      {/* Payment method */}
      <Card style={{ padding: Spacing.base }}>
        <Text style={{ fontSize: Typography.size.xs, color: colors.text.tertiary, fontFamily: Typography.fontBold, letterSpacing: 1, marginBottom: Spacing.md }}>СПОСОБ ОПЛАТЫ</Text>
        <View style={{ flexDirection: "row", gap: Spacing.sm }}>
          {PAYMENT_OPTIONS.map(opt => {
            const active = paymentMethod === opt.key;
            return (
              <PressableScale key={opt.key} onPress={() => onPaymentChange(opt.key)} haptic="light" style={{ flex: 1 }}>
                <View style={{
                  alignItems: "center", gap: 6, paddingVertical: 12,
                  borderRadius: Radii.md, borderWidth: 1.5,
                  backgroundColor: active ? colors.accent.primary + "12" : colors.bg.elevated,
                  borderColor: active ? colors.accent.primary : colors.border.default,
                }}>
                  <Feather name={opt.icon} size={18} color={active ? colors.accent.primary : colors.text.secondary} />
                  <Text style={{ fontSize: Typography.size.xs, fontFamily: Typography.fontSemibold, color: active ? colors.accent.primary : colors.text.secondary }}>{opt.label}</Text>
                </View>
              </PressableScale>
            );
          })}
        </View>
      </Card>
      {/* Items table */}
      <Card style={{ padding: 0, overflow: "hidden" }}>
        {/* Header */}
        <View style={{ flexDirection: "row", paddingHorizontal: Spacing.base, paddingVertical: 10, backgroundColor: colors.bg.elevated, borderBottomWidth: 1, borderBottomColor: colors.border.subtle }}>
          <Text style={{ flex: 3, fontSize: Typography.size.xs, fontFamily: Typography.fontBold, color: colors.text.tertiary, letterSpacing: 0.5 }}>ТОВАР</Text>
          <Text style={{ flex: 1, fontSize: Typography.size.xs, fontFamily: Typography.fontBold, color: colors.text.tertiary, textAlign: "right" }}>КОЛ</Text>
          <Text style={{ flex: 2, fontSize: Typography.size.xs, fontFamily: Typography.fontBold, color: colors.text.tertiary, textAlign: "right" }}>СУММА</Text>
        </View>
        {lines.map(l => {
          const total = l.unitPrice * Number(l.quantity || 0) * (1 - Number(l.discount || 0) / 100);
          return (
            <View key={l.productId} style={{ flexDirection: "row", paddingHorizontal: Spacing.base, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border.subtle }}>
              <View style={{ flex: 3, gap: 2 }}>
                <Text style={{ fontSize: Typography.size.sm, color: colors.text.secondary }} numberOfLines={1}>{l.name}</Text>
                {Number(l.discount) > 0 && <Text style={{ fontSize: Typography.size.xs, color: colors.status.success }}>−{l.discount}% скидка</Text>}
              </View>
              <Text style={{ flex: 1, fontSize: Typography.size.sm, color: colors.text.secondary, textAlign: "right" }}>{l.quantity}</Text>
              <Text style={{ flex: 2, fontSize: Typography.size.sm, fontFamily: Typography.fontSemibold, color: colors.text.primary, textAlign: "right" }}>{total.toLocaleString("ru")}</Text>
            </View>
          );
        })}
        {/* Total */}
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: Spacing.base, paddingVertical: 14, backgroundColor: colors.accent.primary + "10" }}>
          <Text style={{ fontSize: Typography.size.xs, fontFamily: Typography.fontBold, color: colors.text.secondary, letterSpacing: 0.5 }}>ИТОГО — {lines.length} поз., {totalQty} кг</Text>
          <Text style={{ fontSize: Typography.size.base, fontFamily: Typography.fontBold, color: colors.accent.primary }}>{subtotal.toLocaleString("ru")} сум</Text>
        </View>
      </Card>
      {/* Notes */}
      <Card style={{ gap: 8, padding: Spacing.base }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Feather name="edit-3" size={14} color={colors.text.tertiary} />
          <Text style={{ fontSize: Typography.size.sm, fontFamily: Typography.fontSemibold, color: colors.text.secondary }}>Примечания</Text>
          <Text style={{ fontSize: Typography.size.xs, color: colors.text.tertiary }}>необязательно</Text>
        </View>
        <TextInput value={notes} onChangeText={onNotesChange} placeholder="Комментарий к заказу…" placeholderTextColor={colors.text.tertiary} multiline numberOfLines={3} textAlignVertical="top"
          style={{ backgroundColor: colors.bg.elevated, borderRadius: Radii.md, borderWidth: 1, borderColor: colors.border.default, padding: Spacing.base, fontSize: Typography.size.base, fontFamily: Typography.fontRegular, color: colors.text.primary, minHeight: 80 }} />
      </Card>
    </View>
  );
}

// ── Main Screen ──────────────────────────────────────────────────────────────
export default function NewOrderScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ shopId?: string; shopName?: string; productId?: string; productName?: string; productPrice?: string }>();
  const { addOrder } = useOfflineStore();

  const [step, setStep] = useState(params.productId ? 1 : params.shopId ? 2 : 1);
  const [selectedShop, setSelectedShop] = useState<Shop | null>(
    params.shopId ? ({ id: Number(params.shopId), name: params.shopName ?? "" } as Shop) : null
  );
  const [lines, setLines] = useState<OrderLine[]>(() => {
    if (params.productId && params.productPrice) {
      return [{ productId: Number(params.productId), name: params.productName ?? "", unitPrice: Number(params.productPrice), quantity: "1", discount: "0", available: 0 }];
    }
    return [];
  });
  const [notes, setNotes] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");

  const createMutation = useMutation({
    mutationFn: createOrder,
    onSuccess: () => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); notify.success("Заказ создан!"); router.back(); },
    onError: (e: Error) => notify.error(e.message ?? "Ошибка"),
  });

  const canNext = step === 1 ? !!selectedShop : step === 2 ? lines.length > 0 && lines.every(l => Number(l.quantity) > 0) : true;

  const handleSubmit = async () => {
    if (!selectedShop) return;
    const input = {
      shopId: selectedShop.id, notes, paymentMethod: paymentMethod as "cash" | "card" | "transfer" | "debt",
      items: lines.map(l => ({ productId: l.productId, quantity: Number(l.quantity), unitPrice: l.unitPrice, discount: Number(l.discount || 0) })),
    };
    const net = await Network.getNetworkStateAsync();
    if (!net.isConnected) {
      await addOrder({ id: Date.now().toString(), input, shopName: selectedShop.name ?? "", createdAt: new Date().toISOString(), synced: false });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      notify.info("Нет подключения. Заказ сохранён офлайн.");
      router.back();
      return;
    }
    createMutation.mutate(input);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      {/* Header */}
      <View style={{ paddingTop: insets.top + Spacing.sm, paddingHorizontal: Spacing.base, paddingBottom: Spacing.md }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <TouchableOpacity onPress={() => step > 1 ? setStep(s => s - 1) : router.back()}
            style={{ width: 36, height: 36, borderRadius: Radii.md, backgroundColor: colors.bg.elevated, borderWidth: 1, borderColor: colors.border.default, alignItems: "center", justifyContent: "center" }}>
            <Feather name="arrow-left" size={18} color={colors.text.primary} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: Typography.size.lg, fontFamily: Typography.fontBold, color: colors.text.primary }}>Новый заказ</Text>
            {selectedShop && step > 1 && <Text style={{ fontSize: Typography.size.xs, color: colors.text.secondary, marginTop: 1 }}>{selectedShop.name}</Text>}
          </View>
        </View>
      </View>

      {/* Step indicator */}
      <StepIndicator step={step} total={3} colors={colors} />

      {/* Content */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 140 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {step === 1 && <ShopPicker selectedId={selectedShop?.id ?? 0} onSelect={(s) => { setSelectedShop(s); setStep(2); }} colors={colors} />}
        {step === 2 && <ProductStep lines={lines} onChange={setLines} colors={colors} />}
        {step === 3 && <ReviewStep shopName={selectedShop?.name ?? ""} lines={lines} notes={notes} onNotesChange={setNotes} paymentMethod={paymentMethod} onPaymentChange={setPaymentMethod} colors={colors} />}
      </ScrollView>

      {/* Bottom CTA */}
      <View style={{ padding: Spacing.base, paddingBottom: insets.bottom + Spacing.lg, borderTopWidth: 1, borderTopColor: colors.border.default, backgroundColor: colors.bg.secondary }}>
        {step < 3 ? (
          <PressableScale onPress={() => { setStep(s => s + 1); }} disabled={!canNext} haptic="medium">
            <View style={{ backgroundColor: colors.accent.primary, borderRadius: Radii.md, padding: 16, alignItems: "center", opacity: canNext ? 1 : 0.45 }}>
              <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.md, color: "#fff" }}>Продолжить →</Text>
            </View>
          </PressableScale>
        ) : (
          <PressableScale onPress={handleSubmit} disabled={createMutation.isPending} haptic="medium">
            <View style={{ backgroundColor: colors.accent.primary, borderRadius: Radii.md, padding: 16, alignItems: "center", opacity: createMutation.isPending ? 0.6 : 1 }}>
              {createMutation.isPending ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.md, color: "#fff" }}>Подтвердить заказ</Text>
              )}
            </View>
          </PressableScale>
        )}
      </View>
    </View>
  );
}
