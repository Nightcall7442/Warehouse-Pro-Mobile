/*
  Что курьер делает с точкой маршрута — без экрана, чтобы стенд проверял
  адреса и причины, а не карточки.
*/

import { tt } from "../i18n";

/**
 * Куда ведёт кнопка «На карте».
 *
 * Было: карта открывалась по ТЕКСТУ адреса. В махалле «ул. Навои, 12» —
 * это пять разных домов на карте, а магазин без таблички не находится
 * вовсе; курьер звонил оператору. Координаты точки при этом лежали в том
 * же ответе сервера (shopGpsLat/shopGpsLng) и не использовались.
 *
 * Теперь: есть координаты — маршрут до точки от текущего места
 * (rtext=~lat,lng, пустое начало — «я здесь»); нет — прежний поиск по
 * адресу; нет ни того ни другого — null, и кнопки не будет.
 */
export function mapUrl(point: { shopGpsLat?: string | null; shopGpsLng?: string | null; shopAddress?: string | null; shopCity?: string | null }): string | null {
  const lat = Number(point.shopGpsLat);
  const lng = Number(point.shopGpsLng);
  // Number("") даёт 0 — а нулевые координаты это Гвинейский залив, не магазин.
  if (point.shopGpsLat && point.shopGpsLng && Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0)) {
    return `https://yandex.ru/maps/?rtext=~${lat},${lng}&rtt=auto`;
  }
  if (point.shopAddress) {
    const text = point.shopCity ? `${point.shopAddress}, ${point.shopCity}` : point.shopAddress;
    return `https://yandex.ru/maps/?text=${encodeURIComponent(text)}`;
  }
  return null;
}

/**
 * Причины «не доставлено».
 *
 * Было: отметка уходила без причины — сервер принимает reason, а экран
 * его не спрашивал. Оператор видел «не доставлено» и звонил курьеру
 * узнать, что случилось. Три причины покрывают почти всё; «Другое» —
 * свободный текст.
 */
export const FAIL_REASONS = ["Магазин закрыт", "Нет денег", "Отказался от товара"] as const; // i18n-ignore: уходит на сервер как есть, читает оператор; подпись на экране — failReasonLabel

/**
 * Подпись причины на экране. На сервер уходит русский текст из FAIL_REASONS:
 * его читает оператор в офисе, и там причина должна быть одной на всех.
 */
const FAIL_REASONS_UZ = ["Do'kon yopiq", "Pul yo'q", "Tovarni olmadi"];
export function failReasonLabel(reason: string): string {
  const i = (FAIL_REASONS as readonly string[]).indexOf(reason);
  return tt(reason, FAIL_REASONS_UZ[i] ?? reason);
}

/** Предел сервера (courier.markFailed: reason ≤ 500). */
export const FAIL_REASON_MAX = 500;

/**
 * Что уйдёт на сервер: готовая причина как есть, свой текст — обрезанный и
 * без краёв; пустое — null, отметка без причины не ставится.
 */
export function failReason(choice: string | null, other: string): string | null {
  const text = (choice === "other" ? other : choice ?? "").trim();
  return text ? text.slice(0, FAIL_REASON_MAX) : null;
}
