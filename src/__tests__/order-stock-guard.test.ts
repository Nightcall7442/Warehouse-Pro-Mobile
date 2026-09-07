/**
 * Заказ по отсканированному штрих-коду обязан отправляться.
 *
 * ── Что было ────────────────────────────────────────────────────────────────
 *
 * Со сканера в форму заказа приходили только имя товара и цена — остатка среди
 * них нет. Строке записывали `available: 0`, и проверка «количество больше
 * остатка» срабатывала на первой же единице: кнопка «Далее» гасла, заказ по
 * штрих-коду нельзя было оформить ВООБЩЕ никогда. На экране при этом честно
 * писали «Остаток: 0» — хотя товар на складе был.
 *
 * Разница между «остаток ноль» и «остаток неизвестен» здесь не умозрительная:
 * первое обязано мешать заказу, второе — нет.
 */
import { describe, it, expect } from "@jest/globals";
import { overStock, type StockLine } from "../lib/order-stock";

const line = (over: Partial<StockLine>): StockLine => ({ available: 10, quantity: "1", ...over });

describe("превышение остатка", () => {
  it("неизвестный остаток заказу не мешает", () => {
    expect(overStock(line({ available: null, quantity: "3" }))).toBe(false);
  });

  it("настоящий ноль на складе по-прежнему мешает", () => {
    expect(overStock(line({ available: 0, quantity: "1" }))).toBe(true);
  });

  it("количество в пределах остатка проходит", () => {
    expect(overStock(line({ available: 10, quantity: "10" }))).toBe(false);
  });

  it("количество больше остатка не проходит", () => {
    expect(overStock(line({ available: 10, quantity: "11" }))).toBe(true);
  });

  it("незаполненное количество не считается превышением", () => {
    // Пустое поле — «ещё не набрал», а не «набрал слишком много».
    expect(overStock(line({ available: 0, quantity: "" }))).toBe(false);
    expect(overStock(line({ available: 0, quantity: "." }))).toBe(false);
  });

  it("дробное количество сравнивается верно", () => {
    expect(overStock(line({ available: 2, quantity: "2,5" }))).toBe(true);
    expect(overStock(line({ available: 3, quantity: "2,5" }))).toBe(false);
  });
});
