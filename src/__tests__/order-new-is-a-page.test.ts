import { readFileSync } from "fs";
import { join } from "path";

/**
 * Новый заказ — страница с одной шапкой.
 *
 * Владелец: «новый заказ не должен модалка, а должна другая страница». При
 * этом в стеке у order/new оставались presentation: "modal" и системная
 * шапка, а экран рисует свою («← Новый заказ», магазин, шаги) — на кадре
 * лендинга 25.09.2026 «Новый заказ» стоял дважды подряд.
 *
 * Нарочная поломка: верни presentation: "modal" — падает первый; убери
 * headerShown: false — тоже первый; убери insets.top из шапки экрана —
 * второй (без системной шапки заголовок уехал бы под часы).
 */
const ROOT = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");

describe("новый заказ — страница", () => {
  it("в стеке без модалки и без системной шапки", () => {
    const line = read("app/_layout.tsx").split("\n").find(l => l.includes('name="order/new"'));
    expect(line).toBeDefined();
    expect(line).toContain("headerShown: false");
    expect(line).not.toContain("presentation");
  });

  it("своя шапка экрана отступает под строку состояния", () => {
    expect(read("app/order/new.tsx")).toMatch(/paddingTop: insets\.top \+ Spacing\.\w+/);
  });
});
