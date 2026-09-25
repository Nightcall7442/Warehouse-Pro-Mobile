// Warehouse Pro — Catalog v2 (cold palette, Card from ui.tsx)
// Касание карточки открывает экран товара (app/product/[id]); корзинка на
// карточке — быстрый заказ одной позиции, как и раньше.
import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useRefreshOnFocus } from "../../src/hooks/useRefreshOnFocus";
import { useScrollTopOnFocus } from "../../src/hooks/useScrollTopOnFocus";
import { useScrollTopOnChange } from "../../src/hooks/useScrollTopOnChange";
import {
  View, Text, FlatList, TouchableOpacity,
  ScrollView, useWindowDimensions, RefreshControl,
} from "react-native";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";
import { getProducts, getCategories, Product } from "../../src/api";
import { useThemeColors, useThemeStore } from "../../src/store/theme";
import { useAuthStore } from "../../src/store/auth";
import { Typography, Spacing, Radii, ThemeColors, soft, BOTTOM_TAB_HEIGHT } from "../../src/theme";
import { useCartStore, useCartSummary } from "../../src/store/cart";
import { plural } from "../../src/lib/plural";
import { SearchInput, Card, Button } from "../../src/components/ui";
import { SecureImage } from "../../src/components/SecureImage";
import { useDebounce } from "../../src/hooks/useDebounce";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { formatMoney } from "../../src/store/branding";
import { useT, useLang } from "../../src/i18n";
/*
  Своей таблицы единиц у каталога больше нет — она была третьей в приложении и
  расходилась с остальными: box здесь звался «ящ», а строки block не было
  вовсе, и товар в блоках подписывался кодом из базы. Помощник количества тоже
  жил здесь один, а корзина нового заказа печатала тот же остаток как есть.
*/
import { unitShort, formatQty } from "../../src/lib/units";

// ── Hero Product Card ────────────────────────────────────────────────────────
function ProductCard({
  product, colors, isDark, onPress, onAdd, onRemove, inCart, fmt, cardWidth }: {
  product: Product; colors: ThemeColors; isDark: boolean; onPress: () => void; onAdd: () => void; onRemove: () => void;
  /** Сколько уже в корзине — 0, если нет. */
  inCart: number;
  fmt: (v: number | string | null | undefined) => string; cardWidth: number;
}) {
  const t = useT();
  const lang = useLang();
  const hasPhoto = !!product.photoUrl;
  const inStock = Number(product.available) > 0;
  const imgHeight = cardWidth * 0.7;

  return (
    <TouchableOpacity activeOpacity={0.9} onPress={onPress} style={{ width: cardWidth, marginBottom: Spacing.base }}>
      <Card style={{ padding: 0, overflow: "hidden" }}>
        {/* Big photo */}
        <View style={{ width: "100%", height: imgHeight, backgroundColor: colors.bg.elevated }}>
          {hasPhoto ? (
            <SecureImage uri={product.photoUrl} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
          ) : (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              <Feather name="package" size={40} color={colors.text.muted} />
            </View>
          )}
          {/* Stock badge. Непрозрачная плашка карточки, а не successDim:
              тот прозрачен на 87 %, и зелёные буквы на фото арбуза или мяса
              не читались. Цвет состояния несёт точка (status.* — заливки, не
              чернила, см. theme.ts), надпись — основными чернилами. */}
          <View style={{ position: "absolute", top: Spacing.sm, left: Spacing.sm, flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: colors.bg.card, borderRadius: Radii.full, paddingHorizontal: 8, paddingVertical: 4, ...soft(isDark).raisedSm }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: inStock ? colors.status.success : colors.status.danger }} />
            <Text style={{ color: colors.text.primary, fontSize: 11, fontFamily: Typography.fontSemibold }}>{inStock ? t("В наличии", "Bor") : t("Нет", "Yo'q")}</Text>
          </View>
          {/* В корзину: одно нажатие — одна единица; в корзине — степпер. */}
          {inStock && (inCart > 0 ? (
            <View style={{ position: "absolute", bottom: Spacing.sm, right: Spacing.sm, flexDirection: "row", alignItems: "center", backgroundColor: colors.accent.primary, borderRadius: 20, height: 36 }}>
              <TouchableOpacity accessibilityLabel={t("Меньше", "Kamroq")} onPress={(e) => { e.stopPropagation(); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onRemove(); }} style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center" }}>
                <Feather name="minus" size={16} color={colors.brand.ink} />
              </TouchableOpacity>
              <Text style={{ minWidth: 18, textAlign: "center", color: colors.brand.ink, fontFamily: Typography.fontBold, fontSize: Typography.size.sm }}>{inCart}</Text>
              <TouchableOpacity accessibilityLabel={t("Больше", "Ko'proq")} onPress={(e) => { e.stopPropagation(); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onAdd(); }} style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center" }}>
                <Feather name="plus" size={16} color={colors.brand.ink} />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity accessibilityLabel={t("В корзину", "Savatga")} onPress={(e) => { e.stopPropagation(); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onAdd(); }}
              style={{ position: "absolute", bottom: Spacing.sm, right: Spacing.sm, width: 36, height: 36, borderRadius: 18, backgroundColor: colors.accent.primary, alignItems: "center", justifyContent: "center" }}>
              <Feather name="shopping-cart" size={16} color={colors.brand.ink} />
            </TouchableOpacity>
          ))}
        </View>
        {/* Info */}
        <View style={{ padding: Spacing.md }}>
          <Text style={{ fontSize: Typography.size.base, fontFamily: Typography.fontSemibold, color: colors.text.primary, marginBottom: 4 }} numberOfLines={2}>{product.name}</Text>
          {product.code && <Text style={{ fontSize: 11, color: colors.text.muted, fontFamily: Typography.fontMono, marginBottom: 6 }}>{t("Артикул", "Artikul")}: {product.code}</Text>}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ fontSize: Typography.size.lg, fontFamily: Typography.fontBold, color: colors.accent.primary }}>{fmt(product.unitPrice)}<Text style={{ fontSize: Typography.size.xs, color: colors.text.muted }}>/{unitShort(product.unit, lang)}</Text></Text>
            {inStock && <Text style={{ fontSize: Typography.size.xs, color: colors.status.success, fontFamily: Typography.fontMedium }}>{formatQty(product.available)} {unitShort(product.unit, lang)}</Text>}
          </View>
        </View>
      </Card>
    </TouchableOpacity>
  );
}

export default function CatalogScreen() {
  const { isDark } = useThemeStore();
  // Вкладку не размонтируют при переключении, поэтому запрос уходит один раз
  // за запуск. Здесь данные этого экрана помечаются устаревшими при возврате
  // на него — подробности в самом хуке.
  useRefreshOnFocus([["products"], ["availableShops"], ["categories"]]);
  const { width: SCREEN_W } = useWindowDimensions();
  const CARD_W = useMemo(() => (SCREEN_W - Spacing.base * 2 - Spacing.md) / 2, [SCREEN_W]);
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const t = useT();
  const { user } = useAuthStore();

  const [search, setSearch] = useState("");
  const [selectedCat, setSelectedCat] = useState("all");
  const listRef = useRef<FlatList>(null);
  useScrollTopOnFocus(listRef);
  useScrollTopOnChange(listRef, [search, selectedCat]);
  const [cachedProducts, setCachedProducts] = useState<Product[]>([]);
  // Корзина: строки копятся здесь, заказ оформляется один раз на экране заказа.
  const cartAdd = useCartStore(s => s.add);
  const cartClear = useCartStore(s => s.clear);
  const cartLines = useCartStore(s => s.lines);
  const cart = useCartSummary();
  const inCart = useMemo(() => new Map(cartLines.map(l => [l.productId, Number(l.quantity || 0)])), [cartLines]);

  const canAccessAgent = user?.role === "agent" || user?.role === "supervisor" || user?.role === "ceo" || user?.role === "operator";
  /*
    Строка поиска в поле остаётся мгновенной, а на сервер уходит задержанная.
    Раньше в ключе запроса стояла сама строка: каждая новая буква — новый ключ,
    для которого в кэше пусто, значит isLoading и подмена сетки серыми
    плитками. «Молоко» — это шесть запросов подряд и шесть раз исчезнувший
    список; на EDGE у магазина экран почти всё время был серым.
  */
  const debouncedSearch = useDebounce(search, 300);
  const { data: products = [], isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["products", debouncedSearch],
    queryFn: () => getProducts(debouncedSearch),
    enabled: canAccessAgent,
    // Пока едет ответ на новый запрос, на экране остаются прежние карточки —
    // вместо заглушек. Человеку видно, что список сужается, а не пропадает.
    placeholderData: keepPreviousData,
  });
  const { data: serverCategories = [] } = useQuery({ queryKey: ["categories"], queryFn: getCategories, enabled: canAccessAgent });

  // Складываем свежий список в кэш — это запись на диск, ей эффект нужен.
  //
  // Отсюда убран setIsFromCache(false). Признак «показываем кэш» — не состояние,
  // а следствие двух уже известных величин: запрос упал и кэш непустой. Пока он
  // лежал в состоянии, его выставляли из двух эффектов, и порядок их срабатывания
  // решал, что увидит экран.
  useEffect(() => {
    // Только полный список: выдача поиска затирала кэш, и агент без связи
    // видел в каталоге одну позицию — ту, что искал последней.
    if (products.length > 0 && !debouncedSearch) {
      AsyncStorage.setItem("cached_products", JSON.stringify(products)).catch(() => {});
    }
  }, [products, debouncedSearch]);

  // Load cached products on error (offline)
  useEffect(() => {
    if (isError && !isLoading) {
      AsyncStorage.getItem("cached_products").then(raw => {
        if (raw) setCachedProducts(JSON.parse(raw));
      }).catch(() => {});
    }
  }, [isError, isLoading]);

  const categories = useMemo(() => {
    const dynamic = (serverCategories ?? []).filter(Boolean).map((c: string) => ({ key: c.toLowerCase(), label: c }));
    return [{ key: "all", label: t("Все", "Hammasi") }, ...dynamic];
  }, [serverCategories, t]);

  // Кэш показываем ровно тогда, когда сеть не ответила, а сохранённый список есть.
  const isFromCache = isError && cachedProducts.length > 0;
  const effectiveProducts = isFromCache ? cachedProducts : products;

  // Отбор по НЕзадержанной строке: пока едет ответ сервера, набранная буква
  // сужает уже показанный список сразу, а не через 300 мс.
  const filtered = useMemo(() => {
    let result = effectiveProducts;
    if (search) { const q = search.toLowerCase(); result = result.filter(p => p.name.toLowerCase().includes(q) || p.code?.toLowerCase().includes(q) || p.category?.toLowerCase().includes(q)); }
    if (selectedCat !== "all") result = result.filter(p => p.category?.toLowerCase() === selectedCat);
    return result;
  }, [effectiveProducts, search, selectedCat]);

  const fmt = useCallback((v: number | string | null | undefined) => {
    return formatMoney(v);
  }, []);

  const handleAdd = useCallback((product: Product, delta: number) => {
    cartAdd(product, delta);
  }, [cartAdd]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      {/* Header */}
      <View style={{ paddingTop: insets.top + Spacing.sm, paddingHorizontal: Spacing.base, paddingBottom: Spacing.md }}>
        <Text style={{ color: colors.text.primary, fontSize: Typography.size.xxl, fontFamily: Typography.fontExtraBold, marginBottom: Spacing.md }}>{t("Каталог", "Katalog")}</Text>
        <SearchInput value={search} onChangeText={setSearch} placeholder={t("Поиск товаров…", "Mahsulot qidirish…")} />
      </View>

      {/* Category chips.
          flexGrow/flexShrink: 0 обязательны: у ScrollView по умолчанию
          flex-сжатие, и в колонке рядом с сеткой flex: 1 лента сжималась в
          полоску — чипы уходили под фото (кадр лендинга 25.09.2026). */}
      {categories.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0, flexShrink: 0, marginBottom: Spacing.base }}
          contentContainerStyle={{ paddingHorizontal: Spacing.base, gap: Spacing.sm }}>
          {categories.map(cat => {
            const active = selectedCat === cat.key;
            return (
              <TouchableOpacity key={cat.key} onPress={() => setSelectedCat(cat.key)}
                style={{ backgroundColor: active ? colors.accent.primary : colors.bg.elevated, borderRadius: Radii.full, ...(active ? soft(isDark).raisedSm : soft(isDark).inset), paddingHorizontal: 16, paddingVertical: 8, minHeight: 36, justifyContent: "center" }}>
                <Text style={{ color: active ? colors.brand.ink : colors.text.secondary, fontSize: Typography.size.sm, fontFamily: Typography.fontSemibold, textAlign: "center" }}>{cat.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* Products — 2-column grid with big images */}
      {isError && !isFromCache ? (
        <View style={{ alignItems: "center", paddingVertical: 80, paddingHorizontal: Spacing.xl }}>
          <View style={{ width: 72, height: 72, borderRadius: Radii.xl, backgroundColor: colors.status.dangerDim, alignItems: "center", justifyContent: "center", marginBottom: Spacing.md }}>
            <Feather name="wifi-off" size={32} color={colors.status.danger} />
          </View>
          <Text style={{ color: colors.text.secondary, fontSize: Typography.size.lg, fontFamily: Typography.fontSemibold }}>{t("Ошибка загрузки", "Yuklashda xatolik")}</Text>
          <Text style={{ color: colors.text.muted, fontSize: Typography.size.sm, marginTop: 4, textAlign: "center" }}>{error?.message ?? t("Проверьте подключение", "Ulanishni tekshiring")}</Text>
          {/*
            Повторить было нечем. Сетка с потягиванием вниз в этой ветке не
            рисуется вовсе, а другого способа перезапустить запрос нет: агент в
            первый день на телефоне, без сохранённого кэша, упирался в эту
            надпись и перезапускал приложение.
          */}
          <Button onPress={() => { void refetch(); }} loading={isFetching} style={{ marginTop: Spacing.lg }}>
            {t("Повторить", "Qayta urinish")}
          </Button>
        </View>
      ) : isLoading && !isFromCache ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: Spacing.md, paddingHorizontal: Spacing.base }}>
          {[1, 2, 3, 4].map(i => (
            <View key={i} style={{ width: CARD_W, height: 220, borderRadius: Radii.xl, backgroundColor: colors.bg.elevated, opacity: 0.5 }} />
          ))}
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={filtered}
          keyExtractor={item => String(item.id)}
          numColumns={2}
          columnWrapperStyle={{ gap: Spacing.md, paddingHorizontal: Spacing.base }}
          contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
          showsVerticalScrollIndicator={false}
          // Потягивание вниз не работало на этом экране никогда — ни при
          // ошибке, ни на успешно загруженном каталоге.
          refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={colors.accent.primary} />}
          ListHeaderComponent={isFromCache ? (
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 10, paddingHorizontal: Spacing.base, marginBottom: Spacing.sm, backgroundColor: colors.status.warningDim, borderRadius: Radii.md, marginHorizontal: Spacing.base }}>
              <Feather name="wifi-off" size={14} color={colors.status.warning} />
              <Text style={{ color: colors.status.warning, fontSize: Typography.size.sm, fontFamily: Typography.fontMedium }}>{t("Офлайн данные", "Oflayn ma'lumotlar")}</Text>
            </View>
          ) : null}
          renderItem={({ item }) => (
            <ProductCard
              product={item} colors={colors} isDark={isDark}
              onPress={() => router.push(`/product/${item.id}`)}
              onAdd={() => handleAdd(item, 1)} onRemove={() => handleAdd(item, -1)}
              inCart={inCart.get(item.id) ?? 0} fmt={fmt} cardWidth={CARD_W} />
          )}
          ListEmptyComponent={
            <View style={{ alignItems: "center", paddingVertical: 80, paddingHorizontal: Spacing.xl }}>
              <View style={{ width: 72, height: 72, borderRadius: Radii.xl, backgroundColor: colors.bg.elevated, alignItems: "center", justifyContent: "center", marginBottom: Spacing.md }}>
                <Feather name="search" size={32} color={colors.text.muted} />
              </View>
              {/* Пустой каталог — это пустой каталог, а не «введите запрос»:
                  список товаров приходит и без поиска. */}
              <Text style={{ color: colors.text.secondary, fontSize: Typography.size.lg, fontFamily: Typography.fontSemibold }}>
                {search ? t("Товары не найдены", "Mahsulot topilmadi") : t("Каталог пуст", "Katalog bo'sh")}
              </Text>
              <Text style={{ color: colors.text.muted, fontSize: Typography.size.sm, marginTop: 4, textAlign: "center" }}>
                {search ? t("Попробуйте изменить запрос", "So'rovni o'zgartirib ko'ring") : t("Товары появятся, когда их заведут на складе", "Mahsulotlar omborga kiritilgach paydo bo'ladi")}
              </Text>
            </View>
          }
        />
      )}

      {/* Плашка корзины: что набрано и одна дорога — оформить. */}
      {cart.count > 0 && (
        <View style={{ position: "absolute", left: Spacing.base, right: Spacing.base, bottom: insets.bottom + BOTTOM_TAB_HEIGHT, flexDirection: "row", alignItems: "center", gap: Spacing.sm, backgroundColor: colors.bg.card, borderRadius: Radii.xl, padding: Spacing.sm, paddingLeft: Spacing.base, ...soft(isDark).raisedSm }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontFamily: Typography.fontSemibold, fontSize: Typography.size.sm, color: colors.text.secondary }} numberOfLines={1}>
              {t(`В заказе: ${cart.count} ${plural(cart.count, "товар", "товара", "товаров")}`, `Buyurtmada: ${cart.count} ta tovar`)}
            </Text>
            <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.lg, color: colors.text.primary, fontVariant: ["tabular-nums"] }} numberOfLines={1}>{fmt(cart.total)}</Text>
          </View>
          <TouchableOpacity accessibilityLabel={t("Очистить корзину", "Savatni tozalash")} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); cartClear(); }} style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}>
            <Feather name="x" size={18} color={colors.text.secondary} />
          </TouchableOpacity>
          <Button variant="primary" size="md" icon="arrow-right" onPress={() => router.push({ pathname: "/order/new", params: { fromCart: "1" } })}>
            {t("Оформить", "Rasmiylashtirish")}
          </Button>
        </View>
      )}
    </View>
  );
}
