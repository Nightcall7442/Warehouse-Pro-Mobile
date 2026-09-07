/**
 * Дата обещанной доплаты.
 *
 * Курьер пишет её как пишут у нас — «15.09.2026», — а сервер принимает строго
 * ГГГГ-ММ-ДД. Отказ приходил после того, как товар отдан и часть денег взята.
 */
import { describe, it, expect } from "@jest/globals";
import { parseDueDate } from "../lib/due-date";

describe("дата доплаты из поля ввода", () => {
  it("привычный порядок день-месяц-год", () => {
    expect(parseDueDate("15.09.2026")).toBe("2026-09-15");
    expect(parseDueDate("15/09/2026")).toBe("2026-09-15");
    expect(parseDueDate("15 09 2026")).toBe("2026-09-15");
  });

  it("однозначные день и месяц дополняются нулём", () => {
    // «5.9.2026» набирают чаще, чем «05.09.2026».
    expect(parseDueDate("5.9.2026")).toBe("2026-09-05");
  });

  it("уже готовый ISO принимается как есть", () => {
    expect(parseDueDate("2026-09-15")).toBe("2026-09-15");
  });

  it("несуществующая дата не проходит", () => {
    /*
      «31.02.2026» подходит под любой шаблон вида ДД.ММ.ГГГГ — регулярное
      выражение её пропустило бы, а сервер принял бы молча.
    */
    expect(parseDueDate("31.02.2026")).toBeNull();
    expect(parseDueDate("15.13.2026")).toBeNull();
  });

  it("непонятое — это null, а не мусор на сервер", () => {
    expect(parseDueDate("завтра")).toBeNull();
    expect(parseDueDate("15.09")).toBeNull();
    expect(parseDueDate("15.09.26")).toBeNull(); // двузначный год — не угадываем век
    expect(parseDueDate("")).toBeNull();
    expect(parseDueDate(null)).toBeNull();
  });
});
