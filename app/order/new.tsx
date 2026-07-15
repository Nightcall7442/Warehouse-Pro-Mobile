import { useState, useMemo } from "react";
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
  Image,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { notify } from "../../src/store/toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import * as Network from "expo-network";
import { Feather } from "@expo/vector-icons";
import { getMyShops, getProducts, createOrder, Product, Shop } from "../../src/api";
import { useOfflineStore } from "../../src/store/offline";
import { Skeleton } from "../../src/components/ui";
import { Typography, Spacing, Radii, ThemeColors } from "../../src/theme";
import { createNeuStyles, Colors } from "../../src/theme-redesign";
import { useThemeColors, useThemeStore } from "../../src/store/theme";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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
// Step header — neumorphic progress bar with step indicators
// ─────────────────────────────────────────────────────────────────────────────
function StepHeader({ step, total, colors, isDark }: { step: number; total: number; colors: ThemeColors; isDark: boolean }) {
  const sh = makeShStyles(colors, isDark);
  const labels = ["Выберите магазин", "Добавьте товары", "Проверьте заказ"];
  const neuColors = isDark ? Colors.dark : Colors.light;

  return (
    <View style={sh.wrap}>
      {/* Progress track */}
      <View style={sh.track}>
        <View style={[sh.fill, { width: `${(step / total) * 100}%` }]} />
      </View>

      {/* Step label row */}
      <View style={sh.label}>
        <View style={sh.badge}>
          <Text style={sh.badgeNum}>{step}</Text>
        </View>
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

function makeShStyles(colors: ThemeColors, isDark: boolean) {
  const neuColors = isDark ? Colors.dark : Colors.light;
  return {
    wrap: {
      backgroundColor: neuColors.bg.secondary,
      paddingHorizontal: Spacing.base,
      paddingBottom: Spacing.base,
      borderBottomWidth: 1,
      borderBottomColor: neuColors.border.default,
    },
    track: {
      height: 6,
      backgroundColor: neuColors.bg.input,
      borderRadius: Radii.full,
      marginBottom: Spacing.base,
      overflow: "hidden" as const,
      borderWidth: 1,
      borderColor: neuColors.border.subtle,
    },
    fill: {
      height: "100%" as const,
      borderRadius: Radii.full,
      backgroundColor: neuColors.accent.primary,
    },
    label: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 12,
    },
    badge: {
      width: 34,
      height: 34,
      borderRadius: Radii.full,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      backgroundColor: neuColors.accent.primary,
    },
    badgeNum: {
      fontSize: Typography.size.sm,
      fontFamily: Typography.fontBold,
      color: "#fff",
    },
    sub: {
      fontSize: Typography.size.xs,
      color: neuColors.text.tertiary,
      fontFamily: Typography.fontBold,
      letterSpacing: 1,
      marginBottom: 2,
    },
    title: {
      fontSize: Typography.size.base,
      color: neuColors.text.primary,
      fontFamily: Typography.fontBold,
    },
    dots: {
      flexDirection: "row" as const,
      gap: 5,
    },
    dot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: neuColors.border.default,
    },
    dotActive: {
      backgroundColor: neuColors.accent.primary,
      width: 18,
    },
    dotDone: {
      backgroundColor: neuColors.accent.primary,
      opacity: 0.4,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 1 — Shop picker (neumorphic card list)
// ─────────────────────────────────────────────────────────────────────────────
function StepShop({ selectedId, onSelect, colors, isDark }: { selectedId: number; onSelect: (s: Shop) => void; colors: ThemeColors; isDark: boolean }) {
  const s1 = makeS1Styles(colors, isDark);
  const neu = createNeuStyles(isDark);
  const neuColors = isDark ? Colors.dark : Colors.light;
  const [search, setSearch] = useState("");
  const { data: shops, isLoading } = useQuery({ queryKey: ["myShops"], queryFn: getMyShops });

  const filtered = useMemo(
    () =>
      (shops ?? []).filter(
        (s) =>
          !search ||
          s.name?.toLowerCase().includes(search.toLowerCase()) ||
          s.ownerName?.toLowerCase().includes(search.toLowerCase())
      ),
    [shops, search]
  );

  return (
    <View style={s1.wrap}>
      {/* Search */}
      <View style={[neu.input, s1.searchBox]}>
        <Feather name="search" size={16} color={neuColors.text.tertiary} />
        <TextInput
          style={s1.searchInput}
          placeholder="Поиск магазинов…"
          placeholderTextColor={neuColors.text.tertiary}
          value={search}
          onChangeText={setSearch}
          autoFocus
          autoCapitalize="none"
        />
        {!!search && (
          <TouchableOpacity onPress={() => setSearch("")}>
            <Feather name="x" size={15} color={neuColors.text.tertiary} />
          </TouchableOpacity>
        )}
      </View>

      {isLoading ? (
        <View style={{ gap: 10 }}>
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} height={72} radius={Radii.xl} />)}
        </View>
      ) : filtered.length === 0 ? (
        <View style={s1.empty}>
          <Feather name="search" size={32} color={neuColors.text.tertiary} />
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
                style={[neu.card, s1.shopRow, selected && s1.shopRowSelected]}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onSelect(item); }}
                activeOpacity={0.7}
              >
                <View style={[s1.shopIcon, selected && s1.shopIconSelected]}>
                  <Feather name="shopping-bag" size={18} color={selected ? neuColors.accent.primary : neuColors.text.tertiary} />
                </View>

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

                {selected ? (
                  <View style={s1.check}>
                    <Feather name="check" size={14} color="#fff" />
                  </View>
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

function makeS1Styles(colors: ThemeColors, isDark: boolean) {
  const neuColors = isDark ? Colors.dark : Colors.light;
  return {
    wrap: { padding: Spacing.base, gap: Spacing.md },
    searchBox: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 10,
      paddingHorizontal: Spacing.md,
      paddingVertical: 12,
    },
    searchInput: { flex: 1, fontSize: Typography.size.base, color: neuColors.text.primary, fontFamily: Typography.fontRegular },
    empty: { alignItems: "center" as const, paddingVertical: 60, gap: 8 },
    emptyTitle: { fontSize: Typography.size.base, fontFamily: Typography.fontSemibold, color: neuColors.text.secondary },
    emptySub: { fontSize: Typography.size.sm, color: neuColors.text.tertiary },
    shopRow: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 12,
      padding: 14,
    },
    shopRowSelected: {
      borderColor: neuColors.accent.primary,
      backgroundColor: neuColors.accent.primary + "0D",
    },
    shopIcon: {
      width: 42,
      height: 42,
      borderRadius: Radii.md,
      backgroundColor: neuColors.bg.elevated,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
    shopIconSelected: { backgroundColor: neuColors.accent.primary + "20" },
    shopName: { fontSize: Typography.size.base, fontFamily: Typography.fontSemibold, color: neuColors.text.primary },
    shopNameSelected: { color: neuColors.accent.primary },
    shopMeta: { fontSize: Typography.size.sm, color: neuColors.text.tertiary },
    debtChip: { flexDirection: "row" as const, alignItems: "center" as const, gap: 4, marginTop: 2 },
    debtText: { fontSize: Typography.size.xs, color: colors.status.danger, fontFamily: Typography.fontMedium },
    check: {
      width: 28,
      height: 28,
      borderRadius: Radii.full,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      backgroundColor: neuColors.accent.primary,
    },
    checkEmpty: {
      width: 28,
      height: 28,
      borderRadius: Radii.full,
      borderWidth: 1.5,
      borderColor: neuColors.border.default,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Product picker modal — full-screen bottom sheet feel
// ─────────────────────────────────────────────────────────────────────────────
function ProductPickerModal({
  visible,
  onClose,
  onAdd,
  onUpdateQty,
  already,
  lineQuantities,
  colors,
  isDark,
}: {
  visible: boolean;
  onClose: () => void;
  onAdd: (p: Product, qty: number) => void;
  onUpdateQty: (productId: number, qty: number) => void;
  already: number[];
  lineQuantities: Record<number, number>;
  colors: ThemeColors;
  isDark: boolean;
}) {
  const pm = makePmStyles(colors, isDark);
  const neu = createNeuStyles(isDark);
  const neuColors = isDark ? Colors.dark : Colors.light;
  const [search, setSearch] = useState("");
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);
  const [detailQty, setDetailQty] = useState(1);
  const { data: products, isLoading } = useQuery({ queryKey: ["products"], queryFn: getProducts });

  const filtered = useMemo(
    () => {
      const list = (products ?? []).filter(
        (p) =>
          !search ||
          p.name.toLowerCase().includes(search.toLowerCase()) ||
          (p.code ?? "").toLowerCase().includes(search.toLowerCase())
      );
      return list.sort((a, b) => {
        const catA = a.category ?? "";
        const catB = b.category ?? "";
        if (catA !== catB) return catA.localeCompare(catB);
        return a.name.localeCompare(b.name);
      });
    },
    [products, search]
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={pm.root}>
        <View style={pm.handle} />

        <View style={pm.header}>
          <View>
            <Text style={pm.title}>Выбор товара</Text>
            <Text style={pm.sub}>{products?.length ?? 0} позиций в каталоге</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={pm.closeBtn}>
            <Feather name="x" size={18} color={neuColors.text.primary} />
          </TouchableOpacity>
        </View>

        <View style={[neu.input, pm.searchWrap]}>
          <Feather name="search" size={16} color={neuColors.text.tertiary} />
          <TextInput
            style={pm.searchInput}
            placeholder="Название или артикул…"
            placeholderTextColor={neuColors.text.tertiary}
            value={search}
            onChangeText={setSearch}
            autoFocus
            autoCapitalize="none"
          />
          {!!search && (
            <TouchableOpacity onPress={() => setSearch("")}>
              <Feather name="x-circle" size={16} color={neuColors.text.tertiary} />
            </TouchableOpacity>
          )}
        </View>

        {isLoading ? (
          <View style={{ padding: Spacing.base, gap: 10 }}>
            {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} height={64} radius={Radii.lg} />)}
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(p) => String(p.id)}
            contentContainerStyle={{ padding: Spacing.base, gap: 8 }}
            keyboardShouldPersistTaps="handled"
            windowSize={11}
            maxToRenderPerBatch={10}
            removeClippedSubviews
            ListEmptyComponent={
              !isLoading ? (
                <View style={{ alignItems: "center", paddingVertical: 48, gap: 8 }}>
                  <Feather name="search" size={32} color={neuColors.text.tertiary} />
                  <Text style={{ fontSize: Typography.size.base, fontFamily: Typography.fontSemibold, color: neuColors.text.secondary }}>Товар не найден</Text>
                  <Text style={{ fontSize: Typography.size.sm, color: neuColors.text.tertiary }}>Попробуйте изменить запрос</Text>
                </View>
              ) : null
            }
            renderItem={({ item }) => {
              const added = already.includes(item.id);
              const qty = added ? (lineQuantities[item.id] ?? 1) : (quantities[item.id] ?? 1);
              return (
                <TouchableOpacity
                  style={[neu.card, pm.item, added && pm.itemAdded]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    if (added) {
                      setDetailProduct(item);
                      setDetailQty(qty);
                    } else {
                      setDetailProduct(item);
                      setDetailQty(quantities[item.id] ?? 1);
                    }
                  }}
                  activeOpacity={0.7}
                >
                  <View style={[pm.itemIcon, added && pm.itemIconAdded]}>
                    <Feather name="package" size={16} color={added ? colors.status.success : neuColors.text.tertiary} />
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={[pm.itemName, added && pm.itemNameAdded]} numberOfLines={1}>{item.name}</Text>
                    <View style={pm.itemMeta}>
                      {item.code && <Text style={pm.itemCode}>{item.code}</Text>}
                      <Text style={pm.itemPrice}>{Number(item.unitPrice).toLocaleString("ru")} сум</Text>
                      <Text style={pm.itemStock}>• {item.available} {item.unit ?? "кг"}</Text>
                    </View>
                  </View>

                  {added ? (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <TextInput
                        style={[neu.input, pm.qtyInput]}
                        keyboardType="numeric"
                        value={String(qty)}
                        onChangeText={(v) => {
                          const num = parseInt(v) || 1;
                          const newQty = Math.max(1, num);
                          setQuantities((prev) => ({ ...prev, [item.id]: newQty }));
                          onUpdateQty(item.id, newQty);
                        }}
                      />
                      <View style={pm.stepper}>
                        <TouchableOpacity
                          style={pm.stepperBtn}
                          onPress={() => {
                            const newQty = Math.max(1, qty - 1);
                            setQuantities((prev) => ({ ...prev, [item.id]: newQty }));
                            onUpdateQty(item.id, newQty);
                          }}
                        >
                          <Feather name="minus" size={12} color={neuColors.text.primary} />
                        </TouchableOpacity>
                        <Text style={pm.stepperText}>{qty}</Text>
                        <TouchableOpacity
                          style={pm.stepperBtn}
                          onPress={() => {
                            const newQty = qty + 1;
                            setQuantities((prev) => ({ ...prev, [item.id]: newQty }));
                            onUpdateQty(item.id, newQty);
                          }}
                        >
                          <Feather name="plus" size={12} color={neuColors.text.primary} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <TextInput
                        style={[neu.input, pm.qtyInput]}
                        keyboardType="numeric"
                        value={String(qty)}
                        onChangeText={(v) => {
                          const num = parseInt(v) || 1;
                          setQuantities((prev) => ({ ...prev, [item.id]: Math.max(1, num) }));
                        }}
                      />
                      <TouchableOpacity
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          onAdd(item, qty);
                        }}
                        style={pm.addBtn}
                      >
                        <Feather name="plus" size={16} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  )}
                </TouchableOpacity>
              );
            }}
          />
        )}

        {/* Product Detail Modal */}
        {detailProduct && (
          <Modal visible={!!detailProduct} animationType="slide" transparent>
            <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)" }} onPress={() => setDetailProduct(null)}>
              <Pressable style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                maxHeight: "85%",
                backgroundColor: neuColors.bg.secondary,
                borderTopLeftRadius: Radii.xxl,
                borderTopRightRadius: Radii.xxl,
                overflow: "hidden",
              }} onPress={(e) => e.stopPropagation()}>
                <View style={{ alignItems: "center", paddingVertical: 12 }}>
                  <View style={{ width: 40, height: 4, borderRadius: Radii.full, backgroundColor: neuColors.border.default }} />
                </View>

                {detailProduct.photoUrl ? (
                  <Image source={{ uri: detailProduct.photoUrl }} style={{ width: "100%", height: 220 }} resizeMode="cover" />
                ) : (
                  <View style={{ width: "100%", height: 220, alignItems: "center", justifyContent: "center", backgroundColor: neuColors.accent.primary + "15" }}>
                    <Feather name="package" size={64} color={neuColors.accent.primary + "40"} />
                  </View>
                )}

                <View style={{ padding: 20 }}>
                  <Text style={{ fontSize: 20, fontFamily: Typography.fontBold, color: neuColors.text.primary, marginBottom: 4 }}>
                    {detailProduct.name}
                  </Text>
                  {detailProduct.code && (
                    <Text style={{ fontSize: 13, color: neuColors.text.tertiary, marginBottom: 12 }}>
                      Артикул: {detailProduct.code}
                    </Text>
                  )}

                  <View style={{ flexDirection: "row", gap: 12, marginBottom: 20 }}>
                    <View style={[neu.card, { flex: 1, padding: 14 }]}>
                      <Text style={{ fontSize: 10, color: neuColors.text.tertiary, textTransform: "uppercase", letterSpacing: 0.05, fontFamily: Typography.fontMedium }}>Цена</Text>
                      <Text style={{ fontSize: 18, fontFamily: Typography.fontBold, color: neuColors.accent.primary, marginTop: 4 }}>
                        {Number(detailProduct.unitPrice).toLocaleString("ru")} сум
                      </Text>
                    </View>
                    <View style={[neu.card, { flex: 1, padding: 14 }]}>
                      <Text style={{ fontSize: 10, color: neuColors.text.tertiary, textTransform: "uppercase", letterSpacing: 0.05, fontFamily: Typography.fontMedium }}>Остаток</Text>
                      <Text style={{ fontSize: 18, fontFamily: Typography.fontBold, color: Number(detailProduct.available) > 0 ? colors.status.success : colors.status.danger, marginTop: 4 }}>
                        {detailProduct.available} {detailProduct.unit ?? "шт"}
                      </Text>
                    </View>
                  </View>

                  {detailProduct.category && (
                    <View style={{ marginBottom: 16 }}>
                      <Text style={{ fontSize: 10, color: neuColors.text.tertiary, textTransform: "uppercase", letterSpacing: 0.05, fontFamily: Typography.fontMedium, marginBottom: 4 }}>Категория</Text>
                      <View style={{ backgroundColor: neuColors.accent.primary + "20", paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radii.sm, alignSelf: "flex-start" }}>
                        <Text style={{ fontSize: 12, color: neuColors.accent.primary, fontFamily: Typography.fontSemibold }}>{detailProduct.category}</Text>
                      </View>
                    </View>
                  )}

                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 20, marginBottom: 20 }}>
                    <TouchableOpacity
                      onPress={() => setDetailQty(Math.max(1, detailQty - 1))}
                      style={[neu.card, { width: 48, height: 48, borderRadius: Radii.full, alignItems: "center", justifyContent: "center" }]}
                    >
                      <Feather name="minus" size={20} color={neuColors.text.primary} />
                    </TouchableOpacity>
                    <Text style={{ fontSize: 32, fontFamily: Typography.fontBold, color: neuColors.text.primary, minWidth: 60, textAlign: "center" }}>
                      {detailQty}
                    </Text>
                    <TouchableOpacity
                      onPress={() => setDetailQty(detailQty + 1)}
                      style={[neu.btnPrimary, { width: 48, height: 48, borderRadius: Radii.full, paddingVertical: 0, paddingHorizontal: 0 }]}
                    >
                      <Feather name="plus" size={20} color="#fff" />
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      onAdd(detailProduct, detailQty);
                      setDetailProduct(null);
                      setDetailQty(1);
                    }}
                    style={neu.btnPrimary}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 }}>
                      <Feather name="shopping-cart" size={20} color="#fff" />
                      <Text style={{ fontSize: 16, fontFamily: Typography.fontBold, color: "#fff" }}>
                        {already.includes(detailProduct.id) ? "Обновить количество" : "Добавить в заказ"}
                      </Text>
                    </View>
                  </TouchableOpacity>
                </View>
              </Pressable>
            </Pressable>
          </Modal>
        )}
      </View>
    </Modal>
  );
}

function makePmStyles(colors: ThemeColors, isDark: boolean) {
  const neuColors = isDark ? Colors.dark : Colors.light;
  return {
    root: { flex: 1, backgroundColor: neuColors.bg.primary },
    handle: {
      width: 40,
      height: 4,
      borderRadius: Radii.full,
      backgroundColor: neuColors.border.default,
      alignSelf: "center" as const,
      marginTop: 12,
      marginBottom: 4,
    },
    header: {
      flexDirection: "row" as const,
      justifyContent: "space-between" as const,
      alignItems: "flex-start" as const,
      paddingHorizontal: Spacing.base,
      paddingVertical: Spacing.md,
    },
    title: { fontSize: Typography.size.lg, fontFamily: Typography.fontBold, color: neuColors.text.primary },
    sub: { fontSize: Typography.size.sm, color: neuColors.text.tertiary, marginTop: 2 },
    closeBtn: {
      width: 36,
      height: 36,
      borderRadius: Radii.full,
      backgroundColor: neuColors.bg.elevated,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      borderWidth: 1,
      borderColor: neuColors.border.default,
    },
    searchWrap: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 10,
      marginHorizontal: Spacing.base,
      marginBottom: Spacing.sm,
      paddingHorizontal: Spacing.md,
      paddingVertical: 12,
    },
    searchInput: { flex: 1, fontSize: Typography.size.base, color: neuColors.text.primary, fontFamily: Typography.fontRegular },
    item: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 12,
      padding: 12,
    },
    itemAdded: {
      borderColor: colors.status.success,
      backgroundColor: colors.status.success + "0D",
    },
    itemIcon: {
      width: 38,
      height: 38,
      borderRadius: Radii.md,
      backgroundColor: neuColors.bg.elevated,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
    itemIconAdded: { backgroundColor: colors.status.success + "20" },
    itemName: { fontSize: Typography.size.sm, fontFamily: Typography.fontSemibold, color: neuColors.text.primary },
    itemNameAdded: { color: neuColors.text.secondary },
    itemMeta: { flexDirection: "row" as const, alignItems: "center" as const, gap: 6, marginTop: 3 },
    itemCode: {
      fontSize: Typography.size.xs,
      color: neuColors.text.tertiary,
      fontFamily: Typography.fontRegular,
      backgroundColor: neuColors.bg.elevated,
      paddingHorizontal: 5,
      paddingVertical: 1,
      borderRadius: Radii.xs,
    },
    itemPrice: { fontSize: Typography.size.xs, color: neuColors.accent.primary, fontFamily: Typography.fontMedium },
    itemStock: { fontSize: Typography.size.xs, color: neuColors.text.tertiary },
    addBtn: {
      width: 32,
      height: 32,
      borderRadius: Radii.full,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      backgroundColor: neuColors.accent.primary,
    },
    qtyInput: {
      width: 44,
      height: 34,
      textAlign: "center" as const,
      paddingHorizontal: 0,
      paddingVertical: 0,
    },
    stepper: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 2,
      backgroundColor: neuColors.bg.elevated,
      borderRadius: Radii.sm,
      borderWidth: 1,
      borderColor: neuColors.border.default,
    },
    stepperBtn: {
      width: 30,
      height: 30,
      borderRadius: Radii.xs,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
    stepperText: {
      fontSize: 14,
      fontFamily: Typography.fontBold,
      color: neuColors.text.primary,
      minWidth: 32,
      textAlign: "center" as const,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 2 — Lines editor (neumorphic)
// ─────────────────────────────────────────────────────────────────────────────
function StepItems({ lines, onChange, colors, isDark }: { lines: OrderLine[]; onChange: (l: OrderLine[]) => void; colors: ThemeColors; isDark: boolean }) {
  const s2 = makeS2Styles(colors, isDark);
  const neu = createNeuStyles(isDark);
  const neuColors = isDark ? Colors.dark : Colors.light;
  const [showPicker, setShowPicker] = useState(false);

  const addProduct = (p: Product, qty: number = 1) => {
    if (lines.find((l) => l.productId === p.id)) return;
    onChange([
      ...lines,
      { productId: p.id, name: p.name, unitPrice: Number(p.unitPrice), quantity: String(qty), discount: "0", available: Number(p.available), unit: p.unit },
    ]);
  };

  const updateProductQty = (productId: number, qty: number) => {
    onChange(lines.map((l) => (l.productId === productId ? { ...l, quantity: String(qty) } : l)));
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
        onUpdateQty={updateProductQty}
        already={lines.map((l) => l.productId)}
        lineQuantities={Object.fromEntries(lines.map((l) => [l.productId, Number(l.quantity) || 1]))}
        colors={colors}
        isDark={isDark}
      />

      {/* Add button */}
      <TouchableOpacity
        style={[neu.card, s2.addBtn]}
        onPress={() => setShowPicker(true)}
        activeOpacity={0.8}
      >
        <View style={s2.addBtnInner}>
          <View style={s2.addBtnIcon}>
            <Feather name="plus" size={18} color={neuColors.accent.primary} />
          </View>
          <Text style={s2.addBtnText}>Добавить товар</Text>
          <Feather name="chevron-right" size={16} color={neuColors.accent.primary} />
        </View>
      </TouchableOpacity>

      {/* Empty */}
      {lines.length === 0 && (
        <View style={s2.empty}>
          <View style={s2.emptyIcon}>
            <Feather name="package" size={28} color={neuColors.text.tertiary} />
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
          <View key={line.productId} style={[neu.card, s2.lineCard]}>
            <View style={s2.lineHead}>
              <View style={s2.lineHeadLeft}>
                <View style={s2.lineNum}><Text style={s2.lineNumText}>{idx + 1}</Text></View>
                <Text style={s2.lineName} numberOfLines={2}>{line.name}</Text>
              </View>
              <TouchableOpacity onPress={() => removeLine(idx)} style={s2.lineRemove}>
                <Feather name="x" size={16} color={neuColors.text.tertiary} />
              </TouchableOpacity>
            </View>

            <View style={s2.linePriceMeta}>
              <Text style={s2.lineUnitPrice}>{line.unitPrice.toLocaleString("ru")} сум / {line.unit ?? "кг"}</Text>
              <View style={s2.lineStock}>
                <Feather name="layers" size={11} color={neuColors.text.tertiary} />
                <Text style={s2.lineStockText}>Остаток: {line.available}</Text>
              </View>
            </View>

            <View style={s2.inputsRow}>
              <View style={s2.inputField}>
                <Text style={s2.inputLabel}>КОЛ-ВО ({line.unit ?? "кг"})</Text>
                <TextInput
                  style={[neu.input, s2.input]}
                  value={line.quantity}
                  onChangeText={(v) => updateLine(idx, "quantity", v.replace(",", "."))}
                  keyboardType="decimal-pad"
                  placeholderTextColor={neuColors.text.tertiary}
                  placeholder="0"
                  selectTextOnFocus
                />
              </View>
              <View style={s2.inputField}>
                <Text style={s2.inputLabel}>СКИДКА (%)</Text>
                <TextInput
                  style={[neu.input, s2.input]}
                  value={line.discount}
                  onChangeText={(v) => updateLine(idx, "discount", v)}
                  keyboardType="decimal-pad"
                  placeholderTextColor={neuColors.text.tertiary}
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

function makeS2Styles(colors: ThemeColors, isDark: boolean) {
  const neuColors = isDark ? Colors.dark : Colors.light;
  return {
    wrap: { padding: Spacing.base, gap: Spacing.sm },
    addBtn: {},
    addBtnInner: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 12,
      padding: 16,
    },
    addBtnIcon: {
      width: 34,
      height: 34,
      borderRadius: Radii.full,
      backgroundColor: neuColors.accent.primary + "20",
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
    addBtnText: {
      flex: 1,
      fontSize: Typography.size.base,
      fontFamily: Typography.fontSemibold,
      color: neuColors.accent.primary,
    },
    empty: { alignItems: "center" as const, paddingVertical: 56, gap: 10 },
    emptyIcon: {
      width: 68,
      height: 68,
      borderRadius: Radii.xl,
      backgroundColor: neuColors.bg.elevated,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      marginBottom: 4,
    },
    emptyTitle: { fontSize: Typography.size.base, fontFamily: Typography.fontSemibold, color: neuColors.text.secondary },
    emptySub: { fontSize: Typography.size.sm, color: neuColors.text.tertiary, textAlign: "center" as const },

    lineCard: {
      padding: Spacing.base,
      gap: 10,
    },
    lineHead: { flexDirection: "row" as const, alignItems: "flex-start" as const, gap: 10 },
    lineHeadLeft: { flex: 1, flexDirection: "row" as const, alignItems: "flex-start" as const, gap: 10 },
    lineNum: {
      width: 22,
      height: 22,
      borderRadius: Radii.full,
      backgroundColor: neuColors.accent.primary + "20",
      alignItems: "center" as const,
      justifyContent: "center" as const,
      marginTop: 1,
    },
    lineNumText: { fontSize: Typography.size.xs, fontFamily: Typography.fontBold, color: neuColors.accent.primary },
    lineName: { flex: 1, fontSize: Typography.size.base, fontFamily: Typography.fontSemibold, color: neuColors.text.primary, lineHeight: 20 },
    lineRemove: {
      width: 30,
      height: 30,
      borderRadius: Radii.full,
      backgroundColor: neuColors.bg.elevated,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      borderWidth: 1,
      borderColor: neuColors.border.default,
    },

    linePriceMeta: { flexDirection: "row" as const, justifyContent: "space-between" as const, alignItems: "center" as const },
    lineUnitPrice: { fontSize: Typography.size.xs, color: neuColors.text.tertiary, fontFamily: Typography.fontMedium },
    lineStock: { flexDirection: "row" as const, alignItems: "center" as const, gap: 4 },
    lineStockText: { fontSize: Typography.size.xs, color: neuColors.text.tertiary },

    inputsRow: { flexDirection: "row" as const, gap: 8 },
    inputField: { flex: 1, gap: 5 },
    inputLabel: { fontSize: Typography.size.xs, color: neuColors.text.tertiary, fontFamily: Typography.fontBold, letterSpacing: 0.8 },
    input: {
      paddingVertical: 10,
      paddingHorizontal: 8,
      fontSize: Typography.size.base,
      fontFamily: Typography.fontSemibold,
      color: neuColors.text.primary,
      textAlign: "center" as const,
      fontVariant: ["tabular-nums" as const],
    },
    totalBox: {
      backgroundColor: neuColors.accent.primary + "15",
      borderRadius: Radii.md,
      paddingVertical: 10,
      paddingHorizontal: 8,
      alignItems: "center" as const,
      gap: 1,
    },
    totalOriginal: {
      fontSize: Typography.size.xs,
      color: neuColors.text.tertiary,
      textDecorationLine: "line-through" as const,
      fontVariant: ["tabular-nums" as const],
    },
    totalValue: {
      fontSize: Typography.size.sm,
      fontFamily: Typography.fontBold,
      color: neuColors.accent.primary,
      fontVariant: ["tabular-nums" as const],
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 3 — Review (neumorphic summary cards)
// ─────────────────────────────────────────────────────────────────────────────
function StepReview({ shopName, lines, notes, onNotesChange, colors, isDark }: {
  shopName: string; lines: OrderLine[]; notes: string; onNotesChange: (v: string) => void; colors: ThemeColors; isDark: boolean;
}) {
  const s3 = makeS3Styles(colors, isDark);
  const neu = createNeuStyles(isDark);
  const neuColors = isDark ? Colors.dark : Colors.light;
  const { subtotal, totalQty } = useMemo(() => {
    let sub = 0;
    let qty = 0;
    for (const l of lines) {
      sub += l.unitPrice * Number(l.quantity || 0) * (1 - Number(l.discount || 0) / 100);
      qty += Number(l.quantity || 0);
    }
    return { subtotal: sub, totalQty: qty };
  }, [lines]);

  return (
    <View style={s3.wrap}>
      {/* Shop summary card */}
      <View style={[neu.card, s3.shopCard]}>
        <View style={s3.shopIcon}>
          <Feather name="shopping-bag" size={20} color={neuColors.accent.primary} />
        </View>
        <View>
          <Text style={s3.shopLabel}>МАГАЗИН</Text>
          <Text style={s3.shopName}>{shopName}</Text>
        </View>
      </View>

      {/* Items summary */}
      <View style={[neu.card, s3.tableCard]}>
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

        <View style={s3.totalRow}>
          <Text style={s3.totalLabel}>ИТОГО — {lines.length} позиций, {totalQty.toLocaleString("ru")} кг</Text>
          <Text style={s3.totalValue}>{subtotal.toLocaleString("ru")} сум</Text>
        </View>
      </View>

      {/* Notes */}
      <View style={s3.notesSection}>
        <View style={s3.notesLabel}>
          <Feather name="edit-3" size={14} color={neuColors.text.tertiary} />
          <Text style={s3.notesLabelText}>Примечания к заказу</Text>
          <Text style={s3.notesOptional}>необязательно</Text>
        </View>
        <TextInput
          style={[neu.input, s3.notesInput]}
          value={notes}
          onChangeText={onNotesChange}
          placeholder="Добавьте комментарий — время доставки, особые условия…"
          placeholderTextColor={neuColors.text.tertiary}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
        />
      </View>
    </View>
  );
}

function makeS3Styles(colors: ThemeColors, isDark: boolean) {
  const neuColors = isDark ? Colors.dark : Colors.light;
  return {
    wrap: { padding: Spacing.base, gap: Spacing.sm },
    shopCard: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 14,
      padding: 16,
    },
    shopIcon: {
      width: 46,
      height: 46,
      borderRadius: Radii.lg,
      backgroundColor: neuColors.accent.primary + "20",
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
    shopLabel: { fontSize: Typography.size.xs, color: neuColors.text.tertiary, fontFamily: Typography.fontBold, letterSpacing: 1, marginBottom: 3 },
    shopName: { fontSize: Typography.size.base, fontFamily: Typography.fontBold, color: neuColors.text.primary },
    tableCard: { overflow: "hidden" as const },
    tableHeaderRow: {
      flexDirection: "row" as const,
      paddingHorizontal: Spacing.base,
      paddingVertical: 10,
      backgroundColor: neuColors.bg.elevated,
      borderBottomWidth: 1,
      borderBottomColor: neuColors.border.subtle,
    },
    tableHead: { fontSize: Typography.size.xs, fontFamily: Typography.fontBold, color: neuColors.text.tertiary, letterSpacing: 0.5, textTransform: "uppercase" as const },
    tableRow: {
      flexDirection: "row" as const,
      alignItems: "flex-start" as const,
      paddingHorizontal: Spacing.base,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: neuColors.border.subtle,
    },
    tableCell: { fontSize: Typography.size.sm, color: neuColors.text.secondary, fontFamily: Typography.fontRegular },
    tableCellBold: { color: neuColors.text.primary, fontFamily: Typography.fontSemibold, fontVariant: ["tabular-nums" as const] },
    discountNote: { fontSize: Typography.size.xs, color: colors.status.success, fontFamily: Typography.fontMedium },
    right: { textAlign: "right" as const },
    totalRow: {
      flexDirection: "row" as const,
      justifyContent: "space-between" as const,
      alignItems: "center" as const,
      paddingHorizontal: Spacing.base,
      paddingVertical: 14,
      backgroundColor: neuColors.accent.primary + "10",
    },
    totalLabel: { fontSize: Typography.size.xs, fontFamily: Typography.fontBold, color: neuColors.text.secondary, letterSpacing: 0.5 },
    totalValue: { fontSize: Typography.size.base, fontFamily: Typography.fontBold, color: neuColors.accent.primary, fontVariant: ["tabular-nums" as const] },
    notesSection: { gap: 8 },
    notesLabel: { flexDirection: "row" as const, alignItems: "center" as const, gap: 6 },
    notesLabelText: { fontSize: Typography.size.sm, fontFamily: Typography.fontSemibold, color: neuColors.text.secondary },
    notesOptional: { fontSize: Typography.size.xs, color: neuColors.text.tertiary },
    notesInput: {
      padding: Spacing.base,
      fontSize: Typography.size.base,
      fontFamily: Typography.fontRegular,
      color: neuColors.text.primary,
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
  const { isDark } = useThemeStore();
  const insets = useSafeAreaInsets();
  const neu = createNeuStyles(isDark);
  const neuColors = isDark ? Colors.dark : Colors.light;
  const styles = makeMainStyles(colors, isDark, insets);

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

  const subtotal = useMemo(
    () =>
      lines.reduce(
        (s, l) => s + l.unitPrice * Number(l.quantity || 0) * (1 - Number(l.discount || 0) / 100), 0
      ),
    [lines]
  );

  const createMutation = useMutation({
    mutationFn: createOrder,
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    },
    onError: (e: Error) => notify.error(e?.message ?? "Не удалось создать заказ"),
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
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: neuColors.bg.primary }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <StepHeader step={step} total={3} colors={colors} isDark={isDark} />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 140 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {step === 1 && <StepShop selectedId={selectedShop?.id ?? 0} onSelect={(s) => { setSelectedShop(s); setStep(2); }} colors={colors} isDark={isDark} />}
        {step === 2 && <StepItems lines={lines} onChange={setLines} colors={colors} isDark={isDark} />}
        {step === 3 && <StepReview shopName={selectedShop?.name ?? ""} lines={lines} notes={notes} onNotesChange={setNotes} colors={colors} isDark={isDark} />}
      </ScrollView>

      {/* Bottom action bar */}
      <View style={styles.bar}>
        {step > 1 && (
          <TouchableOpacity
            style={[neu.card, styles.backBtn]}
            onPress={() => { Haptics.selectionAsync(); setStep((s) => s - 1); }}
          >
            <Feather name="arrow-left" size={20} color={neuColors.text.primary} />
          </TouchableOpacity>
        )}

        {step < 3 ? (
          <TouchableOpacity
            style={[neu.btnPrimary, styles.nextBtn, !canNext && styles.nextBtnDisabled]}
            onPress={() => { if (canNext) { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setStep((s) => s + 1); } }}
            activeOpacity={canNext ? 0.85 : 1}
          >
            <Text style={[styles.nextBtnText, !canNext && styles.nextBtnTextDisabled]}>
              {step === 2 && lines.length > 0
                ? `Далее · ${subtotal.toLocaleString("ru")} сум`
                : "Далее"}
            </Text>
            <Feather name="arrow-right" size={18} color={canNext ? "#fff" : neuColors.text.tertiary} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[neu.btnPrimary, styles.nextBtn, createMutation.isPending && styles.nextBtnDisabled]}
            onPress={handleSubmit}
            activeOpacity={0.85}
            disabled={createMutation.isPending}
          >
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 }}>
              <Feather name={createMutation.isPending ? "loader" : "check"} size={18} color="#fff" />
              <Text style={styles.nextBtnText}>
                {createMutation.isPending ? "Отправка…" : `Оформить · ${subtotal.toLocaleString("ru")} сум`}
              </Text>
            </View>
          </TouchableOpacity>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

function makeMainStyles(colors: ThemeColors, isDark: boolean, insets: { bottom: number }) {
  const neuColors = isDark ? Colors.dark : Colors.light;
  return {
    bar: {
      position: "absolute" as const,
      bottom: 0,
      left: 0,
      right: 0,
      flexDirection: "row" as const,
      gap: 10,
      paddingHorizontal: Spacing.base,
      paddingTop: Spacing.md,
      paddingBottom: Math.max(insets.bottom, Spacing.base) + Spacing.md,
      backgroundColor: neuColors.bg.secondary,
      borderTopWidth: 1,
      borderTopColor: neuColors.border.default,
    },
    backBtn: {
      width: 52,
      height: 52,
      borderRadius: Radii.xl,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
    nextBtn: {
      flex: 1,
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      gap: 10,
      paddingVertical: 15,
    },
    nextBtnDisabled: { opacity: 0.5 },
    nextBtnText: { fontSize: Typography.size.base, fontFamily: Typography.fontBold, color: "#fff" },
    nextBtnTextDisabled: { color: neuColors.text.tertiary },
  };
}
