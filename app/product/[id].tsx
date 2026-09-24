// Warehouse Pro — карточка товара: как карточка магазина, только про товар
/*
  Раньше товар открывался нижним листом поверх каталога: снимок на треть
  экрана, две плитки и кнопка. Владелец попросил сделать «как магазины» —
  отдельный экран с большой фотографией и всеми сведениями. Сервер их давно
  отдаёт (product.listAll: штрих-код, упаковка, вес, описание), на телефоне
  они просто не показывались.

  Данные берутся из того же запроса каталога, что и в новом заказе
  (ключ ["products"]): второго похода в сеть нет, а без связи подхватывается
  копия с диска — та же, что держит каталог.
*/
import { useMemo, useState } from "react";
import { View, Text, ScrollView, RefreshControl, useWindowDimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useThemeColors, useThemeStore } from "../../src/store/theme";
import { Typography, Spacing, Radii, soft, safeBottomPadding } from "../../src/theme";
import { getProducts, Product } from "../../src/api";
import { Card, InfoRow } from "../../src/components/ui";
import { SecureImage } from "../../src/components/SecureImage";
import { PressableScale, FadeInItem, ShimmerSkeleton } from "../../src/components/Animated";
import { formatMoney } from "../../src/store/branding";
import { readableInk } from "../../src/lib/contrast";
import { unitShort, formatQty } from "../../src/lib/units";
import { useT, useLang } from "../../src/i18n";

const num = (v: number | string | null | undefined) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

export default function ProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const { isDark } = useThemeStore();
  const t = useT();
  const lang = useLang();
  const { width: SCREEN_W } = useWindowDimensions();
  const [qty, setQty] = useState(1);

  const { data: catalog, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["products"],
    queryFn: () => getProducts(),
  });
  // Без связи — копия каталога с диска; её пишет вкладка каталога.
  const { data: cached } = useQuery({
    queryKey: ["products", "disk"],
    queryFn: async () => JSON.parse((await AsyncStorage.getItem("cached_products")) ?? "[]") as Product[],
    enabled: isError,
  });

  const product = useMemo(() => {
    const pid = Number(id);
    return (catalog ?? cached ?? []).find(p => p.id === pid) ?? null;
  }, [catalog, cached, id]);

  if (isLoading || (isError && cached === undefined)) return (
    <View style={{ flex: 1, backgroundColor: colors.bg.primary, padding: Spacing.base, paddingTop: insets.top + Spacing.lg, gap: Spacing.md }}>
      <ShimmerSkeleton height={300} radius={Radii.xl} />
      <ShimmerSkeleton height={72} radius={Radii.xl} />
      <ShimmerSkeleton height={220} radius={Radii.xl} />
    </View>
  );

  if (!product) return (
    <View style={{ flex: 1, backgroundColor: colors.bg.primary, alignItems: "center", justifyContent: "center", gap: Spacing.lg, paddingHorizontal: 32 }}>
      <Feather name={isError ? "wifi-off" : "search"} size={32} color={colors.text.muted} />
      <Text style={{ color: colors.text.secondary, fontFamily: Typography.fontMedium, textAlign: "center" }}>
        {isError ? t("Ошибка загрузки", "Yuklashda xato") : t("Товар не найден", "Mahsulot topilmadi")}
      </Text>
      <PressableScale onPress={() => refetch()} haptic="light">
        <View style={{ backgroundColor: colors.accent.primary, borderRadius: Radii.md, paddingVertical: 10, paddingHorizontal: 20 }}>
          <Text style={{ fontFamily: Typography.fontSemibold, fontSize: Typography.size.sm, color: readableInk(colors.accent.primary) }}>{t("Повторить", "Qayta urinish")}</Text>
        </View>
      </PressableScale>
    </View>
  );

  const unit = unitShort(product.unit, lang);
  const available = num(product.available);
  const outOfStock = !(available > 0);
  const price = num(product.unitPrice);
  const ink = readableInk(colors.accent.primary);
  const heroH = Math.min(Math.round(SCREEN_W * 0.9), 420);
  const packSize = num(product.packSize);
  const weight = num(product.unitWeight);
  const sub = [product.category, product.code ? t(`арт. ${product.code}`, `art. ${product.code}`) : null].filter(Boolean).join(" · ");
  const canAdd = !outOfStock && qty <= available;

  const goOrder = () => {
    if (!canAdd) return;
    router.push({ pathname: "/order/new", params: { productId: String(product.id), productName: product.name, productPrice: String(price), productQty: String(qty) } });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: Spacing.xl }} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={colors.accent.primary} />}>
        {/* Фотография — во всю ширину, почти квадрат: это то, ради чего экран */}
        <View style={{ height: heroH, backgroundColor: colors.bg.elevated }}>
          {product.photoUrl ? (
            <SecureImage uri={product.photoUrl} style={{ width: "100%", height: "100%", position: "absolute" }} resizeMode="cover" />
          ) : (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.brand.primary }}>
              <Feather name="package" size={72} color="rgba(255,255,255,0.7)" />
            </View>
          )}
          {/* Затемнение только у нижнего края — под подпись; сама фотография остаётся светлой */}
          <LinearGradient colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.62)"]} style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: heroH * 0.45 }} />
          <PressableScale onPress={() => router.back()} haptic="light" accessibilityLabel={t("Назад", "Orqaga")}
            style={{ position: "absolute", top: insets.top + 8, left: 16, width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center" }}>
            <Feather name="arrow-left" size={20} color="#fff" />
          </PressableScale>
          <View style={{ position: "absolute", top: insets.top + 8, right: 16, backgroundColor: outOfStock ? colors.status.danger : colors.status.success, borderRadius: Radii.full, paddingHorizontal: 12, paddingVertical: 6 }}>
            <Text style={{ color: "#fff", fontSize: 12, fontFamily: Typography.fontSemibold }}>
              {outOfStock ? t("Нет в наличии", "Omborda yo'q") : t(`В наличии · ${formatQty(available)} ${unit}`, `Bor · ${formatQty(available)} ${unit}`)}
            </Text>
          </View>
          <View style={{ position: "absolute", bottom: 16, left: 16, right: 16 }}>
            <Text style={{ fontFamily: Typography.fontExtraBold, fontSize: Typography.size.xxl, color: "#fff" }}>{product.name}</Text>
            {!!sub && <Text style={{ fontFamily: Typography.fontRegular, fontSize: 13, color: "rgba(255,255,255,0.8)", marginTop: 2 }}>{sub}</Text>}
          </View>
        </View>

        <View style={{ padding: Spacing.base }}>
          {/* Цена и остаток — как плашка долга у магазина: то, что спрашивают первым */}
          <View style={{ flexDirection: "row", gap: Spacing.md, marginBottom: 16 }}>
            <View style={{ flex: 1.2, backgroundColor: colors.accent.primary + "18", borderRadius: Radii.xl, padding: 16, ...soft(isDark).raisedSm }}>
              <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.sm, color: colors.accent.primary, marginBottom: 4 }}>{t(`ЦЕНА ЗА ${unit.toUpperCase()}`, `${unit.toUpperCase()} NARXI`)}</Text>
              <Text style={{ fontFamily: Typography.fontExtraBold, fontSize: Typography.size["2xl"], color: colors.accent.primary }}>{formatMoney(price)}</Text>
            </View>
            <View style={{ flex: 1, backgroundColor: outOfStock ? colors.status.dangerDim : colors.status.successDim, borderRadius: Radii.xl, padding: 16, ...soft(isDark).inset }}>
              <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.sm, color: outOfStock ? colors.status.danger : colors.status.success, marginBottom: 4 }}>{t("ОСТАТОК", "QOLDIQ")}</Text>
              <Text style={{ fontFamily: Typography.fontExtraBold, fontSize: Typography.size["2xl"], color: outOfStock ? colors.status.danger : colors.status.success }}>
                {formatQty(available)} <Text style={{ fontSize: Typography.size.sm, fontFamily: Typography.fontMedium }}>{unit}</Text>
              </Text>
            </View>
          </View>

          <FadeInItem delay={0}>
            <Card style={{ marginBottom: 16, padding: 0, overflow: "hidden" }}>
              {!!product.code && <InfoRow icon="hash" label={t("Артикул", "Artikul")} value={product.code} mono />}
              {!!product.barcode && <InfoRow icon="maximize" label={t("Штрих-код", "Shtrix-kod")} value={product.barcode} mono />}
              {!!product.category && <InfoRow icon="tag" label={t("Категория", "Kategoriya")} value={product.category} />}
              {packSize > 0 && <InfoRow icon="box" label={t("Упаковка", "Qadoq")} value={[`${formatQty(packSize)} ${unit}`, product.packLabel].filter(Boolean).join(" · ")} />}
              {weight > 0 && <InfoRow icon="anchor" label={t("Вес единицы", "Birlik og'irligi")} value={t(`${formatQty(weight)} кг`, `${formatQty(weight)} kg`)} />}
              {!product.code && !product.barcode && !product.category && !(packSize > 0) && !(weight > 0) && (
                <Text style={{ padding: 16, color: colors.text.muted, fontFamily: Typography.fontRegular, fontSize: Typography.size.sm }}>{t("Сведения о товаре не заполнены", "Mahsulot ma'lumotlari to'ldirilmagan")}</Text>
              )}
            </Card>
          </FadeInItem>

          {!!product.description && (
            <FadeInItem delay={40}>
              <Card style={{ marginBottom: 16 }}>
                <Text style={{ fontFamily: Typography.fontSemibold, fontSize: Typography.size.sm, color: colors.accent.primary, letterSpacing: 0.5, marginBottom: 8 }}>{t("ОПИСАНИЕ", "TAVSIF")}</Text>
                <Text style={{ fontFamily: Typography.fontRegular, fontSize: Typography.size.base, lineHeight: 22, color: colors.text.primary }}>{product.description}</Text>
              </Card>
            </FadeInItem>
          )}
        </View>
      </ScrollView>

      {/* Количество и кнопка — вне прокрутки: они обязаны быть видны всегда. */}
      <View style={{ paddingHorizontal: Spacing.base, paddingTop: Spacing.md, paddingBottom: safeBottomPadding(insets.bottom), backgroundColor: colors.bg.primary, borderTopWidth: 1, borderTopColor: colors.border.subtle, flexDirection: "row", alignItems: "center", gap: Spacing.md }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.bg.elevated, borderRadius: Radii.full, padding: 4, ...soft(isDark).inset }}>
          <PressableScale onPress={() => setQty(q => Math.max(1, q - 1))} disabled={qty <= 1} haptic="light" accessibilityLabel={t("Меньше", "Kamroq")}
            hitSlop={undefined} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.bg.card, alignItems: "center", justifyContent: "center" }}>
            <Feather name="minus" size={18} color={colors.text.primary} />
          </PressableScale>
          <Text testID="qty" style={{ minWidth: 44, textAlign: "center", fontSize: Typography.size.xl, fontFamily: Typography.fontBold, color: colors.text.primary }}>{qty}</Text>
          <PressableScale onPress={() => setQty(q => Math.min(available, q + 1))} disabled={outOfStock || qty >= available} haptic="light" accessibilityLabel={t("Больше", "Ko'proq")}
            hitSlop={undefined} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.accent.primary, alignItems: "center", justifyContent: "center" }}>
            <Feather name="plus" size={18} color={ink} />
          </PressableScale>
        </View>
        <PressableScale onPress={goOrder} disabled={!canAdd} haptic="medium" style={{ flex: 1, borderRadius: Radii.xl, overflow: "hidden" }}>
          <View style={{ backgroundColor: colors.brand.primary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 15, paddingHorizontal: 14, borderRadius: Radii.xl }}>
            <Feather name={outOfStock ? "slash" : "shopping-cart"} size={18} color={colors.brand.ink} />
            <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.base, color: colors.brand.ink }} numberOfLines={1}>
              {outOfStock ? t("Нет в наличии", "Omborda yo'q") : t(`В заказ · ${formatMoney(price * qty)}`, `Buyurtmaga · ${formatMoney(price * qty)}`)}
            </Text>
          </View>
        </PressableScale>
      </View>
    </View>
  );
}
