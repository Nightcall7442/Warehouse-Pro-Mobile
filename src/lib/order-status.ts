/**
 * Названия статусов заказа — одним местом.
 *
 * ── Что было ────────────────────────────────────────────────────────────────
 *
 * Таблиц было две, и они разошлись словами. На экране заказа
 * (src/components/order/OrderStyles.tsx) — «В обработке», «В ожидании»,
 * «Возврат частично», «Возврат (магазин)». На главной и в ленте заказов
 * (app/(tabs)/index.tsx) — «В работе», «Ожидает», «Частичный возврат».
 *
 * Агент видел заказ на главной как «В работе», открывал его — и читал
 * «В обработке». Он думал, что статус сменился, пока он листал.
 *
 * Хуже другое: `partially_returned` (товар вернулся на склад) и
 * `partial_return_kept` (товар остался в магазине) на главной подписаны одним
 * и тем же словом «Частичный возврат». Это разные состояния и разные деньги, а
 * по ленте их не отличить.
 *
 * Плюс «Отгружён» через ё на одном экране и «Отгружен» на другом — верно
 * второе.
 *
 * ── Почему только название и плоский цвет ───────────────────────────────────
 *
 * STATUS_CONFIG на экране заказа — не словарь названий, а связка с градиентом,
 * значком, видом плашки и номером шага; тянуть её на главную значит тянуть
 * туда весь модуль оформления заказа, а диаграмме на главной нужен один
 * плоский цвет, а не градиент из двух. Поэтому здесь лежат ровно две вещи,
 * нужные всем: слово и цвет. Оформление каждый экран строит своё, но читает
 * слово отсюда.
 *
 * Цвета — те самые шестнадцатеричные, что стояли на главной. Они не следуют за
 * темой; так было и до переноса, и менять это здесь значит менять вид главной,
 * а не чинить расхождение названий.
 */

/*
  Русское слово лежит в `label`, узбекское — в `uz`; строки помечены
  i18n-ignore, потому что пара уже здесь, а выбирает язык orderStatusLabel().
  `label` остаётся русским ради экранов, читающих его напрямую.
*/
import { tt } from "../i18n";

export const ORDER_STATUSES: Record<string, { label: string; uz: string; color: string }> = {
  new:        { label: "Новый",       uz: "Yangi",         color: "#5b6d8a" }, // i18n-ignore: пара ru/uz
  processing: { label: "В обработке", uz: "Jarayonda",     color: "#d4973a" }, // i18n-ignore: пара ru/uz
  shipped:    { label: "Отгружен",    uz: "Yuklandi",      color: "#4a9de8" }, // i18n-ignore: пара ru/uz
  pending:    { label: "В ожидании",  uz: "Kutishda",      color: "#d4973a" }, // i18n-ignore: пара ru/uz
  delivered:  { label: "Доставлен",   uz: "Yetkazildi",    color: "#34c473" }, // i18n-ignore: пара ru/uz
  cancelled:  { label: "Отменён",     uz: "Bekor qilindi", color: "#d45050" }, // i18n-ignore: пара ru/uz
  returned:   { label: "Возврат",     uz: "Qaytarildi",    color: "#d45050" }, // i18n-ignore: пара ru/uz
};

/**
 * Состояние доставки.
 *
 * Было выписано дважды — на вкладке доставок и на главной курьера, — и в обеих
 * копиях не хватало «not_assigned». Заказ без назначенного курьера показывался
 * словом «not_assigned».
 */
export const DELIVERY_STATUSES: Record<string, string> = {
  not_assigned:     "Не назначен", // i18n-ignore: узбекская пара в DELIVERY_STATUSES_UZ
  assigned:         "Назначен",    // i18n-ignore: узбекская пара в DELIVERY_STATUSES_UZ
  out_for_delivery: "В пути",      // i18n-ignore: узбекская пара в DELIVERY_STATUSES_UZ
  delivered:        "Доставлен",   // i18n-ignore: узбекская пара в DELIVERY_STATUSES_UZ
  failed:           "Ошибка",      // i18n-ignore: узбекская пара в DELIVERY_STATUSES_UZ
};

/** Те же состояния по-узбекски; ключи — те же, что выше (проверяется тестом). */
export const DELIVERY_STATUSES_UZ: Record<string, string> = {
  not_assigned:     "Tayinlanmagan",
  assigned:         "Tayinlangan",
  out_for_delivery: "Yo'lda",
  delivered:        "Yetkazildi",
  failed:           "Xatolik",
};

/** Слово состояния доставки на языке телефона. Незнакомый код — как есть. */
export function deliveryStatusLabel(status: string | null | undefined): string {
  const code = status ?? "";
  const ru = DELIVERY_STATUSES[code];
  if (ru == null) return status ?? "—";
  return tt(ru, DELIVERY_STATUSES_UZ[code] ?? ru);
}

/**
 * Способы оплаты.
 *
 * Три копии в приложении и расхождение с вебом: здесь «Перевод», там
 * «Перечисление». Слово взято веб-овское — оно же уходит в накладную.
 */
export const PAYMENT_METHODS: Record<string, string> = {
  cash:     "Наличные",     // i18n-ignore: узбекская пара в PAYMENT_METHODS_UZ
  card:     "Карта",        // i18n-ignore: узбекская пара в PAYMENT_METHODS_UZ
  transfer: "Перечисление", // i18n-ignore: узбекская пара в PAYMENT_METHODS_UZ
  debt:     "Долг",         // i18n-ignore: узбекская пара в PAYMENT_METHODS_UZ
};

/** Те же способы по-узбекски — слова веба (entity-labels): naqd, plastik, o'tkazma, qarz. */
export const PAYMENT_METHODS_UZ: Record<string, string> = {
  cash:     "Naqd",
  card:     "Plastik",
  transfer: "O'tkazma",
  debt:     "Qarz",
};

/** Способ оплаты на языке телефона. Незнакомый код — как есть. */
export function paymentMethodLabel(method: string | null | undefined): string {
  const code = method ?? "";
  const ru = PAYMENT_METHODS[code];
  if (ru == null) return method ?? "—";
  return tt(ru, PAYMENT_METHODS_UZ[code] ?? ru);
}

/** Слово, которым статус зовут на всех экранах, на языке телефона. Незнакомый код — как есть. */
export function orderStatusLabel(status: string | null | undefined): string {
  const s = ORDER_STATUSES[status ?? ""];
  return s ? tt(s.label, s.uz) : status ?? "—";
}

/** Плоский цвет статуса: для точек в ленте и полос на диаграмме. */
export function orderStatusColor(status: string | null | undefined): string {
  return ORDER_STATUSES[status ?? ""]?.color ?? ORDER_STATUSES.new.color;
}
