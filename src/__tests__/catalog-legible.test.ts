import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";

/**
 * Каталог читается: чипы категорий видны, плашка наличия читается на фото.
 *
 * 25.09.2026 кадр каталога для лендинга: ряд категорий сжался в полоску и
 * ушёл под фото, а «В наличии» зелёным по прозрачной подложке пропадало на
 * арбузе и мясе.
 *
 * Лента: у ScrollView по умолчанию flex-сжатие, и горизонтальная лента в
 * колонке рядом со списком flex: 1 отдаёт ему свою высоту. Правило общее:
 * у каждой горизонтальной ленты flexGrow: 0 — высота по содержимому.
 *
 * Плашка: status.* в теме — заливки, *Dim прозрачен на 87 %. Поверх фото
 * подложка непрозрачная (bg.card), надпись — основными чернилами, цвет
 * состояния несёт точка.
 *
 * Нарочная поломка: убери flexGrow у ленты категорий — падает первый; верни
 * плашке successDim — второй.
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
const FILES = [...walk(join(ROOT, "app")), ...walk(join(ROOT, "src", "components"))];

describe("каталог читается", () => {
  it("у каждой горизонтальной ленты flexGrow: 0", () => {
    const bad: string[] = [];
    let seen = 0;
    for (const f of FILES) {
      // horizontal может стоять не первым пропом — ищется внутри всего тега.
      for (const m of read(f).matchAll(/<ScrollView\b[^>]*\bhorizontal\b[^>]*>/g)) {
        seen++;
        if (!/flexGrow:\s*0/.test(m[0])) bad.push(`${relative(ROOT, f)}: ${m[0].slice(0, 90)}`);
      }
    }
    expect(seen).toBeGreaterThanOrEqual(6);
    expect(bad).toEqual([]);
  });

  it("плашка наличия на фото — непрозрачная, надпись основными чернилами", () => {
    const src = read(join(ROOT, "app", "(tabs)", "catalog.tsx"));
    // Комментарий над плашкой сам называет successDim — сверяется только код.
    const badge = src.slice(src.indexOf("{/* Stock badge"), src.indexOf("{/* В корзину")).replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
    expect(badge.length).toBeGreaterThan(100);
    expect(badge).toContain("backgroundColor: colors.bg.card");
    expect(badge).not.toMatch(/successDim|dangerDim/);
    expect(badge).toMatch(/<Text style=\{\{ color: colors\.text\.primary/);
  });
});
