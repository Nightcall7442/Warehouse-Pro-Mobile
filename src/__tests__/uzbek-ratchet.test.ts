/**
 * Русские строки без узбекской пары — храповик.
 *
 * Мобилка была целиком по-русски: ни словаря, ни переключателя. Теперь есть
 * t("ru", "uz") (src/i18n.ts), и каждая строка интерфейса обязана идти парой.
 * Проверить это глазами на собранном APK нельзя, поэтому здесь считается,
 * сколько в каждом файле осталось русских строковых литералов вне t()/tt():
 * число не должно расти, а уменьшив его — опустите запись в
 * uzbek-baseline.json, чтобы русские строки не вернулись. Файл, которого в
 * записи нет, обязан быть переведён целиком (ноль).
 *
 * Эвристика по строкам кода: комментарии вырезаны; литерал считается
 * переведённым, если на той же строке раньше него стоит t( или tt(.
 * Ложные срабатывания (например, кириллица в regExp) — исключайте точечно
 * комментарием `// i18n-ignore` на той же строке.
 */
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";
import baseline from "./uzbek-baseline.json";

const root = join(__dirname, "..", "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && !/\.d\.ts$/.test(name)) out.push(p);
  }
  return out;
}

const FILES = [
  ...walk(join(root, "app")),
  ...walk(join(root, "src", "components")),
  ...walk(join(root, "src", "store")),
  ...walk(join(root, "src", "lib")),
  ...walk(join(root, "src", "hooks")),
].map(p => relative(root, p).replace(/\\/g, "/")).sort();

const CYR = /[А-Яа-яЁё]/;
const LITERAL = /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g;

/** Сколько русских литералов вне t()/tt() в файле. */
export function untranslatedCount(source: string): number {
  const text = source
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, " "))   // блочные комментарии — пробелами, строки на месте
    .replace(/^\s*\/\/.*$/gm, "");                                   // строчные комментарии целиком
  let n = 0;
  for (const rawLine of text.split("\n")) {
    if (rawLine.includes("i18n-ignore")) continue;
    const line = rawLine.replace(/\/\/.*$/, "");
    for (const m of line.matchAll(LITERAL)) {
      if (!CYR.test(m[0])) continue;
      const before = line.slice(0, m.index);
      // t("…", "…") / tt("…", "…") / Alert.alert(t("…" — пара уже есть
      if (/\bt{1,2}\(\s*$/.test(before) || /\bt{1,2}\([^)]*$/.test(before)) continue;
      n++;
    }
  }
  return n;
}

describe("русские строки без узбекской пары", () => {
  const counts: Record<string, number> = {};
  for (const f of FILES) counts[f] = untranslatedCount(readFileSync(join(root, f), "utf8"));
  const known = baseline as Record<string, number>;

  it("не растут ни в одном файле; новый файл — сразу двуязычный", () => {
    const grew = FILES.filter(f => counts[f] > (known[f] ?? 0)).map(f => `${f}: ${counts[f]} (было ${known[f] ?? 0})`);
    // jest: expect принимает один аргумент — сообщение через throw.
    if (grew.length) throw new Error("русских строк без пары стало больше — оберните в t(ru, uz):\n" + grew.join("\n"));
    expect(grew).toEqual([]);
  });

  it("стало меньше — опустите запись, чтобы они не вернулись", () => {
    const fell = FILES.filter(f => f in known && counts[f] < known[f]).map(f => `${f}: ${counts[f]} (в записи ${known[f]})`);
    if (fell.length) throw new Error("в uzbek-baseline.json запись выше факта — опустите:\n" + fell.join("\n"));
    expect(fell).toEqual([]);
  });

  it("запись не держит файлов, которых нет", () => {
    const gone = Object.keys(known).filter(f => !FILES.includes(f));
    expect(gone).toEqual([]);
  });
});
