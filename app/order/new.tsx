import { useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  FlatList,
  Animated,
  Modal,
  Pressable,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { notify } from "../../src/store/toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import * as Network from "expo-network";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { getMyShops, getProducts, createOrder, Product, Shop } from "../../src/api";
import { useOfflineStore } from "../../src/store/offline";
import { Card, Button, Skeleton, IconCircle, Badge } from "../../src/components/ui";
import { Typography, Spacing, Radii, Gradients, Shadows, ThemeColors } from "../../src/theme";
import { useThemeColors } from "../../src/store/theme";

type IconName = keyof typeof Feather.glyphMap;

interface OrderLine {
  productId: number;
  name: string;
  unitPrice: number;
  quantity: string;
  discount: string;
  available: number;
  unit?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Step header — slim gradient pill with step number + label
// ─────────────────────────────────────────────────────────────────────────────
function StepHeader({ step, total, colors }: { step: number; total: number; colors: ThemeColors }) {
  const sh = makeShStyles(colors);
  const labels = ["Выберите магазин", "Добавьте товары", "Проверьте заказ"];
  const icons: IconName[] = ["shopping-bag", "package", "check-circle"];

  return (
    <View style={sh.wrap}>
      {/* Progress bar */}
      <View style={sh.track}>
        <Animated.View style={[sh.fill, { width: `${(step / total) * 100}%` }]} />
      </View>

      {/* Current step label */}
      <View style={sh.label}>
        <LinearGradient colors={Gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={sh.badge}>
          <Text style={sh.badgeNum}>{step}</Text>
        </LinearGradient>
        <View>
          <Text style={sh.sub}>ШАГ {step} ИЗ {total}</Text>
          <Text style={sh.title}>{labels[step - 1]}</Text>
        </View>
        <View style={{ flex: 1 }} />
        <View style={sh.dots}>
          {Array.from({ length: total }).map((_, i) => (
            <View
              key={i}
              style={[
                sh.dot,
                i + 1 === step && sh.dotActive,
                i + 1 < step && sh.dotDone,
              ]}
            />
          ))}
        </View>
      </View>
    </View>
  );
}
function makeShStyles(colors: ThemeColors) {
  return {
    wrap: { backgroundColor: colors.bg.secondary, paddingHorizontal: Spacing.base, paddingBottom: Spacing.base, borderBottomWidth: 1, borderBottomColor: colors.border.subtle },
    track: { height: 3, backgroundColor: colors.border.default, borderRadius: 2, marginBottom: Spacing.base, overflow: "hidden" as const },
    fill: { height: "100%" as const, borderRadius: 2, backgroundColor: colors.brand.primary },
    label: { flexDirection: "row" as const, alignItems: "center" as const, gap: 12 },
    badge: { width: 34, height: 34, borderRadius: Radii.full, alignItems: "center" as const, justifyContent: "center" as const },
    badgeNum: { fontSize: Typography.size.sm, fontFamily: Typography.fontBold, color: "#fff" },
    sub: { fontSize: 10, color: colors.text.muted, fontFamily: Typography.fontBold, letterSpacing: 1, marginBottom: 2 },
    title: { fontSize: Typography.size.base, color: colors.text.primary, fontFamily: Typography.fontBold },
    dots: { flexDirection: "row" as const, gap: 5 },
    dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.border.strong },
    dotActive: { backgroundColor: colors.brand.primary, width: 18 },
    dotDone: { backgroundColor: colors.brand.primaryLight },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 1 — Shop picker (clean list, no modal)
// ─────────────────────────────────────────────────────────────────────────────
function StepShop({ selectedId, onSelect, colors }: { selectedId: number; onSelect: (s: Shop) => void; colors: ThemeColors }) {
  const s1 = makeS1Styles(colors);
  const [search, setSearch] = useState("");
  const { data: shops, isLoading } = useQuery({ queryKey: ["myShops"], queryFn: getMyShops });

  const filtered = (shops ?? []).filter(
    (s) =>
      !search ||
      s.name?.toLowerCase().includes(search.toLowerCase()) ||
      s.ownerName?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <View style={s1.wrap}>
      {/* Search */}
      <View style={s1.searchBox}>
        <Feather name="search" size={16} color={colors.text.muted} />
        <TextInput
          style={s1.searchInput}
          placeholder="Поиск магазинов…"
          placeholderTextColor={colors.text.muted}
          value={search}
          onChangeText={setSearch}
          autoFocus
          autoCapitalize="none"
        />
        {!!search && (
          <TouchableOpacity onPress={() => setSearch("")}>
            <Feather name="x" size={15} color={colors.text.muted} />
          </TouchableOpacity>
        )}
      </View>

      {isLoading ? (
        <View style={{ gap: 10 }}>
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} height={72} radius={Radii.lg} />)}
        </View>
      ) : filtered.length === 0 ? (
        <View style={s1.empty}>
          <Feather name="search" size={32} color={colors.text.muted} />
          <Text style={s1.emptyTitle}>Ничего не найдено</Text>
          <Text style={s1.emptySub}>Попробуйте другое название</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(s) => String(s.id)}
          scrollEnabled={false}
          renderItem={({ item }) => {
            const selected = item.id === selectedId;
            const hasDebt = Number(item.debt ?? 0) > 0;
            return (
              <TouchableOpacity
                style={[s1.shopRow, selected && s1.shopRowSelected]}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onSelect(item); }}
                activeOpacity={0.7}
              >
                {/* Left icon */}
                <View style={[s1.shopIcon, selected && s1.shopIconSelected]}>
                  <Feather name="shopping-bag" size={18} color={selected ? colors.brand.primary : colors.text.muted} />
                </View>

                {/* Info */}
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[s1.shopName, selected && s1.shopNameSelected]}>{item.name}</Text>
                  <Text style={s1.shopMeta} numberOfLines={1}>
                    {[item.ownerName, item.city].filter(Boolean).join(" · ") || "—"}
                  </Text>
                  {hasDebt && (
                    <View style={s1.debtChip}>
                      <Feather name="alert-circle" size={10} color={colors.status.danger} />
                      <Text style={s1.debtText}>Долг: {Number(item.debt).toLocaleString("ru")} сум</Text>
                    </View>
                  )}
                </View>

                {/* Check */}
                {selected ? (
                  <LinearGradient colors={Gradients.primary} style={s1.check}>
                    <Feather name="check" size={14} color="#fff" />
                  </LinearGradient>
                ) : (
                  <View style={s1.checkEmpty} />
                )}
              </TouchableOpacity>
            );
          }}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        />
      )}
    </View>
  );
}
function makeS1Styles(colors: ThemeColors) {
  return {
    wrap: { padding: Spacing.base, gap: Spacing.md },
    searchBox: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 10,
      backgroundColor: colors.bg.elevated,
      borderRadius: Radii.lg,
      paddingHorizontal: Spacing.md,
      paddingVertical: 12,
      borderWidth: 1,
      borderColor: colors.border.default,
    },
    searchInput: { flex: 1, fontSize: Typography.size.base, color: colors.text.primary, fontFamily: Typography.fontBody },
    empty: { alignItems: "center" as const, paddingVertical: 60, gap: 8 },
    emptyTitle: { fontSize: Typography.size.base, fontFamily: Typography.fontSemibold, color: colors.text.secondary },
    emptySub: { fontSize: Typography.size.sm, color: colors.text.muted },
    shopRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 12,
      backgroundColor: colors.bg.card,
      borderRadius: Radii.lg,
      padding: 14,
      borderWidth: 1.5,
      borderColor: colors.border.default,
    },
    shopRowSelected: {
      borderColor: colors.brand.primary,
      backgroundColor: "rgba(99,102,241,0.07)",
    },
    shopIcon: {
      width: 42, height: 42, borderRadius: Radii.md,
      backgroundColor: colors.bg.elevated,
      alignItems: "center" as const, justifyContent: "center" as const,
    },
    shopIconSelected: { backgroundColor: colors.brand.primaryDim },
    shopName: { fontSize: Typography.size.base, fontFamily: Typography.fontSemibold, color: colors.text.primary },
    shopNameSelected: { color: colors.brand.primaryLight },
    shopMeta: { fontSize: Typography.size.sm, color: colors.text.muted },
    debtChip: { flexDirection: "row" as const, alignItems: "center" as const, gap: 4, marginTop: 2 },
    debtText: { fontSize: 11, color: colors.status.danger, fontFamily: Typography.fontMedium },
    check: { width: 28, height: 28, borderRadius: Radii.full, alignItems: "center" as const, justifyContent: "center" as const },
    checkEmpty: { width: 28, height: 28, borderRadius: Radii.full, borderWidth: 1.5, borderColor: colors.border.strong },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Product picker modal — full-screen bottom sheet feel
// ─────────────────────────────────────────────────────────────────────────────
function ProductPickerModal({
  visible,
  onClose,
  onAdd,
  already,
  colors,
}: {
  visible: boolean;
  onClose: () => void;
  onAdd: (p: Product) => void;
  already: number[];
  colors: ThemeColors;
}) {
  const pm = makePmStyles(colors);
  const [search, setSearch] = useState("");
  const { data: products, isLoading } = useQuery({ queryKey: ["products"], queryFn: getProducts });

  const filtered = (products ?? []).filter(
    (p) =>
      !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.code ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={pm.root}>
        {/* Handle */}
        <View style={pm.handle} />

        {/* Header */}
        <View style={pm.header}>
          <View>
            <Text style={pm.title}>Выбор товара</Text>
            <Text style={pm.sub}>{products?.length ?? 0} позиций в каталоге</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={pm.closeBtn}>
            <Feather name="x" size={18} color={colors.text.primary} />
          </TouchableOpacity>
        </View>

        {/* Search */}
        <View style={pm.searchWrap}>
          <Feather name="search" size={16} color={colors.text.muted} />
          <TextInput
            style={pm.searchInput}
            placeholder="Название или артикул…"
            placeholderTextColor={colors.text.muted}
            value={search}
            onChangeText={setSearch}
            autoFocus
            autoCapitalize="none"
          />
          {!!search && (
            <TouchableOpacity onPress={() => setSearch("")}>
              <Feather name="x-circle" size={16} color={colors.text.muted} />
            </TouchableOpacity>
          )}
        </View>

        {/* List */}
        {isLoading ? (
          <View style={{ padding: Spacing.base, gap: 10 }}>
            {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} height={64} radius={Radii.md} />)}
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(p) => String(p.id)}
            contentContainerStyle={{ padding: Spacing.base, gap: 8 }}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const added = already.includes(item.id);
              return (
                <TouchableOpacity
                  style={[pm.item, added && pm.itemAdded]}
                  onPress={() => { if (!added) { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onAdd(item); } }}
                  activeOpacity={added ? 1 : 0.7}
                >
                  {/* Icon */}
                  <View style={[pm.itemIcon, added && pm.itemIconAdded]}>
                    <Feather name="package" size={16} color={added ? colors.status.success : colors.text.muted} />
                  </View>

                  {/* Info */}
                  <View style={{ flex: 1 }}>
                    <Text style={[pm.itemName, added && pm.itemNameAdded]} numberOfLines={1}>{item.name}</Text>
                    <View style={pm.itemMeta}>
                      {item.code && <Text style={pm.itemCode}>{item.code}</Text>}
                      <Text style={pm.itemPrice}>{Number(item.unitPrice).toLocaleString("ru")} сум</Text>
                      <Text style={pm.itemStock}>• {item.available} {item.unit ?? "кг"}</Text>
                    </View>
                  </View>

                  {/* Action */}
                  {added ? (
                    <View style={pm.addedBadge}>
                      <Feather name="check" size={13} color={colors.status.success} />
                      <Text style={pm.addedText}>Добавлен</Text>
                    </View>
                  ) : (
                    <LinearGradient colors={Gradients.primary} style={pm.addBtn}>
                      <Feather name="plus" size={16} color="#fff" />
                    </LinearGradient>
                  )}
                </TouchableOpacity>
              );
            }}
          />
        )}
      </View>
    </Modal>
  );
}
function makePmStyles(colors: ThemeColors) {
  return {
    root: { flex: 1, backgroundColor: colors.bg.primary },
    handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border.strong, alignSelf: "center" as const, marginTop: 12, marginBottom: 4 },
    header: { flexDirection: "row" as const, justifyContent: "space-between" as const, alignItems: "flex-start" as const, paddingHorizontal: Spacing.base, paddingVertical: Spacing.md },
    title: { fontSize: Typography.size.lg, fontFamily: Typography.fontBold, color: colors.text.primary },
    sub: { fontSize: Typography.size.sm, color: colors.text.muted, marginTop: 2 },
    closeBtn: { width: 36, height: 36, borderRadius: Radii.full, backgroundColor: colors.bg.elevated, alignItems: "center" as const, justifyContent: "center" as const },
    searchWrap: {
      flexDirection: "row" as const, alignItems: "center" as const, gap: 10,
      marginHorizontal: Spacing.base, marginBottom: Spacing.sm,
      backgroundColor: colors.bg.elevated, borderRadius: Radii.lg,
      paddingHorizontal: Spacing.md, paddingVertical: 12,
      borderWidth: 1, borderColor: colors.border.default,
    },
    searchInput: { flex: 1, fontSize: Typography.size.base, color: colors.text.primary, fontFamily: Typography.fontBody },
    item: {
      flexDirection: "row" as const, alignItems: "center" as const, gap: 12,
      backgroundColor: colors.bg.card, borderRadius: Radii.lg,
      padding: 12, borderWidth: 1, borderColor: colors.border.subtle,
    },
    itemAdded: { borderColor: "rgba(34,211,168,0.3)", backgroundColor: "rgba(34,211,168,0.04)" },
    itemIcon: { width: 38, height: 38, borderRadius: Radii.md, backgroundColor: colors.bg.elevated, alignItems: "center" as const, justifyContent: "center" as const },
    itemIconAdded: { backgroundColor: "rgba(34,211,168,0.12)" },
    itemName: { fontSize: Typography.size.sm, fontFamily: Typography.fontSemibold, color: colors.text.primary },
    itemNameAdded: { color: colors.text.secondary },
    itemMeta: { flexDirection: "row" as const, alignItems: "center" as const, gap: 6, marginTop: 3 },
    itemCode: { fontSize: 11, color: colors.text.muted, fontFamily: Typography.fontMono, backgroundColor: colors.bg.elevated, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 },
    itemPrice: { fontSize: 11, color: colors.brand.primaryLight, fontFamily: Typography.fontMedium },
    itemStock: { fontSize: 11, color: colors.text.muted },
    addBtn: { width: 32, height: 32, borderRadius: Radii.full, alignItems: "center" as const, justifyContent: "center" as const },
    addedBadge: { flexDirection: "row" as const, alignItems: "center" as const, gap: 4 },
    addedText: { fontSize: 11, color: colors.status.success, fontFamily: Typography.fontMedium },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 2 — Lines editor
// ─────────────────────────────────────────────────────────────────────────────
function StepItems({ lines, onChange, colors }: { lines: OrderLine[]; onChange: (l: OrderLine[]) => void; colors: ThemeColors }) {
  const s2 = makeS2Styles(colors);
  const [showPicker, setShowPicker] = useState(false);

  const addProduct = (p: Product) => {
    if (lines.find((l) => l.productId === p.id)) return;
    onChange([
      ...lines,
      { productId: p.id, name: p.name, unitPrice: Number(p.unitPrice), quantity: "1", discount: "0", available: Number(p.available), unit: p.unit },
    ]);
  };

  const updateLine = (idx: number, field: "quantity" | "discount", value: string) => {
    const next = [...lines];
    next[idx] = { ...next[idx], [field]: value };
    onChange(next);
  };

  const removeLine = (idx: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onChange(lines.filter((_, i) => i !== idx));
  };

  const lineTotal = (l: OrderLine) =>
    l.unitPrice * Number(l.quantity || 0) * (1 - Number(l.discount || 0) / 100);

  return (
    <View style={s2.wrap}>
      <ProductPickerModal
        visible={showPicker}
        onClose={() => setShowPicker(false)}
        onAdd={addProduct}
        already={lines.map((l) => l.productId)}
        colors={colors}
      />

      {/* Add button */}
      <TouchableOpacity style={s2.addBtn} onPress={() => setShowPicker(true)} activeOpacity={0.8}>
        <LinearGradient colors={["rgba(99,102,241,0.18)", "rgba(168,85,247,0.10)"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s2.addBtnInner}>
          <View style={s2.addBtnIcon}>
            <Feather name="plus" size={18} color={colors.brand.primaryLight} />
          </View>
          <Text style={s2.addBtnText}>Добавить товар</Text>
          <Feather name="chevron-right" size={16} color={colors.brand.primary} />
        </LinearGradient>
      </TouchableOpacity>

      {/* Empty */}
      {lines.length === 0 && (
        <View style={s2.empty}>
          <View style={s2.emptyIcon}>
            <Feather name="package" size={28} color={colors.text.muted} />
          </View>
          <Text style={s2.emptyTitle}>Корзина пуста</Text>
          <Text style={s2.emptySub}>Нажмите «Добавить товар» чтобы начать</Text>
        </View>
      )}

      {/* Lines */}
      {lines.map((line, idx) => {
        const total = lineTotal(line);
        const hasDiscount = Number(line.discount) > 0;
        return (
          <View key={line.productId} style={s2.lineCard}>
            {/* Header */}
            <View style={s2.lineHead}>
              <View style={s2.lineHeadLeft}>
                <View style={s2.lineNum}><Text style={s2.lineNumText}>{idx + 1}</Text></View>
                <Text style={s2.lineName} numberOfLines={2}>{line.name}</Text>
              </View>
              <TouchableOpacity onPress={() => removeLine(idx)} style={s2.lineRemove}>
                <Feather name="x" size={16} color={colors.text.muted} />
              </TouchableOpacity>
            </View>

            {/* Price + stock */}
            <View style={s2.linePriceMeta}>
              <Text style={s2.lineUnitPrice}>{line.unitPrice.toLocaleString("ru")} сум / {line.unit ?? "кг"}</Text>
              <View style={s2.lineStock}>
                <Feather name="layers" size={11} color={colors.text.muted} />
                <Text style={s2.lineStockText}>Остаток: {line.available}</Text>
              </View>
            </View>

            {/* Inputs row */}
            <View style={s2.inputsRow}>
              <View style={s2.inputField}>
                <Text style={s2.inputLabel}>КОЛ-ВО ({line.unit ?? "кг"})</Text>
                <TextInput
                  style={s2.input}
                  value={line.quantity}
                  onChangeText={(v) => updateLine(idx, "quantity", v.replace(",", "."))}
                  keyboardType="decimal-pad"
                  placeholderTextColor={colors.text.muted}
                  placeholder="0"
                  selectTextOnFocus
                />
              </View>
              <View style={s2.inputField}>
                <Text style={s2.inputLabel}>СКИДКА (%)</Text>
                <TextInput
                  style={s2.input}
                  value={line.discount}
                  onChangeText={(v) => updateLine(idx, "discount", v)}
                  keyboardType="decimal-pad"
                  placeholderTextColor={colors.text.muted}
                  placeholder="0"
                  selectTextOnFocus
                />
              </View>
              <View style={[s2.inputField, { flex: 1.4 }]}>
                <Text style={s2.inputLabel}>СУММА</Text>
                <View style={s2.totalBox}>
                  {hasDiscount && (
                    <Text style={s2.totalOriginal}>
                      {(line.unitPrice * Number(line.quantity || 0)).toLocaleString("ru")}
                    </Text>
                  )}
                  <Text style={s2.totalValue}>{total.toLocaleString("ru")}</Text>
                </View>
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}
function makeS2Styles(colors: ThemeColors) {
  return {
    wrap: { padding: Spacing.base, gap: Spacing.sm },
    addBtn: { borderRadius: Radii.xl, overflow: "hidden" as const, ...Shadows.sm },
    addBtnInner: {
      flexDirection: "row" as const, alignItems: "center" as const, gap: 12,
      padding: 16,
      borderWidth: 1, borderColor: "rgba(99,102,241,0.3)",
      borderRadius: Radii.xl,
    },
    addBtnIcon: { width: 34, height: 34, borderRadius: Radii.full, backgroundColor: colors.brand.primaryDim, alignItems: "center" as const, justifyContent: "center" as const },
    addBtnText: { flex: 1, fontSize: Typography.size.base, fontFamily: Typography.fontSemibold, color: colors.brand.primaryLight },
    empty: { alignItems: "center" as const, paddingVertical: 56, gap: 10 },
    emptyIcon: { width: 68, height: 68, borderRadius: Radii.xl, backgroundColor: colors.bg.elevated, alignItems: "center" as const, justifyContent: "center" as const, marginBottom: 4 },
    emptyTitle: { fontSize: Typography.size.base, fontFamily: Typography.fontSemibold, color: colors.text.secondary },
    emptySub: { fontSize: Typography.size.sm, color: colors.text.muted, textAlign: "center" as const },

    lineCard: {
      backgroundColor: colors.bg.card,
      borderRadius: Radii.xl,
      padding: Spacing.base,
      borderWidth: 1,
      borderColor: colors.border.default,
      gap: 10,
    },
    lineHead: { flexDirection: "row" as const, alignItems: "flex-start" as const, gap: 10 },
    lineHeadLeft: { flex: 1, flexDirection: "row" as const, alignItems: "flex-start" as const, gap: 10 },
    lineNum: { width: 22, height: 22, borderRadius: Radii.full, backgroundColor: colors.brand.primaryDim, alignItems: "center" as const, justifyContent: "center" as const, marginTop: 1 },
    lineNumText: { fontSize: 11, fontFamily: Typography.fontBold, color: colors.brand.primaryLight },
    lineName: { flex: 1, fontSize: Typography.size.base, fontFamily: Typography.fontSemibold, color: colors.text.primary, lineHeight: 20 },
    lineRemove: { width: 30, height: 30, borderRadius: Radii.full, backgroundColor: colors.bg.elevated, alignItems: "center" as const, justifyContent: "center" as const },

    linePriceMeta: { flexDirection: "row" as const, justifyContent: "space-between" as const, alignItems: "center" as const },
    lineUnitPrice: { fontSize: Typography.size.xs, color: colors.text.muted, fontFamily: Typography.fontMedium },
    lineStock: { flexDirection: "row" as const, alignItems: "center" as const, gap: 4 },
    lineStockText: { fontSize: Typography.size.xs, color: colors.text.muted },

    inputsRow: { flexDirection: "row" as const, gap: 8 },
    inputField: { flex: 1, gap: 5 },
    inputLabel: { fontSize: 10, color: colors.text.muted, fontFamily: Typography.fontBold, letterSpacing: 0.8 },
    input: {
      backgroundColor: colors.bg.elevated,
      borderRadius: Radii.md,
      borderWidth: 1,
      borderColor: colors.border.default,
      paddingVertical: 10,
      paddingHorizontal: 8,
      fontSize: Typography.size.base,
      fontFamily: Typography.fontSemibold,
      color: colors.text.primary,
      textAlign: "center" as const,
      fontVariant: ["tabular-nums" as const],
    },
    totalBox: {
      backgroundColor: colors.brand.primaryDim,
      borderRadius: Radii.md,
      paddingVertical: 10,
      paddingHorizontal: 8,
      alignItems: "center" as const,
      gap: 1,
    },
    totalOriginal: { fontSize: 10, color: colors.text.muted, textDecorationLine: "line-through" as const, fontVariant: ["tabular-nums" as const] },
    totalValue: { fontSize: Typography.size.sm, fontFamily: Typography.fontBold, color: colors.brand.primaryLight, fontVariant: ["tabular-nums" as const] },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 3 — Review
// ─────────────────────────────────────────────────────────────────────────────
function StepReview({ shopName, lines, notes, onNotesChange, colors }: {
  shopName: string; lines: OrderLine[]; notes: string; onNotesChange: (v: string) => void; colors: ThemeColors;
}) {
  const s3 = makeS3Styles(colors);
  const subtotal = lines.reduce(
    (s, l) => s + l.unitPrice * Number(l.quantity || 0) * (1 - Number(l.discount || 0) / 100), 0
  );
  const totalQty = lines.reduce((s, l) => s + Number(l.quantity || 0), 0);

  return (
    <View style={s3.wrap}>
      {/* Shop */}
      <View style={s3.shopCard}>
        <View style={s3.shopIcon}>
          <Feather name="shopping-bag" size={20} color={colors.brand.primary} />
        </View>
        <View>
          <Text style={s3.shopLabel}>МАГАЗИН</Text>
          <Text style={s3.shopName}>{shopName}</Text>
        </View>
      </View>

      {/* Items summary */}
      <View style={s3.tableCard}>
        <View style={s3.tableHeaderRow}>
          <Text style={[s3.tableHead, { flex: 3 }]}>Товар</Text>
          <Text style={[s3.tableHead, s3.right, { flex: 1 }]}>Кол</Text>
          <Text style={[s3.tableHead, s3.right, { flex: 2 }]}>Сумма</Text>
        </View>
        {lines.map((l) => {
          const total = l.unitPrice * Number(l.quantity || 0) * (1 - Number(l.discount || 0) / 100);
          const hasDiscount = Number(l.discount) > 0;
          return (
            <View key={l.productId} style={s3.tableRow}>
              <View style={{ flex: 3, gap: 2 }}>
                <Text style={s3.tableCell} numberOfLines={1}>{l.name}</Text>
                {hasDiscount && <Text style={s3.discountNote}>−{l.discount}% скидка</Text>}
              </View>
              <Text style={[s3.tableCell, s3.right, { flex: 1 }]}>{l.quantity}</Text>
              <Text style={[s3.tableCell, s3.right, s3.tableCellBold, { flex: 2 }]}>
                {total.toLocaleString("ru")}
              </Text>
            </View>
          );
        })}

        {/* Total row */}
        <LinearGradient colors={Gradients.primarySoft} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s3.totalRow}>
          <Text style={s3.totalLabel}>ИТОГО — {lines.length} позиций, {totalQty.toLocaleString("ru")} кг</Text>
          <Text style={s3.totalValue}>{subtotal.toLocaleString("ru")} сум</Text>
        </LinearGradient>
      </View>

      {/* Notes */}
      <View style={s3.notesSection}>
        <View style={s3.notesLabel}>
          <Feather name="edit-3" size={14} color={colors.text.muted} />
          <Text style={s3.notesLabelText}>Примечания к заказу</Text>
          <Text style={s3.notesOptional}>необязательно</Text>
        </View>
        <TextInput
          style={s3.notesInput}
          value={notes}
          onChangeText={onNotesChange}
          placeholder="Добавьте комментарий — время доставки, особые условия…"
          placeholderTextColor={colors.text.muted}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
        />
      </View>
    </View>
  );
}
function makeS3Styles(colors: ThemeColors) {
  return {
    wrap: { padding: Spacing.base, gap: Spacing.sm },
    shopCard: {
      flexDirection: "row" as const, alignItems: "center" as const, gap: 14,
      backgroundColor: colors.bg.card, borderRadius: Radii.xl,
      padding: 16, borderWidth: 1, borderColor: colors.border.default,
    },
    shopIcon: { width: 46, height: 46, borderRadius: Radii.lg, backgroundColor: colors.brand.primaryDim, alignItems: "center" as const, justifyContent: "center" as const },
    shopLabel: { fontSize: 10, color: colors.text.muted, fontFamily: Typography.fontBold, letterSpacing: 1, marginBottom: 3 },
    shopName: { fontSize: Typography.size.base, fontFamily: Typography.fontBold, color: colors.text.primary },
    tableCard: { backgroundColor: colors.bg.card, borderRadius: Radii.xl, borderWidth: 1, borderColor: colors.border.default, overflow: "hidden" as const },
    tableHeaderRow: { flexDirection: "row" as const, paddingHorizontal: Spacing.base, paddingVertical: 10, backgroundColor: colors.bg.elevated, borderBottomWidth: 1, borderBottomColor: colors.border.subtle },
    tableHead: { fontSize: 11, fontFamily: Typography.fontBold, color: colors.text.muted, letterSpacing: 0.5, textTransform: "uppercase" as const },
    tableRow: { flexDirection: "row" as const, alignItems: "flex-start" as const, paddingHorizontal: Spacing.base, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border.subtle },
    tableCell: { fontSize: Typography.size.sm, color: colors.text.secondary, fontFamily: Typography.fontBody },
    tableCellBold: { color: colors.text.primary, fontFamily: Typography.fontSemibold, fontVariant: ["tabular-nums" as const] },
    discountNote: { fontSize: 10, color: colors.status.success, fontFamily: Typography.fontMedium },
    right: { textAlign: "right" as const },
    totalRow: { flexDirection: "row" as const, justifyContent: "space-between" as const, alignItems: "center" as const, paddingHorizontal: Spacing.base, paddingVertical: 14 },
    totalLabel: { fontSize: 11, fontFamily: Typography.fontBold, color: colors.text.secondary, letterSpacing: 0.5 },
    totalValue: { fontSize: Typography.size.base, fontFamily: Typography.fontBold, color: colors.text.primary, fontVariant: ["tabular-nums" as const] },
    notesSection: { gap: 8 },
    notesLabel: { flexDirection: "row" as const, alignItems: "center" as const, gap: 6 },
    notesLabelText: { fontSize: Typography.size.sm, fontFamily: Typography.fontSemibold, color: colors.text.secondary },
    notesOptional: { fontSize: Typography.size.xs, color: colors.text.muted },
    notesInput: {
      backgroundColor: colors.bg.card,
      borderRadius: Radii.xl,
      borderWidth: 1,
      borderColor: colors.border.default,
      padding: Spacing.base,
      fontSize: Typography.size.base,
      fontFamily: Typography.fontBody,
      color: colors.text.primary,
      minHeight: 90,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main screen
// ─────────────────────────────────────────────────────────────────────────────
export default function NewOrderScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const styles = makeMainStyles(colors);
  const params = useLocalSearchParams<{ shopId?: string; shopName?: string }>();
  const { addOrder } = useOfflineStore();

  const [step, setStep] = useState(params.shopId ? 2 : 1);
  const [selectedShop, setSelectedShop] = useState<Shop | null>(
    params.shopId ? ({ id: Number(params.shopId), name: params.shopName ?? "" } as Shop) : null
  );
  const [lines, setLines] = useState<OrderLine[]>([]);
  const [notes, setNotes] = useState("");

  const subtotal = lines.reduce(
    (s, l) => s + l.unitPrice * Number(l.quantity || 0) * (1 - Number(l.discount || 0) / 100), 0
  );

  const createMutation = useMutation({
    mutationFn: createOrder,
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    },
    onError: (e: any) => notify.error(e?.message ?? "Не удалось создать заказ"),
  });

  const canNext =
    step === 1 ? !!selectedShop :
    step === 2 ? lines.length > 0 && lines.every((l) => Number(l.quantity) > 0) :
    true;

  const handleSubmit = async () => {
    if (!selectedShop) return;
    const input = {
      shopId: selectedShop.id,
      notes,
      items: lines.map((l) => ({
        productId: l.productId,
        quantity: Number(l.quantity),
        unitPrice: l.unitPrice,
        discount: Number(l.discount || 0),
      })),
    };
    const net = await Network.getNetworkStateAsync();
    if (!net.isConnected) {
      await addOrder({ id: Date.now().toString(), input, shopName: selectedShop.name ?? "", createdAt: new Date().toISOString(), synced: false });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      notify.info("Нет подключения. Заказ сохранён и будет отправлен при восстановлении сети.");
      router.back();
      return;
    }
    createMutation.mutate(input);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg.primary }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      {/* Step header */}
      <StepHeader step={step} total={3} colors={colors} />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 120 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {step === 1 && <StepShop selectedId={selectedShop?.id ?? 0} onSelect={(s) => { setSelectedShop(s); setStep(2); }} colors={colors} />}
        {step === 2 && <StepItems lines={lines} onChange={setLines} colors={colors} />}
        {step === 3 && <StepReview shopName={selectedShop?.name ?? ""} lines={lines} notes={notes} onNotesChange={setNotes} colors={colors} />}
      </ScrollView>

      {/* Bottom action bar */}
      <View style={styles.bar}>
        {step > 1 && (
          <TouchableOpacity style={styles.backBtn} onPress={() => setStep((s) => s - 1)}>
            <Feather name="arrow-left" size={20} color={colors.text.primary} />
          </TouchableOpacity>
        )}

        {step < 3 ? (
          <TouchableOpacity
            style={[styles.nextBtn, !canNext && styles.nextBtnDisabled]}
            onPress={() => canNext && setStep((s) => s + 1)}
            activeOpacity={canNext ? 0.85 : 1}
          >
            <LinearGradient
              colors={canNext ? Gradients.primary : [colors.bg.elevated, colors.bg.elevated]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={styles.nextBtnGradient}
            >
              <Text style={[styles.nextBtnText, !canNext && styles.nextBtnTextDisabled]}>
                {step === 2 && lines.length > 0
                  ? `Далее · ${subtotal.toLocaleString("ru")} сум`
                  : "Далее"}
              </Text>
              <Feather name="arrow-right" size={18} color={canNext ? "#fff" : colors.text.muted} />
            </LinearGradient>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.nextBtn, createMutation.isPending && styles.nextBtnDisabled]}
            onPress={handleSubmit}
            activeOpacity={0.85}
            disabled={createMutation.isPending}
          >
            <LinearGradient colors={Gradients.success} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.nextBtnGradient}>
              <Feather name={createMutation.isPending ? "loader" : "check"} size={18} color="#fff" />
              <Text style={styles.nextBtnText}>
                {createMutation.isPending ? "Отправка…" : `Оформить · ${subtotal.toLocaleString("ru")} сум`}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

function makeMainStyles(colors: ThemeColors) {
  return {
    bar: {
      position: "absolute" as const, bottom: 0, left: 0, right: 0,
      flexDirection: "row" as const, gap: 10,
      paddingHorizontal: Spacing.base,
      paddingTop: Spacing.md,
      paddingBottom: Platform.OS === "ios" ? 36 : Spacing.base,
      backgroundColor: colors.bg.secondary,
      borderTopWidth: 1, borderTopColor: colors.border.default,
    },
    backBtn: {
      width: 52, height: 52, borderRadius: Radii.lg,
      backgroundColor: colors.bg.elevated,
      alignItems: "center" as const, justifyContent: "center" as const,
      borderWidth: 1, borderColor: colors.border.default,
    },
    nextBtn: { flex: 1, borderRadius: Radii.lg, overflow: "hidden" as const, ...Shadows.glow },
    nextBtnDisabled: { shadowOpacity: 0 },
    nextBtnGradient: { flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "center" as const, gap: 10, paddingVertical: 15 },
    nextBtnText: { fontSize: Typography.size.base, fontFamily: Typography.fontBold, color: "#fff" },
    nextBtnTextDisabled: { color: colors.text.muted },
  };
}
