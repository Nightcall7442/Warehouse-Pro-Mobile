// Warehouse Pro — Catalog v2 (cold palette, Card from ui.tsx)
// Касание карточки открывает экран товара (app/product/[id]); корзинка на
// карточке — быстрый заказ одной позиции, как и раньше.
import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useRefreshOnFocus } from "../../src/hooks/useRefreshOnFocus";
import { useScrollTopOnFocus } from "../../src/hooks/useScrollTopOnFocus";
import { useScrollTopOnChange } from "../../src/hooks/useScrollTopOnChange";
import {
  View, Text, FlatList, TouchableOpacity, Modal, Pressable,
  ScrollView, useWindowDimensions, RefreshControl, ActivityIndicator,
} from "react-native";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";
import { getProducts, getCategories, createOrder, getAvailableShops, getAllShopsForSupervisor, Product, Shop } from "../../src/api";
import { uuidv4 } from "../../src/store/offline";
import { useThemeColors, useThemeStore } from "../../src/store/theme";
import { useAuthStore } from "../../src/store/auth";
import { notify } from "../../src/store/toast";
import { Typography, Spacing, Radii, ThemeColors, modalBottomPadding, soft } from "../../src/theme";
import { SearchInput, Card, Button } from "../../src/components/ui";
import { SecureImage } from "../../src/components/SecureImage";
import { useDebounce } from "../../src/hooks/useDebounce";
import { useOfflineStore, isRetryableError } from "../../src/store/offline";
import { reportNotQueued } from "../../src/lib/offline-guard";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { formatMoney } from "../../src/store/branding";
import { readableInk } from "../../src/lib/contrast";
import { useT, useLang } from "../../src/i18n";
/*
  Своей таблицы единиц у каталога больше нет — она была третьей в приложении и
  расходилась с остальными: box здесь звался «ящ», а строки block не было
  вовсе, и товар в блоках подписывался кодом из базы. Помощник количества тоже
  жил здесь один, а корзина нового заказа печатала тот же остаток как есть.
*/
import { unitShort, formatQty } from "../../src/lib/units";
import { PAYMENT_METHODS } from "../../src/lib/order-status";

// ── Hero Product Card ────────────────────────────────────────────────────────
function ProductCard({
  product, colors, isDark, onPress, onAdd, fmt, cardWidth }: {
  product: Product; colors: ThemeColors; isDark: boolean; onPress: () => void; onAdd: () => void;
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
          {/* Stock badge */}
          <View style={{ position: "absolute", top: Spacing.sm, left: Spacing.sm, backgroundColor: inStock ? colors.status.successDim : colors.status.dangerDim, borderRadius: Radii.full, paddingHorizontal: 8, paddingVertical: 4, ...(inStock ? soft(isDark).raisedSm : soft(isDark).inset),}}>
            <Text style={{ color: inStock ? colors.status.success : colors.status.danger, fontSize: 11, fontFamily: Typography.fontSemibold }}>{inStock ? t("В наличии", "Bor") : t("Нет", "Yo'q")}</Text>
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

// ── Shop Picker Modal ────────────────────────────────────────────────────────
function ShopPicker({ visible, shops, onSelect, onClose, colors }: {
  visible: boolean; shops: Shop[]; onSelect: (shopId: number) => void; onClose: () => void; colors: ThemeColors;
}) {
  const { isDark } = useThemeStore();
  /*
    Лист приклеен к нижнему краю окна, а окно на Android заходит ПОД системную
    панель. Без этого отступа нижние 20–30 точек главной кнопки листа лежали в
    полосе жестов или под тремя кнопками: агент жал «Добавить в заказ», а
    срабатывало системное «Назад». Помощник safeBottomPadding уже написан для
    этого — src/theme.ts.
  */
  const insets = useSafeAreaInsets();
  const t = useT();
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
          <Text style={{ color: colors.text.primary, fontSize: Typography.size.lg, fontFamily: Typography.fontBold, marginBottom: Spacing.md }}>{t("Выберите магазин", "Do'konni tanlang")}</Text>
          <SearchInput value={search} onChangeText={setSearch} placeholder={t("Поиск по имени, адресу…", "Nomi, manzili bo'yicha qidirish…")} />
          {cities.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginTop: Spacing.sm, marginBottom: Spacing.sm }}>
              <TouchableOpacity onPress={() => setCityFilter("")} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: !cityFilter ? colors.accent.primary : colors.bg.elevated, ...((!cityFilter) ? soft(isDark).raisedSm : soft(isDark).inset),}}>
                <Text style={{ fontSize: 12, fontFamily: Typography.fontSemibold, color: !cityFilter ? "#fff" : colors.text.secondary }}>{t("Все", "Hammasi")}</Text>
              </TouchableOpacity>
              {cities.map(c => (
                <TouchableOpacity key={c} onPress={() => setCityFilter(cityFilter === c ? "" : c)} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: cityFilter === c ? colors.accent.primary : colors.bg.elevated, ...((cityFilter === c) ? soft(isDark).raisedSm : soft(isDark).inset),}}>
                  <Text style={{ fontSize: 12, fontFamily: Typography.fontSemibold, color: cityFilter === c ? "#fff" : colors.text.secondary }}>{c}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
          <Text style={{ fontSize: 11, color: colors.text.muted, marginTop: 4, marginBottom: 8 }}>{t(`${filtered.length} магазинов`, `${filtered.length} ta do'kon`)}</Text>
          <FlatList data={filtered} keyExtractor={s => String(s.id)} style={{ maxHeight: 300 }}
            renderItem={({ item: shop }) => (
              <TouchableOpacity onPress={() => setSelected(shop.id)}
                style={{ flexDirection: "row", alignItems: "center", padding: Spacing.base, marginBottom: Spacing.sm, borderRadius: Radii.md, backgroundColor: selected === shop.id ? colors.accent.primary + "12" : colors.bg.card, ...((selected === shop.id) ? soft(isDark).raisedSm : soft(isDark).inset),}}>
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
            <Text style={{ color: "#fff", fontSize: Typography.size.base, fontFamily: Typography.fontBold }}>{t("Создать заказ", "Buyurtma yaratish")}</Text>
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
  const t = useT();
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
          <Text style={{ color: colors.text.primary, fontSize: Typography.size.lg, fontFamily: Typography.fontBold, marginBottom: Spacing.lg }}>{t("Способ оплаты", "To'lov usuli")}</Text>
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
              {submitting ? t("Отправляется…", "Yuborilmoqda…") : t("Подтвердить", "Tasdiqlash")}
            </Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
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
  const queryClient = useQueryClient();
  const { addOrder } = useOfflineStore();
  const { user } = useAuthStore();

  const [search, setSearch] = useState("");
  const [selectedCat, setSelectedCat] = useState("all");
  const listRef = useRef<FlatList>(null);
  useScrollTopOnFocus(listRef);
  useScrollTopOnChange(listRef, [search, selectedCat]);
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
        if (!data.queued) { reportNotQueued(t("Заказ", "Buyurtma")); return; }
        pendingIdempotencyKeyRef.current = null;
        setShowShopPicker(false); setShowPaymentPicker(false); setPendingProduct(null); setPendingShopId(null);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        notify.info(t("Нет связи. Заказ сохранён и отправится сам. Итог посчитается по ценам на момент отправки.", "Aloqa yo'q. Buyurtma saqlandi va o'zi yuboriladi. Jami yuborish paytidagi narxlar bo'yicha hisoblanadi."));
        return;
      }
      notify.success(t("Заказ создан!", "Buyurtma yaratildi!"));
      pendingIdempotencyKeyRef.current = null;
      setShowShopPicker(false); setShowPaymentPicker(false); setPendingProduct(null); setPendingShopId(null);
      for (const queryKey of [["myOrders"], ["products"], ["availableShops"], ["plans"]]) {
        queryClient.invalidateQueries({ queryKey });
      }
    },
    onError: (e: Error) => notify.error(e.message || t("Ошибка", "Xatolik")),
  });

  const handleAdd = useCallback((product: Product, qty: number) => {
    if (shops.length === 0) { notify.error(t("Нет магазинов", "Do'kon yo'q")); return; }
    pendingIdempotencyKeyRef.current = uuidv4();
    if (shops.length === 1) {
      setPendingProduct(product); setPendingQty(qty); setPendingShopId(shops[0].id); setShowPaymentPicker(true);
    } else {
      setPendingProduct(product); setPendingQty(qty); setShowShopPicker(true);
    }
  }, [shops, t]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      {/* Header */}
      <View style={{ paddingTop: insets.top + Spacing.sm, paddingHorizontal: Spacing.base, paddingBottom: Spacing.md }}>
        <Text style={{ color: colors.text.primary, fontSize: Typography.size.xxl, fontFamily: Typography.fontExtraBold, marginBottom: Spacing.md }}>{t("Каталог", "Katalog")}</Text>
        <SearchInput value={search} onChangeText={setSearch} placeholder={t("Поиск товаров…", "Mahsulot qidirish…")} />
      </View>

      {/* Category chips */}
      {categories.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: Spacing.base, gap: Spacing.sm, marginBottom: Spacing.base }}>
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
                {search ? t("Товары не найдены", "Mahsulot topilmadi") : t("Каталог пуст", "Katalog bo'sh")}
              </Text>
              <Text style={{ color: colors.text.muted, fontSize: Typography.size.sm, marginTop: 4, textAlign: "center" }}>
                {search ? t("Попробуйте изменить запрос", "So'rovni o'zgartirib ko'ring") : t("Товары появятся, когда их заведут на складе", "Mahsulotlar omborga kiritilgach paydo bo'ladi")}
              </Text>
            </View>
          }
        />
      )}

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
