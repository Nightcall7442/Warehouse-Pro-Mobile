/**
 * Оформление берётся из темы, а не вписывается в экран числом.
 *
 * ── Что было ────────────────────────────────────────────────────────────────
 *
 * Палитру приложения сменили целиком — в theme.ts. На экране не изменилось
 * ничего, и это выглядело как «правка не доехала». Доехала: просто два самых
 * первых экрана — вход и главная — тему не читали вовсе.
 *
 * В них было вписано числами больше сотни цветов старого языка: сине-серый
 * акцент #5b6d8a, бежевый холст #e8e6e1, тёплый серый текст #8a8478. Экран
 * входа вдобавок жил в собственной фиолетовой палитре (#4f46e5), которой нет
 * больше нигде: человек открывал приложение, видел одно оформление, входил и
 * попадал в другое.
 *
 * ── Про шрифт ───────────────────────────────────────────────────────────────
 *
 * Отдельная беда, и заметить её было нельзя. На тех же двух экранах 57 раз
 * стояло `fontFamily: "DM Sans"`. Семейства с таким именем в приложении нет:
 * expo-google-fonts регистрирует каждое начертание отдельным именем —
 * DMSans_400Regular, DMSans_700Bold. Несуществующее имя react-native молча
 * заменяет системным шрифтом, поэтому DM Sans на главном экране не
 * показывался НИ РАЗУ, а fontWeight поверх системного давал синтетическую
 * жирность.
 *
 * Молча — ключевое слово. Ни ошибки, ни предупреждения: экран просто набран не
 * тем шрифтом, и понять это можно, только зная, как называются начертания.
 */
import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";
import { Typography } from "../theme";

const ROOT = join(__dirname, "../..");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (/^(node_modules|__tests__|\.git|\.expo|android|ios|dist)$/.test(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

const FILES = [...walk(join(ROOT, "src")), ...walk(join(ROOT, "app"))].map(f => ({
  rel:  relative(ROOT, f).split("\\").join("/"),
  text: strip(readFileSync(f, "utf8")),
}));

/** Имена, которые приложение действительно загружает (см. app/_layout.tsx). */
const LOADED = new Set(Object.entries(Typography)
  .filter(([k, v]) => k.startsWith("font") && typeof v === "string")
  .map(([, v]) => v as string));

describe("оформление берётся из темы", () => {
  it("шрифт называется так, как он загружен", () => {
    const offenders: string[] = [];
    for (const f of FILES) {
      for (const m of f.text.matchAll(/fontFamily:\s*"([^"]+)"/g)) {
        if (!LOADED.has(m[1])) offenders.push(`${f.rel}: fontFamily: "${m[1]}"`);
      }
    }
    /*
      Проверка на несуществующее имя, а не на «пиши через Typography»: цель —
      чтобы шрифт был виден, а не чтобы код выглядел единообразно. Имя, которого
      нет среди загруженных, react-native подменит системным и не скажет ни
      слова.
    */
    expect(offenders).toEqual([]);
  });

  it("экраны не носят в себе старую палитру", () => {
    // Значения языка v6 — по ним видно, что место не перекрасилось вместе с темой.
    const OLD = ["#e8e6e1", "#efedea", "#f2f0ec", "#d8d5cd", "#5b6d8a", "#4a5c78",
      "#2b2a28", "#5e5b54", "#757168", "#8a8478", "#0099cc", "#a0988c",
      "#ede9e3", "#2d3748", "#8b9bb4", "#5a6a7f", "#221f1c", "#4f46e5", "#111827"];

    /*
      Три исключения, и каждое — осознанное.

      order-status.ts: палитра состояний заказа нарочно не следует за темой —
      зелёный «доставлен» обязан быть зелёным в обеих. YandexMapView: цвета
      меток на чужой карте, тема к ней отношения не имеет. contrast.ts и
      brand-palette.ts: сами константы, по которым считается читаемость —
      фон карточки каждой темы нужен числом, от него идёт контраст.
    */
    const ALLOWED = /^(src\/lib\/order-status\.ts|src\/components\/YandexMapView\.tsx|src\/lib\/contrast\.ts|src\/lib\/brand-palette\.ts|src\/theme\.ts)$/;

    const offenders = FILES
      .filter(f => !ALLOWED.test(f.rel))
      .flatMap(f => OLD.filter(c => f.text.toLowerCase().includes(c)).map(c => `${f.rel}: ${c}`));

    expect(offenders).toEqual([]);
  });

  it("тени задаются набором, а не по одной", () => {
    /*
      Мягкий неоморфизм держится на ПАРЕ теней: светлая сверху-слева, серая
      снизу-справа. Одна тень даёт не объём, а подложку — именно так экран и
      выглядел, пока react-native не умел большего.

      Здесь проверяется, что набор soft() вообще отдаёт две тени и что среди них
      есть вдавленный вариант: без inset нечем показать нажатие и жёлоб.
    */
    const { soft } = require("../theme") as typeof import("../theme");
    for (const isDark of [false, true]) {
      const set = soft(isDark);
      expect(set.raised.boxShadow).toHaveLength(2);
      expect(set.raisedSm.boxShadow).toHaveLength(2);
      expect(set.raisedLg.boxShadow).toHaveLength(2);
      expect(set.inset.boxShadow.every(sh => sh.inset)).toBe(true);
      // Светлая грань идёт вверх-влево, тёмная вниз-вправо — иначе свет падает
      // с двух сторон сразу и объём читается наоборот.
      const [dark, light] = set.raised.boxShadow;
      expect(dark.offsetX).toBeGreaterThan(0);
      expect(light.offsetX).toBeLessThan(0);
    }
  });
});
