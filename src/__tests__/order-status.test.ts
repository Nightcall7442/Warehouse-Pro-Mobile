/**
 * Один статус — одно слово на всех экранах.
 *
 * Таблиц названий было две, и они разошлись: «В работе» на главной против «В
 * обработке» на экране заказа. Агент думал, что статус сменился, пока он
 * листал. Проверяется здесь то, что расхождение и породило: полнота списка и
 * различимость двух возвратов.
 */
import { describe, it, expect } from "@jest/globals";
import { ORDER_STATUSES, orderStatusLabel, orderStatusColor } from "../lib/order-status";
import { STATUS_CONFIG } from "../components/order/OrderStyles";

/** Статусы заказа, которые отдаёт сервер (Order.status в src/api.ts). */
const SERVER_STATUSES = [
  "new", "processing", "shipped", "pending", "delivered",
  "cancelled", "returned", "partially_returned", "partial_return_kept",
];

describe("названия статусов", () => {
  it("названы все статусы сервера", () => {
    for (const s of SERVER_STATUSES) {
      // Незнакомый статус вернулся бы сам собой — значит слова для него нет.
      expect(orderStatusLabel(s)).not.toBe(s);
    }
  });

  it("два разных возврата названы по-разному", () => {
    /*
      partially_returned — товар вернулся на склад, partial_return_kept — остался
      в магазине. На главной оба звались «Частичный возврат», и по ленте их было
      не отличить, хотя это разные деньги.
    */
    expect(orderStatusLabel("partially_returned")).not.toBe(orderStatusLabel("partial_return_kept"));
  });

  it("«Отгружен» без ё", () => {
    // Один экран писал «Отгружён», другой «Отгружен»; верно второе.
    expect(orderStatusLabel("shipped")).toBe("Отгружен");
  });

  it("незнакомый статус показывается как есть", () => {
    expect(orderStatusLabel("archived")).toBe("archived");
    expect(orderStatusLabel(null)).toBe("—");
  });

  it("у каждого статуса есть плоский цвет", () => {
    for (const s of SERVER_STATUSES) {
      expect(orderStatusColor(s)).toMatch(/^#[0-9a-f]{6}$/i);
    }
    // Незнакомый — не пустая строка и не «undefined» на экране.
    expect(orderStatusColor("archived")).toBe(ORDER_STATUSES.new.color);
  });
});

describe("экран заказа читает те же слова", () => {
  it("STATUS_CONFIG не заводит своих названий", () => {
    /*
      Из-за собственной таблицы на экране заказа всё и началось. Проверка ловит
      возврат к своим словам: подписи должны совпадать посимвольно.
    */
    for (const s of SERVER_STATUSES) {
      expect(STATUS_CONFIG[s].label).toBe(orderStatusLabel(s));
    }
  });
});
