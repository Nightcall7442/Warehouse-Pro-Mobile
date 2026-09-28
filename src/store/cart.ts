import { create } from "zustand";
import { bumpLine, cartSummary, type CartLine } from "../lib/cart";
import { useAuthStore } from "./auth";

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

  Корзина — у каждого своя (по номеру человека). Память процесса переживает
  смену входа: на сменном телефоне Б после входа видел на каталоге «В заказе:
  N товаров → Оформить» с позициями А и оформлял их заказом под собой. Потом
  корзина стала одной с пометкой хозяина — и первое же «+» у Б стирало
  корзину А, а заказ Б её чистил. Теперь Б видит, пополняет и чистит только
  свою, а корзина А ждёт его повторного входа после 401. Без вошедшего строке
  лечь некуда — «+» ничего не делает.
*/
interface CartState {
  /** Строки по номеру человека; читать их может только он (myCartLines). */
  carts: Record<number, CartLine[]>;
  add: (p: { id: number; name: string; unitPrice: string; available?: string | null; unit?: string }, delta?: number) => void;
  /** Опустошить корзину этого человека; по умолчанию — вошедшего. */
  clear: (ownerId?: number) => void;
}

const NONE: CartLine[] = [];

export const useCartStore = create<CartState>((set) => ({
  carts: {},
  add: (p, delta = 1) => {
    const ownerId = useAuthStore.getState().user?.id;
    if (ownerId == null) return;
    set(s => ({ carts: { ...s.carts, [ownerId]: bumpLine(s.carts[ownerId] ?? NONE, p, delta) } }));
  },
  clear: (ownerId = useAuthStore.getState().user?.id) => {
    if (ownerId == null) return;
    set(s => {
      const carts = { ...s.carts };
      delete carts[ownerId];
      return { carts };
    });
  },
}));

/** Строки корзины вошедшего — для экрана заказа. Чужая корзина для него пуста. */
export function myCartLines(): CartLine[] {
  const userId = useAuthStore.getState().user?.id;
  return (userId != null && useCartStore.getState().carts[userId]) || NONE;
}

/** То же, подпиской — для каталога. */
export function useMyCartLines(): CartLine[] {
  const userId = useAuthStore(s => s.user?.id);
  return useCartStore(s => (userId != null && s.carts[userId]) || NONE);
}

/** Сколько позиций и на сколько — для плашки внизу каталога. */
export function useCartSummary(): { count: number; total: number; units: number } {
  const lines = useMyCartLines();
  const { count, total } = cartSummary(lines);
  return { count, total, units: lines.reduce((n, l) => n + Number(l.quantity || 0), 0) };
}
