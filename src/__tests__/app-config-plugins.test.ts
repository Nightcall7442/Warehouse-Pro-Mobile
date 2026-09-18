import { readFileSync } from "fs";
import { join } from "path";

/**
 * Каждый плагин в app.json — установленный пакет.
 *
 * 18.09.2026: expo-sharing удалили из зависимостей, а из plugins — нет; ни
 * типы, ни линтер, ни jest этого не видят, и master покраснел на «Разбор
 * app.json» уже после слияния. Теперь ловится здесь, до пуша.
 */
const root = join(__dirname, "..", "..");
const app = JSON.parse(readFileSync(join(root, "app.json"), "utf8")) as { expo: { plugins: Array<string | [string, unknown]> } };
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { dependencies: Record<string, string> };

describe("плагины app.json", () => {
  it("все объявлены в зависимостях", () => {
    const names = app.expo.plugins.map(p => (typeof p === "string" ? p : p[0])).filter(n => !n.startsWith("./"));
    const missing = names.filter(n => !pkg.dependencies[n]);
    expect(missing).toEqual([]);
  });
});

describe("геолокация в фоне", () => {
  it("включена и на iOS, и на Android — агентов и доставки ведут с обеих платформ", () => {
    const loc = app.expo.plugins.find(p => Array.isArray(p) && p[0] === "expo-location") as [string, Record<string, unknown>] | undefined;
    expect(loc).toBeTruthy();
    // Имя опции — как в плагине expo-location (withLocation.js): «Ios», не «IOS».
    expect(loc![1].isIosBackgroundLocationEnabled).toBe(true);
    expect(loc![1].isAndroidBackgroundLocationEnabled).toBe(true);
  });
});
