import { readFileSync } from "fs";
import { join } from "path";
import { LightColors } from "../theme";

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

/*
  Экспортный контроль: приложение шифрует только HTTPS — это освобождённая
  категория. Без явного «false» каждая сборка в App Store Connect висит с
  «Missing Compliance», и в TestFlight её не раздать, пока не ответишь руками.
*/
/*
  Заставка при запуске. SDK 57 верхнее поле splash больше не читает (схема
  его отвергает), а плагин expo-splash-screen без параметров не делает
  ничего — и сборка 25.09.2026 клала шаблонную заглушку Expo (серая сетка с
  кругами) на белый фон вместо знака на бирюзе. Нашёл expo-doctor и prebuild.
  Там же нативный primaryColor — им Android красит системные диалоги и
  курсор полей; держится цвета знака из темы, а не прежней бирюзы.

  Нарочная поломка: верни "splash" наверх и плагин строкой — падает первый;
  поставь primaryColor "#0d9488" — второй.
*/
describe("заставка и нативный цвет", () => {
  const raw = JSON.parse(readFileSync(join(root, "app.json"), "utf8")) as { expo: Record<string, unknown> & { plugins: Array<string | [string, Record<string, unknown>]> } };

  it("заставка задана в плагине: знак на бирюзе, мёртвого splash нет", () => {
    expect(raw.expo.splash).toBeUndefined();
    const sp = raw.expo.plugins.find(p => Array.isArray(p) && p[0] === "expo-splash-screen") as [string, Record<string, unknown>] | undefined;
    expect(sp).toBeTruthy();
    expect(sp![1].image).toBe("./assets/splash.png");
    expect(sp![1].backgroundColor).toBe("#0f5e57");
    expect(Number(sp![1].imageWidth)).toBeGreaterThanOrEqual(150);
  });

  it("primaryColor — цвет знака из темы", () => {
    expect(String(raw.expo.primaryColor).toLowerCase()).toBe(LightColors.brand.primary.toLowerCase());
  });
});

describe("экспортный контроль", () => {
  it("ITSAppUsesNonExemptEncryption = false объявлен в infoPlist", () => {
    const app = JSON.parse(readFileSync(join(__dirname, "../../app.json"), "utf8"));
    expect(app.expo.ios.infoPlist.ITSAppUsesNonExemptEncryption).toBe(false);
  });
});
