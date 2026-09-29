/*
  «Как в прошлый раз» и «Повторить» — чистые помощники, без экрана.

  Сервер (order.repeatDraft) отдаёт товар и количество; цену и ступени
  строки берёт каталог магазина — тот же, по которому агент набирает руками
  (lib/cart.ts, lib/price-tiers.ts). Так у строки из подсказки и у строки,
  набранной плюсом, одно правило цены, а заказ уходит той же дорогой.
*/
import { parseStock, type CartLine } from "./cart";
import type { PriceTier } from "./price-tiers";

/** «В прошлый раз»: среднее количество товара по последним заказам магазина. */
export interface LastTimeHint {
  productId: number;
  quantity: string;
  orders: number;
}

/** Товар каталога — ровно то, что нужно строке корзины. */
export interface CatalogItem {
  id: number;
  name: string;
  unitPrice: string;
  available?: string | null;
  unit?: string;
  tiers?: readonly PriceTier[] | null;
}

export function lastTimeMap(hints: readonly LastTimeHint[] | null | undefined): Map<number, LastTimeHint> {
  return new Map((hints ?? []).map(h => [h.productId, h]));
}

export interface FillResult {
  lines: CartLine[];
  /** Сколько товаров положено из подсказки. */
  added: number;
  /** Уже были в корзине — количество агента не тронуто. */
  kept: number;
  /** Нет на складе или нет в каталоге магазина — не положены. */
  missing: number;
}

/**
 * Корзина по подсказке — ДОПОЛНЕНИЕМ.
 *
 * Товар, который агент уже набрал, не трогается: его количество — слово
 * магазина на сегодня, и одно нажатие не должно молча его переписать.
 * Кладутся только недостающие, с подсказанным количеством. Нажал дважды —
 * корзина та же. Товар с нулём на складе не кладётся (как и «+» в окне
 * выбора глохнет на нуле): сервер отказал бы всему заказу. Товара нет в
 * каталоге — положить нечем: цены магазина для него нет.
 */
export function fillLikeLastTime(lines: readonly CartLine[], hints: readonly LastTimeHint[] | null | undefined, catalog: readonly CatalogItem[] | null | undefined): FillResult {
  const byId = new Map((catalog ?? []).map(p => [p.id, p]));
  const next: CartLine[] = [...lines];
  let added = 0, kept = 0, missing = 0;
  for (const h of hints ?? []) {
    if (!(Number(h.quantity) > 0)) continue;
    if (next.some(l => l.productId === h.productId)) { kept++; continue; }
    const p = byId.get(h.productId);
    const stock = p ? parseStock(p.available) : null;
    if (!p || (stock != null && stock <= 0)) { missing++; continue; }
    next.push({
      productId: p.id, name: p.name, unitPrice: Number(p.unitPrice),
      quantity: h.quantity, discount: "0", available: stock, unit: p.unit, tiers: p.tiers ?? null,
    });
    added++;
  }
  return { lines: next, added, kept, missing };
}

// ── «Повторить» из карточки заказа: черновик → параметры маршрута → строки ──

/** Строка черновика повтора (api.ts, RepeatDraftLine) — поля, которые нужны корзине. */
interface DraftLine {
  productId: number;
  name: string;
  unit: string;
  quantity: string;
  unitPrice: string;
  available: string;
}

/**
 * Параметры экрана нового заказа для повтора.
 *
 * Строки едут строкой JSON: маршрут принимает только строки. Цена в них —
 * при количестве строки; каталог магазина на экране заказа переставит её
 * вместе со ступенями, как у любой строки.
 */
export function repeatParams(d: { shop: { id: number; name: string }; source: { orderNumber: string } | null; lines: readonly DraftLine[]; skipped: ReadonlyArray<{ name: string }> }): Record<string, string> {
  return {
    shopId: String(d.shop.id),
    shopName: d.shop.name,
    repeatOf: d.source?.orderNumber ?? "",
    repeatLines: JSON.stringify(d.lines.map(l => ({
      productId: l.productId, name: l.name, unit: l.unit, quantity: l.quantity, unitPrice: l.unitPrice, available: l.available,
    }))),
    repeatSkipped: JSON.stringify(d.skipped.map(s => s.name)),
  };
}

/** Строки корзины из параметра repeatLines. Мусор — пустая корзина, а не падение экрана. */
export function linesFromRepeatParam(raw: string | undefined): CartLine[] {
  if (!raw) return [];
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return []; }
  if (!Array.isArray(parsed)) return [];
  const out: CartLine[] = [];
  for (const r of parsed as Partial<DraftLine>[]) {
    const productId = Number(r?.productId);
    if (!Number.isInteger(productId) || productId <= 0 || !(Number(r.quantity) > 0)) continue;
    out.push({
      productId, name: String(r.name ?? ""), unitPrice: Number(r.unitPrice) || 0,
      // «12.00» из базы — «12» в поле: так агент набирает и так видит плюс-минус.
      quantity: String(Number(r.quantity)), discount: "0", available: parseStock(r.available), unit: r.unit,
    });
  }
  return out;
}

/** Имена снятых с продажи из параметра repeatSkipped. */
export function skippedFromParam(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === "string" && s.length > 0) : [];
  } catch {
    return [];
  }
}
