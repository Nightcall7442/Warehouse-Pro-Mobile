// Warehouse Pro — Catalog v2 (cold palette, Card from ui.tsx)
import React, { useState, useCallback, useMemo } from "react";
import {
  View, Text, FlatList, TouchableOpacity, Modal, Pressable,
  Image, ScrollView, useWindowDimensions,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";
import { getProducts, getCategories, createOrder, getMyShops, Product, Shop } from "../../src/api";
import { useThemeColors, useThemeStore } from "../../src/store/theme";
import { useAuthStore } from "../../src/store/auth";
import { notify } from "../../src/store/toast";
import { Typography, Spacing, Radii, ThemeColors } from "../../src/theme";
import { SearchInput, Card } from "../../src/components/ui";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// ── Unit label mapping ──────────────────────────────────────────────────────
const UNIT_LABELS: Record<string, string> = {
  kg: "кг", l: "л", pcs: "шт", box: "ящ", pack: "упак", m: "м",
};
function unitLabel(unit?: string | null): string {
  return UNIT_LABELS[unit ?? ""] ?? unit ?? "шт";
}

// ── Hero Product Card ────────────────────────────────────────────────────────
function ProductCard({ product, colors, isDark: _isDark, onPress, onAdd, fmt, cardWidth }: {
  product: Product; colors: ThemeColors; isDark: boolean; onPress: () => void; onAdd: () => void;
  fmt: (v: number | string | null | undefined) => string; cardWidth: number;
}) {
  const hasPhoto = !!product.photoUrl && product.photoUrl.startsWith("http");
  const inStock = Number(product.available) > 0;
  const price = Number(product.unitPrice ?? 0);
  const imgHeight = cardWidth * 0.7;

  return (
    <TouchableOpacity activeOpacity={0.9} onPress={onPress} style={{ width: cardWidth, marginBottom: Spacing.base }}>
      <Card style={{ padding: 0, overflow: "hidden" }}>
        {/* Big photo */}
        <View style={{ width: "100%", height: imgHeight, backgroundColor: colors.bg.elevated }}>
          {hasPhoto ? (
            <Image source={{ uri: product.photoUrl ?? undefined }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
          ) : (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              <Feather name="package" size={40} color={colors.text.muted} />
            </View>
          )}
          {/* Stock badge */}
          <View style={{ position: "absolute", top: Spacing.sm, left: Spacing.sm, backgroundColor: inStock ? colors.status.successDim : colors.status.dangerDim, borderRadius: Radii.full, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: inStock ? colors.status.success + "30" : colors.status.danger + "30" }}>
            <Text style={{ color: inStock ? colors.status.success : colors.status.danger, fontSize: 11, fontFamily: Typography.fontSemibold }}>{inStock ? "В наличии" : "Нет"}</Text>
          </View>
          {/* Add button */}
          {inStock && (
            <TouchableOpacity onPress={(e) => { e.stopPropagation(); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onAdd(); }}
              style={{ position: "absolute", bottom: Spacing.sm, right: Spacing.sm, width: 36, height: 36, borderRadius: 18, backgroundColor: colors.accent.primary, alignItems: "center", justifyContent: "center" }}>
              <Feather name="shopping-cart" size={16} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
        {/* Info */}
        <View style={{ padding: Spacing.md }}>
          <Text style={{ fontSize: Typography.size.base, fontFamily: Typography.fontSemibold, color: colors.text.primary, marginBottom: 4 }} numberOfLines={2}>{product.name}</Text>
          {product.code && <Text style={{ fontSize: 11, color: colors.text.muted, fontFamily: Typography.fontMono, marginBottom: 6 }}>Артикул: {product.code}</Text>}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            {price > 0
              ? <Text style={{ fontSize: Typography.size.lg, fontFamily: Typography.fontBold, color: colors.accent.primary }}>{fmt(product.unitPrice)}<Text style={{ fontSize: Typography.size.xs, color: colors.text.muted }}>/{unitLabel(product.unit)}</Text></Text>
              : <Text style={{ fontSize: Typography.size.xs, color: colors.text.muted }}>Цена не задана</Text>
            }
            {inStock && <Text style={{ fontSize: Typography.size.xs, color: colors.status.success, fontFamily: Typography.fontMedium }}>{product.available} {unitLabel(product.unit)}</Text>}
          </View>
        </View>
      </Card>
    </TouchableOpacity>
  );
}

// ── Product Detail Modal ─────────────────────────────────────────────────────
function ProductDetail({ product, visible, onClose, onAdd, colors, isDark: _isDark, fmt }: {
  product: Product | null; visible: boolean; onClose: () => void; onAdd: (qty: number) => void;
  colors: ThemeColors; isDark: boolean; fmt: (v: number | string | null | undefined) => string;
}) {
  const [qty, setQty] = useState(1);
  const { width: SCREEN_W, height: SCREEN_H } = useWindowDimensions();
  if (!product) return null;
  const price = Number(product.unitPrice ?? 0);

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)" }} onPress={onClose}>
        <Pressable style={{
          position: "absolute", bottom: 0, left: 0, right: 0, maxHeight: "92%",
          backgroundColor: colors.bg.secondary, borderTopLeftRadius: Radii.xxl, borderTopRightRadius: Radii.xxl, overflow: "hidden",
        }} onPress={e => e.stopPropagation()}>
          {/* Handle */}
          <View style={{ alignItems: "center", paddingVertical: 10 }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border.default }} />
          </View>
          {/* Big photo — full width, 55% of screen height */}
          <View style={{ width: "100%", height: SCREEN_H * 0.45, backgroundColor: colors.bg.elevated }}>
            {product.photoUrl ? (
              <Image source={{ uri: product.photoUrl ?? undefined }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
            ) : (
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                <Feather name="package" size={64} color={colors.text.muted} />
              </View>
            )}
          </View>
          <View style={{ padding: Spacing.xl }}>
            <Text style={{ fontSize: 22, fontFamily: Typography.fontBold, color: colors.text.primary, marginBottom: 4 }}>{product.name}</Text>
            {product.code && <Text style={{ fontSize: Typography.size.sm, color: colors.text.muted, marginBottom: 12 }}>Артикул: {product.code}</Text>}
            {/* Price + Stock row */}
            <View style={{ flexDirection: "row", gap: Spacing.md, marginBottom: 20 }}>
              <View style={{ flex: 1, backgroundColor: colors.bg.card, borderRadius: Radii.lg, borderWidth: 1, borderColor: colors.border.default, padding: Spacing.lg }}>
                <Text style={{ fontSize: 10, color: colors.text.muted, textTransform: "uppercase", letterSpacing: 0.5, fontFamily: Typography.fontMedium }}>Цена за {unitLabel(product.unit)}</Text>
                <Text style={{ fontSize: 20, fontFamily: Typography.fontBold, color: price > 0 ? colors.accent.primary : colors.text.muted, marginTop: 4 }}>{price > 0 ? fmt(product.unitPrice) : "Не задана"}</Text>
              </View>
              <View style={{ flex: 1, backgroundColor: colors.bg.card, borderRadius: Radii.lg, borderWidth: 1, borderColor: colors.border.default, padding: Spacing.lg }}>
                <Text style={{ fontSize: 10, color: colors.text.muted, textTransform: "uppercase", letterSpacing: 0.5, fontFamily: Typography.fontMedium }}>Остаток</Text>
                <Text style={{ fontSize: 20, fontFamily: Typography.fontBold, color: Number(product.available) > 0 ? colors.status.success : colors.status.danger, marginTop: 4 }}>
                  {product.available} {unitLabel(product.unit)}
                </Text>
              </View>
            </View>
            {/* Qty stepper */}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 24, marginBottom: 20 }}>
              <TouchableOpacity onPress={() => setQty(Math.max(1, qty - 1))}
                style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.bg.elevated, borderWidth: 1, borderColor: colors.border.default, alignItems: "center", justifyContent: "center" }}>
                <Feather name="minus" size={20} color={colors.text.primary} />
              </TouchableOpacity>
              <Text style={{ fontSize: 32, fontFamily: Typography.fontBold, color: colors.text.primary, minWidth: 50, textAlign: "center" }}>{qty}</Text>
              <TouchableOpacity onPress={() => setQty(qty + 1)}
                style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.accent.primary, alignItems: "center", justifyContent: "center" }}>
                <Feather name="plus" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
            {/* Add button */}
            <TouchableOpacity onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onAdd(qty); setQty(1); }}
              style={{ backgroundColor: colors.accent.primary, borderRadius: Radii.md, padding: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 }}>
              <Feather name="shopping-cart" size={18} color="#fff" />
              <Text style={{ color: "#fff", fontSize: Typography.size.base, fontFamily: Typography.fontBold }}>Добавить в заказ</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── Shop Picker Modal ────────────────────────────────────────────────────────
function ShopPicker({ visible, shops, onSelect, onClose, colors }: {
  visible: boolean; shops: Shop[]; onSelect: (shopId: number) => void; onClose: () => void; colors: ThemeColors;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  return (
    <Modal visible={visible} animationType="slide" transparent>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)" }} onPress={onClose}>
        <Pressable style={{
          position: "absolute", bottom: 0, left: 0, right: 0, maxHeight: "60%",
          backgroundColor: colors.bg.secondary, borderTopLeftRadius: Radii.xxl, borderTopRightRadius: Radii.xxl, padding: Spacing.xl,
        }} onPress={e => e.stopPropagation()}>
          <View style={{ alignItems: "center", paddingBottom: Spacing.md }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border.default }} />
          </View>
          <Text style={{ color: colors.text.primary, fontSize: Typography.size.lg, fontFamily: Typography.fontBold, marginBottom: Spacing.lg }}>Выберите магазин</Text>
          <FlatList data={shops} keyExtractor={s => String(s.id)} style={{ maxHeight: 300 }}
            renderItem={({ item: shop }) => (
              <TouchableOpacity onPress={() => setSelected(shop.id)}
                style={{ flexDirection: "row", alignItems: "center", padding: Spacing.base, marginBottom: Spacing.sm, borderRadius: Radii.md, backgroundColor: selected === shop.id ? colors.accent.primary + "12" : colors.bg.card, borderWidth: 1.5, borderColor: selected === shop.id ? colors.accent.primary : colors.border.default }}>
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: selected === shop.id ? colors.accent.primary : colors.bg.elevated, alignItems: "center", justifyContent: "center", marginRight: Spacing.md }}>
                  <Feather name="shopping-bag" size={16} color={selected === shop.id ? "#fff" : colors.text.muted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text.primary, fontSize: Typography.size.base, fontFamily: Typography.fontSemibold }}>{shop.name}</Text>
                  {shop.district && <Text style={{ color: colors.text.tertiary, fontSize: Typography.size.xs }}>{shop.district}</Text>}
                </View>
                {selected === shop.id && <Feather name="check-circle" size={20} color={colors.accent.primary} />}
              </TouchableOpacity>
            )}
          />
          <TouchableOpacity onPress={() => selected && onSelect(selected)} disabled={!selected}
            style={{ backgroundColor: colors.accent.primary, borderRadius: Radii.md, padding: 15, alignItems: "center", marginTop: Spacing.lg, opacity: selected ? 1 : 0.5 }}>
            <Text style={{ color: "#fff", fontSize: Typography.size.base, fontFamily: Typography.fontBold }}>Создать заказ</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── Payment Picker Modal ─────────────────────────────────────────────────────
function PaymentPicker({ visible, onSelect, onClose, colors }: {
  visible: boolean; onSelect: (method: "cash" | "card" | "transfer" | "debt") => void; onClose: () => void; colors: ThemeColors;
}) {
  const [selected, setSelected] = useState<"cash" | "card" | "transfer" | "debt">("cash");
  const options: Array<{ key: "cash" | "card" | "transfer" | "debt"; label: string; icon: "dollar-sign" | "credit-card" | "send" | "alert-circle" }> = [
    { key: "cash", label: "Наличные", icon: "dollar-sign" },
    { key: "card", label: "Карта", icon: "credit-card" },
    { key: "transfer", label: "Перевод", icon: "send" },
    { key: "debt", label: "Долг", icon: "alert-circle" },
  ];
  return (
    <Modal visible={visible} animationType="slide" transparent>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)" }} onPress={onClose}>
        <Pressable style={{
          position: "absolute", bottom: 0, left: 0, right: 0,
          backgroundColor: colors.bg.secondary, borderTopLeftRadius: Radii.xxl, borderTopRightRadius: Radii.xxl, padding: Spacing.xl,
        }} onPress={e => e.stopPropagation()}>
          <View style={{ alignItems: "center", paddingBottom: Spacing.md }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border.default }} />
          </View>
          <Text style={{ color: colors.text.primary, fontSize: Typography.size.lg, fontFamily: Typography.fontBold, marginBottom: Spacing.lg }}>Способ оплаты</Text>
          <View style={{ flexDirection: "row", gap: Spacing.sm, marginBottom: Spacing.xl }}>
            {options.map(opt => {
              const active = selected === opt.key;
              return (
                <TouchableOpacity key={opt.key} onPress={() => setSelected(opt.key)} activeOpacity={0.8}
                  style={{ flex: 1, alignItems: "center", gap: 6, paddingVertical: 14, borderRadius: Radii.md, borderWidth: 1.5, backgroundColor: active ? colors.accent.primary + "12" : colors.bg.elevated, borderColor: active ? colors.accent.primary : colors.border.default }}>
                  <Feather name={opt.icon} size={18} color={active ? colors.accent.primary : colors.text.secondary} />
                  <Text style={{ fontSize: Typography.size.xs, fontFamily: Typography.fontSemibold, color: active ? colors.accent.primary : colors.text.secondary }}>{opt.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <TouchableOpacity onPress={() => onSelect(selected)}
            style={{ backgroundColor: colors.accent.primary, borderRadius: Radii.md, padding: 15, alignItems: "center" }}>
            <Text style={{ color: "#fff", fontSize: Typography.size.base, fontFamily: Typography.fontBold }}>Подтвердить</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default function CatalogScreen() {
  const { width: SCREEN_W } = useWindowDimensions();
  const CARD_W = useMemo(() => (SCREEN_W - Spacing.base * 2 - Spacing.md) / 2, [SCREEN_W]);
  const { isDark } = useThemeStore();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  const [search, setSearch] = useState("");
  const [selectedCat, setSelectedCat] = useState("all");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [showShopPicker, setShowShopPicker] = useState(false);
  const [pendingProduct, setPendingProduct] = useState<Product | null>(null);
  const [pendingQty, setPendingQty] = useState(1);
  const [pendingShopId, setPendingShopId] = useState<number | null>(null);
  const [showPaymentPicker, setShowPaymentPicker] = useState(false);

  const canAccessAgent = user?.role === "agent" || user?.role === "supervisor" || user?.role === "ceo" || user?.role === "operator";
  const { data: products = [], isLoading, isError, error } = useQuery({
    queryKey: ["products", search],
    queryFn: () => getProducts(search),
    enabled: canAccessAgent,
  });
  const { data: shopsData } = useQuery({ queryKey: ["myShops"], queryFn: getMyShops, enabled: canAccessAgent });
  const { data: serverCategories = [] } = useQuery({ queryKey: ["categories"], queryFn: getCategories, enabled: canAccessAgent });

  const shops = useMemo(() => (shopsData ?? []).sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "")), [shopsData]);

  const categories = useMemo(() => {
    const dynamic = (serverCategories ?? []).filter(Boolean).map((c: string) => ({ key: c.toLowerCase(), label: c }));
    return [{ key: "all", label: "Все" }, ...dynamic];
  }, [serverCategories]);

  const filtered = useMemo(() => {
    let result = products;
    if (search) { const q = search.toLowerCase(); result = result.filter(p => p.name.toLowerCase().includes(q) || p.code?.toLowerCase().includes(q) || p.category?.toLowerCase().includes(q)); }
    if (selectedCat !== "all") result = result.filter(p => p.category?.toLowerCase() === selectedCat);
    return result;
  }, [products, search, selectedCat]);

  const fmt = useCallback((v: number | string | null | undefined) => {
    return Number(v ?? 0).toLocaleString("ru-RU", { style: "currency", currency: "UZS", maximumFractionDigits: 0 });
  }, []);

  const createOrderMutation = useMutation({
    mutationFn: (input: { shopId: number; items: { productId: number; quantity: number; unitPrice: number }[]; paymentMethod?: "cash" | "card" | "transfer" | "debt" }) => createOrder(input),
    onSuccess: () => { notify.success("Заказ создан!"); setShowShopPicker(false); setShowPaymentPicker(false); setPendingProduct(null); setPendingShopId(null); queryClient.invalidateQueries({ queryKey: ["myOrders"] }); },
    onError: (e: Error) => notify.error(e.message || "Ошибка"),
  });

  const handleAdd = useCallback((product: Product, qty: number) => {
    if (shops.length === 0) { notify.error("Нет магазинов"); return; }
    if (shops.length === 1) {
      setPendingProduct(product); setPendingQty(qty); setPendingShopId(shops[0].id); setShowPaymentPicker(true);
    } else {
      setPendingProduct(product); setPendingQty(qty); setShowShopPicker(true);
    }
  }, [shops]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      {/* Header */}
      <View style={{ paddingTop: insets.top + Spacing.sm, paddingHorizontal: Spacing.base, paddingBottom: Spacing.md }}>
        <Text style={{ color: colors.text.primary, fontSize: Typography.size.xxl, fontFamily: Typography.fontExtraBold, marginBottom: Spacing.md }}>Каталог</Text>
        <SearchInput value={search} onChangeText={setSearch} placeholder="Поиск товаров..." />
      </View>

      {/* Category chips */}
      {categories.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: Spacing.base, gap: Spacing.sm, marginBottom: Spacing.base }}>
          {categories.map(cat => {
            const active = selectedCat === cat.key;
            return (
              <TouchableOpacity key={cat.key} onPress={() => setSelectedCat(cat.key)}
                style={{ backgroundColor: active ? colors.accent.primary : colors.bg.elevated, borderRadius: Radii.full, borderWidth: active ? 0 : 1, borderColor: colors.border.default, paddingHorizontal: 16, paddingVertical: 8, minHeight: 36, justifyContent: "center" }}>
                <Text style={{ color: active ? "#fff" : colors.text.primary, fontSize: Typography.size.sm, fontFamily: Typography.fontSemibold, textAlign: "center" }}>{cat.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* Products — 2-column grid with big images */}
      {isError ? (
        <View style={{ alignItems: "center", paddingVertical: 80, paddingHorizontal: Spacing.xl }}>
          <View style={{ width: 72, height: 72, borderRadius: Radii.xl, backgroundColor: colors.status.dangerDim, alignItems: "center", justifyContent: "center", marginBottom: Spacing.md }}>
            <Feather name="wifi-off" size={32} color={colors.status.danger} />
          </View>
          <Text style={{ color: colors.text.secondary, fontSize: Typography.size.lg, fontFamily: Typography.fontSemibold }}>Ошибка загрузки</Text>
          <Text style={{ color: colors.text.muted, fontSize: Typography.size.sm, marginTop: 4, textAlign: "center" }}>{error?.message ?? "Проверьте подключение"}</Text>
        </View>
      ) : isLoading ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: Spacing.md, paddingHorizontal: Spacing.base }}>
          {[1, 2, 3, 4].map(i => (
            <View key={i} style={{ width: CARD_W, height: 220, borderRadius: Radii.xl, backgroundColor: colors.bg.elevated, opacity: 0.5 }} />
          ))}
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => String(item.id)}
          numColumns={2}
          columnWrapperStyle={{ gap: Spacing.md, paddingHorizontal: Spacing.base }}
          contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <ProductCard
              product={item} colors={colors} isDark={isDark}
              onPress={() => { setSelectedProduct(item); setShowDetail(true); }}
              onAdd={() => handleAdd(item, 1)} fmt={fmt} cardWidth={CARD_W} />
          )}
          ListEmptyComponent={
            <View style={{ alignItems: "center", paddingVertical: 80, paddingHorizontal: Spacing.xl }}>
              <View style={{ width: 72, height: 72, borderRadius: Radii.xl, backgroundColor: colors.bg.elevated, alignItems: "center", justifyContent: "center", marginBottom: Spacing.md }}>
                <Feather name="search" size={32} color={colors.text.muted} />
              </View>
              <Text style={{ color: colors.text.secondary, fontSize: Typography.size.lg, fontFamily: Typography.fontSemibold }}>
                {search ? "Товары не найдены" : "Введите запрос для поиска"}
              </Text>
              <Text style={{ color: colors.text.muted, fontSize: Typography.size.sm, marginTop: 4, textAlign: "center" }}>
                {search ? "Попробуйте изменить запрос" : "Начните вводить название товара"}
              </Text>
            </View>
          }
        />
      )}

      <ProductDetail product={selectedProduct} visible={showDetail} colors={colors} isDark={isDark} fmt={fmt}
        onClose={() => { setShowDetail(false); setSelectedProduct(null); }}
        onAdd={(qty) => { if (selectedProduct) { handleAdd(selectedProduct, qty); setShowDetail(false); setSelectedProduct(null); } }} />

      <ShopPicker visible={showShopPicker} shops={shops} colors={colors}
        onClose={() => { setShowShopPicker(false); setPendingProduct(null); }}
        onSelect={(shopId) => {
          setShowShopPicker(false);
          setPendingShopId(shopId);
          setShowPaymentPicker(true);
        }} />

      <PaymentPicker visible={showPaymentPicker} colors={colors}
        onClose={() => { setShowPaymentPicker(false); setPendingProduct(null); setPendingShopId(null); }}
        onSelect={(method) => {
          if (pendingProduct && pendingShopId) {
            createOrderMutation.mutate({ shopId: pendingShopId, items: [{ productId: pendingProduct.id, quantity: pendingQty, unitPrice: Number(pendingProduct.unitPrice) }], paymentMethod: method });
          }
        }} />
    </View>
  );
}
