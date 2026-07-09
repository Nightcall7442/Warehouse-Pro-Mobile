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
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { getProducts, getCategories, createOrder, getMyShops, Product, Shop } from "../../src/api";
import { usePerformanceMonitor } from "../../src/hooks/usePerformanceMonitor";
import { Skeleton } from "../../src/components/ui";
import { Typography, Radii, ThemeColors } from "../../src/theme";
import { useThemeColors } from "../../src/store/theme";
import { useAuthStore } from "../../src/store/auth";
import { notify } from "../../src/store/toast";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CARD_WIDTH = (SCREEN_WIDTH - 48) / 2;
const HERO_CARD_WIDTH = SCREEN_WIDTH - 32;

type IconName = keyof typeof Feather.glyphMap;

// ─── Categories (static base + dynamic from products) ───────────────────────
const BASE_CATEGORIES = [
  { key: "all", label: "Все", uz: "Hammasi", icon: "grid" as IconName },
  { key: "popular", label: "Популярные", uz: "Mashhur", icon: "trending-up" as IconName },
];

// ─── Hero Product Card (magazine style) ──────────────────────────────────────
const HeroProductCard = React.memo(function HeroProductCard({ product, colors, onPress, onAdd, _lang, fmt }: {
  product: Product;
  colors: ThemeColors;
  onPress: () => void;
  onAdd: () => void;
  _lang: string;
  fmt: (v: number | string | null | undefined) => string;
}) {
  const [scaleAnim] = useState(() => new Animated.Value(1));

  const handlePressIn = () => {
    Animated.spring(scaleAnim, { toValue: 0.97, useNativeDriver: true }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, { toValue: 1, friction: 3, tension: 40, useNativeDriver: true }).start();
  };

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }], marginBottom: 16 }}>
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={{
          width: HERO_CARD_WIDTH,
          height: 280,
          borderRadius: Radii.xl,
          overflow: "hidden",
          backgroundColor: colors.bg.card,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.15,
          shadowRadius: 12,
          elevation: 8,
        }}
      >
        {/* Product Image */}
        {product.photoUrl ? (
          <Image
            source={{ uri: product.photoUrl }}
            style={{ width: "100%", height: 180 }}
            resizeMode="cover"
          />
        ) : (
          <LinearGradient
            colors={[colors.brand.primary + "30", colors.brand.primary + "10"]}
            style={{ width: "100%", height: 180, alignItems: "center", justifyContent: "center" }}
          >
            <Feather name="package" size={64} color={colors.brand.primary + "60"} />
          </LinearGradient>
        )}

        {/* Overlay gradient */}
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.7)"]}
          style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 120 }}
        />

        {/* Price badge */}
        <View style={{
          position: "absolute",
          top: 12,
          right: 12,
          backgroundColor: colors.brand.primary,
          paddingHorizontal: 12,
          paddingVertical: 6,
          borderRadius: Radii.lg,
          shadowColor: colors.brand.primary,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.4,
          shadowRadius: 8,
        }}>
          <Text style={{ color: "#fff", fontSize: 14, fontFamily: Typography.fontBold }}>
            {fmt(product.unitPrice)}
          </Text>
        </View>

        {/* Stock badge */}
        {Number(product.available) > 0 ? (
          <View style={{
            position: "absolute",
            top: 12,
            left: 12,
            backgroundColor: colors.status.success + "20",
            paddingHorizontal: 8,
            paddingVertical: 4,
            borderRadius: Radii.sm,
          }}>
            <Text style={{ color: colors.status.success, fontSize: 10, fontFamily: Typography.fontSemiBold }}>
              В наличии
            </Text>
          </View>
        ) : (
          <View style={{
            position: "absolute",
            top: 12,
            left: 12,
            backgroundColor: colors.status.danger + "20",
            paddingHorizontal: 8,
            paddingVertical: 4,
            borderRadius: Radii.sm,
          }}>
            <Text style={{ color: colors.status.danger, fontSize: 10, fontFamily: Typography.fontSemiBold }}>
              Нет в наличии
            </Text>
          </View>
        )}

        {/* Product info */}
        <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: 16 }}>
          <Text style={{
            color: "#fff",
            fontSize: 18,
            fontFamily: Typography.fontBold,
            marginBottom: 4,
          }} numberOfLines={1}>
            {product.name}
          </Text>
          {product.code && (
            <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, fontFamily: Typography.fontMedium }}>
              Артикул: {product.code}
            </Text>
          )}
        </View>

        {/* Quick add button */}
        <TouchableOpacity
          onPress={(e) => { e.stopPropagation(); onAdd(); }}
          style={{
            position: "absolute",
            bottom: 16,
            right: 16,
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: colors.brand.primary,
            alignItems: "center",
            justifyContent: "center",
            shadowColor: colors.brand.primary,
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.5,
            shadowRadius: 8,
          }}
        >
          <Feather name="plus" size={22} color="#fff" />
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
});

// ─── Compact Product Card (grid) ─────────────────────────────────────────────
const CompactProductCard = React.memo(function CompactProductCard({ product, colors, onPress, onAdd, _lang, fmt }: {
  product: Product;
  colors: ThemeColors;
  onPress: () => void;
  onAdd: () => void;
  _lang: string;
  fmt: (v: number | string | null | undefined) => string;
}) {
  const [scaleAnim] = useState(() => new Animated.Value(1));

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
        style={{
          backgroundColor: colors.bg.card,
          borderRadius: Radii.lg,
          overflow: "hidden",
          marginBottom: 12,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.1,
          shadowRadius: 8,
          elevation: 4,
        }}
      >
        {/* Product Image */}
        {product.photoUrl ? (
          <Image
            source={{ uri: product.photoUrl }}
            style={{ width: "100%", height: CARD_WIDTH * 0.8 }}
            resizeMode="cover"
          />
        ) : (
          <View style={{
            width: "100%",
            height: CARD_WIDTH * 0.8,
            backgroundColor: colors.brand.primaryDim,
            alignItems: "center",
            justifyContent: "center",
          }}>
            <Feather name="package" size={32} color={colors.brand.primary + "60"} />
          </View>
        )}

        {/* Info */}
        <View style={{ padding: 12 }}>
          <Text style={{
            color: colors.text.primary,
            fontSize: 13,
            fontFamily: Typography.fontSemiBold,
            marginBottom: 4,
          }} numberOfLines={2}>
            {product.name}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{
              color: colors.brand.primary,
              fontSize: 15,
              fontFamily: Typography.fontBold,
            }}>
              {fmt(product.unitPrice)}
            </Text>
            <TouchableOpacity
              onPress={(e) => { e.stopPropagation(); onAdd(); }}
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor: colors.brand.primary,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Feather name="plus" size={16} color="#fff" />
            </TouchableOpacity>
          </View>
          {Number(product.available) > 0 ? (
            <Text style={{ color: colors.status.success, fontSize: 10, marginTop: 4 }}>
              {product.available} {product.unit || "шт"}
            </Text>
          ) : (
            <Text style={{ color: colors.status.danger, fontSize: 10, marginTop: 4 }}>
              Нет в наличии
            </Text>
          )}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
});

// ─── Product Detail Modal ─────────────────────────────────────────────────────
function ProductDetailModal({ product, visible, onClose, onAdd, colors, _lang, fmt }: {
  product: Product | null;
  visible: boolean;
  onClose: () => void;
  onAdd: (qty: number) => void;
  colors: ThemeColors;
  _lang: string;
  fmt: (v: number | string | null | undefined) => string;
}) {
  const [qty, setQty] = useState(1);

  if (!product) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)" }} onPress={onClose}>
        <Pressable style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          maxHeight: "85%",
          backgroundColor: colors.bg.secondary,
          borderTopLeftRadius: Radii.xl,
          borderTopRightRadius: Radii.xl,
          overflow: "hidden",
        }} onPress={(e) => e.stopPropagation()}>
          {/* Handle bar */}
          <View style={{ alignItems: "center", paddingVertical: 12 }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border.strong }} />
          </View>

          {/* Product image */}
          {product.photoUrl ? (
            <Image
              source={{ uri: product.photoUrl }}
              style={{ width: "100%", height: 250 }}
              resizeMode="cover"
            />
          ) : (
            <LinearGradient
              colors={[colors.brand.primary + "20", colors.brand.primaryDim]}
              style={{ width: "100%", height: 250, alignItems: "center", justifyContent: "center" }}
            >
              <Feather name="package" size={80} color={colors.brand.primary + "40"} />
            </LinearGradient>
          )}

          {/* Product info */}
          <View style={{ padding: 20 }}>
            <Text style={{
              color: colors.text.primary,
              fontSize: 22,
              fontFamily: Typography.fontBold,
              marginBottom: 8,
            }}>
              {product.name}
            </Text>

            {product.code && (
              <Text style={{ color: colors.text.tertiary, fontSize: 13, marginBottom: 12 }}>
                Артикул: {product.code}
              </Text>
            )}

            <View style={{ flexDirection: "row", gap: 12, marginBottom: 20 }}>
              <View style={{
                flex: 1,
                padding: 16,
                backgroundColor: colors.bg.card,
                borderRadius: Radii.lg,
              }}>
                <Text style={{ color: colors.text.tertiary, fontSize: 11, fontFamily: Typography.fontMedium, textTransform: "uppercase", letterSpacing: 0.05 }}>
                  Цена
                </Text>
                <Text style={{ color: colors.brand.primary, fontSize: 20, fontFamily: Typography.fontBold, marginTop: 4 }}>
                  {fmt(product.unitPrice)}
                </Text>
              </View>
              <View style={{
                flex: 1,
                padding: 16,
                backgroundColor: colors.bg.card,
                borderRadius: Radii.lg,
              }}>
                <Text style={{ color: colors.text.tertiary, fontSize: 11, fontFamily: Typography.fontMedium, textTransform: "uppercase", letterSpacing: 0.05 }}>
                  Остаток
                </Text>
                <Text style={{
                  color: Number(product.available) > 0 ? colors.status.success : colors.status.danger,
                  fontSize: 20,
                  fontFamily: Typography.fontBold,
                  marginTop: 4,
                }}>
                  {product.available} {product.unit || "шт"}
                </Text>
              </View>
            </View>

            {/* Quantity selector */}
            <View style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 20,
              marginBottom: 20,
            }}>
              <TouchableOpacity
                onPress={() => setQty(Math.max(1, qty - 1))}
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 24,
                  backgroundColor: colors.bg.card,
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 1,
                  borderColor: colors.border.default,
                }}
              >
                <Feather name="minus" size={20} color={colors.text.primary} />
              </TouchableOpacity>
              <Text style={{
                color: colors.text.primary,
                fontSize: 28,
                fontFamily: Typography.fontBold,
                minWidth: 60,
                textAlign: "center",
              }}>
                {qty}
              </Text>
              <TouchableOpacity
                onPress={() => setQty(qty + 1)}
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 24,
                  backgroundColor: colors.brand.primary,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Feather name="plus" size={20} color="#fff" />
              </TouchableOpacity>
            </View>

            {/* Add to order button */}
            <TouchableOpacity
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                onAdd(qty);
                setQty(1);
              }}
              style={{
                backgroundColor: colors.brand.primary,
                paddingVertical: 16,
                borderRadius: Radii.lg,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                shadowColor: colors.brand.primary,
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.4,
                shadowRadius: 12,
              }}
            >
              <Feather name="shopping-cart" size={20} color="#fff" />
              <Text style={{
                color: "#fff",
                fontSize: 16,
                fontFamily: Typography.fontBold,
              }}>
                Добавить в заказ
              </Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Quick Order Sheet ────────────────────────────────────────────────────────
function QuickOrderSheet({ visible, shops, onClose, onSubmit, colors, _lang }: {
  visible: boolean;
  shops: Shop[];
  onClose: () => void;
  onSubmit: (shopId: number) => void;
  colors: ThemeColors;
  _lang: string;
}) {
  const [selectedShop, setSelectedShop] = useState<number | null>(null);

  const shopItems = useMemo(() => {
    let prevCity = "";
    let prevDistrict = "";
    /* eslint-disable react-hooks/immutability */
    return shops.map((shop) => {
      const city = shop.city ?? "";
      const district = shop.district ?? "";
      const showCityHeader = city !== "" && city !== prevCity;
      const showDistrictHeader = district !== "" && district !== prevDistrict;
      if (city) prevCity = city;
      if (district) prevDistrict = district;
      return { ...shop, showCityHeader, showDistrictHeader, city, district };
    });
    /* eslint-enable react-hooks/immutability */
  }, [shops]);

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)" }} onPress={onClose}>
        <Pressable style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          maxHeight: "60%",
          backgroundColor: colors.bg.secondary,
          borderTopLeftRadius: Radii.xl,
          borderTopRightRadius: Radii.xl,
          padding: 20,
        }} onPress={(e) => e.stopPropagation()}>
          <View style={{ alignItems: "center", paddingBottom: 12 }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border.strong }} />
          </View>

          <Text style={{
            color: colors.text.primary,
            fontSize: 18,
            fontFamily: Typography.fontBold,
            marginBottom: 16,
          }}>
            Выберите магазин
          </Text>

          <ScrollView style={{ maxHeight: 300 }}>
            {shopItems.map((shop) => {
                const { showCityHeader, showDistrictHeader, city, district } = shop;

                return (
                  <View key={shop.id}>
                    {showCityHeader && (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12, marginBottom: 6 }}>
                        <Feather name="map-pin" size={12} color={colors.brand.primary} />
                        <Text style={{ color: colors.brand.primary, fontSize: 12, fontFamily: Typography.fontBold, textTransform: "uppercase", letterSpacing: 0.05 }}>
                          {city}
                        </Text>
                        <View style={{ flex: 1, height: 1, backgroundColor: colors.border.default }} />
                      </View>
                    )}
                    {showDistrictHeader && !showCityHeader && (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8, marginBottom: 4 }}>
                        <Text style={{ color: colors.text.tertiary, fontSize: 11, fontFamily: Typography.fontSemiBold, marginLeft: 20 }}>
                          {district}
                        </Text>
                        <View style={{ flex: 1, height: 1, backgroundColor: colors.border.subtle }} />
                      </View>
                    )}
                    <TouchableOpacity
                      onPress={() => setSelectedShop(shop.id)}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        padding: 14,
                        backgroundColor: selectedShop === shop.id ? colors.brand.primaryDim : colors.bg.card,
                        borderRadius: Radii.lg,
                        marginBottom: 8,
                        borderWidth: 1,
                        borderColor: selectedShop === shop.id ? colors.brand.primary : colors.border.default,
                      }}
                    >
                      <View style={{
                        width: 36,
                        height: 36,
                        borderRadius: 18,
                        backgroundColor: selectedShop === shop.id ? colors.brand.primary : colors.bg.elevated,
                        alignItems: "center",
                        justifyContent: "center",
                        marginRight: 12,
                      }}>
                        <Feather name="shopping-bag" size={16} color={selectedShop === shop.id ? "#fff" : colors.text.tertiary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.text.primary, fontSize: 14, fontFamily: Typography.fontSemiBold }}>
                          {shop.name}
                        </Text>
                        {district && (
                          <Text style={{ color: colors.text.tertiary, fontSize: 11 }}>
                            {district}
                          </Text>
                        )}
                      </View>
                      {selectedShop === shop.id && (
                        <Feather name="check-circle" size={20} color={colors.brand.primary} />
                      )}
                    </TouchableOpacity>
                  </View>
                );
              })}
          </ScrollView>

          <TouchableOpacity
            onPress={() => selectedShop && onSubmit(selectedShop)}
            disabled={!selectedShop}
            style={{
              backgroundColor: selectedShop ? colors.brand.primary : colors.bg.elevated,
              paddingVertical: 14,
              borderRadius: Radii.lg,
              alignItems: "center",
              marginTop: 16,
              opacity: selectedShop ? 1 : 0.5,
            }}
          >
            <Text style={{
              color: selectedShop ? "#fff" : colors.text.tertiary,
              fontSize: 15,
              fontFamily: Typography.fontBold,
            }}>
              Создать заказ
            </Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Main Catalog Screen ──────────────────────────────────────────────────────
export default function CatalogScreen() {
  const colors = useThemeColors();
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

  // Fetch products
  const { data: products = [], isLoading } = useQuery({
    queryKey: ["products"],
    queryFn: getProducts,
  });

  // Fetch shops for order
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

  // Currency formatter
  const fmt = useCallback((v: number | string | null | undefined) => {
    const num = Number(v ?? 0);
    return num.toLocaleString("ru-RU", { style: "currency", currency: "UZS", maximumFractionDigits: 0 });
  }, []);

  // Fetch categories from server
  const { data: serverCategories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: getCategories,
  });

  // Generate dynamic categories from server + base categories
  const categories = useMemo(() => {
    const dynamicCats = (serverCategories ?? []).filter(Boolean).map((c: string) => ({
      key: c.toLowerCase(),
      label: c,
      uz: c,
      icon: "tag" as IconName,
    }));
    return [...BASE_CATEGORIES, ...dynamicCats];
  }, [serverCategories]);

  // Filter products
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, search, selectedCategory]);

  // Create order mutation
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

  // Handle add to order
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

  // Handle shop selection
  const handleShopSelect = (shopId: number) => {
    if (pendingProduct) {
      createOrderMutation.mutate({
        shopId,
        items: [{ productId: pendingProduct.id, quantity: pendingQty, unitPrice: Number(pendingProduct.unitPrice) }],
      });
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      {/* Header */}
      <View style={{
        paddingTop: Platform.OS === "ios" ? 60 : 40,
        paddingHorizontal: 16,
        paddingBottom: 16,
      }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <View>
            <Text style={{
              color: colors.text.primary,
              fontSize: 28,
              fontFamily: Typography.fontBold,
            }}>
              {t("Каталог", "Katalog")}
            </Text>
            <Text style={{ color: colors.text.tertiary, fontSize: 13, marginTop: 2 }}>
              {filteredProducts.length} {t("товаров", "mahsulot")}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => setViewMode(viewMode === "hero" ? "grid" : "hero")}
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: colors.bg.card,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: colors.border.default,
            }}
          >
            <Feather name={viewMode === "hero" ? "grid" : "maximize-2"} size={18} color={colors.text.primary} />
          </TouchableOpacity>
        </View>

        {/* Search */}
        <View style={{
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: colors.bg.card,
          borderRadius: Radii.lg,
          paddingHorizontal: 14,
          height: 48,
          borderWidth: 1,
          borderColor: colors.border.default,
        }}>
          <Feather name="search" size={18} color={colors.text.tertiary} />
          <TextInput
            style={{
              flex: 1,
              marginLeft: 10,
              color: colors.text.primary,
              fontSize: 15,
              fontFamily: Typography.fontMedium,
            }}
            placeholder={t("Поиск товаров…", "Mahsulot qidirish…")}
            placeholderTextColor={colors.text.muted}
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch("")}>
              <Feather name="x" size={18} color={colors.text.tertiary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Categories */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 8, marginBottom: 16 }}
      >
        {categories.map((cat) => (
          <TouchableOpacity
            key={cat.key}
            onPress={() => setSelectedCategory(cat.key)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              minWidth: 90,
              flexShrink: 0,
              paddingHorizontal: 16,
              paddingVertical: 8,
              borderRadius: Radii.full,
              backgroundColor: selectedCategory === cat.key ? colors.brand.primary : colors.bg.card,
              borderWidth: 1,
              borderColor: selectedCategory === cat.key ? colors.brand.primary : colors.border.default,
            }}
          >
            <Feather name={cat.icon} size={14} color={selectedCategory === cat.key ? "#fff" : colors.text.secondary} />
            <Text style={{
              color: selectedCategory === cat.key ? "#fff" : colors.text.secondary,
              fontSize: 13,
              fontFamily: Typography.fontSemiBold,
            }}>
              {t(cat.label, cat.uz)}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Products */}
      {isLoading ? (
        <View style={{ padding: 16 }}>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} height={280} style={{ borderRadius: Radii.xl, marginBottom: 16 }} />
          ))}
        </View>
      ) : viewMode === "hero" ? (
        <FlatList
          data={filteredProducts}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
          windowSize={11}
          maxToRenderPerBatch={8}
          removeClippedSubviews
          updateCellsBatchingPeriod={50}
          renderItem={({ item }) => (
            <HeroProductCard
              product={item}
              colors={colors}
              onPress={() => { setSelectedProduct(item); setShowDetail(true); }}
              onAdd={() => handleAddToOrder(item, 1)}
              _lang={lang}
              fmt={fmt}
            />
          )}
          ListEmptyComponent={
            <View style={{ alignItems: "center", paddingVertical: 60 }}>
              <Feather name="package" size={48} color={colors.text.muted} />
              <Text style={{ color: colors.text.tertiary, fontSize: 14, marginTop: 12 }}>
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
          columnWrapperStyle={{ gap: 12, paddingHorizontal: 16 }}
          contentContainerStyle={{ paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
          windowSize={11}
          maxToRenderPerBatch={10}
          removeClippedSubviews
          updateCellsBatchingPeriod={50}
          renderItem={({ item }) => (
            <CompactProductCard
              product={item}
              colors={colors}
              onPress={() => { setSelectedProduct(item); setShowDetail(true); }}
              onAdd={() => handleAddToOrder(item, 1)}
              _lang={lang}
              fmt={fmt}
            />
          )}
          ListEmptyComponent={
            <View style={{ alignItems: "center", paddingVertical: 60, flex: 1 }}>
              <Feather name="package" size={48} color={colors.text.muted} />
              <Text style={{ color: colors.text.tertiary, fontSize: 14, marginTop: 12 }}>
                {t("Товары не найдены", "Mahsulotlar topilmadi")}
              </Text>
            </View>
          }
        />
      )}

      {/* Product Detail Modal */}
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
        colors={colors}
        _lang={lang}
        fmt={fmt}
      />

      {/* Quick Order Sheet */}
      <QuickOrderSheet
        visible={showOrderSheet}
        shops={shops}
        onClose={() => { setShowOrderSheet(false); setPendingProduct(null); }}
        onSubmit={handleShopSelect}
        colors={colors}
        _lang={lang}
      />
    </View>
  );
}
