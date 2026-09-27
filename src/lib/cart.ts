/*
  Корзина заказа: чистые помощники, без экрана — чтобы стенд проверял
  арифметику, а не камеру.
*/
import { lineTotal } from "./order-money";
import type { PriceTier } from "./price-tiers";

export interface CartLine {
  productId: number;
  name: string;
  /** Цена при одной штуке; цена строки — linePrice (order-money.ts), со ступенями. */
  unitPrice: number;
  quantity: string;
  discount: string;
  available: number | null;
  unit?: string;
  tiers?: readonly PriceTier[] | null;
}

/** Остаток из каталога: число или «неизвестно». */
export function parseStock(raw: string | number | null | undefined): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function bumpLine(lines: CartLine[], p: { id: number; name: string; unitPrice: string; available?: string | null; unit?: string; tiers?: readonly PriceTier[] | null }, delta: number): CartLine[] {
  const i = lines.findIndex(l => l.productId === p.id);
  if (i < 0) {
    if (delta <= 0) return lines;
    return [...lines, { productId: p.id, name: p.name, unitPrice: Number(p.unitPrice), quantity: String(delta), discount: "0", available: parseStock(p.available), unit: p.unit, tiers: p.tiers }];
  }
  const next = Number(lines[i].quantity || 0) + delta;
  if (next <= 0) return lines.filter((_, k) => k !== i);
  return lines.map((l, k) => (k === i ? { ...l, quantity: String(next) } : l));
}

/** Скан → товар из каталога (по штрих-коду поставщика или коду), без регистра. */
export function findScanned<T extends { code?: string; barcode?: string | null }>(products: T[], code: string): T | undefined {
  const norm = code.trim().toLowerCase();
  return products.find(p => (p.barcode ?? "").toLowerCase() === norm || (p.code ?? "").toLowerCase() === norm);
}

/** Сколько позиций и на сколько — для строки внизу окна; цена по ступеням, как у сервера. */
export function cartSummary(lines: CartLine[]): { count: number; total: number } {
  return {
    count: lines.length,
    total: lines.reduce((s, l) => s + lineTotal(l), 0),
  };
}

