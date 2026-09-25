import { readFileSync } from "fs";
import { join } from "path";

/**
 * Итоги «План / Факт» в «Показателях» супервайзера читаются целиком.
 *
 * 25.09.2026: в карточке на треть ширины полные суммы обрезались
 * «41 400 00…» (в вебе) или ужимались до мелкого (на телефоне). Теперь число
 * сжатое, как в MonthlyPlanCard — «41,4 млн сум», знак валюты по настройке
 * арендатора; поля карточки 8, шрифт 14 — так «41,4 млн сум» влезает.
 * Карта «Трекинг» в веб-сборке проверяется поведением в audit-screens.
 *
 * Нарочная поломка: верни formatMoney(totalTarget) — падает.
 */
const src = readFileSync(join(__dirname, "..", "..", "app", "(tabs)", "targets.tsx"), "utf8").replace(/\r\n/g, "\n");

describe("итоги «Показателей»", () => {
  it("«План/Факт» — сжатым числом со знаком валюты арендатора", () => {
    expect(src).toContain("{withCurrency(money(totalTarget))}");
    expect(src).toContain("{withCurrency(money(totalActual))}");
    expect(src).not.toContain("formatMoney(totalTarget)");
    expect(src).toMatch(/symbolPosition === "before" \? `\$\{currencySymbol\} \$\{v\}`/);
  });
});
