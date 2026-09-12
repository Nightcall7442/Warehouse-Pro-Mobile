/**
 * Корзина внутри выбора товара: «− n +» в списке, скан прибавляет единицу,
 * итог внизу окна. Было: товар клался с количеством 1, менять его можно
 * было только закрыв окно, — двадцать позиций означали двадцать открытий.
 */
import { readFileSync } from "fs";
import { bumpLine, findScanned, cartSummary, type CartLine } from "../lib/cart";

const p = { id: 7, name: "Печенье", unitPrice: "12000", available: "50", unit: "pcs", code: "A-1", barcode: "4870001234567" };

describe("bumpLine", () => {
  it("первый плюс заводит строку, следующие прибавляют, минус до нуля убирает", () => {
    let lines: CartLine[] = [];
    lines = bumpLine(lines, p, 1);
    expect(lines).toEqual([expect.objectContaining({ productId: 7, quantity: "1", unitPrice: 12000, available: 50 })]);
    lines = bumpLine(lines, p, 1);
    expect(lines[0].quantity).toBe("2");
    lines = bumpLine(lines, p, -1);
    lines = bumpLine(lines, p, -1);
    expect(lines).toEqual([]);
  });

  it("минус на товар, которого нет в корзине, ничего не делает", () => {
    expect(bumpLine([], p, -1)).toEqual([]);
  });

  it("не трогает соседние строки и их скидки", () => {
    const other: CartLine = { productId: 1, name: "Сок", unitPrice: 8000, quantity: "3", discount: "10", available: 5 };
    const lines = bumpLine([other], p, 1);
    expect(lines[0]).toBe(other);
    expect(lines).toHaveLength(2);
  });
});

describe("findScanned", () => {
  const catalog = [p, { id: 8, name: "Сок", unitPrice: "8000", available: "5", code: "B-2", barcode: null }];
  it("по штрих-коду поставщика и по коду товара, без регистра и пробелов", () => {
    expect(findScanned(catalog, "4870001234567")?.id).toBe(7);
    expect(findScanned(catalog, " b-2 ")?.id).toBe(8);
    expect(findScanned(catalog, "0000")).toBeUndefined();
  });
});

describe("cartSummary", () => {
  it("считает позиции и сумму со скидкой по строке", () => {
    const lines: CartLine[] = [
      { productId: 1, name: "a", unitPrice: 1000, quantity: "2", discount: "0", available: null },
      { productId: 2, name: "b", unitPrice: 500, quantity: "4", discount: "50", available: null },
    ];
    expect(cartSummary(lines)).toEqual({ count: 2, total: 3000 });
    expect(cartSummary([])).toEqual({ count: 0, total: 0 });
  });
});

describe("экран выбора товара", () => {
  const src = readFileSync("app/order/new.tsx", "utf-8");
  it("степпер у добавленного, итог с «Готово», камера рядом с поиском", () => {
    expect(src).toContain("testID={`stepper-plus-${p.id}`}");
    expect(src).toContain("testID={`stepper-minus-${p.id}`}");
    expect(src).toContain('testID="picker-summary"');
    expect(src).toContain('testID="picker-done"');
    expect(src).toContain('testID="picker-scan"');
    expect(src).toContain("onBarcodeScanned={onScanned}");
    // повтор одного кода в кадре — через паузу, а не десять раз подряд
    expect(src).toContain("now - lastScan.current.at < 1500");
  });
});
