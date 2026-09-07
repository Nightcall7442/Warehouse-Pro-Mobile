// Warehouse Pro — Catalog v2 (cold palette, Card from ui.tsx)
import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useRefreshOnFocus } from "../../src/hooks/useRefreshOnFocus";
import {
  View, Text, FlatList, TouchableOpacity, Modal, Pressable,
  ScrollView, useWindowDimensions, RefreshControl, ActivityIndicator,
} from "react-native";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";
import { getProducts, getCategories, createOrder, getAvailableShops, getAllShopsForSupervisor, Product, Shop } from "../../src/api";
import { uuidv4 } from "../../src/store/offline";
import { useThemeColors, useThemeStore } from "../../src/store/theme";
import { useAuthStore } from "../../src/store/auth";
import { notify } from "../../src/store/toast";
import { Typography, Spacing, Radii, ThemeColors, modalBottomPadding } from "../../src/theme";
import { SearchInput, Card, Button } from "../../src/components/ui";
import { SecureImage } from "../../src/components/SecureImage";
import { useDebounce } from "../../src/hooks/useDebounce";
import { useOfflineStore, isRetryableError } from "../../src/store/offline";
import { reportNotQueued } from "../../src/lib/offline-guard";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { formatMoney } from "../../src/store/branding";
import { readableInk } from "../../src/lib/contrast";
/*
  Своей таблицы единиц у каталога больше нет — она была третьей в приложении и
  расходилась с остальными: box здесь звался «ящ», а строки block не было
  вовсе, и товар в блоках подписывался кодом из базы. Помощник количества тоже
  жил здесь один, а корзина нового заказа печатала тот же остаток как есть.
*/
import { unitShort, formatQty } from "../../src/lib/units";
import { PAYMENT_METHODS } from "../../src/lib/order-status";

// ── Hero Product Card ────────────────────────────────────────────────────────
function ProductCard({ product, colors, isDark: _isDark, onPress, onAdd, fmt, cardWidth }: {
  product: Product; colors: ThemeColors; isDark: boolean; onPress: () => void; onAdd: () => void;
  fmt: (v: number | string | null | undefined) => string; cardWidth: number;
}) {
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
            <Text style={{ fontSize: Typography.size.lg, fontFamily: Typography.fontBold, color: colors.accent.primary }}>{fmt(product.unitPrice)}<Text style={{ fontSize: Typography.size.xs, color: colors.text.muted }}>/{unitShort(product.unit)}</Text></Text>
            {inStock && <Text style={{ fontSize: Typography.size.xs, color: colors.status.success, fontFamily: Typography.fontMedium }}>{formatQty(product.available)} {unitShort(product.unit)}</Text>}
          </View>
        </View>
      </Card>
    </TouchableOpacity>
  );
}

// ── Product Detail Modal ─────────────────────────────────────────────────────
/* Экспортируется ради проверки: кнопку «Добавить в заказ» уже один раз
   обрезало нижним краем, и поймать это можно только отрисовкой. */
export function ProductDetail({ product, visible, onClose, onAdd, colors, isDark: _isDark, fmt }: {
  product: Product | null; visible: boolean; onClose: () => void; onAdd: (qty: number) => void;
  colors: ThemeColors; isDark: boolean; fmt: (v: number | string | null | undefined) => string;
}) {
  /*
    Лист приклеен к нижнему краю окна, а окно на Android заходит ПОД системную
    панель. Без этого отступа нижние 20–30 точек главной кнопки листа лежали в
    полосе жестов или под тремя кнопками: агент жал «Добавить в заказ», а
    срабатывало системное «Назад». Помощник safeBottomPadding уже написан для
    этого — src/theme.ts.
  */
  const insets = useSafeAreaInsets();
  const [qty, setQty] = useState(1);
  const { height: SCREEN_H } = useWindowDimensions();
  if (!product) return null;

  /*
    Товара нет — и кнопка это говорит, а не отправляет заказ в отказ.
    Раньше при остатке 0 «плюс» продолжал считать, а «Добавить в заказ»
    работала: агент узнавал о нехватке уже от сервера, посреди разговора
    с хозяином магазина.
  */
  const available = Number(product.available ?? 0);
  const outOfStock = !(available > 0);
  // Надпись на заливке — по её яркости: фирменный цвет арендатора бывает светлым.
  const ink = readableInk(colors.accent.primary);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)" }} onPress={onClose}>
        <Pressable style={{
          position: "absolute", bottom: 0, left: 0, right: 0, maxHeight: "92%",
          paddingBottom: modalBottomPadding(insets.bottom),
          backgroundColor: colors.bg.secondary, borderTopLeftRadius: Radii.xxl, borderTopRightRadius: Radii.xxl, overflow: "hidden",
        }} onPress={e => e.stopPropagation()}>
          {/* Handle */}
          <View style={{ alignItems: "center", paddingVertical: 10 }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border.default }} />
          </View>
          <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
          {/* Снимок — доля ОСТАВШЕГОСЯ места, а не всего экрана: лист и так
              не выше 92%, а сверху ещё полоска-ручка. */}
          <View style={{ width: "100%", height: SCREEN_H * 0.36, backgroundColor: colors.bg.elevated }}>
            {product.photoUrl ? (
              <SecureImage uri={product.photoUrl} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
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
                <Text style={{ fontSize: 10, color: colors.text.muted, textTransform: "uppercase", letterSpacing: 0.5, fontFamily: Typography.fontMedium }}>Цена за {unitShort(product.unit)}</Text>
                <Text style={{ fontSize: 20, fontFamily: Typography.fontBold, color: colors.accent.primary, marginTop: 4 }}>{fmt(product.unitPrice)}</Text>
              </View>
              <View style={{ flex: 1, backgroundColor: colors.bg.card, borderRadius: Radii.lg, borderWidth: 1, borderColor: colors.border.default, padding: Spacing.lg }}>
                <Text style={{ fontSize: 10, color: colors.text.muted, textTransform: "uppercase", letterSpacing: 0.5, fontFamily: Typography.fontMedium }}>Остаток</Text>
                <Text style={{ fontSize: 20, fontFamily: Typography.fontBold, color: Number(product.available) > 0 ? colors.status.success : colors.status.danger, marginTop: 4 }}>
                  {formatQty(product.available)} {unitShort(product.unit)}
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
              <TouchableOpacity
                onPress={() => setQty(Math.min(available, qty + 1))}
                disabled={outOfStock || qty >= available}
                style={{ width: 48, height: 48, borderRadius: 24, opacity: outOfStock || qty >= available ? 0.4 : 1, backgroundColor: colors.accent.primary, alignItems: "center", justifyContent: "center" }}>
                <Feather name="plus" size={20} color={ink} />
              </TouchableOpacity>
            </View>
          </View>
          </ScrollView>

          {/* Кнопка вне прокрутки: она обязана быть видна всегда. */}
          <View style={{ paddingHorizontal: Spacing.xl, paddingTop: Spacing.md, paddingBottom: Spacing.md }}>
            <TouchableOpacity
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onAdd(qty); setQty(1); }}
              disabled={outOfStock}
              style={{ backgroundColor: colors.accent.primary, opacity: outOfStock ? 0.4 : 1, borderRadius: Radii.md, padding: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 }}>
              <Feather name={outOfStock ? "slash" : "shopping-cart"} size={18} color={ink} />
              <Text style={{ color: ink, fontSize: Typography.size.base, fontFamily: Typography.fontBold }}>
                {outOfStock ? "Нет в наличии" : "Добавить в заказ"}
              </Text>
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
  /*
    Лист приклеен к нижнему краю окна, а окно на Android заходит ПОД системную
    панель. Без этого отступа нижние 20–30 точек главной кнопки листа лежали в
    полосе жестов или под тремя кнопками: агент жал «Добавить в заказ», а
    срабатывало системное «Назад». Помощник safeBottomPadding уже написан для
    этого — src/theme.ts.
  */
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [cityFilter, setCityFilter] = useState("");

  const cities = useMemo(() => {
    const set = new Set<string>();
    shops.forEach(s => { if (s.city) set.add(s.city); });
    return Array.from(set).sort();
  }, [shops]);

  const filtered = useMemo(() => {
    return shops.filter(s => {
      if (cityFilter && s.city !== cityFilter) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return s.name?.toLowerCase().includes(q) || s.ownerName?.toLowerCase().includes(q) || s.address?.toLowerCase().includes(q) || s.district?.toLowerCase().includes(q);
    });
  }, [shops, search, cityFilter]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)" }} onPress={onClose}>
        <Pressable style={{
          position: "absolute", bottom: 0, left: 0, right: 0, maxHeight: "80%",
          paddingBottom: modalBottomPadding(insets.bottom),
          backgroundColor: colors.bg.secondary, borderTopLeftRadius: Radii.xxl, borderTopRightRadius: Radii.xxl, padding: Spacing.xl,
        }} onPress={e => e.stopPropagation()}>
          <View style={{ alignItems: "center", paddingBottom: Spacing.md }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border.default }} />
          </View>
          <Text style={{ color: colors.text.primary, fontSize: Typography.size.lg, fontFamily: Typography.fontBold, marginBottom: Spacing.md }}>Выберите магазин</Text>
          <SearchInput value={search} onChangeText={setSearch} placeholder="Поиск по имени, адресу…" />
          {cities.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginTop: Spacing.sm, marginBottom: Spacing.sm }}>
              <TouchableOpacity onPress={() => setCityFilter("")} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: !cityFilter ? colors.accent.primary : colors.bg.elevated, borderWidth: 1, borderColor: !cityFilter ? colors.accent.primary : colors.border.default }}>
                <Text style={{ fontSize: 12, fontFamily: Typography.fontSemibold, color: !cityFilter ? "#fff" : colors.text.secondary }}>Все</Text>
              </TouchableOpacity>
              {cities.map(c => (
                <TouchableOpacity key={c} onPress={() => setCityFilter(cityFilter === c ? "" : c)} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: cityFilter === c ? colors.accent.primary : colors.bg.elevated, borderWidth: 1, borderColor: cityFilter === c ? colors.accent.primary : colors.border.default }}>
                  <Text style={{ fontSize: 12, fontFamily: Typography.fontSemibold, color: cityFilter === c ? "#fff" : colors.text.secondary }}>{c}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
          <Text style={{ fontSize: 11, color: colors.text.muted, marginTop: 4, marginBottom: 8 }}>{filtered.length} магазинов</Text>
          <FlatList data={filtered} keyExtractor={s => String(s.id)} style={{ maxHeight: 300 }}
            renderItem={({ item: shop }) => (
              <TouchableOpacity onPress={() => setSelected(shop.id)}
                style={{ flexDirection: "row", alignItems: "center", padding: Spacing.base, marginBottom: Spacing.sm, borderRadius: Radii.md, backgroundColor: selected === shop.id ? colors.accent.primary + "12" : colors.bg.card, borderWidth: 1.5, borderColor: selected === shop.id ? colors.accent.primary : colors.border.default }}>
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: selected === shop.id ? colors.accent.primary : colors.bg.elevated, alignItems: "center", justifyContent: "center", marginRight: Spacing.md }}>
                  <Feather name="shopping-bag" size={16} color={selected === shop.id ? "#fff" : colors.text.muted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text.primary, fontSize: Typography.size.base, fontFamily: Typography.fontSemibold }}>{shop.name}</Text>
                  <Text style={{ color: colors.text.tertiary, fontSize: Typography.size.xs }} numberOfLines={1}>{[shop.ownerName, shop.city, shop.district].filter(Boolean).join(" · ")}</Text>
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
function PaymentPicker({ visible, onSelect, onClose, colors, submitting }: {
  visible: boolean; onSelect: (method: "cash" | "card" | "transfer" | "debt") => void; onClose: () => void; colors: ThemeColors; submitting?: boolean;
}) {
  /*
    Лист приклеен к нижнему краю окна, а окно на Android заходит ПОД системную
    панель. Без этого отступа нижние 20–30 точек главной кнопки листа лежали в
    полосе жестов или под тремя кнопками: агент жал «Добавить в заказ», а
    срабатывало системное «Назад». Помощник safeBottomPadding уже написан для
    этого — src/theme.ts.
  */
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<"cash" | "card" | "transfer" | "debt">("cash");
  const options: Array<{ key: "cash" | "card" | "transfer" | "debt"; label: string; icon: "dollar-sign" | "credit-card" | "send" | "alert-circle" }> = [
    { key: "cash", label: PAYMENT_METHODS.cash, icon: "dollar-sign" },
    { key: "card", label: PAYMENT_METHODS.card, icon: "credit-card" },
    { key: "transfer", label: PAYMENT_METHODS.transfer, icon: "send" },
    { key: "debt", label: PAYMENT_METHODS.debt, icon: "alert-circle" },
  ];
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)" }} onPress={onClose}>
        <Pressable style={{
          position: "absolute", bottom: 0, left: 0, right: 0,
          paddingBottom: modalBottomPadding(insets.bottom),
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
          {/*
            Окно закрывается только по ответу сервера, а на слабой связи он идёт
            секунды. Раньше кнопка всё это время выглядела нетронутой: агент жал
            её второй и третий раз и до самого сообщения не знал, ушёл заказ или
            нет. Ключ идемпотентности спасал сервер от дублей, но человеку об
            этом ничего не говорило.
          */}
          <TouchableOpacity
            onPress={() => { if (!submitting) onSelect(selected); }}
            disabled={submitting}
            style={{
              backgroundColor: colors.accent.primary, opacity: submitting ? 0.6 : 1, borderRadius: Radii.md,
              padding: 15, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8,
            }}>
            {submitting && <ActivityIndicator size="small" color={readableInk(colors.accent.primary)} />}
            <Text style={{ color: readableInk(colors.accent.primary), fontSize: Typography.size.base, fontFamily: Typography.fontBold }}>
              {submitting ? "Отправляется…" : "Подтвердить"}
            </Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default function CatalogScreen() {
  // Вкладку не размонтируют при переключении, поэтому запрос уходит один раз
  // за запуск. Здесь данные этого экрана помечаются устаревшими при возврате
  // на него — подробности в самом хуке.
  useRefreshOnFocus([["products"], ["availableShops"], ["categories"]]);
  const { width: SCREEN_W } = useWindowDimensions();
  const CARD_W = useMemo(() => (SCREEN_W - Spacing.base * 2 - Spacing.md) / 2, [SCREEN_W]);
  const { isDark } = useThemeStore();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { addOrder } = useOfflineStore();
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
  // Один ключ на попытку «добавить в заказ», переиспользуется при повторе
  // шага оплаты: без него потерянный ответ и ручной повтор создают второй
  // заказ. Очередь офлайна у этого пути теперь есть, но ключ нужен и с ней —
  // он защищает от дубля, а не от отсутствия связи.
  const pendingIdempotencyKeyRef = useRef<string | null>(null);
  const [cachedProducts, setCachedProducts] = useState<Product[]>([]);

  const canAccessAgent = user?.role === "agent" || user?.role === "supervisor" || user?.role === "ceo" || user?.role === "operator";
  const isSupervisor = user?.role === "supervisor" || user?.role === "ceo";
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
  const { data: shopsData } = useQuery({ queryKey: ["availableShops"], queryFn: isSupervisor ? getAllShopsForSupervisor : getAvailableShops, enabled: canAccessAgent });
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

  const shops = useMemo(() => (shopsData ?? []).sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "")), [shopsData]);

  const categories = useMemo(() => {
    const dynamic = (serverCategories ?? []).filter(Boolean).map((c: string) => ({ key: c.toLowerCase(), label: c }));
    return [{ key: "all", label: "Все" }, ...dynamic];
  }, [serverCategories]);

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

  const createOrderMutation = useMutation({
    mutationFn: async (input: { shopId: number; items: { productId: number; quantity: number; unitPrice: number }[]; paymentMethod?: "cash" | "card" | "transfer" | "debt"; idempotencyKey?: string }) => {
      try {
        return await createOrder(input);
      } catch (e) {
        /*
          Отказ по существу (нет товара, закрыт магазин) в очередь класть
          нельзя — он будет всплывать снова и снова. А вот сетевой отказ
          означает только «сейчас не дошло»: заказ уже составлен человеком, и
          терять его нельзя.
        */
        if (!isRetryableError(e)) throw e;
        const queued = await addOrder({
          id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          input,
          shopName: shops.find(sh => sh.id === input.shopId)?.name ?? "",
          createdAt: new Date().toISOString(),
          synced: false,
          quotedTotal: input.items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0),
        });
        return { offline: true as const, queued };
      }
    },
    /*
      Сбрасывается не только список заказов.

      Быстрый заказ уменьшает остаток на складе, а вкладка каталога остаётся
      смонтированной: агент отгружал 40 из 50 единиц, а карточка по-прежнему
      писала «50 шт» и «В наличии» — и он обещал владельцу магазина ещё 40.
      Тот же устаревший остаток попадал в форму заказа, где проверка «хватит
      ли товара» опирается на это же число. Ключ ["products"] сбрасывается по
      префиксу, поэтому накрывает и все варианты поиска, и список в окне
      выбора товара. В планах лежит долг магазина — он растёт при оплате
      «Долг», значит устаревает тоже.
    */
    onSuccess: (data) => {
      if (data && typeof data === "object" && "offline" in data) {
        // Запись могла не лечь на диск — тогда заказ держится только в
        // памяти и пропадёт при выгрузке приложения.
        if (!data.queued) { reportNotQueued("Заказ"); return; }
        pendingIdempotencyKeyRef.current = null;
        setShowShopPicker(false); setShowPaymentPicker(false); setPendingProduct(null); setPendingShopId(null);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        notify.info("Нет связи. Заказ сохранён и отправится сам. Итог посчитается по ценам на момент отправки.");
        return;
      }
      notify.success("Заказ создан!");
      pendingIdempotencyKeyRef.current = null;
      setShowShopPicker(false); setShowPaymentPicker(false); setPendingProduct(null); setPendingShopId(null);
      for (const queryKey of [["myOrders"], ["products"], ["availableShops"], ["plans"]]) {
        queryClient.invalidateQueries({ queryKey });
      }
    },
    onError: (e: Error) => notify.error(e.message || "Ошибка"),
  });

  const handleAdd = useCallback((product: Product, qty: number) => {
    if (shops.length === 0) { notify.error("Нет магазинов"); return; }
    pendingIdempotencyKeyRef.current = uuidv4();
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
        <SearchInput value={search} onChangeText={setSearch} placeholder="Поиск товаров…" />
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
      {isError && !isFromCache ? (
        <View style={{ alignItems: "center", paddingVertical: 80, paddingHorizontal: Spacing.xl }}>
          <View style={{ width: 72, height: 72, borderRadius: Radii.xl, backgroundColor: colors.status.dangerDim, alignItems: "center", justifyContent: "center", marginBottom: Spacing.md }}>
            <Feather name="wifi-off" size={32} color={colors.status.danger} />
          </View>
          <Text style={{ color: colors.text.secondary, fontSize: Typography.size.lg, fontFamily: Typography.fontSemibold }}>Ошибка загрузки</Text>
          <Text style={{ color: colors.text.muted, fontSize: Typography.size.sm, marginTop: 4, textAlign: "center" }}>{error?.message ?? "Проверьте подключение"}</Text>
          {/*
            Повторить было нечем. Сетка с потягиванием вниз в этой ветке не
            рисуется вовсе, а другого способа перезапустить запрос нет: агент в
            первый день на телефоне, без сохранённого кэша, упирался в эту
            надпись и перезапускал приложение.
          */}
          <Button onPress={() => { void refetch(); }} loading={isFetching} style={{ marginTop: Spacing.lg }}>
            Повторить
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
              <Text style={{ color: colors.status.warning, fontSize: Typography.size.sm, fontFamily: Typography.fontMedium }}>Офлайн данные</Text>
            </View>
          ) : null}
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
              {/* Пустой каталог — это пустой каталог, а не «введите запрос»:
                  список товаров приходит и без поиска. */}
              <Text style={{ color: colors.text.secondary, fontSize: Typography.size.lg, fontFamily: Typography.fontSemibold }}>
                {search ? "Товары не найдены" : "Каталог пуст"}
              </Text>
              <Text style={{ color: colors.text.muted, fontSize: Typography.size.sm, marginTop: 4, textAlign: "center" }}>
                {search ? "Попробуйте изменить запрос" : "Товары появятся, когда их заведут на складе"}
              </Text>
            </View>
          }
        />
      )}

      <ProductDetail product={selectedProduct} visible={showDetail} colors={colors} isDark={isDark} fmt={fmt}
        onClose={() => { setShowDetail(false); setSelectedProduct(null); }}
        onAdd={(qty) => { if (selectedProduct) { handleAdd(selectedProduct, qty); setShowDetail(false); setSelectedProduct(null); } }} />

      <ShopPicker visible={showShopPicker} shops={shops} colors={colors}
        onClose={() => { setShowShopPicker(false); setPendingProduct(null); pendingIdempotencyKeyRef.current = null; }}
        onSelect={(shopId) => {
          setShowShopPicker(false);
          setPendingShopId(shopId);
          setShowPaymentPicker(true);
        }} />

      <PaymentPicker visible={showPaymentPicker} colors={colors} submitting={createOrderMutation.isPending}
        onClose={() => { setShowPaymentPicker(false); setPendingProduct(null); setPendingShopId(null); pendingIdempotencyKeyRef.current = null; }}
        onSelect={(method) => {
          if (pendingProduct && pendingShopId) {
            createOrderMutation.mutate({ shopId: pendingShopId, items: [{ productId: pendingProduct.id, quantity: pendingQty, unitPrice: Number(pendingProduct.unitPrice) }], paymentMethod: method, idempotencyKey: pendingIdempotencyKeyRef.current ?? undefined });
          }
        }} />
    </View>
  );
}
