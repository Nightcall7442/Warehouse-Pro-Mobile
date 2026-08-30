import { clampDiscountText } from "../lib/discount";

/**
 * Скидка — процент, от 0 до 100.
 *
 * Верхней границы в полях не было. Набранная 150 давала на экране
 * ОТРИЦАТЕЛЬНУЮ сумму строки: цена × количество × (1 − 150/100). Агент видел
 * минус там, где ждал стоимость.
 *
 * Отправить такой заказ всё равно не выходило — сервер режет 0–100 в двух
 * местах, — но узнавал об этом агент в самом конце, уже заполнив магазин,
 * товары и количества, и без указания, какая строка виновата.
 */

describe("Ограничение скидки", () => {
  it("обычные значения не трогает", () => {
    expect(clampDiscountText("0")).toBe("0");
    expect(clampDiscountText("5")).toBe("5");
    expect(clampDiscountText("12.5")).toBe("12.5");
    expect(clampDiscountText("100")).toBe("100");
  });

  it("больше ста приводит к ста", () => {
    expect(clampDiscountText("150")).toBe("100");
    expect(clampDiscountText("101")).toBe("100");
    expect(clampDiscountText("99999")).toBe("100");
  });

  it("отрицательное приводит к нулю", () => {
    expect(clampDiscountText("-5")).toBe("0");
    expect(clampDiscountText("-0.1")).toBe("0");
  });

  it("запятая приводится к точке", () => {
    // На телефоне с русской раскладкой цифровая клавиатура даёт запятую.
    expect(clampDiscountText("7,5")).toBe("7.5");
  });

  it("промежуточные состояния набора не ломает", () => {
    // Иначе точку не поставить: «12.» превратилось бы в ноль или в пустоту
    // ровно в тот миг, когда её набрали.
    expect(clampDiscountText("")).toBe("");
    expect(clampDiscountText(".")).toBe(".");
    expect(clampDiscountText("12.")).toBe("12.");
  });

  it("не число превращает в пустоту, а не в мусор", () => {
    expect(clampDiscountText("abc")).toBe("");
    expect(clampDiscountText("1e5")).toBe("100");
  });

  it("после ограничения сумма строки не может уйти в минус", () => {
    // Смысл всей правки: множитель (1 − скидка/100) остаётся неотрицательным.
    for (const raw of ["150", "999", "-40", "abc", "100"]) {
      const d = Number(clampDiscountText(raw) || 0);
      expect(1 - d / 100).toBeGreaterThanOrEqual(0);
    }
  });
});
