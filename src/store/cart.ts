import { create } from "zustand";
import { bumpLine, cartSummary, type CartLine } from "../lib/cart";

/*
  Корзина каталога: строки копятся на телефоне, заказ оформляется один раз.

  Значок корзины на карточке товара выглядел как «положить в корзину», а на
  деле сразу создавал заказ на ОДИН товар: магазин → способ оплаты →
  «Подтвердить». Хозяин магазина называл пять позиций — агент, нажимая
  корзину пять раз, создавал пять заказов на один магазин: в офисе пять
  накладных, курьеру пять строк, долг раздроблен. Теперь корзина копит
  строки, а внизу каталога — «В заказе: 3 товара · 120 000 → Оформить», и
  это обычный экран нового заказа с готовыми строками.

  Живёт в памяти: черновик самого заказа хранит уже экран заказа.
*/
interface CartState {
  lines: CartLine[];
  add: (p: { id: number; name: string; unitPrice: string; available?: string | null; unit?: string }, delta?: number) => void;
  clear: () => void;
}

export const useCartStore = create<CartState>((set, get) => ({
  lines: [],
  add: (p, delta = 1) => set({ lines: bumpLine(get().lines, p, delta) }),
  clear: () => set({ lines: [] }),
}));

/** Сколько позиций и на сколько — для плашки внизу каталога. */
export function useCartSummary(): { count: number; total: number; units: number } {
  const lines = useCartStore(s => s.lines);
  const { count, total } = cartSummary(lines);
  return { count, total, units: lines.reduce((n, l) => n + Number(l.quantity || 0), 0) };
}
