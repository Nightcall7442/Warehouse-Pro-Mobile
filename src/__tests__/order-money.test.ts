/**
 * Деньги заказа считаются одинаково на всех трёх экранах.
 *
 * Формула была выписана в app/order/new.tsx четыре раза, и ни одна копия не
 * проверялась. Здесь проверяется одна — та, которую теперь зовут все четыре
 * места; расхождение между корзиной и экраном подтверждения стало невозможным
 * по построению, а не по внимательности.
 *
 * Случаи взяты не из головы: так набирают в поле, одной рукой, на цифровой
 * клавиатуре.
 */
import { describe, it, expect } from "@jest/globals";
import {
  parseAmount,
  clampDiscount,
  clampQty,
  lineTotal,
  lineTotalBeforeDiscount,
  orderTotals,
} from "../lib/order-money";

describe("число из поля ввода", () => {
  it("пустое поле — ноль, а не NaN", () => {
    expect(parseAmount("")).toBe(0);
    expect(parseAmount(null)).toBe(0);
    expect(parseAmount(undefined)).toBe(0);
  });

  it("одна точка — ноль", () => {
    /*
      На цифровой клавиатуре точка стоит рядом с цифрами, и набрать её первой
      легко. Number(".") — это NaN, и раньше он уезжал в сумму строки: и она,
      и ИТОГО показывали «NaN». Экран переставал показывать деньги вовсе.
    */
    expect(parseAmount(".")).toBe(0);
    expect(parseAmount("-")).toBe(0);
    expect(parseAmount("abc")).toBe(0);
  });

  it("запятая читается как разделитель дробной части", () => {
    // Русская раскладка даёт запятую; Number("2,5") — это NaN.
    expect(parseAmount("2,5")).toBe(2.5);
    expect(parseAmount("2.5")).toBe(2.5);
  });

  it("отрицательное не принимается", () => {
    expect(parseAmount("-3")).toBe(0);
    expect(parseAmount(-3)).toBe(0);
  });
});

describe("возвращённое количество", () => {
  /*
    Поле возврата на экране доставки. Курьер набирает его одной рукой, стоя в
    магазине, и ошибка отсюда уходит на склад как факт.
  */
  it("дробное принимается — и с точкой, и с запятой", () => {
    // Раньше поле переписывало себя на каждом нажатии: «1.» → 1 → «1», и
    // дробное количество ввести было нельзя вовсе.
    expect(clampQty("2.5", 10)).toBe(2.5);
    expect(clampQty("2,5", 10)).toBe(2.5);
  });

  it("пустое поле и одна точка — ноль", () => {
    expect(clampQty("", 10)).toBe(0);
    expect(clampQty(".", 10)).toBe(0);
    expect(clampQty("0", 10)).toBe(0);
    expect(clampQty(undefined, 10)).toBe(0);
  });

  it("больше заказанного вернуть нельзя", () => {
    expect(clampQty("12", 10)).toBe(10);
    expect(clampQty("10,5", 10)).toBe(10);
  });

  it("минус не проходит: кнопка «−» на нуле оставляет ноль", () => {
    expect(clampQty("-1", 10)).toBe(0);
    expect(clampQty(-1, 10)).toBe(0);
  });
});

describe("скидка", () => {
  it("больше ста процентов не бывает", () => {
    /*
      Агент набирает «150» вместо «15». Без ограничения множитель становится
      −0.5, строка уходит в минус и УМЕНЬШАЕТ общий счёт заказа — а заказ на
      эту сумму уезжает на сервер.
    */
    expect(clampDiscount("150")).toBe(100);
    expect(lineTotal({ unitPrice: 1000, quantity: "2", discount: "150" })).toBe(0);
  });

  it("сумма строки никогда не отрицательна", () => {
    for (const d of ["101", "999", "1e9", "-20"]) {
      expect(lineTotal({ unitPrice: 1000, quantity: "3", discount: d })).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("сумма строки", () => {
  it("считается по цене, количеству и скидке", () => {
    expect(lineTotal({ unitPrice: 1000, quantity: "3", discount: "10" })).toBe(2700);
  });

  it("без скидки — просто цена на количество", () => {
    expect(lineTotal({ unitPrice: 1000, quantity: "3" })).toBe(3000);
    expect(lineTotalBeforeDiscount({ unitPrice: 1000, quantity: "3", discount: "10" })).toBe(3000);
  });

  it("дробное количество считается верно", () => {
    // Весовой товар: 2.5 кг по 12 000.
    expect(lineTotal({ unitPrice: 12000, quantity: "2,5" })).toBe(30000);
  });
});

describe("итог заказа", () => {
  it("складывает строки и количество", () => {
    const { subtotal, totalQty } = orderTotals([
      { unitPrice: 1000, quantity: "3", discount: "10" },
      { unitPrice: 500, quantity: "2" },
    ]);
    expect(subtotal).toBe(3700);
    expect(totalQty).toBe(5);
  });

  it("одна незаполненная строка не портит весь итог", () => {
    /*
      Ровно тот случай, ради которого всё это писалось: агент добавил товар и
      не успел набрать количество. Раньше пустая или испорченная строка давала
      NaN, и ИТОГО показывало «NaN» — при том, что остальные позиции набраны.
    */
    const { subtotal, totalQty } = orderTotals([
      { unitPrice: 1000, quantity: "3" },
      { unitPrice: 700, quantity: "." },
      { unitPrice: 700, quantity: "" },
    ]);
    expect(subtotal).toBe(3000);
    expect(totalQty).toBe(3);
    expect(Number.isNaN(subtotal)).toBe(false);
  });

  it("пустой заказ — ноль, а не NaN", () => {
    expect(orderTotals([])).toEqual({ subtotal: 0, totalQty: 0 });
  });
});
