import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  FlatList,
  Animated,
  Modal,
  Pressable,
  Image,
  Dimensions,
  Platform,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";
import { getProducts, getCategories, createOrder, getMyShops, Product, Shop } from "../../src/api";
import { usePerformanceMonitor } from "../../src/hooks/usePerformanceMonitor";
import { Skeleton } from "../../src/components/ui";
import { WebColors, WebShadows, WebTypography, WebSpacing, WebRadii, createWebStyles } from "../../src/theme-web-match";
import { useThemeStore } from "../../src/store/theme";
import { useAuthStore } from "../../src/store/auth";
import { notify } from "../../src/store/toast";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CARD_WIDTH = (SCREEN_WIDTH - 48) / 2;
const HERO_CARD_WIDTH = SCREEN_WIDTH - 32;

type IconName = keyof typeof Feather.glyphMap;

const BASE_CATEGORIES = [
  { key: "all", label: "Все", uz: "Hammasi", icon: "grid" as IconName },
  { key: "popular", label: "Популярные", uz: "Mashhur", icon: "trending-up" as IconName },
];

const HeroProductCard = React.memo(function HeroProductCard({ product, isDark, web, onPress, onAdd, fmt }: {
  product: Product;
  isDark: boolean;
  web: ReturnType<typeof createWebStyles>;
  onPress: () => void;
  onAdd: () => void;
  fmt: (v: number | string | null | undefined) => string;
}) {
  const [scaleAnim] = useState(() => new Animated.Value(1));
  const c = isDark ? WebColors.dark : WebColors.light;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, { toValue: 0.97, useNativeDriver: true }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, { toValue: 1, friction: 3, tension: 40, useNativeDriver: true }).start();
  };

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }], marginBottom: WebSpacing.lg }}>
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[
          web.neoCard,
          { width: HERO_CARD_WIDTH, height: 280, overflow: "hidden", padding: 0 },
        ]}
      >
        {product.photoUrl ? (
          <Image source={{ uri: product.photoUrl }} style={{ width: "100%", height: 180 }} resizeMode="cover" />
        ) : (
          <View style={{ width: "100%", height: 180, backgroundColor: c.surfaceLight, alignItems: "center", justifyContent: "center" }}>
            <Feather name="package" size={64} color={c.textTertiary} />
          </View>
        )}

        <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 100, backgroundColor: "rgba(0,0,0,0.5)" }} />

        <View style={[web.badge, { position: "absolute", top: WebSpacing.md, right: WebSpacing.md }]}>
          <Text style={{ color: "#fff", fontSize: WebTypography.size.sm, fontFamily: WebTypography.family, fontWeight: WebTypography.weight.bold }}>
            {fmt(product.unitPrice)}
          </Text>
        </View>

        {Number(product.available) > 0 ? (
          <View style={[web.badgeSuccess, { position: "absolute", top: WebSpacing.md, left: WebSpacing.md, paddingHorizontal: WebSpacing.sm }]}>
            <Text style={{ color: "#fff", fontSize: WebTypography.size.xs, fontFamily: WebTypography.family, fontWeight: WebTypography.weight.semibold }}>
              В наличии
            </Text>
          </View>
        ) : (
          <View style={[web.badgeDanger, { position: "absolute", top: WebSpacing.md, left: WebSpacing.md, paddingHorizontal: WebSpacing.sm }]}>
            <Text style={{ color: "#fff", fontSize: WebTypography.size.xs, fontFamily: WebTypography.family, fontWeight: WebTypography.weight.semibold }}>
              Нет в наличии
            </Text>
          </View>
        )}

        <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: WebSpacing.lg }}>
          <Text style={{ color: "#fff", fontSize: WebTypography.size.lg, fontFamily: WebTypography.family, fontWeight: WebTypography.weight.bold, marginBottom: WebSpacing.xxs }} numberOfLines={1}>
            {product.name}
          </Text>
          {product.code && (
            <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: WebTypography.size.sm, fontFamily: WebTypography.family, fontWeight: WebTypography.weight.medium }}>
              Артикул: {product.code}
            </Text>
          )}
        </View>

        <TouchableOpacity
          onPress={(e) => { e.stopPropagation(); onAdd(); }}
          style={[web.neoBtnPrimary, { position: "absolute", bottom: WebSpacing.lg, right: WebSpacing.lg, width: 44, height: 44, borderRadius: 22, padding: 0 }]}
        >
          <Feather name="plus" size={22} color="#fff" />
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
});

const CompactProductCard = React.memo(function CompactProductCard({ product, isDark, web, onPress, onAdd, fmt }: {
  product: Product;
  isDark: boolean;
  web: ReturnType<typeof createWebStyles>;
  onPress: () => void;
  onAdd: () => void;
  fmt: (v: number | string | null | undefined) => string;
}) {
  const [scaleAnim] = useState(() => new Animated.Value(1));
  const c = isDark ? WebColors.dark : WebColors.light;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, { toValue: 0.95, useNativeDriver: true }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, { toValue: 1, friction: 3, tension: 40, useNativeDriver: true }).start();
  };

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }], width: CARD_WIDTH }}>
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[web.neoCard, { overflow: "hidden", marginBottom: WebSpacing.md, padding: 0 }]}
      >
        {product.photoUrl ? (
          <Image source={{ uri: product.photoUrl }} style={{ width: "100%", height: CARD_WIDTH * 0.8 }} resizeMode="cover" />
        ) : (
          <View style={{ width: "100%", height: CARD_WIDTH * 0.8, backgroundColor: c.surfaceLight, alignItems: "center", justifyContent: "center" }}>
            <Feather name="package" size={32} color={c.textTertiary} />
          </View>
        )}

        <View style={{ padding: WebSpacing.md }}>
          <Text style={{ color: c.textPrimary, fontSize: WebTypography.size.sm, fontFamily: WebTypography.family, fontWeight: WebTypography.weight.semibold, marginBottom: WebSpacing.xs }} numberOfLines={2}>
            {product.name}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ color: c.primary, fontSize: WebTypography.size.md, fontFamily: WebTypography.family, fontWeight: WebTypography.weight.bold }}>
              {fmt(product.unitPrice)}
            </Text>
            <TouchableOpacity onPress={(e) => { e.stopPropagation(); onAdd(); }} style={[web.neoBtnPrimary, { width: 32, height: 32, borderRadius: WebRadii.full, padding: 0 }]}>
              <Feather name="plus" size={16} color="#fff" />
            </TouchableOpacity>
          </View>
          {Number(product.available) > 0 ? (
            <Text style={{ color: c.success, fontSize: WebTypography.size.xs, fontFamily: WebTypography.family, marginTop: WebSpacing.xs }}>
              {product.available} {product.unit || "шт"}
            </Text>
          ) : (
            <Text style={{ color: c.danger, fontSize: WebTypography.size.xs, fontFamily: WebTypography.family, marginTop: WebSpacing.xs }}>
              Нет в наличии
            </Text>
          )}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
});

function ProductDetailModal({ product, visible, onClose, onAdd, isDark, web, fmt }: {
  product: Product | null;
  visible: boolean;
  onClose: () => void;
  onAdd: (qty: number) => void;
  isDark: boolean;
  web: ReturnType<typeof createWebStyles>;
  fmt: (v: number | string | null | undefined) => string;
}) {
  const [qty, setQty] = useState(1);
  const c = isDark ? WebColors.dark : WebColors.light;

  if (!product) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)" }} onPress={onClose}>
        <Pressable
          style={[web.neoCard, { position: "absolute", bottom: 0, left: 0, right: 0, maxHeight: "85%", borderTopLeftRadius: WebRadii.xl, borderTopRightRadius: WebRadii.xl, overflow: "hidden", padding: 0 }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={{ alignItems: "center", paddingVertical: WebSpacing.md }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: c.border }} />
          </View>

          {product.photoUrl ? (
            <Image source={{ uri: product.photoUrl }} style={{ width: "100%", height: 250 }} resizeMode="cover" />
          ) : (
            <View style={{ width: "100%", height: 250, backgroundColor: c.surfaceLight, alignItems: "center", justifyContent: "center" }}>
              <Feather name="package" size={80} color={c.textTertiary} />
            </View>
          )}

          <View style={{ padding: WebSpacing.xl }}>
            <Text style={{ color: c.textPrimary, fontSize: WebTypography.size.xxl, fontFamily: WebTypography.family, fontWeight: WebTypography.weight.bold, marginBottom: WebSpacing.sm }}>
              {product.name}
            </Text>

            {product.code && (
              <Text style={{ color: c.textTertiary, fontSize: WebTypography.size.sm, fontFamily: WebTypography.family, marginBottom: WebSpacing.lg }}>
                Артикул: {product.code}
              </Text>
            )}

            <View style={{ flexDirection: "row", gap: WebSpacing.md, marginBottom: WebSpacing.xl }}>
              <View style={[web.neoCardSm, { flex: 1, padding: WebSpacing.lg }]}>
                <Text style={{ color: c.textTertiary, fontSize: WebTypography.size.xs, fontFamily: WebTypography.family, fontWeight: WebTypography.weight.medium, textTransform: "uppercase", letterSpacing: 0.5 }}>
                  Цена
                </Text>
                <Text style={{ color: c.primary, fontSize: WebTypography.size.xl, fontFamily: WebTypography.family, fontWeight: WebTypography.weight.bold, marginTop: WebSpacing.xs }}>
                  {fmt(product.unitPrice)}
                </Text>
              </View>
              <View style={[web.neoCardSm, { flex: 1, padding: WebSpacing.lg }]}>
                <Text style={{ color: c.textTertiary, fontSize: WebTypography.size.xs, fontFamily: WebTypography.family, fontWeight: WebTypography.weight.medium, textTransform: "uppercase", letterSpacing: 0.5 }}>
                  Остаток
                </Text>
                <Text style={{ color: Number(product.available) > 0 ? c.success : c.danger, fontSize: WebTypography.size.xl, fontFamily: WebTypography.family, fontWeight: WebTypography.weight.bold, marginTop: WebSpacing.xs }}>
                  {product.available} {product.unit || "шт"}
                </Text>
              </View>
            </View>

            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: WebSpacing.xl, marginBottom: WebSpacing.xl }}>
              <TouchableOpacity
                onPress={() => setQty(Math.max(1, qty - 1))}
                style={[web.neoBtn, { width: 48, height: 48, borderRadius: WebRadii.full, padding: 0 }]}
              >
                <Feather name="minus" size={20} color={c.textPrimary} />
              </TouchableOpacity>
              <Text style={{ color: c.textPrimary, fontSize: WebTypography.size["2xl"], fontFamily: WebTypography.family, fontWeight: WebTypography.weight.bold, minWidth: 60, textAlign: "center" }}>
                {qty}
              </Text>
              <TouchableOpacity
                onPress={() => setQty(qty + 1)}
                style={[web.neoBtnPrimary, { width: 48, height: 48, borderRadius: WebRadii.full, padding: 0 }]}
              >
                <Feather name="plus" size={20} color="#fff" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                onAdd(qty);
                setQty(1);
              }}
              style={[web.neoBtnPrimary, { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: WebSpacing.sm }]}
            >
              <Feather name="shopping-cart" size={20} color="#fff" />
              <Text style={{ color: "#fff", fontSize: WebTypography.size.lg, fontFamily: WebTypography.family, fontWeight: WebTypography.weight.bold }}>
                Добавить в заказ
              </Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function QuickOrderSheet({ visible, shops, onClose, onSubmit, isDark, web }: {
  visible: boolean;
  shops: Shop[];
  onClose: () => void;
  onSubmit: (shopId: number) => void;
  isDark: boolean;
  web: ReturnType<typeof createWebStyles>;
}) {
  const [selectedShop, setSelectedShop] = useState<number | null>(null);
  const c = isDark ? WebColors.dark : WebColors.light;

  const shopItems = useMemo(() => {
    let prevCity = "";
    let prevDistrict = "";
    return shops.map((shop) => {
      const city = shop.city ?? "";
      const district = shop.district ?? "";
      const showCityHeader = city !== "" && city !== prevCity;
      const showDistrictHeader = district !== "" && district !== prevDistrict;
      if (city) prevCity = city;
      if (district) prevDistrict = district;
      return { ...shop, showCityHeader, showDistrictHeader, city, district };
    });
  }, [shops]);

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)" }} onPress={onClose}>
        <Pressable
          style={[web.neoCard, { position: "absolute", bottom: 0, left: 0, right: 0, maxHeight: "60%", borderTopLeftRadius: WebRadii.xl, borderTopRightRadius: WebRadii.xl, padding: WebSpacing.xl }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={{ alignItems: "center", paddingBottom: WebSpacing.md }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: c.border }} />
          </View>

          <Text style={{ color: c.textPrimary, fontSize: WebTypography.size.xl, fontFamily: WebTypography.family, fontWeight: WebTypography.weight.bold, marginBottom: WebSpacing.lg }}>
            Выберите магазин
          </Text>

          <ScrollView style={{ maxHeight: 300 }}>
            {shopItems.map((shop) => {
              const { showCityHeader, showDistrictHeader, city, district } = shop;
              return (
                <View key={shop.id}>
                  {showCityHeader && (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: WebSpacing.sm, marginTop: WebSpacing.md, marginBottom: WebSpacing.xs }}>
                      <Feather name="map-pin" size={12} color={c.primary} />
                      <Text style={{ color: c.primary, fontSize: WebTypography.size.xs, fontFamily: WebTypography.family, fontWeight: WebTypography.weight.bold, textTransform: "uppercase", letterSpacing: 0.5 }}>
                        {city}
                      </Text>
                      <View style={{ flex: 1, height: 1, backgroundColor: c.border }} />
                    </View>
                  )}
                  {showDistrictHeader && !showCityHeader && (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: WebSpacing.sm, marginTop: WebSpacing.sm, marginBottom: WebSpacing.xs }}>
                      <Text style={{ color: c.textTertiary, fontSize: WebTypography.size.xs, fontFamily: WebTypography.family, fontWeight: WebTypography.weight.semibold, marginLeft: 20 }}>
                        {district}
                      </Text>
                      <View style={{ flex: 1, height: 1, backgroundColor: c.borderSubtle }} />
                    </View>
                  )}
                  <TouchableOpacity
                    onPress={() => setSelectedShop(shop.id)}
                    style={[
                      selectedShop === shop.id ? web.neoCardSm : web.neoCard,
                      {
                        flexDirection: "row",
                        alignItems: "center",
                        padding: WebSpacing.base,
                        marginBottom: WebSpacing.sm,
                        borderColor: selectedShop === shop.id ? c.primary : c.border,
                      }
                    ]}
                  >
                    <View style={[web.avatar, { width: 36, height: 36, borderRadius: WebRadii.full, backgroundColor: selectedShop === shop.id ? c.primary : c.surfaceLight, borderWidth: 0, marginRight: WebSpacing.md, justifyContent: "center" }]}>
                      <Feather name="shopping-bag" size={16} color={selectedShop === shop.id ? "#fff" : c.textTertiary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: c.textPrimary, fontSize: WebTypography.size.base, fontFamily: WebTypography.family, fontWeight: WebTypography.weight.semibold }}>
                        {shop.name}
                      </Text>
                      {district && (
                        <Text style={{ color: c.textTertiary, fontSize: WebTypography.size.xs, fontFamily: WebTypography.family }}>
                          {district}
                        </Text>
                      )}
                    </View>
                    {selectedShop === shop.id && (
                      <Feather name="check-circle" size={20} color={c.primary} />
                    )}
                  </TouchableOpacity>
                </View>
              );
            })}
          </ScrollView>

          <TouchableOpacity
            onPress={() => selectedShop && onSubmit(selectedShop)}
            disabled={!selectedShop}
            style={[
              web.neoBtnPrimary,
              { marginTop: WebSpacing.lg, opacity: selectedShop ? 1 : 0.5 }
            ]}
          >
            <Text style={{ color: selectedShop ? "#fff" : c.textTertiary, fontSize: WebTypography.size.lg, fontFamily: WebTypography.family, fontWeight: WebTypography.weight.bold }}>
              Создать заказ
            </Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function CatalogScreen() {
  const { isDark } = useThemeStore();
  const web = useMemo(() => createWebStyles(isDark), [isDark]);
  const c = isDark ? WebColors.dark : WebColors.light;
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const lang = (user as { lang?: string })?.lang ?? "ru";
  const t = (ru: string, uz: string) => (lang === "uz" ? uz : ru);
  const perf = usePerformanceMonitor("CatalogScreen");

  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [viewMode, setViewMode] = useState<"hero" | "grid">("hero");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [showOrderSheet, setShowOrderSheet] = useState(false);
  const [pendingProduct, setPendingProduct] = useState<Product | null>(null);
  const [pendingQty, setPendingQty] = useState(1);

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["products"],
    queryFn: getProducts,
  });

  const { data: shopsData } = useQuery({
    queryKey: ["myShops"],
    queryFn: getMyShops,
  });
  const shops = useMemo(() => {
    const list = shopsData ?? [];
    return [...list].sort((a, b) => {
      const cityA = (a.city ?? "").toLowerCase();
      const cityB = (b.city ?? "").toLowerCase();
      if (cityA !== cityB) return cityA.localeCompare(cityB);
      const districtA = (a.district ?? "").toLowerCase();
      const districtB = (b.district ?? "").toLowerCase();
      if (districtA !== districtB) return districtA.localeCompare(districtB);
      return (a.name ?? "").localeCompare(b.name ?? "");
    });
  }, [shopsData]);

  const fmt = useCallback((v: number | string | null | undefined) => {
    const num = Number(v ?? 0);
    return num.toLocaleString("ru-RU", { style: "currency", currency: "UZS", maximumFractionDigits: 0 });
  }, []);

  const { data: serverCategories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: getCategories,
  });

  const categories = useMemo(() => {
    const dynamicCats = (serverCategories ?? []).filter(Boolean).map((c: string) => ({
      key: c.toLowerCase(),
      label: c,
      uz: c,
      icon: "tag" as IconName,
    }));
    return [...BASE_CATEGORIES, ...dynamicCats];
  }, [serverCategories]);

  const filteredProducts = useMemo(() => {
    perf.start("filterProducts");
    let result = products;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((p) =>
        p.name.toLowerCase().includes(q) ||
        p.code?.toLowerCase().includes(q) ||
        p.category?.toLowerCase().includes(q)
      );
    }
    if (selectedCategory === "popular") {
      result = result.slice(0, 10);
    } else if (selectedCategory !== "all") {
      result = result.filter((p) => p.category?.toLowerCase() === selectedCategory);
    }
    perf.end("filterProducts");
    return result;
  }, [products, search, selectedCategory]);

  const createOrderMutation = useMutation({
    mutationFn: (input: { shopId: number; items: { productId: number; quantity: number; unitPrice: number }[] }) =>
      createOrder(input),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      notify.success("Заказ создан!");
      setShowOrderSheet(false);
      setPendingProduct(null);
      queryClient.invalidateQueries({ queryKey: ["myOrders"] });
    },
    onError: (e: Error) => {
      notify.error(e.message || "Ошибка создания заказа");
    },
  });

  const handleAddToOrder = useCallback((product: Product, qty: number) => {
    if (shops.length === 0) {
      notify.error("Нет магазинов для заказа");
      return;
    }
    if (shops.length === 1) {
      createOrderMutation.mutate({
        shopId: shops[0].id,
        items: [{ productId: product.id, quantity: qty, unitPrice: Number(product.unitPrice) }],
      });
    } else {
      setPendingProduct(product);
      setPendingQty(qty);
      setShowOrderSheet(true);
    }
  }, [shops, createOrderMutation]);

  const handleShopSelect = (shopId: number) => {
    if (pendingProduct) {
      createOrderMutation.mutate({
        shopId,
        items: [{ productId: pendingProduct.id, quantity: pendingQty, unitPrice: Number(pendingProduct.unitPrice) }],
      });
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.canvas }}>
      <View style={{ paddingTop: Platform.OS === "ios" ? 60 : 40, paddingHorizontal: WebSpacing.lg, paddingBottom: WebSpacing.lg }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: WebSpacing.lg }}>
          <View>
            <Text style={{ color: c.textPrimary, fontSize: WebTypography.size.xxl, fontFamily: WebTypography.family, fontWeight: WebTypography.weight.bold }}>
              {t("Каталог", "Katalog")}
            </Text>
            <Text style={{ color: c.textTertiary, fontSize: WebTypography.size.sm, fontFamily: WebTypography.family, marginTop: WebSpacing.xxs }}>
              {filteredProducts.length} {t("товаров", "mahsulot")}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => setViewMode(viewMode === "hero" ? "grid" : "hero")}
            style={web.neoCardSm}
          >
            <Feather name={viewMode === "hero" ? "grid" : "maximize-2"} size={18} color={c.textPrimary} />
          </TouchableOpacity>
        </View>

        <View style={web.neoInput}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Feather name="search" size={18} color={c.textTertiary} />
            <TextInput
              style={{ flex: 1, marginLeft: WebSpacing.sm, color: c.textPrimary, fontSize: WebTypography.size.sm, fontFamily: WebTypography.family }}
              placeholder={t("Поиск товаров…", "Mahsulot qidirish…")}
              placeholderTextColor={c.textTertiary}
              value={search}
              onChangeText={setSearch}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch("")}>
                <Feather name="x" size={18} color={c.textTertiary} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: WebSpacing.lg, gap: WebSpacing.sm, marginBottom: WebSpacing.lg, paddingVertical: WebSpacing.xs }}
      >
        {categories.map((cat) => (
          <TouchableOpacity
            key={cat.key}
            onPress={() => setSelectedCategory(cat.key)}
            style={selectedCategory === cat.key ? web.neoBtnPrimary : web.neoBtn}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: WebSpacing.xs, minWidth: 90, paddingHorizontal: WebSpacing.sm, paddingVertical: WebSpacing.xs }}>
              <Feather name={cat.icon} size={14} color={selectedCategory === cat.key ? "#fff" : c.textSecondary} />
              <Text style={{ color: selectedCategory === cat.key ? "#fff" : c.textSecondary, fontSize: WebTypography.size.sm, fontFamily: WebTypography.family, fontWeight: WebTypography.weight.semibold }}>
                {t(cat.label, cat.uz)}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {isLoading ? (
        <View style={{ padding: WebSpacing.lg }}>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} height={280} style={{ borderRadius: WebRadii.xl, marginBottom: WebSpacing.lg }} />
          ))}
        </View>
      ) : viewMode === "hero" ? (
        <FlatList
          data={filteredProducts}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ paddingHorizontal: WebSpacing.lg, paddingBottom: WebSpacing.xxxl }}
          showsVerticalScrollIndicator={false}
          windowSize={11}
          maxToRenderPerBatch={8}
          removeClippedSubviews
          updateCellsBatchingPeriod={50}
          renderItem={({ item }) => (
            <HeroProductCard
              product={item}
              isDark={isDark}
              web={web}
              onPress={() => { setSelectedProduct(item); setShowDetail(true); }}
              onAdd={() => handleAddToOrder(item, 1)}
              fmt={fmt}
            />
          )}
          ListEmptyComponent={
            <View style={{ alignItems: "center", paddingVertical: 60 }}>
              <Feather name="package" size={48} color={c.textTertiary} />
              <Text style={{ color: c.textTertiary, fontSize: WebTypography.size.base, fontFamily: WebTypography.family, marginTop: WebSpacing.md }}>
                {t("Товары не найдены", "Mahsulotlar topilmadi")}
              </Text>
            </View>
          }
        />
      ) : (
        <FlatList
          key={`grid-${viewMode}`}
          data={filteredProducts}
          keyExtractor={(item) => String(item.id)}
          numColumns={2}
          columnWrapperStyle={{ gap: WebSpacing.md, paddingHorizontal: WebSpacing.lg }}
          contentContainerStyle={{ paddingBottom: WebSpacing.xxxl }}
          showsVerticalScrollIndicator={false}
          windowSize={11}
          maxToRenderPerBatch={10}
          removeClippedSubviews
          updateCellsBatchingPeriod={50}
          renderItem={({ item }) => (
            <CompactProductCard
              product={item}
              isDark={isDark}
              web={web}
              onPress={() => { setSelectedProduct(item); setShowDetail(true); }}
              onAdd={() => handleAddToOrder(item, 1)}
              fmt={fmt}
            />
          )}
          ListEmptyComponent={
            <View style={{ alignItems: "center", paddingVertical: 60, flex: 1 }}>
              <Feather name="package" size={48} color={c.textTertiary} />
              <Text style={{ color: c.textTertiary, fontSize: WebTypography.size.base, fontFamily: WebTypography.family, marginTop: WebSpacing.md }}>
                {t("Товары не найдены", "Mahsulotlar topilmadi")}
              </Text>
            </View>
          }
        />
      )}

      <ProductDetailModal
        product={selectedProduct}
        visible={showDetail}
        onClose={() => { setShowDetail(false); setSelectedProduct(null); }}
        onAdd={(qty) => {
          if (selectedProduct) {
            handleAddToOrder(selectedProduct, qty);
            setShowDetail(false);
            setSelectedProduct(null);
          }
        }}
        isDark={isDark}
        web={web}
        fmt={fmt}
      />

      <QuickOrderSheet
        visible={showOrderSheet}
        shops={shops}
        onClose={() => { setShowOrderSheet(false); setPendingProduct(null); }}
        onSubmit={handleShopSelect}
        isDark={isDark}
        web={web}
      />
    </View>
  );
}
