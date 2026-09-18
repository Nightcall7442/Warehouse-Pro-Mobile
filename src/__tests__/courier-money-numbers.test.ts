/**
 * Три числа, которые врали.
 *
 * Экран сдачи: Number("150,50") — NaN; курьер видел «Укажите сумму оплаты»
 * при сумме на экране и «NaN» в долге — уже после того, как товар отдан.
 * Главная курьера: «Доставлено 0 · Прогресс 0 %» весь день — список отдаёт
 * только не довезённое. Зарплата: «Остаток» за квартал = квартал минус
 * выдачи за месяц — число, которого никто не должен.
 */
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(p, "utf8");

describe("экран сдачи", () => {
  it("сумму разбирает parseAmount, не Number; клавиатура с десятичным знаком", () => {
    const src = read("app/order/deliver.tsx");
    expect(src).not.toMatch(/Number\(paidAmount/);
    expect(src.match(/parseAmount\(paidAmount\)/g)?.length).toBeGreaterThanOrEqual(3);
    expect(src).toContain('keyboardType="decimal-pad"');
    expect(read("src/lib/delivery-validation.ts")).toContain("parseAmount(form.paidAmount)");
  });
});

describe("главная курьера", () => {
  it("довезённое за день — из KPI за «сегодня», не из списка не довезённого", () => {
    const src = read("app/(tabs)/index.tsx");
    expect(src).toContain('getCourierKpi("today")');
    expect(src).toContain("const delivered = todayKpi?.delivered ?? 0;");
    expect(src).not.toContain('d.deliveryStatus === "delivered"');
  });
});

describe("зарплата", () => {
  it("«Выдано / Остаток» — только за месяц; иначе подсказка", () => {
    const src = read("app/salary.tsx");
    expect(src).toContain('{period === "month" ? (');
    expect(src).toContain("Выдано и остаток считаются по месяцу");
  });
});
