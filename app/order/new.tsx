// Warehouse Pro — New Order (matches web NewOrder.tsx — 3-step wizard)
import { useState, useMemo, useEffect, useRef } from "react";
import { clampDiscountText } from "../../src/lib/discount";
import { useDebounce } from "../../src/hooks/useDebounce";
import { View, Text, ScrollView, TouchableOpacity, TextInput, FlatList, Modal, Pressable, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";
import { getAvailableShops, getProducts, createOrder, Shop } from "../../src/api";
import { PromisedDelivery } from "../../src/components/order/PromisedDelivery";
import { useOfflineStore, uuidv4, isRetryableError } from "../../src/store/offline";
import { useOfflineCopy } from "../../src/hooks/useOfflineCopy";
import { notify } from "../../src/store/toast";
import { useThemeColors, useThemeStore } from "../../src/store/theme";
import { Typography, Spacing, Radii, ThemeColors, safeBottomPadding, soft } from "../../src/theme";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Card, SearchInput, Skeleton } from "../../src/components/ui";
import { PressableScale } from "../../src/components/Animated";
import { CameraView, useCameraPermissions } from "expo-camera";
import { bumpLine, findScanned, cartSummary } from "../../src/lib/cart";
import { qty as qtyText } from "../../src/lib/format";
import { unitShort } from "../../src/lib/units";
import { useT, useLang } from "../../src/i18n";

interface OrderLine {
  productId: number;
  name: string;
  unitPrice: number;
  quantity: string;
  discount: string;
  /**
   * Остаток на складе. null — остаток ещё не известен.
   *
   * Заказ, начатый со сканера штрих-кода, приходит сюда параметрами маршрута,
   * и остатка среди них нет. Раньше в этом случае подставлялся ноль — и он
   * ничем не отличался от честного нуля: кнопка «Продолжить» гасла при любом
   * количестве, а рядом с товаром стояло «Остаток: 0 (превышено!)». Агент у
   * полки читал это как «товара нет на складе» и уходил, хотя товар был у него
   * в руках. Весь путь «отсканировал у полки → оформил заказ» не работал.
   *
   * Отдельное значение для «не знаем» позволяет не врать и не блокировать:
   * остаток дочитывается из каталога, а пока не дочитан — ограничение не
   * применяется.
   */
  available: number | null;
  unit?: string;
}

/**
 * Запомнить магазин как недавний, не мешая выбору.
 *
 * Список недавних — удобство, а не часть заказа: если запись не удалась,
 * выбор магазина всё равно должен состояться. По той же причине, что и в
 * эффекте выше, здесь require, а не динамический import.
 */
function addRecentShopSafely(shopId: number) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const recentShops = require("../../src/store/recentShops") as typeof import("../../src/store/recentShops");
    void recentShops.addRecentShop(shopId);
  } catch { /* недавние магазины — не повод срывать оформление заказа */ }
}

/**
 * Остаток из каталога в число — или null, если сервер его не прислал.
 *
 * Остатки приходят строкой DECIMAL(15,3). Number(null) даёт 0, и товар без
 * заполненного остатка выглядел бы как «нет на складе»: кнопка «Продолжить»
 * гасла, а рядом стояло «превышено!». Отсутствие данных и настоящий ноль —
 * разные вещи, и агенту у полки они говорят прямо противоположное.
 */
function parseStock(raw: string | number | null | undefined): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

// ── Step Indicator (matches web Steps) ───────────────────────────────────────
function StepIndicator({ step, total, colors }: { step: number; total: number; colors: ThemeColors }) {
  const t = useT();
  const labels = [t("Магазин", "Do'kon"), t("Товары", "Mahsulotlar"), t("Итог", "Yakun")];
  return (
    <View style={{ backgroundColor: colors.bg.secondary, paddingHorizontal: Spacing.base, paddingBottom: Spacing.base, borderBottomWidth: 1, borderBottomColor: colors.border.default }}>
      {/* Progress track */}
      <View style={{ height: 5, backgroundColor: colors.bg.input, borderRadius: Radii.full, marginBottom: Spacing.base, overflow: "hidden" }}>
        <View style={{ height: "100%", borderRadius: Radii.full, width: `${(step / total) * 100}%`, backgroundColor: colors.accent.primary }} />
      </View>
      {/* Step info */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: colors.accent.primary, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontSize: Typography.size.sm, fontFamily: Typography.fontBold, color: colors.brand.ink }}>{step}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: Typography.size.xs, color: colors.text.tertiary, fontFamily: Typography.fontBold, letterSpacing: 1 }}>{t(`ШАГ ${step} ИЗ ${total}`, `QADAM ${step} / ${total}`)}</Text>
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
  const { isDark } = useThemeStore();
  const t = useT();
  const lang = useLang();
  const [search, setSearch] = useState("");
  const [cityFilter, setCityFilter] = useState("");
  const [recentIds, setRecentIds] = useState<number[]>([]);
  /*
    Живые данные с сервера, а при их отсутствии — копия с диска.

    Кэш react-query живёт только в памяти: агент, открывший приложение утром
    в подсобке без связи, видел на первом же шаге «Ничего не найдено», хотя
    офлайн-очередь умеет принять заказ. Хук и модуль копии были написаны и
    покрыты тестом, но провод отсюда потерялся при слиянии ветвей 07.09.
  */
  const { data: liveShops, isLoading: liveLoading } = useQuery({ queryKey: ["availableShops"], queryFn: getAvailableShops });
  const { data: shops, fromCopy, savedAt } = useOfflineCopy<typeof liveShops>("shops", liveShops);
  // Пока грузится живое, но копия уже есть — показываем копию, не скелет.
  const isLoading = liveLoading && !shops;
  // Про возраст копии сказано прямо: по остаткам и ценам агент разговаривает
  // с хозяином магазина, и выдавать вчерашнее за сегодняшнее молча нельзя.
  const copyNotice = fromCopy && savedAt
    ? t(`Список сохранён ${new Date(savedAt).toLocaleDateString(lang === "uz" ? "uz-Latn-UZ" : "ru")} — связи нет, он мог устареть`, `Ro'yxat ${new Date(savedAt).toLocaleDateString(lang === "uz" ? "uz-Latn-UZ" : "ru")} da saqlangan — aloqa yo'q, eskirgan bo'lishi mumkin`)
    : null;

  // Load recent shop IDs on mount
  useEffect(() => {
    // require, а не динамический import: последний в тестовой среде падает без
    // отдельного флага узла, и экран нельзя было отрисовать в тесте целиком —
    // а именно на этом экране проверяется, что заказ со сканера доводится до
    // конца. Модуль лёгкий (только хранилище), на загрузку это не влияет.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const recentShops = require("../../src/store/recentShops") as typeof import("../../src/store/recentShops");
    recentShops.getRecentShopIds().then(setRecentIds);
  }, []);

  // Unique cities for quick filter
  const cities = useMemo(() => {
    const set = new Set<string>();
    (shops ?? []).forEach(s => { if (s.city) set.add(s.city); });
    return Array.from(set).sort();
  }, [shops]);

  const matchSearch = (s: Shop) => {
    if (cityFilter && s.city !== cityFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (s.name?.toLowerCase().includes(q) || s.ownerName?.toLowerCase().includes(q) || s.address?.toLowerCase().includes(q) || s.district?.toLowerCase().includes(q));
  };

  const { recentShops, otherShops } = useMemo(() => {
    const all = (shops ?? []).filter(matchSearch);
    if (recentIds.length === 0 || search || cityFilter) return { recentShops: [], otherShops: all };
    const recent = recentIds.map(id => all.find(s => s.id === id)).filter(Boolean) as Shop[];
    const other = all.filter(s => !recentIds.includes(s.id));
    return { recentShops: recent, otherShops: other };
  }, [shops, search, cityFilter, recentIds]);

  const filtered = search || cityFilter ? (shops ?? []).filter(matchSearch) : otherShops;

  const renderShopItem = ({ item: shop }: { item: Shop }) => {
    const selected = shop.id === selectedId;
    const hasDebt = Number(shop.debt ?? 0) > 0;
    return (
      <PressableScale onPress={() => { onSelect(shop); }} haptic="light" style={{ marginBottom: 8 }}>
        <Card style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 14, ...(selected ? soft(isDark).raisedSm : soft(isDark).inset),}}>
          <View style={{ width: 40, height: 40, borderRadius: Radii.md, backgroundColor: selected ? colors.accent.primary + "20" : colors.bg.elevated, alignItems: "center", justifyContent: "center" }}>
            <Feather name="shopping-bag" size={18} color={selected ? colors.accent.primary : colors.text.muted} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontSize: Typography.size.base, fontFamily: Typography.fontSemibold, color: selected ? colors.accent.primary : colors.text.primary }}>{shop.name}</Text>
            <Text style={{ fontSize: Typography.size.sm, color: colors.text.tertiary }} numberOfLines={1}>
              {[shop.ownerName, shop.city].filter(Boolean).join(" · ") || "—"}
            </Text>
            {hasDebt && <Text style={{ fontSize: Typography.size.xs, color: colors.status.danger, fontFamily: Typography.fontMedium, marginTop: 2 }}>{t("Долг", "Qarz")}: {Number(shop.debt).toLocaleString("ru")} {t("сум", "so'm")}</Text>}
          </View>
          {selected ? (
            <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: colors.accent.primary, alignItems: "center", justifyContent: "center" }}>
              <Feather name="check" size={14} color={colors.brand.ink} />
            </View>
          ) : (
            <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: colors.bg.input, ...soft(isDark).insetSm }} />
          )}
        </Card>
      </PressableScale>
    );
  };

  return (
    <View style={{ padding: Spacing.base, gap: Spacing.md, flex: 1 }}>
      {copyNotice && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.status.warningDim, borderRadius: Radii.md, paddingVertical: 8, paddingHorizontal: 10 }}>
          <Feather name="wifi-off" size={13} color={colors.status.warning} />
          <Text style={{ flex: 1, fontSize: Typography.size.xs, color: colors.text.secondary }}>{copyNotice}</Text>
        </View>
      )}
      <SearchInput value={search} onChangeText={setSearch} placeholder={t("Поиск по имени, адресу, району…", "Nomi, manzili, tumani bo'yicha qidirish…")} autoFocus />
      {/* City quick filter */}
      {cities.length > 1 && (
        // flexGrow/flexShrink: 0 — иначе в колонке flex: 1 со списком ниже лента сжимается в полоску (как чипы каталога).
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 0 }} contentContainerStyle={{ gap: 6 }}>
          <TouchableOpacity onPress={() => setCityFilter("")} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: !cityFilter ? colors.accent.primary : colors.bg.elevated, ...(!cityFilter ? soft(isDark).raisedSm : soft(isDark).inset) }}>
            <Text style={{ fontSize: 12, fontFamily: Typography.fontSemibold, color: !cityFilter ? colors.brand.ink : colors.text.secondary }}>{t("Все города", "Barcha shaharlar")}</Text>
          </TouchableOpacity>
          {cities.map(c => (
            <TouchableOpacity key={c} onPress={() => setCityFilter(cityFilter === c ? "" : c)} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: cityFilter === c ? colors.accent.primary : colors.bg.elevated, ...((cityFilter === c) ? soft(isDark).raisedSm : soft(isDark).inset),}}>
              <Text style={{ fontSize: 12, fontFamily: Typography.fontSemibold, color: cityFilter === c ? colors.brand.ink : colors.text.secondary }}>{c}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
      {isLoading ? (
        <View style={{ gap: 10 }}>{[1, 2, 3, 4].map(i => <Skeleton key={i} height={64} radius={Radii.lg} />)}</View>
      ) : filtered.length === 0 && recentShops.length === 0 ? (
        <View style={{ alignItems: "center", paddingVertical: 60 }}>
          <Feather name="search" size={32} color={colors.text.muted} />
          <Text style={{ fontSize: Typography.size.base, fontFamily: Typography.fontSemibold, color: colors.text.secondary, marginTop: Spacing.md }}>{t("Ничего не найдено", "Hech narsa topilmadi")}</Text>
        </View>
      ) : (
        <>
          {/* Recent shops */}
          {!search && !cityFilter && recentShops.length > 0 && (
            <View style={{ marginBottom: Spacing.sm }}>
              <Text style={{ fontSize: Typography.size.xs, fontFamily: Typography.fontBold, color: colors.text.tertiary, letterSpacing: 0.5, marginBottom: 8 }}>{t("НЕДАВНИЕ", "YAQINDAGILAR")}</Text>
              {recentShops.map(s => <View key={`recent-${s.id}`}>{renderShopItem({ item: s })}</View>)}
            </View>
          )}
          {/* All shops */}
          {!search && !cityFilter && recentShops.length > 0 && filtered.length > 0 && (
            <Text style={{ fontSize: Typography.size.xs, fontFamily: Typography.fontBold, color: colors.text.tertiary, letterSpacing: 0.5, marginBottom: 4 }}>{t("ВСЕ МАГАЗИНЫ", "BARCHA DO'KONLAR")}</Text>
          )}
          <Text style={{ fontSize: 11, color: colors.text.muted, marginBottom: 4 }}>{t(`${filtered.length} магазинов`, `${filtered.length} ta do'kon`)}</Text>
          <FlatList data={filtered} keyExtractor={s => String(s.id)} scrollEnabled={false} renderItem={renderShopItem} />
        </>
      )}
    </View>
  );
}

// ── Step 2: Product Picker + Cart ────────────────────────────────────────────
function ProductStep({ lines, onChange, colors, shopId }: { lines: OrderLine[]; onChange: (l: OrderLine[]) => void; colors: ThemeColors; shopId?: number }) {
  const { isDark } = useThemeStore();
  const t = useT();
  const lang = useLang();
  /*
    Пустая корзина — окно выбора открыто сразу.

    Шаг товаров с пустой корзиной показывал «Корзина пуста. Нажмите
    „Добавить товар“» — лишнее нажатие на каждом заказе ради экрана, на
    котором делать нечего. Вернулся с проверки заказа с набранной корзиной —
    окно не лезет.
  */
  const [showPicker, setShowPicker] = useState(lines.length === 0);

  const lineTotal = (l: OrderLine) => l.unitPrice * Number(l.quantity || 0) * (1 - Number(l.discount || 0) / 100);

  return (
    <View style={{ padding: Spacing.base, gap: Spacing.sm }}>
      {/* Add product button */}
      <PressableScale onPress={() => setShowPicker(true)} haptic="light">
        <Card style={{ padding: 16, flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.accent.primary + "20", alignItems: "center", justifyContent: "center" }}>
            <Feather name="plus" size={18} color={colors.accent.primary} />
          </View>
          <Text style={{ flex: 1, fontSize: Typography.size.base, fontFamily: Typography.fontSemibold, color: colors.accent.primary }}>{t("Добавить товар", "Mahsulot qo'shish")}</Text>
          <Feather name="chevron-right" size={16} color={colors.accent.primary} />
        </Card>
      </PressableScale>

      {/* Empty state */}
      {lines.length === 0 && (
        <View style={{ alignItems: "center", paddingVertical: 50, gap: 10 }}>
          <View style={{ width: 64, height: 64, borderRadius: Radii.xl, backgroundColor: colors.bg.elevated, alignItems: "center", justifyContent: "center" }}>
            <Feather name="package" size={28} color={colors.text.muted} />
          </View>
          <Text style={{ fontSize: Typography.size.base, fontFamily: Typography.fontSemibold, color: colors.text.secondary }}>{t("Корзина пуста", "Savat bo'sh")}</Text>
          <Text style={{ fontSize: Typography.size.sm, color: colors.text.tertiary }}>{t("Нажмите «Добавить товар»", "«Mahsulot qo'shish» ni bosing")}</Text>
        </View>
      )}

      {/* Line items */}
      {lines.map((line, idx) => {
        const total = lineTotal(line);
        // Пока остаток неизвестен (строка пришла со сканера и ещё не найдена в
        // каталоге), превышения быть не может: сравнивать не с чем.
        const overStock = line.available != null && Number(line.quantity) > line.available;
        return (
          <Card key={line.productId} style={{ padding: Spacing.base, gap: 8 }}>
            {/* Header */}
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
              <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colors.accent.primary + "20", alignItems: "center", justifyContent: "center", marginTop: 1 }}>
                <Text style={{ fontSize: Typography.size.xs, fontFamily: Typography.fontBold, color: colors.accent.primary }}>{idx + 1}</Text>
              </View>
              <Text style={{ flex: 1, fontSize: Typography.size.base, fontFamily: Typography.fontSemibold, color: colors.text.primary, lineHeight: 20 }} numberOfLines={2}>{line.name}</Text>
              <TouchableOpacity onPress={() => onChange(lines.filter((_, i) => i !== idx))} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.bg.elevated, ...soft(isDark).raised, alignItems: "center", justifyContent: "center" }}>
                <Feather name="x" size={14} color={colors.text.muted} />
              </TouchableOpacity>
            </View>
            {/* Price info */}
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ fontSize: Typography.size.xs, color: colors.text.tertiary, fontFamily: Typography.fontMedium }}>{line.unitPrice.toLocaleString("ru")} {t("сум", "so'm")} / {unitShort(line.unit, lang)}</Text>
              <Text style={{ fontSize: Typography.size.xs, color: overStock ? colors.status.danger : colors.text.tertiary }}>
                {line.available == null ? t("Остаток уточняется", "Qoldiq aniqlanmoqda") : t(`Остаток: ${line.available}${overStock ? " (превышено!)" : ""}`, `Qoldiq: ${line.available}${overStock ? " (oshib ketdi!)" : ""}`)}
              </Text>
            </View>
            {/* Inputs */}
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1.4, gap: 4 }}>
                <Text style={{ fontSize: Typography.size.xs, color: colors.text.tertiary, fontFamily: Typography.fontBold, letterSpacing: 0.5 }}>{t("КОЛ-ВО", "MIQDOR")}</Text>
                {/* «− поле +»: цифры набирать в перчатках неудобно, а плюс-минус
                    на единицу — самая частая правка. Поле остаётся для дробных
                    и больших чисел. Кнопки 36 точек с hitSlop — до нормы 44. */}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <TouchableOpacity testID={`line-minus-${line.productId}`} hitSlop={{ top: 8, bottom: 8, left: 6, right: 4 }}
                    onPress={() => { const q = Math.max(1, Math.ceil(Number(line.quantity || 0)) - 1); const next = [...lines]; next[idx] = { ...next[idx], quantity: String(q) }; onChange(next); }}
                    style={{ width: 36, height: 40, borderRadius: Radii.md, backgroundColor: colors.bg.elevated, ...soft(isDark).raisedSm, alignItems: "center", justifyContent: "center" }}>
                    <Feather name="minus" size={14} color={colors.text.primary} />
                  </TouchableOpacity>
                  <TextInput value={line.quantity} onChangeText={v => {
                    const next = [...lines]; next[idx] = { ...next[idx], quantity: v.replace(",", ".") }; onChange(next);
                  }} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={colors.text.tertiary} selectTextOnFocus
                    style={{ flex: 1, backgroundColor: colors.bg.elevated, borderRadius: Radii.md, ...soft(isDark).inset, paddingVertical: 10, paddingHorizontal: 4, fontSize: Typography.size.base, fontFamily: Typography.fontSemibold, color: colors.text.primary, textAlign: "center" }} />
                  <TouchableOpacity testID={`line-plus-${line.productId}`} hitSlop={{ top: 8, bottom: 8, left: 4, right: 6 }}
                    onPress={() => { const q = Math.floor(Number(line.quantity || 0)) + 1; const next = [...lines]; next[idx] = { ...next[idx], quantity: String(q) }; onChange(next); }}
                    style={{ width: 36, height: 40, borderRadius: Radii.md, backgroundColor: colors.accent.primary, alignItems: "center", justifyContent: "center" }}>
                    <Feather name="plus" size={14} color={colors.brand.ink} />
                  </TouchableOpacity>
                </View>
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={{ fontSize: Typography.size.xs, color: colors.text.tertiary, fontFamily: Typography.fontBold, letterSpacing: 0.5 }}>{t("СКИДКА (%)", "CHEGIRMA (%)")}</Text>
                <TextInput value={line.discount} onChangeText={v => {
                  const next = [...lines]; next[idx] = { ...next[idx], discount: clampDiscountText(v) }; onChange(next);
                }} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={colors.text.tertiary} selectTextOnFocus
                  style={{ backgroundColor: colors.bg.elevated, borderRadius: Radii.md, ...soft(isDark).inset, paddingVertical: 10, paddingHorizontal: 8, fontSize: Typography.size.base, fontFamily: Typography.fontSemibold, color: colors.text.primary, textAlign: "center" }} />
              </View>
              <View style={{ flex: 1.2, gap: 4 }}>
                <Text style={{ fontSize: Typography.size.xs, color: colors.text.tertiary, fontFamily: Typography.fontBold, letterSpacing: 0.5 }}>{t("СУММА", "SUMMA")}</Text>
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
      <ProductPicker visible={showPicker} onClose={() => setShowPicker(false)} lines={lines} onChange={onChange} colors={colors} shopId={shopId} />
    </View>
  );
}

/*
  Корзина внутри выбора товара.

  Было: нажатие на товар клало его в заказ с количеством 1 и помечало «В
  корзине» — а количество правилось только на шаге с составом, после
  закрытия окна. Агент с двадцатью позициями открывал окно двадцать раз.
  Теперь: у добавленного товара стоит «− n +» прямо в списке, внизу окна
  итог по корзине и «Готово», а рядом с поиском — камера: скан штрих-кода
  или кода товара прибавляет единицу.
*/
// ── Product Picker Modal ─────────────────────────────────────────────────────
function ProductPicker({ visible, onClose, lines, onChange, colors, shopId }: {
  visible: boolean; onClose: () => void; lines: OrderLine[]; onChange: (l: OrderLine[]) => void; colors: ThemeColors;
  /** Магазин заказа: цены — его прайс-листа, как посчитает сервер. */
  shopId?: number;
}) {
  const insets = useSafeAreaInsets();
  const { isDark } = useThemeStore();
  const t = useT();
  const lang = useLang();
  const [search, setSearch] = useState("");
  const [scanning, setScanning] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const lastScan = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const debouncedSearch = useDebounce(search, 300);
  const [onlyInStock, setOnlyInStock] = useState(true);
  // Тот же запасной путь, что у магазинов: см. ShopPicker.
  const { data: liveProducts, isLoading: liveLoading } = useQuery({ queryKey: ["products", shopId ?? 0], queryFn: () => getProducts(undefined, shopId) });
  const { data: products, fromCopy, savedAt } = useOfflineCopy<typeof liveProducts>("products", liveProducts);
  const isLoading = liveLoading && !products;
  const copyNotice = fromCopy && savedAt
    ? t(`Каталог сохранён ${new Date(savedAt).toLocaleDateString(lang === "uz" ? "uz-Latn-UZ" : "ru")} — связи нет, остатки и цены могли измениться`, `Katalog ${new Date(savedAt).toLocaleDateString(lang === "uz" ? "uz-Latn-UZ" : "ru")} da saqlangan — aloqa yo'q, qoldiq va narxlar o'zgargan bo'lishi mumkin`)
    : null;

  const filtered = useMemo(() => {
    let list = (products ?? []).filter(p => !debouncedSearch || p.name.toLowerCase().includes(debouncedSearch.toLowerCase()) || (p.code ?? "").toLowerCase().includes(debouncedSearch.toLowerCase()));
    if (onlyInStock) list = list.filter(p => p.available == null || Number(p.available) > 0);
    return list.sort((a, b) => (a.category ?? "").localeCompare(b.category ?? "") || a.name.localeCompare(b.name));
  }, [products, debouncedSearch, onlyInStock]);

  const qtyOf = useMemo(() => new Map(lines.map(l => [l.productId, Number(l.quantity || 0)])), [lines]);
  const summary = cartSummary(lines);

  const onScanned = ({ data }: { data: string }) => {
    // Одна коробка в кадре — один плюс: тот же код принимается снова через паузу.
    const now = Date.now();
    if (data === lastScan.current.code && now - lastScan.current.at < 1500) return;
    lastScan.current = { code: data, at: now };
    const p = findScanned(products ?? [], data);
    if (!p) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      notify.error(t(`Товар со штрих-кодом ${data} не найден`, `${data} shtrix-kodli mahsulot topilmadi`));
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onChange(bumpLine(lines, p, 1));
  };

  const openScanner = async () => {
    if (!permission?.granted) {
      const r = await requestPermission();
      if (!r.granted) { notify.error(t("Нет доступа к камере", "Kameraga ruxsat yo'q")); return; }
    }
    setScanning(true);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)" }} onPress={onClose}>
        <Pressable style={{
          position: "absolute", bottom: 0, left: 0, right: 0, maxHeight: "80%",
          backgroundColor: colors.bg.secondary, borderTopLeftRadius: Radii.xxl, borderTopRightRadius: Radii.xxl, overflow: "hidden",
        }} onPress={e => e.stopPropagation()}>
          <View style={{ alignItems: "center", paddingVertical: 12 }}>
            <View style={{ width: 40, height: 4, borderRadius: Radii.full, backgroundColor: colors.border.default }} />
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: Spacing.base, paddingBottom: Spacing.md }}>
            <Text style={{ color: colors.text.primary, fontSize: Typography.size.lg, fontFamily: Typography.fontBold }}>{t("Выбор товара", "Mahsulot tanlash")}</Text>
            {/* Область нажатия была 32×32 при норме 44: попасть в неё на
                ходу, одной рукой, нельзя. Размер кружка оставлен прежним —
                hitSlop расширяет только область отклика. */}
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.bg.elevated, alignItems: "center", justifyContent: "center" }}
            >
              <Feather name="x" size={16} color={colors.text.primary} />
            </TouchableOpacity>
          </View>
          {/* Search */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: Spacing.base, marginBottom: Spacing.sm, backgroundColor: colors.bg.elevated, borderRadius: Radii.md, ...soft(isDark).raised, paddingHorizontal: 14, paddingVertical: 10 }}>
            <Feather name="search" size={16} color={colors.text.muted} />
            <TextInput style={{ flex: 1, color: colors.text.primary, fontSize: Typography.size.base, fontFamily: Typography.fontRegular }} placeholder={t("Название или артикул…", "Nomi yoki artikuli…")} placeholderTextColor={colors.text.muted} value={search} onChangeText={setSearch} autoFocus />
            {/* Очистка поиска была голой иконкой 16 точек. */}
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch("")} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Feather name="x-circle" size={16} color={colors.text.muted} />
              </TouchableOpacity>
            )}
            <TouchableOpacity testID="picker-scan" onPress={openScanner} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Feather name="camera" size={18} color={colors.accent.primary} />
            </TouchableOpacity>
          </View>
          {scanning && (
            <View style={{ marginHorizontal: Spacing.base, marginBottom: Spacing.sm, height: 180, borderRadius: Radii.lg, overflow: "hidden", backgroundColor: "#000" }}>
              <CameraView
                style={{ flex: 1 }}
                onBarcodeScanned={onScanned}
                barcodeScannerSettings={{ barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e", "code128", "code39"] }}
              />
              <TouchableOpacity testID="picker-scan-close" onPress={() => setScanning(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={{ position: "absolute", top: 8, right: 8, width: 32, height: 32, borderRadius: 16, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center" }}>
                <Feather name="x" size={16} color="#fff" />
              </TouchableOpacity>
              <Text style={{ position: "absolute", bottom: 8, left: 0, right: 0, textAlign: "center", color: "#fff", fontSize: Typography.size.xs }}>
                {t("Каждый скан — плюс единица", "Har bir skan — bittadan qo'shadi")}
              </Text>
            </View>
          )}
          {copyNotice && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginHorizontal: Spacing.base, marginBottom: Spacing.sm, backgroundColor: colors.status.warningDim, borderRadius: Radii.md, paddingVertical: 8, paddingHorizontal: 10 }}>
              <Feather name="wifi-off" size={13} color={colors.status.warning} />
              <Text style={{ flex: 1, fontSize: Typography.size.xs, color: colors.text.secondary }}>{copyNotice}</Text>
            </View>
          )}
          {/* Stock filter */}
          <TouchableOpacity onPress={() => setOnlyInStock(v => !v)} hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }} style={{ flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: Spacing.base, marginBottom: Spacing.sm }}>
            <View style={{ width: 20, height: 20, borderRadius: 4, ...(onlyInStock ? soft(isDark).raisedSm : soft(isDark).inset), backgroundColor: onlyInStock ? colors.accent.primary : "transparent", alignItems: "center", justifyContent: "center" }}>
              {onlyInStock && <Feather name="check" size={12} color={colors.brand.ink} />}
            </View>
            <Text style={{ fontSize: Typography.size.sm, color: colors.text.secondary, fontFamily: Typography.fontMedium }}>{t("Только в наличии", "Faqat bor bo'lganlar")}</Text>
            <Text style={{ fontSize: Typography.size.xs, color: colors.text.tertiary }}>({filtered.length})</Text>
          </TouchableOpacity>
          {/* Product list */}
          {isLoading ? (
            <View style={{ padding: Spacing.base, gap: 10 }}>{[1, 2, 3, 4, 5].map(i => <Skeleton key={i} height={60} radius={Radii.lg} />)}</View>
          ) : (
            <FlatList data={filtered} keyExtractor={p => String(p.id)} contentContainerStyle={{ padding: Spacing.base, gap: 8 }} keyboardShouldPersistTaps="handled"
              ListEmptyComponent={<View style={{ alignItems: "center", paddingVertical: 40 }}><Feather name="search" size={28} color={colors.text.muted} /><Text style={{ fontSize: Typography.size.base, color: colors.text.secondary, marginTop: Spacing.md }}>{t("Товар не найден", "Mahsulot topilmadi")}</Text></View>}
              renderItem={({ item: p }) => {
                const qty = qtyOf.get(p.id) ?? 0;
                const added = qty > 0;
                /*
                  Остаток — рядом с ценой, и «+» глохнет на его границе.

                  Было: в окне выбора остатка не видно вовсе, агент набирал
                  двадцать при пяти на складе и узнавал об этом только по
                  погасшей «Продолжить» с подписью на другом экране.
                  Неизвестный остаток (null) не ограничивает — см. parseStock.
                */
                const stock = parseStock(p.available);
                const atLimit = stock != null && qty >= stock;
                return (
                  <PressableScale onPress={() => {
                    if (added || atLimit) return;
                    onChange(bumpLine(lines, p, 1));
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }} haptic="light">
                    <Card style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 12, marginBottom: 4, ...(added ? soft(isDark).raisedSm : soft(isDark).inset), backgroundColor: added ? colors.status.success + "0D" : colors.bg.card }}>
                      <View style={{ width: 36, height: 36, borderRadius: Radii.md, backgroundColor: added ? colors.status.success + "20" : colors.bg.elevated, alignItems: "center", justifyContent: "center" }}>
                        <Feather name={added ? "check" : "package"} size={16} color={added ? colors.status.success : colors.text.muted} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: added ? colors.text.secondary : colors.text.primary, fontSize: Typography.size.sm, fontFamily: Typography.fontSemibold }} numberOfLines={1}>{p.name}</Text>
                        <View style={{ flexDirection: "row", gap: 6, marginTop: 2 }}>
                          {p.code && <Text style={{ fontSize: Typography.size.xs, color: colors.text.tertiary, backgroundColor: colors.bg.elevated, paddingHorizontal: 4, borderRadius: 4 }}>{p.code}</Text>}
                          <Text style={{ fontSize: Typography.size.xs, color: colors.accent.primary, fontFamily: Typography.fontMedium }}>{Number(p.unitPrice).toLocaleString("ru")} {t("сум", "so'm")}</Text>
                          <Text testID={`picker-stock-${p.id}`} style={{ fontSize: Typography.size.xs, color: atLimit ? colors.status.danger : colors.text.tertiary }}>
                            {stock == null ? t("· остаток уточняется", "· qoldiq aniqlanmoqda") : stock <= 0 ? t("· нет на складе", "· omborda yo'q") : t(`· остаток ${qtyText(stock)}`, `· qoldiq ${qtyText(stock)}`)}
                          </Text>
                        </View>
                      </View>
                      {added ? (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }} testID={`stepper-${p.id}`}>
                          <TouchableOpacity testID={`stepper-minus-${p.id}`} onPress={() => onChange(bumpLine(lines, p, -1))} hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
                            style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: colors.bg.elevated, alignItems: "center", justifyContent: "center" }}>
                            <Feather name="minus" size={14} color={colors.text.primary} />
                          </TouchableOpacity>
                          <Text style={{ minWidth: 22, textAlign: "center", fontSize: Typography.size.sm, fontFamily: Typography.fontBold, color: colors.text.primary }}>{qty}</Text>
                          <TouchableOpacity testID={`stepper-plus-${p.id}`} disabled={atLimit} onPress={() => onChange(bumpLine(lines, p, 1))} hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
                            style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: colors.accent.primary, alignItems: "center", justifyContent: "center", opacity: atLimit ? 0.35 : 1 }}>
                            <Feather name="plus" size={14} color={colors.brand.ink} />
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.accent.primary, alignItems: "center", justifyContent: "center", opacity: atLimit ? 0.35 : 1 }}>
                          <Feather name="plus" size={14} color={colors.brand.ink} />
                        </View>
                      )}
                    </Card>
                  </PressableScale>
                );
              }}
            />
          )}
          {/* Итог корзины и «Готово» — чтобы набрать весь заказ, не закрывая окно. */}
          <View testID="picker-summary" style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: Spacing.base, paddingVertical: Spacing.md, paddingBottom: safeBottomPadding(insets.bottom, Spacing.md), borderTopWidth: 1, borderTopColor: colors.border.default, backgroundColor: colors.bg.secondary }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: Typography.size.xs, color: colors.text.tertiary, fontFamily: Typography.fontMedium }}>
                {summary.count === 0 ? t("Корзина пуста", "Savat bo'sh") : t(`${summary.count} ${summary.count === 1 ? "товар" : summary.count < 5 ? "товара" : "товаров"}`, `${summary.count} ta mahsulot`)}
              </Text>
              <Text style={{ fontSize: Typography.size.lg, fontFamily: Typography.fontBold, color: colors.text.primary }}>{summary.total.toLocaleString("ru")} {t("сум", "so'm")}</Text>
            </View>
            <PressableScale onPress={onClose} haptic="medium">
              <View testID="picker-done" style={{ paddingHorizontal: 22, paddingVertical: 12, borderRadius: Radii.lg, backgroundColor: colors.accent.primary }}>
                <Text style={{ color: colors.brand.ink, fontFamily: Typography.fontBold, fontSize: Typography.size.base }}>{t("Готово", "Tayyor")}</Text>
              </View>
            </PressableScale>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── Step 3: Review ───────────────────────────────────────────────────────────
function ReviewStep({ shopName, lines, notes, onNotesChange, paymentMethod, onPaymentChange, promisedAt, onPromisedChange, colors }: {
  shopName: string; lines: OrderLine[]; notes: string; onNotesChange: (v: string) => void;
  paymentMethod: string; onPaymentChange: (v: string) => void;
  /* Когда обещали привезти. null — срок не называли, и это законный ответ. */
  promisedAt: string | null; onPromisedChange: (v: string | null) => void;
  colors: ThemeColors;
}) {
  const { isDark } = useThemeStore();
  const t = useT();
  const { subtotal, totalQty } = useMemo(() => {
    let sub = 0, qty = 0;
    for (const l of lines) { sub += l.unitPrice * Number(l.quantity || 0) * (1 - Number(l.discount || 0) / 100); qty += Number(l.quantity || 0); }
    return { subtotal: sub, totalQty: qty };
  }, [lines]);

  const PAYMENT_OPTIONS = [
    { key: "cash", label: t("Наличные", "Naqd"), icon: "dollar-sign" as const },
    { key: "card", label: t("Карта", "Karta"), icon: "credit-card" as const },
    { key: "transfer", label: t("Перевод", "O'tkazma"), icon: "send" as const },
    { key: "debt", label: t("Долг", "Qarz"), icon: "alert-circle" as const },
  ];

  return (
    <View style={{ padding: Spacing.base, gap: Spacing.sm }}>
      {/* Shop card */}
      <Card style={{ flexDirection: "row", alignItems: "center", gap: 14, padding: 16 }}>
        <View style={{ width: 42, height: 42, borderRadius: Radii.lg, backgroundColor: colors.accent.primary + "20", alignItems: "center", justifyContent: "center" }}>
          <Feather name="shopping-bag" size={20} color={colors.accent.primary} />
        </View>
        <View>
          <Text style={{ fontSize: Typography.size.xs, color: colors.text.tertiary, fontFamily: Typography.fontBold, letterSpacing: 1 }}>{t("МАГАЗИН", "DO'KON")}</Text>
          <Text style={{ fontSize: Typography.size.base, fontFamily: Typography.fontBold, color: colors.text.primary, marginTop: 2 }}>{shopName}</Text>
        </View>
      </Card>

      {/* Payment method */}
      <Card style={{ padding: Spacing.base }}>
        <Text style={{ fontSize: Typography.size.xs, color: colors.text.tertiary, fontFamily: Typography.fontBold, letterSpacing: 1, marginBottom: Spacing.md }}>{t("СПОСОБ ОПЛАТЫ", "TO'LOV USULI")}</Text>
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
          <Text style={{ flex: 3, fontSize: Typography.size.xs, fontFamily: Typography.fontBold, color: colors.text.tertiary, letterSpacing: 0.5 }}>{t("ТОВАР", "MAHSULOT")}</Text>
          <Text style={{ flex: 1, fontSize: Typography.size.xs, fontFamily: Typography.fontBold, color: colors.text.tertiary, textAlign: "right" }}>{t("КОЛ", "SONI")}</Text>
          <Text style={{ flex: 2, fontSize: Typography.size.xs, fontFamily: Typography.fontBold, color: colors.text.tertiary, textAlign: "right" }}>{t("СУММА", "SUMMA")}</Text>
        </View>
        {lines.map(l => {
          const total = l.unitPrice * Number(l.quantity || 0) * (1 - Number(l.discount || 0) / 100);
          return (
            <View key={l.productId} style={{ flexDirection: "row", paddingHorizontal: Spacing.base, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border.subtle }}>
              <View style={{ flex: 3, gap: 2 }}>
                <Text style={{ fontSize: Typography.size.sm, color: colors.text.secondary }} numberOfLines={1}>{l.name}</Text>
                {Number(l.discount) > 0 && <Text style={{ fontSize: Typography.size.xs, color: colors.status.success }}>−{l.discount}% {t("скидка", "chegirma")}</Text>}
              </View>
              <Text style={{ flex: 1, fontSize: Typography.size.sm, color: colors.text.secondary, textAlign: "right" }}>{l.quantity}</Text>
              <Text style={{ flex: 2, fontSize: Typography.size.sm, fontFamily: Typography.fontSemibold, color: colors.text.primary, textAlign: "right" }}>{total.toLocaleString("ru")}</Text>
            </View>
          );
        })}
        {/* Total */}
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: Spacing.base, paddingVertical: 14, backgroundColor: colors.accent.primary + "10" }}>
          <Text style={{ fontSize: Typography.size.xs, fontFamily: Typography.fontBold, color: colors.text.secondary, letterSpacing: 0.5 }}>{t(`ИТОГО — ${lines.length} поз., ${totalQty} ед.`, `JAMI — ${lines.length} ta pozitsiya, ${totalQty} birlik`)}</Text>
          <Text style={{ fontSize: Typography.size.base, fontFamily: Typography.fontBold, color: colors.accent.primary }}>{subtotal.toLocaleString("ru")} {t("сум", "so'm")}</Text>
        </View>
      </Card>
      {/* Notes */}
      <Card style={{ gap: 8, padding: Spacing.base }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Feather name="edit-3" size={14} color={colors.text.tertiary} />
          <Text style={{ fontSize: Typography.size.sm, fontFamily: Typography.fontSemibold, color: colors.text.secondary }}>{t("Примечания", "Izohlar")}</Text>
          <Text style={{ fontSize: Typography.size.xs, color: colors.text.tertiary }}>{t("необязательно", "ixtiyoriy")}</Text>
        </View>
        <TextInput value={notes} onChangeText={onNotesChange} placeholder={t("Комментарий к заказу…", "Buyurtmaga izoh…")} placeholderTextColor={colors.text.tertiary} multiline numberOfLines={3} textAlignVertical="top"
          style={{ backgroundColor: colors.bg.elevated, borderRadius: Radii.md, ...soft(isDark).inset, padding: Spacing.base, fontSize: Typography.size.base, fontFamily: Typography.fontRegular, color: colors.text.primary, minHeight: 80 }} />
      </Card>
      {/*
        Обещанный срок — последним, рядом с примечаниями: это то, что агент
        договаривает уже на выходе из магазина, а не выбирает вместе с
        товаром.
      */}
      <Card style={{ padding: Spacing.base }}>
        <PromisedDelivery value={promisedAt} onChange={onPromisedChange} />
      </Card>
    </View>
  );
}

// ── Draft auto-save ──────────────────────────────────────────────────────────
const DRAFT_KEY = "order_draft";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCartStore } from "../../src/store/cart";

interface OrderDraft {
  shop: Shop | null;
  lines: OrderLine[];
  notes: string;
  paymentMethod: string;
  /* Необязательное: черновики, сохранённые до появления срока, обязаны
     восстанавливаться по-прежнему. */
  promisedAt?: string | null;
  savedAt: number;
}

async function saveDraft(draft: Omit<OrderDraft, "savedAt">) {
  try {
    await AsyncStorage.setItem(DRAFT_KEY, JSON.stringify({ ...draft, savedAt: Date.now() }));
  } catch { /* ignore */ }
}

async function loadDraft(): Promise<OrderDraft | null> {
  try {
    const raw = await AsyncStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as OrderDraft;
    // Expire after 24 hours
    if (Date.now() - draft.savedAt > 24 * 60 * 60 * 1000) {
      await AsyncStorage.removeItem(DRAFT_KEY);
      return null;
    }
    return draft;
  } catch { return null; }
}

async function clearDraft() {
  try { await AsyncStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
}

// ── Main Screen ──────────────────────────────────────────────────────────────
export default function NewOrderScreen() {
  const router = useRouter();
  const colors = useThemeColors();
  const { isDark } = useThemeStore();
  const insets = useSafeAreaInsets();
  const t = useT();
  const params = useLocalSearchParams<{ shopId?: string; shopName?: string; productId?: string; productName?: string; productPrice?: string; productQty?: string; fromCart?: string }>();
  const { addOrder } = useOfflineStore();

  const [step, setStep] = useState(params.productId ? 1 : params.shopId ? 2 : 1);
  const [selectedShop, setSelectedShop] = useState<Shop | null>(
    params.shopId ? ({ id: Number(params.shopId), name: params.shopName ?? "" } as Shop) : null
  );
  const [rawLines, setLines] = useState<OrderLine[]>(() => {
    // Из корзины каталога: строки набраны там, здесь — магазин, оплата, отправка.
    if (params.fromCart) return useCartStore.getState().lines.map(l => ({ ...l }));
    if (params.productId && params.productPrice) {
      // Остаток со сканера не приходит, поэтому здесь честное «не знаю», а не
      // ноль. Ноль на этом месте гасил кнопку «Продолжить» и рисовал агенту
      // «Остаток: 0 (превышено!)» на товар, который он держал в руках.
      // Настоящее значение дочитывается ниже из каталога.
      // Количество приходит с экрана товара; сканер его не передаёт — тогда одна.
      const qty = Math.floor(Number(params.productQty));
      return [{ productId: Number(params.productId), name: params.productName ?? "", unitPrice: Number(params.productPrice), quantity: qty > 0 ? String(qty) : "1", discount: "0", available: null }];
    }
    return [];
  });
  const [notes, setNotes] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  /*
    Когда обещали привезти. null и остаётся null, пока агент не нажал сам:
    подставленный срок был бы его обещанием магазину, которого он не давал,
    и просрочкой, которой не было.
  */
  const [promisedAt, setPromisedAt] = useState<string | null>(null);
  /**
   * Когда экран открыт с уже выбранным магазином или товаром, черновик не
   * спрашивается вовсе — значит проверка пройдена сразу, и это начальное
   * состояние, а не то, что должен выставить эффект после первого кадра.
   */
  const skipDraft = !!(params.shopId || params.productId || params.fromCart);
  const [draftChecked, setDraftChecked] = useState(skipDraft);
  // Generated once per order attempt and reused for both the initial online
  // submission and any offline-queue retry — if the server actually created
  // the order but the response was lost (timeout/network blip), retrying with
  // the SAME key makes the backend return the existing order instead of a duplicate.
  const idempotencyKeyRef = useRef<string | null>(null);

  /**
   * Дочитывание товара, пришедшего со сканера штрих-кода.
   *
   * Экран сканера отдаёт только id, название и цену — остатка среди параметров
   * маршрута нет, и подставить его неоткуда. Берётся он тем же запросом
   * каталога и под тем же ключом кэша, что и в ручном выборе товара
   * (ProductPicker), поэтому лишнего похода в сеть не будет: если каталог уже
   * открывали, ответ придёт из кэша, а если нет — этот запрос пригодится
   * выбору товара.
   *
   * Заодно обновляется цена: сканер передал ту, что была на экране сканера, а
   * каталог отвечает текущей.
   */
  const seededProductId = params.productId ? Number(params.productId) : null;
  const { data: catalog } = useQuery({
    queryKey: ["products"],
    queryFn: () => getProducts(),
    enabled: seededProductId != null && Number.isFinite(seededProductId),
  });

  /**
   * Строки заказа с подставленным остатком.
   *
   * Подстановка сделана вычислением при отрисовке, а не записью в состояние из
   * эффекта: состояние принадлежит агенту (он правит количество и скидку), и
   * дописывать в него ответ сети — лишний круг перерисовок и лишний источник
   * правды. Дополняются только строки, у которых остаток неизвестен, то есть
   * пришедшие со сканера; выбранные вручную уже несут остаток из каталога.
   */
  const lines = useMemo(() => {
    if (!catalog || rawLines.length === 0) return rawLines;
    let enriched = false;
    const next = rawLines.map(l => {
      if (l.available != null) return l;
      const product = catalog.find(p => p.id === l.productId);
      if (!product) return l;
      enriched = true;
      return {
        ...l,
        name: l.name || product.name,
        unitPrice: Number(product.unitPrice) || l.unitPrice,
        available: parseStock(product.available),
        unit: l.unit ?? product.unit,
      };
    });
    return enriched ? next : rawLines;
  }, [rawLines, catalog]);

  // Check for saved draft on mount
  useEffect(() => {
    if (skipDraft) return;
    loadDraft().then(draft => {
      if (draft && draft.lines.length > 0) {
        const forShop = draft.shop ? t(` для ${draft.shop.name}`, `: ${draft.shop.name}`) : "";
        Alert.alert(
          t("Продолжить черновик?", "Qoralamani davom ettirasizmi?"),
          t(`Найден неотправленный заказ${forShop} (${draft.lines.length} товаров)`, `Yuborilmagan buyurtma topildi${forShop} (${draft.lines.length} ta mahsulot)`),
          [
            { text: t("Начать заново", "Yangidan boshlash"), style: "cancel", onPress: () => clearDraft() },
            { text: t("Продолжить", "Davom etish"), onPress: () => {
              setSelectedShop(draft.shop);
              setLines(draft.lines);
              setNotes(draft.notes);
              setPaymentMethod(draft.paymentMethod);
              setPromisedAt(draft.promisedAt ?? null);
              setStep(draft.shop ? 2 : 1);
            }},
          ]
        );
      }
      setDraftChecked(true);
    });
  }, []);

  // Auto-save draft when data changes
  useEffect(() => {
    if (!draftChecked || lines.length === 0) return;
    const timer = setTimeout(() => {
      saveDraft({ shop: selectedShop, lines, notes, paymentMethod, promisedAt });
    }, 2000);
    return () => clearTimeout(timer);
  }, [selectedShop, lines, notes, paymentMethod, promisedAt, draftChecked]);

  // The backend only accepts one order-level discount percentage (per-line
  // discounts aren't stored server-side) and recomputes subtotal itself from
  // current catalog prices. Collapse the per-line percents shown on screen
  // into the single equivalent percentage, so the amount actually charged
  // matches the discounted total the agent showed the shop owner. Shared by
  // both the online submit and the offline-queue fallback below.
  const overallDiscountPercent = useMemo(() => {
    const rawSubtotal = lines.reduce((s, l) => s + l.unitPrice * Number(l.quantity || 0), 0);
    const discountedSubtotal = lines.reduce((s, l) => s + l.unitPrice * Number(l.quantity || 0) * (1 - Math.max(0, Number(l.discount || 0)) / 100), 0);
    return rawSubtotal > 0 ? ((rawSubtotal - discountedSubtotal) / rawSubtotal) * 100 : 0;
  }, [lines]);

  /**
   * Сумма, которую агент видит на экране и называет владельцу магазина.
   *
   * Считается так же, как в ReviewStep: цена × количество со скидкой по
   * строке. Отдельно здесь потому, что ReviewStep — другой компонент, и его
   * значение сюда не доходит.
   */
  const quotedTotal = useMemo(
    () => lines.reduce((sum, l) => sum + l.unitPrice * Number(l.quantity || 0) * (1 - Number(l.discount || 0) / 100), 0),
    [lines],
  );

  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: createOrder,
    onSuccess: (created) => {
      clearDraft();
      // Заказ ушёл — корзина каталога выполнила своё.
      useCartStore.getState().clear();
      // Списки заказов надо пометить устаревшими, иначе агент вернётся на
      // вкладку и не увидит только что созданного: вкладки не размонтируются,
      // пока сверху лежит этот экран, а у запроса ["myOrders"] выдержка две
      // минуты. Заказ на сервере есть, на экране его нет — и агент оформляет
      // второй. В быстром заказе из каталога это давно сделано, здесь забыли.
      queryClient.invalidateQueries({ queryKey: ["myOrders"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Скидка выше порога: заказ оформлен, но ждёт офиса — сказать это сразу,
      // иначе агент ждёт курьера по заказу, который никто не подтвердил.
      if (created?.held) notify.info(t("Заказ оформлен и ждёт подтверждения офиса — скидка выше порога", "Buyurtma rasmiylashtirildi va ofis tasdig'ini kutmoqda — chegirma chegaradan yuqori"));
      else notify.success(t("Заказ создан!", "Buyurtma yaratildi!"));
      router.back();
    },
    onError: async (e: Error) => {
      // Разбор ошибки отдан общей функции, которая уже умеет отличать отказ
      // сервера от неудачи доставки запроса.
      //
      // Здесь стояла своя проверка, и она искала в тексте подстроку
      // "status 5". Axios пишет "Request failed with status code 502" — между
      // "status" и "5" стоит слово "code", и подстрока не совпадала никогда.
      // То есть при ответе 502 (перезапуск сервера, шлюз) заказ НЕ попадал в
      // офлайн-очередь: агент видел непонятную ошибку, черновик оставался, а
      // ключ идемпотентности жил только в памяти экрана. Повторный ввод
      // получал новый ключ — и если первый запрос на сервере всё-таки прошёл,
      // в офисе появлялись два одинаковых заказа с двойным списанием склада.
      //
      // Ровно эта ошибка описана и исправлена в самой очереди
      // (src/store/offline.ts), но точка входа сохраняла старую копию.
      if (isRetryableError(e) && selectedShop) {
        const offlineOrder = { id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, input: { shopId: selectedShop.id, notes, paymentMethod: paymentMethod as "cash" | "card" | "transfer" | "debt", idempotencyKey: idempotencyKeyRef.current ?? undefined, promisedDeliveryAt: promisedAt ?? undefined, discount: overallDiscountPercent, items: lines.map(l => ({ productId: l.productId, quantity: Number(l.quantity), unitPrice: l.unitPrice, discount: Number(l.discount || 0) })) }, shopName: selectedShop.name ?? "", createdAt: new Date().toISOString(), synced: false, quotedTotal };
        const queued = await addOrder(offlineOrder);
        if (!queued) {
          // Запись очереди на диск не удалась — на рабочих телефонах кончается
          // место. Заказ остался только в памяти и не переживёт выгрузки
          // приложения системой, а происходит она сама, пока телефон лежит в
          // кармане.
          //
          // Раньше здесь безусловно звался clearDraft() и router.back(), а
          // тост «Заказ сохранён офлайн» затирал предупреждение о нехватке
          // места. Агент уходил уверенным, что заказ сохранён, и терял его
          // целиком: ни черновика, ни записи в очереди. Теперь черновик
          // остаётся, экран не закрывается, а сказано это модальным окном —
          // тост следующее сообщение перекрывает, окно нужно закрыть рукой.
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          Alert.alert(
            t("Заказ НЕ сохранён", "Buyurtma SAQLANMADI"),
            t("На телефоне нет места, заказ не записался. Он остался на экране как черновик — освободите место и попробуйте снова или продиктуйте заказ в офис. Не закрывайте экран.", "Telefonda joy yo'q, buyurtma yozilmadi. U ekranda qoralama sifatida qoldi — joy bo'shatib, qayta urinib ko'ring yoki buyurtmani ofisga aytib bering. Ekranni yopmang."),
          );
          return;
        }
        clearDraft();
        useCartStore.getState().clear();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        // Про цену сказано прямо: сервер посчитает итог по своим ценам на
        // момент отправки, а не по тем, что агент видел сейчас. Если за это
        // время прайс поменяется, после синхронизации придёт отдельное
        // сообщение с обеими суммами.
        notify.info(t("Ошибка сети. Заказ сохранён офлайн. Итог будет пересчитан по ценам на момент отправки.", "Tarmoq xatosi. Buyurtma oflayn saqlandi. Jami yuborish paytidagi narxlar bo'yicha qayta hisoblanadi."));
        router.back();
      } else {
        notify.error(e.message ?? t("Ошибка", "Xatolik"));
      }
    },
  });

  // No `l.available > 0` guard: a line whose catalog stock is genuinely 0 must
  // still be caught here, not silently let through because "0 > 0" is false.
  //
  // Строки с неизвестным остатком (available === null) не блокируются: остаток
  // не «ноль», его просто ещё нет. Проверку всё равно повторит сервер при
  // создании заказа — а вот молча запретить агенту оформить отсканированный
  // товар нельзя, из-за этого весь путь от сканера был непроходим.
  const quantityError = lines.find(l => l.available != null && Number(l.quantity) > 0 && Number(l.quantity) > l.available);
  const canNext = step === 1 ? !!selectedShop : step === 2 ? lines.length > 0 && lines.every(l => Number(l.quantity) > 0) && !quantityError : true;

  /**
   * Почему кнопка «Продолжить» неактивна.
   *
   * Раньше кнопка просто гасла, и догадываться приходилось самому — а на шаге
   * товаров причин четыре. Агент у полки читал единственную подсказку рядом,
   * «Остаток: 0 (превышено!)», как «товара нет на складе» и уходил.
   */
  const blockedReason = canNext ? null
    : step === 1 ? t("Выберите магазин", "Do'konni tanlang")
    : step === 2
      ? lines.length === 0 ? t("Добавьте хотя бы один товар", "Kamida bitta mahsulot qo'shing")
        : quantityError ? t(`«${quantityError.name}»: на складе ${quantityError.available}, в заказе ${quantityError.quantity}`, `«${quantityError.name}»: omborda ${quantityError.available}, buyurtmada ${quantityError.quantity}`)
        : t("Укажите количество больше нуля для каждого товара", "Har bir mahsulot uchun noldan katta miqdor kiriting")
      : null;

  const handleSubmit = async () => {
    if (!selectedShop) return;
    if (!idempotencyKeyRef.current) idempotencyKeyRef.current = uuidv4();
    const input = {
      shopId: selectedShop.id, notes, paymentMethod: paymentMethod as "cash" | "card" | "transfer" | "debt",
      idempotencyKey: idempotencyKeyRef.current,
      promisedDeliveryAt: promisedAt ?? undefined,
      discount: overallDiscountPercent,
      items: lines.map(l => ({ productId: l.productId, quantity: Number(l.quantity), unitPrice: l.unitPrice, discount: Math.max(0, Number(l.discount || 0)) })),
    };
    createMutation.mutate(input);
  };

  return (
    // Клавиатура закрывала поля, у которых её и открывают.
    //
    // На шаге 2 поля «КОЛ-ВО» и «СКИДКА» стоят у нижних позиций списка, на
    // шаге 3 «Примечания» — в самом низу. Агент нажимал поле, клавиатура
    // выезжала и накрывала его вместе с кнопкой «Далее»: набирать
    // приходилось вслепую или прокручивать список пальцем поверх клавиатуры.
    //
    // На других экранах приложения обёртка уже стоит — login, shop/new,
    // deliver, планы супервайзера. Сюда, в самый частый экран агента, не
    // добавили.
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg.primary }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      {/* Header */}
      <View style={{ paddingTop: insets.top + Spacing.sm, paddingHorizontal: Spacing.base, paddingBottom: Spacing.md }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <TouchableOpacity onPress={() => step > 1 ? setStep(s => s - 1) : router.back()}
            style={{ width: 36, height: 36, borderRadius: Radii.md, backgroundColor: colors.bg.elevated, ...soft(isDark).raised, alignItems: "center", justifyContent: "center" }}>
            <Feather name="arrow-left" size={18} color={colors.text.primary} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: Typography.size.lg, fontFamily: Typography.fontBold, color: colors.text.primary }}>{t("Новый заказ", "Yangi buyurtma")}</Text>
            {selectedShop && step > 1 && <Text style={{ fontSize: Typography.size.xs, color: colors.text.secondary, marginTop: 1 }}>{selectedShop.name}</Text>}
          </View>
        </View>
      </View>

      {/* Step indicator */}
      <StepIndicator step={step} total={3} colors={colors} />

      {/* Content */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 140 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {step === 1 && <ShopPicker selectedId={selectedShop?.id ?? 0} onSelect={(s) => { setSelectedShop(s); setStep(2); addRecentShopSafely(s.id); }} colors={colors} />}
        {step === 2 && <ProductStep lines={lines} onChange={setLines} colors={colors} shopId={selectedShop?.id} />}
        {step === 3 && <ReviewStep shopName={selectedShop?.name ?? ""} lines={lines} notes={notes} onNotesChange={setNotes} paymentMethod={paymentMethod} onPaymentChange={setPaymentMethod} promisedAt={promisedAt} onPromisedChange={setPromisedAt} colors={colors} />}
      </ScrollView>

      {/* Bottom CTA */}
      <View style={{ padding: Spacing.base, paddingBottom: safeBottomPadding(insets.bottom, 16), borderTopWidth: 1, borderTopColor: colors.border.default, backgroundColor: colors.bg.secondary }}>
        {step < 3 ? (
          <>
          {blockedReason && (
            <Text style={{ fontSize: Typography.size.xs, color: colors.text.secondary, textAlign: "center", marginBottom: 8 }}>{blockedReason}</Text>
          )}
          <PressableScale onPress={() => { setStep(s => s + 1); }} disabled={!canNext} haptic="medium">
            <View style={{ backgroundColor: colors.accent.primary, borderRadius: Radii.md, padding: 16, alignItems: "center", opacity: canNext ? 1 : 0.45 }}>
              <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.md, color: colors.brand.ink }}>{t("Продолжить →", "Davom etish →")}</Text>
            </View>
          </PressableScale>
          </>
        ) : (
          <PressableScale onPress={handleSubmit} disabled={createMutation.isPending} haptic="medium">
            <View style={{ backgroundColor: colors.accent.primary, borderRadius: Radii.md, padding: 16, alignItems: "center", opacity: createMutation.isPending ? 0.6 : 1 }}>
              {createMutation.isPending ? (
                <ActivityIndicator color={colors.brand.ink} size="small" />
              ) : (
                <Text style={{ fontFamily: Typography.fontBold, fontSize: Typography.size.md, color: colors.brand.ink }}>{t("Подтвердить заказ", "Buyurtmani tasdiqlash")}</Text>
              )}
            </View>
          </PressableScale>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}
