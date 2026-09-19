/**
 * Корзина каталога: строки копятся, заказ оформляется один раз.
 *
 * Значок корзины на карточке выглядел как «положить в корзину», а на деле
 * сразу создавал заказ на ОДИН товар: магазин → способ оплаты → «Подтвердить».
 * Пять позиций — пять заказов на один магазин: в офисе пять накладных,
 * курьеру пять строк, долг раздроблен. Теперь корзина копит строки, внизу
 * каталога — «В заказе: N товаров · сумма → Оформить», а дальше — обычный
 * экран заказа со своей очередью офлайна и сбросом остатков.
 */
import { readFileSync } from "node:fs";
import { useCartStore } from "../store/cart";
import { cartSummary } from "../lib/cart";

const p = (id: number, price = "1000") => ({ id, name: `Товар ${id}`, unitPrice: price, available: "10", unit: "pcs" });

beforeEach(() => useCartStore.getState().clear());

describe("корзина", () => {
  it("копит строки и количества; минус до нуля убирает строку", () => {
    const c = useCartStore.getState();
    c.add(p(1)); c.add(p(1)); c.add(p(2, "500"));
    expect(useCartStore.getState().lines.map(l => [l.productId, l.quantity])).toEqual([[1, "2"], [2, "1"]]);
    expect(cartSummary(useCartStore.getState().lines)).toEqual({ count: 2, total: 2500 });
    c.add(p(2), -1);
    expect(useCartStore.getState().lines.map(l => l.productId)).toEqual([1]);
    c.clear();
    expect(useCartStore.getState().lines).toEqual([]);
  });
});

describe("каталог и экран заказа", () => {
  const catalog = readFileSync("app/(tabs)/catalog.tsx", "utf8");
  const order = readFileSync("app/order/new.tsx", "utf8");

  it("быстрого заказа на одну позицию больше нет: ни выбора магазина, ни оплаты, ни createOrder", () => {
    for (const gone of ["ShopPicker", "PaymentPicker", "createOrder", "pendingProduct"]) expect(catalog).not.toContain(gone);
  });

  it("карточка кладёт в корзину и показывает степпер; внизу плашка с итогом и «Оформить»", () => {
    expect(catalog).toContain("onAdd={() => handleAdd(item, 1)} onRemove={() => handleAdd(item, -1)}");
    expect(catalog).toContain("inCart={inCart.get(item.id) ?? 0}");
    expect(catalog).toContain("{cart.count > 0 && (");
    expect(catalog).toContain('router.push({ pathname: "/order/new", params: { fromCart: "1" } })');
  });

  it("экран заказа берёт строки из корзины и чистит её после отправки — и онлайн, и в очередь", () => {
    expect(order).toContain("if (params.fromCart) return useCartStore.getState().lines.map(l => ({ ...l }));");
    expect(order).toContain("params.shopId || params.productId || params.fromCart");
    expect(order.match(/useCartStore\.getState\(\)\.clear\(\);/g)?.length).toBe(2);
  });
});
