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

/*
  Face ID спрашивается по-русски.

  expo-local-authentication стоит в зависимостях (вход по Face ID, BiometricRow),
  а в plugins его не было. Expo подключает плагин сам, но без параметров — и
  iOS спрашивала «Allow Warehouse Pro to use Face ID»: единственная английская
  строка разрешений (снимки для App Store, 03.10.2026; npx expo config --type
  introspect это показывает).

  Нарочная поломка: убери плагин из app.json или переименуй параметр
  (faceIdPermission) — падают обе проверки.
*/
describe("Face ID", () => {
  const raw = JSON.parse(readFileSync(join(root, "app.json"), "utf8")) as { expo: { plugins: Array<string | [string, Record<string, string>]> } };
  const entry = raw.expo.plugins.find(p => Array.isArray(p) && p[0] === "expo-local-authentication") as [string, Record<string, string>] | undefined;

  it("плагин объявлен, строка русская и про Face ID", () => {
    expect(entry).toBeTruthy();
    expect(entry![1].faceIDPermission).toMatch(/[а-яё]/i);
    expect(entry![1].faceIDPermission).toContain("Face ID");
  });

  it("в Info.plist попадает наша строка, а не английская по умолчанию", async () => {
    // Настоящий плагин пакета: он и решает, что окажется в NSFaceIDUsageDescription.
    const mod = require("expo-local-authentication/app.plugin");
    const plugin = mod.default ?? mod;
    const cfg = plugin({ name: "x", slug: "x", ios: { infoPlist: {} } }, entry?.[1]);
    const out = await cfg.mods.ios.infoPlist({ ...cfg, modResults: {}, modRequest: { nextMod: async (c: unknown) => c, platform: "ios" } });
    expect(out.modResults.NSFaceIDUsageDescription).toBe(entry?.[1].faceIDPermission);
    expect(out.modResults.NSFaceIDUsageDescription).not.toMatch(/Allow/);
  });
});

/*
  Английские разрешения, которых приложение не просит.

  npx expo config --type introspect (04.10.2026) показал два хвоста:

  · expo-location сам кладёт в Info.plist NSMotionUsageDescription — «Allow
    Warehouse Pro to detect your current motion activity». Движение приложение
    не читает. Убрать ключ совсем плагин умеет (motionUsagePermission: false),
    но нативный модуль всё равно ссылается на CMMotionActivityManager
    (ios/Requesters/MotionActivityPermissionRequester.swift), а App Store
    Connect отбивает сборку без строки для API из кода (ITMS-90683). Поэтому
    строка остаётся — русская и честная: доступ не запрашивается.

  · expo-image-picker по умолчанию добавляет Android RECORD_AUDIO (видео со
    звуком). Мы снимаем только фото; микрофон в списке разрешений Google Play
    — лишний вопрос к приложению. microphonePermission: false снимает его и
    ставит запрет (tools:node="remove"), чтобы его не вернул другой пакет.

  Проверяются настоящие плагины пакетов — они и решают, что попадёт в сборку.

  Нарочные поломки: убери motionUsagePermission — падает «строка движения»
  (в Info.plist снова «Allow…»); верни "expo-image-picker" строкой — падают
  обе проверки микрофона.
*/
type PluginEntry = [string, Record<string, unknown>];
const pluginEntry = (name: string): PluginEntry | undefined => {
  const raw = JSON.parse(readFileSync(join(root, "app.json"), "utf8")) as { expo: { plugins: Array<string | PluginEntry> } };
  return raw.expo.plugins.find(p => Array.isArray(p) && p[0] === name) as PluginEntry | undefined;
};
const nextMod = { nextMod: async (c: unknown) => c };

describe("строка движения (expo-location)", () => {
  it("в app.json — русская, без английского по умолчанию", () => {
    const entry = pluginEntry("expo-location");
    expect(entry?.[1].motionUsagePermission).toMatch(/[а-яё]/i);
  });

  it("в Info.plist попадает наша строка, а не «Allow … motion activity»", async () => {
    const entry = pluginEntry("expo-location");
    const mod = require("expo-location/app.plugin");
    const plugin = mod.default ?? mod;
    const cfg = plugin({ name: "x", slug: "x", ios: { infoPlist: {} } }, entry?.[1]);
    const out = await cfg.mods.ios.infoPlist({ ...cfg, modResults: {}, modRequest: { ...nextMod, platform: "ios" } });
    expect(out.modResults.NSMotionUsageDescription).toBe(entry?.[1].motionUsagePermission);
    expect(out.modResults.NSMotionUsageDescription).not.toMatch(/Allow|motion activity/);
  });
});

describe("микрофон (expo-image-picker)", () => {
  it("плагин объявлен с microphonePermission: false", () => {
    expect(pluginEntry("expo-image-picker")?.[1].microphonePermission).toBe(false);
  });

  it("RECORD_AUDIO не добавлен и запрещён в манифесте, строки микрофона в Info.plist нет", async () => {
    const entry = pluginEntry("expo-image-picker");
    const mod = require("expo-image-picker/app.plugin");
    const plugin = mod.default ?? mod;
    const cfg = plugin({ name: "x", slug: "x", android: { permissions: [] }, ios: { infoPlist: {} } }, entry?.[1]);
    expect(cfg.android.permissions.join(" ")).not.toContain("RECORD_AUDIO");

    const manifest = await cfg.mods.android.manifest({ ...cfg, modResults: { manifest: { $: {}, "uses-permission": [] } }, modRequest: { ...nextMod, platform: "android" } });
    const uses = manifest.modResults.manifest["uses-permission"] as Array<{ $: Record<string, string> }>;
    const audio = uses.find(u => u.$["android:name"] === "android.permission.RECORD_AUDIO");
    expect(audio?.$["tools:node"]).toBe("remove");

    const plist = await cfg.mods.ios.infoPlist({ ...cfg, modResults: { NSMicrophoneUsageDescription: "Allow x to access your microphone" }, modRequest: { ...nextMod, platform: "ios" } });
    expect(plist.modResults.NSMicrophoneUsageDescription).toBeUndefined();
  });
});
