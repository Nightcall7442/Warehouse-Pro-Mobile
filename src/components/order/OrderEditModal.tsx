import React, { useState, useEffect, useRef } from "react";
import { clampDiscountText } from "../../lib/discount";
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Modal, Pressable, ScrollView, Alert } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useThemeStore } from "../../store/theme";
import { unitShort } from "../../lib/units";
import { useT, useLang } from "../../i18n";
import {
  Typography,
  Spacing,
  Radii,
  Sizes,
  ThemeColors,
  soft,
} from "../../theme";

interface OrderItem {
  id: number;
  productId: number;
  productName: string;
  productCode?: string;
  quantity: number;
  unitPrice: number;
  unit?: string;
}

interface EditableItem extends OrderItem {
  /*
    Товар — чтобы добавленную строку было чем отправить: сервер различает
    правку существующей позиции (itemId) и вставку новой (productId).
  */
  productId: number;
  /** Строка добавлена здесь и на сервере ещё не существует. */
  isNew?: boolean;
  newQuantity: number;
  /**
   * Набранное в поле, как есть.
   *
   * Держать только число нельзя: поле показывало String(newQuantity), и на
   * «12.» разбор давал NaN, то есть точка стиралась в тот же миг, когда её
   * набрали. Дробное количество ввести было невозможно в принципе.
   */
  qtyText: string;
}

interface OrderEditModalProps {
  visible: boolean;
  notes: string;
  discount: string;
  items: OrderItem[];
  saving: boolean;
  onNotesChange: (v: string) => void;
  onDiscountChange: (v: string) => void;
  /*
    Три действия одним списком, как их понимает сервер:
      • изменить количество — { itemId, quantity };
      • убрать позицию      — { itemId, quantity: 0 };
      • добавить товар      — { productId, quantity, unitPrice }.
  */
  onSaveItems: (items: Array<{ itemId?: number; productId?: number; quantity: number; unitPrice?: string }>) => void;
  /** Каталог для добавления товара. Пусто — кнопка «Добавить» просто ждёт. */
  catalog?: Array<{ id: number; name: string; code?: string; unit?: string; unitPrice?: number | string }>;
  /** Экран узнаёт, что каталог понадобился, и грузит его. */
  onNeedCatalog?: () => void;
  onSave: () => void;
  onClose: () => void;
  colors: ThemeColors;
}

export function OrderEditModal({
  visible, notes, discount, items, saving, catalog, onNeedCatalog,
  onNotesChange, onDiscountChange, onSaveItems, onSave, onClose, colors,
}: OrderEditModalProps) {
  const { isDark } = useThemeStore();
  const t = useT();
  const lang = useLang();
  const [editItems, setEditItems] = useState<EditableItem[]>([]);
  const [activeTab, setActiveTab] = useState<"items" | "details">("items");
  /*
    Каталог приходит СВЕРХУ, а не тянется здесь.

    Окно осталось только разметкой: данные берёт экран, который его открывает.
    Так его и проверяют в наборе — рисуют без провайдера запросов, и свой
    useQuery внутри ронял бы пять существующих проверок про количество.

    Открывается по кнопке, и экран грузит каталог только тогда: у организации
    это сотни позиций, а окно открывают ради количества гораздо чаще, чем ради
    нового товара.
  */
  const [picking, setPicking] = useState(false);
  const [search, setSearch] = useState("");
  const found = (catalog ?? []).filter(p =>
    !search.trim() ||
    p.name?.toLowerCase().includes(search.trim().toLowerCase()) ||
    (p.code ?? "").toLowerCase().includes(search.trim().toLowerCase()));

  // Количества заполняются ОДИН раз — при открытии окна.
  //
  // Раньше в зависимостях стоял items, а родитель собирает этот массив заново
  // на каждом рендере (.map() прямо в разметке). Значит эффект срабатывал на
  // любое изменение состояния родителя — в том числе на каждую букву в поле
  // «Заметки», — и молча возвращал количества к исходным.
  //
  // Для агента это выглядело так: правит 12 на 8, переходит на «Детали»,
  // печатает первый символ заметки, возвращается на «Товары» — там снова 12.
  // Ни сообщения, ни следа. Он правит второй раз и теряет снова.
  const wasVisible = useRef(false);
  useEffect(() => {
    if (visible && !wasVisible.current) {
      setEditItems(items.map(item => ({
        ...item,
        newQuantity: item.quantity,
        qtyText: String(item.quantity),
      })));
      setPicking(false);
      setSearch("");
    }
    wasVisible.current = visible;
  }, [visible, items]);

  /**
   * Разбор количества.
   *
   * Здесь стоял parseInt, и любая правка заказа молча округляла дробное
   * количество вниз: 12.5 кг превращались в 12, «плюс» давал 13, «минус» —
   * 11. Ни предупреждения, ни подсветки. Сервер дробное принимает, а экран
   * оформления заказа даже приводит запятую к точке — то есть 12.5 создать
   * можно, а открыть и сохранить тот же заказ нельзя без потери.
   *
   * Запятая приводится к точке: на телефоне с русской раскладкой цифровая
   * клавиатура даёт именно её.
   */
  function updateQuantity(idx: number, qty: string) {
    const text = qty.replace(",", ".");
    const num = Number(text);
    setEditItems(prev => prev.map((it, i) =>
      i === idx
        ? { ...it, qtyText: text, newQuantity: Number.isFinite(num) && num >= 0 ? num : it.newQuantity }
        : it
    ));
  }

  /** Шаг кнопками «плюс» и «минус». Дробную часть сохраняет: 12.5 → 13.5. */
  function stepQuantity(idx: number, delta: number) {
    setEditItems(prev => prev.map((it, i) => {
      if (i !== idx) return it;
      // Округление до сотых: количество в базе хранится с двумя знаками, а
      // сложение чисел с плавающей точкой даёт хвосты вида 13.500000000000002.
      const next = Math.max(0, Math.round((it.newQuantity + delta) * 100) / 100);
      return { ...it, newQuantity: next, qtyText: String(next) };
    }));
  }

  /** Убрать позицию — это количество ноль, а не «не прислать её». */
  function removeItem(idx: number) {
    setEditItems(prev => prev.map((it, i) =>
      i !== idx ? it : { ...it, newQuantity: 0, qtyText: "0" }));
  }

  function restoreItem(idx: number) {
    setEditItems(prev => prev.map((it, i) =>
      i !== idx ? it : { ...it, newQuantity: it.quantity, qtyText: String(it.quantity) }));
  }

  /** Добавить товар из каталога отдельной строкой. */
  function addProduct(p: { id: number; name: string; code?: string; unit?: string; unitPrice?: number | string }) {
    /*
      Тот же товар второй строкой сервер отвергает: резерв по заказу собирается
      одним UPDATE с `CASE WHEN product_id = ...`, и MySQL берёт первый
      совпавший — вторая строка молча не резервировалась бы. Вместо отказа
      после сохранения просто увеличиваем количество той, что уже есть.
    */
    const at = editItems.findIndex(it => it.productId === p.id);
    if (at >= 0) {
      stepQuantity(at, 1);
      setPicking(false);
      setSearch("");
      return;
    }
    setEditItems(prev => [...prev, {
      // Отрицательный ключ: настоящего идентификатора позиции ещё нет, а
      // столкнуться с существующим нельзя.
      id: -(prev.length + 1),
      productId: p.id,
      productName: p.name,
      productCode: p.code,
      unit: p.unit,
      unitPrice: Number(p.unitPrice ?? 0),
      quantity: 0,
      isNew: true,
      newQuantity: 1,
      qtyText: "1",
    }]);
    setPicking(false);
    setSearch("");
  }

  function handleSaveItems() {
    /*
      В заказе должна остаться хотя бы одна позиция — это же правило стоит и на
      сервере. Сказать здесь дешевле, чем получить отказ после сохранения.
    */
    const left = editItems.filter(it => it.newQuantity > 0);
    if (left.length === 0) {
      Alert.alert(t("Пустой заказ", "Bo'sh buyurtma"), t("В заказе должна остаться хотя бы одна позиция. Если заказ не нужен — отмените его целиком.", "Buyurtmada kamida bitta pozitsiya qolishi kerak. Buyurtma kerak bo'lmasa — uni butunlay bekor qiling."));
      return;
    }

    const changed = editItems
      .filter(it => it.isNew ? it.newQuantity > 0 : it.newQuantity !== it.quantity)
      .map(it => it.isNew
        ? { productId: it.productId, quantity: it.newQuantity, unitPrice: String(it.unitPrice) }
        : { itemId: it.id, quantity: it.newQuantity });
    onSaveItems(changed);
  }

  const hasChanges = editItems.some(it => it.isNew ? it.newQuantity > 0 : it.newQuantity !== it.quantity);

  /**
   * Выход из окна.
   *
   * Выйти отсюда было можно единственным способом — нажать мимо панели, — и
   * он молча стирал правки. Ни крестика, ни «Отмена», ни onRequestClose:
   * аппаратная кнопка «назад» на Android в этом окне не делала ВООБЩЕ
   * ничего, потому что без обработчика диалог поглощает событие.
   *
   * Теперь выходов три, и ни один не теряет работу без вопроса.
   */
  function requestClose() {
    if (!hasChanges) {
      onClose();
      return;
    }
    Alert.alert(
      t("Закрыть без сохранения?", "Saqlamasdan yopasizmi?"),
      t("Изменённые количества пропадут.", "O'zgartirilgan miqdorlar yo'qoladi."),
      [
        { text: t("Остаться", "Qolish"), style: "cancel" },
        { text: t("Закрыть", "Yopish"), style: "destructive", onPress: onClose },
      ],
    );
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={requestClose}>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)" }} onPress={requestClose}>
        <Pressable style={{
          position: "absolute", bottom: 0, left: 0, right: 0, maxHeight: "80%",
          backgroundColor: colors.bg.secondary, borderTopLeftRadius: Radii.xxl, borderTopRightRadius: Radii.xxl, padding: Spacing.xl,
        }} onPress={e => e.stopPropagation()}>
          <View style={{ alignItems: "center", paddingBottom: Spacing.md }}>
            <View style={{ width: 40, height: 4, borderRadius: Radii.full, backgroundColor: colors.border.default }} />
          </View>
          {/* Крестика в этом окне не было вовсе: единственным выходом
              оставалось нажатие мимо панели. */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: Spacing.md }}>
            <Text style={{ color: colors.text.primary, fontSize: Typography.size.lg, fontFamily: Typography.fontBold }}>{t("Редактировать заказ", "Buyurtmani tahrirlash")}</Text>
            <TouchableOpacity
              onPress={requestClose}
              // Область нажатия — не меньше 44 точек: попасть пальцем в
              // иконку 18×18 на ходу нельзя.
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={{ width: 32, height: 32, borderRadius: Radii.full, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg.card }}
            >
              <Feather name="x" size={18} color={colors.text.secondary} />
            </TouchableOpacity>
          </View>

          {/* Tabs */}
          <View style={{ flexDirection: "row", marginBottom: Spacing.lg, backgroundColor: colors.bg.card, borderRadius: Radii.md, padding: 3 }}>
            <TouchableOpacity
              onPress={() => setActiveTab("items")}
              style={{
                flex: 1, paddingVertical: 10, borderRadius: Radii.sm,
                backgroundColor: activeTab === "items" ? colors.accent.primary : "transparent",
                alignItems: "center",
              }}
            >
              <Text style={{
                fontSize: Typography.size.sm, fontFamily: Typography.fontSemibold,
                color: activeTab === "items" ? "#fff" : colors.text.tertiary,
              }}>{t("Товары", "Mahsulotlar")}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setActiveTab("details")}
              style={{
                flex: 1, paddingVertical: 10, borderRadius: Radii.sm,
                backgroundColor: activeTab === "details" ? colors.accent.primary : "transparent",
                alignItems: "center",
              }}
            >
              <Text style={{
                fontSize: Typography.size.sm, fontFamily: Typography.fontSemibold,
                color: activeTab === "details" ? "#fff" : colors.text.tertiary,
              }}>{t("Детали", "Tafsilotlar")}</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: "70%" }}>
            {activeTab === "items" ? (
              <View style={{ gap: 12 }}>
                {editItems.map((item, idx) => {
                  const unitLabel = unitShort(item.unit, lang);
                  const removed = !item.isNew && item.newQuantity === 0;
                  const changed = item.isNew || item.newQuantity !== item.quantity;
                  return (
                    <View key={item.id} style={{
                      backgroundColor: colors.bg.card, borderRadius: Radii.lg,
                      ...(changed ? soft(isDark).raisedSm : soft(isDark).inset),
                      padding: 14,
                      // Убранное гаснет: строка на месте, но видно, что её
                      // больше нет в заказе.
                      opacity: removed ? 0.45 : 1,
                    }}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                        <View style={{ flex: 1, marginRight: 10 }}>
                          <Text style={{ color: colors.text.primary, fontSize: Typography.size.sm, fontFamily: Typography.fontMedium }} numberOfLines={2}>
                            {item.productName}
                          </Text>
                          {item.productCode && (
                            <Text style={{ color: colors.text.muted, fontSize: Typography.size.xs, marginTop: 2 }}>
                              {item.productCode}
                            </Text>
                          )}
                          <Text style={{ color: colors.text.tertiary, fontSize: Typography.size.xs, marginTop: 4 }}>
                            {item.quantity} {unitLabel} × {item.unitPrice.toLocaleString("ru")} {t("сум", "so'm")}
                          </Text>
                        </View>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                          {changed && (
                            <View style={{ backgroundColor: colors.accent.primary + "15", paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radii.sm }}>
                              <Text style={{ fontSize: Typography.size.xs, color: colors.accent.primary, fontFamily: Typography.fontSemibold }}>
                                {item.isNew ? t("Добавлено", "Qo'shildi") : removed ? t("Убрано", "Olib tashlandi") : t("Изменено", "O'zgartirildi")}
                              </Text>
                            </View>
                          )}
                          {/*
                            Убранная строка не исчезает, а гаснет с кнопкой
                            «вернуть»: пропади она совсем — человек, нажавший
                            мимо, не понял бы, что произошло, и не смог бы это
                            отменить.
                          */}
                          <TouchableOpacity
                            onPress={() => (removed ? restoreItem(idx) : removeItem(idx))}
                            accessibilityRole="button"
                            accessibilityLabel={removed ? t(`Вернуть ${item.productName}`, `${item.productName} ni qaytarish`) : t(`Убрать ${item.productName}`, `${item.productName} ni olib tashlash`)}
                            hitSlop={8}
                            style={{ width: 32, height: 32, alignItems: "center", justifyContent: "center" }}
                          >
                            <Feather
                              name={removed ? "rotate-ccw" : "trash-2"}
                              size={16}
                              color={removed ? colors.text.secondary : colors.status.danger}
                            />
                          </TouchableOpacity>
                        </View>
                      </View>

                      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                        <TouchableOpacity
                          onPress={() => stepQuantity(idx, -1)}
                          style={{
                            width: 36, height: 36, borderRadius: Radii.md,
                            backgroundColor: colors.bg.elevated, alignItems: "center", justifyContent: "center",
                          }}
                        >
                          <Feather name="minus" size={16} color={colors.text.primary} />
                        </TouchableOpacity>
                        <TextInput
                          value={item.qtyText}
                          onChangeText={(v) => updateQuantity(idx, v)}
                          keyboardType="decimal-pad"
                          style={{
                            flex: 1, textAlign: "center",
                            // Правленое количество отмечается заливкой, а не
                            // обводкой: поле остаётся утопленным в холст, иначе
                            // оно перестало бы читаться как поле.
                            backgroundColor: changed ? colors.accent.primary + "18" : colors.bg.input,
                            borderRadius: Radii.md, ...soft(isDark).inset,
                            padding: 10, color: colors.text.primary,
                            fontSize: Typography.size.md, fontFamily: Typography.fontBold,
                          }}
                        />
                        <TouchableOpacity
                          onPress={() => stepQuantity(idx, 1)}
                          style={{
                            width: 36, height: 36, borderRadius: Radii.md,
                            backgroundColor: colors.bg.elevated, alignItems: "center", justifyContent: "center",
                          }}
                        >
                          <Feather name="plus" size={16} color={colors.text.primary} />
                        </TouchableOpacity>
                        <Text style={{ color: colors.text.muted, fontSize: Typography.size.sm, width: 30 }}>{unitLabel}</Text>
                      </View>

                      {changed && (
                        <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border.subtle }}>
                          <Text style={{ fontSize: Typography.size.xs, color: colors.text.muted }}>
                            {t("Было", "Avval")}: {item.quantity} {unitLabel}
                          </Text>
                          <Text style={{ fontSize: Typography.size.xs, color: colors.text.muted }}>
                            {t("Сумма", "Summa")}: {(item.unitPrice * item.newQuantity).toLocaleString("ru")} {t("сум", "so'm")}
                          </Text>
                        </View>
                      )}
                    </View>
                  );
                })}

                {/* ── Добавить товар ─────────────────────────────────── */}
                {picking ? (
                  <View style={{ gap: 8 }}>
                    <TextInput
                      value={search}
                      onChangeText={setSearch}
                      placeholder={t("Название или код товара", "Mahsulot nomi yoki kodi")}
                      placeholderTextColor={colors.text.muted}
                      autoFocus
                      style={{
                        backgroundColor: colors.bg.card, borderRadius: Radii.md, ...soft(isDark).inset,
                        padding: Spacing.base, color: colors.text.primary, fontSize: Typography.size.base,
                      }}
                    />
                    {(catalog ?? []).length === 0 ? (
                      <ActivityIndicator size="small" color={colors.accent.primary} />
                    ) : found.length === 0 ? (
                      <Text style={{ color: colors.text.tertiary, fontSize: Typography.size.sm }}>{t("Ничего не нашлось", "Hech narsa topilmadi")}</Text>
                    ) : (
                      found.slice(0, 30).map(p => (
                        <TouchableOpacity
                          key={p.id}
                          onPress={() => addProduct(p as { id: number; name: string; code?: string; unit?: string; unitPrice?: number | string })}
                          style={{
                            backgroundColor: colors.bg.card, borderRadius: Radii.md,
                            padding: 12, minHeight: Sizes.touchTarget, justifyContent: "center",
                          }}
                        >
                          <Text style={{ color: colors.text.primary, fontSize: Typography.size.sm, fontFamily: Typography.fontMedium }} numberOfLines={1}>
                            {p.name}
                          </Text>
                          <Text style={{ color: colors.text.muted, fontSize: Typography.size.xs, marginTop: 2 }}>
                            {p.code ? `${p.code} · ` : ""}{Number(p.unitPrice ?? 0).toLocaleString("ru")} {t("сум", "so'm")}
                          </Text>
                        </TouchableOpacity>
                      ))
                    )}
                    <TouchableOpacity
                      onPress={() => { setPicking(false); setSearch(""); }}
                      style={{ padding: 12, alignItems: "center", minHeight: Sizes.touchTarget, justifyContent: "center" }}
                    >
                      <Text style={{ color: colors.text.secondary, fontSize: Typography.size.sm, fontFamily: Typography.fontSemibold }}>{t("Отмена", "Bekor")}</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    onPress={() => { setPicking(true); onNeedCatalog?.(); }}
                    style={{
                      flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
                      backgroundColor: colors.bg.card, borderRadius: Radii.md, ...soft(isDark).raisedSm,
                      minHeight: Sizes.touchTarget, padding: 12,
                    }}
                  >
                    <Feather name="plus" size={16} color={colors.text.secondary} />
                    <Text style={{ color: colors.text.secondary, fontSize: Typography.size.sm, fontFamily: Typography.fontSemibold }}>
                      {t("Добавить товар", "Mahsulot qo'shish")}
                    </Text>
                  </TouchableOpacity>
                )}

                {hasChanges && (
                  <TouchableOpacity onPress={handleSaveItems} disabled={saving}
                    style={{ backgroundColor: colors.accent.primary, borderRadius: Radii.md, padding: 15, alignItems: "center", opacity: saving ? 0.6 : 1 }}>
                    {saving
                      ? <ActivityIndicator size="small" color="#fff" />
                      /* Было «Сохранить количество» — теперь меняется и состав:
                         подпись, называющая треть действия, вводит в
                         заблуждение ровно там, где двигается склад. */
                      : <Text style={{ color: "#fff", fontSize: Typography.size.base, fontFamily: Typography.fontBold }}>{t("Сохранить состав", "Tarkibni saqlash")}</Text>
                    }
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <View style={{ gap: 16 }}>
                <View>
                  <Text style={{ color: colors.text.tertiary, fontSize: Typography.size.sm, marginBottom: 6 }}>{t("Заметки", "Izohlar")}</Text>
                  <TextInput value={notes} onChangeText={onNotesChange} placeholder={t("Заметки к заказу...", "Buyurtmaga izoh...")}
                    placeholderTextColor={colors.text.muted}
                    style={{ backgroundColor: colors.bg.card, borderRadius: Radii.md, ...soft(isDark).inset, padding: Spacing.base, color: colors.text.primary, fontSize: Typography.size.base, minHeight: 60, textAlignVertical: "top" }} multiline />
                </View>
                <View>
                  <Text style={{ color: colors.text.tertiary, fontSize: Typography.size.sm, marginBottom: 6 }}>{t("Скидка (%)", "Chegirma (%)")}</Text>
                  <TextInput value={discount} onChangeText={v => onDiscountChange(clampDiscountText(v))} placeholder="0" keyboardType="decimal-pad"
                    placeholderTextColor={colors.text.muted}
                    style={{ backgroundColor: colors.bg.card, borderRadius: Radii.md, ...soft(isDark).inset, padding: Spacing.base, color: colors.text.primary, fontSize: Typography.size.base }} />
                </View>
                <TouchableOpacity onPress={onSave} disabled={saving}
                  style={{ backgroundColor: colors.accent.primary, borderRadius: Radii.md, padding: 15, alignItems: "center", opacity: saving ? 0.6 : 1 }}>
                  {saving
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={{ color: "#fff", fontSize: Typography.size.base, fontFamily: Typography.fontBold }}>{t("Сохранить детали", "Tafsilotlarni saqlash")}</Text>
                  }
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
