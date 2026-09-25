import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";

/**
 * Нижние шторки не уходят под системную панель.
 *
 * Жалоба владельца: «кнопки некоторых андроидов, где внизу таббар телефона,
 * невозможно нажать, скрыты». Android в SDK 57 рисует приложение от края до
 * края, прозрачная Modal — тоже, и шторка с bottom: 0 без insets клала свою
 * последнюю кнопку под «назад / домой / недавние». Генеральная проверка
 * перед APK 25.09.2026 нашла пять таких: «Готово» в выборе товара, «Почему
 * не доставлено?» у курьера, «Не разрешаю» в согласии на геолокацию,
 * «Сохранить» в правке заказа, рабочие зоны в магазинах.
 *
 * Правило: у каждой шторки (Modal с flex-end или bottom: 0) внутри блока
 * есть insets.bottom или safeBottomPadding.
 *
 * Нарочная поломка: в FailReasonSheet верни paddingBottom: Spacing.xxl —
 * падает, называя deliveries.tsx.
 */
const ROOT = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap(f => {
    const p = join(dir, f);
    if (f === "__tests__" || f === "node_modules") return [];
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".tsx") ? [p] : [];
  });
}
const FILES = [...walk(join(ROOT, "app")), ...walk(join(ROOT, "src"))];

describe("шторки и системная панель", () => {
  it("у каждой нижней шторки есть отступ под системную панель", () => {
    const bad: string[] = [];
    let sheets = 0;
    for (const f of FILES) {
      const t = read(f);
      for (const m of t.matchAll(/<Modal\b/g)) {
        const end = t.indexOf("</Modal>", m.index);
        const block = t.slice(m.index, end > 0 ? end : undefined);
        const isSheet = /justifyContent:\s*"flex-end"/.test(block) || /position:\s*"absolute",\s*bottom:\s*0/.test(block);
        if (!isSheet) continue;
        sheets++;
        if (!/insets\.bottom|safeBottomPadding/.test(block)) {
          bad.push(`${relative(ROOT, f)}:${t.slice(0, m.index).split("\n").length}`);
        }
      }
    }
    expect(sheets).toBeGreaterThanOrEqual(6);
    expect(bad).toEqual([]);
  });
});
