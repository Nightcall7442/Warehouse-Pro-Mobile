/**
 * Проверка формы «Результат доставки».
 *
 * Экран написан целиком — частичная оплата, срок долга, четыре исхода,
 * возврат по позициям, — и был заперт двумя способами сразу.
 *
 * Первый: попасть на него было нельзя. Маршрут order/deliver зарегистрирован,
 * а перехода на него не было ни одного во всём приложении.
 *
 * Второй, который здесь и проверяется: самый частый исход нельзя было
 * подтвердить. Поле «Сумма оплаты» рисуется только для ЧАСТИЧНОЙ оплаты, а
 * проверка требовала его и для полной:
 *
 *     if ((result === "paid" || result === "partial_paid") && Number(paidAmount || 0) <= 0)
 *
 * «Оплачен полностью» — исход по умолчанию. Курьер жал «Завершить», получал
 * «Укажите сумму оплаты» и не находил на экране поля, о котором речь.
 */
import { validateDeliveryForm, type DeliveryFormState } from "../lib/delivery-validation";

const form = (over: Partial<DeliveryFormState> = {}): DeliveryFormState => ({
  result: "paid",
  paidAmount: "",
  orderTotal: 500_000,
  returnedItemsCount: 0,
  ...over,
});

describe("оплачен полностью", () => {
  it("подтверждается без ввода суммы — поля для неё на экране нет", () => {
    // Ровно тот случай, который был заблокирован наглухо.
    expect(validateDeliveryForm(form({ result: "paid", paidAmount: "" }))).toBeNull();
  });

  it("нулевой заказ полной оплатой не закрыть", () => {
    // Платить не за что, а отметка «оплачен» закрыла бы долг, которого нет.
    expect(validateDeliveryForm(form({ result: "paid", orderTotal: 0 })))
      .toBe("У заказа нулевая сумма — отметьте «не оплачен»");
  });
});

describe("оплачен частично", () => {
  it("без суммы не проходит — поле для неё на экране есть", () => {
    expect(validateDeliveryForm(form({ result: "partial_paid", paidAmount: "" })))
      .toBe("Укажите сумму оплаты");
  });

  it("нулевая сумма не проходит", () => {
    expect(validateDeliveryForm(form({ result: "partial_paid", paidAmount: "0" })))
      .toBe("Укажите сумму оплаты");
  });

  it("сумма меньше итога — проходит", () => {
    expect(validateDeliveryForm(form({ result: "partial_paid", paidAmount: "200000" }))).toBeNull();
  });

  it("сумма, равная итогу, — это полная оплата, а не частичная", () => {
    // Пропустив её, получили бы заказ с долгом в ноль и пометкой «частично».
    expect(validateDeliveryForm(form({ result: "partial_paid", paidAmount: "500000" })))
      .toBe("При частичной оплате сумма должна быть меньше итого");
  });

  it("сумма больше итога тоже не проходит", () => {
    expect(validateDeliveryForm(form({ result: "partial_paid", paidAmount: "600000" })))
      .toBe("При частичной оплате сумма должна быть меньше итого");
  });
});

describe("остальные исходы", () => {
  it("не оплачен — суммы не требует", () => {
    expect(validateDeliveryForm(form({ result: "unpaid" }))).toBeNull();
  });

  it("полный возврат — суммы не требует", () => {
    expect(validateDeliveryForm(form({ result: "returned" }))).toBeNull();
  });

  it("частичный возврат без единой позиции не проходит", () => {
    expect(validateDeliveryForm(form({ result: "partial_returned", returnedItemsCount: 0 })))
      .toBe("Укажите возвращённое количество хотя бы одного товара");
  });

  it("частичный возврат с позицией проходит", () => {
    expect(validateDeliveryForm(form({ result: "partial_returned", returnedItemsCount: 1 }))).toBeNull();
  });
});

describe("экран доступен из приложения", () => {
  it("на order/deliver есть хотя бы один переход", () => {
    // Первая половина беды: экран существовал, но открыть его было нельзя.
    // Маршрут зарегистрирован в app/_layout.tsx, а router.push на него не
    // делал никто — 496 строк готовой работы лежали мёртвым грузом.
    const fs = require("node:fs") as typeof import("node:fs");
    const path = require("node:path") as typeof import("node:path");

    const roots = ["app", "src"];
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.tsx?$/.test(entry.name) && !full.includes("__tests__")) {
          const src = fs.readFileSync(full, "utf8");
          if (src.includes("/order/deliver") && /router\.(push|navigate|replace)/.test(src)) {
            hits.push(full);
          }
        }
      }
    };
    // От корня проекта, а не от файла теста: jest запускается из корня, а
    // __dirname в собранном виде указывает не туда, где лежат исходники.
    for (const r of roots) walk(path.resolve(process.cwd(), r));
    if (hits.length === 0) {
      throw new Error(
        "Ни один экран не ведёт на order/deliver. Курьеру снова доступны только " +
          "«Доставлено» и «Не доставлено», а частичная оплата, срок долга и " +
          "возврат по позициям недостижимы. Искали в: " +
          roots.map(r => path.resolve(process.cwd(), r)).join(", "),
      );
    }

    // Сообщение о поломке даёт throw выше: у Jest expect принимает ровно
    // один аргумент, и привычная по vitest форма expect(value, "текст") здесь
    // не молчит, а падает с «Expect takes at most one argument».
    expect(hits.length).toBeGreaterThan(0);

  });
});
